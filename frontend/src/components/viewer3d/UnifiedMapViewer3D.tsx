import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Html, Line } from "@react-three/drei";
import * as THREE from "three";

export interface RobotRecord {
  id: string;
  hostname: string;
  display_name: string;
  edition_badge?: string;
  model_type: string;
  model_code: string;
  target_site?: string;
  color: string;
  rra_cert_no?: string;
  rra_cert_date?: string;
  ip: string;
  tags: string[];
  calibration?: {
    map_origin?: [number, number, number];
    boot_odom_offset?: [number, number, number];
    dx_m: number;
    dy_m: number;
    dtheta_deg: number;
    note?: string;
  };
  kinematics: {
    length_m: number;
    width_m: number;
    height_m: number;
    max_lift_height_m?: number;
    weight_kg?: number;
    wheel_base_m: number;
    laser_tf_xyz: [number, number, number];
    lift_range_m: [number, number];
    drive_type: string;
    arm_type: string;
  };
  proposal_specs?: {
    headline: string;
    kpi_cards: { label: string; value: string }[];
    capacity_summary: string;
    basic_functions: string[];
    optional_items: string[];
    key_strengths: string[];
    parts_sensors: string[];
  };
  telemetry: {
    local_x: number;
    local_y: number;
    local_yaw_deg: number;
    world_x: number;
    world_y: number;
    world_yaw_deg: number;
    target_world_x: number;
    target_world_y: number;
    position_name?: string;
    battery_pct: number;
    voltage_v?: number;
    charging?: boolean;
    fsm_state: string;
    move_mode: string;
    lift_height_m: number;
    ptz_pan_deg: number;
    ptz_zoom: number;
    arm_pose: string;
    is_stop: boolean;
    temp_c?: number;
    online_mode?: string;
    last_sync_time?: string;
  };
}

interface UnifiedMapViewer3DProps {
  mapData: any;
  robots: RobotRecord[];
  selectedRobotId: string;
  onSelectRobot: (id: string) => void;
  onOpenRobotPopup?: (robot: RobotRecord) => void;
  showOdomVectors?: boolean;
}

