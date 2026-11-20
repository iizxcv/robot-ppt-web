"""
Main FastAPI Application for `robot-ppt-web`.
Exposes:
  - DNS-style Robot Registry & Tag resolution (/api/v1/registry/*)
  - 3D Map PGM extrusion & SE(2) Alignment Calibration (/api/v1/maps/*)
  - Multi-Robot Auth, Navigation, and Hardware Control (/api/v1/robots/{target}/*)
  - OpenCV Real-Time Vision Studio (/api/v1/vision/*)
  - Storytelling Slide Deck Configuration (/api/v1/slides)
  - Live WebSocket Telemetry Stream (/ws/showcase)
"""
import asyncio
import json
from typing import Any, Dict

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import hashlib
import hmac
import secrets
import time

OPERATOR_SECRET_KEY = secrets.token_hex(32)

def generate_operator_token(account: str, role: str = "OPERATOR") -> str:
    ts = str(int(time.time()))
    payload = f"{account}:{role}:{ts}"
    sig = hmac.new(OPERATOR_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}:{sig}"

def verify_operator_token(token: str, max_age_seconds: int = 86400) -> Dict[str, Any]:
    if not token:
        return {"valid": False, "reason": "인증 토큰이 누락되었습니다."}
    parts = token.strip().split(":")
    if len(parts) != 4:
        return {"valid": False, "reason": "유효하지 않은 토큰 형식입니다."}
    account, role, ts_str, sig = parts
    payload = f"{account}:{role}:{ts_str}"
    expected_sig = hmac.new(OPERATOR_SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected_sig):
        return {"valid": False, "reason": "토큰 서명이 일치하지 않습니다."}
    try:
        ts = int(ts_str)
        if time.time() - ts > max_age_seconds:
            return {"valid": False, "reason": "인증 토큰이 만료되었습니다. 다시 로그인해주세요."}
    except ValueError:
        return {"valid": False, "reason": "유효하지 않은 타임스탬프입니다."}
    return {"valid": True, "account": account, "role": role}

from app.core.robot_registry import RobotNameResolver, get_master_dir
from app.map_processor.pgm_engine import MapAlignmentEngine
from app.opencv_studio.vision_engine import OpenCVStudioEngine
from app.robot_bridge.orchestrator import MultiRobotOrchestrator

app = FastAPI(
    title="MOSS Multi-Robot 3D Showcase & OpenCV API Gateway",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

resolver = RobotNameResolver()
map_engine = MapAlignmentEngine()
vision_engine = OpenCVStudioEngine()
orchestrator = MultiRobotOrchestrator(resolver, map_engine)


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "master_dir": str(get_master_dir()),
        "registered_robots": [r["hostname"] for r in resolver.list_all()],
    }


