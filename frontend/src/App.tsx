import React, { useEffect, useState } from "react";
import { UnifiedMapViewer3D, RobotRecord } from "./components/viewer3d/UnifiedMapViewer3D";
import { OpenCVStudioPanel, MapCalibrationModal } from "./components/ShowcasePanels";

export const App: React.FC = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [mapData, setMapData] = useState<any>(null);
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("flag-01");
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [visionFrame, setVisionFrame] = useState<any>(null);
  const [showCalibModal, setShowCalibModal] = useState<boolean>(false);
  const [dnsQuery, setDnsQuery] = useState<string>("#all");

  const fetchInitialData = async () => {
    try {
      const [slidesRes, mapRes, telRes] = await Promise.all([
        fetch("/api/v1/slides").then((r) => r.json()),
        fetch("/api/v1/maps/unified3d").then((r) => r.json()),
        fetch("/api/v1/telemetry").then((r) => r.json()),
      ]);
      if (slidesRes?.slides) setSlides(slidesRes.slides);
      if (mapRes) setMapData(mapRes);
      if (telRes?.robots) setRobots(telRes.robots);
      if (telRes?.api_logs) setApiLogs(telRes.api_logs);
    } catch (e) {
      console.error("Initial load error:", e);
    }
  };

  const requestVisionFrame = async (target: string, mode: string) => {
    try {
      const res = await fetch("/api/v1/vision/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, mode }),
      }).then((r) => r.json());
      setVisionFrame(res);
    } catch (e) {
      console.error("Vision error:", e);
    }
  };

  useEffect(() => {
    fetchInitialData();
    requestVisionFrame("flagship.robot.local", "rack_roi_led");

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${window.location.host}/ws/showcase`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "TELEMETRY_TICK") {
          setRobots(msg.robots || []);
          if (msg.api_logs) setApiLogs(msg.api_logs);
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  const currentSlide = slides[currentSlideIdx] || {
    number: "01",
    title: "멀티 로봇 라인업 & 물리 기구학 비교",
    subtitle: "Flagship · Professional · Power",
    highlights: [],
    featured_apis: [],
  };

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];

  const triggerFeaturedApi = async (apiItem: any) => {
    try {
      const opts: RequestInit = {
        method: apiItem.method || "POST",
        headers: { "Content-Type": "application/json" },
      };
      if (apiItem.method === "POST") {
        opts.body = JSON.stringify(apiItem.sample_body || {});
      }
      const res = await fetch(apiItem.endpoint, opts).then((r) => r.json());
      if (apiItem.endpoint.includes("/vision/process")) {
        setVisionFrame(res);
      }
      const tel = await fetch("/api/v1/telemetry").then((r) => r.json());
      if (tel?.robots) setRobots(tel.robots);
      if (tel?.api_logs) setApiLogs(tel.api_logs);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGroundClick = async (wx: number, wy: number) => {
    const targetHost = selectedRobot?.hostname || "flagship.robot.local";
    await fetch(`/api/v1/robots/${encodeURIComponent(targetHost)}/navigate/world`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        world_x: wx,
        world_y: wy,
        world_yaw_deg: 0,
        move_mode: 1,
      }),
    });
  };

  const handleSaveAlignment = async (newTransforms: any, wallHeight: number) => {
    const res = await fetch("/api/v1/maps/alignment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transforms: newTransforms,
        wall_extrusion_height_m: wallHeight,
      }),
    }).then((r) => r.json());
    if (res?.alignment) {
      const updatedMap = await fetch("/api/v1/maps/unified3d").then((r) => r.json());
      setMapData(updatedMap);
    }
    setShowCalibModal(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100vw", height: "100vh", background: "#070b14" }}>
      {/* Top Presentation Header Bar */}
      <header
        style={{
          height: 54,
          background: "#0b1120",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              background: "linear-gradient(135deg, #00f2fe, #4facfe)",
              color: "#020617",
              fontWeight: 900,
              padding: "4px 10px",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            MOSS ROBOTICS
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#f8fafc" }}>
            API & OpenCV 3D Live Showcase Deck
          </div>

          {/* Slide Selector Pills */}
          <div style={{ display: "flex", gap: 4, marginLeft: 12 }}>
            {slides.map((s, idx) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlideIdx(idx)}
                style={{
                  background: idx === currentSlideIdx ? "#0284c7" : "#1e293b",
                  color: idx === currentSlideIdx ? "#fff" : "#94a3b8",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  fontWeight: idx === currentSlideIdx ? 700 : 500,
                  cursor: "pointer",
                }}
              >
                {s.number}. {s.title.slice(0, 10)}..
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls: DNS Resolver Bar & Map Alignment Button */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 6,
              padding: "3px 8px",
              fontSize: 12,
            }}
          >
            <span style={{ color: "#38bdf8", marginRight: 6, fontWeight: 700 }}>DNS/Tag:</span>
            <input
              value={dnsQuery}
              onChange={(e) => setDnsQuery(e.target.value)}
              placeholder="flagship.robot.local or #4wd-steering"
              style={{
                background: "transparent",
                border: "none",
                color: "#f8fafc",
                outline: "none",
                width: 175,
                fontSize: 12,
              }}
            />
          </div>

          <button
            onClick={() => setShowCalibModal(true)}
            style={{
              background: "#1e293b",
              color: "#38bdf8",
              border: "1px solid #38bdf8",
              borderRadius: 6,
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            🧭 map.pgm 좌표계 정합 (SE2)
          </button>
        </div>
      </header>

      {/* Main 3-Column Interactive Slide Stage */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "410px 1fr 440px", overflow: "hidden" }}>
        {/* Left Column: Storytelling PPT Slide Content + Hardware Spec + One-Click API Triggers */}
        <div
          style={{
            background: "#090f1d",
            borderRight: "1px solid #1e293b",
            padding: 18,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
          }}
        >
          <div style={{ color: "#38bdf8", fontSize: 12, fontWeight: 700, letterSpacing: 1 }}>
            SLIDE {currentSlide.number} / 0{slides.length || 7}
          </div>
          <h2 style={{ margin: "6px 0 4px 0", fontSize: 20, color: "#f8fafc", lineHeight: 1.3 }}>
            {currentSlide.title}
          </h2>
          <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
            {currentSlide.subtitle}
          </div>

          {/* Slide Highlights */}
          <div
            style={{
              background: "#0f172a",
              border: "1px solid #1e293b",
              borderRadius: 10,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
              📌 핵심 아키텍처 & 기술 포인트
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#cbd5e1", lineHeight: 1.65 }}>
              {(currentSlide.highlights || []).map((h: string, i: number) => (
                <li key={i} style={{ marginBottom: 6 }}>
                  {h}
                </li>
              ))}
            </ul>
          </div>

          {/* Robot DNS Selector Cards */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>
            🤖 DNS 레지스트리 로봇 선택 & 실시간 하드웨어 제원
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {robots.map((r) => {
              const active = r.id === selectedRobotId;
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    setSelectedRobotId(r.id);
                    requestVisionFrame(r.hostname, r.id === "power-01" ? "thermal_hotspot" : "rack_roi_led");
                  }}
                  style={{
                    background: active ? "rgba(14, 165, 233, 0.14)" : "#0f172a",
                    border: `1.5px solid ${active ? r.color : "#1e293b"}`,
                    borderRadius: 8,
                    padding: 10,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 700, color: r.color, fontSize: 13 }}>
                      {r.display_name} ({r.hostname})
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>IP: {r.ip}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 4 }}>
                    치수: {r.kinematics.length_m}×{r.kinematics.width_m}×{r.kinematics.height_m}m | 구동:{" "}
                    {r.kinematics.drive_type}
                  </div>
                  <div style={{ fontSize: 11, color: "#38bdf8", marginTop: 3 }}>
                    FSM: {r.telemetry?.fsm_state} | Lift: {r.telemetry?.lift_height_m}m | PTZ Zoom:{" "}
                    {r.telemetry?.ptz_zoom}x
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          background: "#1e293b",
                          color: "#94a3b8",
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Slide-Specific Live API Action Triggers */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>
            ⚡ 현재 슬라이드 연동 API 원클릭 실행 (Live Action)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(currentSlide.featured_apis || []).map((apiItem: any, idx: number) => (
              <button
                key={idx}
                onClick={() => triggerFeaturedApi(apiItem)}
                style={{
                  background: "linear-gradient(90deg, #0284c7, #0369a1)",
                  color: "#fff",
                  border: "1px solid #38bdf8",
                  borderRadius: 8,
                  padding: "10px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 12.5 }}>▶ {apiItem.label}</div>
                <div style={{ fontSize: 10.5, color: "#bae6fd", marginTop: 3, fontFamily: "monospace" }}>
                  {apiItem.method} {apiItem.endpoint}
                </div>
              </button>
            ))}
          </div>

          {/* Prev / Next Slide Footer Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", paddingTop: 14 }}>
            <button
              disabled={currentSlideIdx === 0}
              onClick={() => setCurrentSlideIdx((i) => Math.max(0, i - 1))}
              style={{
                background: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "7px 14px",
                cursor: "pointer",
              }}
            >
              ◀ 이전 슬라이드
            </button>
            <button
              disabled={currentSlideIdx >= slides.length - 1}
              onClick={() => setCurrentSlideIdx((i) => Math.min(slides.length - 1, i + 1))}
              style={{
                background: "#0284c7",
                color: "#f8fafc",
                border: "none",
                borderRadius: 6,
                padding: "7px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              다음 슬라이드 ▶
            </button>
          </div>
        </div>

        {/* Center Column: Unified 3D Isometric Map.pgm Digital Twin Viewer */}
        <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <UnifiedMapViewer3D
              mapData={mapData}
              robots={robots}
              selectedRobotId={selectedRobotId}
              onSelectRobot={(id) => setSelectedRobotId(id)}
              onGroundClick={handleGroundClick}
            />
          </div>

          {/* Quick Hardware Control Deck at Bottom of 3D View */}
          <div
            style={{
              height: 62,
              background: "#0b1120",
              borderTop: "1px solid #1e293b",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 16px",
            }}
          >
            <div style={{ fontSize: 12, color: "#cbd5e1" }}>
              조작 대상:{" "}
              <b style={{ color: selectedRobot?.color || "#38bdf8" }}>
                {selectedRobot?.hostname} ({selectedRobot?.display_name})
              </b>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() =>
                  triggerFeaturedApi({
                    method: "POST",
                    endpoint: `/api/v1/robots/${selectedRobot?.hostname}/control/lifter`,
                    sample_body: { action: 1, targetHeight: 1650 },
                  })
                }
                style={{
                  background: "#1e293b",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                ⬆️ 리프트 1.65m 상승
              </button>
              <button
                onClick={() =>
                  triggerFeaturedApi({
                    method: "POST",
                    endpoint: `/api/v1/robots/${selectedRobot?.hostname}/control/lifter`,
                    sample_body: { action: 1, targetHeight: 200 },
                  })
                }
                style={{
                  background: "#1e293b",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                ⬇️ 리프트 원점 하강
              </button>
              <button
                onClick={() =>
                  triggerFeaturedApi({
                    method: "POST",
                    endpoint: `/api/v1/robots/${selectedRobot?.hostname}/control/ptzAction`,
                    sample_body: { ptzCommand: "TURN_LEFT", speed: 4, zoom: 12 },
                  })
                }
                style={{
                  background: "#1e293b",
                  color: "#f8fafc",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                🔄 PTZ 회전 & 줌
              </button>
              <button
                onClick={() =>
                  triggerFeaturedApi({
                    method: "POST",
                    endpoint: `/api/v1/robots/pro.robot.local/control/armDoor`,
                    sample_body: { command: "open_door", door_type: 1 },
                  })
                }
                style={{
                  background: "#4c1d95",
                  color: "#f8fafc",
                  border: "1px solid #a855f7",
                  borderRadius: 6,
                  padding: "6px 10px",
                  fontSize: 11.5,
                  cursor: "pointer",
                }}
              >
                🦾 Pro 6축 로봇암 도어 개방
              </button>
              <button
                onClick={() =>
                  triggerFeaturedApi({
                    method: "POST",
                    endpoint: `/api/v1/robots/${selectedRobot?.hostname}/control/emergencyStop`,
                    sample_body: { stop: !selectedRobot?.telemetry?.is_stop },
                  })
                }
                style={{
                  background: selectedRobot?.telemetry?.is_stop ? "#16a34a" : "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "6px 12px",
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {selectedRobot?.telemetry?.is_stop ? "▶ 인터락 해제" : "🛑 비상정지 (/isStop)"}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Top = OpenCV Vision Studio | Bottom = Live API Request/Response Packet Inspector */}
        <div style={{ display: "grid", gridTemplateRows: "52% 48%", height: "100%", overflow: "hidden" }}>
          <OpenCVStudioPanel
            robots={robots}
            selectedRobotId={selectedRobotId}
            visionFrame={visionFrame}
            onRequestVision={requestVisionFrame}
          />

          {/* Live API Packet Inspector */}
          <div
            style={{
              background: "#070b14",
              borderLeft: "1px solid #1e293b",
              borderTop: "1px solid #1e293b",
              padding: 12,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>
              📡 Live API & WebSocket Packet Inspector (규격 생중계)
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {apiLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 6,
                    padding: 8,
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#38bdf8" }}>
                    <span>
                      <b>[{log.method}]</b> {log.endpoint}
                    </span>
                    <span style={{ color: "#94a3b8" }}>
                      {log.timestamp} ({log.latency_ms}ms)
                    </span>
                  </div>
                  <div style={{ color: "#cbd5e1", marginTop: 4 }}>
                    <span style={{ color: "#64748b" }}>REQ: </span>
                    {JSON.stringify(log.request_body)}
                  </div>
                  <div style={{ color: "#4ade80", marginTop: 2 }}>
                    <span style={{ color: "#64748b" }}>RES: </span>
                    {JSON.stringify(log.response_body).slice(0, 180)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showCalibModal && (
        <MapCalibrationModal
          alignment={mapData?.alignment}
          onClose={() => setShowCalibModal(false)}
          onSave={handleSaveAlignment}
        />
      )}
    </div>
  );
};
