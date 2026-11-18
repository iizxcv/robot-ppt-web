import React, { useState } from "react";
import { RobotRecord } from "./viewer3d/UnifiedMapViewer3D";

export const RobotDetailPopupModal: React.FC<{
  robot: RobotRecord;
  onClose: () => void;
}> = ({ robot, onClose }) => {
  const [tab, setTab] = useState<"strengths" | "parts" | "live_api">("strengths");
  const specs = robot.proposal_specs;
  const tel = robot.telemetry;
  const isLive = tel?.online_mode === "LIVE_WEBSOCKET_REDIS";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(5, 5, 8, 0.84)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 990,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="stage-reveal"
        style={{
          width: 860,
          maxHeight: "86vh",
          background: "#111116",
          border: `2px solid ${robot.color}`,
          borderRadius: 22,
          padding: "28px 32px",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          boxShadow: `0 24px 64px rgba(0, 0, 0, 0.85), 0 0 32px ${robot.color}33`,
          overflowY: "auto",
        }}
      >
        {/* Top Modal Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  background: `${robot.color}22`,
                  color: robot.color,
                  border: `1px solid ${robot.color}`,
                  padding: "4px 12px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {robot.edition_badge || robot.model_code}
              </span>
              <span
                style={{
                  background: isLive ? "rgba(34,197,94,0.16)" : "rgba(113,113,122,0.2)",
                  color: isLive ? "#4ade80" : "#a1a1aa",
                  padding: "4px 10px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {isLive ? `● 실환경 WebSocket 연동 중 (${robot.ip})` : `● 대기 상태 (${robot.ip})`}
              </span>
              {robot.rra_cert_no && (
                <span style={{ fontSize: 12, color: "#a1a1aa" }}>
                  🇰🇷 KC 적합등록: <b>{robot.rra_cert_no}</b> ({robot.rra_cert_date})
                </span>
              )}
            </div>

            <h2 style={{ fontSize: 30, fontWeight: 800, margin: "0 0 6px 0" }}>{robot.display_name}</h2>
            <div style={{ fontSize: 14, color: "#d4d4d8", fontWeight: 600 }}>
              {specs?.headline || robot.target_site}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: "#27272a",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              width: 36,
              height: 36,
              fontSize: 16,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* 4 KPI Cards from SR Robotics Proposal */}
        {specs?.kpi_cards && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 12,
              margin: "20px 0",
            }}
          >
            {specs.kpi_cards.map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: "#18181f",
                  borderLeft: `3.5px solid ${robot.color}`,
                  borderRadius: "0 12px 12px 0",
                  padding: "12px 16px",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 800, color: "#ffffff" }}>{kpi.value}</div>
                <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 4 }}>{kpi.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tab Selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, borderBottom: "1px solid #27272a", paddingBottom: 12 }}>
          {[
            { id: "strengths", label: "✨ 모델별 핵심 강점 & 기본/옵션 기능" },
            { id: "parts", label: "🔩 본체 위치별 부품 · 센서 구성" },
            { id: "live_api", label: "📡 실환경 WebSocket & 오도메트리 관제 데이터" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              style={{
                background: tab === t.id ? "#3b82f6" : "#18181f",
                color: "#ffffff",
                border: "none",
                borderRadius: 10,
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: Strengths & Basic/Optional Functions */}
        {tab === "strengths" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "#16161d", borderRadius: 14, padding: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: robot.color, marginBottom: 10 }}>
                🏆 핵심 차별화 강점 (SR 로보틱스 제안서 기준)
              </div>
              {(specs?.key_strengths || []).map((st, i) => (
                <div key={i} style={{ fontSize: 14, color: "#f4f4f5", marginBottom: 8, lineHeight: 1.55 }}>
                  • {st}
                </div>
              ))}
              <div style={{ fontSize: 12.5, color: "#a1a1aa", marginTop: 10, paddingTop: 10, borderTop: "1px solid #27272a" }}>
                📐 물리 제원 요약: {specs?.capacity_summary}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
              <div style={{ background: "#16161d", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#38bdf8", marginBottom: 10 }}>
                  기본 탑재 기능
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(specs?.basic_functions || []).map((fn) => (
                    <span
                      key={fn}
                      style={{
                        background: "#0b0b0e",
                        border: "1px solid #27272a",
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 700,
                      }}
                    >
                      ✓ {fn}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ background: "#16161d", borderRadius: 14, padding: 16 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#f59e0b", marginBottom: 10 }}>
                  특화 / 추가 옵션 항목
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(specs?.optional_items || []).map((opt) => (
                    <span
                      key={opt}
                      style={{
                        background: "rgba(245, 158, 11, 0.12)",
                        border: "1px solid rgba(245, 158, 11, 0.4)",
                        color: "#fbbf24",
                        padding: "6px 12px",
                        borderRadius: 8,
                        fontSize: 12.5,
                        fontWeight: 700,
                      }}
                    >
                      + {opt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Parts & Sensors Breakdown */}
        {tab === "parts" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(specs?.parts_sensors || []).map((part, i) => (
              <div
                key={i}
                style={{
                  background: "#16161d",
                  borderLeft: `3.5px solid ${robot.color}`,
                  padding: "14px 18px",
                  borderRadius: "0 12px 12px 0",
                  fontSize: 14,
                  color: "#e4e4e7",
                  lineHeight: 1.5,
                }}
              >
                {part}
              </div>
            ))}
            <div
              style={{
                background: "rgba(255, 59, 48, 0.12)",
                border: "1px solid rgba(255, 59, 48, 0.35)",
                borderRadius: 12,
                padding: "12px 16px",
                fontSize: 13,
                color: "#fca5a5",
                marginTop: 6,
              }}
            >
              🔥 <b>로봇 내부 안전 사양 (소화 패치 기본 탑재)</b>: 본체 내부에 에어로졸 소화 패치 2개를 탑재하여 화염 감지 또는 내부 온도 170℃ 초과 시 자동으로 소화를 개시해 장비 손상을 최소화합니다.
            </div>
          </div>
        )}

        {/* Tab 3: Live WebSocket & Odometry Telemetry */}
        {tab === "live_api" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: "#0b0b0e", borderRadius: 14, padding: 16, fontSize: 13 }}>
              <div style={{ color: "#3b82f6", fontWeight: 800, marginBottom: 10 }}>
                📍 실시간 위치 & 오도메트리 정합 상태
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: "monospace" }}>
                <div>• DNS Hostname: <b>{robot.hostname}</b></div>
                <div>• 현재 지점명: <b style={{ color: "#4ade80" }}>{tel?.position_name}</b></div>
                <div>• Local Odom (x, y, yaw): ({tel?.local_x}m, {tel?.local_y}m, {tel?.local_yaw_deg}°)</div>
                <div>• SE(2) 보정 오프셋 (ΔX, ΔY): ({robot.calibration?.dx_m ?? 0}m, {robot.calibration?.dy_m ?? 0}m)</div>
                <div>• 3D Twin 통합 좌표: <b style={{ color: "#38bdf8" }}>({tel?.world_x}m, {tel?.world_y}m)</b></div>
                <div>• 배터리 / 전압 / 온도: {tel?.battery_pct}% / {tel?.voltage_v}V / {tel?.temp_c}℃</div>
                <div>• 리프트 현재 높이: {tel?.lift_height_m}m (최대 {robot.kinematics.max_lift_height_m || 2.2}m)</div>
              </div>
            </div>

            <div style={{ background: "#0b0b0e", borderRadius: 14, padding: 16 }}>
              <div style={{ color: "#4ade80", fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                📡 WebSocket 실시간 수신 패킷 (`robotStatus`)
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "#4ade80",
                  overflowX: "auto",
                  lineHeight: 1.45,
                }}
              >
                {JSON.stringify(
                  {
                    ws_url: `ws://${robot.ip}${robot.ws_status_path || "/platformSocket/timely/data/robotStatus"}`,
                    last_sync: tel?.last_sync_time,
                    telemetry: tel,
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </div>
        )}
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
