"""
Object-Oriented Domain Model for Autonomous Multi-Robot Fleet.
Unifies:
  - BaseRobot abstract class with polymorphism
  - SE(2) Map Frame Coordinate Registration
  - Real-environment Redis/WebSocket telemetry parsing
  - Most frequent canonical patrol trajectory generation per robot model
"""
from abc import ABC, abstractmethod
import math
import time
from typing import Any, Dict, List, Optional, Tuple


class BaseRobot(ABC):
    """
    Abstract Base Class for all autonomous inspection robots.
    Encapsulates state, kinematics, map alignment transformation, and patrol path generation.
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
        self.live_path_move_info: List[Dict[str, float]] = []

    @abstractmethod
    def _default_english_name(self) -> str:
        """Returns standard English model name."""
        pass

    @abstractmethod
    def get_canonical_patrol_path_local(self) -> List[Dict[str, float]]:
        """
        Returns the robot's most frequently executed patrol route in its local map coordinate frame.
        """
        pass

    def get_most_frequent_path_world(self) -> List[List[float]]:
        """
        Transforms the robot's most frequent patrol route into the Unified 3D World frame [x, y].
        """
        local_pts = self.get_canonical_patrol_path_local()
        world_pts: List[List[float]] = []
        for pt in local_pts:
            wp = self.map_engine.local_to_world(self.id, pt["x"], pt["y"], pt.get("yaw", 0.0))
            world_pts.append([wp["world_x"], wp["world_y"]])
        return world_pts

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

        if isinstance(path_move, list):
            self.live_path_move_info = path_move

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
    Reference Coordinate Frame: Master Map Frame (dx=0, dy=0, dtheta=0).
    """

    def _default_english_name(self) -> str:
        return "Flagship"

    def get_canonical_patrol_path_local(self) -> List[Dict[str, float]]:
        # The primary datacenter RFID & rack inspection loop executed by Flagship
        return [
            {"x": -0.05, "y": -0.05, "yaw": 0.0},     # 충전스테이션 (#68)
            {"x": 0.65, "y": -0.01, "yaw": 0.0},      # 충전대기포인트 (#69)
            {"x": 1.08, "y": -0.01, "yaw": -0.01},    # 복귀포인트 (#70)
            {"x": 1.50, "y": -0.15, "yaw": 3.14},     # 복귀전 (#94)
            {"x": 3.50, "y": 0.00, "yaw": -1.57},     # JM_Path_01 (#78)
            {"x": 4.00, "y": -0.35, "yaw": 3.14},     # JM_Path_07_RT02 (#84)
            {"x": 4.00, "y": -2.45, "yaw": -1.57},    # JM_Path_06_RT01 (#83)
            {"x": 3.50, "y": -2.45, "yaw": -3.14},    # JM_Path_02 (#79)
            {"x": 2.20, "y": -2.40, "yaw": 3.14},     # JM_Path_05-1_RFID_RACK3 (#89)
            {"x": 1.60, "y": -2.40, "yaw": 3.14},     # JM_Path_04-1_Front_RFID_RACK2 (#90)
            {"x": 0.80, "y": -2.70, "yaw": 1.57},     # JM_Path_05-2_Front (#93)
            {"x": -0.05, "y": -0.05, "yaw": 0.0},     # 충전점 복귀
        ]


class PowerRobot(BaseRobot):
    """
    Power Edition (IIR-03 / MR-P-2307)
    High & Low Voltage Switchgear TEV/AE Partial Discharge and Gauge Reading Robot.
    Coordinate Frame: Calibrated via SE(2) Matrix (dx=1.65m, dy=-5.875m, dtheta=+90.25deg).
    """

    def _default_english_name(self) -> str:
        return "Power"

    def get_canonical_patrol_path_local(self) -> List[Dict[str, float]]:
        # The primary switchgear inspection loop executed by Power in its local coordinate system
        return [
            {"x": -0.30, "y": -0.18, "yaw": 0.0},     # 충전포인트 (#70)
            {"x": 0.80, "y": -0.18, "yaw": 0.0},      # 충전 복귀 포인트 (#71)
            {"x": 1.99, "y": -0.18, "yaw": -1.55},    # 배전반 진입점
            {"x": 2.88, "y": -1.72, "yaw": 1.53},     # 고압반 TEV/AE 부분방전 진단점
            {"x": 2.87, "y": 0.40, "yaw": 1.52},      # check-rack2-eqp 계측기 판독점 1
            {"x": 2.81, "y": 0.36, "yaw": 1.54},      # check-rack2-eqp 계측기 판독점 2
            {"x": 0.80, "y": -0.18, "yaw": 0.0},      # 복귀 경로
            {"x": -0.30, "y": -0.18, "yaw": 0.0},     # 충전포인트 (#70)
        ]


class ProfessionalRobot(BaseRobot):
    """
    Professional Edition (IIR-02 / MR-I-P2308)
    Robotic Arm 6+2 DOF Physical Operation & Maintenance Robot.
    """

    def _default_english_name(self) -> str:
        return "Professional"

    def get_canonical_patrol_path_local(self) -> List[Dict[str, float]]:
        # Physical manipulation corridor between server aisles
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
