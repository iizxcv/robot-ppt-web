import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Html, Line } from "@react-three/drei";
import * as THREE from "three";

export interface RobotRecord {
  id: string;
  hostname: string;
  display_name: string;
  english_name?: string;
  edition_badge?: string;
  model_type: string;
  model_code: string;
  target_site?: string;
  color: string;
  patrol_path_world?: number[][];
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

const ExtrudedWalls: React.FC<{
  blocks: number[][];
  wallHeight: number;
  color?: string;
  emissive?: string;
  opacity?: number;
}> = ({ blocks, wallHeight, color = "#27272a", emissive = "#1e3a8a", opacity = 0.78 }) => {
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
        color={color}
        emissive={emissive}
        emissiveIntensity={0.22}
        transparent
        opacity={opacity}
        roughness={0.3}
        metalness={0.65}
      />
    </instancedMesh>
  );
};

const VirtualFacilityPOIs: React.FC<{ pois: any[] }> = ({ pois }) => {
  return (
    <group>
      {(pois || []).map((poi) => {
        const isCharger = poi.kind === "charger";
        if (!isCharger) return null;
        return (
          <group key={poi.id} position={[poi.x, 0.03, -poi.y]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.25, 0.36, 24]} />
              <meshBasicMaterial color="#22c55e" side={THREE.DoubleSide} />
            </mesh>
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
  const isPro = robot.model_type === "profession_4wd" || robot.id.includes("pro");
  const isPower = robot.model_type === "power_4wd" || robot.id.includes("pwr");
  const englishName = robot.english_name || (isPower ? "Power" : isPro ? "Professional" : "Flagship");

  return (
    <group>
      {showOdomVectors && (Math.abs(wx - lx) > 0.05 || Math.abs(wy - ly) > 0.05) && (
        <group>
          <Line
            points={[
              [lx, 0.15, -ly],
              [wx, 0.15, -wy],
            ]}
            color="#3b82f6"
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

        {/* Minimal English Name Badge Box */}
        <Html position={[0, kinematics.height_m + 0.28, 0]} center distanceFactor={9}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            title="클릭하여 모델 상세 정보 보기"
            style={{
              background: isSelected ? "#1e3a8a" : "rgba(10, 16, 32, 0.88)",
              border: `1.5px solid ${isSelected ? "#60a5fa" : "#3b82f6"}`,
              borderRadius: 6,
              padding: "4px 12px",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "Calibri, 'Malgun Gothic', sans-serif",
              letterSpacing: "0.03em",
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isSelected ? "0 0 14px rgba(96, 165, 250, 0.6)" : "0 3px 10px rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              userSelect: "none",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS" ? "#22c55e" : "#64748b",
                boxShadow: telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS" ? "0 0 6px #22c55e" : "none",
              }}
            />
            <span>{englishName}</span>
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

  // Only render robots in the 3D scene if they are actively returning live data from API/Redis
  const liveRobots = useMemo(
    () => (robots || []).filter((r) => r.telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS"),
    [robots]
  );

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
        <color attach="background" args={["#080a14"]} />
        <ambientLight intensity={0.9} />
        <directionalLight position={[8, 16, 10]} intensity={1.4} />
        <pointLight position={[1.5, 4, 1.5]} intensity={0.8} color="#3b82f6" />

        <OrbitControls target={[center[0], 0.4, -center[1]]} maxPolarAngle={Math.PI / 2.08} />

        <Grid
          position={[center[0], 0.01, -center[1]]}
          args={[26, 26]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#1e293b"
          sectionSize={2.5}
          sectionThickness={1.2}
          sectionColor="#2563eb"
          fadeDistance={24}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0, -center[1]]}>
          <planeGeometry args={[26, 26]} />
          <meshStandardMaterial color="#080a14" transparent opacity={0.9} />
        </mesh>

        {masterMap?.overlap_blocks ? (
          <>
            {/* Overlapped Wall Blocks where Flagship map.pgm and Power map.pgm match */}
            <ExtrudedWalls
              blocks={masterMap.overlap_blocks}
              wallHeight={wallHeight}
              color="#1e293b"
              emissive="#22c55e"
              opacity={0.88}
            />
            {/* Flagship-only Wall Blocks */}
            <ExtrudedWalls
              blocks={masterMap.flag_only_blocks || []}
              wallHeight={wallHeight}
              color="#1e293b"
              emissive="#00f2fe"
              opacity={0.72}
            />
            {/* Power-only Calibrated Wall Blocks */}
            <ExtrudedWalls
              blocks={masterMap.power_only_blocks || []}
              wallHeight={wallHeight}
              color="#27272a"
              emissive="#f59e0b"
              opacity={0.68}
            />
          </>
        ) : (
          masterMap?.wall_blocks && <ExtrudedWalls blocks={masterMap.wall_blocks} wallHeight={wallHeight} />
        )}

        <VirtualFacilityPOIs pois={masterMap?.spatial_pois || []} />

        {/* Per-Robot Most-Frequent Patrol Path (Solid Line with Waypoint Spheres) */}
        {liveRobots.map((robot) => {
          const rawPts = robot.patrol_path_world || [];
          if (rawPts.length < 2) return null;
          const pts = rawPts.map(([x, y]) => [x, 0.04, -y] as [number, number, number]);
          const pathColor = robot.color || (robot.id.includes("power") ? "#f59e0b" : "#3b82f6");

          return (
            <group key={`patrol-path-${robot.id}`}>
              {/* Solid Patrol Trajectory Line */}
              <Line
                points={pts}
                color={pathColor}
                lineWidth={3.0}
              />
              {/* Waypoint Markers */}
              {pts.map((p, idx) => (
                <mesh key={`wp-${robot.id}-${idx}`} position={p}>
                  <sphereGeometry args={[0.045, 12, 12]} />
                  <meshBasicMaterial color={pathColor} />
                </mesh>
              ))}
            </group>
          );
        })}

        {liveRobots.map((robot) => (
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
          <span style={{ color: "#22c55e" }}>● LIVE WEBSOCKET TWIN</span>
          <span>실환경 WebSocket 기반 로봇 현위치 관제 시스템</span>
        </div>
        <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 4 }}>
          💡 3D 공간 위의 <b>로봇 아바타 또는 이름표를 클릭</b>하면 해당 모델의 핵심 강점·부품 구성·실시간 API 상세 팝업이 열립니다.
        </div>
      </div>
    </div>
  );
};
