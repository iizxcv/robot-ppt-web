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

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

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
