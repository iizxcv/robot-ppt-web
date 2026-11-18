import React, { useEffect, useState } from "react";
import { UnifiedMapViewer3D, RobotRecord } from "./components/viewer3d/UnifiedMapViewer3D";
import { MapCalibrationModal, RobotDetailPopupModal } from "./components/ShowcasePanels";

export const App: React.FC = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [mapData, setMapData] = useState<any>(null);
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("flag-01");
  const [popupRobot, setPopupRobot] = useState<RobotRecord | null>(null);
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

  const navigateToSlide = (targetIdx: number) => {
    if (targetIdx === currentSlideIdx || targetIdx < 0 || targetIdx >= (slides.length || 6)) return;
    setCurrentSlideIdx(targetIdx);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (popupRobot || showCalibModal) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        navigateToSlide(currentSlideIdx + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        navigateToSlide(currentSlideIdx - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlideIdx, slides.length, popupRobot, showCalibModal]);

  const totalSlides = slides.length || 6;
  const currentSlide = slides[currentSlideIdx] || {
    number: "01",
    nav_label: "PART 01 · 기업 소개 & 비전",
    title: "IT 인프라 구축부터 AI 순찰 로봇까지 지능형 인프라 솔루션",
    subtitle: "SR ROBOTICS COMPANY PROFILE",
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
        <span style={{ color: "#3b82f6" }}>{tail}</span>
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
        gridTemplateColumns: "clamp(300px, 19vw, 340px) 1fr",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      {/* Left Sidebar TOC */}
      <aside
        style={{
          background: "#0f0f13",
          borderRight: "1px solid #1f1f26",
          padding: "26px 18px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 20,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              SR
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em" }}>SR ROBOTICS</div>
              <div style={{ fontSize: 11, color: "#71717a", fontWeight: 600 }}>SMART · RELIABLE · INNOVATIVE</div>
            </div>
          </div>

          <div style={{ height: 1, background: "#1f1f26", margin: "18px 0" }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: "#71717a", marginBottom: 10, paddingLeft: 6 }}>
            PROPOSAL CHAPTERS (목차 클릭)
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {slides.map((s, idx) => {
              const active = idx === currentSlideIdx;
              return (
                <button
                  key={s.id}
                  onClick={() => navigateToSlide(idx)}
                  style={{
                    background: active ? "rgba(59, 130, 246, 0.14)" : "transparent",
                    border: `1.5px solid ${active ? "#3b82f6" : "transparent"}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    textAlign: "left",
                    color: active ? "#ffffff" : "#a1a1aa",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.2s ease",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: active ? "#3b82f6" : "#52525b",
                      fontFamily: "monospace",
                    }}
                  >
                    {s.number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "clamp(12px, 0.82vw, 13px)",
                        fontWeight: active ? 800 : 600,
                        wordBreak: "keep-all",
                        lineHeight: 1.35,
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

        {/* Bottom Live Robot Status Mini Summary (Click opens detailed popup!) */}
        <div
          style={{
            background: "#141419",
            border: "1px solid #23232b",
            borderRadius: 14,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: "clamp(10.5px, 0.72vw, 11.5px)", fontWeight: 800, color: "#a1a1aa", whiteSpace: "nowrap" }}>
              실환경 WebSocket 관제
            </span>
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
                whiteSpace: "nowrap",
              }}
            >
              오도메트리 보정
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {robots
              .filter((r) => r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS")
              .map((r) => {
                const isLive = r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS";
                return (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRobotId(r.id);
                      setPopupRobot(r);
                    }}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: 12,
                      cursor: "pointer",
                      padding: "6px 8px",
                      borderRadius: 8,
                      background: r.id === selectedRobotId ? "rgba(255,255,255,0.06)" : "transparent",
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
                      <span style={{ fontWeight: 800, color: r.color }}>{r.display_name.split(" ")[0]}</span>
                    </div>
                    <span style={{ fontSize: 11, color: "#e4e4e7", fontFamily: "monospace" }}>
                      {r.telemetry?.position_name?.split(" ")[0]} ({r.telemetry?.battery_pct}%)
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
          padding: "30px 44px 24px 44px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {/* Top Stage Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  background: "rgba(59, 130, 246, 0.16)",
                  color: "#3b82f6",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  fontWeight: 800,
                  fontSize: 12,
                  padding: "4px 12px",
                  borderRadius: 99,
                }}
              >
                {currentSlide.nav_label || `SLIDE ${currentSlide.number}`}
              </span>
              <span style={{ fontSize: 13, color: "#a1a1aa", fontWeight: 600 }}>{currentSlide.subtitle}</span>
            </div>

            <div style={{ fontSize: 12, color: "#71717a" }}>
              SR 로보틱스 로봇솔루션 제안서 v1.6 × 실환경 API 연동
            </div>
          </div>

          <h1
            style={{
              fontSize: 35,
              fontWeight: 800,
              margin: "0 0 14px 0",
              letterSpacing: "-0.035em",
              lineHeight: 1.2,
            }}
          >
            {renderStyledTitle(currentSlide.title)}
          </h1>

          {/* Horizontal Key Highlights */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
            {(currentSlide.highlights || []).map((h: string, i: number) => (
              <div
                key={i}
                style={{
                  background: "#131317",
                  borderLeft: i === 0 ? "3px solid #3b82f6" : "3px solid #27272a",
                  borderRadius: "0 10px 10px 0",
                  padding: "10px 14px",
                  fontSize: "clamp(11.5px, 0.78vw, 12.5px)",
                  color: "#d4d4d8",
                  lineHeight: 1.48,
                  wordBreak: "keep-all",
                }}
              >
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Center Slide Content Area */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* Slide 01: PART 01 Company Overview & IDC 6-Zone Operation */}
          {currentSlideIdx === 0 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 18, minHeight: 0 }}>
              <div
                style={{
                  background: "#131317",
                  border: "1px solid #222228",
                  borderRadius: 20,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6", marginBottom: 8 }}>
                    AI 스마트 순찰 시스템, 새로운 기준을 제시하다
                  </div>
                  <p style={{ fontSize: 14, color: "#e4e4e7", lineHeight: 1.65, margin: "0 0 18px 0" }}>
                    2023년 설립된 <b>SR ROBOTICS</b>는 자체 AI 스마트 순찰 로봇 제품을 보유하고 있으며, 기업의{" "}
                    <b style={{ color: "#38bdf8" }}>데이터센터 및 고압·저압 배전실</b>을 대상으로 AI 스마트 순찰 로봇 솔루션을 제공합니다.
                    싱가포르 본사·중국 지사에서는 2010년부터 사업을 지속해 왔으며, 2015년부터는{" "}
                    <b>SK하이닉스, 삼성SDI, 신한은행</b> 등 한국 대기업과의 협력 경험을 축적해 왔습니다.
                  </p>

                  {/* 3 Big KPI Numbers from Page 2 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
                    {[
                      { num: "21년", label: "운영 전문 분야 (Since 2010)" },
                      { num: "3종 실내 주력", label: "플래그십 · 프로페셔널 · 파워" },
                      { num: "100건+", label: "글로벌 데이터센터/배전실 성공 사례" },
                    ].map((stat) => (
                      <div key={stat.label} style={{ background: "#0b0b0e", padding: 16, borderRadius: 14 }}>
                        <div style={{ fontSize: 28, fontWeight: 900, color: "#3b82f6" }}>{stat.num}</div>
                        <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4 }}>{stat.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ background: "#0b0b0e", borderLeft: "3px solid #38bdf8", padding: 14, borderRadius: "0 12px 12px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#38bdf8" }}>MISSION</div>
                    <div style={{ fontSize: 13, color: "#e4e4e7", marginTop: 4 }}>
                      로봇으로 기업 인프라의 운영 효율성과 안전의 새로운 기준을 재정의합니다.
                    </div>
                  </div>
                  <div style={{ background: "#0b0b0e", borderLeft: "3px solid #3b82f6", padding: 14, borderRadius: "0 12px 12px 0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#3b82f6" }}>VISION</div>
                    <div style={{ fontSize: 13, color: "#e4e4e7", marginTop: 4 }}>
                      인프라 운영의 첫 번째 파트너로 성장하여 비즈니스를 더욱 안전하고 신뢰할 수 있게 만듭니다.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: IDC 6-Zone Operation & Live 3D Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
                <div style={{ background: "#131317", border: "1px solid #222228", borderRadius: 20, padding: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 12 }}>
                    🏢 IDC 단지 통합 스마트 운영·유지관리 구역 (Page 04)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      "01 데이터센터 / 서버 구역 (Flagship · Pro)",
                      "02 네트워크 통신실 (Flagship · Pro)",
                      "03 전력센터 / UPS / 저압 배전실 (Power · Pro)",
                      "04 냉각 설비실 (온습도·누수·가스 감시)",
                      "05 디젤 발전기실 (열화상·소음·진동 감시)",
                      "06 통합 관제실 (WebSocket 실시간 3D 모니터링)",
                    ].map((zone) => (
                      <div
                        key={zone}
                        style={{
                          background: "#0b0b0e",
                          borderLeft: "3px solid #3b82f6",
                          padding: "10px 12px",
                          borderRadius: "0 8px 8px 0",
                          fontSize: 12.5,
                          fontWeight: 700,
                        }}
                      >
                        {zone}
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ flex: 1, minHeight: 0 }}>
                  <UnifiedMapViewer3D
                    mapData={mapData}
                    robots={robots}
                    selectedRobotId={selectedRobotId}
                    onSelectRobot={(id) => setSelectedRobotId(id)}
                    onOpenRobotPopup={(r) => setPopupRobot(r)}
                    showOdomVectors={false}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Slide 02: PART 02 Indoor 3-Robot Lineup + 3D Click-to-Popup Showcase */}
          {currentSlideIdx === 1 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(340px, 28vw) 1fr", gap: 18, minHeight: 0 }}>
              {/* Left: 3 Indoor Robot Lineup Cards (Clicking any card or 3D robot opens the Detailed Popup!) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
                {robots.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => {
                      setSelectedRobotId(r.id);
                      setPopupRobot(r);
                    }}
                    style={{
                      background: "#131317",
                      border: `2px solid ${r.id === selectedRobotId ? (r.color || "#3b82f6") : "#222228"}`,
                      borderRadius: 18,
                      padding: "16px 18px",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                      <span
                        style={{
                          background: `${r.color || "#3b82f6"}22`,
                          color: r.color || "#3b82f6",
                          padding: "3px 10px",
                          borderRadius: 99,
                          fontSize: 11.5,
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {r.edition_badge}
                      </span>
                      <span style={{ fontSize: 11.5, color: "#4ade80", fontWeight: 700, whiteSpace: "nowrap" }}>
                        KC인증 {r.rra_cert_no}
                      </span>
                    </div>

                    <div style={{ fontSize: "clamp(16px, 1.2vw, 19px)", fontWeight: 800, marginTop: 4 }}>
                      {r.display_name}
                    </div>

                    <div
                      style={{
                        fontSize: "clamp(12px, 0.8vw, 13px)",
                        color: "#a1a1aa",
                        lineHeight: 1.5,
                        wordBreak: "keep-all",
                      }}
                    >
                      {r.target_site}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 6,
                        paddingTop: 10,
                        borderTop: "1px solid #222228",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "#e4e4e7", display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS" ? "#22c55e" : "#71717a",
                          }}
                        />
                        <span>현위치: <b>{r.telemetry?.position_name}</b></span>
                      </span>
                      <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 12.5 }}>
                        {r.telemetry?.battery_pct ?? 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Right: Full Interactive 3D Simulation Environment (Click Robot -> Popup Modal) */}
              <UnifiedMapViewer3D
                mapData={mapData}
                robots={robots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={(id) => setSelectedRobotId(id)}
                onOpenRobotPopup={(r) => setPopupRobot(r)}
                showOdomVectors={false}
              />
            </div>
          )}

          {/* Slide 03: CORE TECHNOLOGY (4 Core Techs from Page 16 + Dual map.pgm SE(2) Fusion & Live Robot Pose Calibration) */}
          {currentSlideIdx === 2 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "46% 54%", gap: 18, minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between", minHeight: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    {
                      num: "01 SLAM & MAP FUSION",
                      title: "듀얼 map.pgm 정합 & 위치 보정",
                      color: "#00f2fe",
                      items: [
                        "Flagship(167×164) + Power(199×425) map.pgm 병합",
                        "Power 맵 ΔΘ=+90.25°, ΔX=+1.65m, ΔY=-5.875m 보정",
                        "동일 보정 행렬로 로봇 실시간 현위치 3D 자동 정합",
                      ],
                    },
                    {
                      num: "02 ROBOTIC ARM (Pro)",
                      title: "6+2축 로봇 팔 복합 작업",
                      color: "#a855f7",
                      items: [
                        "6축 메인(±0.05mm) + 2축 보조 암 상호 협동",
                        "자동 캐비닛 도어 개폐 및 버튼/차단기 조작",
                      ],
                    },
                    {
                      num: "03 VISION RECOGNITION",
                      title: "표시등 & 계측기 비전 인식",
                      color: "#3b82f6",
                      items: [
                        "표시등 색상 감지 및 점멸 빈도 측정",
                        "장비 고장 등급 판정 근거 자동 생성",
                      ],
                    },
                    {
                      num: "04 RFID READER",
                      title: "능동/수동형 RFID 무접촉 실사",
                      color: "#f59e0b",
                      items: [
                        "도어 폐쇄 상태 금속 메쉬 간섭 극복 인식",
                        "무인 재고 실사 및 변경 알림 자동화",
                      ],
                    },
                  ].map((tech) => (
                    <div
                      key={tech.num}
                      style={{
                        background: "#131317",
                        border: "1px solid #222228",
                        borderRadius: 14,
                        padding: 14,
                      }}
                    >
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: tech.color }}>{tech.num}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 8px 0" }}>{tech.title}</div>
                      {tech.items.map((it) => (
                        <div key={it} style={{ fontSize: 11.5, color: "#d4d4d8", marginBottom: 4, lineHeight: 1.4 }}>
                          • {it}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Live 2D map.pgm Fusion Verification Card */}
                <div
                  style={{
                    background: "#131317",
                    border: "1px solid #222228",
                    borderRadius: 16,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "150px 1fr",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      height: 125,
                      background: "#09090b",
                      borderRadius: 10,
                      overflow: "hidden",
                      border: "1px solid #27272a",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {mapData?.master_map?.fused_preview_png_base64 && (
                      <img
                        src={mapData.master_map.fused_preview_png_base64}
                        alt="Merged map.pgm preview"
                        style={{ width: "100%", height: "100%", objectFit: "contain" }}
                      />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#4ade80", marginBottom: 6 }}>
                      🧩 2개 로봇 `map.pgm` 실시간 정합 결과 (일치 블록: {mapData?.master_map?.overlap_count || 0}개)
                    </div>
                    <div style={{ fontSize: 11.5, color: "#d4d4d8", lineHeight: 1.55, fontFamily: "monospace" }}>
                      • <span style={{ color: "#00f2fe" }}>■ 청록</span>: Flagship `map.pgm` |{" "}
                      <span style={{ color: "#f59e0b" }}>■ 주황</span>: Power `map.pgm` (+90.25° 보정) |{" "}
                      <span style={{ color: "#4ade80" }}>■ 녹색</span>: 두 맵 완벽 일치 벽면
                      <br />• Flagship 현위치: Odom({robots[0]?.telemetry?.local_x}, {robots[0]?.telemetry?.local_y}) ➔ 3D({robots[0]?.telemetry?.world_x}, {robots[0]?.telemetry?.world_y})m
                      <br />• Power 현위치: Odom({robots[2]?.telemetry?.local_x}, {robots[2]?.telemetry?.local_y}) ➔ 3D({robots[2]?.telemetry?.world_x}, {robots[2]?.telemetry?.world_y})m
                    </div>
                  </div>
                </div>
              </div>

              <UnifiedMapViewer3D
                mapData={mapData}
                robots={robots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={(id) => setSelectedRobotId(id)}
                onOpenRobotPopup={(r) => setPopupRobot(r)}
                showOdomVectors={true}
              />
            </div>
          )}

          {/* Slide 04: PART 03 Solutions (Smart Patrol, RFID Inventory, 5-Step Door Opening, Fire Patch + OpenCV) */}
          {currentSlideIdx === 3 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "46% 54%", gap: 18, minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between" }}>
                {/* 5-Step Door Opening Pipeline from Page 19 */}
                <div style={{ background: "#131317", border: "1px solid #222228", borderRadius: 18, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#a855f7", marginBottom: 10 }}>
                    🦾 SOLUTION 03 · 프로페셔널 에디션 5단계 캐비닛 도어 자동 개폐 (Page 19)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {[
                      { step: "1", title: "손잡이 식별", sub: "위치·높이·형태" },
                      { step: "2", title: "손잡이 회전", sub: "잠금 해제" },
                      { step: "3", title: "문 열기", sub: "2종 암 협동" },
                      { step: "4", title: "내부 검사", sub: "표시등·열화상" },
                      { step: "5", title: "문 닫기/잠금", sub: "원상 복귀" },
                    ].map((s) => (
                      <div
                        key={s.step}
                        style={{
                          background: "#0b0b0e",
                          borderTop: "3px solid #a855f7",
                          borderRadius: 10,
                          padding: "10px 8px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 800, color: "#a855f7" }}>STEP 0{s.step}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, marginTop: 4 }}>{s.title}</div>
                        <div style={{ fontSize: 10.5, color: "#a1a1aa", marginTop: 2 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Solution 02 RFID & Solution 04 Fire Safety Patch from Pages 18, 20, 21 */}
                <div style={{ background: "#131317", border: "1px solid #222228", borderRadius: 18, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#00f2fe", marginBottom: 8 }}>
                    📦 SOLUTION 02 · 무개방 RFID(패시브/액티브) & QR 코드 자산 실사 (Page 18)
                  </div>
                  <div style={{ fontSize: 12.5, color: "#d4d4d8", lineHeight: 1.55 }}>
                    • 캐비닛 도어를 열지 않고 내부 모든 서버·스위치 자산 실사 및 미승인 자산 변경 즉시 알림 푸시
                  </div>
                </div>

                <div style={{ background: "#131317", border: "1px solid #3b82f6", borderRadius: 18, padding: 18 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#3b82f6", marginBottom: 8 }}>
                    🔥 SOLUTION 04 · 화재 예방 & 170℃ 능동 에어로졸 소화 패치 (Page 20~21)
                  </div>
                  <div style={{ fontSize: 12.5, color: "#d4d4d8", lineHeight: 1.55 }}>
                    • 온습도 클라우드 맵 + 다중 가스(CO, SO2, H2S, SF6, 연기) 감시로 발화 전·연소 중·소화 후 전 과정 경보
                    <br />• <b>3종 전 모델 내부 에어로졸 소화 패치 2개 기본 탑재</b> (화염 감지 또는 내부 170℃ 초과 시 자동 소화 개시)
                  </div>
                </div>
              </div>

              {/* Right: Live OpenCV Vision Studio */}
              <div
                style={{
                  background: "#131317",
                  border: "1px solid #222228",
                  borderRadius: 20,
                  padding: 18,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  minHeight: 0,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>👁️ SOLUTION 01 · 실시간 OpenCV 비전 판독 화면</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { id: "rack_roi_led", label: "표시등 상태 감지" },
                      { id: "thermal_hotspot", label: "열화상 온도 분포" },
                      { id: "canny_hud", label: "도어 손잡이 3D 식별" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => requestVisionFrame(selectedRobot?.hostname || "flagship.robot.local", m.id)}
                        style={{
                          background: visionMode === m.id ? "#3b82f6" : "#27272a",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "6px 10px",
                          fontSize: 11.5,
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
                    borderRadius: 12,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {visionFrame?.image_base64 && (
                    <img
                      src={visionFrame.image_base64}
                      alt="OpenCV Vision"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Slide 05: SOLUTION 05 Multi-Robot Management Platform (Real WebSocket Live Monitoring) */}
          {currentSlideIdx === 4 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 440px", gap: 18, minHeight: 0 }}>
              <UnifiedMapViewer3D
                mapData={mapData}
                robots={robots}
                selectedRobotId={selectedRobotId}
                onSelectRobot={(id) => setSelectedRobotId(id)}
                onOpenRobotPopup={(r) => setPopupRobot(r)}
                showOdomVectors={true}
              />

              <div
                style={{
                  background: "#131317",
                  border: "1px solid #222228",
                  borderRadius: 20,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80", marginBottom: 8 }}>
                  📡 실환경 WebSocket (`robotStatus`) & Redis 실시간 수신 스트림
                </div>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginBottom: 12 }}>
                  가상 조작 데모 없이 실제 로봇(`10.200.28.63`, `10.200.28.61`)에서 수신되는 실시간 상태 패킷입니다.
                </div>
                <pre
                  style={{
                    flex: 1,
                    background: "#09090b",
                    padding: 14,
                    borderRadius: 12,
                    fontSize: 11.5,
                    color: "#4ade80",
                    overflowY: "auto",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {JSON.stringify(
                    robots
                      .filter((r) => r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS")
                      .map((r) => ({
                        robot: r.display_name,
                        hostname: r.hostname,
                        ip: r.ip,
                        status: r.telemetry?.online_mode,
                        last_sync: r.telemetry?.last_sync_time,
                        current_station: r.telemetry?.position_name,
                        raw_odom_xy: [r.telemetry?.local_x, r.telemetry?.local_y],
                        calibrated_3d_xy: [r.telemetry?.world_x, r.telemetry?.world_y],
                        battery: `${r.telemetry?.battery_pct}% (${r.telemetry?.voltage_v}V)`,
                        lift_height_m: r.telemetry?.lift_height_m,
                      })),
                    null,
                    2
                  )}
                </pre>
              </div>
            </div>
          )}

          {/* Slide 06: PART 04 Customer Value (ROI Table Page 25) & Cooperation Cases (Pages 26-27) */}
          {currentSlideIdx === 5 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 18, minHeight: 0 }}>
              {/* Left: Manual vs Robot ROI Comparison Table (Page 25) */}
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
                  <div style={{ fontSize: 14, fontWeight: 800, color: "#38bdf8", marginBottom: 12 }}>
                    📊 수동 운영 대비 로봇 도입 실측 효과 (Page 25)
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
                        background: "#0284c7",
                        padding: "8px 12px",
                        borderRadius: 8,
                        fontWeight: 800,
                      }}
                    >
                      <span>서버실 운영 항목</span>
                      <span>수동 운영</span>
                      <span>AI 로봇</span>
                      <span>도입 효과</span>
                    </div>
                    {[
                      ["순찰 효율", "2회/일", "6회/일", "300% ↑"],
                      ["순찰 기록 방식", "종이 수기 기록", "데이터 자동 기록", "100% 디지털화"],
                      ["평균 장애 발견 시간", "2시간", "5~15분", "98.7% ↓"],
                      ["평균 장애 위치 확인", "4시간", "1시간", "75% ↓"],
                      ["평균 장애 해결 시간", "6시간", "2시간", "67% ↓"],
                      ["다중 서버실 현장 운영", "50회", "8회", "84% ↓"],
                      ["운영 보고서 통계 시간", "월 최소 4일", "필요 시 즉시 내보내기", "100% ↓"],
                    ].map(([item, manual, bot, eff]) => (
                      <div
                        key={item}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
                          background: "#0b0b0e",
                          padding: "8px 12px",
                          borderRadius: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>{item}</span>
                        <span style={{ color: "#71717a" }}>{manual}</span>
                        <span style={{ color: "#e4e4e7", fontWeight: 700 }}>{bot}</span>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>{eff}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Key Customer Cases (SK Hynix, Samsung SDI, China Southern, Shinhan Bank, Orion) */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10, justifyContent: "space-between" }}>
                {[
                  {
                    badge: "CASE 01 · SK하이닉스 자산관리 시스템",
                    stats: "1,000㎡ (IDC 3개) · 900개 캐비닛 · 3,000대 장비",
                    desc: "순찰 로봇 3대 + 멀티로봇 관리 플랫폼 도입, 데이터센터 IT 자산 생애주기 관리 및 CMDB 시각화 구현",
                    color: "#3b82f6",
                  },
                  {
                    badge: "CASE 02 · 삼성SDI(시안) 서버실 스마트 순찰",
                    stats: "150㎡ 서버실 · 50개 랙 · 300대 총 장비",
                    desc: "IT 장비 신호등 감지, 장비 표면 온도·환경 모니터링, IT/MES·Oracle DB 운영과 결합한 인간-로봇 협업",
                    color: "#00f2fe",
                  },
                  {
                    badge: "CASE 03 · 남방항공 바이윈공항 데이터센터",
                    stats: "3,400㎡ 데이터센터 · 930개 랙 · 5,500대 장비",
                    desc: "로봇 7대 + 72세트 모듈식 도어 연동 자동 제어, 고객 CMDB 연동 IT 자산 데이터 실시간 동기화",
                    color: "#a855f7",
                  },
                  {
                    badge: "SI & 유지보수 · 신한은행 / 오리온 / 화홍반도체 / 화성광전",
                    stats: "7×24H 전 계층 인프라 유지보수 · DELL / IBM / HUAWEI / VMware / NetApp / CISCO",
                    desc: "신한은행 3개 서버실 통합 운영, 오리온 네트워크 무중단 이전, 화홍반도체 CIM 2기, 화성광전 200여 개 MES DB 운영",
                    color: "#f59e0b",
                  },
                ].map((c) => (
                  <div
                    key={c.badge}
                    style={{
                      background: "#131317",
                      borderLeft: `4px solid ${c.color}`,
                      borderRadius: "0 14px 14px 0",
                      padding: "12px 16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#fff" }}>{c.badge}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: c.color }}>{c.stats}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4, lineHeight: 1.45 }}>{c.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Footer with Contact Info from Page 30 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 12,
            marginTop: 12,
            borderTop: "1px solid #18181c",
            fontSize: 12,
            color: "#71717a",
          }}
        >
          <div>
            <b>SR ROBOTICS</b> · 서울특별시 강남구 대치동 944-25 KC빌딩 11층 · TEL 02-558-8886 · sales@sr-robotics.co.kr
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
                padding: "6px 14px",
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
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "6px 16px",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              다음 장표 →
            </button>
          </div>
        </div>
      </main>

      {/* 3D Robot Click Popup Modal (Model Key Strengths, Parts/Sensors, Live API Telemetry) */}
      {popupRobot && (
        <RobotDetailPopupModal
          robot={robots.find((r) => r.id === popupRobot.id) || popupRobot}
          onClose={() => setPopupRobot(null)}
        />
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
