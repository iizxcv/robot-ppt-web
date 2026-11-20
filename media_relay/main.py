import os
import logging
from typing import Optional
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [MediaRelay] %(message)s"
)
logger = logging.getLogger("media_relay")

UPSTREAM_MEDIA_SERVER = os.getenv("UPSTREAM_MEDIA_SERVER", "http://10.200.30.110:8889").rstrip("/")
logger.info(f"Initialized Media Relay with Upstream Target: {UPSTREAM_MEDIA_SERVER}")

app = FastAPI(title="SR Robotics Media Relay Server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Location", "Link", "ETag", "ID", "Accept-Patch"],
)

# Async HTTP Client for Upstream Communication
client = httpx.AsyncClient(timeout=60.0, follow_redirects=True)


@app.on_event("shutdown")
async def shutdown_event():
    await client.aclose()


@app.get("/health")
@app.get("/videoStream/health")
async def health_check():
    """Verify relay health and check upstream media server reachability."""
    upstream_ok = False
    active_streams = []
    try:
        r = await client.request("OPTIONS", f"{UPSTREAM_MEDIA_SERVER}/stream/player/DOWN_CAMERA/whep", timeout=2.0)
        upstream_ok = (r.status_code == 204 or r.status_code == 200)
    except Exception as e:
        logger.warning(f"Upstream ping failed: {e}")

    # Check known streams
    for s in ["DOWN_CAMERA", "MAIN_CAMERA", "UP_HOT_CAMERA", "UP_CAMERA"]:
        try:
            r = await client.options(f"{UPSTREAM_MEDIA_SERVER}/stream/player/{s}/whep", timeout=0.5)
            if r.status_code == 204:
                active_streams.append(s)
        except Exception:
            pass

    return {
        "status": "healthy",
        "relay_server": "active",
        "upstream_server": UPSTREAM_MEDIA_SERVER,
        "upstream_reachable": upstream_ok,
        "active_stream_endpoints": active_streams,
    }


async def proxy_to_upstream(request: Request, upstream_path: str) -> Response:
    """Core bidirectional proxy forwarder for WebRTC WHEP, HTML Player, and media assets."""
    target_url = f"{UPSTREAM_MEDIA_SERVER}/{upstream_path.lstrip('/')}"
    query = request.url.query
    if query:
        target_url = f"{target_url}?{query}"

    method = request.method
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ["host", "content-length"]}
    body = await request.body()

    try:
        upstream_resp = await client.request(
            method=method,
            url=target_url,
            headers=headers,
            content=body if body else None,
            timeout=30.0,
        )

        resp_headers = dict(upstream_resp.headers)

        # Ensure CORS headers are present
        resp_headers["access-control-allow-origin"] = "*"
        resp_headers["access-control-allow-credentials"] = "true"
        resp_headers["access-control-expose-headers"] = "Location, Link, ETag, ID, Accept-Patch"

        # Adapt Location header if present in WHEP 201 Created
        if "location" in resp_headers:
            loc = resp_headers["location"]
            # If location is relative like /stream/player/..., keep it or ensure accessible
            logger.info(f"WHEP session created with Location: {loc}")

        content = upstream_resp.content

        # If this is a WHEP SDP answer, inject public IP candidate for external WAN clients
        if upstream_resp.status_code == 201 and "application/sdp" in upstream_resp.headers.get("content-type", ""):
            try:
                sdp_text = upstream_resp.text
                new_sdp_lines = []
                for line in sdp_text.splitlines():
                    new_sdp_lines.append(line)
                    if "10.200.30.110 8189" in line:
                        # Append dual candidate with public gateway IP (220.75.211.116)
                        new_sdp_lines.append(line.replace("10.200.30.110 8189", "220.75.211.116 8189"))
                content = "\r\n".join(new_sdp_lines).encode("utf-8")
                logger.info("Injected public WAN ICE candidates (220.75.211.116:8189) into SDP answer")
            except Exception as e:
                logger.warning(f"Failed to adapt SDP answer: {e}")

        # Drop hop-by-hop headers
        for h in ["content-encoding", "transfer-encoding", "connection"]:
            resp_headers.pop(h, None)

        return Response(
            content=content,
            status_code=upstream_resp.status_code,
            headers=resp_headers,
            media_type=upstream_resp.headers.get("content-type"),
        )
    except httpx.ConnectError as e:
        logger.error(f"Cannot connect to upstream {target_url}: {e}")
        return JSONResponse(
            status_code=502,
            content={"error": "Media Relay Upstream Connection Failed", "target": target_url, "detail": str(e)}
        )
    except Exception as e:
        logger.error(f"Error proxying {method} {target_url}: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": "Media Relay Internal Error", "detail": str(e)}
        )


# 1. Routes under /videoStream/
@app.api_route("/videoStream/{path:path}", methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"])
async def video_stream_proxy(request: Request, path: str):
    # If path starts with stream/player or just streamName, forward to upstream accordingly
    upstream_path = path
    return await proxy_to_upstream(request, upstream_path)


# 2. Routes under /stream/ (for WHEP session URLs and direct stream paths)
@app.api_route("/stream/{path:path}", methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"])
async def stream_proxy(request: Request, path: str):
    upstream_path = f"stream/{path}"
    return await proxy_to_upstream(request, upstream_path)


# 3. Direct WHEP routes under /webrtc/
@app.api_route("/webrtc/{path:path}", methods=["GET", "POST", "OPTIONS", "PATCH", "DELETE", "HEAD"])
async def webrtc_proxy(request: Request, path: str):
    # e.g., /webrtc/DOWN_CAMERA/whep -> {UPSTREAM_MEDIA_SERVER}/stream/player/DOWN_CAMERA/whep
    if not path.startswith("stream/"):
        upstream_path = f"stream/player/{path}"
    else:
        upstream_path = path
    return await proxy_to_upstream(request, upstream_path)
