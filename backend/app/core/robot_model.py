"""
Object-Oriented Domain Model for Autonomous Multi-Robot Fleet.
Unifies:
  - BaseRobot abstract class with polymorphism
  - 100% Sanctioned REST API Integration (/api/v1/auth/login, /api/v1/position/list, /api/v1/base/robot/info)
  - SE(2) Map Frame Coordinate Registration
  - Real-environment Redis/WebSocket telemetry parsing
  - Most frequent canonical patrol trajectory generation per robot model
"""
from abc import ABC, abstractmethod
import hashlib
import json
import math
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx


def hash_password_3088(raw_password: str, rounds: int = 3088) -> str:
    """Replicates MOSS SHA-512 3088 rounds password hashing for /api/v1/auth/login."""
    data = raw_password.encode("utf-8")
    for _ in range(rounds):
        data = hashlib.sha512(data).digest()
    return data.hex()


class BaseRobot(ABC):
    """
    Abstract Base Class for all autonomous inspection robots.
    Encapsulates state, kinematics, REST API synchronization, map alignment transformation,
    and patrol path generation.
    """

    def __init__(self, record: Dict[str, Any], map_engine: Any) -> None:
        self.record = record
        self.map_engine = map_engine

        self.id: str = record.get("id", "")
        self.hostname: str = record.get("hostname", "")
        self.display_name: str = record.get("display_name", "")
        self.english_name: str = record.get("english_name", self._default_english_name())
        self.edition_badge: str = record.get("edition_badge", "")
        self.model_type: str = record.get("model_type", "")
        self.color: str = record.get("color", "#3b82f6")
        self.ip: str = record.get("ip", "")
        self.sftp_cfg: Dict[str, Any] = record.get("sftp", {})
        self.ports: Dict[str, int] = record.get("ports", {})
        self.kinematics: Dict[str, Any] = record.get("kinematics", {})
        self.proposal_specs: Dict[str, Any] = record.get("proposal_specs", {})

        # Live telemetry state
        self.local_x: float = 0.0
        self.local_y: float = 0.0
        self.local_yaw_deg: float = 0.0
        self.position_name: str = "대기"
        self.battery_pct: int = 100
        self.voltage_v: float = 28.0
        self.charging: bool = True
        self.fsm_state: str = "STANDBY"
        self.task_status: int = 0
        self.move_mode: str = "STANDBY"
        self.lift_height_m: float = 0.0
        self.ptz_pan_deg: float = 0.0
        self.ptz_tilt_deg: float = 0.0
        self.ptz_zoom: float = 1.0
        self.arm_pose: str = "HOME"
        self.is_stop: bool = False
        self.temp_c: float = 30.0
        self.online_mode: str = "OFFLINE_STANDBY"
        self.last_sync_time: str = "-"
        
        # REST API cached tokens & authoritative positions
        self.api_token: Optional[str] = None
        self.api_positions: Dict[int, Dict[str, Any]] = {}

    @abstractmethod
    def _default_english_name(self) -> str:
        """Returns standard English model name."""
        pass

    @abstractmethod
    def get_canonical_patrol_sequence_ids(self) -> List[int]:
        """Returns sequence of position IDs from /api/v1/position/list that form the primary patrol route."""
        pass

    def get_canonical_patrol_path_local(self) -> List[Dict[str, float]]:
        """
        Builds the local patrol route coordinates directly from the /api/v1/position/list REST API data.
        Falls back to default calibrated points if API response is not yet populated.
        """
        seq = self.get_canonical_patrol_sequence_ids()
        pts: List[Dict[str, float]] = []

        for pid in seq:
            if pid in self.api_positions:
                pos_info = self.api_positions[pid]
                c = pos_info.get("position", {})
                pts.append({"x": float(c.get("x", 0.0)), "y": float(c.get("y", 0.0)), "yaw": float(c.get("yaw", 0.0))})

        if not pts:
            pts = self._fallback_local_path()

        return pts

    @abstractmethod
    def _fallback_local_path(self) -> List[Dict[str, float]]:
        """Fallback coordinates before REST API connects."""
        pass

    def get_most_frequent_path_world(self) -> List[List[float]]:
        """
        Transforms the robot's authoritative REST API patrol route into Unified 3D World frame [x, y].
        """
        local_pts = self.get_canonical_patrol_path_local()
        world_pts: List[List[float]] = []
        for pt in local_pts:
            wp = self.map_engine.local_to_world(self.id, pt["x"], pt["y"], pt.get("yaw", 0.0))
            world_pts.append([wp["world_x"], wp["world_y"]])
        return world_pts

    def sync_from_rest_api(self, password_plain: str = "QAZWSXmoon890@") -> bool:
        """
        Authoritative REST API client:
        1. Authenticates via POST /api/v1/auth/login with SHA-512 3088 rounds
        2. Retrieves official waypoints from GET /api/v1/position/list with Bearer token
        3. Retrieves robot hardware & firmware info from GET /api/v1/base/robot/info
        """
        if not self.ip:
            return False

        try:
            pw_hash = hash_password_3088(password_plain)
            url_login = f"http://{self.ip}/api/v1/auth/login"
            with httpx.Client(timeout=3.5) as client:
                resp = client.post(url_login, json={"account": "super", "password": pw_hash})
                if resp.status_code != 200:
                    return False
                res_data = resp.json()
                token = res_data.get("data", {}).get("Token") or res_data.get("data", {}).get("token")
                if not token:
                    return False
                self.api_token = token
                headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

                # Query /api/v1/position/list
                r_pos = client.get(f"http://{self.ip}/api/v1/position/list", headers=headers)
                if r_pos.status_code == 200:
                    pos_json = r_pos.json()
                    if pos_json.get("code") == 0 and isinstance(pos_json.get("data"), list):
                        self.api_positions = {
                            p["robotPositionId"]: p for p in pos_json["data"] if "robotPositionId" in p
                        }

                # Query /api/v1/base/robot/info
                r_info = client.get(f"http://{self.ip}/api/v1/base/robot/info", headers=headers)
                if r_info.status_code == 200:
                    info_json = r_info.json()
                    if info_json.get("code") == 0 and isinstance(info_json.get("data"), dict):
                        bot_data = info_json["data"]
                        if bot_data.get("name"):
                            self.display_name = bot_data["name"]
                return True
        except Exception:
            return False

    def update_telemetry_from_redis(
        self,
        pos_data: Dict[str, Any],
        chas_data: Dict[str, Any],
        up_data: Dict[str, Any],
        task_data: Dict[str, Any],
        path_move: Any,
    ) -> None:
        """Parses and updates real telemetry data received from robot Redis."""
        pos = pos_data.get("position", {})
        disp = pos_data.get("dispatch_position", {})
        if "x" in pos and "y" in pos:
            self.local_x = round(float(pos["x"]), 4)
            self.local_y = round(float(pos["y"]), 4)
            yaw_rad = float(pos.get("yaw", 0.0))
            self.local_yaw_deg = round(math.degrees(yaw_rad), 1)
        if disp.get("position_name"):
            self.position_name = f"{disp['position_name']} (#{disp.get('position_id', '-')})"

        bat = chas_data.get("battery") or {}
        if "percentage" in bat and bat["percentage"] is not None:
            self.battery_pct = int(round(float(bat["percentage"])))
        if "voltage" in bat and bat["voltage"] is not None:
            self.voltage_v = round(float(bat["voltage"]), 2)
        if "charge" in bat:
            self.charging = bool(bat["charge"])
        if "temperature" in bat and bat["temperature"] is not None:
            self.temp_c = round(float(bat["temperature"]), 1)

        self.is_stop = bool(chas_data.get("is_stop", 0))
        if up_data.get("lifter_height") is not None:
            lh_raw = float(up_data["lifter_height"])
            self.lift_height_m = round(lh_raw / 1000.0 if lh_raw > 5.0 else lh_raw, 3)

        self.task_status = task_data.get("status", 0)
        t_type = task_data.get("task_type", 3)
        if self.charging:
            self.fsm_state = f"LIVE CHARGING @ {self.position_name}"
        else:
            self.fsm_state = f"LIVE PATROL (type={t_type}, status={self.task_status})"

        self.online_mode = "LIVE_WEBSOCKET_REDIS"
        self.last_sync_time = time.strftime("%H:%M:%S")

    def set_offline(self) -> None:
        self.online_mode = "OFFLINE_STANDBY"

    def to_dict(self) -> Dict[str, Any]:
        """Serializes domain model for API and WebSocket consumption."""
        world_pose = self.map_engine.local_to_world(
            self.id, self.local_x, self.local_y, self.local_yaw_deg
        )
        align_cfg = self.map_engine.load_alignment_config()
        tf_info = align_cfg.get("transforms", {}).get(self.id, {})

        return {
            **self.record,
            "english_name": self.english_name,
            "calibration": tf_info,
            "patrol_path_world": self.get_most_frequent_path_world(),
            "telemetry": {
                "local_x": self.local_x,
                "local_y": self.local_y,
                "local_yaw_deg": self.local_yaw_deg,
                "world_x": world_pose["world_x"],
                "world_y": world_pose["world_y"],
                "world_yaw_deg": world_pose["world_yaw_deg"],
                "target_world_x": world_pose["world_x"],
                "target_world_y": world_pose["world_y"],
                "position_name": self.position_name,
                "battery_pct": self.battery_pct,
                "voltage_v": self.voltage_v,
                "charging": self.charging,
                "fsm_state": self.fsm_state,
                "task_status": self.task_status,
                "move_mode": self.move_mode,
                "lift_height_m": self.lift_height_m,
                "ptz_pan_deg": self.ptz_pan_deg,
                "ptz_tilt_deg": self.ptz_tilt_deg,
                "ptz_zoom": self.ptz_zoom,
                "arm_pose": self.arm_pose,
                "is_stop": self.is_stop,
                "temp_c": self.temp_c,
                "online_mode": self.online_mode,
                "last_sync_time": self.last_sync_time,
            },
        }


