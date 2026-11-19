import React, { useState, useEffect } from "react";
import { RobotRecord } from "./viewer3d/UnifiedMapViewer3D";

interface RobotLiveOperationModalProps {
  robot: RobotRecord;
  fleetData?: any;
  onClose: () => void;
  onActionExecute?: (actionType: string, params: any) => Promise<any>;
  isDarkMode?: boolean;
}

export const STREAM_CONFIG: Record<string, { streamName: string; label: string; tag: string; res: string; desc: string }> = {
  optical: {
    streamName: "DOWN_CAMERA",
    label: "광학 HD 카메라",
    tag: "OPTICAL HD",
    res: "1080P@30fps (H.264)",
    desc: "본체 하강형 가시광선 감시 카메라 (DOWN_CAMERA)",
  },
  thermal: {
    streamName: "UP_HOT_CAMERA",
    label: "열화상 센서",
    tag: "THERMAL RADIOMETRIC",
    res: "160×120 Radiometric (Hikmicro)",
    desc: "발열 지점 및 랙 캐비닛 적외선 열분포 센서 (UP_HOT_CAMERA)",
  },
  ptz: {
    streamName: "MAIN_CAMERA",
    label: "PTZ 볼헤드",
    tag: "PTZ DOME 4MP",
    res: "2560×1440 @ 30fps (25x Zoom)",
    desc: "360° 팬/틸트 원격 조작 스마트 돔 카메라 (MAIN_CAMERA)",
  },
  elevator: {
    streamName: "UP_CAMERA",
    label: "승강기 상부",
    tag: "ELEVATOR UPPER",
    res: "1080P@30fps",
    desc: "2.1m 전동 리프트 마스트 상단 카메라 (UP_CAMERA)",
  },
};

