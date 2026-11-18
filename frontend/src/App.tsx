import React, { useEffect, useState } from "react";
import { UnifiedMapViewer3D, RobotRecord } from "./components/viewer3d/UnifiedMapViewer3D";
import { MapCalibrationModal } from "./components/ShowcasePanels";

export const App: React.FC = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [mapData, setMapData] = useState<any>(null);
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("flag-01");
  const [apiLogs, setApiLogs] = useState<any[]>([]);
  const [visionFrame, setVisionFrame] = useState<any>(null);
  const [visionMode, setVisionMode] = useState<string>("rack_roi_led");
  const [showCalibModal, setShowCalibModal] = useState<boolean>(false);
  const [showApiDrawer, setShowApiDrawer] = useState<boolean>(false);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);

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
      setVisionMode(mode);
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

  // Keyboard navigation (Arrow Left / Right) just like a real presentation deck
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        setCurrentSlideIdx((i) => Math.min((slides.length || 7) - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setCurrentSlideIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length]);

  const totalSlides = slides.length || 7;
  const currentSlide = slides[currentSlideIdx] || {
    number: "01",
    title: "멀티 로봇 라인업 & 물리 기구학 비교",
    subtitle: "Flagship V2.1 · Professional V3.5 · Power V3.0",
    highlights: [],
    featured_apis: [],
  };

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];
  const latestLog = apiLogs[0];

  const triggerFeaturedApi = async (apiItem: any, stepIdx = 0) => {
    setActiveStepIdx(stepIdx);
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

  // Highlight the last part of the slide title in Crimson Red (#FF3B30) like the YouTube seminar
  const renderStyledTitle = (title: string) => {
    const parts = title.split("&");
    if (parts.length > 1) {
      return (
        <>
          {parts[0]} &<br />
          <span style={{ color: "#ff3b30" }}>{parts[1].trim()}.</span>
        </>
      );
    }
    const words = title.split(" ");
    if (words.length <= 2) return <span>{title}</span>;
    const head = words.slice(0, -2).join(" ");
    const tail = words.slice(-2).join(" ");
    return (
      <>
        {head}
        <br />
        <span style={{ color: "#ff3b30" }}>{tail}.</span>
      </>
    );
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a0a0c",
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "36px 56px 28px 56px",
        position: "relative",
         userSelect: "none",
      }}
    >
      {/* Far-Right Vertical Ruler Tick Scale (Rookiss Slide Signature) */}
      <div
        style={{
          position: "fixed",
          right: 14,
          top: 60,
          bottom: 60,
          width: 10,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          pointerEvents: "none",
          opacity: 0.45,
        }}
      >
        {Array.from({ length: 42 }).map((_, idx) => {
          const isCurrent = Math.round((currentSlideIdx / (totalSlides - 1)) * 41) === idx;
          return (
            <div
              key={idx}
              style={{
                height: isCurrent ? 3 : 1,
                width: isCurrent ? 12 : idx % 5 === 0 ? 8 : 4,
                background: isCurrent ? "#ff3b30" : "#52525b",
                alignSelf: "flex-end",
                transition: "all 0.25s ease",
              }}
            />
          );
        })}
      </div>

      {/* Top Slide Header: Left Pill Badge + Right Segmented Progress Bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#a1a1aa" }}>
            섹션 <b style={{ color: "#ffffff" }}>0{currentSlideIdx + 1}</b> / 0{totalSlides}
          </span>
          <span
            style={{
              background: "#18181b",
              border: "1px solid #27272a",
              color: "#e4e4e7",
              padding: "6px 14px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {currentSlide.subtitle}
          </span>
        </div>

        {/* Segmented Dash Progress Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {slides.map((s, idx) => {
            const active = idx === currentSlideIdx;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentSlideIdx(idx)}
                title={s.title}
                style={{
                  width: active ? 42 : 22,
                  height: 6,
                  borderRadius: 99,
                  background: active ? "#ff3b30" : "#27272a",
                  border: "none",
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Center Single-Canvas Slide Stage (Changes cleanly per slide!) */}
      <div
        key={currentSlide.id || currentSlideIdx}
        className="slide-enter"
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "44% 56%",
          gap: 48,
          alignItems: "center",
          margin: "20px 0",
          minHeight: 0,
        }}
      >
        {/* Left Story & Interactive Checklist Column */}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ color: "#ff3b30", fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
            MOSS ROBOTICS · LIVE API ARCHITECTURE
          </div>

          <h1
            style={{
              fontSize: 44,
              fontWeight: 800,
              lineHeight: 1.22,
              margin: "0 0 24px 0",
              letterSpacing: "-0.035em",
            }}
          >
            {renderStyledTitle(currentSlide.title)}
          </h1>

          {/* Quote / Core Thesis Box */}
          <div
            style={{
              background: "#141417",
              borderLeft: "4px solid #ff3b30",
              borderRadius: "0 14px 14px 0",
              padding: "18px 22px",
              marginBottom: 26,
            }}
          >
            {(currentSlide.highlights || []).map((line: string, i: number) => (
              <div
                key={i}
                style={{
                  fontSize: 15,
                  color: i === 0 ? "#ffffff" : "#a1a1aa",
                  fontWeight: i === 0 ? 700 : 500,
                  lineHeight: 1.6,
                  marginBottom: i < currentSlide.highlights.length - 1 ? 8 : 0,
                }}
              >
                • {line}
              </div>
            ))}
          </div>

          {/* Numbered Interactive Action Steps (01, 02, 03...) */}
          <div style={{ fontSize: 12, fontWeight: 700, color: "#71717a", marginBottom: 10 }}>
            클릭하여 실제 로봇 API & 시각화를 즉시 실행하세요
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(currentSlide.featured_apis || []).map((apiItem: any, idx: number) => {
              const isSelectedStep = activeStepIdx === idx;
              return (
                <button
                  key={idx}
                  onClick={() => triggerFeaturedApi(apiItem, idx)}
                  style={{
                    background: isSelectedStep ? "#18181c" : "transparent",
                    border: `1.5px solid ${isSelectedStep ? "#ff3b30" : "#27272a"}`,
                    borderRadius: 14,
                    padding: "14px 18px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    color: "#ffffff",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span
                      style={{
                        color: "#ff3b30",
                        fontWeight: 800,
                        fontSize: 15,
                      }}
                    >
                      0{idx + 1}
                    </span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{apiItem.label}</div>
                      <div style={{ fontSize: 12, color: "#71717a", marginTop: 2, fontFamily: "monospace" }}>
                        {apiItem.method} {apiItem.endpoint}
                      </div>
                    </div>
                  </div>
                  <span
                    style={{
                      background: "#ff3b30",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "6px 12px",
                      borderRadius: 8,
                    }}
                  >
                    실행 ✓
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Visual Canvas Column (Tailored to each slide's theme, never cramped!) */}
        <div style={{ height: "100%", maxHeight: "72vh", display: "flex", flexDirection: "column" }}>
          {/* Slide 01 & 02: Clean E-Commerce / Daangn-style Robot Lineup & Architecture Cards */}
          {(currentSlideIdx === 0 || currentSlideIdx === 1) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", justifyContent: "center" }}>
              {robots.map((r) => {
                const isLive = r.telemetry?.online_mode === "LIVE_REDIS_SYNC";
                const isSelected = r.id === selectedRobotId;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRobotId(r.id)}
                    style={{
                      background: "#141417",
                      border: `2px solid ${isSelected ? "#ff3b30" : "#222226"}`,
                      borderRadius: 18,
                      padding: "20px 24px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{
                            background: isLive ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                            color: isLive ? "#4ade80" : "#fbbf24",
                            fontSize: 12,
                            fontWeight: 800,
                            padding: "4px 10px",
                            borderRadius: 99,
                          }}
                        >
                          {isLive ? "● 실시간 로봇 연동됨" : "● 시뮬레이션 대기"}
                        </span>
                        <span style={{ fontSize: 20, fontWeight: 800 }}>{r.display_name}</span>
                        <span style={{ fontSize: 13, color: "#71717a", fontWeight: 600 }}>{r.hostname}</span>
                      </div>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#ff3b30" }}>
                        🔋 {r.telemetry?.battery_pct}% ({r.telemetry?.voltage_v || 28.0}V)
                      </span>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1fr",
                        gap: 12,
                        marginTop: 14,
                        background: "#0d0d10",
                        padding: "12px 16px",
                        borderRadius: 12,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 11, color: "#71717a" }}>실제 로봇 현위치 (Redis)</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                          {r.telemetry?.position_name || "충전소"} ({r.telemetry?.local_x}m, {r.telemetry?.local_y}m)
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#71717a" }}>실측 크기 & 구동계</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                          {r.kinematics.length_m}×{r.kinematics.width_m}×{r.kinematics.height_m}m ·{" "}
                          {r.model_type === "ult_diff" ? "2륜 차동" : "4륜 독립조향"}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: "#71717a" }}>상부 리프트 & 특화 기구</div>
                        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2, color: "#ff3b30" }}>
                          리프트 {r.telemetry?.lift_height_m}m ·{" "}
                          {r.id === "pro-01" ? "6축 로봇암" : r.id === "power-01" ? "25x PTZ/부분방전" : "고속 RFID/듀얼열화상"}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Slide 03: API Auth & SHA-512 3088-Round Live Showcase Card */}
          {currentSlideIdx === 2 && (
            <div
              style={{
                background: "#141417",
                border: "1.5px solid #27272a",
                borderRadius: 20,
                padding: 28,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
                  <span
                    style={{
                      background: "#ff3b30",
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: 800,
                      padding: "4px 10px",
                      borderRadius: 6,
                    }}
                  >
                    AUTH PIPELINE
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    평문 암호 ➔ SHA-512 (3088회 반복) ➔ JWT Token 발급 ➔ WebSocket 구독
                  </span>
                </div>

                {/* Horizontal Flow Pills like Rookiss 12:46 slide */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  {["1. 평문 입력", "2. SHA-512 × 3088회", "3. POST /api/v1/auth/login", "4. data.Token 발급"].map(
                    (step, i) => (
                      <React.Fragment key={step}>
                        <div
                          style={{
                            background: i === 3 ? "rgba(255,59,48,0.15)" : "#0d0d10",
                            border: `1.5px solid ${i === 3 ? "#ff3b30" : "#27272a"}`,
                            color: i === 3 ? "#ff3b30" : "#e4e4e7",
                            padding: "10px 14px",
                            borderRadius: 10,
                            fontSize: 13,
                            fontWeight: 700,
                          }}
                        >
                          {step}
                        </div>
                        {i < 3 && <span style={{ color: "#ff3b30", fontWeight: 800 }}>›</span>}
                      </React.Fragment>
                    )
                  )}
                </div>
              </div>

              {/* Live Request / Response Card */}
              <div
                style={{
                  flex: 1,
                  background: "#0a0a0c",
                  border: "1px solid #27272a",
                  borderRadius: 14,
                  padding: 20,
                  fontFamily: "monospace",
                  fontSize: 13,
                  overflowY: "auto",
                }}
              >
                <div style={{ color: "#ff3b30", fontWeight: 700, marginBottom: 8 }}>
                  {latestLog ? `[${latestLog.method}] ${latestLog.endpoint} (${latestLog.latency_ms}ms)` : "좌측 [01 실행] 버튼을 눌러 실제 로봇 토큰을 발급받으세요"}
                </div>
                <div style={{ color: "#a1a1aa", marginBottom: 12 }}>
                  REQ: {JSON.stringify(latestLog?.request_body || { account: "super", password: "<3088-round-sha512>" }, null, 2)}
                </div>
                <div style={{ color: "#4ade80" }}>
                  RES: {JSON.stringify(latestLog?.response_body || { code: 0, msg: "操作成功" }, null, 2)}
                </div>
              </div>
            </div>
          )}

          {/* Slide 04, 06, 07: Full-Stage 3D Isometric Digital Twin Map */}
          {(currentSlideIdx === 3 || currentSlideIdx === 5 || currentSlideIdx === 6) && (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ flex: 1, minHeight: 0 }}>
                <UnifiedMapViewer3D
                  mapData={mapData}
                  robots={robots}
                  selectedRobotId={selectedRobotId}
                  onSelectRobot={(id) => setSelectedRobotId(id)}
                  onGroundClick={handleGroundClick}
                />
              </div>

              {/* Clean Pill Control Bar under 3D Map */}
              <div
                style={{
                  background: "#141417",
                  border: "1px solid #27272a",
                  borderRadius: 14,
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  {robots.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRobotId(r.id)}
                      style={{
                        background: r.id === selectedRobotId ? "#ff3b30" : "#1f1f23",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "7px 12px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {r.display_name} ({r.telemetry?.local_x}m, {r.telemetry?.local_y}m)
                    </button>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setShowCalibModal(true)}
                    style={{
                      background: "#1f1f23",
                      color: "#e4e4e7",
                      border: "1px solid #3f3f46",
                      borderRadius: 8,
                      padding: "7px 12px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    🧭 SE(2) 맵 정합 설정
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Slide 05: Full-Stage OpenCV AI Vision Studio */}
          {currentSlideIdx === 4 && (
            <div
              style={{
                background: "#141417",
                border: "1.5px solid #27272a",
                borderRadius: 20,
                padding: 20,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 16, fontWeight: 800 }}>
                  👁️ 실시간 OpenCV 비전 파이프라인 ({selectedRobot?.display_name})
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { id: "rack_roi_led", label: "42U 서버랙 ROI & LED 검출" },
                    { id: "thermal_hotspot", label: "열화상 INFERNO 핫스팟" },
                    { id: "canny_hud", label: "Canny 엣지 & 3D 도어핸들" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => requestVisionFrame(selectedRobot?.hostname || "flagship.robot.local", m.id)}
                      style={{
                        background: visionMode === m.id ? "#ff3b30" : "#27272a",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "7px 14px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  flex: 1,
                  background: "#09090b",
                  borderRadius: 14,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {visionFrame?.image_base64 && (
                  <img
                    src={visionFrame.image_base64}
                    alt="OpenCV Frame"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                )}
              </div>

              {visionFrame?.metrics && (
                <div style={{ display: "flex", gap: 16, fontSize: 13, color: "#a1a1aa" }}>
                  {Object.entries(visionFrame.metrics).map(([k, v]) => (
                    <div key={k}>
                      <b style={{ color: "#fff" }}>{k}:</b>{" "}
                      <span style={{ color: "#ff3b30", fontWeight: 700 }}>{JSON.stringify(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Minimal Seminar Footer Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid #18181b",
          paddingTop: 14,
          fontSize: 13,
          color: "#71717a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontWeight: 800, color: "#ffffff" }}>♟️ MOSS AI Robotics</span>
          <span>
            실시간 Redis 좌표 동기화: Flagship ({robots[0]?.telemetry?.local_x}m, {robots[0]?.telemetry?.local_y}m ·{" "}
            {robots[0]?.telemetry?.position_name}) | Power ({robots[2]?.telemetry?.local_x}m,{" "}
            {robots[2]?.telemetry?.local_y}m · {robots[2]?.telemetry?.position_name})
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setShowApiDrawer((v) => !v)}
            style={{
              background: showApiDrawer ? "#ff3b30" : "#18181b",
              color: "#ffffff",
              border: "1px solid #27272a",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {showApiDrawer ? "닫기 ✕" : `📡 최근 API 패킷 로그 (${apiLogs.length})`}
          </button>

          <button
            disabled={currentSlideIdx === 0}
            onClick={() => setCurrentSlideIdx((i) => Math.max(0, i - 1))}
            style={{
              background: "#18181b",
              color: "#ffffff",
              border: "1px solid #27272a",
              borderRadius: 8,
              padding: "6px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ← 이전 장표
          </button>
          <button
            disabled={currentSlideIdx >= totalSlides - 1}
            onClick={() => setCurrentSlideIdx((i) => Math.min(totalSlides - 1, i + 1))}
            style={{
              background: "#ff3b30",
              color: "#ffffff",
              border: "none",
              borderRadius: 8,
              padding: "6px 16px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            다음 장표 →
          </button>
          <span style={{ marginLeft: 8, fontFamily: "monospace", color: "#52525b" }}>
            00{currentSlideIdx + 1}
          </span>
        </div>
      </div>

      {/* Collapsible Live API Packet Drawer (Only opens when clicked!) */}
      {showApiDrawer && (
        <div
          style={{
            position: "fixed",
            right: 48,
            bottom: 72,
            width: 560,
            maxHeight: 360,
            background: "#141417",
            border: "1.5px solid #ff3b30",
            borderRadius: 16,
            padding: 18,
            boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
            overflowY: "auto",
            zIndex: 900,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 10, color: "#ff3b30" }}>
            📡 실시간 API 호출 & 응답 패킷 히스토리
          </div>
          {apiLogs.map((log) => (
            <div
              key={log.id}
              style={{
                background: "#0a0a0c",
                borderRadius: 10,
                padding: 10,
                marginBottom: 8,
                fontSize: 12,
                fontFamily: "monospace",
              }}
            >
              <div style={{ color: "#ffffff", fontWeight: 700 }}>
                [{log.method}] {log.endpoint} <span style={{ color: "#71717a" }}>({log.timestamp})</span>
              </div>
              <div style={{ color: "#a1a1aa", marginTop: 4 }}>REQ: {JSON.stringify(log.request_body)}</div>
              <div style={{ color: "#4ade80", marginTop: 2 }}>
                RES: {JSON.stringify(log.response_body).slice(0, 160)}
              </div>
            </div>
          ))}
        </div>
      )}

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