class FlagshipRobot(BaseRobot):
    """
    Flagship Edition (IIR-01 / MR-I-Ult2408)
    IDC Server Rack & High-speed RFID continuous inspection robot.
    """

    def _default_english_name(self) -> str:
        return "Flagship"

    def get_canonical_patrol_sequence_ids(self) -> List[int]:
        # Sequence of position IDs from /api/v1/position/list representing the primary RFID loop
        return [68, 69, 70, 94, 78, 84, 83, 79, 89, 90, 93, 68]

    def _fallback_local_path(self) -> List[Dict[str, float]]:
        return [
            {"x": -0.05, "y": -0.05, "yaw": 0.0},
            {"x": 0.65, "y": -0.01, "yaw": 0.0},
            {"x": 1.08, "y": -0.01, "yaw": -0.01},
            {"x": 1.50, "y": -0.15, "yaw": 3.14},
            {"x": 3.50, "y": 0.00, "yaw": -1.57},
            {"x": 4.00, "y": -0.35, "yaw": 3.14},
            {"x": 4.00, "y": -2.45, "yaw": -1.57},
            {"x": 3.50, "y": -2.45, "yaw": -3.14},
            {"x": 2.20, "y": -2.40, "yaw": 3.14},
            {"x": 1.60, "y": -2.40, "yaw": 3.14},
            {"x": 0.80, "y": -2.70, "yaw": 1.57},
            {"x": -0.05, "y": -0.05, "yaw": 0.0},
        ]