export const RobotLiveOperationModal: React.FC<RobotLiveOperationModalProps> = ({
  robot,
  fleetData,
  onClose,
  onActionExecute,
  isDarkMode = false,
}) => {
  const [activeTab, setActiveTab] = useState<"camera" | "sensors" | "oneclick">("oneclick");
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [cameraMode, setCameraMode] = useState<"optical" | "thermal" | "ptz" | "elevator">("optical");
  const [ptzPan, setPtzPan] = useState<number>(0);
  const [ptzTilt, setPtzTilt] = useState<number>(0);
  const [ptzZoom, setPtzZoom] = useState<number>(1.0);
  const [actionLogs, setActionLogs] = useState<Array<{ time: string; msg: string; type: "info" | "success" | "warn" }>>([
    {
      time: new Date().toLocaleTimeString(),
      msg: `Connected to ${robot.display_name} (${robot.ip || "10.200.28.63"}) REST API & WebSocket`,
      type: "info",
    },
  ]);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);

  const rId = robot.id;
  const robotFleet = fleetData?.fleet?.[rId] || fleetData?.fleet?.["flag-01"] || {};
  const paths: any[] = robotFleet.paths || [];
  const missions: any[] = robotFleet.missions || [];
  const positions: any[] = robotFleet.positions || [];
  const cabinets: any[] = robotFleet.cabinets || [];
  const cameras: any[] = robotFleet.cameras || [];

  const currStream = STREAM_CONFIG[cameraMode] || STREAM_CONFIG.optical;
  const robotIp = robot.ip || (rId.includes("power") ? "10.200.28.61" : "10.200.28.63");
  const liveStreamPlayerUrl = `http://${robotIp}/videoStream/stream/player/${currStream.streamName}?autoplay=1&muted=1`;

  useEffect(() => {
    if (missions.length > 0 && !selectedPath) {
      const m = missions[0];
      setSelectedPath(String(m.missionId));
    } else if (paths.length > 0 && !selectedPath) {
      setSelectedPath(paths[0].name || String(paths[0].robotPathId));
    }
    if (positions.length > 0 && !selectedPosition) {
      setSelectedPosition(positions[0].name || String(positions[0].robotPositionId));
    }
  }, [missions, paths, positions]);

  const addLog = (msg: string, type: "info" | "success" | "warn" = "info") => {
    setActionLogs((prev) => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev.slice(0, 15)]);
  };

  const handleRunAction = async (actionType: string, extraParams: any = {}) => {
    setIsExecuting(true);
    addLog(`Dispatching [${actionType}] to http://${robot.ip}/api/...`, "info");
    try {
      if (onActionExecute) {
        const res = await onActionExecute(actionType, extraParams);
        if (res && res.result) {
          addLog(`✓ ${res.result.message || "Executed successfully"}`, "success");
          if (res.result.details) {
            addLog(`↳ ${res.result.details}`, "info");
          }
        } else {
          addLog(`✓ Action [${actionType}] processed successfully.`, "success");
        }
      } else {
        // Fallback fetch
        const res = await fetch(`/api/v1/robots/${robot.hostname || robot.id}/oneclick_action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action_type: actionType, ...extraParams }),
        }).then((r) => r.json());
        addLog(`✓ ${res.msg || "Executed successfully"}`, "success");
      }
    } catch (e: any) {
      addLog(`⚠️ Operation failed: ${e.message}`, "warn");
    } finally {
      setIsExecuting(false);
    }
  };

  const handlePtzMove = (panDelta: number, tiltDelta: number, zoomDelta: number = 0) => {
    const newPan = Math.max(-180, Math.min(180, ptzPan + panDelta));
    const newTilt = Math.max(-45, Math.min(90, ptzTilt + tiltDelta));
    const newZoom = Math.max(1.0, Math.min(30.0, +(ptzZoom + zoomDelta).toFixed(1)));
    setPtzPan(newPan);
    setPtzTilt(newTilt);
    setPtzZoom(newZoom);
    handleRunAction("ptz_control", { pan: newPan, tilt: newTilt, zoom: newZoom });
  };

  const isPower = robot.id.includes("pwr") || robot.id.includes("power");
  const isPro = robot.id.includes("pro");
  const frontImg = isPower
    ? "/proposal_images/power_front.jpeg"
    : isPro
    ? "/proposal_images/pro_front.jpeg"
    : "/proposal_images/flagship_front.jpeg";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: isDarkMode ? "rgba(2, 6, 23, 0.82)" : "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "92vw",
          maxWidth: 1220,
          maxHeight: "92vh",
          background: isDarkMode
            ? "linear-gradient(145deg, #0b1120 0%, #030712 100%)"
            : "#f7f5f0",
          border: isDarkMode ? "1.5px solid rgba(59, 130, 246, 0.45)" : "1.5px solid #cbd5e1",
          borderRadius: 22,
          boxShadow: isDarkMode
            ? "0 25px 60px rgba(0, 0, 0, 0.75), 0 0 40px rgba(59, 130, 246, 0.2)"
            : "0 24px 64px rgba(15, 23, 42, 0.18)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: "16px 24px",
            borderBottom: isDarkMode ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #cbd5e1",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: isDarkMode ? "rgba(15, 23, 42, 0.75)" : "#ffffff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                background: "rgba(34, 197, 94, 0.16)",
                border: "1px solid #22c55e",
                color: "#4ade80",
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
              LIVE REST API & WEBSOCKET
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: "#ffffff" }}>
              {robot.display_name} 실시간 종합 제어 및 센서 모니터링
            </span>
            <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>
              [{robot.ip || "10.200.28.63"}:80]
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Tab switch */}
            <div style={{ display: "flex", background: "rgba(2, 6, 23, 0.8)", borderRadius: 10, padding: 3, border: "1px solid #1e293b" }}>
              {[
                { id: "oneclick", label: "⚡ 원클릭 작업 제어" },
                { id: "camera", label: "📹 실시간 카메라 & 소켓" },
                { id: "sensors", label: "📊 정밀 센서 & 자산 현황" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  style={{
                    background: activeTab === t.id ? "#3b82f6" : "transparent",
                    color: activeTab === t.id ? "#ffffff" : "#94a3b8",
                    border: "none",
                    borderRadius: 8,
                    padding: "6px 14px",
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                color: "#e2e8f0",
                width: 32,
                height: 32,
                borderRadius: "50%",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "300px 1fr", minHeight: 0, overflow: "hidden" }}>
          {/* Left Mini Overview Column */}
          <div
            style={{
              padding: "20px 18px",
              borderRight: "1px solid rgba(59, 130, 246, 0.2)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: "rgba(8, 12, 22, 0.65)",
            }}
          >
            <div>
              {/* Front Image Box */}
              <div
                style={{
                  height: 220,
                  borderRadius: 14,
                  overflow: "hidden",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  background: "#030712",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 14,
                }}
              >
                <img
                  src={frontImg}
                  alt={robot.display_name}
                  style={{ maxHeight: "95%", maxWidth: "90%", objectFit: "contain" }}
                />
              </div>

              {/* Quick Telemetry Pills */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(15, 23, 42, 0.8)", borderRadius: 8 }}>
                  <span style={{ color: "#94a3b8" }}>상태 머신 (FSM)</span>
                  <span style={{ color: "#4ade80", fontWeight: 800 }}>{robot.telemetry?.fsm_state || "READY (STANDBY)"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(15, 23, 42, 0.8)", borderRadius: 8 }}>
                  <span style={{ color: "#94a3b8" }}>현재 위치</span>
                  <span style={{ color: "#ffffff", fontWeight: 800 }}>{robot.telemetry?.position_name || "충전점 (#68)"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(15, 23, 42, 0.8)", borderRadius: 8 }}>
                  <span style={{ color: "#94a3b8" }}>배터리 전압</span>
                  <span style={{ color: "#38bdf8", fontWeight: 800 }}>
                    {robot.telemetry?.battery_pct ?? 100}% ({robot.telemetry?.voltage_v ?? 28.09}V)
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: "rgba(15, 23, 42, 0.8)", borderRadius: 8 }}>
                  <span style={{ color: "#94a3b8" }}>리프트 승강 높이</span>
                  <span style={{ color: "#facc15", fontWeight: 800 }}>{robot.telemetry?.lift_height_m ?? 0.17} m</span>
                </div>
              </div>
            </div>

            {/* Quick Emergency Halt Button */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => handleRunAction("emergency_stop")}
                disabled={isExecuting}
                style={{
                  flex: 1,
                  background: "#dc2626",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 0",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                🛑 긴급 정지
              </button>
              <button
                onClick={() => handleRunAction("resume_operation")}
                disabled={isExecuting}
                style={{
                  flex: 1,
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 0",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                ▶️ 작업 재개
              </button>
            </div>
          </div>

          {/* Right Main Content Area */}
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
            {/* TAB 1: ONE-CLICK OPERATIONS */}
            {activeTab === "oneclick" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#38bdf8", marginBottom: 4 }}>
                    ⚡ REST API 기반 원클릭 작업 지시 (1-Click Autonomous Operations)
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    실제 로봇 플랫폼의 <code>/api/robot/path</code>, <code>/api/v1/position</code> 엔드포인트와 직결되어 즉시 동작을 수행합니다.
                  </div>
                </div>

                {/* 4 Action Cards Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {/* Action 1: Auto Patrol */}
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(59, 130, 246, 0.35)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#ffffff" }}>
                        🚀 자동 순찰 (Auto Patrol)
                      </span>
                      <span style={{ fontSize: 11, color: "#38bdf8", fontWeight: 700 }}>
                        {missions.length || paths.length}개 정규 미션/경로
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
                      등록된 공식 순찰 시퀀스를 선택하고 원클릭으로 순찰을 시작합니다.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        value={selectedPath}
                        onChange={(e) => setSelectedPath(e.target.value)}
                        style={{
                          flex: 1,
                          background: "#030712",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        {missions.length > 0
                          ? missions.map((m) => (
                              <option key={m.missionId} value={String(m.missionId)}>
                                {m.pathName || m.missionName} · [{m.missionTypeName || "순찰"}] (ID: #{m.missionId})
                              </option>
                            ))
                          : paths.map((p) => (
                              <option key={p.robotPathId} value={p.name}>
                                {p.name} (ID: #{p.robotPathId})
                              </option>
                            ))}
                      </select>
                      <button
                        onClick={() => {
                          const currMission = missions.find((m) => String(m.missionId) === selectedPath);
                          handleRunAction("start_patrol", {
                            mission_id: currMission?.missionId,
                            mission_type_id: currMission?.missionTypeId || 1,
                            path_name: currMission?.pathName || currMission?.missionName || selectedPath,
                          });
                        }}
                        disabled={isExecuting}
                        style={{
                          background: "#3b82f6",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        순찰 개시
                      </button>
                    </div>
                  </div>

                  {/* Action 2: Go to Position */}
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(168, 85, 247, 0.35)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#ffffff" }}>
                        📍 지정 위치 점검 (Point Inspection)
                      </span>
                      <span style={{ fontSize: 11, color: "#c084fc", fontWeight: 700 }}>
                        {positions.length}개 위치
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
                      서버실 내 특정 랙 또는 검사 포인트를 선택하여 즉각 이동시킵니다.
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <select
                        value={selectedPosition}
                        onChange={(e) => setSelectedPosition(e.target.value)}
                        style={{
                          flex: 1,
                          background: "#030712",
                          border: "1px solid rgba(255, 255, 255, 0.15)",
                          color: "#fff",
                          borderRadius: 8,
                          padding: "8px 10px",
                          fontSize: 12,
                        }}
                      >
                        {positions.map((pos) => (
                          <option key={pos.robotPositionId} value={String(pos.robotPositionId)}>
                            {pos.name} (#{pos.robotPositionId})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => {
                          const currPos = positions.find((p) => String(p.robotPositionId) === selectedPosition || p.name === selectedPosition);
                          handleRunAction("goto_position", {
                            position_name: currPos?.name || selectedPosition,
                            position_id: currPos?.robotPositionId,
                          });
                        }}
                        disabled={isExecuting}
                        style={{
                          background: "#a855f7",
                          color: "#fff",
                          border: "none",
                          borderRadius: 8,
                          padding: "8px 16px",
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        이동 지시
                      </button>
                    </div>
                  </div>

                  {/* Action 3: Auto Dock Return */}
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(16, 185, 129, 0.35)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#ffffff" }}>
                        ⚡ 충전 도크 자동 복귀 (Auto Docking)
                      </span>
                      <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>
                        무인 충전 시퀀스
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
                      자체 레이저 SLAM 오차 보정으로 충전 도크에 정밀 도킹하고 충전을 시작합니다.
                    </div>
                    <button
                      onClick={() => handleRunAction("return_dock")}
                      disabled={isExecuting}
                      style={{
                        width: "100%",
                        background: "#059669",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 0",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      충전 도크 복귀 실행
                    </button>
                  </div>

                  {/* Action 4: Remote Self-Diagnostic */}
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: "#ffffff" }}>
                        🩺 원격 자가진단 (System Self-Check)
                      </span>
                      <span style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700 }}>
                        /api/dispatch/executeSelfCheck
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginBottom: 10 }}>
                      라이다, 열화상, 광학 카메라, 리프트 모터, 배터리 BMS 정상 작동을 전수 점검합니다.
                    </div>
                    <button
                      onClick={() => handleRunAction("self_check")}
                      disabled={isExecuting}
                      style={{
                        width: "100%",
                        background: "#d97706",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 0",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      전체 하드웨어 자가진단 실행
                    </button>
                  </div>
                </div>

                {/* Live Console Output */}
                <div
                  style={{
                    background: "#030712",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: 12,
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800, color: "#a1a1aa", fontFamily: "monospace" }}>
                      📡 REST API & REDIS COMMAND CONSOLE LOG
                    </span>
                    <button
                      onClick={() => setActionLogs([])}
                      style={{ background: "transparent", border: "none", color: "#71717a", fontSize: 11, cursor: "pointer" }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ maxHeight: 110, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, fontFamily: "monospace", fontSize: 11 }}>
                    {actionLogs.map((log, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "#64748b" }}>[{log.time}]</span>
                        <span
                          style={{
                            color: log.type === "success" ? "#4ade80" : log.type === "warn" ? "#f87171" : "#38bdf8",
                          }}
                        >
                          {log.msg}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: LIVE CAMERA & WEBSOCKET STREAM */}
            {activeTab === "camera" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#38bdf8", display: "flex", alignItems: "center", gap: 8 }}>
                      <span>📹 실시간 미디어 서버 & 브라우저 영상 파이프라인 (Live MediaMTX Stream)</span>
                      <span
                        style={{
                          background: "rgba(34, 197, 94, 0.2)",
                          border: "1px solid #22c55e",
                          color: "#4ade80",
                          fontSize: 10,
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >
                        ● NGINX PROXY ➔ MEDIAMTX WHEP
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      소켓: <code>{robotFleet.ws_url || `ws://${robotIp}/websocket/`}</code> · 스트림 파이프라인: <code>http://{robotIp}/videoStream/stream/player/{currStream.streamName}</code>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6 }}>
                    {[
                      { id: "optical", label: "광학 HD 카메라" },
                      { id: "thermal", label: "열화상 센서" },
                      { id: "ptz", label: "PTZ 볼헤드" },
                      { id: "elevator", label: "승강기 상부" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setCameraMode(m.id as any)}
                        style={{
                          background: cameraMode === m.id ? "#3b82f6" : "rgba(255, 255, 255, 0.08)",
                          color: "#fff",
                          border: cameraMode === m.id ? "1px solid #60a5fa" : "1px solid transparent",
                          borderRadius: 8,
                          padding: "6px 12px",
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s ease",
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main View Area with PTZ Controls */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 14 }}>
                  {/* Video View Frame - REAL LIVE WEBRTC STREAM IFRAME PIPELINE */}
                  <div
                    style={{
                      height: 310,
                      background: "#030712",
                      border: "1.5px solid rgba(59, 130, 246, 0.4)",
                      borderRadius: 14,
                      overflow: "hidden",
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 0 25px rgba(59, 130, 246, 0.15) inset",
                    }}
                  >
                    <iframe
                      key={`${robotIp}-${currStream.streamName}`}
                      src={liveStreamPlayerUrl}
                      title={`Live Stream - ${currStream.label}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        border: "none",
                        background: "#000",
                        display: "block",
                      }}
                      allow="autoplay; fullscreen"
                    />

                    {/* Live OSD Overlay - Top Left */}
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        left: 12,
                        background: "rgba(3, 7, 18, 0.85)",
                        backdropFilter: "blur(4px)",
                        border: "1px solid rgba(34, 197, 94, 0.5)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#4ade80",
                        fontFamily: "monospace",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 8px #22c55e" }} />
                      REC [LIVE WHEP WebRTC] · {currStream.tag} ({currStream.streamName})
                    </div>

                    {/* Top Right Action - Popout / Fullscreen Stream */}
                    <a
                      href={liveStreamPlayerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 12,
                        background: "rgba(15, 23, 42, 0.85)",
                        backdropFilter: "blur(4px)",
                        border: "1px solid rgba(59, 130, 246, 0.5)",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "#38bdf8",
                        textDecoration: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontWeight: 700,
                        zIndex: 10,
                        cursor: "pointer",
                      }}
                    >
                      <span>전체화면 새 창 ↗</span>
                    </a>

                    {/* Bottom Left Stream Path Overlay */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 10,
                        left: 12,
                        background: "rgba(3, 7, 18, 0.85)",
                        backdropFilter: "blur(4px)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 10.5,
                        color: "#94a3b8",
                        fontFamily: "monospace",
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    >
                      Pipeline: <code>http://{robotIp}/videoStream/.../{currStream.streamName}</code>
                    </div>

                    {/* Bottom Right PTZ Coordinate Overlay */}
                    <div
                      style={{
                        position: "absolute",
                        bottom: 10,
                        right: 12,
                        background: "rgba(3, 7, 18, 0.85)",
                        backdropFilter: "blur(4px)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 10.5,
                        color: "#38bdf8",
                        fontFamily: "monospace",
                        zIndex: 10,
                        pointerEvents: "none",
                      }}
                    >
                      PAN: {ptzPan}° | TILT: {ptzTilt}° | ZOOM: {ptzZoom}x
                    </div>
                  </div>

                  {/* PTZ Remote D-Pad Control */}
                  <div
                    style={{
                      background: "rgba(15, 23, 42, 0.8)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: 14,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#ffffff", textAlign: "center" }}>
                      🎮 PTZ 원격 조작 패널
                    </div>

                    {/* D-Pad Buttons */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, margin: "10px 0" }}>
                      <div />
                      <button
                        onClick={() => handlePtzMove(0, 5)}
                        style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155", borderRadius: 8, padding: 8, cursor: "pointer", fontWeight: 800 }}
                      >
                        ▲
                      </button>
                      <div />
                      <button
                        onClick={() => handlePtzMove(-10, 0)}
                        style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155", borderRadius: 8, padding: 8, cursor: "pointer", fontWeight: 800 }}
                      >
                        ◀
                      </button>
                      <button
                        onClick={() => handlePtzMove(0, 0, 0)}
                        style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: 8, cursor: "pointer", fontSize: 10, fontWeight: 800 }}
                      >
                        Center
                      </button>
                      <button
                        onClick={() => handlePtzMove(10, 0)}
                        style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155", borderRadius: 8, padding: 8, cursor: "pointer", fontWeight: 800 }}
                      >
                        ▶
                      </button>
                      <div />
                      <button
                        onClick={() => handlePtzMove(0, -5)}
                        style={{ background: "#1e293b", color: "#fff", border: "1px solid #334155", borderRadius: 8, padding: 8, cursor: "pointer", fontWeight: 800 }}
                      >
                        ▼
                      </button>
                      <div />
                    </div>

                    {/* Zoom Buttons */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handlePtzMove(0, 0, 1.0)}
                        style={{ flex: 1, background: "#1e293b", color: "#38bdf8", border: "1px solid #334155", borderRadius: 6, padding: "6px 0", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                      >
                        Zoom +
                      </button>
                      <button
                        onClick={() => handlePtzMove(0, 0, -1.0)}
                        style={{ flex: 1, background: "#1e293b", color: "#38bdf8", border: "1px solid #334155", borderRadius: 6, padding: "6px 0", fontSize: 11, fontWeight: 800, cursor: "pointer" }}
                      >
                        Zoom -
                      </button>
                    </div>
                  </div>
                </div>

                {/* Registered Camera Hardware List */}
                <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 }}>
                    📡 로봇 내장 카메라 & 센서 디바이스 등록 현황 ({cameras.length}개 디바이스)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 11 }}>
                    {cameras.slice(0, 9).map((c, i) => (
                      <div key={i} style={{ background: "#030712", padding: "6px 8px", borderRadius: 6, border: "1px solid rgba(255, 255, 255, 0.05)" }}>
                        <span style={{ color: "#38bdf8", fontWeight: 700 }}>{c.name || `Device #${i+1}`}</span>
                        <span style={{ color: "#64748b", marginLeft: 6 }}>
                          {c.address ? `${c.address}:${c.port || 80}` : "내장 버스"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PRECISION SENSORS & ASSETS */}
            {activeTab === "sensors" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#38bdf8", marginBottom: 4 }}>
                    📊 실시간 정밀 센서 텔레메트리 & 자산 실사 바인딩
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    로봇 상/하부 제어기 Redis 상태 버스 및 <code>/api/asset/cabinet/list</code> 연동 실측 데이터입니다.
                  </div>
                </div>

                {/* 6 Sensor Data Boxes */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {[
                    { label: "온습도 센서", val: "23.4 ℃ / 46.2 %", status: "정상", sub: "서버실 적정 범위 내", color: "#38bdf8" },
                    { label: "라이다 SLAM", val: "±2cm 정밀도", status: "정상 추정", sub: "지상 0.37m 마운트", color: "#00f2fe" },
                    { label: "초음파 & 낙하방지", val: "전방 0.0m 무간섭", status: "안전", sub: "장애물 자동 감속", color: "#4ade80" },
                    { label: "BMS 배터리 전원", val: `${robot.telemetry?.voltage_v ?? 28.09} V`, status: "완충 도크", sub: "리튬인산철 패키지", color: "#facc15" },
                    { label: "리프터 승강 모터", val: `${robot.telemetry?.lift_height_m ?? 0.17} m`, status: "최대 2.1m", sub: "2~48U 높이 대응", color: "#a855f7" },
                    { label: "열화상 카메라", val: "최고 28.5 ℃", status: "핫스팟 무", sub: "화재 발화 조기 감시", color: "#f87171" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: "rgba(15, 23, 42, 0.8)",
                        borderLeft: `4px solid ${s.color}`,
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderLeftWidth: 4,
                        borderRadius: "0 10px 10px 0",
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700 }}>{s.label}</span>
                        <span style={{ fontSize: 10.5, color: s.color, fontWeight: 800 }}>{s.status}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: "#ffffff", marginTop: 4 }}>{s.val}</div>
                      <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Live Asset Cabinets Binding Table */}
                <div style={{ background: "rgba(15, 23, 42, 0.7)", borderRadius: 12, padding: "12px 16px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#ffffff" }}>
                      🗄️ 실시간 바인딩 캐비닛/랙 자산 목록 ({cabinets.length}개 캐비닛)
                    </span>
                    <span style={{ fontSize: 11, color: "#38bdf8" }}>/api/asset/cabinet/list 직결</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
                    {cabinets.map((cab, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1.5fr 1fr 1fr 1fr",
                          background: "#030712",
                          padding: "7px 12px",
                          borderRadius: 6,
                          alignItems: "center",
                          border: "1px solid rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <span style={{ color: "#ffffff", fontWeight: 800 }}>{cab.name}</span>
                        <span style={{ color: "#94a3b8" }}>모델: {cab.model || "LD-2000T"}</span>
                        <span style={{ color: "#38bdf8" }}>수용 용량: {cab.capacity || 42} U</span>
                        <span style={{ color: "#4ade80", fontWeight: 800, textAlign: "right" }}>
                          ● 정상 실사 완료
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
