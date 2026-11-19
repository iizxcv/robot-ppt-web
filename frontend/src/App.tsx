import React, { useEffect, useState } from "react";
import { UnifiedMapViewer3D, RobotRecord } from "./components/viewer3d/UnifiedMapViewer3D";
import { MapCalibrationModal, RobotDetailPopupModal } from "./components/ShowcasePanels";
import { RobotLiveOperationModal } from "./components/RobotLiveOperationModal";

export const App: React.FC = () => {
  const [slides, setSlides] = useState<any[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [mapData, setMapData] = useState<any>(null);
  const [robots, setRobots] = useState<RobotRecord[]>([]);
  const [selectedRobotId, setSelectedRobotId] = useState<string>("flag-01");
  const [popupRobot, setPopupRobot] = useState<RobotRecord | null>(null);
  const [liveOpRobot, setLiveOpRobot] = useState<RobotRecord | null>(null);
  const [fleetData, setFleetData] = useState<any>(null);
  const [showCalibModal, setShowCalibModal] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem("robot_ppt_theme") === "dark"; // Default is false (Light Mode!)
  });

  useEffect(() => {
    localStorage.setItem("robot_ppt_theme", isDarkMode ? "dark" : "light");
    if (isDarkMode) {
      document.body.classList.remove("theme-light");
      document.body.classList.add("theme-dark");
    } else {
      document.body.classList.remove("theme-dark");
      document.body.classList.add("theme-light");
    }
  }, [isDarkMode]);

  const fetchInitialData = async () => {
    try {
      const [slidesRes, mapRes, telRes, fleetRes] = await Promise.all([
        fetch("/api/v1/slides").then((r) => r.json()),
        fetch("/api/v1/maps/unified3d").then((r) => r.json()),
        fetch("/api/v1/telemetry").then((r) => r.json()),
        fetch("/api/v1/fleet/details").then((r) => r.json()).catch(() => null),
      ]);
      if (slidesRes?.slides) setSlides(slidesRes.slides);
      if (mapRes) setMapData(mapRes);
      if (telRes?.robots) setRobots(telRes.robots);
      if (fleetRes) setFleetData(fleetRes);
    } catch (e) {
      console.error("Initial load error:", e);
    }
  };

  const handleExecuteAction = async (actionType: string, params: any) => {
    if (!liveOpRobot) return null;
    const res = await fetch(`/api/v1/robots/${liveOpRobot.hostname || liveOpRobot.id}/oneclick_action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action_type: actionType, ...params }),
    }).then((r) => r.json());
    fetchInitialData();
    return res;
  };

  useEffect(() => {
    fetchInitialData();

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
      if (popupRobot || showCalibModal || liveOpRobot) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        navigateToSlide(currentSlideIdx + 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        navigateToSlide(currentSlideIdx - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlideIdx, slides.length, popupRobot, showCalibModal, liveOpRobot]);

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
      id="app-root-container"
      className={`app-shell ${isDarkMode ? "theme-dark" : "theme-light"}`}
      style={{
        width: "100vw",
        height: "100vh",
        background: isDarkMode ? "#0a0a0c" : "#f1f5f9",
        color: isDarkMode ? "#ffffff" : "#0f172a",
        display: "grid",
        gridTemplateColumns: "clamp(300px, 19vw, 340px) 1fr",
        overflow: "hidden",
        userSelect: "none",
        transition: "background 0.25s ease, color 0.25s ease",
      }}
    >
      {/* Left Sidebar TOC */}
      <aside
        className="sidebar-toc"
        style={{
          background: isDarkMode ? "#0f0f13" : "#ffffff",
          borderRight: isDarkMode ? "1px solid #1f1f26" : "1px solid #e2e8f0",
          padding: "26px 18px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          zIndex: 20,
          boxShadow: isDarkMode ? "none" : "2px 0 16px rgba(15, 23, 42, 0.04)",
          transition: "background 0.25s ease, border-color 0.25s ease",
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
                color: "#ffffff",
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
              <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: "-0.03em", color: isDarkMode ? "#ffffff" : "#0f172a" }}>
                SR ROBOTICS
              </div>
              <div style={{ fontSize: 11, color: isDarkMode ? "#71717a" : "#64748b", fontWeight: 600 }}>
                SMART · RELIABLE · INNOVATIVE
              </div>
            </div>
          </div>

          <div style={{ height: 1, background: isDarkMode ? "#1f1f26" : "#e2e8f0", margin: "18px 0" }} />

          <div style={{ fontSize: 11, fontWeight: 700, color: isDarkMode ? "#71717a" : "#64748b", marginBottom: 10, paddingLeft: 6 }}>
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
                    background: active
                      ? (isDarkMode ? "rgba(59, 130, 246, 0.14)" : "rgba(37, 99, 235, 0.09)")
                      : "transparent",
                    border: `1.5px solid ${active ? "#3b82f6" : "transparent"}`,
                    borderRadius: 12,
                    padding: "10px 12px",
                    textAlign: "left",
                    color: active ? (isDarkMode ? "#ffffff" : "#1d4ed8") : (isDarkMode ? "#a1a1aa" : "#475569"),
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
                      color: active ? "#3b82f6" : (isDarkMode ? "#52525b" : "#94a3b8"),
                      fontFamily: "monospace",
                    }}
                  >
                    {s.number}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "clamp(12px, 0.82vw, 13px)",
                        fontWeight: active ? (isDarkMode ? 800 : 600) : (isDarkMode ? 600 : 450),
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
          className="live-status-box"
          style={{
            background: isDarkMode ? "#141419" : "#f8fafc",
            border: isDarkMode ? "1px solid #23232b" : "1px solid #e2e8f0",
            borderRadius: 14,
            padding: 14,
            boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(15, 23, 42, 0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: "clamp(10.5px, 0.72vw, 11.5px)", fontWeight: 800, color: isDarkMode ? "#a1a1aa" : "#475569", whiteSpace: "nowrap" }}>
              실환경 WebSocket 관제
            </span>
            <button
              onClick={() => setShowCalibModal(true)}
              style={{
                background: isDarkMode ? "#27272a" : "#e2e8f0",
                color: isDarkMode ? "#e4e4e7" : "#1e293b",
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

            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 12, color: isDarkMode ? "#71717a" : "#64748b" }}>
                SR 로보틱스 로봇솔루션 제안서 v1.6 × 실환경 API 연동
              </div>
              {/* Top-Right Theme Toggle Button */}
              <button
                onClick={() => setIsDarkMode((prev) => !prev)}
                className="theme-toggle-pill"
                title={isDarkMode ? "라이트 모드로 전환 (기본 Light 폰트)" : "다크 모드로 전환"}
              >
                <span>{isDarkMode ? "☀️" : "🌙"}</span>
                <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 14, flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize: "clamp(26px, 2vw, 34px)",
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.03em",
                lineHeight: 1.15,
                color: "#ffffff",
              }}
            >
              {renderStyledTitle(currentSlide.title)}
            </h1>
            <span style={{ fontSize: "clamp(12px, 0.85vw, 13.5px)", color: "#94a3b8", fontWeight: 500 }}>
              {currentSlide.subtitle}
            </span>
          </div>
        </div>

        {/* Center Slide Content Area with Refined Modular Box-Grid Architecture */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* ==============================================================
              Slide 01: PART 01 Company Overview & IDC 6-Zone Operation
             ============================================================== */}
          {currentSlideIdx === 0 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 18, minHeight: 0 }}>
              {/* Left Column: Company Background, 3 Key Metrics & Mission/Vision */}
              <div
                style={{
                  background: "linear-gradient(145deg, rgba(16, 24, 40, 0.85) 0%, rgba(10, 15, 28, 0.95) 100%)",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                  borderRadius: 20,
                  padding: "22px 24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span
                      style={{
                        background: "rgba(59, 130, 246, 0.2)",
                        color: "#38bdf8",
                        border: "1px solid rgba(59, 130, 246, 0.4)",
                        fontSize: 11,
                        fontWeight: 800,
                        padding: "3px 10px",
                        borderRadius: 6,
                      }}
                    >
                      COMPANY PROFILE
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#38bdf8" }}>
                      AI 스마트 순찰 시스템, 새로운 기준을 제시하다
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: "clamp(12.5px, 0.85vw, 13.5px)",
                      color: "#cbd5e1",
                      lineHeight: 1.65,
                      margin: "0 0 16px 0",
                      wordBreak: "keep-all",
                    }}
                  >
                    2023년 설립된 <b style={{ color: "#ffffff" }}>SR ROBOTICS</b>는 자체 AI 스마트 순찰 로봇 제품을 보유하고 있으며,
                    기업의 <b style={{ color: "#38bdf8" }}>데이터센터 및 고압·저압 배전실</b>을 대상으로 무인화 순찰 로봇 솔루션을 제공합니다.
                    싱가포르 본사 및 글로벌 R&D 네트워크를 기반으로 2010년부터 21년간 IT/전력 인프라 전문성을 축적해 왔으며,
                    <b style={{ color: "#ffffff" }}> SK하이닉스, 삼성SDI, 신한은행</b> 등 국내 선도 대기업 현장에 성공적으로 도입·운영하고 있습니다.
                  </p>

                  {/* 3 Big KPI Numbers from Page 2 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      { num: "21년", label: "운영 전문 분야", sub: "Since 2010 글로벌 R&D", color: "#38bdf8" },
                      { num: "3종", label: "실내 주력 라인업", sub: "플래그십 · 프로 · 파워", color: "#00f2fe" },
                      { num: "100건+", label: "글로벌 성공 사례", sub: "데이터센터 / 배전실 레퍼런스", color: "#4ade80" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        style={{
                          background: "rgba(8, 12, 22, 0.7)",
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          padding: "14px 14px",
                          borderRadius: 14,
                        }}
                      >
                        <div style={{ fontSize: 28, fontWeight: 900, color: stat.color, letterSpacing: "-0.5px" }}>
                          {stat.num}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", marginTop: 4 }}>
                          {stat.label}
                        </div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{stat.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mission & Vision Structured Boxes */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div
                    style={{
                      background: "rgba(8, 12, 22, 0.7)",
                      borderLeft: "3.5px solid #00f2fe",
                      padding: "12px 14px",
                      borderRadius: "0 12px 12px 0",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#00f2fe", letterSpacing: "0.5px" }}>
                      🎯 MISSION
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 4, lineHeight: 1.5, wordBreak: "keep-all" }}>
                      로봇으로 기업 인프라의 운영 효율성과 안전의 새로운 기준을 재정의합니다.
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(8, 12, 22, 0.7)",
                      borderLeft: "3.5px solid #3b82f6",
                      padding: "12px 14px",
                      borderRadius: "0 12px 12px 0",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#38bdf8", letterSpacing: "0.5px" }}>
                      🔭 VISION
                    </div>
                    <div style={{ fontSize: 12, color: "#e2e8f0", marginTop: 4, lineHeight: 1.5, wordBreak: "keep-all" }}>
                      인프라 운영의 첫 번째 파트너로 성장하여 비즈니스를 더욱 안전하고 신뢰할 수 있게 만듭니다.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: IDC 6-Zone Operation & Live 3D Twin Preview */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
                {/* 6-Zone Operation Box Grid */}
                <div
                  style={{
                    background: "linear-gradient(145deg, rgba(16, 24, 40, 0.85) 0%, rgba(10, 15, 28, 0.95) 100%)",
                    border: "1px solid rgba(59, 130, 246, 0.22)",
                    borderRadius: 20,
                    padding: "16px 20px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.35)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>
                      🏢 IDC 단지 통합 스마트 운영·유지관리 구역 (제안서 Page 04)
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>전산실 · 배전실 · 냉각 발전 설비 전 구역 커버</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { num: "01", name: "데이터센터 / 서버 구역", models: "Flagship · Pro", desc: "48U 랙 전고 점검 및 RFID 실사" },
                      { num: "02", name: "네트워크 통신실", models: "Flagship · Pro", desc: "패치패널 연결 및 케이블 발열 감시" },
                      { num: "03", name: "전력센터 / UPS / 저압 배전실", models: "Power · Pro", desc: "TEV/AE 부분방전 & 계량기 판독" },
                      { num: "04", name: "냉각 설비실", models: "다종 센서", desc: "온습도 클라우드 맵 · 누수 · 가스 감시" },
                      { num: "05", name: "디젤 발전기실", models: "열화상 · 소음", desc: "열화상 핫스팟 · 이상 소음 · 진동 감시" },
                      { num: "06", name: "통합 관제실", models: "3D Digital Twin", desc: "WebSocket 실시간 로봇 관제 & CMDB 연동" },
                    ].map((zone) => (
                      <div
                        key={zone.num}
                        style={{
                          background: "rgba(8, 12, 22, 0.7)",
                          borderLeft: "3px solid #3b82f6",
                          padding: "8px 12px",
                          borderRadius: "0 8px 8px 0",
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: "#f1f5f9" }}>
                            {zone.num} {zone.name}
                          </span>
                          <span style={{ fontSize: 10, color: "#38bdf8", fontWeight: 700 }}>
                            {zone.models}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{zone.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3D Map Preview Card */}
                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    borderRadius: 20,
                    overflow: "hidden",
                    border: "1px solid rgba(59, 130, 246, 0.22)",
                  }}
                >
                  <UnifiedMapViewer3D
                    mapData={mapData}
                    robots={robots}
                    selectedRobotId={selectedRobotId}
                    onSelectRobot={(id) => setSelectedRobotId(id)}
                    onOpenRobotPopup={(r) => setPopupRobot(r)}
                    showOdomVectors={false}
                    isDarkMode={isDarkMode}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ==============================================================
              Slide 02: PART 02 Indoor 3-Robot Lineup + 3D Click-to-Popup Showcase
             ============================================================== */}
          {currentSlideIdx === 1 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "350px 1fr", gap: 18, minHeight: 0 }}>
              {/* Left Column: 3 Indoor Robot Lineup Cards (Scrollbar Hidden) */}
              <div
                className="no-scrollbar"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  overflowY: "auto",
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                }}
              >
                {robots.map((r) => {
                  const isSel = r.id === selectedRobotId;
                  const themeCol = r.color || "#3b82f6";
                  const isPower = r.id.includes("power") || r.id.includes("pwr");
                  const isPro = r.id.includes("pro");
                  const chips = isPower
                    ? ["2.3m 고전압 승강", "TEV/AE 부분방전", "4륜 독립 서스펜션", "등판 13°"]
                    : isPro
                    ? ["6+2축 듀얼 로봇팔", "5단계 도어 자동개폐", "±0.05mm 정밀도", "IP32 등급"]
                    : ["48U 랙 전고 커버", "시간당 200개 랙 실사", "초고속 RFID", "±2cm SLAM"];

                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedRobotId(r.id);
                        setPopupRobot(r);
                      }}
                      style={{
                        background: isSel
                          ? "linear-gradient(145deg, rgba(20, 32, 58, 0.95) 0%, rgba(12, 18, 34, 0.95) 100%)"
                          : "linear-gradient(145deg, rgba(16, 24, 40, 0.8) 0%, rgba(10, 15, 28, 0.9) 100%)",
                        border: `1.5px solid ${isSel ? themeCol : "rgba(255, 255, 255, 0.1)"}`,
                        borderRadius: 16,
                        padding: "13px 16px",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        boxShadow: isSel ? `0 8px 24px ${themeCol}25` : "0 4px 16px rgba(0,0,0,0.3)",
                      }}
                    >
                      {/* Badge Row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span
                          style={{
                            background: `${themeCol}22`,
                            color: themeCol,
                            border: `1px solid ${themeCol}55`,
                            padding: "2.5px 9px",
                            borderRadius: 99,
                            fontSize: 10.5,
                            fontWeight: 800,
                          }}
                        >
                          {r.edition_badge}
                        </span>
                        <span style={{ fontSize: 10.5, color: "#4ade80", fontWeight: 700 }}>
                          KC {r.rra_cert_no}
                        </span>
                      </div>

                      {/* Robot Name & Subtitle */}
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>
                          {r.display_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2, lineHeight: 1.4, wordBreak: "keep-all" }}>
                          {r.target_site}
                        </div>
                      </div>

                      {/* Spec Chips */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {chips.map((c) => (
                          <span
                            key={c}
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.08)",
                              padding: "2.5px 7px",
                              borderRadius: 5,
                              fontSize: 10.5,
                              color: "#cbd5e1",
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>

                      {/* Card Footer: Live Status & Battery */}
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginTop: 2,
                          paddingTop: 6,
                          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
                          fontSize: 11,
                        }}
                      >
                        <span style={{ color: "#cbd5e1", display: "flex", alignItems: "center", gap: 6 }}>
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS" ? "#22c55e" : "#71717a",
                            }}
                          />
                          <span>현위치: <b style={{ color: "#ffffff" }}>{r.telemetry?.position_name}</b></span>
                        </span>
                        <span style={{ color: "#4ade80", fontWeight: 800 }}>
                          {r.telemetry?.battery_pct ?? 0}%
                        </span>
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px dashed rgba(59, 130, 246, 0.35)",
                    borderRadius: 12,
                    padding: "8px 12px",
                    fontSize: 11,
                    color: "#93c5fd",
                    textAlign: "center",
                  }}
                >
                  💡 <b>카드를 클릭</b>하면 3-View 외형, 부품 센서 분해도, 핵심 강점, 실시간 API 텔레메트리 <b>4-슬라이드 팝업</b>이 열립니다.
                </div>
              </div>

              {/* Right Column: Full Interactive 3D Simulation Environment */}
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                }}
              >
                <UnifiedMapViewer3D
                  mapData={mapData}
                  robots={robots}
                  selectedRobotId={selectedRobotId}
                  onSelectRobot={(id) => setSelectedRobotId(id)}
                  onOpenRobotPopup={(r) => setPopupRobot(r)}
                  showOdomVectors={false}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          )}

          {/* ==============================================================
              Slide 03: CORE TECHNOLOGY (4 Core Techs from Page 16 + Dual map.pgm SE(2) Fusion)
             ============================================================== */}
          {currentSlideIdx === 2 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "48% 52%", gap: 18, minHeight: 0 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "space-between", minHeight: 0 }}>
                {/* 4 Core Technology Boxes Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    {
                      num: "01 SLAM & MAP FUSION",
                      title: "듀얼 map.pgm 정합 & 위치 보정",
                      color: isDarkMode ? "#00f2fe" : "#0284c7",
                      items: [
                        "Flagship(167×164) + Power(199×425) 병합",
                        "Power 맵 ΔΘ=+90.25°, ΔX=+1.65m, ΔY=-5.875m",
                        "SE(2) 변환 행렬로 로봇 현위치 3D 자동 정합",
                      ],
                    },
                    {
                      num: "02 ROBOTIC ARM (Pro)",
                      title: "6+2축 로봇 팔 복합 물리 조작",
                      color: isDarkMode ? "#a855f7" : "#7e22ce",
                      items: [
                        "6축 메인(±0.05mm) + 2축 보조 암 상호 협동",
                        "캐비닛 도어 5단계 자동 개폐 및 버튼 조작",
                        "배전실 차단기 레버 조작 및 계측기 접촉",
                      ],
                    },
                    {
                      num: "03 VISION RECOGNITION",
                      title: "표시등 & 계측기 AI 비전 인식",
                      color: isDarkMode ? "#38bdf8" : "#0369a1",
                      items: [
                        "서버 표시등(LED) 색상 감지 및 점멸 측정",
                        "아날로그/디지털 계측기 지침 실시간 자동 판독",
                        "열화상 과열 핫스팟 탐지 및 고장 등급 판정",
                      ],
                    },
                    {
                      num: "04 RFID READER",
                      title: "능동/수동형 RFID 무접촉 실사",
                      color: isDarkMode ? "#f59e0b" : "#b45309",
                      items: [
                        "도어 폐쇄 상태 금속 메쉬 간섭 극복 인식",
                        "시간당 최대 200개 랙 자산 초고속 자동 실사",
                        "미승인 자산 이동 및 위치 변경 즉시 감지",
                      ],
                    },
                  ].map((tech) => (
                    <div
                      key={tech.num}
                      style={{
                        background: isDarkMode
                          ? "linear-gradient(145deg, rgba(16, 24, 40, 0.8) 0%, rgba(10, 15, 28, 0.9) 100%)"
                          : "#ffffff",
                        border: isDarkMode
                          ? "1px solid rgba(255, 255, 255, 0.08)"
                          : "1px solid #cbd5e1",
                        borderTop: `3.5px solid ${tech.color}`,
                        borderRadius: 14,
                        padding: 14,
                        boxShadow: isDarkMode ? "none" : "0 4px 16px rgba(15, 23, 42, 0.05)",
                      }}
                    >
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: tech.color }}>{tech.num}</div>
                      <div
                        style={{
                          fontSize: 14.5,
                          fontWeight: 800,
                          margin: "4px 0 8px 0",
                          color: isDarkMode ? "#ffffff" : "#020617",
                        }}
                      >
                        {tech.title}
                      </div>
                      {tech.items.map((it) => (
                        <div
                          key={it}
                          style={{
                            fontSize: 11.5,
                            color: isDarkMode ? "#cbd5e1" : "#0f172a",
                            fontWeight: isDarkMode ? 400 : 500,
                            marginBottom: 3,
                            lineHeight: 1.4,
                          }}
                        >
                          • {it}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* 2D map.pgm Fusion Verification Card */}
                <div
                  style={{
                    background: isDarkMode
                      ? "linear-gradient(145deg, rgba(16, 24, 40, 0.85) 0%, rgba(10, 15, 28, 0.95) 100%)"
                      : "#ffffff",
                    border: isDarkMode
                      ? "1px solid rgba(59, 130, 246, 0.22)"
                      : "1px solid #cbd5e1",
                    borderRadius: 16,
                    padding: 14,
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: 14,
                    alignItems: "center",
                    boxShadow: isDarkMode ? "none" : "0 4px 16px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div
                    style={{
                      height: 120,
                      background: "#080c16",
                      borderRadius: 10,
                      overflow: "hidden",
                      border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #cbd5e1",
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
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: isDarkMode ? "#4ade80" : "#15803d",
                        marginBottom: 4,
                      }}
                    >
                      🧩 2개 로봇 `map.pgm` 실시간 정합 결과 (일치 블록: {mapData?.master_map?.overlap_count || 0}개)
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: isDarkMode ? "#cbd5e1" : "#0f172a",
                        fontWeight: isDarkMode ? 400 : 500,
                        lineHeight: 1.5,
                        fontFamily: "monospace",
                      }}
                    >
                      • <span style={{ color: isDarkMode ? "#38bdf8" : "#0284c7", fontWeight: 700 }}>■ 청록 (80% 투명 불일치부)</span>: Flagship |{" "}
                      <span style={{ color: isDarkMode ? "#fbbf24" : "#b45309", fontWeight: 700 }}>■ 주황 (80% 투명 불일치부)</span>: Power (+90.25° 보정) |{" "}
                      <span style={{ color: isDarkMode ? "#4ade80" : "#15803d", fontWeight: 700 }}>■ 녹색</span>: 두 맵 완벽 일치 벽면
                      <br />• Flagship 현위치: Odom({robots[0]?.telemetry?.local_x}, {robots[0]?.telemetry?.local_y}) ➔ 3D({robots[0]?.telemetry?.world_x}, {robots[0]?.telemetry?.world_y})m
                      <br />• Power 현위치: Odom({robots[2]?.telemetry?.local_x}, {robots[2]?.telemetry?.local_y}) ➔ 3D({robots[2]?.telemetry?.world_x}, {robots[2]?.telemetry?.world_y})m
                    </div>
                  </div>
                </div>
              </div>

              {/* 3D Map View with Odom Vectors */}
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                }}
              >
                <UnifiedMapViewer3D
                  mapData={mapData}
                  robots={robots}
                  selectedRobotId={selectedRobotId}
                  onSelectRobot={(id) => setSelectedRobotId(id)}
                  onOpenRobotPopup={(r) => setPopupRobot(r)}
                  showOdomVectors={true}
                  isDarkMode={isDarkMode}
                />
              </div>
            </div>
          )}

          {/* ==============================================================
              Slide 04: PLATFORM Multi-Robot Management Platform
             ============================================================== */}
          {currentSlideIdx === 3 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 18, minHeight: 0 }}>
              <div
                style={{
                  borderRadius: 20,
                  overflow: "hidden",
                  border: "1px solid rgba(59, 130, 246, 0.22)",
                }}
              >
                <UnifiedMapViewer3D
                  mapData={mapData}
                  robots={robots}
                  selectedRobotId={selectedRobotId}
                  onSelectRobot={(id) => setSelectedRobotId(id)}
                  onOpenRobotPopup={(r) => setPopupRobot(r)}
                  showOdomVectors={true}
                  isDarkMode={isDarkMode}
                />
              </div>

              <div
                style={{
                  background: "linear-gradient(145deg, rgba(16, 24, 40, 0.85) 0%, rgba(10, 15, 28, 0.95) 100%)",
                  border: "1px solid rgba(59, 130, 246, 0.25)",
                  borderRadius: 20,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800, color: "#4ade80", marginBottom: 6 }}>
                  📡 실환경 WebSocket (`robotStatus`) & REST API 스트림 콘솔
                </div>
                <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 12 }}>
                  실제 로봇 IP(`10.200.28.63`, `10.200.28.61`)의 Webserver Bearer 토큰 인증 및 실시간 오도메트리 수신 데이터입니다.
                </div>

                <pre
                  style={{
                    flex: 1,
                    background: "#080c16",
                    padding: 14,
                    borderRadius: 12,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#4ade80",
                    overflowY: "auto",
                    margin: 0,
                    lineHeight: 1.5,
                    border: "1px solid rgba(255, 255, 255, 0.06)",
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

          {/* ==============================================================
              Slide 05: PART 04 Customer Value (ROI Table Page 25) & Global References
             ============================================================== */}
          {currentSlideIdx === 4 && (
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.18fr 1fr", gap: 18, minHeight: 0 }}>
              {/* Left Column: Full-Height ROI Comparison Dashboard (Page 25) */}
              <div
                style={{
                  background: "linear-gradient(145deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 28, 0.98) 100%)",
                  border: "1px solid rgba(59, 130, 246, 0.28)",
                  borderRadius: 20,
                  padding: "20px 24px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
                  minHeight: 0,
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          background: "rgba(59, 130, 246, 0.2)",
                          color: "#38bdf8",
                          border: "1px solid rgba(59, 130, 246, 0.45)",
                          fontSize: 11.5,
                          fontWeight: 800,
                          padding: "3px 10px",
                          borderRadius: 6,
                        }}
                      >
                        PART 04 · CUSTOMER VALUE
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 900, color: "#ffffff" }}>
                        수동 운영 대비 AI 로봇 도입 실측 효과
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 700 }}>
                      제안서 Page 25 실측 통계치 기준
                    </span>
                  </div>

                  {/* 4 Impact Summary KPI Cards - Enlarged and Punchy */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
                    {[
                      { num: "300% ↑", label: "순찰 빈도 향상", sub: "2회 ➔ 6회/일", color: "#38bdf8" },
                      { num: "98.7% ↓", label: "장애 발견 단축", sub: "2시간 ➔ 5~15분", color: "#00f2fe" },
                      { num: "100%", label: "디지털 자동 기록", sub: "종이 수기 ➔ DB연동", color: "#4ade80" },
                      { num: "84% ↓", label: "현장 출동 감소", sub: "50회 ➔ 8회", color: "#facc15" },
                    ].map((k) => (
                      <div
                        key={k.label}
                        style={{
                          background: "rgba(8, 12, 22, 0.8)",
                          borderLeft: `4px solid ${k.color}`,
                          border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderLeftWidth: 4,
                          borderRadius: "0 10px 10px 0",
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontSize: 21, fontWeight: 900, color: k.color, letterSpacing: "-0.5px" }}>{k.num}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>{k.label}</div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", marginTop: 2 }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* 7-Row Comparison Table - Enlarged Font and Spacious Rows */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13.5 }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                        background: "linear-gradient(90deg, rgba(2, 132, 199, 0.9) 0%, rgba(14, 165, 233, 0.9) 100%)",
                        padding: "10px 14px",
                        borderRadius: 8,
                        fontWeight: 800,
                        color: "#ffffff",
                        letterSpacing: "0.2px",
                      }}
                    >
                      <span>서버실 운영 항목</span>
                      <span>수동 운영</span>
                      <span>AI 스마트 로봇</span>
                      <span style={{ textAlign: "right" }}>도입 실측 효과</span>
                    </div>

                    {[
                      ["순찰 효율", "2회 / 일", "6회 / 일", "300% ↑"],
                      ["순찰 기록 방식", "종이 수기 기록", "데이터 자동 기록", "100% 디지털화"],
                      ["평균 장애 발견 시간", "2시간", "5 ~ 15분", "98.7% ↓"],
                      ["평균 장애 위치 확인", "4시간", "1시간", "75% ↓"],
                      ["평균 장애 해결 시간", "6시간", "2시간", "67% ↓"],
                      ["다중 서버실 현장 운영", "50회", "8회", "84% ↓"],
                      ["운영 보고서 통계 시간", "월 최소 4일", "필요 시 즉시 내보내기", "100% 자동화"],
                    ].map(([item, manual, bot, eff]) => (
                      <div
                        key={item}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.4fr 1fr 1fr 1fr",
                          background: "rgba(8, 12, 22, 0.7)",
                          border: "1px solid rgba(255, 255, 255, 0.06)",
                          padding: "9px 14px",
                          borderRadius: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontWeight: 800, color: "#f8fafc" }}>{item}</span>
                        <span style={{ color: "#94a3b8" }}>{manual}</span>
                        <span style={{ color: "#38bdf8", fontWeight: 800 }}>{bot}</span>
                        <span style={{ color: "#4ade80", fontWeight: 900, textAlign: "right" }}>{eff}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bottom Structured Service Box from Page 25: 6 Lifecycle Support Services */}
                <div
                  style={{
                    marginTop: 12,
                    background: "rgba(8, 12, 22, 0.75)",
                    border: "1px solid rgba(59, 130, 246, 0.22)",
                    borderRadius: 12,
                    padding: "11px 14px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: "#38bdf8" }}>
                      🛡️ SR ROBOTICS 6대 전주기 운영 지원 서비스 체계 (제안서 Page 25)
                    </span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>글로벌 100+ 고객사 현장 검증</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                    {[
                      { step: "01", title: "신속한 셋업", sub: "현장 즉시 투입" },
                      { step: "02", title: "솔루션 설계", sub: "고객 맞춤형" },
                      { step: "03", title: "교육 및 지원", sub: "포괄 제품 교육" },
                      { step: "04", title: "24H 원격지원", sub: "원격 개입 대응" },
                      { step: "05", title: "전주기 서비스", sub: "부품 수명 관리" },
                      { step: "06", title: "전문 컨설팅", sub: "운영 유지보수" },
                    ].map((s) => (
                      <div
                        key={s.step}
                        style={{
                          background: "rgba(15, 23, 42, 0.8)",
                          borderTop: "2.5px solid #00f2fe",
                          borderRadius: 6,
                          padding: "6px 4px",
                          textAlign: "center",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 800, color: "#00f2fe" }}>{s.step}</div>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: "#ffffff", marginTop: 2 }}>{s.title}</div>
                        <div style={{ fontSize: 9.5, color: "#94a3b8", marginTop: 1 }}>{s.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: 4 Key Cooperation Cases - Enlarged Cards & Typography */}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%", minHeight: 0 }}>
                {[
                  {
                    badge: "CASE 01 · SK하이닉스 자산관리 시스템",
                    stats: "1,000㎡ (IDC 3개) · 900개 캐비닛 · 3,000대 장비",
                    chips: ["순찰 로봇 3대", "멀티로봇 플랫폼", "자산관리 시스템 1세트"],
                    desc: "스마트 순찰 로봇을 통한 데이터센터 IT 자산 무개방 자동 실사, CMDB·창고관리·용량계획 실시간 시각화 구현",
                    color: "#3b82f6",
                  },
                  {
                    badge: "CASE 02 · 삼성SDI(시안) 서버실 스마트 순찰",
                    stats: "150㎡ 서버실 · 50개 랙 · 300대 총 장비",
                    chips: ["순찰 로봇 1대(임대)", "신호등/온도 실시간 감지", "인간-로봇 협업"],
                    desc: "IT 장비 신호등 상태 감지, 표면 온도 및 환경 모니터링 실시간 녹화, IT/MES·Oracle DB 운영과 결합된 인간-로봇 협업",
                    color: "#00f2fe",
                  },
                  {
                    badge: "CASE 03 · 남방항공 바이윈공항 데이터센터",
                    stats: "3,400㎡ 데이터센터 · 930개 랙 · 5,500대 장비",
                    chips: ["순찰 로봇 7대", "72세트 모듈 도어 연동", "고객 CMDB 동기화"],
                    desc: "로봇 7대 + 멀티로봇 관리 플랫폼, 72세트 모듈식 도어 연동 자동 제어, 2D 평면도 기반 랙 상태 실시간 관제 및 고객 CMDB 동기화",
                    color: "#a855f7",
                  },
                  {
                    badge: "SI & 유지보수 · 신한은행 / 오리온 / 화홍반도체",
                    stats: "7×24H 전 계층 인프라 유지보수 · DELL / IBM / HUAWEI / VMware",
                    chips: ["신한은행 3개 서버실", "오리온 무중단 이전", "화홍반도체 CIM 2기"],
                    desc: "신한은행 메인·재해복구 64대 서버/스토리지 24×365 운영, 오리온 네트워크 L3 코어 이중화 무중단 이전, 화홍반도체 CIM 2기 및 200여 개 MES DB 운영",
                    color: "#f59e0b",
                  },
                ].map((c) => (
                  <div
                    key={c.badge}
                    style={{
                      flex: 1,
                      background: "linear-gradient(145deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 28, 0.98) 100%)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderLeft: `5px solid ${c.color}`,
                      borderRadius: "0 16px 16px 0",
                      padding: "16px 20px",
                      boxShadow: "0 6px 20px rgba(0, 0, 0, 0.35)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.2px" }}>
                          {c.badge}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 800,
                            color: c.color,
                            background: "rgba(8, 12, 22, 0.7)",
                            border: `1px solid ${c.color}55`,
                            borderRadius: 6,
                            padding: "3px 8px",
                          }}
                        >
                          {c.stats}
                        </span>
                      </div>

                      {/* Feature Chips */}
                      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                        {c.chips.map((chip, i) => (
                          <span
                            key={i}
                            style={{
                              background: "rgba(255, 255, 255, 0.05)",
                              border: "1px solid rgba(255, 255, 255, 0.1)",
                              borderRadius: 4,
                              padding: "2px 8px",
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: "#e2e8f0",
                            }}
                          >
                            ✓ {chip}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.55, wordBreak: "keep-all" }}>
                      {c.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ==============================================================
              Slide 06: PART 05 Live Robot Fleet Camera, Sensors & One-Click Operations
             ============================================================== */}
          {currentSlideIdx === 5 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
              {/* Top Fleet Information Hub Bar */}
              <div
                style={{
                  background: "linear-gradient(90deg, rgba(16, 24, 40, 0.95) 0%, rgba(15, 23, 42, 0.9) 100%)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  borderRadius: 14,
                  padding: "10px 18px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      background: "rgba(34, 197, 94, 0.18)",
                      border: "1px solid #22c55e",
                      color: "#4ade80",
                      padding: "3px 10px",
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 800,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
                    LIVE TELEMETRY BUS CONNECTED
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, color: "#ffffff" }}>
                    실환경 로봇 카메라 소켓 · 센서 텔레메트리 & 원클릭 작업 제어 허브
                  </span>
                </div>

                <div style={{ display: "flex", gap: 8, fontSize: 11, fontFamily: "monospace" }}>
                  <span style={{ background: "rgba(2, 6, 23, 0.7)", border: "1px solid #334155", borderRadius: 6, padding: "3px 8px", color: "#38bdf8" }}>
                    WS: ws://10.200.28.63/websocket/ (Flagship)
                  </span>
                  <span style={{ background: "rgba(2, 6, 23, 0.7)", border: "1px solid #334155", borderRadius: 6, padding: "3px 8px", color: "#00f2fe" }}>
                    WS: ws://10.200.28.61/websocket/ (Power)
                  </span>
                  <span style={{ background: "rgba(2, 6, 23, 0.7)", border: "1px solid #334155", borderRadius: 6, padding: "3px 8px", color: "#a855f7" }}>
                    11개 랙/캐비닛 자산 연동
                  </span>
                </div>
              </div>

              {/* 3 Robot Cards Grid */}
              <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, minHeight: 0 }}>
                {robots.map((r) => {
                  const isPower = r.id.includes("pwr") || r.id.includes("power");
                  const isPro = r.id.includes("pro");
                  const frontImg = isPower
                    ? "/proposal_images/power_front.jpeg"
                    : isPro
                    ? "/proposal_images/pro_front.jpeg"
                    : "/proposal_images/flagship_front.jpeg";
                  const isLive = r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS";
                  const rFleet = fleetData?.fleet?.[r.id] || {};
                  const camCount = rFleet.cameras?.length || (isPower ? 23 : isPro ? 8 : 12);
                  const pathCount = rFleet.paths?.length || (isPower ? 1 : isPro ? 0 : 4);

                  return (
                    <div
                      key={r.id}
                      onClick={() => setLiveOpRobot(r)}
                      style={{
                        background: "linear-gradient(145deg, rgba(16, 24, 40, 0.92) 0%, rgba(10, 15, 28, 0.98) 100%)",
                        border: "1.5px solid rgba(59, 130, 246, 0.28)",
                        borderRadius: 18,
                        padding: "16px 18px",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all 0.25s ease",
                        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "#3b82f6";
                        e.currentTarget.style.transform = "translateY(-4px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "rgba(59, 130, 246, 0.28)";
                        e.currentTarget.style.transform = "translateY(0px)";
                      }}
                    >
                      <div>
                        {/* Card Header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                          <div>
                            <span
                              style={{
                                background: "rgba(59, 130, 246, 0.16)",
                                border: "1px solid rgba(59, 130, 246, 0.4)",
                                color: "#38bdf8",
                                fontSize: 11,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 5,
                                marginRight: 6,
                              }}
                            >
                              {r.edition_badge || "EDITION"}
                            </span>
                            <span style={{ fontSize: 15.5, fontWeight: 900, color: "#ffffff" }}>
                              {r.display_name.split(" (")[0]}
                            </span>
                          </div>

                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: isLive ? "#4ade80" : "#a1a1aa",
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
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
                            {isLive ? `${r.ip}:80` : "STANDBY"}
                          </span>
                        </div>

                        {/* Large Front Photo Box */}
                        <div
                          style={{
                            height: 220,
                            background: "#030712",
                            borderRadius: 14,
                            overflow: "hidden",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            marginBottom: 12,
                          }}
                        >
                          <img
                            src={frontImg}
                            alt={r.display_name}
                            style={{ maxHeight: "95%", maxWidth: "90%", objectFit: "contain" }}
                          />
                        </div>

                        {/* Quick 4-Grid Status Indicators */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, fontSize: 11.5 }}>
                          <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div style={{ color: "#94a3b8", fontSize: 10 }}>동작 상태</div>
                            <div style={{ color: "#4ade80", fontWeight: 800, marginTop: 2, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {r.telemetry?.fsm_state || "READY (STANDBY)"}
                            </div>
                          </div>

                          <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div style={{ color: "#94a3b8", fontSize: 10 }}>배터리 전원</div>
                            <div style={{ color: "#38bdf8", fontWeight: 800, marginTop: 2 }}>
                              {r.telemetry?.battery_pct ?? 100}% ({r.telemetry?.voltage_v ?? 28.09}V)
                            </div>
                          </div>

                          <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div style={{ color: "#94a3b8", fontSize: 10 }}>현재 위치</div>
                            <div style={{ color: "#ffffff", fontWeight: 700, marginTop: 2, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                              {r.telemetry?.position_name || "충전 도크"}
                            </div>
                          </div>

                          <div style={{ background: "rgba(15, 23, 42, 0.75)", padding: "7px 10px", borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                            <div style={{ color: "#94a3b8", fontSize: 10 }}>카메라 / 순찰경로</div>
                            <div style={{ color: "#facc15", fontWeight: 800, marginTop: 2 }}>
                              {camCount}대 카메라 · {pathCount}개 경로
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Bottom One-Click Trigger Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setLiveOpRobot(r);
                        }}
                        style={{
                          marginTop: 12,
                          background: "linear-gradient(90deg, #2563eb 0%, #1d4ed8 100%)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: 10,
                          padding: "10px 0",
                          fontSize: 12.5,
                          fontWeight: 800,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          boxShadow: "0 4px 14px rgba(37, 99, 235, 0.4)",
                        }}
                      >
                        <span>⚡</span>
                        <span>실시간 카메라 · 센서 모니터링 & 원클릭 제어 →</span>
                      </button>
                    </div>
                  );
                })}
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
            {/* Bottom-Right Theme Toggle Button */}
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="theme-toggle-pill"
              title={isDarkMode ? "라이트 모드로 전환 (기본 Light 폰트)" : "다크 모드로 전환"}
              style={{ marginRight: 6 }}
            >
              <span>{isDarkMode ? "☀️ Light" : "🌙 Dark"}</span>
            </button>

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

      {/* Live Robot Multi-Camera, Sensor & One-Click Operation Modal */}
      {liveOpRobot && (
        <RobotLiveOperationModal
          robot={robots.find((r) => r.id === liveOpRobot.id) || liveOpRobot}
          fleetData={fleetData}
          onClose={() => setLiveOpRobot(null)}
          onActionExecute={handleExecuteAction}
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
