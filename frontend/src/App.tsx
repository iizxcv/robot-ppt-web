import React, { useEffect, useState } from "react";
import { UnifiedMapViewer3D, RobotRecord } from "./components/viewer3d/UnifiedMapViewer3D";
import { MapCalibrationModal } from "./components/ShowcasePanels";

export const App: React.FC = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [isCurtainSweeping, setIsCurtainSweeping] = useState<boolean>(false);
  const [mapData, setMapData] = useState<any>(null);
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("flag-01");
  const [visionFrame, setVisionFrame] = useState<any>(null);
  const [visionMode, setVisionMode] = useState<string>("rack_roi_led");
  const [showCalibModal, setShowCalibModal] = useState<boolean>(false);

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
        }
      } catch {}
    };
    return () => ws.close();
  }, []);

  // Theatrical Curtain Call / Dynamic Slide Transition Handler
  const navigateToSlide = (targetIdx: number) => {
    if (targetIdx === currentSlideIdx || targetIdx < 0 || targetIdx >= (slides.length || 6)) return;
    setIsCurtainSweeping(true);
    setTimeout(() => {
      setCurrentSlideIdx(targetIdx);
    }, 240);
    setTimeout(() => {
      setIsCurtainSweeping(false);
    }, 620);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        navigateToSlide(currentSlideIdx + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        navigateToSlide(currentSlideIdx - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlideIdx, slides.length]);

  const totalSlides = slides.length || 6;
  const currentSlide = slides[currentSlideIdx] || {
    number: "01",
    nav_label: "가상 공간 통합 관제 (3D Twin)",
    title: "실제 물리 공간의 완벽한 3D 디지털 트윈 가상화",
    subtitle: "Virtual Space Command Center · Multi-Robot Live Telemetry",
    highlights: [],
  };

  const selectedRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];

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

  const renderStyledTitle = (title: string) => {
    const words = title.split(" ");
    if (words.length <= 2) return <span>{title}</span>;
    const head = words.slice(0, -2).join(" ");
    const tail = words.slice(-2).join(" ");
    return (
      <>
        {head}{" "}
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
        display: "grid",
        gridTemplateColumns: "290px 1fr",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Curtain Call Sweep Effect Overlay */}
      {isCurtainSweeping && <div className="curtain-sweep" />}

      {/* Left Sidebar Table of Contents (TOC) */}
      <aside
        style={{
          background: "#0f0f13",
          borderRight: "1px solid #1f1f26",
          padding: "28px 20px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 20,
        }}
      >
        <div>
          {/* Brand Logo Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: "#ff3b30",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              M
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>MOSS DIGITAL TWIN</div>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>VIRTUAL SPACE COMMAND</div>
            </div>
          </div>

          <div
            style={{
              height: 1,
              background: "#1f1f26",
              margin: "18px 0",
            }}
          />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", marginBottom: 10, paddingLeft: 6 }}>
            PRESENTATION CHAPTERS
          </div>

          {/* Interactive Chapter Items */}
          <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {slides.map((s, idx) => {
              const active = idx === currentSlideIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => navigateToSlide(idx)}
                  style={{
                    background: active ? "rgba(255, 59, 48, 0.14)" : "transparent",
                    border: `1.5px solid ${active ? "#ff3b30" : "transparent"}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                    textAlign: "left",
                    color: active ? "#ffffff" : "#a1a1aa",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: active ? "#ff3b30" : "#52525b",
                      fontFamily: "monospace",
                    }}
                  >
                    {s.number}
                  </span>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: active ? 800 : 600,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {s.nav_label || s.title}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Live Robot Status Mini Summary in Sidebar */}
        <div
          style={{
            background: "#141419",
            border: "1px solid #23232b",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "#a1a1aa" }}>실시간 공간 동기화 로봇</span>
            <button
              onClick={() => setShowCalibModal(true)}
              style={{
                background: "#27272a",
                color: "#e4e4e7",
                border: "none",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 10.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              좌표 정합 설정
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {robots.map((r) => {
              const isLive = r.telemetry?.online_mode === "LIVE_REDIS_SYNC";
              return (
                <div
                  key={r.id}
                  onClick={() => setSelectedRobotId(r.id)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 12,
                    cursor: "pointer",
                    padding: "4px 6px",
                    borderRadius: 6,
                    background: r.id === selectedRobotId ? "rgba(255,255,255,0.05)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: isLive ? "#22c55e" : "#71717a",
                      }}
                    />
                    <span style={{ fontWeight: 700, color: r.color }}>{r.display_name.replace("MOSS ", "")}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "monospace" }}>
                    ({r.telemetry?.world_x?.toFixed(2)}, {r.telemetry?.world_y?.toFixed(2)})m
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </aside>

      {/* Main Dynamic Presentation Stage */}
      <main
        key={currentSlide.id || currentSlideIdx}
        className="stage-reveal"
        style={{
          padding: "32px 48px 26px 48px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Top Stage Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  background: "rgba(255, 59, 48, 0.16)",
                  color: "#ff3b30",
                  border: "1px solid rgba(255, 59, 48, 0.4)",
                  fontWeight: 800,
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 99,
                }}
              >
                CHAPTER {currentSlide.number}
              </span>
              <span style={{ fontSize: 13, color: "#a1a1aa", fontWeight: 600 }}>{currentSlide.subtitle}</span>
            </div>

            <div style={{ fontSize: 12, color: "#71717a" }}>
              좌측 목차를 클릭하거나 키보드 <b>← / →</b> 키로 장표를 전환하세요
            </div>
          </div>

          <h1
            style={{
              fontSize: 36,
              fontWeight: 800,
              margin: "0 0 14px 0",
              letterSpacing: "-0.035em",
              lineHeight: 1.2,
            }}
          >
            {renderStyledTitle(currentSlide.title)}
          </h1>

          {/* Concise Horizontal Key Takeaways Bar */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            {(currentSlide.highlights || []).map((h: string, i: number) => (
              <div
                key={i}
                style={{
                  background: "#131317",
                  borderLeft: i === 0 ? "3px solid #ff3b30" : "3px solid #27272a",
                  borderRadius: "0 10px 10px 0",
                  padding: "10px 14px",
                  fontSize: 12.5,
                  color: "#d4d4d8",
                  lineHeight: 1.5,
                }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Center Visual Canvas (Pure Virtualization & Monitoring - No Cluttered Control Buttons!) */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Slide 01: Full Virtual Space 3D Digital Twin */}
          {currentSlideIdx === 0 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 310px", gap: 16, minHeight: 0 }}>
              <UnifiedMapViewer3D
                mapData={mapData}
                robots={robots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={(id) => setSelectedRobotId(id)}
                showOdomVectors={false}
              />

              {/* Live Virtual Space Telemetry Feed (Read-Only Monitoring) */}
              <div
                style={{
                  background: "#131317",
                  border: "1px solid #222228",
                  borderRadius: 20,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  overflowY: "auto",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: "#ff3b30" }}>
                  📡 가상 공간 실시간 텔레메트리 관제
                </div>
                {robots.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRobotId(r.id)}
                    style={{
                      background: "#0b0b0e",
                      border: `1.5px solid ${r.id === selectedRobotId ? r.color : "#1f1f26"}`,
                      borderRadius: 14,
                      padding: 14,
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 800, fontSize: 14, color: r.color }}>{r.display_name}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#4ade80" }}>
                        🔋 {r.telemetry?.battery_pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#e4e4e7", marginTop: 6, fontWeight: 600 }}>
                      📍 {r.telemetry?.position_name}
                    </div>
                    <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4, fontFamily: "monospace" }}>
                      • Local(Odom): ({r.telemetry?.local_x?.toFixed(2)}, {r.telemetry?.local_y?.toFixed(2)})m
                      <br />• 3D Twin(보정): ({r.telemetry?.world_x?.toFixed(2)}, {r.telemetry?.world_y?.toFixed(2)})m
                      <br />• 리프트 높이: {r.telemetry?.lift_height_m}m
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Slide 02: map.yaml + Boot Odometry -> 3D World Space Calibration Pipeline */}
          {currentSlideIdx === 1 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "46% 54%", gap: 18, minHeight: 0 }}>
              <div
                style={{
                  background: "#131317",
                  border: "1px solid #222228",
                  borderRadius: 20,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#ff3b30", marginBottom: 12 }}>
                    🧭 로봇별 `map.yaml` 원점 + 부팅 오도메트리 ➔ 통합 3D 공간 정합표
                  </div>
                  <p style={{ fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.6, margin: "0 0 14px 0" }}>
                    각 로봇은 부팅 시점의 오도메트리(`odom`)와 자체 `map.yaml` 원점(`origin`)을 기준으로 현재 위치를 계산합니다.
                    따라서 단일 3D 가상 공간으로 통합할 때는 공통 설비(Rack 1~3, Glasswall)를 기준으로 산출한{" "}
                    <b style={{ color: "#fff" }}>SE(2) 좌표 보정값(ΔX, ΔY, ΔΘ)</b>이 실시간으로 적용됩니다.
                  </p>

                  {robots.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        background: "#0a0a0c",
                        border: "1px solid #222228",
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 13 }}>
                        <span style={{ color: r.color }}>{r.display_name} ({r.hostname})</span>
                        <span style={{ color: "#71717a", fontSize: 11 }}>{r.telemetry?.position_name}</span>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: 8,
                          marginTop: 8,
                          fontSize: 11.5,
                          fontFamily: "monospace",
                        }}
                      >
                        <div style={{ background: "#141418", padding: 8, borderRadius: 8 }}>
                          <div style={{ color: "#71717a", fontSize: 10 }}>1. map.yaml Origin</div>
                          <div style={{ color: "#e4e4e7", marginTop: 2 }}>
                            [{r.calibration?.map_origin?.[0] ?? -1.39}, {r.calibration?.map_origin?.[1] ?? -6.51}]
                          </div>
                        </div>
                        <div style={{ background: "#141418", padding: 8, borderRadius: 8 }}>
                          <div style={{ color: "#71717a", fontSize: 10 }}>2. 로봇 Local Odom</div>
                          <div style={{ color: "#fbbf24", marginTop: 2 }}>
                            ({r.telemetry?.local_x?.toFixed(2)}m, {r.telemetry?.local_y?.toFixed(2)}m)
                          </div>
                        </div>
                        <div style={{ background: "#141418", padding: 8, borderRadius: 8, border: "1px solid #ff3b30" }}>
                          <div style={{ color: "#ff3b30", fontSize: 10 }}>3. 통합 3D Twin 좌표</div>
                          <div style={{ color: "#4ade80", fontWeight: 800, marginTop: 2 }}>
                            ({r.telemetry?.world_x?.toFixed(2)}m, {r.telemetry?.world_y?.toFixed(2)}m)
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowCalibModal(true)}
                  style={{
                    background: "#ff3b30",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "11px 16px",
                    fontSize: 13,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  ⚙️ 웹 UI에서 로봇별 오도메트리/맵 좌표 보정값(ΔX, ΔY, ΔΘ) 미세 조정하기
                </button>
              </div>

              <UnifiedMapViewer3D
                mapData={mapData}
                robots={robots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={(id) => setSelectedRobotId(id)}
                showOdomVectors={true}
              />
            </div>
          )}

          {/* Slide 03: Robot Lineup & Real Kinematics Spec Cards */}
          {currentSlideIdx === 2 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, minHeight: 0 }}>
              {robots.map((r) => (
                <div
                  key={r.id}
                  style={{
                    background: "#131317",
                    border: `1.5px solid ${r.color}`,
                    borderRadius: 20,
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          color: r.color,
                          padding: "4px 10px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {r.model_code}
                      </span>
                      <span style={{ fontSize: 12, color: "#a1a1aa", fontFamily: "monospace" }}>{r.hostname}</span>
                    </div>

                    <h3 style={{ fontSize: 24, fontWeight: 800, margin: "14px 0 6px 0" }}>{r.display_name}</h3>
                    <div style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 18 }}>{r.kinematics.arm_type}</div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                      <div style={{ background: "#0b0b0e", padding: "10px 14px", borderRadius: 10 }}>
                        <span style={{ color: "#71717a" }}>실측 바디 치수 (L×W×H): </span>
                        <b style={{ color: "#fff" }}>
                          {r.kinematics.length_m}m × {r.kinematics.width_m}m × {r.kinematics.height_m}m
                        </b>
                      </div>
                      <div style={{ background: "#0b0b0e", padding: "10px 14px", borderRadius: 10 }}>
                        <span style={{ color: "#71717a" }}>구동 방식 & 축거: </span>
                        <b style={{ color: "#fff" }}>
                          {r.kinematics.drive_type} ({r.kinematics.wheel_base_m}m)
                        </b>
                      </div>
                      <div style={{ background: "#0b0b0e", padding: "10px 14px", borderRadius: 10 }}>
                        <span style={{ color: "#71717a" }}>라이다 TF & 리프트 범위: </span>
                        <b style={{ color: "#fff" }}>
                          Z={r.kinematics.laser_tf_xyz[2]}m / {r.kinematics.lift_range_m[0]}~{r.kinematics.lift_range_m[1]}m
                        </b>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                    {r.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          background: "#1f1f26",
                          color: "#d4d4d8",
                          fontSize: 11,
                          padding: "4px 9px",
                          borderRadius: 6,
                          fontWeight: 600,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Slide 04: Multi-PC & ROS Core Architecture Visual Flow */}
          {currentSlideIdx === 3 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, minHeight: 0 }}>
              {[
                {
                  title: "Upper-PC (상부 두뇌 · 192.168.10.100)",
                  badge: "SFTP :1002 / Dispatch :8888",
                  color: "#ff3b30",
                  items: [
                    "moss-dispatch: 7대 멀티프로세스 FSM & 스케줄러",
                    "moss-analytics: 온보드 AI 비전(:8083) & ROI 분석",
                    "Redis(:6379): position_info, chassis_info 실시간 상태 버스",
                    "MySQL(:3306) & RabbitMQ(:5672): 순찰 지점 DB 및 이벤트 큐",
                  ],
                },
                {
                  title: "Chassis-PC (하부 주행 · 192.168.10.120)",
                  badge: "ROS Master :11311 / SFTP :1004",
                  color: "#00f2fe",
                  items: [
                    "moss_navigation: map_server(map.pgm + map.yaml) 구동",
                    "Cartographer / AMCL: 부팅 오도메트리 + 라이다 위치 추정",
                    "move_base: 글로벌/로컬 경로 계획 및 자율 회피 주행",
                    "하부 안전 인터락: 초음파, 범퍼, 낙하 센서(0.08m) 즉각 감속",
                  ],
                },
                {
                  title: "Sensor & Arm-PC (말단 · 192.168.10.105)",
                  badge: "C++ /control_center 통합 노드",
                  color: "#a855f7",
                  items: [
                    "/control_center: 6축 로봇암 + 그리퍼 + 스텝모터 통합 시퀀서",
                    "3D 비전 서비스: /handle_detector, /cabinet_detector",
                    "/force_sensor/status: 6축 힘센서(임계치 2.5N) 과부하 보호",
                    "특수 센서: 부분방전(PD), SF6/H2S 가스, 열화상/광학 PTZ",
                  ],
                },
              ].map((pc) => (
                <div
                  key={pc.title}
                  style={{
                    background: "#131317",
                    border: "1.5px solid #222228",
                    borderRadius: 20,
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <span
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        color: pc.color,
                        fontSize: 12,
                        fontWeight: 800,
                        padding: "4px 10px",
                        borderRadius: 8,
                      }}
                    >
                      {pc.badge}
                    </span>
                    <h3 style={{ fontSize: 21, fontWeight: 800, margin: "14px 0 18px 0" }}>{pc.title}</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      {pc.items.map((it) => (
                        <div
                          key={it}
                          style={{
                            background: "#0b0b0e",
                            borderLeft: `3px solid ${pc.color}`,
                            padding: "12px 14px",
                            borderRadius: "0 10px 10px 0",
                            fontSize: 13,
                            color: "#e4e4e7",
                          }}
                        >
                          {it}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Slide 05: OpenCV & AI Vision Live Monitoring */}
          {currentSlideIdx === 4 && (
            <div
              style={{
                flex: 1,
                background: "#131317",
                border: "1.5px solid #222228",
                borderRadius: 20,
                padding: 20,
                display: "grid",
                gridTemplateColumns: "1fr 340px",
                gap: 18,
                minHeight: 0,
              }}
            >
              <div
                style={{
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
                    alt="OpenCV Stream"
                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  />
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>
                    👁️ OpenCV 실시간 비전 관제 채널
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      {
                        id: "rack_roi_led",
                        title: "01. 42U 서버 랙 ROI & HSV 상태등 판독",
                        desc: "/algoritmic_server/pro_roi 연동 및 녹색/적색 LED 마스킹",
                      },
                      {
                        id: "thermal_hotspot",
                        title: "02. 열화상 INFERNO 최고온도 Hotspot 추적",
                        desc: "듀얼 열화상 카메라 온도 행렬 minMaxLoc 실시간 감시",
                      },
                      {
                        id: "canny_hud",
                        title: "03. Canny 구조물 엣지 & 3D 핸들 포즈",
                        desc: "/handle_detector 기반 캐비닛 도어 개폐용 3D 좌표 추출",
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => requestVisionFrame(selectedRobot?.hostname || "flagship.robot.local", m.id)}
                        style={{
                          background: visionMode === m.id ? "rgba(255,59,48,0.16)" : "#0b0b0e",
                          border: `1.5px solid ${visionMode === m.id ? "#ff3b30" : "#222228"}`,
                          borderRadius: 12,
                          padding: 14,
                          textAlign: "left",
                          color: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13.5, color: visionMode === m.id ? "#ff3b30" : "#fff" }}>
                          {m.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#a1a1aa", marginTop: 4 }}>{m.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {visionFrame?.metrics && (
                  <div style={{ background: "#0b0b0e", borderRadius: 12, padding: 14, fontSize: 12 }}>
                    <div style={{ color: "#ff3b30", fontWeight: 800, marginBottom: 8 }}>실시간 OpenCV 분석 지표</div>
                    {Object.entries(visionFrame.metrics).map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ color: "#71717a" }}>{k}</span>
                        <span style={{ color: "#4ade80", fontWeight: 700, fontFamily: "monospace" }}>
                          {JSON.stringify(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Slide 06: Security Auth & Live Telemetry API Specification */}
          {currentSlideIdx === 5 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, minHeight: 0 }}>
              <div
                style={{
                  background: "#131317",
                  border: "1.5px solid #222228",
                  borderRadius: 20,
                  padding: 22,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ color: "#ff3b30", fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
                    🔐 1. SHA-512 3088-Round 인증 & 표준 REST API 규격
                  </div>
                  <pre
                    style={{
                      background: "#09090b",
                      padding: 16,
                      borderRadius: 12,
                      fontSize: 12,
                      color: "#e4e4e7",
                      overflowX: "auto",
                      lineHeight: 1.55,
                    }}
                  >{`// POST http://<Robot-IP>/api/v1/auth/login
const shaObj = new jsSHA("SHA-512", "TEXT", {
  encoding: "UTF8",
  numRounds: 3088
});

// Request Payload
{
  "account": "super",
  "password": "<3088-Round-SHA512-Hex>"
}

// Response Payload -> Header 'token: <JWT>'
{
  "code": 0,
  "msg": "操作成功",
  "data": { "Token": "eyJ0eXAiOiJKc29uV2ViVG9rZW4i..." }
}`}</pre>
                </div>
                <div style={{ fontSize: 12, color: "#a1a1aa" }}>
                  • 주요 관제 조회 API: <code>GET /api/v1/position/list</code>, <code>GET /api/v1/path/list</code>,{" "}
                  <code>GET /api/v1/base/robot/info</code>
                </div>
              </div>

              <div
                style={{
                  background: "#131317",
                  border: "1.5px solid #222228",
                  borderRadius: 20,
                  padding: 22,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 14, marginBottom: 10 }}>
                  📡 2. 실시간 WebSocket & Redis 통합 관제 패킷 (Live Stream)
                </div>
                <pre
                  style={{
                    flex: 1,
                    background: "#09090b",
                    padding: 16,
                    borderRadius: 12,
                    fontSize: 11.5,
                    color: "#4ade80",
                    overflowY: "auto",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {JSON.stringify(
                    robots.map((r) => ({
                      hostname: r.hostname,
                      online_mode: r.telemetry?.online_mode,
                      position_name: r.telemetry?.position_name,
                      local_odom_pose: [r.telemetry?.local_x, r.telemetry?.local_y, r.telemetry?.local_yaw_deg],
                      calibrated_3d_world_pose: [r.telemetry?.world_x, r.telemetry?.world_y, r.telemetry?.world_yaw_deg],
                      battery_pct: r.telemetry?.battery_pct,
                      lift_height_m: r.telemetry?.lift_height_m,
                    })),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Minimal Stage Navigation Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 14,
            marginTop: 14,
            borderTop: "1px solid #18181c",
            fontSize: 12.5,
            color: "#71717a",
          }}
        >
          <div>
            실제 공간(`map.pgm`) + 실시간 오도메트리(`Redis position_info`) 연동 관제 중
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              disabled={currentSlideIdx === 0}
              onClick={() => navigateToSlide(currentSlideIdx - 1)}
              style={{
                background: "#18181b",
                color: "#fff",
                border: "1px solid #27272a",
                borderRadius: 8,
                padding: "7px 14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ← 이전 장표
            </button>
            <button
              disabled={currentSlideIdx >= totalSlides - 1}
              onClick={() => navigateToSlide(currentSlideIdx + 1)}
              style={{
                background: "#ff3b30",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "7px 16px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              다음 장표 (커튼콜 전환) →
            </button>
          </div>
        </div>
      </main>

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
