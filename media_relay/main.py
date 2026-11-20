import os
import io
import time
import asyncio
import logging
from typing import Dict, Set, Optional
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx
from PIL import Image
from aiortc import RTCPeerConnection, RTCSessionDescription

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [MediaRelay] %(message)s"
)
logger = logging.getLogger("media_relay")

UPSTREAM_MEDIA_SERVER = os.getenv("UPSTREAM_MEDIA_SERVER", "http://10.200.30.110:8889").rstrip("/")
logger.info(f"Initialized 8080 Universal Media Relay with Upstream Target: {UPSTREAM_MEDIA_SERVER}")

app = FastAPI(title="SR Robotics 8080 Universal Media Relay Server", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global HTTP client
http_client = httpx.AsyncClient(timeout=30.0)


class CameraStreamSession:
    """Manages an active aiortc WebRTC pull session to upstream 10.200.30.110:8889."""
    def __init__(self, stream_name: str):
        self.stream_name = stream_name
        self.pc: Optional[RTCPeerConnection] = None
        self.latest_jpeg: Optional[bytes] = None
        self.latest_width = 0
        self.latest_height = 0
        self.fps = 0.0
        self.subscribers: Set[asyncio.Queue] = set()
        self.is_running = False
        self.worker_task: Optional[asyncio.Task] = None
        self.track_task: Optional[asyncio.Task] = None

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        self.worker_task = asyncio.create_task(self._run_loop())
        logger.info(f"[{self.stream_name}] Started WebRTC pull worker")

    async def stop(self):
        self.is_running = False
        if self.track_task:
            self.track_task.cancel()
            self.track_task = None
        if self.worker_task:
            self.worker_task.cancel()
            self.worker_task = None
        if self.pc:
            await self.pc.close()
            self.pc = None
        logger.info(f"[{self.stream_name}] Stopped WebRTC pull worker")

    async def _run_loop(self):
        """Worker loop that connects and stays connected with automatic reconnect."""
        while self.is_running:
            try:
                await self._connect_and_recv()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"[{self.stream_name}] WebRTC pull error: {e}. Reconnecting in 2s...")
                await asyncio.sleep(2.0)

    async def _connect_and_recv(self):
        pc = RTCPeerConnection()
        self.pc = pc
        pc.addTransceiver("video", direction="recvonly")

        @pc.on("track")
        def on_track(track):
            async def track_reader():
                fps_timer = time.time()
                fps_frames = 0
                logger.info(f"[{self.stream_name}] Receiving video track frames from upstream")
                while self.is_running:
                    try:
                        frame = await track.recv()
                        img = frame.to_image()
                        self.latest_width = img.width
                        self.latest_height = img.height

                        # Downscale if > 1920 to keep smooth 30fps over HTTP 8080
                        if img.width > 1920:
                            img = img.resize((1920, int(1920 * img.height / img.width)), Image.BILINEAR)

                        buf = io.BytesIO()
                        img.save(buf, format="JPEG", quality=75, optimize=True)
                        jpeg_bytes = buf.getvalue()
                        self.latest_jpeg = jpeg_bytes

                        fps_frames += 1
                        now = time.time()
                        if now - fps_timer >= 1.0:
                            self.fps = round(fps_frames / (now - fps_timer), 1)
                            fps_frames = 0
                            fps_timer = now

                        for q in list(self.subscribers):
                            if q.full():
                                try:
                                    q.get_nowait()
                                except asyncio.QueueEmpty:
                                    pass
                            try:
                                q.put_nowait(jpeg_bytes)
                            except Exception:
                                pass
                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        logger.warning(f"[{self.stream_name}] track.recv() ended: {e}")
                        break
            self.track_task = asyncio.create_task(track_reader())

        offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        whep_url = f"{UPSTREAM_MEDIA_SERVER}/stream/player/{self.stream_name}/whep"
        resp = await http_client.post(
            whep_url,
            headers={"Content-Type": "application/sdp"},
            content=pc.localDescription.sdp,
            timeout=5.0
        )
        if resp.status_code != 201:
            raise RuntimeError(f"WHEP upstream returned {resp.status_code}: {resp.text}")

        answer = RTCSessionDescription(sdp=resp.text, type="answer")
        await pc.setRemoteDescription(answer)
        logger.info(f"[{self.stream_name}] Connected to upstream WHEP stream (201 Created)")

        # Keep session alive while running
        while self.is_running and pc.connectionState != "closed" and pc.connectionState != "failed":
            await asyncio.sleep(1.0)

        if self.track_task:
            self.track_task.cancel()
        await pc.close()