class PowerRobot(BaseRobot):
    """
    Power Edition (IIR-03 / MR-P-2307)
    High & Low Voltage Switchgear TEV/AE Partial Discharge and Gauge Reading Robot.
    """

    def _default_english_name(self) -> str:
        return "Power"

    def get_canonical_patrol_sequence_ids(self) -> List[int]:
        # Sequence of position IDs from /api/v1/position/list representing the primary switchgear loop
        return [70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 70]

    def _fallback_local_path(self) -> List[Dict[str, float]]:
        return [
            {"x": -0.30, "y": -0.18, "yaw": 0.0},
            {"x": 0.80, "y": -0.18, "yaw": 0.0},
            {"x": 1.25, "y": -0.18, "yaw": 0.0},
            {"x": 1.99, "y": -0.18, "yaw": -1.55},
            {"x": 1.99, "y": -2.37, "yaw": 0.0},
            {"x": 5.18, "y": -2.37, "yaw": 1.51},
            {"x": 5.18, "y": -1.72, "yaw": -3.14},
            {"x": 3.96, "y": -1.72, "yaw": 3.14},
            {"x": 2.88, "y": -1.72, "yaw": 1.53},
            {"x": 2.81, "y": 0.36, "yaw": 1.54},
            {"x": 2.42, "y": -0.18, "yaw": -3.13},
            {"x": -0.30, "y": -0.18, "yaw": 0.0},
        ]


class ProfessionalRobot(BaseRobot):
    """
    Professional Edition (IIR-02 / MR-I-P2308)
    Robotic Arm 6+2 DOF Physical Operation & Maintenance Robot.
    """

    def _default_english_name(self) -> str:
        return "Professional"

    def get_canonical_patrol_sequence_ids(self) -> List[int]:
        return []

    def _fallback_local_path(self) -> List[Dict[str, float]]:
        return [
            {"x": 0.00, "y": -0.80, "yaw": 0.0},
            {"x": 1.20, "y": -0.80, "yaw": 0.0},
            {"x": 2.50, "y": -1.20, "yaw": -1.57},
            {"x": 2.50, "y": -2.20, "yaw": -1.57},
            {"x": 1.20, "y": -2.20, "yaw": 3.14},
            {"x": 0.00, "y": -0.80, "yaw": 0.0},
        ]


class RobotFactory:
    """Factory to instantiate the appropriate Robot subclass."""

    @staticmethod
    def create_robot(record: Dict[str, Any], map_engine: Any) -> BaseRobot:
        r_id = record.get("id", "").lower()
        m_type = record.get("model_type", "").lower()

        if "power" in r_id or "power" in m_type:
            return PowerRobot(record, map_engine)
        elif "pro" in r_id or "profession" in m_type:
            return ProfessionalRobot(record, map_engine)
        else:
            return FlagshipRobot(record, map_engine)
