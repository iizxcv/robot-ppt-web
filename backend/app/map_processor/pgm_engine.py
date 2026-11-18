"""
PGM Map Parser & Multi-Robot SE(2) Map Merger & Coordinate Aligner.
1. Reads each robot's own `map.pgm` + `map.yaml` (e.g., Flagship 167x164, Power 199x425).
2. Transforms every robot's occupied wall pixels into the unified World Coordinate Frame
   using the robot's SE(2) calibration matrix (dtheta_deg, dx_m, dy_m) in `map_alignment.json`.
3. Produces a fused 2D verification overlay PNG (Cyan = Flagship map.pgm, Orange = Power map.pgm,
   Green = Overlapped wall match) AND fused 3D wall voxel blocks for Three.js!
4. Transforms each robot's live pose (local_x, local_y, local_yaw) by the EXACT same SE(2) matrix.
"""
import base64
import json
import math
from pathlib import Path
from typing import Any, Dict, List

import cv2
import numpy as np
import yaml

from app.core.robot_registry import get_master_dir


class MapAlignmentEngine:
    def __init__(self) -> None:
        self.master_dir = get_master_dir()
        self.align_path = self.master_dir / "config" / "map_alignment.json"
        self.maps_dir = self.master_dir / "data" / "maps"

    def load_alignment_config(self) -> Dict[str, Any]:
        if not self.align_path.exists():
            return {"master_robot_id": "flag-01", "wall_extrusion_height_m": 1.85, "transforms": {}}
        with open(self.align_path, "r", encoding="utf-8") as f:
            return json.load(f)

    def save_alignment_config(self, new_config: Dict[str, Any]) -> Dict[str, Any]:
        with open(self.align_path, "w", encoding="utf-8") as f:
            json.dump(new_config, f, ensure_ascii=False, indent=2)
        return new_config

    def local_to_world(self, robot_id: str, local_x: float, local_y: float, local_yaw_deg: float = 0.0) -> Dict[str, float]:
        """
        Applies the exact SE(2) Rigid Transform derived from aligning the robot's map.pgm + map.yaml
        into the unified Master World Frame:
          [X_world]   [cos(dtheta) -sin(dtheta)] [local_x]   [dx_m]
          [Y_world] = [sin(dtheta)  cos(dtheta)] [local_y] + [dy_m]
        """
        cfg = self.load_alignment_config()
        tf = cfg.get("transforms", {}).get(robot_id, {"dx_m": 0.0, "dy_m": 0.0, "dtheta_deg": 0.0, "scale": 1.0})
        dx = float(tf.get("dx_m", 0.0))
        dy = float(tf.get("dy_m", 0.0))
        dtheta_rad = math.radians(float(tf.get("dtheta_deg", 0.0)))
        scale = float(tf.get("scale", 1.0))

        cos_t = math.cos(dtheta_rad)
        sin_t = math.sin(dtheta_rad)

        wx = scale * (cos_t * local_x - sin_t * local_y) + dx
        wy = scale * (sin_t * local_x + cos_t * local_y) + dy
        wyaw = (local_yaw_deg + float(tf.get("dtheta_deg", 0.0))) % 360.0

        return {"world_x": round(wx, 4), "world_y": round(wy, 4), "world_yaw_deg": round(wyaw, 2)}

    def world_to_local(self, robot_id: str, world_x: float, world_y: float, world_yaw_deg: float = 0.0) -> Dict[str, float]:
        cfg = self.load_alignment_config()
        tf = cfg.get("transforms", {}).get(robot_id, {"dx_m": 0.0, "dy_m": 0.0, "dtheta_deg": 0.0, "scale": 1.0})
        dx = float(tf.get("dx_m", 0.0))
        dy = float(tf.get("dy_m", 0.0))
        dtheta_rad = math.radians(float(tf.get("dtheta_deg", 0.0)))
        scale = float(tf.get("scale", 1.0)) or 1.0

        shifted_x = (world_x - dx) / scale
        shifted_y = (world_y - dy) / scale

        cos_t = math.cos(-dtheta_rad)
        sin_t = math.sin(-dtheta_rad)

        lx = cos_t * shifted_x - sin_t * shifted_y
        ly = sin_t * shifted_x + cos_t * shifted_y
        lyaw = (world_yaw_deg - float(tf.get("dtheta_deg", 0.0))) % 360.0

        return {"local_x": round(lx, 4), "local_y": round(ly, 4), "local_yaw_deg": round(lyaw, 2)}

    def _extract_robot_map_points(self, folder_name: str, min_row: int = 0) -> Dict[str, Any]:
        folder = self.maps_dir / folder_name
        pgm_path = folder / "map.pgm"
        yaml_path = folder / "map.yaml"
        if not pgm_path.exists() or not yaml_path.exists():
            return {"error": f"Map not found: {folder_name}"}

        with open(yaml_path, "r", encoding="utf-8") as f:
            meta = yaml.safe_load(f)

        res = float(meta.get("resolution", 0.05))
        origin = meta.get("origin", [0.0, 0.0, 0.0])
        ox, oy = float(origin[0]), float(origin[1])

        img = cv2.imread(str(pgm_path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"error": f"Failed to read {pgm_path}"}

        h, w = img.shape
        mask = img <= 100
        if min_row > 0 and h > min_row:
            mask[:min_row, :] = False

        ys_px, xs_px = np.where(mask)
        local_xs = ox + (xs_px + 0.5) * res
        local_ys = oy + (h - (ys_px + 0.5)) * res
        pts = np.column_stack([local_xs, local_ys])

        return {
            "folder": folder_name,
            "width_px": w,
            "height_px": h,
            "resolution": res,
            "origin": [ox, oy, 0.0],
            "local_wall_pts": pts,
        }

    def build_unified_fused_map(self) -> Dict[str, Any]:
        """
        Loads both `flagship/map.pgm` and `power/map.pgm`, applies each robot's SE(2) transform
        from `map_alignment.json` to its wall points, and merges them into a single unified 3D voxel grid
        plus a 2D color-coded overlay preview PNG so the user can visually verify the map fusion!
        """
        align_cfg = self.load_alignment_config()
        tfs = align_cfg.get("transforms", {})

        flag_raw = self._extract_robot_map_points("flagship", min_row=0)
        # Exclude single top LiDAR ray noise above row 230 in Power's 425-row map
        power_raw = self._extract_robot_map_points("power", min_row=230)

        f_pts = flag_raw.get("local_wall_pts", np.zeros((0, 2)))
        p_pts_local = power_raw.get("local_wall_pts", np.zeros((0, 2)))

        # Transform Power local map points into the unified World Frame using Power's SE(2) matrix
        p_tf = tfs.get("power-01", {"dx_m": 1.65, "dy_m": -5.875, "dtheta_deg": 90.25, "scale": 1.0})
        rad = math.radians(float(p_tf.get("dtheta_deg", 90.25)))
        c, s = math.cos(rad), math.sin(rad)
        dx = float(p_tf.get("dx_m", 1.65))
        dy = float(p_tf.get("dy_m", -5.875))

        if len(p_pts_local) > 0:
            p_wx = c * p_pts_local[:, 0] - s * p_pts_local[:, 1] + dx
            p_wy = s * p_pts_local[:, 0] + c * p_pts_local[:, 1] + dy
            p_pts_world = np.column_stack([p_wx, p_wy])
        else:
            p_pts_world = np.zeros((0, 2))

        # Quantize into 10cm (0.10m) 3D voxel cells and track source:
        # source 1 = Flagship only, source 2 = Power (calibrated) only, source 3 = Overlapped (Both maps agree!)
        cell_size = 0.10
        voxel_map: Dict[tuple, int] = {}

        for x, y in f_pts:
            key = (round(float(x) / cell_size), round(float(y) / cell_size))
            voxel_map[key] = voxel_map.get(key, 0) | 1

        for x, y in p_pts_world:
            key = (round(float(x) / cell_size), round(float(y) / cell_size))
            voxel_map[key] = voxel_map.get(key, 0) | 2

        flag_blocks: List[List[float]] = []
        power_blocks: List[List[float]] = []
        overlap_blocks: List[List[float]] = []
        all_blocks: List[List[float]] = []

        for (gx, gy), src in voxel_map.items():
            wx = round(gx * cell_size, 3)
            wy = round(gy * cell_size, 3)
            blk = [wx, wy, cell_size]
            all_blocks.append(blk)
            if src == 3:
                overlap_blocks.append(blk)
            elif src == 1:
                flag_blocks.append(blk)
            elif src == 2:
                power_blocks.append(blk)

        # Render 2D Fused Verification PNG
        # Non-matching Cyan/Orange: 80% transparent (alpha=0.20 onto dark bg, 거의 안보이게)
        # Overlapping matching walls: 100% bright prominent green
        grid_res = 0.04
        gx_min, gx_max = -2.2, 5.8
        gy_min, gy_max = -6.8, 1.8
        gw = int((gx_max - gx_min) / grid_res)
        gh = int((gy_max - gy_min) / grid_res)
        canvas = np.full((gh, gw, 3), (12, 14, 20), dtype=np.uint8)

        f_grid = np.zeros((gh, gw), dtype=bool)
        p_grid = np.zeros((gh, gw), dtype=bool)

        for x, y in f_pts:
            ix = int((x - gx_min) / grid_res)
            iy = int((y - gy_min) / grid_res)
            if 0 <= ix < gw and 0 <= iy < gh:
                f_grid[iy, ix] = True

        for x, y in p_pts_world:
            ix = int((x - gx_min) / grid_res)
            iy = int((y - gy_min) / grid_res)
            if 0 <= ix < gw and 0 <= iy < gh:
                p_grid[iy, ix] = True

        overlap_mask = f_grid & p_grid
        f_only_mask = f_grid & ~overlap_mask
        p_only_mask = p_grid & ~overlap_mask

        # 80% transparent (faint residual trace)
        canvas[f_only_mask] = (60, 60, 16)       # Faint 80% transparent Cyan
        canvas[p_only_mask] = (12, 43, 65)       # Faint 80% transparent Orange
        canvas[overlap_mask] = (90, 255, 110)    # 100% Bright Green matching wall

        canvas_flipped = cv2.flip(canvas, 0)
        _, png_buf = cv2.imencode(".png", canvas_flipped)
        fused_png_b64 = "data:image/png;base64," + base64.b64encode(png_buf.tobytes()).decode("ascii")

        # Compute calibrated charging station world coordinates
        flag_charger_w = self.local_to_world("flag-01", -0.05, -0.05, 0.0)
        power_charger_w = self.local_to_world("power-01", -0.30, -0.18, 0.0)

        return {
            "folder": "unified_flagship_power",
            "width_px": flag_raw.get("width_px", 167),
            "height_px": flag_raw.get("height_px", 164),
            "resolution": 0.05,
            "origin": flag_raw.get("origin", [-1.39123, -6.50952, 0.0]),
            "power_map_info": {
                "width_px": power_raw.get("width_px", 199),
                "height_px": power_raw.get("height_px", 425),
                "origin": power_raw.get("origin", [-2.51703, -5.52593, 0.0]),
                "applied_se2": p_tf,
            },
            "center_world_m": [1.8, -2.5],
            "fused_preview_png_base64": fused_png_b64,
            "wall_blocks": all_blocks,
            "flag_only_blocks": flag_blocks,
            "power_only_blocks": power_blocks,
            "overlap_blocks": overlap_blocks,
            "wall_count": len(all_blocks),
            "overlap_count": len(overlap_blocks),
            "spatial_pois": [
                {
                    "id": 68,
                    "name": "Flagship 충전스테이션 (#68)",
                    "kind": "charger",
                    "x": flag_charger_w["world_x"],
                    "y": flag_charger_w["world_y"],
                },
                {
                    "id": 70,
                    "name": "Power 충전스테이션 (#70 통합보정)",
                    "kind": "charger",
                    "x": power_charger_w["world_x"],
                    "y": power_charger_w["world_y"],
                },
            ],
            "patrol_corridor": [
                [-0.05, -0.05],
                [0.65, -0.01],
                [3.89, -0.01],
                [3.89, -2.85],
                [1.40, -2.85],
                [1.40, -2.45],
                [3.50, -2.45],
                [3.50, 0.0],
                [-0.05, -0.05],
            ],
        }

    def parse_pgm_map(self, folder_name: str = "flagship") -> Dict[str, Any]:
        return self.build_unified_fused_map()