class StreamManager:
    """Manages stream instances across cameras."""
    def __init__(self):
        self.streams: Dict[str, CameraStreamSession] = {}

    def get_or_create(self, stream_name: str) -> CameraStreamSession:
        if stream_name not in self.streams:
            self.streams[stream_name] = CameraStreamSession(stream_name)
        return self.streams[stream_name]


stream_manager = StreamManager()


@app.on_event("startup")
async def startup_event():
    # Pre-warm MAIN_CAMERA and DOWN_CAMERA so first frame is instant
    for s in ["MAIN_CAMERA", "DOWN_CAMERA"]:
        session = stream_manager.get_or_create(s)
        asyncio.create_task(session.start())


@app.get("/health")
@app.get("/videoStream/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "8080 Universal Media Relay Server",
        "upstream_server": UPSTREAM_MEDIA_SERVER,
        "supported_codecs": "JPEG/MJPEG over HTTP & WebSocket (Port 8080 Native)",
        "active_streams": {
            k: {
                "running": v.is_running,
                "fps": v.fps,
                "resolution": f"{v.latest_width}x{v.latest_height}" if v.latest_width else "N/A",
                "subscribers": len(v.subscribers)
            } for k, v in stream_manager.streams.items()
        }
    }


# 1. Pure HTTP Multipart MJPEG Stream (100% Port 8080 Native!)
@app.get("/videoStream/live/{stream_name}")
async def mjpeg_stream(stream_name: str):
    session = stream_manager.get_or_create(stream_name)
    await session.start()

    async def frame_generator():
        q = asyncio.Queue(maxsize=3)
        session.subscribers.add(q)
        try:
            if session.latest_jpeg:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + session.latest_jpeg + b"\r\n"
                )
            while True:
                jpeg_bytes = await q.get()
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n" + jpeg_bytes + b"\r\n"
                )
        except asyncio.CancelledError:
            pass
        finally:
            session.subscribers.discard(q)

    return StreamingResponse(
        frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# 2. Single Frame Snapshot
@app.get("/videoStream/snapshot/{stream_name}")
async def snapshot(stream_name: str):
    session = stream_manager.get_or_create(stream_name)
    await session.start()
    for _ in range(30):
        if session.latest_jpeg:
            return Response(content=session.latest_jpeg, media_type="image/jpeg")
        await asyncio.sleep(0.1)
    return Response(status_code=503, content=b"Camera initializing")


# 3. WebSocket Binary Video Frame Stream
@app.websocket("/videoStream/ws/{stream_name}")
async def websocket_stream(websocket: WebSocket, stream_name: str):
    await websocket.accept()
    session = stream_manager.get_or_create(stream_name)
    await session.start()

    q = asyncio.Queue(maxsize=3)
    session.subscribers.add(q)
    try:
        if session.latest_jpeg:
            await websocket.send_bytes(session.latest_jpeg)
        while True:
            jpeg_bytes = await q.get()
            await websocket.send_bytes(jpeg_bytes)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        session.subscribers.discard(q)


# 4. Universal HTML5 Player Interface (Served on /videoStream/stream/player/{stream_name}/)
@app.get("/videoStream/stream/player/{stream_name}")
@app.get("/videoStream/stream/player/{stream_name}/")
async def player_html(stream_name: str):
    session = stream_manager.get_or_create(stream_name)
    asyncio.create_task(session.start())

    html_content = f"""<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Live Camera Stream - {stream_name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        html, body {{
            width: 100%; height: 100%;
            background: #030712;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }}
        .container {{
            width: 100%; height: 100%;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #000;
        }}
        #streamImg {{
            width: 100%; height: 100%;
            object-fit: fill;
            display: block;
            background: #000;
        }}
        .osd-live {{
            position: absolute; top: 12px; left: 14px;
            background: rgba(3, 7, 18, 0.82);
            backdrop-filter: blur(6px);
            border: 1px solid rgba(34, 197, 94, 0.5);
            padding: 4px 10px; border-radius: 6px;
            color: #4ade80; font-size: 11px; font-weight: 700;
            font-family: monospace; display: flex; align-items: center; gap: 6px;
            z-index: 10; pointer-events: none;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }}
        .dot {{
            width: 8px; height: 8px; border-radius: 50%;
            background: #22c55e; box-shadow: 0 0 10px #22c55e;
            animation: pulse 1.5s infinite;
        }}
        @keyframes pulse {{
            0%, 100% {{ opacity: 1; transform: scale(1); }}
            50% {{ opacity: 0.4; transform: scale(0.85); }}
        }}
        .osd-stats {{
            position: absolute; bottom: 12px; left: 14px;
            background: rgba(3, 7, 18, 0.82);
            backdrop-filter: blur(6px);
            border: 1px solid rgba(255, 255, 255, 0.15);
            padding: 3px 8px; border-radius: 4px;
            color: #94a3b8; font-size: 10.5px; font-family: monospace;
            z-index: 10; pointer-events: none;
        }}
        .osd-fullscreen {{
            position: absolute; top: 12px; right: 14px;
            background: rgba(15, 23, 42, 0.85);
            border: 1px solid rgba(59, 130, 246, 0.5);
            padding: 4px 10px; border-radius: 6px;
            color: #38bdf8; font-size: 11px; font-weight: 700;
            text-decoration: none; cursor: pointer; z-index: 10;
        }}
        .loading-cover {{
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: #030712; display: flex; flex-direction: column;
            align-items: center; justify-content: center; color: #94a3b8;
            font-size: 13px; z-index: 5; transition: opacity 0.3s;
        }}
        .spinner {{
            width: 32px; height: 32px; border: 3px solid rgba(59, 130, 246, 0.2);
            border-top: 3px solid #3b82f6; border-radius: 50%;
            animation: spin 1s linear infinite; margin-bottom: 12px;
        }}
        @keyframes spin {{
            0% {{ transform: rotate(0deg); }}
            100% {{ transform: rotate(360deg); }}
        }}
    </style>
</head>
<body>
<div class="container">
    <div id="loadingCover" class="loading-cover">
        <div class="spinner"></div>
        <div>실시간 영상 피드 동기화 중... (Port 8080)</div>
    </div>
    <div class="osd-live">
        <span class="dot"></span>
        <span>REC [LIVE HTTP 8080] · {stream_name}</span>
    </div>
    <div class="osd-stats">
        Format: Native MJPEG · Port: 8080 · Pipeline: 10.200.30.110
    </div>
    <button class="osd-fullscreen" onclick="toggleFullscreen()">전체화면</button>

    <img id="streamImg" src="/videoStream/live/{stream_name}" alt="Live Camera" />
</div>

<script>
    const img = document.getElementById('streamImg');
    const cover = document.getElementById('loadingCover');

    img.onload = () => {{
        if (cover) cover.style.display = 'none';
    }};

    img.onerror = () => {{
        setTimeout(() => {{
            img.src = '/videoStream/live/{stream_name}?t=' + Date.now();
        }}, 1500);
    }};

    function toggleFullscreen() {{
        if (!document.fullscreenElement) {{
            document.documentElement.requestFullscreen().catch(() => {{}});
        }} else {{
            document.exitFullscreen().catch(() => {{}});
        }}
    }}
</script>
</body>
</html>
"""
    return HTMLResponse(content=html_content)


# 5. Wildcard proxy fallback for legacy requests
@app.api_route("/stream/{path:path}", methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"])
async def stream_fallback_proxy(request: Request, path: str):
    target_url = f"{UPSTREAM_MEDIA_SERVER}/stream/{path}"
    query = request.url.query
    if query:
        target_url = f"{target_url}?{query}"
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ["host", "content-length"]}
    try:
        resp = await http_client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body if body else None,
            timeout=15.0
        )
        return Response(
            content=resp.content,
            status_code=resp.status_code,
            headers=dict(resp.headers),
            media_type=resp.headers.get("content-type")
        )
    except Exception as e:
        return JSONResponse(status_code=502, content={"error": str(e)})
