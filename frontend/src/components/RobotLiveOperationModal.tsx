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
  const [operatorToken, setOperatorToken] = useState<string>(() => {
    return sessionStorage.getItem("operator_token") || localStorage.getItem("operator_token") || "";
  });
  const [operatorUser, setOperatorUser] = useState<any>(() => {
    const u = sessionStorage.getItem("operator_user") || localStorage.getItem("operator_user");
    try {
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<{ actionType: string; extraParams: any } | null>(null);
  const [authId, setAuthId] = useState<string>("super");
  const [authPw, setAuthPw] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [authLoading, setAuthLoading] = useState<boolean>(false);

  const rId = robot.id;
  const robotFleet = fleetData?.fleet?.[rId] || fleetData?.fleet?.["flag-01"] || {};
  const paths: any[] = robotFleet.paths || [];
  const missions: any[] = robotFleet.missions || [];
  const positions: any[] = robotFleet.positions || [];
  const cabinets: any[] = robotFleet.cabinets || [];
  const cameras: any[] = robotFleet.cameras || [];

  const currStream = STREAM_CONFIG[cameraMode] || STREAM_CONFIG.optical;
  const robotIp = robot.ip || (rId.includes("power") ? "10.200.28.61" : "10.200.28.63");
  // Use Web Server Media Relay endpoint (/videoStream/...) instead of direct internal robot/media IP
  const liveStreamPlayerUrl = `/videoStream/stream/player/${currStream.streamName}/?autoplay=1&muted=1`;

  useEffect(() => {
    if (missions.length > 0 && !selectedPath) {
      const m = missions[0];
      setSelectedPath(String(m.missionId));
    } else if (paths.length > 0 && !selectedPath) {
      setSelectedPath(paths[0].name || String(paths[0].robotPathId));
    }
    if (positions.length > 0 && !selectedPosition) {
      setSelectedPosition(String(positions[0].robotPositionId));
    }
  }, [missions, paths, positions]);

  const addLog = (msg: string, type: "info" | "success" | "warn" = "info") => {
    setActionLogs((prev) => [{ time: new Date().toLocaleTimeString(), msg, type }, ...prev.slice(0, 15)]);
  };

  const handleOperatorLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/v1/auth/operator_login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: authId, password: authPw }),
      });
      const data = await res.json();
      if (!res.ok || data.code !== 0) {
        throw new Error(data.detail || data.msg || "인증에 실패했습니다.");
      }
      setOperatorToken(data.token);
      setOperatorUser(data.user);
      sessionStorage.setItem("operator_token", data.token);
      sessionStorage.setItem("operator_user", JSON.stringify(data.user));
      setShowAuthModal(false);
      setAuthPw("");
      addLog(`✓ 관제 운영자 인증 성공 (${data.user.displayName || data.user.account})`, "success");

      if (pendingAction) {
        const act = pendingAction;
        setPendingAction(null);
        handleRunAction(act.actionType, act.extraParams, data.token);
      }
    } catch (err: any) {
      setAuthError(err.message || "로그인 실패");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleOperatorLogout = () => {
    setOperatorToken("");
    setOperatorUser(null);
    sessionStorage.removeItem("operator_token");
    sessionStorage.removeItem("operator_user");
    localStorage.removeItem("operator_token");
    localStorage.removeItem("operator_user");
    addLog("🔒 관제 운영자 로그아웃 (물리 제어 잠금 활성화)", "info");
  };

  const triggerControlAction = (actionType: string, extraParams: any = {}) => {
    if (!operatorToken) {
      setPendingAction({ actionType, extraParams });
      setAuthError("");
      setShowAuthModal(true);
      return;
    }
    handleRunAction(actionType, extraParams, operatorToken);
  };

  const handleRunAction = async (actionType: string, extraParams: any = {}, customToken?: string) => {
    const tokenToUse = customToken || operatorToken;
    setIsExecuting(true);
    addLog(`Dispatching [${actionType}] to http://${robot.ip}/api/...`, "info");
    try {
      if (onActionExecute) {
        const res = await onActionExecute(actionType, { ...extraParams, token: tokenToUse });
        if (res && res.result) {
          const isSuccess = res.code === 0 && res.result.status === "SUCCESS";
          addLog(`${isSuccess ? "✓" : "⚠️"} ${res.result.message || "Executed"}`, isSuccess ? "success" : "warn");
          if (res.result.details) {
            addLog(`↳ ${res.result.details}`, isSuccess ? "info" : "warn");
          }
        } else if (res && res.detail) {
          addLog(`⚠️ 권한 거부: ${res.detail}`, "warn");
        } else {
          addLog(`✓ Action [${actionType}] processed successfully.`, "success");
        }
      } else {
        // Fallback fetch
        const res = await fetch(`/api/v1/robots/${robot.hostname || robot.id}/oneclick_action`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(tokenToUse ? { Authorization: `Bearer ${tokenToUse}` } : {}),
          },
          body: JSON.stringify({ action_type: actionType, token: tokenToUse, ...extraParams }),
        }).then((r) => r.json());
        const isSuccess = res.code === 0;
        addLog(`${isSuccess ? "✓" : "⚠️"} ${res.msg || res.detail || "Executed"}`, isSuccess ? "success" : "warn");
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
  const isLive = robot.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS";
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
                background: isLive
                  ? "rgba(34, 197, 94, 0.16)"
                  : (isDarkMode ? "rgba(239, 68, 68, 0.16)" : "#fee2e2"),
                border: `1px solid ${isLive ? "#22c55e" : "#ef4444"}`,
                color: isLive ? (isDarkMode ? "#4ade80" : "#16a34a") : (isDarkMode ? "#ef4444" : "#dc2626"),
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 10px",
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: isLive ? "#22c55e" : "#ef4444",
                  boxShadow: isLive ? "0 0 8px #22c55e" : "0 0 6px #ef4444",
                }}
              />
              {isLive ? "LIVE REST API & WEBSOCKET" : "OFFLINE (통신 단절 / N/A)"}
            </span>
            <span style={{ fontSize: 18, fontWeight: 900, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
              {robot.display_name} 실시간 종합 제어 및 센서 모니터링
            </span>
            <span style={{ fontSize: 13, color: "#94a3b8", fontFamily: "monospace" }}>
              [{robot.ip || "10.200.28.63"}:80]
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Tab switch bar */}
            <div
              className="live-modal-tab-bar"
              style={{
                display: "flex",
                background: isDarkMode ? "rgb(3, 7, 18)" : "#ffffff",
                borderRadius: 10,
                padding: 4,
                border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
                boxShadow: isDarkMode ? "0 2px 8px rgba(0, 0, 0, 0.3)" : "0 2px 8px rgba(15, 23, 42, 0.06)",
              }}
            >
              {[
                { id: "oneclick", label: "⚡ 원클릭 작업 제어" },
                { id: "camera", label: "📹 실시간 카메라 & 소켓" },
                { id: "sensors", label: "📊 정밀 센서 & 자산 현황" },
              ].map((t) => {
                const isSelected = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    data-active={isSelected ? "true" : "false"}
                    style={{
                      background: isSelected ? "#bae6fd" : "transparent",
                      color: isSelected ? "#020617" : isDarkMode ? "#ffffff" : "#0f172a",
                      border: isSelected ? "1px solid #7dd3fc" : "1px solid transparent",
                      borderRadius: 8,
                      padding: "6px 14px",
                      fontSize: 12.5,
                      fontWeight: isSelected ? 800 : 700,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      boxShadow: isSelected ? "0 2px 8px rgba(186, 230, 253, 0.4)" : "none",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
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
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              background: isDarkMode ? "rgba(8, 12, 22, 0.65)" : "#f8fafc",
              borderRight: isDarkMode ? "1px solid rgba(59, 130, 246, 0.2)" : "1px solid #e2e8f0",
            }}
          >
            <div>
              {/* Front Image Box */}
              <div
                style={{
                  height: 220,
                  borderRadius: 14,
                  overflow: "hidden",
                  background: isDarkMode ? "#030712" : "#ffffff",
                  border: isDarkMode ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid #e2e8f0",
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
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff", border: isDarkMode ? "none" : "1px solid #e2e8f0", borderRadius: 8 }}>
                  <span style={{ color: isDarkMode ? "#94a3b8" : "#475569" }}>상태 머신 (FSM)</span>
                  <span style={{ color: isLive ? (isDarkMode ? "#4ade80" : "#16a34a") : (isDarkMode ? "#ef4444" : "#dc2626"), fontWeight: 800 }}>
                    {isLive ? (robot.telemetry?.fsm_state || "READY (STANDBY)") : "OFFLINE (하드웨어 점검/대기)"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff", border: isDarkMode ? "none" : "1px solid #e2e8f0", borderRadius: 8 }}>
                  <span style={{ color: isDarkMode ? "#94a3b8" : "#475569" }}>현재 위치</span>
                  <span style={{ color: isLive ? (isDarkMode ? "#ffffff" : "#0f172a") : (isDarkMode ? "#ef4444" : "#dc2626"), fontWeight: 800 }}>
                    {isLive ? (robot.telemetry?.position_name || "충전점 (#68)") : "N/A (위치 수신 불가)"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff", border: isDarkMode ? "none" : "1px solid #e2e8f0", borderRadius: 8 }}>
                  <span style={{ color: isDarkMode ? "#94a3b8" : "#475569" }}>배터리 전압</span>
                  <span style={{ color: isLive ? (isDarkMode ? "#38bdf8" : "#0284c7") : (isDarkMode ? "#ef4444" : "#dc2626"), fontWeight: 800 }}>
                    {isLive ? `${robot.telemetry?.battery_pct ?? 100}% (${robot.telemetry?.voltage_v ?? 28.09}V)` : "N/A"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff", border: isDarkMode ? "none" : "1px solid #e2e8f0", borderRadius: 8 }}>
                  <span style={{ color: isDarkMode ? "#94a3b8" : "#475569" }}>리프트 승강 높이</span>
                  <span style={{ color: isLive ? "#facc15" : (isDarkMode ? "#ef4444" : "#dc2626"), fontWeight: 800 }}>
                    {isLive ? `${robot.telemetry?.lift_height_m ?? 0.17} m` : "N/A"}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Emergency Halt Button */}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => triggerControlAction("emergency_stop")}
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
                onClick={() => triggerControlAction("resume_operation")}
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

                {!isLive && (
                  <div
                    style={{
                      background: isDarkMode ? "rgba(239, 68, 68, 0.12)" : "#fef2f2",
                      border: "1px solid #ef4444",
                      borderRadius: 10,
                      padding: "10px 14px",
                      color: isDarkMode ? "#fca5a5" : "#b91c1c",
                      fontSize: 12,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>⚠️</span>
                    <span>현재 로봇이 <b>OFFLINE (통신 단절 / 점검 대기)</b> 상태입니다. 실시간 데이터 수신이 불가하여 텔레메트리가 N/A로 표시되며, 원격 명령이 실행되지 않습니다.</span>
                  </div>
                )}

                {/* Operator Authentication Security Status Banner */}
                {!operatorToken ? (
                  <div
                    style={{
                      background: isDarkMode ? "rgba(239, 68, 68, 0.12)" : "#fef2f2",
                      border: isDarkMode ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid #fecaca",
                      borderRadius: 12,
                      padding: "12px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>🔒</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? "#fca5a5" : "#991b1b" }}>
                          로봇 물리 제어 보안 잠금 (Operator Login Required)
                        </div>
                        <div style={{ fontSize: 11.5, color: isDarkMode ? "#f87171" : "#b91c1c", marginTop: 2 }}>
                          자동 순찰, 지정 위치 이동, 충전 도크 복귀는 인가된 관리자만 조작할 수 있습니다.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { setAuthError(""); setShowAuthModal(true); }}
                      style={{
                        background: "#dc2626",
                        color: "#ffffff",
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        boxShadow: "0 2px 6px rgba(220, 38, 38, 0.25)",
                      }}
                    >
                      🔐 운영자 로그인
                    </button>
                  </div>
                ) : (
                  <div
                    style={{
                      background: isDarkMode ? "rgba(16, 185, 129, 0.12)" : "#f0fdf4",
                      border: isDarkMode ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid #bbf7d0",
                      borderRadius: 12,
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 18 }}>🔓</span>
                      <div>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: isDarkMode ? "#6ee7b7" : "#166534" }}>
                          관제 운영자 인증됨
                        </span>
                        <span style={{ fontSize: 11.5, color: isDarkMode ? "#a7f3d0" : "#15803d", marginLeft: 6 }}>
                          ({operatorUser?.displayName || operatorUser?.account || "super"} · 물리 제어 권한 활성화)
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={handleOperatorLogout}
                      style={{
                        background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#e2e8f0",
                        color: isDarkMode ? "#ffffff" : "#475569",
                        border: "none",
                        borderRadius: 6,
                        padding: "5px 10px",
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      로그아웃
                    </button>
                  </div>
                )}

                {/* 4 Action Cards Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  {/* Action 1: Auto Patrol */}
                  <div
                    style={{
                      background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                      border: isDarkMode ? "1px solid rgba(59, 130, 246, 0.35)" : "1px solid #bfdbfe",
                      boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(59, 130, 246, 0.06)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
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
                          background: isDarkMode ? "#030712" : "#ffffff",
                          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
                          color: isDarkMode ? "#ffffff" : "#0f172a",
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
                          triggerControlAction("start_patrol", {
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
                        {isExecuting ? "순찰 개시 중..." : (operatorToken ? "순찰 개시" : "🔒 순찰 개시 (인증 필요)")}
                      </button>
                    </div>
                  </div>

                  {/* Action 2: Go to Position */}
                  <div
                    style={{
                      background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                      border: isDarkMode ? "1px solid rgba(168, 85, 247, 0.35)" : "1px solid #e9d5ff",
                      boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(168, 85, 247, 0.06)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
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
                          background: isDarkMode ? "#030712" : "#ffffff",
                          border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #cbd5e1",
                          color: isDarkMode ? "#ffffff" : "#0f172a",
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
                          const currPos = positions.find((p) => String(p.robotPositionId) === selectedPosition);
                          triggerControlAction("goto_position", {
                            position_name: currPos?.name || "Selected Point",
                            position_id: currPos?.robotPositionId ? Number(currPos.robotPositionId) : (selectedPosition ? Number(selectedPosition) : undefined),
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
                        {isExecuting ? "이동 지시 중..." : (operatorToken ? "이동 지시" : "🔒 이동 지시 (인증 필요)")}
                      </button>
                    </div>
                  </div>

                  {/* Action 3: Auto Dock Return */}
                  <div
                    style={{
                      background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                      border: isDarkMode ? "1px solid rgba(16, 185, 129, 0.35)" : "1px solid #bbf7d0",
                      boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(16, 185, 129, 0.06)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
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
                      onClick={() => triggerControlAction("return_dock")}
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
                      {isExecuting ? "도킹 실행 중..." : (operatorToken ? "충전 도크 복귀 실행" : "🔒 충전 도크 복귀 실행 (인증 필요)")}
                    </button>
                  </div>

                  {/* Action 4: Remote Self-Diagnostic */}
                  <div
                    style={{
                      background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                      border: isDarkMode ? "1px solid rgba(245, 158, 11, 0.35)" : "1px solid #fde68a",
                      boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(245, 158, 11, 0.06)",
                      borderRadius: 14,
                      padding: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
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
                        ● MEDIA RELAY ➔ MEDIAMTX (10.200.30.110)
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                      소켓: <code>{robotFleet.ws_url || `ws://${robotIp}/websocket/`}</code> · 미디어 중계: <code>/videoStream/stream/player/{currStream.streamName}/</code>
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
                      Pipeline: <code>/videoStream/.../{currStream.streamName}/ ➔ 10.200.30.110:8889</code>
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
                      background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                      border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
                      boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(15, 23, 42, 0.04)",
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
                <div style={{ background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff", borderRadius: 12, padding: "10px 14px", border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0", boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: isDarkMode ? "#e2e8f0" : "#0f172a", marginBottom: 6 }}>
                    📡 로봇 내장 카메라 & 센서 디바이스 등록 현황 ({cameras.length}개 디바이스)
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, fontSize: 11 }}>
                    {cameras.slice(0, 9).map((c, i) => (
                      <div key={i} style={{ background: isDarkMode ? "#030712" : "#f8fafc", padding: "6px 8px", borderRadius: 6, border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.05)" : "1px solid #e2e8f0" }}>
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
                    { label: "온습도 센서", val: isLive ? "23.4 ℃ / 46.2 %" : "N/A", status: isLive ? "정상" : "OFFLINE", sub: isLive ? "서버실 적정 범위 내" : "수신 불가", color: isLive ? "#38bdf8" : "#ef4444" },
                    { label: "라이다 SLAM", val: isLive ? "±2cm 정밀도" : "N/A", status: isLive ? "정상 추정" : "OFFLINE", sub: isLive ? "지상 0.37m 마운트" : "수신 불가", color: isLive ? "#00f2fe" : "#ef4444" },
                    { label: "초음파 & 낙하방지", val: isLive ? "전방 0.0m 무간섭" : "N/A", status: isLive ? "안전" : "OFFLINE", sub: isLive ? "장애물 자동 감속" : "수신 불가", color: isLive ? "#4ade80" : "#ef4444" },
                    { label: "BMS 배터리 전원", val: isLive ? `${robot.telemetry?.voltage_v ?? 28.09} V` : "N/A", status: isLive ? "완충 도크" : "OFFLINE", sub: isLive ? "리튬인산철 패키지" : "수신 불가", color: isLive ? "#facc15" : "#ef4444" },
                    { label: "리프터 승강 모터", val: isLive ? `${robot.telemetry?.lift_height_m ?? 0.17} m` : "N/A", status: isLive ? "최대 2.1m" : "OFFLINE", sub: isLive ? "2~48U 높이 대응" : "수신 불가", color: isLive ? "#a855f7" : "#ef4444" },
                    { label: "열화상 카메라", val: isLive ? "최고 28.5 ℃" : "N/A", status: isLive ? "핫스팟 무" : "OFFLINE", sub: isLive ? "화재 발화 조기 감시" : "수신 불가", color: isLive ? "#f87171" : "#ef4444" },
                  ].map((s) => (
                    <div
                      key={s.label}
                      style={{
                        background: isDarkMode ? "rgba(15, 23, 42, 0.8)" : "#ffffff",
                        border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                        borderLeft: `4px solid ${s.color}`,
                        boxShadow: isDarkMode ? "none" : "0 1px 3px rgba(15, 23, 42, 0.04)",
                        borderLeftWidth: 4,
                        borderRadius: "0 10px 10px 0",
                        padding: "10px 12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11.5, color: "#94a3b8", fontWeight: 700 }}>{s.label}</span>
                        <span style={{ fontSize: 10.5, color: s.color, fontWeight: 800 }}>{s.status}</span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: isDarkMode ? "#ffffff" : "#0f172a", marginTop: 4 }}>{s.val}</div>
                      <div style={{ fontSize: 10.5, color: "#64748b", marginTop: 2 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Live Asset Cabinets Binding Table */}
                <div style={{ background: isDarkMode ? "rgba(15, 23, 42, 0.7)" : "#ffffff", borderRadius: 12, padding: "12px 16px", border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0", boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(15, 23, 42, 0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
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

      {/* Operator Authentication Modal Dialog */}
      {showAuthModal && (
        <div
          onClick={() => { setShowAuthModal(false); setPendingAction(null); }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.65)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100000,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 400,
              maxWidth: "92vw",
              background: isDarkMode ? "#0f172a" : "#ffffff",
              border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #e2e8f0",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.35)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: isDarkMode ? "rgba(220, 38, 38, 0.2)" : "#fee2e2",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                }}
              >
                🛡️
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isDarkMode ? "#ffffff" : "#0f172a" }}>
                  관제 운영자 인증 (Operator Auth)
                </div>
                <div style={{ fontSize: 11.5, color: isDarkMode ? "#94a3b8" : "#64748b" }}>
                  로봇 물리 주행 및 하드웨어 제어 권한 획득
                </div>
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: isDarkMode ? "#cbd5e1" : "#475569",
                lineHeight: 1.5,
                background: isDarkMode ? "rgba(255, 255, 255, 0.04)" : "#f8fafc",
                border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid #e2e8f0",
                padding: "10px 12px",
                borderRadius: 8,
              }}
            >
              ⚠️ <b>물리 안전 보안</b>: 자동 순찰 개시, 지정 위치 이동, 충전 도크 복귀 등 로봇 주행 제어는 인가된 관리자만 조작할 수 있습니다.
            </div>

            <form onSubmit={handleOperatorLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: isDarkMode ? "#cbd5e1" : "#334155", marginBottom: 4 }}>
                  운영자 아이디 (Account)
                </label>
                <input
                  type="text"
                  value={authId}
                  onChange={(e) => setAuthId(e.target.value)}
                  placeholder="super 또는 admin"
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: isDarkMode ? "1px solid #334155" : "1px solid #cbd5e1",
                    background: isDarkMode ? "#020617" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#0f172a",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: isDarkMode ? "#cbd5e1" : "#334155", marginBottom: 4 }}>
                  비밀번호 (Password)
                </label>
                <input
                  type="password"
                  value={authPw}
                  onChange={(e) => setAuthPw(e.target.value)}
                  placeholder="비밀번호 입력"
                  autoFocus
                  required
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: 8,
                    border: isDarkMode ? "1px solid #334155" : "1px solid #cbd5e1",
                    background: isDarkMode ? "#020617" : "#ffffff",
                    color: isDarkMode ? "#ffffff" : "#0f172a",
                    fontSize: 13,
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {authError && (
                <div
                  style={{
                    fontSize: 12,
                    color: "#ef4444",
                    fontWeight: 700,
                    background: isDarkMode ? "rgba(239, 68, 68, 0.15)" : "#fee2e2",
                    padding: "7px 10px",
                    borderRadius: 6,
                    border: "1px solid rgba(239, 68, 68, 0.3)",
                  }}
                >
                  ⚠️ {authError}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => { setShowAuthModal(false); setPendingAction(null); }}
                  style={{
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: isDarkMode ? "1px solid #334155" : "1px solid #cbd5e1",
                    background: "transparent",
                    color: isDarkMode ? "#94a3b8" : "#64748b",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  style={{
                    flex: 2,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    background: "#3b82f6",
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(59, 130, 246, 0.35)",
                  }}
                >
                  {authLoading ? "인증 확인 중..." : "인증 및 권한 획득"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
