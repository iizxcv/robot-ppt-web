import React, { useState, useEffect } from "react";
import { RobotRecord } from "./viewer3d/UnifiedMapViewer3D";

interface ModalSlideMeta {
  id: number;
  tabLabel: string;
  badge: string;
}

const MODAL_SLIDES: ModalSlideMeta[] = [
  { id: 0, tabLabel: "01 모델 개요 & 3-View", badge: "외형 및 핵심 제원" },
  { id: 1, tabLabel: "02 부품 구성 & 센서", badge: "위치별 부품 분해도" },
  { id: 2, tabLabel: "03 핵심 특화 기능", badge: "차별화 솔루션" },
  { id: 3, tabLabel: "04 실시간 관제 & REST API", badge: "실환경 텔레메트리" },
];

export const RobotDetailPopupModal: React.FC<{
  robot: RobotRecord;
  onClose: () => void;
}> = ({ robot, onClose }) => {
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const specs = robot.proposal_specs;
  const tel = robot.telemetry;
  const isLive = tel?.online_mode === "LIVE_WEBSOCKET_REDIS";
  const robotId = robot.id.toLowerCase();

  // Keyboard navigation for carousel modal (Left/Right arrows, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setCurrentSlide((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentSlide((prev) => Math.min(MODAL_SLIDES.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Determine robot image asset set
  const isPower = robotId.includes("power") || robotId.includes("pwr");
  const isPro = robotId.includes("pro");
  const prefix = isPower ? "power" : isPro ? "pro" : "flagship";

  const frontImg = `/proposal_images/${prefix}_front.jpeg`;
  const sideImg = `/proposal_images/${prefix}_side.jpeg`;
  const backImg = `/proposal_images/${prefix}_back.jpeg`;
  const parts1Img = `/proposal_images/${prefix}_parts_1.jpeg`;
  const parts2Img = `/proposal_images/${prefix}_parts_2.jpeg`;

  const themeColor = robot.color || (isPower ? "#f59e0b" : isPro ? "#a855f7" : "#00f2fe");

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(4, 7, 16, 0.88)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
        padding: "20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="stage-reveal"
        style={{
          width: "min(1180px, 94vw)",
          height: "min(780px, 90vh)",
          background: "linear-gradient(145deg, #0e1526 0%, #090e1a 100%)",
          border: `1.5px solid ${themeColor}55`,
          borderRadius: 22,
          padding: "24px 30px",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 24px 64px rgba(0, 0, 0, 0.9), 0 0 40px ${themeColor}25`,
          overflow: "hidden",
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 14,
            borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          }}
        >
          {/* Robot Title & Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span
              style={{
                background: `${themeColor}22`,
                color: themeColor,
                border: `1px solid ${themeColor}`,
                padding: "4px 12px",
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              {robot.edition_badge || robot.model_code}
            </span>

            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: "-0.5px",
                color: "#ffffff",
              }}
            >
              {robot.display_name}
            </span>

            <span
              style={{
                background: isLive ? "rgba(34, 197, 94, 0.15)" : "rgba(113, 113, 122, 0.2)",
                color: isLive ? "#4ade80" : "#a1a1aa",
                border: `1px solid ${isLive ? "rgba(34, 197, 94, 0.4)" : "#3f3f46"}`,
                padding: "4px 10px",
                borderRadius: 99,
                fontSize: 11.5,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isLive ? "#22c55e" : "#71717a",
                }}
              />
              {isLive ? `실환경 연동 (${robot.ip})` : `대기 (${robot.ip})`}
            </span>

            {robot.rra_cert_no && (
              <span
                style={{
                  fontSize: 11.5,
                  color: "#cbd5e1",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  padding: "4px 10px",
                  borderRadius: 99,
                }}
              >
                🇰🇷 KC인증: <b>{robot.rra_cert_no}</b>
              </span>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              color: "#e2e8f0",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              borderRadius: 10,
              width: 36,
              height: 36,
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
          >
            ✕
          </button>
        </div>

        {/* Carousel Slide Navigation Tabs */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 0 12px 0",
            flexWrap: "nowrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexShrink: 0, overflowX: "auto" }} className="no-scrollbar">
            {MODAL_SLIDES.map((s) => {
              const isActive = currentSlide === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setCurrentSlide(s.id)}
                  style={{
                    background: isActive ? themeColor : "rgba(15, 23, 42, 0.7)",
                    color: isActive ? (isPower ? "#090e1a" : "#ffffff") : "#94a3b8",
                    border: `1px solid ${isActive ? themeColor : "rgba(255, 255, 255, 0.1)"}`,
                    borderRadius: 9,
                    padding: "6px 12px",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                    transition: "all 0.15s ease",
                  }}
                >
                  <span>{s.tabLabel}</span>
                  <span
                    style={{
                      fontSize: 10,
                      opacity: isActive ? 0.9 : 0.6,
                      background: isActive ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.06)",
                      padding: "2px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {s.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Slide Arrow Steppers & Simplified Counter (1 / 4) */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: "#cbd5e1",
                whiteSpace: "nowrap",
                letterSpacing: "0.5px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 8,
                padding: "4px 10px",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <b style={{ color: "#ffffff", fontSize: 14 }}>{currentSlide + 1}</b>
              <span style={{ color: "#64748b" }}>/</span>
              <span>{MODAL_SLIDES.length}</span>
            </div>

            <button
              disabled={currentSlide === 0}
              onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
              style={{
                background: currentSlide === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.1)",
                color: currentSlide === 0 ? "#475569" : "#ffffff",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 800,
                whiteSpace: "nowrap",
                flexShrink: 0,
                cursor: currentSlide === 0 ? "not-allowed" : "pointer",
              }}
            >
              ← 이전
            </button>
            <button
              disabled={currentSlide === MODAL_SLIDES.length - 1}
              onClick={() => setCurrentSlide((prev) => Math.min(MODAL_SLIDES.length - 1, prev + 1))}
              style={{
                background:
                  currentSlide === MODAL_SLIDES.length - 1
                    ? "rgba(255,255,255,0.04)"
                    : themeColor,
                color:
                  currentSlide === MODAL_SLIDES.length - 1
                    ? "#475569"
                    : isPower
                    ? "#090e1a"
                    : "#ffffff",
                border: "none",
                borderRadius: 8,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 800,
                whiteSpace: "nowrap",
                flexShrink: 0,
                cursor: currentSlide === MODAL_SLIDES.length - 1 ? "not-allowed" : "pointer",
              }}
            >
              다음 →
            </button>
          </div>
        </div>

        {/* Slide Body Container */}
        <div
          className="no-scrollbar"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            paddingRight: 2,
          }}
        >
          {/* ==============================================================
              SLIDE 0: 모델 개요 & 3-View 외형 (정면도, 측면도, 후면도 + KPI)
             ============================================================== */}
          {currentSlide === 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, height: "100%" }}>
              {/* Left: 3-View Drawing Gallery */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: themeColor }}>
                    📐 모델 정밀 3방향 뷰 (정면 · 측면 · 후면 외형도)
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>제안서 Page 06/08/10 수록 규격</span>
                </div>

                {/* 3 View Images in Row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 12,
                    margin: "12px 0",
                    background: "rgba(8, 12, 22, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 12,
                    padding: "16px 12px",
                  }}
                >
                  {[
                    { label: "정면도 (Front)", img: frontImg },
                    { label: "측면도 (Side)", img: sideImg },
                    { label: "후면도 (Back)", img: backImg },
                  ].map((v) => (
                    <div
                      key={v.label}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          height: 240,
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                        }}
                      >
                        <img
                          src={v.img}
                          alt={v.label}
                          style={{
                            maxHeight: "100%",
                            maxWidth: "100%",
                            objectFit: "contain",
                            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.6))",
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#cbd5e1",
                          marginTop: 8,
                          background: "rgba(255, 255, 255, 0.06)",
                          padding: "3px 10px",
                          borderRadius: 6,
                        }}
                      >
                        {v.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Dimensions Caption */}
                <div
                  style={{
                    background: "rgba(2, 6, 23, 0.5)",
                    borderLeft: `3px solid ${themeColor}`,
                    padding: "10px 14px",
                    borderRadius: "0 8px 8px 0",
                    fontSize: 12,
                    color: "#cbd5e1",
                  }}
                >
                  <b>외형 규격</b>: {specs?.capacity_summary}
                </div>
              </div>

              {/* Right: 4 Big KPIs + Specifications Box Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* 4 KPI Cards from Proposal */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {(specs?.kpi_cards || []).map((kpi) => (
                    <div
                      key={kpi.label}
                      style={{
                        background: "rgba(15, 23, 42, 0.7)",
                        borderLeft: `3.5px solid ${themeColor}`,
                        borderRadius: "0 12px 12px 0",
                        padding: "14px 16px",
                      }}
                    >
                      <div style={{ fontSize: 26, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.5px" }}>
                        {kpi.value}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4, fontWeight: 600 }}>
                        {kpi.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Technical Specifications Detail Table */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 14,
                    padding: "16px 18px",
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: themeColor, marginBottom: 12 }}>
                    ⚙️ 하드웨어 기구 및 구동 사양 요약
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12 }}>
                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>주행 방식: </span>
                      <b style={{ color: "#f1f5f9" }}>{robot.kinematics.drive_type}</b>
                    </div>
                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>리프트 높이: </span>
                      <b style={{ color: "#f1f5f9" }}>최대 {robot.kinematics.max_lift_height_m}m 승강</b>
                    </div>
                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>장비 자체 중량: </span>
                      <b style={{ color: "#f1f5f9" }}>약 {robot.kinematics.weight_kg}kg</b>
                    </div>
                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>라이다 위치: </span>
                      <b style={{ color: "#f1f5f9" }}>지상 {robot.kinematics.laser_tf_xyz[2]}m 전방 마운트</b>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                      fontSize: 12,
                      color: "#94a3b8",
                      lineHeight: 1.5,
                    }}
                  >
                    • 적용 분야: <b style={{ color: "#e2e8f0" }}>{robot.target_site}</b>
                  </div>
                </div>

                {/* KC Certification Box */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.5)",
                    border: "1px solid rgba(59, 130, 246, 0.25)",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8" }}>
                      국립전파연구원(RRA) 방송통신기자재 적합등록 인증 완료
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 4 }}>
                      인증등록번호: <b>{robot.rra_cert_no || "등록 진행 중"}</b>
                      {robot.rra_cert_date && ` · 등록일자: ${robot.rra_cert_date}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 22 }}>🇰🇷</span>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              SLIDE 1: 본체 부품 구성 & 센서 분해도 (위치별 부품 다이어그램)
             ============================================================== */}
          {currentSlide === 1 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.25fr", gap: 18, height: "100%" }}>
              {/* Left: Parts Diagram Graphic */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: themeColor }}>
                    🔩 부품 및 센서 분해도 (제안서 원본)
                  </span>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>Page 07/09/11 인용</span>
                </div>

                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px 0",
                    overflow: "hidden",
                  }}
                >
                  <img
                    src={parts1Img}
                    alt="Parts & Sensors Breakdown"
                    style={{
                      maxHeight: "100%",
                      maxWidth: "100%",
                      objectFit: "contain",
                      filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.8))",
                    }}
                  />
                </div>

                <div
                  style={{
                    width: "100%",
                    background: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.35)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 11.5,
                    color: "#fca5a5",
                    lineHeight: 1.45,
                  }}
                >
                  🔥 <b>자체 안전 소화 패치 2개 기본 탑재</b>: 본체 내부 170℃ 초과 또는 화염 감지 시 자동 분사되어 2차 화재를 즉각 진압합니다.
                </div>
              </div>

              {/* Right: Categorized Modular Parts & Sensors Grid */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {/* Section 1: Vision & Perception */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.65)",
                    borderLeft: "3.5px solid #00f2fe",
                    borderRadius: "0 12px 12px 0",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#00f2fe", marginBottom: 6 }}>
                    📷 상단 비전 & 환경 인식 카메라군
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.55 }}>
                    • <b>PTZ 고성능 영상 감시 카메라</b>: 360° 팬, -90°~+90° 틸트, 광학 줌<br />
                    • <b>듀얼 열화상 카메라 (2ea)</b>: 전자기판 표면 발열 핫스팟 및 케이블 이상 과열 즉시 진단<br />
                    • <b>고해상도 가시광 & 산업용 카메라 (2ea)</b> + 보조 LED 조명: 랙 내부 표시등 상태 정확 판독
                  </div>
                </div>

                {/* Section 2: Environmental & Gas Sensors */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.65)",
                    borderLeft: "3.5px solid #38bdf8",
                    borderRadius: "0 12px 12px 0",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8", marginBottom: 6 }}>
                    🧪 정밀 다종 환경 센서 & 유해가스 조기 감지군
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.55 }}>
                    • <b>미세입자 센서</b>: PM1, PM2.5, PM10 부유 입자 실시간 측정<br />
                    • <b>유해가스 정밀 검측</b>: TVOC, H₂S(황화수소), CO₂(이산화탄소), SO₂(이산화황), 포름알데히드
                    {isPower && <span style={{ color: "#f59e0b" }}>, <b>SF₆(육불화황 절연가스 누출 감지)</b></span>}
                    <br />
                    • <b>온습도 & 소음 센서</b>: 전산실/배전실 내부 온습도 클라우드 맵 생성 및 쿨링 이상 소음 감지
                  </div>
                </div>

                {/* Section 3: Navigation, Drive & Interactivity */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.65)",
                    borderLeft: "3.5px solid #10b981",
                    borderRadius: "0 12px 12px 0",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", marginBottom: 6 }}>
                    🛡️ 주행 제어, 안전 센서 및 상호작용 인터페이스
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.55 }}>
                    • <b>360° 고정밀 라이다 (SLAM)</b>: 복잡한 랙 복도에서 ±2cm 무궤도 자율주행<br />
                    • <b>안전 센서군</b>: 초음파 거리 센서, 낙하 방지 센서, 전방위 충돌방지 범퍼 스트립<br />
                    • <b>사용자 인터페이스</b>: 본체 정면 상태표시 디스플레이, 터치스크린, 양방향 음성 인터콤 마이크
                  </div>
                </div>

                {/* Section 4: Specific Arm / Lifting Tool */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.65)",
                    borderLeft: `3.5px solid ${themeColor}`,
                    borderRadius: "0 12px 12px 0",
                    padding: "12px 16px",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: themeColor, marginBottom: 6 }}>
                    ✨ 모델별 특화 작업 액추에이터
                  </div>
                  <div style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.55 }}>
                    {isPro ? (
                      <>
                        • <b>메인 6축 로봇 팔</b>: 반복 정밀도 ±0.05mm, 작업 반경 900mm<br />
                        • <b>보조 2축 로봇 팔</b>: 메인 암과 협동하여 캐비닛 도어 5단계 자동 개폐 및 내부 차단기/버튼 직접 조작
                      </>
                    ) : isPower ? (
                      <>
                        • <b>2축 전용 로봇 팔</b>: TEV(과도 접지 전압) + AE(초음파) 통합 부분방전 센서 탑재<br />
                        • <b>2.3m 고전압 리프트</b>: 고압 배전반 상단 계측기까지 승강하여 정확한 비전 판독 지원
                      </>
                    ) : (
                      <>
                        • <b>48U 전고 정밀 리프트 장치</b>: 최하단 2U부터 최상단 48U까지 승강하며 랙 전면 무사각 연속 검사<br />
                        • <b>RFID 고속 수집기</b>: 패시브 및 액티브 태그 지원으로 문을 열지 않고 초당 다량의 IT 자산 실사
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              SLIDE 2: 핵심 특화 기능 & 작업 메커니즘
             ============================================================== */}
          {currentSlide === 2 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, height: "100%" }}>
              {/* Box 1: Core Key Strengths */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: themeColor, marginBottom: 12 }}>
                    🏆 모델 핵심 차별화 강점 (SR 로보틱스 제안서 수록)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {(specs?.key_strengths || []).map((str, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: "rgba(2, 6, 23, 0.5)",
                          borderLeft: `3.5px solid ${themeColor}`,
                          borderRadius: "0 10px 10px 0",
                          padding: "12px 14px",
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          color: "#f1f5f9",
                        }}
                      >
                        <b>[핵심 0{idx + 1}]</b> {str}
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    background: "rgba(59, 130, 246, 0.12)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 11.5,
                    color: "#93c5fd",
                  }}
                >
                  💡 <b>현장 적용 효과</b>: 사람이 접근하기 어려운 고전압 설비 및 야간 무인 운영 전산실에서 100% 디지털화된 안전 점검 표준을 제공합니다.
                </div>
              </div>

              {/* Box 2: Functions Breakdown (Basic vs Optional) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Basic Functions */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 16,
                    padding: 18,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#38bdf8", marginBottom: 10 }}>
                    ✅ 3종 공통 기본 탑재 기능 (6대 표준 기능)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {(specs?.basic_functions || []).map((fn) => (
                      <div
                        key={fn}
                        style={{
                          background: "rgba(2, 6, 23, 0.6)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          padding: "8px 10px",
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: "#e2e8f0",
                          textAlign: "center",
                        }}
                      >
                        ✓ {fn}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional / Specialized Items */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 16,
                    padding: 18,
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f59e0b", marginBottom: 10 }}>
                    ⚡ 모델 특화 및 현장 커스텀 옵션 항목
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(specs?.optional_items || []).map((opt) => (
                      <span
                        key={opt}
                        style={{
                          background: "rgba(245, 158, 11, 0.12)",
                          border: "1px solid rgba(245, 158, 11, 0.35)",
                          color: "#fbbf24",
                          padding: "6px 12px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        + {opt}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Operation Summary */}
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.6)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 16,
                    padding: 16,
                    fontSize: 12,
                    color: "#cbd5e1",
                    lineHeight: 1.5,
                  }}
                >
                  <b style={{ color: "#ffffff" }}>현장 운용 사이클 요약</b>:<br />
                  • 1회 완충 시 {specs?.kpi_cards?.[2]?.value ?? "6h 이상"} 연속 주행<br />
                  • 점검 데이터 실시간 Redis 저장 및 중앙 CMDB 즉시 동기화<br />
                  • 배터리 저전압(20% 이하) 감지 시 지정 충전 도크로 자율 복귀 자동 급속 충전
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              SLIDE 3: 실시간 관제 & REST API 인터페이스 (Live Data & Endpoints)
             ============================================================== */}
          {currentSlide === 3 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, height: "100%" }}>
              {/* Left: Live Spatial & Kinematic Telemetry */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#38bdf8", marginBottom: 12 }}>
                    📍 실시간 위치 및 오도메트리 공간 정합 상태
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>네트워크 호스트 / IP: </span>
                      <b style={{ color: "#ffffff" }}>{robot.hostname} ({robot.ip})</b>
                    </div>

                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>현재 관제 지점명: </span>
                      <b style={{ color: "#4ade80" }}>{tel?.position_name || "대기 상태"}</b>
                    </div>

                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>로컬 오도메트리 (Local X, Y, Yaw): </span>
                      <b style={{ color: "#f1f5f9" }}>
                        ({tel?.local_x ?? 0}m, {tel?.local_y ?? 0}m, {tel?.local_yaw_deg ?? 0}°)
                      </b>
                    </div>

                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>SE(2) 변환 오프셋 (ΔX, ΔY, ΔΘ): </span>
                      <b style={{ color: "#f59e0b" }}>
                        ({robot.calibration?.dx_m ?? 0}m, {robot.calibration?.dy_m ?? 0}m, {robot.calibration?.yaw_deg ?? 0}°)
                      </b>
                    </div>

                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>3D 디지털 트윈 통합 월드 좌표: </span>
                      <b style={{ color: "#00f2fe" }}>
                        ({tel?.world_x ?? 0}m, {tel?.world_y ?? 0}m)
                      </b>
                    </div>

                    <div style={{ background: "rgba(2, 6, 23, 0.5)", padding: "8px 12px", borderRadius: 8 }}>
                      <span style={{ color: "#94a3b8" }}>배터리 / 전압 / 내부 온도: </span>
                      <b style={{ color: "#4ade80" }}>
                        {tel?.battery_pct ?? 0}% / {tel?.voltage_v ?? 0}V / {tel?.temp_c ?? 0}℃
                      </b>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: isLive ? "rgba(34, 197, 94, 0.1)" : "rgba(113, 113, 122, 0.1)",
                    border: `1px solid ${isLive ? "rgba(34, 197, 94, 0.3)" : "rgba(113, 113, 122, 0.3)"}`,
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 11.5,
                    color: isLive ? "#86efac" : "#94a3b8",
                  }}
                >
                  최근 텔레메트리 수신 동기화 시각: <b>{tel?.last_sync_time || "연결 대기 중"}</b>
                </div>
              </div>

              {/* Right: Authoritative REST API & WebSocket Real-time Stream */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 16,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 800, color: "#4ade80", marginBottom: 8 }}>
                  📡 실환경 REST API 규격 및 WebSocket 패킷
                </div>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
                  인증 헤더: <code>Authorization: Bearer &lt;Token&gt;</code> · 동기화 엔드포인트: <code>GET /api/v1/position/list</code>
                </div>

                <pre
                  style={{
                    flex: 1,
                    margin: 0,
                    background: "rgba(2, 6, 23, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.05)",
                    borderRadius: 10,
                    padding: 12,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#4ade80",
                    overflow: "auto",
                    lineHeight: 1.45,
                  }}
                >
                  {JSON.stringify(
                    {
                      auth_endpoint: `POST http://${robot.ip}/api/v1/auth/login`,
                      auth_type: "SHA-512 (3088 rounds) Bearer JWT",
                      position_list_api: `GET http://${robot.ip}/api/v1/position/list`,
                      robot_info_api: `GET http://${robot.ip}/api/v1/base/robot/info`,
                      websocket_stream: `ws://${robot.ip}${robot.ws_status_path || "/platformSocket/timely/data/robotStatus"}`,
                      live_packet: {
                        position_name: tel?.position_name,
                        battery: `${tel?.battery_pct}% (${tel?.voltage_v}V)`,
                        local_odom: { x: tel?.local_x, y: tel?.local_y, yaw: tel?.local_yaw_deg },
                        world_pose: { x: tel?.world_x, y: tel?.world_y },
                        lift_height_m: tel?.lift_height_m,
                        online_mode: tel?.online_mode,
                      },
                    },
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Slide Indicators (Dots) */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            paddingTop: 14,
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          {MODAL_SLIDES.map((s) => (
            <div
              key={s.id}
              onClick={() => setCurrentSlide(s.id)}
              style={{
                width: currentSlide === s.id ? 28 : 8,
                height: 8,
                borderRadius: 4,
                background: currentSlide === s.id ? themeColor : "rgba(255, 255, 255, 0.2)",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export const MapCalibrationModal: React.FC<{
  alignment: any;
  onClose: () => void;
  onSave: (newTransforms: any, wallHeight: number) => void;
}> = ({ alignment, onClose, onSave }) => {
  const [transforms, setTransforms] = useState<any>(alignment?.transforms || {});
  const [wallHeight, setWallHeight] = useState<number>(alignment?.wall_extrusion_height_m || 1.85);

  const updateField = (robotId: string, field: string, value: number) => {
    setTransforms((prev: any) => ({
      ...prev,
      [robotId]: {
        ...(prev[robotId] || {}),
        [field]: value,
      },
    }));
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 6, 23, 0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <div
        style={{
          width: 820,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#111116",
          border: "1.5px solid #3b82f6",
          borderRadius: 16,
          padding: 24,
          color: "#f8fafc",
        }}
      >
        <h3 style={{ margin: "0 0 6px 0", color: "#3b82f6" }}>
          🧭 다중 로봇 map.pgm + map.yaml SE(2) 정합 & 통합 맵 빌더
        </h3>
        <p style={{ margin: "0 0 14px 0", fontSize: 12.5, color: "#a1a1aa", lineHeight: 1.55 }}>
          각 로봇 Chassis 내부의 <code>map.pgm</code>과 <code>map.yaml</code>은 매핑 기준(origin, 회전각)이 서로 다릅니다.
          아래 보정값(ΔX, ΔY, ΔΘ)으로 <b>두 map.pgm 벽면 점군을 하나의 통합 3D 공간으로 정합</b>하고, 동일한 행렬로{" "}
          <b>각 로봇의 실시간 현위치(Local Odom)를 통합 3D 뷰 좌표로 자동 변환</b>합니다.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#cbd5e1" }}>
            3D 가상 공간 벽면/서버랙 돌출 높이 (m): <b>{wallHeight}m</b>
          </label>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.05}
            value={wallHeight}
            onChange={(e) => setWallHeight(parseFloat(e.target.value))}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>

        {Object.entries(transforms).map(([rId, tf]: [string, any]) => (
          <div
            key={rId}
            style={{
              background: "#18181f",
              padding: 12,
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "#ffffff", marginBottom: 8 }}>
              {rId} ({tf.robot_hostname}) {rId === "flag-01" && "★ 기준 맵 (Master Frame)"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#a1a1aa" }}>ΔX 오프셋 (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={tf.dx_m}
                  onChange={(e) => updateField(rId, "dx_m", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#09090b",
                    color: "#fff",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    padding: 6,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#a1a1aa" }}>ΔY 오프셋 (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={tf.dy_m}
                  onChange={(e) => updateField(rId, "dy_m", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#09090b",
                    color: "#fff",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    padding: 6,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#a1a1aa" }}>ΔΘ 회전각 (deg)</label>
                <input
                  type="number"
                  step="1.0"
                  value={tf.dtheta_deg}
                  onChange={(e) => updateField(rId, "dtheta_deg", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#09090b",
                    color: "#fff",
                    border: "1px solid #27272a",
                    borderRadius: 6,
                    padding: 6,
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              background: "#27272a",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={() => onSave(transforms, wallHeight)}
            style={{
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            영구 저장 (map_alignment.json)
          </button>
        </div>
      </div>
    </div>
  );
};