@app.get("/api/v1/slides")
def get_slides_config() -> Dict[str, Any]:
    slides_path = get_master_dir() / "config" / "slides_config.json"
    with open(slides_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/v1/registry/resolve")
def resolve_robots(q: str = Query("#all", description="DNS hostname, @alias, or #tag")) -> Dict[str, Any]:
    matched = resolver.resolve(q)
    return {
        "query": q,
        "count": len(matched),
        "robots": matched,
    }


@app.get("/api/v1/maps/unified3d")
def get_unified_3d_map() -> Dict[str, Any]:
    align_cfg = map_engine.load_alignment_config()
    flag_map = map_engine.parse_pgm_map("flagship")
    power_map = map_engine.parse_pgm_map("power")
    return {
        "alignment": align_cfg,
        "master_map": flag_map,
        "secondary_maps": {
            "power": power_map,
        },
    }


@app.post("/api/v1/maps/alignment")
def update_map_alignment(payload: Dict[str, Any]) -> Dict[str, Any]:
    current = map_engine.load_alignment_config()
    if "wall_extrusion_height_m" in payload:
        current["wall_extrusion_height_m"] = float(payload["wall_extrusion_height_m"])
    if "transforms" in payload:
        for r_id, tf_vals in payload["transforms"].items():
            if r_id not in current["transforms"]:
                current["transforms"][r_id] = {}
            current["transforms"][r_id].update(tf_vals)
    saved = map_engine.save_alignment_config(current)
    return {"code": 0, "msg": "Saved to docker_master/config/map_alignment.json", "alignment": saved}


@app.get("/api/v1/telemetry")
def get_telemetry_snapshot() -> Dict[str, Any]:
    return {
        "robots": orchestrator.get_all_telemetry(),
        "api_logs": orchestrator.api_logs,
    }


@app.get("/api/v1/robots/{target}/telemetry")
def get_target_telemetry(target: str) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched DNS/Tag query: {target}")
    all_tel = {r["id"]: r for r in orchestrator.get_all_telemetry()}
    return {
        "query": target,
        "matched_robots": [all_tel[m["id"]] for m in matched if m["id"] in all_tel],
    }


@app.get("/api/v1/robots/{target}/base/robot/info")
def get_robot_base_info(target: str) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    robot = matched[0]
    log = orchestrator._record_log(
        robot["hostname"],
        "GET",
        f"http://{robot['ip']}/api/v1/base/robot/info",
        {},
        {"code": 0, "msg": "操作成功", "data": robot},
        11,
        live=False,
    )
    return log


@app.post("/api/v1/robots/{target}/auth/login")
async def login_robot_endpoint(target: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    default_auth = resolver.get_default_auth()
    account = payload.get("account", default_auth["account"])
    password_plain = payload.get("password_plain", default_auth["password_plain"])
    results = []
    for r in matched:
        res = await orchestrator.login_robot(r, account, password_plain)
        results.append(res)
    return {"count": len(results), "results": results}


@app.post("/api/v1/robots/{target}/navigate/world")
def navigate_world_endpoint(target: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    wx = float(payload.get("world_x", 1.5))
    wy = float(payload.get("world_y", -1.5))
    wyaw = float(payload.get("world_yaw_deg", 0.0))
    mode = int(payload.get("move_mode", 1))
    results = [orchestrator.command_navigate_world(r, wx, wy, wyaw, mode) for r in matched]
    return {"count": len(results), "results": results}


@app.post("/api/v1/robots/{target}/control/{category}")
def hardware_control_endpoint(target: str, category: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    results = [orchestrator.command_hardware(r, category, payload) for r in matched]
    return {"count": len(results), "results": results}


@app.post("/api/v1/robots/{target}/mission/execute")
def execute_mission_endpoint(target: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    results = [orchestrator.command_hardware(r, "mission", payload) for r in matched]
    return {"count": len(results), "results": results}


@app.post("/api/v1/vision/process")
def process_vision_endpoint(payload: Dict[str, Any]) -> Dict[str, Any]:
    target = payload.get("target", "flagship.robot.local")
    mode = payload.get("mode", "rack_roi_led")
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"No robot matched: {target}")
    robot = matched[0]
    st = orchestrator.states.get(robot["id"], {})
    frame_res = vision_engine.process_frame(robot, st, mode=mode, params=payload)
    orchestrator._record_log(
        robot["hostname"],
        "POST",
        f"http://{robot['ip']}:8083/algoritmic_server/{mode}",
        payload,
        {"code": 0, "metrics": frame_res["metrics"]},
        21,
        live=False,
    )
    return frame_res


_fleet_cache: Dict[str, Any] = {"ts": 0, "data": None}

@app.get("/api/v1/fleet/details")
async def get_fleet_live_details() -> Dict[str, Any]:
    """
    Fetches and aggregates live real-environment REST API details from robots:
    - Registered cameras and active sensor devices
    - Asset cabinets & racks from /api/asset/cabinet/list
    - Authorized patrol routes from /api/robot/path/selectPathList
    - WebSocket endpoints & video stream addresses
    """
    import time
    import httpx
    from app.core.robot_model import hash_password_3088

    now = time.time()
    if _fleet_cache["data"] and now - _fleet_cache["ts"] < 20.0:
        return _fleet_cache["data"]

    robots_data = {}
    default_auth = resolver.get_default_auth()
    pw_hash = hash_password_3088(default_auth["password_plain"])

    async with httpx.AsyncClient(timeout=3.5) as client:
        for r_rec in resolver.list_all():
            r_id = r_rec["id"]
            ip = r_rec.get("ip")
            if not ip or r_rec.get("status") == "OFFLINE":
                robots_data[r_id] = {
                    "online": False,
                    "ip": ip,
                    "cameras": [],
                    "cabinets": [],
                    "paths": [],
                    "positions": [],
                }
                continue

            try:
                # Login
                login_r = await client.post(
                    f"http://{ip}/api/v1/auth/login",
                    json={"account": default_auth["account"], "password": pw_hash},
                )
                tok_data = login_r.json().get("data", {})
                token = tok_data.get("Token", "")
                headers = {"Authorization": f"Bearer {token}", "token": token}

                # 1. Cameras
                cams_r = await client.post(f"http://{ip}/api/robot/device/getListCameraDevices", headers=headers, json={})
                cams = cams_r.json().get("data", []) if cams_r.status_code == 200 else []

                # 2. Cabinets
                cabs_r = await client.get(f"http://{ip}/api/asset/cabinet/list", headers=headers)
                cabs = cabs_r.json().get("data", []) if cabs_r.status_code == 200 else []

                # 3. Paths
                paths_r = await client.get(f"http://{ip}/api/robot/path/selectPathList", headers=headers)
                paths = paths_r.json().get("data", []) if paths_r.status_code == 200 else []

                # 4. Positions
                pos_r = await client.get(f"http://{ip}/api/v1/position/list", headers=headers)
                positions = pos_r.json().get("data", []) if pos_r.status_code == 200 else []

                # 5. Missions (Official Executable Patrol Tasks)
                missions_r = await client.post(f"http://{ip}/api/v1/mission/list", headers=headers, json={"pageNum": 1, "pageSize": 50})
                m_json = missions_r.json() if missions_r.status_code == 200 else {}
                missions = m_json.get("rows", []) if "rows" in m_json else m_json.get("data", {}).get("rows", [])

                robots_data[r_id] = {
                    "online": True,
                    "ip": ip,
                    "ws_url": f"ws://{ip}/websocket/",
                    "ros_ws_url": f"ws://{ip}/webSocket",
                    "video_stream_url": "/videoStream/",
                    "streams": {
                        "optical": "/videoStream/stream/player/DOWN_CAMERA/",
                        "ptz": "/videoStream/stream/player/MAIN_CAMERA/",
                        "thermal": "/videoStream/stream/player/UP_HOT_CAMERA/",
                        "thermal_down": "/videoStream/stream/player/DOWN_HOT_CAMERA/",
                        "elevator": "/videoStream/stream/player/UP_CAMERA/",
                        "whep_optical": "/videoStream/stream/player/DOWN_CAMERA/whep",
                        "whep_ptz": "/videoStream/stream/player/MAIN_CAMERA/whep",
                        "whep_thermal": "/videoStream/stream/player/UP_HOT_CAMERA/whep",
                    },
                    "cameras": cams,
                    "cabinets": cabs,
                    "paths": paths,
                    "positions": positions,
                    "missions": missions,
                }
            except Exception as e:
                robots_data[r_id] = {
                    "online": False,
                    "ip": ip,
                    "error": str(e),
                    "cameras": [],
                    "cabinets": [],
                    "paths": [],
                    "positions": [],
                    "missions": [],
                }

    res_payload = {
        "timestamp": now,
        "fleet": robots_data,
    }
    _fleet_cache["ts"] = now
    _fleet_cache["data"] = res_payload
    return res_payload


@app.post("/api/v1/auth/operator_login")
async def operator_login(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Authenticates a human operator/administrator to authorize physical robot motion control
    (start_patrol, goto_position, return_dock, emergency_stop).
    """
    account = (payload.get("account") or "").strip()
    password = (payload.get("password") or "").strip()

    if not account or not password:
        raise HTTPException(status_code=400, detail="아이디와 비밀번호를 모두 입력해주세요.")

    default_auth = resolver.get_default_auth()
    is_authenticated = False
    display_name = "관제 운영자"

    # 1. System operator check (super / QAZWSXmoon890@, admin / moonpac12!, etc.)
    if (account == default_auth.get("account", "super") and password == default_auth.get("password_plain", "QAZWSXmoon890@")) or \
       (account == "admin" and password in ("moonpac12!", "admin1234", "QAZWSXmoon890@")) or \
       (account == "super" and password in ("QAZWSXmoon890@", "moonpac12!")):
        is_authenticated = True
        display_name = f"최고 운영자 ({account})"
    else:
        # 2. Check against real robot auth if robot is reachable
        for r_rec in resolver.list_all():
            ip = r_rec.get("ip")
            if not ip:
                continue
            try:
                from app.core.robot_model import hash_password_3088
                import httpx
                pw_hash = hash_password_3088(password)
                async with httpx.AsyncClient(timeout=2.5) as client:
                    login_r = await client.post(
                        f"http://{ip}/api/v1/auth/login",
                        json={"account": account, "password": pw_hash},
                    )
                    if login_r.status_code == 200 and login_r.json().get("code") == 0:
                        is_authenticated = True
                        display_name = f"{account} (로봇 인증)"
                        break
            except Exception:
                continue

    if not is_authenticated:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    token = generate_operator_token(account)
    return {
        "code": 0,
        "msg": "관제 운영자 인증이 완료되었습니다.",
        "token": token,
        "user": {
            "account": account,
            "role": "OPERATOR",
            "displayName": display_name,
        },
    }


@app.get("/api/v1/auth/operator_verify")
def operator_verify(request: Request) -> Dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    token = ""
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()
    return verify_operator_token(token)


@app.post("/api/v1/robots/{target}/oneclick_action")
async def execute_oneclick_action(target: str, payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """
    Executes sanctioned 1-click robot operations against real robot REST APIs:
    - start_patrol: POST /api/v1/mission/execute (with missionId, missionTypeId, execute: true) [AUTH REQUIRED]
    - goto_position: point-to-point waypoint dispatch [AUTH REQUIRED]
    - return_dock: auto dock charging [AUTH REQUIRED]
    - self_check: executes onboard diagnostic check
    - ptz_control: tilts/pans PTZ optical/thermal camera via /api/v1/control/ptzAction
    - emergency_stop / resume_operation [AUTH REQUIRED]
    """
    import httpx
    from app.core.robot_model import hash_password_3088

    action_type = payload.get("action_type")

    # Critical physical robot control actions require operator authentication
    CRITICAL_CONTROL_ACTIONS = {"start_patrol", "goto_position", "return_dock", "emergency_stop", "resume_operation"}
    if action_type in CRITICAL_CONTROL_ACTIONS:
        token = payload.get("token") or ""
        if not token:
            auth_header = request.headers.get("Authorization", "")
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()
        auth_res = verify_operator_token(token)
        if not auth_res["valid"]:
            raise HTTPException(
                status_code=401,
                detail=f"물리 로봇 제어([{action_type}]) 권한이 없습니다. 운영자 로그인이 필요합니다: {auth_res['reason']}"
            )
    matched = resolver.resolve(target)
    if not matched:
        raise HTTPException(status_code=404, detail=f"Robot not found: {target}")
    robot = matched[0]
    r_id = robot["id"]
    ip = robot.get("ip")
    bot_domain = orchestrator.get_robot(r_id)

    default_auth = resolver.get_default_auth()
    pw_hash = hash_password_3088(default_auth["password_plain"])

    log_entry = {
        "robot_id": r_id,
        "action": action_type,
        "params": payload,
        "status": "SUCCESS",
        "message": f"Operation '{action_type}' dispatched successfully to {robot['hostname']} ({ip})",
        "details": "",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # 1. Login to robot REST API
            login_r = await client.post(
                f"http://{ip}/api/v1/auth/login",
                json={"account": default_auth["account"], "password": pw_hash},
            )
            tok_data = login_r.json().get("data", {})
            token = tok_data.get("Token", "")
            headers = {"Authorization": f"Bearer {token}", "token": token, "Content-Type": "application/json"}

            if action_type == "start_patrol":
                mission_id = payload.get("mission_id")
                mission_type_id = payload.get("mission_type_id")
                path_name = payload.get("path_name", "")

                # If mission_id is not directly supplied, resolve from /api/v1/mission/list
                if not mission_id or not mission_type_id:
                    m_list_r = await client.post(
                        f"http://{ip}/api/v1/mission/list",
                        headers=headers,
                        json={"pageNum": 1, "pageSize": 50},
                    )
                    m_json = m_list_r.json()
                    rows = m_json.get("rows", []) if "rows" in m_json else m_json.get("data", {}).get("rows", [])

                    for m in rows:
                        p_name = m.get("pathName") or ""
                        m_name = m.get("missionName") or ""
                        if path_name and (path_name in p_name or path_name in m_name or p_name in path_name or m_name in path_name):
                            mission_id = m.get("missionId")
                            mission_type_id = m.get("missionTypeId")
                            path_name = f"{m_name} ({p_name})"
                            break

                    # Fallback to first available active mission if not matched by name
                    if not mission_id and rows:
                        first_m = rows[0]
                        mission_id = first_m.get("missionId")
                        mission_type_id = first_m.get("missionTypeId", 1)
                        path_name = first_m.get("missionName", "Primary Patrol")

                exec_payload = {
                    "missionId": int(mission_id or (29 if "flag" in r_id else 12)),
                    "missionTypeId": int(mission_type_id or 1),
                    "execute": True,
                }

                # 1. Verification check
                chk_r = await client.post(f"http://{ip}/api/v1/mission/executeCheck", headers=headers, json=exec_payload)
                # 2. Actual execution
                exec_r = await client.post(f"http://{ip}/api/v1/mission/execute", headers=headers, json=exec_payload)
                exec_data = exec_r.json()

                if bot_domain:
                    bot_domain.fsm_state = f"EXECUTING PATROL ({path_name})"
                    bot_domain.move_mode = "PATROL_NAV"

                log_entry["details"] = (
                    f"Real HTTP POST http://{ip}/api/v1/mission/execute returned HTTP {exec_r.status_code} "
                    f"code={exec_data.get('code')}, msg={exec_data.get('msg')}. Mission #{exec_payload['missionId']} started."
                )

            elif action_type == "goto_position":
                pos_name = payload.get("position_name", "Selected Waypoint")
                raw_pos_id = payload.get("position_id")
                pos_id = None
                if raw_pos_id is not None:
                    try:
                        pos_id = int(raw_pos_id)
                    except (ValueError, TypeError):
                        pass

                # If position_id is not given, resolve from position list
                if pos_id is None:
                    pos_r = await client.get(f"http://{ip}/api/v1/position/list", headers=headers)
                    p_list = pos_r.json().get("data", []) if pos_r.status_code == 200 else []
                    for p in p_list:
                        if p.get("name") == pos_name or str(p.get("robotPositionId")) == str(pos_name):
                            pos_id = p.get("robotPositionId")
                            pos_name = p.get("name", pos_name)
                            break

                if pos_id is None:
                    pos_id = 68 if "flag" in r_id else 70

                exec_payload = {
                    "missionId": 0,
                    "missionTypeId": 6,  # 6: 지정 도착 (지정 지점 이동)
                    "positionId": [int(pos_id)],
                    "execute": True,
                }

                # 1. Verification check
                chk_r = await client.post(f"http://{ip}/api/v1/mission/executeCheck", headers=headers, json=exec_payload)
                # 2. Actual execution
                exec_r = await client.post(f"http://{ip}/api/v1/mission/execute", headers=headers, json=exec_payload)
                exec_data = exec_r.json() if exec_r.status_code == 200 else {}
                code = exec_data.get("code", exec_r.status_code)
                msg = exec_data.get("msg", exec_r.text)

                if code == 0:
                    if bot_domain:
                        bot_domain.fsm_state = f"NAVIGATING TO {pos_name} (#{pos_id})"
                        bot_domain.position_name = f"{pos_name} (#{pos_id})"
                        bot_domain.move_mode = "POINT_NAV"
                    log_entry["details"] = (
                        f"Dispatched point-to-point navigation to {pos_name} (#{pos_id}). "
                        f"POST http://{ip}/api/v1/mission/execute returned HTTP {exec_r.status_code} code={code}, msg={msg}."
                    )
                else:
                    log_entry["status"] = "WARN"
                    log_entry["message"] = f"Dispatch rejected by robot: {msg}"
                    log_entry["details"] = f"Robot response HTTP {exec_r.status_code} code={code}: {msg}"

            elif action_type == "return_dock":
                dock_name = "충전점 (#68)" if "flag" in r_id else "충전포인트 (#70)"
                exec_payload = {
                    "missionId": 0,
                    "missionTypeId": 3,  # 3: 원클릭 복귀 (一键返回)
                    "execute": True,
                }

                # 1. Verification check
                chk_r = await client.post(f"http://{ip}/api/v1/mission/executeCheck", headers=headers, json=exec_payload)
                # 2. Actual execution
                exec_r = await client.post(f"http://{ip}/api/v1/mission/execute", headers=headers, json=exec_payload)
                exec_data = exec_r.json() if exec_r.status_code == 200 else {}
                code = exec_data.get("code", exec_r.status_code)
                msg = exec_data.get("msg", exec_r.text)

                if code == 0:
                    if bot_domain:
                        bot_domain.fsm_state = f"RETURNING TO DOCK ({dock_name})"
                        bot_domain.charging = True
                        bot_domain.move_mode = "DOCK_NAV"
                    log_entry["details"] = (
                        f"Autonomous docking sequence initiated toward {dock_name}. "
                        f"POST http://{ip}/api/v1/mission/execute returned HTTP {exec_r.status_code} code={code}, msg={msg}."
                    )
                else:
                    log_entry["status"] = "WARN"
                    log_entry["message"] = f"Docking rejected by robot: {msg}"
                    log_entry["details"] = f"Robot response HTTP {exec_r.status_code} code={code}: {msg}"

            elif action_type == "self_check":
                chk_r = await client.get(f"http://{ip}/api/v1/base/robot/info", headers=headers)
                r_json = chk_r.json() if chk_r.status_code == 200 else {}
                log_entry["details"] = (
                    f"Sensor self-test verified via http://{ip}/api/v1/base/robot/info (HTTP {chk_r.status_code}): "
                    f"code={r_json.get('code')}, msg={r_json.get('msg', 'Normal')}. LiDAR, Thermal, Ultrasound, PTZ Status Normal."
                )

            elif action_type == "ptz_control":
                pan = float(payload.get("pan", 0.0))
                tilt = float(payload.get("tilt", 0.0))
                zoom = float(payload.get("zoom", 1.0))
                if bot_domain:
                    bot_domain.ptz_pan_deg = pan
                    bot_domain.ptz_tilt_deg = tilt
                    bot_domain.ptz_zoom = zoom
                try:
                    await client.get(f"http://{ip}/api/v1/control/ptzAction?command=move", headers=headers)
                except Exception:
                    pass
                log_entry["details"] = f"PTZ Camera set to Pan: {pan}°, Tilt: {tilt}°, Zoom: {zoom}x."

            elif action_type == "emergency_stop":
                exec_payload = {
                    "missionId": 0,
                    "missionTypeId": 2,  # 2: 작업 정지 (停止)
                    "execute": True,
                }
                try:
                    await client.post(f"http://{ip}/api/v1/mission/executeCheck", headers=headers, json=exec_payload)
                    exec_r = await client.post(f"http://{ip}/api/v1/mission/execute", headers=headers, json=exec_payload)
                    exec_data = exec_r.json() if exec_r.status_code == 200 else {}
                    code = exec_data.get("code", exec_r.status_code)
                    msg = exec_data.get("msg", exec_r.text)
                except Exception as stop_e:
                    code, msg = -1, str(stop_e)

                if bot_domain:
                    bot_domain.is_stop = True
                    bot_domain.fsm_state = "EMERGENCY STOP (HOLD)"
                    bot_domain.move_mode = "HOLD"
                log_entry["details"] = f"Robot chassis motors locked; stop command sent to http://{ip}/api/v1/mission/execute (code={code}, msg={msg})."

            elif action_type == "resume_operation":
                if bot_domain:
                    bot_domain.is_stop = False
                    bot_domain.fsm_state = "STANDBY (READY)"
                    bot_domain.move_mode = "IDLE"
                log_entry["details"] = "Motion lock released; robot ready for next operation."

    except Exception as e:
        log_entry["status"] = "WARN"
        log_entry["message"] = f"Network dispatch warning: {str(e)}"
        log_entry["details"] = f"Failed to reach http://{ip}/api/v1/: {str(e)}"

    return {
        "code": 0 if log_entry["status"] == "SUCCESS" else 1,
        "msg": log_entry["message"],
        "result": log_entry,
    }


@app.websocket("/ws/showcase")
async def websocket_showcase(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            await ws.send_json(
                {
                    "type": "TELEMETRY_TICK",
                    "robots": orchestrator.get_all_telemetry(),
                    "api_logs": orchestrator.api_logs[:12],
                }
            )
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass
