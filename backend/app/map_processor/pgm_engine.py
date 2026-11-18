"""
PGM Map Parser & Multi-Robot SE(2) Coordinate Frame Aligner.
Reads map.pgm + map.yaml from docker_master/data/maps/<folder>/
and aligns multiple robots into a single 3D Isometric World space.
"""
import base64
import io
import json
import math
from pathlib import Path
from typing import Any, Dict, List, Tuple

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
        Applies SE(2) Rigid Transform: (x_local, y_local, yaw_local) -> (X_world, Y_world, Yaw_world)
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
        """
        Applies Inverse SE(2) Transform (T^-1): (X_world, Y_world, Yaw_world) -> (x_local, y_local, yaw_local)
        Used when clicking a point in the unified 3D view and dispatching a navigation command to a specific robot.
        """
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

    def parse_pgm_map(self, folder_name: str = "flagship") -> Dict[str, Any]:
        """
        Reads map.pgm and map.yaml and extracts:
          1. Metadata (width, height, resolution, origin)
          2. Base64 PNG texture of the floor map
          3. 3D Extruded Wall/Rack voxel blocks in physical meters (X, Y) for Three.js InstancedMesh rendering
        """
        folder = self.maps_dir / folder_name
        pgm_path = folder / "map.pgm"
        yaml_path = folder / "map.yaml"

        if not pgm_path.exists() or not yaml_path.exists():
            return {"error": f"Map files not found in {folder}"}

        with open(yaml_path, "r", encoding="utf-8") as f:
            meta = yaml.safe_load(f)

        resolution = float(meta.get("resolution", 0.05))
        origin = meta.get("origin", [0.0, 0.0, 0.0])
        origin_x, origin_y = float(origin[0]), float(origin[1])

        img = cv2.imread(str(pgm_path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            return {"error": f"Failed to decode {pgm_path}"}

        height, width = img.shape

        # Create stylized high-tech dark floor texture PNG for 3D plane
        stylized = np.zeros((height, width, 4), dtype=np.uint8)
        # Free space (bright in PGM >= 230) -> subtle dark cyan floor
        free_mask = img >= 220
        stylized[free_mask] = [30, 45, 65, 220]
        # Occupied walls/racks (dark in PGM <= 100) -> glowing neon cyan/blue footprint
        occ_mask = img <= 100
        stylized[occ_mask] = [0, 242, 254, 255]
        # Unknown space -> transparent dark
        unk_mask = (~free_mask) & (~occ_mask)
        stylized[unk_mask] = [10, 15, 24, 90]

        _, png_buf = cv2.imencode(".png", stylized)
        png_b64 = "data:image/png;base64," + base64.b64encode(png_buf.tobytes()).decode("ascii")

        # Downsample / cluster occupied cells into 3D wall blocks (every 2 pixels = 10cm block)
        step = 2
        walls: List[List[float]] = []
        for v in range(0, height, step):
            for u in range(0, width, step):
                patch = img[v : v + step, u : u + step]
                if np.min(patch) <= 95:
                    # Convert pixel (u, v) to ROS world meters
                    wx = origin_x + (u + step * 0.5) * resolution
                    wy = origin_y + (height - (v + step * 0.5)) * resolution
                    walls.append([round(wx, 3), round(wy, 3), round(step * resolution, 3)])

        return {
            "folder": folder_name,
            "width_px": width,
            "height_px": height,
            "resolution": resolution,
            "origin": [origin_x, origin_y, 0.0],
            "physical_width_m": round(width * resolution, 3),
            "physical_height_m": round(height * resolution, 3),
            "center_world_m": [
                round(origin_x + (width * resolution) / 2.0, 3),
                round(origin_y + (height * resolution) / 2.0, 3),
            ],
            "texture_png_base64": png_b64,
            "wall_blocks": walls,
            "wall_count": len(walls),
        }
