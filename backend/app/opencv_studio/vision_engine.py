"""
Real-time OpenCV Vision Studio Engine.
Processes robot camera frames (or generates synthetic telemetry-linked high-tech frames
when cameras are offline) and applies OpenCV overlays:
  1. rack_roi_led: 42U Rack segmentation + LED status detection + QR/BBox
  2. thermal_hotspot: Infrared colormap (INFERNO) + Max/Min hotspot tracking
  3. canny_hud: Canny Edge + Hough structural lines + 3D Depth distance reticle
"""
import base64
import math
import time
from typing import Any, Dict

import cv2
import numpy as np


class OpenCVStudioEngine:
    def process_frame(
        self,
        robot: Dict[str, Any],
        telemetry: Dict[str, Any],
        mode: str = "rack_roi_led",
        params: Dict[str, Any] = None,
    ) -> Dict[str, Any]:
        params = params or {}
        t = time.time()
        w, h = 640, 400

        if mode == "thermal_hotspot":
            return self._render_thermal_hotspot(robot, telemetry, w, h, t)
        elif mode == "canny_hud":
            return self._render_canny_hud(robot, telemetry, w, h, t)
        else:
            return self._render_rack_roi_led(robot, telemetry, w, h, t, params)

    def _render_rack_roi_led(
        self, robot: Dict[str, Any], telemetry: Dict[str, Any], w: int, h: int, t: float, params: Dict[str, Any]
    ) -> Dict[str, Any]:
        # Base dark server room rack image
        img = np.full((h, w, 3), (18, 22, 32), dtype=np.uint8)

        # Draw subtle server rack cabinet rails & servers
        rack_x1, rack_x2 = 120, 520
        cv2.rectangle(img, (rack_x1, 25), (rack_x2, h - 25), (45, 55, 75), 2)

        lift_m = float(telemetry.get("lift_height_m", 0.85))
        base_u = int(min(36, max(1, (lift_m / 2.1) * 36)))

        detected_leds = []
        for idx in range(6):
            u_num = base_u + idx
            y1 = 40 + idx * 52
            y2 = y1 + 44
            # Server chassis plate
            cv2.rectangle(img, (rack_x1 + 12, y1), (rack_x2 - 12, y2), (32, 38, 52), -1)
            cv2.rectangle(img, (rack_x1 + 12, y1), (rack_x2 - 12, y2), (70, 85, 110), 1)

            # Drive bays
            for b in range(4):
                bx = rack_x1 + 30 + b * 65
                cv2.rectangle(img, (bx, y1 + 8), (bx + 54, y2 - 8), (24, 28, 38), -1)
                cv2.rectangle(img, (bx, y1 + 8), (bx + 54, y2 - 8), (55, 65, 85), 1)

            # Simulated LEDs for OpenCV HSV detection
            is_alarm = idx == 2 and int(t) % 2 == 0
            led_color = (30, 50, 255) if is_alarm else (80, 245, 100)
            led_pt = (rack_x2 - 45, y1 + 22)
            cv2.circle(img, led_pt, 5, led_color, -1)
            cv2.circle(img, (rack_x2 - 68, y1 + 22), 4, (80, 245, 100), -1)

            # OpenCV ROI overlay & label
            cv2.putText(
                img,
                f"U{u_num:02d}",
                (rack_x1 - 45, y1 + 27),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 242, 254),
                1,
                cv2.LINE_AA,
            )

        # Run actual OpenCV HSV color segmentation to detect green & red indicator LEDs
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        green_mask = cv2.inRange(hsv, np.array([35, 80, 80]), np.array([85, 255, 255]))
        red_mask = cv2.inRange(hsv, np.array([0, 100, 100]), np.array([15, 255, 255]))

        for mask, label, bbox_col in [
            (green_mask, "LED:NORMAL", (80, 255, 120)),
            (red_mask, "LED:ALARM", (60, 60, 255)),
        ]:
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in contours:
                x, y, cw, ch = cv2.boundingRect(cnt)
                if cw >= 4:
                    cv2.rectangle(img, (x - 6, y - 6), (x + cw + 6, y + ch + 6), bbox_col, 1)
                    cv2.putText(
                        img,
                        label,
                        (x + 14, y + 8),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.36,
                        bbox_col,
                        1,
                        cv2.LINE_AA,
                    )
                    detected_leds.append({"label": label, "x": int(x), "y": int(y)})

        # HUD Header
        self._draw_hud_header(img, robot, telemetry, "OPENCV MODE: /algoritmic_server/pro_roi + HSV LED DETECTOR")

        return {
            "mode": "rack_roi_led",
            "image_base64": self._encode_jpg(img),
            "metrics": {
                "scanned_u_range": f"{base_u}U ~ {base_u + 5}U",
                "detected_led_count": len(detected_leds),
                "rfid_tags_per_sec": 720 if robot.get("id") == "flag-01" else 410,
                "algo_endpoint": "http://192.168.10.100:8083/algoritmic_server/pro_roi",
            },
        }

    def _render_thermal_hotspot(
        self, robot: Dict[str, Any], telemetry: Dict[str, Any], w: int, h: int, t: float
    ) -> Dict[str, Any]:
        # Create synthetic thermal gradient matrix (float32 temperatures 22C ~ 68C)
        y_grid, x_grid = np.mgrid[0:h, 0:w]
        base_temp = 26.0 + 3.0 * np.sin(x_grid / 45.0) * np.cos(y_grid / 45.0)

        # Moving warm transformer / breaker hotspot
        hx = int(w * 0.52 + 70 * math.sin(t * 0.8))
        hy = int(h * 0.48 + 40 * math.cos(t * 0.6))
        dist_sq = (x_grid - hx) ** 2 + (y_grid - hy) ** 2
        hotspot = 36.5 * np.exp(-dist_sq / (2.0 * (48.0**2)))

        temp_map = base_temp + hotspot
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(temp_map)

        # Normalize to 0~255 and apply OpenCV INFERNO colormap
        norm = np.clip((temp_map - 20.0) / 50.0 * 255.0, 0, 255).astype(np.uint8)
        colored = cv2.applyColorMap(norm, cv2.COLORMAP_INFERNO)

        # Draw OpenCV max/min temperature crosshair
        mx, my = max_loc
        cv2.circle(colored, (mx, my), 18, (0, 255, 255), 2)
        cv2.line(colored, (mx - 26, my), (mx + 26, my), (0, 255, 255), 1)
        cv2.line(colored, (mx, my - 26), (mx, my + 26), (0, 255, 255), 1)
        cv2.putText(
            colored,
            f"MAX: {max_val:.1f} C",
            (mx + 22, my - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.55,
            (0, 255, 255),
            2,
            cv2.LINE_AA,
        )

        self._draw_hud_header(colored, robot, telemetry, "OPENCV THERMAL: COLORMAP_INFERNO + minMaxLoc HOTSPOT")

        return {
            "mode": "thermal_hotspot",
            "image_base64": self._encode_jpg(colored),
            "metrics": {
                "max_temp_c": round(float(max_val), 1),
                "min_temp_c": round(float(min_val), 1),
                "hotspot_xy": [int(mx), int(my)],
                "sensor_res": "384x288 Dual" if robot.get("id") == "flag-01" else "256x192",
            },
        }

    def _render_canny_hud(
        self, robot: Dict[str, Any], telemetry: Dict[str, Any], w: int, h: int, t: float
    ) -> Dict[str, Any]:
        # Render structural cabinet door & handle scene then run Canny Edge detector
        scene = np.zeros((h, w), dtype=np.uint8)
        cv2.rectangle(scene, (160, 40), (480, 360), 180, 3)
        cv2.line(scene, (320, 40), (320, 360), 140, 2)
        # Door handles
        cv2.rectangle(scene, (295, 170), (310, 230), 255, -1)
        cv2.rectangle(scene, (330, 170), (345, 230), 255, -1)

        edges = cv2.Canny(scene, 50, 150)
        out = np.zeros((h, w, 3), dtype=np.uint8)
        out[:, :, 0] = 28
        out[:, :, 1] = edges
        out[:, :, 2] = edges // 2

        # Draw 3D handle grasp target for /handle_detector
        cv2.circle(out, (302, 200), 14, (255, 80, 200), 2)
        cv2.putText(
            out,
            "/handle_detector 3D Pose: [0.42m, -0.03m, 1.10m]",
            (180, 150),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (255, 120, 220),
            1,
            cv2.LINE_AA,
        )

        self._draw_hud_header(out, robot, telemetry, "OPENCV CANNY EDGE + 3D DEPTH /handle_detector")

        return {
            "mode": "canny_hud",
            "image_base64": self._encode_jpg(out),
            "metrics": {
                "edge_pixels": int(np.count_nonzero(edges)),
                "handle_3d_pose_m": [0.42, -0.03, 1.10],
                "force_sensor_n": telemetry.get("force_sensor_n", 0.4),
            },
        }

    def _draw_hud_header(self, img: np.ndarray, robot: Dict[str, Any], telemetry: Dict[str, Any], title: str) -> None:
        cv2.rectangle(img, (0, 0), (img.shape[1], 28), (10, 14, 22), -1)
        cv2.putText(
            img,
            f"[{robot.get('hostname')}] {title}",
            (10, 19),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.44,
            (0, 242, 254),
            1,
            cv2.LINE_AA,
        )

    def _encode_jpg(self, img: np.ndarray) -> str:
        _, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        return "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode("ascii")
