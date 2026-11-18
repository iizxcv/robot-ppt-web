import React, { useState } from "react";
import { RobotRecord } from "./viewer3d/UnifiedMapViewer3D";

export const OpenCVStudioPanel: React.FC<{
  robots: RobotRecord[];
  selectedRobotId: string;
  visionFrame: any;
  onRequestVision: (target: string, mode: string) => void;
}> = ({ robots, selectedRobotId, visionFrame, onRequestVision }) => {
  const [mode, setMode] = useState<string>("rack_roi_led");
  const currentRobot = robots.find((r) => r.id === selectedRobotId) || robots[0];

  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (currentRobot) {
      onRequestVision(currentRobot.hostname, newMode);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0b1120",
        borderLeft: "1px solid #1e293b",
        padding: 12,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div>
          <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: 13 }}>
            👁️ OpenCV & On-Board AI Vision Studio
          </span>
          <span style={{ color: "#64748b", fontSize: 11, marginLeft: 8 }}>
            Target: {currentRobot?.hostname}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "rack_roi_led", label: "42U Rack ROI & LED" },
            { id: "thermal_hotspot", label: "Thermal Hotspot" },
            { id: "canny_hud", label: "Canny & 3D Handle" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => handleModeChange(m.id)}
              style={{
                background: mode === m.id ? "#0284c7" : "#1e293b",
                color: "#f8fafc",
                border: "1px solid #334155",
                borderRadius: 6,
                padding: "4px 9px",
                fontSize: 11,
                cursor: "pointer",
                fontWeight: mode === m.id ? 700 : 400,
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
          background: "#050811",
          borderRadius: 8,
          border: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {visionFrame?.image_base64 ? (
          <img
            src={visionFrame.image_base64}
            alt="OpenCV Processed Stream"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <div style={{ color: "#64748b", fontSize: 12 }}>
            상단 필터 버튼을 누르거나 우측 시연 버튼을 클릭하면 OpenCV 실시간 합성 프레임이 표시됩니다.
          </div>
        )}
      </div>

      {visionFrame?.metrics && (
        <div
          style={{
            marginTop: 8,
            display: "flex",
            gap: 12,
            background: "#0f172a",
            padding: "6px 10px",
            borderRadius: 6,
            fontSize: 11,
            color: "#cbd5e1",
            overflowX: "auto",
          }}
        >
          {Object.entries(visionFrame.metrics).map(([k, v]) => (
            <div key={k}>
              <span style={{ color: "#64748b" }}>{k}: </span>
              <span style={{ color: "#38bdf8", fontWeight: 600 }}>{JSON.stringify(v)}</span>
            </div>
          ))}
        </div>
      )}
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
        background: "rgba(2, 6, 23, 0.82)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 999,
      }}
    >
      <div
        style={{
          width: 640,
          background: "#0f172a",
          border: "1px solid #38bdf8",
          borderRadius: 12,
          padding: 20,
          color: "#f8fafc",
        }}
      >
        <h3 style={{ margin: "0 0 6px 0", color: "#38bdf8" }}>
          🧭 멀티 로봇 SLAM (pbstream / map.pgm) SE(2) 좌표계 정합 설정
        </h3>
        <p style={{ margin: "0 0 16px 0", fontSize: 12, color: "#94a3b8" }}>
          각 로봇의 매핑 시작 위치(origin) 및 회전각(Δθ) 차이를 보정합니다. 저장 시 호스트의{" "}
          <code>docker_master/config/map_alignment.json</code>에 1:1 영구 저장됩니다.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, color: "#cbd5e1" }}>
            3D 조감도 벽면/랙 돌출 높이 (m): <b>{wallHeight}m</b>
          </label>
          <input
            type="range"
            min={0.5}
            max={3.0}
            step={0.05}
            value={wallHeight}
            onChange={(e) => setWallHeight( parseFloat(e.target.value) )}
            style={{ width: "100%", marginTop: 4 }}
          />
        </div>

        {Object.entries(transforms).map(([rId, tf]: [string, any]) => (
          <div
            key={rId}
            style={{
              background: "#1e293b",
              padding: 12,
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13, color: "#38bdf8", marginBottom: 8 }}>
              {rId} ({tf.robot_hostname}) {rId === "flag-01" && "★ Master Reference Frame"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 11, color: "#94a3b8" }}>ΔX 오프셋 (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={tf.dx_m}
                  onChange={(e) => updateField(rId, "dx_m", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#0f172a",
                    color: "#fff",
                    border: "1px solid #334155",
                    borderRadius: 4,
                    padding: 5,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#94a3b8" }}>ΔY 오프셋 (m)</label>
                <input
                  type="number"
                  step="0.05"
                  value={tf.dy_m}
                  onChange={(e) => updateField(rId, "dy_m", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#0f172a",
                    color: "#fff",
                    border: "1px solid #334155",
                    borderRadius: 4,
                    padding: 5,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#94a3b8" }}>ΔΘ 회전각 (deg)</label>
                <input
                  type="number"
                  step="1.0"
                  value={tf.dtheta_deg}
                  onChange={(e) => updateField(rId, "dtheta_deg", parseFloat(e.target.value) || 0)}
                  style={{
                    width: "100%",
                    background: "#0f172a",
                    color: "#fff",
                    border: "1px solid #334155",
                    borderRadius: 4,
                    padding: 5,
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
              background: "#334155",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 14px",
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={() => onSave(transforms, wallHeight)}
            style={{
              background: "#0284c7",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontWeight: 700,
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