const ExtrudedWalls: React.FC<{ blocks: number[][]; wallHeight: number }> = ({ blocks, wallHeight }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  React.useLayoutEffect(() => {
    if (!meshRef.current || !blocks?.length) return;
    blocks.forEach(([wx, wy, size], idx) => {
      dummy.position.set(wx, wallHeight / 2, -wy);
      dummy.scale.set(size, wallHeight, size);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(idx, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [blocks, wallHeight, dummy]);

  if (!blocks?.length) return null;

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, blocks.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color="#27272a"
        emissive="#ff3b30"
        emissiveIntensity={0.14}
        transparent
        opacity={0.78}
        roughness={0.3}
        metalness={0.65}
      />
    </instancedMesh>
  );
};

const VirtualFacilityPOIs: React.FC<{ pois: any[]; corridor: number[][] }> = ({ pois, corridor }) => {
  const corridorPts = useMemo(() => {
    if (!corridor?.length) return [];
    return corridor.map(([x, y]) => [x, 0.04, -y] as [number, number, number]);
  }, [corridor]);

  return (
    <group>
      {corridorPts.length > 1 && (
        <Line points={corridorPts} color="#3f3f46" lineWidth={1.8} dashed dashSize={0.22} gapSize={0.14} />
      )}

      {(pois || []).map((poi) => {
        const isRack = poi.kind === "rack";
        const isCharger = poi.kind === "charger";
        return (
          <group key={poi.id} position={[poi.x, 0, -poi.y]}>
            {isRack && (
              <group position={[0, 1.0, 0]}>
                <mesh>
                  <boxGeometry args={[0.6, 2.0, 0.85]} />
                  <meshStandardMaterial
                    color="#18181b"
                    emissive="#0284c7"
                    emissiveIntensity={0.22}
                    transparent
                    opacity={0.86}
                  />
                </mesh>
                <Html position={[0, 1.25, 0]} center distanceFactor={12}>
                  <div
                    style={{
                      background: "rgba(9, 9, 11, 0.88)",
                      border: "1px solid #0284c7",
                      color: "#38bdf8",
                      padding: "2px 7px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    🗄️ {poi.name}
                  </div>
                </Html>
              </group>
            )}

            {isCharger && (
              <group position={[0, 0.03, 0]}>
                <mesh rotation={[-Math.PI / 2, 0, 0]}>
                  <ringGeometry args={[0.25, 0.36, 24]} />
                  <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
                </mesh>
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
};

const ParametricURDFRobot: React.FC<{
  robot: RobotRecord;
  isSelected: boolean;
  onSelect: () => void;
  showOdomVectors?: boolean;
}> = ({ robot, isSelected, onSelect, showOdomVectors }) => {
  const lidarRingRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (lidarRingRef.current) {
      const s = 1 + (clock.getElapsedTime() * 1.4) % 1.8;
      lidarRingRef.current.scale.set(s, s, 1);
    }
  });

  const { kinematics, telemetry, color } = robot;
  const lx = telemetry?.local_x ?? 0;
  const ly = telemetry?.local_y ?? 0;
  const wx = telemetry?.world_x ?? 0;
  const wy = telemetry?.world_y ?? 0;
  const yawRad = THREE.MathUtils.degToRad(telemetry?.world_yaw_deg ?? 0);
  const liftH = Math.min(kinematics.height_m - 0.25, Math.max(0.17, telemetry?.lift_height_m ?? 0.17));
  const ptzPanRad = THREE.MathUtils.degToRad(telemetry?.ptz_pan_deg ?? 0);
  const isPro = robot.model_type === "profession_4wd";
  const isPower = robot.model_type === "power_4wd";

  return (
    <group>
      {showOdomVectors && (Math.abs(wx - lx) > 0.05 || Math.abs(wy - ly) > 0.05) && (
        <group>
          <Line
            points={[
              [lx, 0.15, -ly],
              [wx, 0.15, -wy],
            ]}
            color="#ff3b30"
            lineWidth={2.5}
            dashed
            dashSize={0.14}
            gapSize={0.08}
          />
          <mesh position={[lx, 0.15, -ly]}>
            <sphereGeometry args={[0.11, 16, 16]} />
            <meshBasicMaterial color="#71717a" wireframe />
          </mesh>
          <Html position={[lx, 0.45, -ly]} center distanceFactor={11}>
            <div
              style={{
                background: "rgba(24,24,27,0.9)",
                border: "1px dashed #71717a",
                color: "#a1a1aa",
                padding: "3px 8px",
                borderRadius: 6,
                fontSize: 10,
                whiteSpace: "nowrap",
              }}
            >
              보정 전 Local Odom ({lx.toFixed(2)}, {ly.toFixed(2)})
            </div>
          </Html>
        </group>
      )}

      <group
        position={[wx, 0, -wy]}
        rotation={[0, yawRad, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.45, 0.56, 32]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        )}

        <mesh
          ref={lidarRingRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[kinematics.laser_tf_xyz[0], kinematics.laser_tf_xyz[2], 0]}
        >
          <ringGeometry args={[0.15, 0.19, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>

        {/* Base Link Chassis */}
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[kinematics.length_m, 0.28, kinematics.width_m]} />
          <meshStandardMaterial color="#18181b" metalness={0.85} roughness={0.2} />
        </mesh>

        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[kinematics.length_m + 0.02, 0.05, kinematics.width_m + 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.65} />
        </mesh>

        {/* Lift Mast */}
        <mesh position={[-0.05, kinematics.height_m / 2, 0]}>
          <boxGeometry args={[0.18, kinematics.height_m - 0.28, 0.22]} />
          <meshStandardMaterial color="#27272a" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Dynamic Lift Carriage */}
        <group position={[0.08, liftH, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.16, 0.26]} />
            <meshStandardMaterial color={color} metalness={0.6} roughness={0.2} />
          </mesh>

          {isPro && (
            <group position={[0.18, 0, 0]} rotation={[0, 0, -0.85]}>
              <mesh position={[0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.035, 0.04, 0.36, 16]} />
                <meshStandardMaterial color="#f4f4f5" metalness={0.85} />
              </mesh>
            </group>
          )}

          {isPower && (
            <mesh position={[0.16, 0, 0]}>
              <boxGeometry args={[0.24, 0.06, 0.08]} />
              <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.5} />
            </mesh>
          )}
        </group>

        {/* Top 360° PTZ Camera Dome */}
        <group position={[-0.05, kinematics.height_m, 0]} rotation={[0, ptzPanRad, 0]}>
          <mesh>
            <sphereGeometry args={[0.09, 20, 20]} />
            <meshStandardMaterial color="#09090b" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0.18, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.32, 16, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.28} side={THREE.DoubleSide} />
          </mesh>
        </group>

        {/* Interactive Clickable Floating Tag -> Opens Robot Strength & Spec Popup */}
        <Html position={[0, kinematics.height_m + 0.38, 0]} center distanceFactor={10}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            style={{
              background: isSelected ? "#141417" : "rgba(20, 20, 23, 0.92)",
              border: `1.5px solid ${isSelected ? "#ff3b30" : color}`,
              borderRadius: 12,
              padding: "7px 12px",
              color: "#ffffff",
              fontSize: 11.5,
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isSelected ? "0 8px 24px rgba(255, 59, 48, 0.38)" : "0 4px 12px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS" ? "#22c55e" : "#71717a",
                }}
              />
              <span style={{ color }}>{robot.display_name}</span>
              <span style={{ color: "#4ade80", fontWeight: 700 }}>{telemetry?.battery_pct}%</span>
            </div>
            <div style={{ fontSize: 10.5, color: "#e4e4e7", marginTop: 3 }}>
              📍 {telemetry?.position_name} · ({wx.toFixed(2)}, {wy.toFixed(2)})m
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#ff3b30",
                fontWeight: 800,
                marginTop: 3,
              }}
            >
              🔍 클릭하여 모델 핵심 강점 & 부품 구성 보기
            </div>
          </div>
        </Html>
      </group>
    </group>
  );
};

export const UnifiedMapViewer3D: React.FC<UnifiedMapViewer3DProps> = ({
  mapData,
  robots,
  selectedRobotId,
  onSelectRobot,
  onOpenRobotPopup,
  showOdomVectors = false,
}) => {
  const masterMap = mapData?.master_map;
  const wallHeight = mapData?.alignment?.wall_extrusion_height_m ?? 1.85;
  const center = [1.2, -1.4];

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#0d0d10",
        borderRadius: 20,
        overflow: "hidden",
        border: "1.5px solid #222226",
      }}
    >
      <Canvas camera={{ position: [center[0] + 5.6, 6.0, -center[1] + 5.6], fov: 40 }}>
        <color attach="background" args={["#0d0d10"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 16, 10]} intensity={1.4} />
        <pointLight position={[1.5, 4, 1.5]} intensity={1.0} color="#ff3b30" />

        <OrbitControls target={[center[0], 0.4, -center[1]]} maxPolarAngle={Math.PI / 2.08} />

        <Grid
          position={[center[0], 0.01, -center[1]]}
          args={[26, 26]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#27272a"
          sectionSize={2.5}
          sectionThickness={1.2}
          sectionColor="#ff3b30"
          fadeDistance={24}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0, -center[1]]}>
          <planeGeometry args={[26, 26]} />
          <meshStandardMaterial color="#0d0d10" transparent opacity={0.88} />
        </mesh>

        {masterMap?.wall_blocks && (
          <ExtrudedWalls blocks={masterMap.wall_blocks} wallHeight={wallHeight} />
        )}

        <VirtualFacilityPOIs
          pois={masterMap?.spatial_pois || []}
          corridor={masterMap?.patrol_corridor || []}
        />

        {robots.map((robot) => (
          <ParametricURDFRobot
            key={robot.id}
            robot={robot}
            isSelected={robot.id === selectedRobotId}
            onSelect={() => {
              onSelectRobot(robot.id);
              if (onOpenRobotPopup) onOpenRobotPopup(robot);
            }}
            showOdomVectors={showOdomVectors}
          />
        ))}
      </Canvas>

      {/* Top-Left Live Spatial Twin Status Overlay */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(14, 14, 18, 0.92)",
          border: "1px solid #27272a",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 12,
          color: "#e4e4e7",
          pointerEvents: "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800 }}>
          <span style={{ color: "#ff3b30" }}>● LIVE WEBSOCKET TWIN</span>
          <span>실환경 WebSocket 기반 로봇 현위치 실시간 관제 시스템</span>
        </div>
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
          💡 3D 공간 위의 <b>로봇 아바타 또는 이름표를 클릭</b>하면 해당 모델의 핵심 강점·부품 구성·실시간 API 상세 팝업이 열립니다.
        </div>
      </div>
    </div>
  );
};
