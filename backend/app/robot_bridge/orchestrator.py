"""
Multi-Robot Real-Environment Telemetry & WebSocket Monitoring Bridge.
Refactored to Object-Oriented Architecture:
- Uses BaseRobot polymorphic class hierarchy (FlagshipRobot, PowerRobot, ProfessionalRobot)
- Unifies SE(2) map coordinate registration and canonical most-frequent patrol routes
- Synchronizes real robot positions, battery, chassis, and sensors from live Redis
"""
import json
import math
import threading
import time
from typing import Any, Dict, List, Optional

import httpx
import paramiko

from app.core.robot_registry import RobotNameResolver, hash_password_3088
from app.core.robot_model import RobotFactory, BaseRobot
from app.map_processor.pgm_engine import MapAlignmentEngine


class MultiRobotOrchestrator:
    def __init__(self, resolver: RobotNameResolver, map_engine: MapAlignmentEngine) -> None:
        self.resolver = resolver
        self.map_engine = map_engine
        self.tokens: Dict[str, str] = {}
        self.api_logs: List[Dict[str, Any]] = []
        self._ssh_clients: Dict[str, paramiko.SSHClient] = {}
        self.robots: Dict[str, BaseRobot] = {}
        self._init_robots()
        self._start_live_telemetry_poller()

    def _init_robots(self) -> None:
        """Instantiates OOP Robot domain models for each registered robot."""
        records = self.resolver.list_all()
        for rec in records:
            bot = RobotFactory.create_robot(rec, self.map_engine)
            # Default positions until initial live Redis poll completes
            if bot.id == "flag-01":
                bot.local_x = 0.02
                bot.local_y = -0.05
                bot.local_yaw_deg = -2.8
                bot.position_name = "충전점 (#68)"
                bot.battery_pct = 99
                bot.voltage_v = 28.09
                bot.charging = True
                bot.lift_height_m = 0.17
                bot.online_mode = "LIVE_WEBSOCKET_REDIS"
                bot.fsm_state = "LIVE CHARGING @ 충전점 (#68)"
            elif bot.id in ("power-01", "pwr-01"):
                bot.local_x = -0.24
                bot.local_y = -0.18
                bot.local_yaw_deg = 2.3
                bot.position_name = "충전포인트 (#70)"
                bot.battery_pct = 100
                bot.voltage_v = 28.07
                bot.charging = True
                bot.lift_height_m = 0.05
                bot.online_mode = "LIVE_WEBSOCKET_REDIS"
                bot.fsm_state = "LIVE CHARGING @ 충전포인트 (#70)"
            elif bot.id == "pro-01":
                bot.local_x = 0.0
                bot.local_y = -0.80
                bot.position_name = "정비 대기소 (Offline)"
                bot.battery_pct = 88
                bot.voltage_v = 46.8
                bot.charging = False
                bot.online_mode = "OFFLINE_STANDBY"
                bot.fsm_state = "OFFLINE (하드웨어 점검/대기)"
            self.robots[bot.id] = bot

    @property
    def states(self) -> Dict[str, Dict[str, Any]]:
        """Backwards compatibility state accessor."""
        return {r_id: r.to_dict()["telemetry"] for r_id, r in self.robots.items()}

    def _start_live_telemetry_poller(self) -> None:
        t = threading.Thread(target=self._poll_real_robots_loop, daemon=True)
        t.start()

    def _get_ssh(self, r_id: str, host: str, port: int, user: str, pw: str) -> paramiko.SSHClient:
        cli = self._ssh_clients.get(r_id)
        if cli is not None:
            tr = cli.get_transport()
            if tr is not None and tr.is_active():
                return cli
        cli = paramiko.SSHClient()
        cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        cli.connect(host, port=port, username=user, password=pw, timeout=2.0)
        self._ssh_clients[r_id] = cli
        return cli

    def _poll_real_robots_loop(self) -> None:
        while True:
            try:
                for r_id, bot in list(self.robots.items()):
                    sftp_cfg = bot.record.get("sftp", {})
                    host = bot.record.get("ip")
                    port = int(sftp_cfg.get("upper_port", 1002))
                    user = sftp_cfg.get("user", "robot")
                    try:
                        cli = self._get_ssh(r_id, host, port, user, "robot")
                        _, out, _ = cli.exec_command(
                            "redis-cli --raw mget position_info chassis_info upper_info task_status_info path_move_info",
                            timeout=2.0,
                        )
                        lines = out.read().decode("utf-8", errors="ignore").splitlines()
                        if len(lines) >= 3:
                            pos_data = json.loads(lines[0]) if lines[0].startswith("{") else {}
                            chas_data = json.loads(lines[1]) if lines[1].startswith("{") else {}
                            up_data = json.loads(lines[2]) if lines[2].startswith("{") else {}
                            task_data = json.loads(lines[3]) if len(lines) > 3 and lines[3].startswith("{") else {}
                            path_move = json.loads(lines[4]) if len(lines) > 4 and lines[4].startswith("[") else []

                            bot.update_telemetry_from_redis(pos_data, chas_data, up_data, task_data, path_move)
                    except Exception:
                        bot.set_offline()
            except Exception:
                pass
            time.sleep(1.5)

    def get_all_telemetry(self) -> List[Dict[str, Any]]:
        """Returns all serialized robot records with unified SE(2) world coordinates and patrol paths."""
        return [bot.to_dict() for bot in self.robots.values()]

    def get_robot(self, r_id: str) -> Optional[BaseRobot]:
        return self.robots.get(r_id)

    async def login_robot(self, robot: Dict[str, Any], account: str, password_plain: str) -> Dict[str, Any]:
        hashed_pw = hash_password_3088(password_plain, 3088)
        url = f"http://{robot['ip']}/api/v1/auth/login"
        req_payload = {"account": account, "password": hashed_pw}
        t0 = time.time()
        try:
            async with httpx.AsyncClient(timeout=2.5) as client:
                resp = await client.post(url, json=req_payload)
                data = resp.json()
                token = (data.get("data") or {}).get("Token") or (data.get("data") or {}).get("token")
                if token:
                    self.tokens[robot["id"]] = token
                return self._record_log(
                    robot["hostname"],
                    "POST",
                    url,
                    req_payload,
                    data,
                    int((time.time() - t0) * 1000),
                    live=True,
                )
        except Exception as e:
            return self._record_log(
                robot["hostname"],
                "POST",
                url,
                req_payload,
                {"code": 500, "msg": str(e)},
                int((time.time() - t0) * 1000),
                live=False,
            )

    def _record_log(
        self,
        hostname: str,
        method: str,
        endpoint: str,
        request_body: Dict[str, Any],
        response_body: Dict[str, Any],
        latency_ms: int,
        live: bool,
    ) -> Dict[str, Any]:
        entry = {
            "id": f"req-{int(time.time() * 1000)}",
            "timestamp": time.strftime("%H:%M:%S"),
            "robot_hostname": hostname,
            "method": method,
            "endpoint": endpoint,
            "request_body": request_body,
            "response_body": response_body,
            "latency_ms": latency_ms,
            "mode": "LIVE_ROBOT" if live else "OFFLINE",
        }
        self.api_logs.insert(0, entry)
        self.api_logs = self.api_logs[:35]
        return entry
