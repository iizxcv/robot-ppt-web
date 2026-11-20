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
  isDarkMode?: boolean;
}

const ExtrudedWalls: React.FC<{
  blocks: number[][];
  wallHeight: number;
  color?: string;
  emissive?: string;
  opacity?: number;
  emissiveIntensity?: number;
}> = ({
  blocks,
  wallHeight,
  color = "#27272a",
  emissive = "#1e3a8a",
  opacity = 0.78,
  emissiveIntensity = 0.22,
}) => {
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
        emissiveIntensity={emissiveIntensity}
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
  isDarkMode?: boolean;
}> = ({ robot, isSelected, onSelect, showOdomVectors, isDarkMode = false }) => {
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

        {/* ==============================================================
            Option A: Detailed High-Fidelity Parametric URDF Robot Mesh
            Crafted from proposal_images 3-view blueprints (Front, Side, Back)
           ============================================================== */}

        {/* 1. Base Link Chassis */}
        {!isPower ? (
          // Flagship & Professional Streamlined AGV Chassis
          <group position={[0, 0, 0]}>
            {/* Main Rounded Off-White ABS / Aluminum Housing */}
            <mesh position={[0, 0.16, 0]}>
              <boxGeometry args={[kinematics.length_m, 0.22, kinematics.width_m]} />
              <meshStandardMaterial color="#f1f5f9" metalness={0.25} roughness={0.3} />
            </mesh>

            {/* Dark Tech Inset Lower Skirt */}
            <mesh position={[0, 0.06, 0]}>
              <boxGeometry args={[kinematics.length_m - 0.04, 0.08, kinematics.width_m - 0.04]} />
              <meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.2} />
            </mesh>

            {/* Front Bumper & Sensor Grill Inset */}
            <mesh position={[kinematics.length_m / 2 + 0.005, 0.15, 0]}>
              <boxGeometry args={[0.02, 0.12, kinematics.width_m * 0.72]} />
              <meshStandardMaterial color="#020617" roughness={0.5} />
            </mesh>

            {/* Glowing Ambient Status Light Trim */}
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[kinematics.length_m + 0.015, 0.025, kinematics.width_m + 0.015]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} />
            </mesh>

            {/* Left & Right Drive Wheels */}
            <mesh position={[0, 0.08, kinematics.width_m / 2 + 0.01]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.035, 24]} />
              <meshStandardMaterial color="#18181b" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.08, -kinematics.width_m / 2 - 0.01]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 0.035, 24]} />
              <meshStandardMaterial color="#18181b" roughness={0.8} />
            </mesh>

            {/* Front LIDAR Cylinder Assembly */}
            <mesh position={[kinematics.laser_tf_xyz[0], kinematics.laser_tf_xyz[2] - 0.04, 0]}>
              <cylinderGeometry args={[0.045, 0.045, 0.06, 20]} />
              <meshStandardMaterial color="#09090b" metalness={0.9} roughness={0.1} />
            </mesh>
          </group>
        ) : (
          // Power Edition Rugged 4WD Industrial Chassis
          <group position={[0, 0, 0]}>
            {/* Rugged Industrial Heavy Body */}
            <mesh position={[0, 0.20, 0]}>
              <boxGeometry args={[kinematics.length_m, 0.26, kinematics.width_m - 0.06]} />
              <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.35} />
            </mesh>

            {/* Amber Heavy-Duty Protective Bumpers */}
            <mesh position={[kinematics.length_m / 2 + 0.02, 0.18, 0]}>
              <boxGeometry args={[0.04, 0.12, kinematics.width_m + 0.02]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.4} />
            </mesh>
            <mesh position={[-kinematics.length_m / 2 - 0.02, 0.18, 0]}>
              <boxGeometry args={[0.04, 0.12, kinematics.width_m + 0.02]} />
              <meshStandardMaterial color="#f59e0b" metalness={0.4} roughness={0.4} />
            </mesh>

            {/* 4 Independent Suspension Offroad Wheels */}
            {[-kinematics.length_m * 0.32, kinematics.length_m * 0.32].map((x, xi) => (
              <React.Fragment key={`pwr-axle-${xi}`}>
                <mesh position={[x, 0.11, kinematics.width_m / 2 + 0.02]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.11, 0.11, 0.06, 24]} />
                  <meshStandardMaterial color="#09090b" roughness={0.9} />
                </mesh>
                <mesh position={[x, 0.11, -kinematics.width_m / 2 - 0.02]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.11, 0.11, 0.06, 24]} />
                  <meshStandardMaterial color="#09090b" roughness={0.9} />
                </mesh>
              </React.Fragment>
            ))}
          </group>
        )}

        {/* 2. Dual Aluminum Extrusion Lift Mast Tower */}
        <group position={[-0.06, kinematics.height_m / 2 + 0.12, 0]}>
          {/* Dual Guide Rails (Left / Right Column) */}
          <mesh position={[0, 0, 0.08]}>
            <boxGeometry args={[0.09, kinematics.height_m - 0.15, 0.06]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.18} />
          </mesh>
          <mesh position={[0, 0, -0.08]}>
            <boxGeometry args={[0.09, kinematics.height_m - 0.15, 0.06]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.88} roughness={0.18} />
          </mesh>
          {/* Central Structural Stiffener Plate */}
          <mesh position={[-0.03, 0, 0]}>
            <boxGeometry args={[0.05, kinematics.height_m - 0.18, 0.22]} />
            <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.3} />
          </mesh>
        </group>

        {/* 3. Real-Time Dynamic Lift Carriage (Moves with liftH) */}
        <group position={[0.06, liftH, 0]}>
          {/* Main Carriage Sliding Block */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.16, 0.22, 0.28]} />
            <meshStandardMaterial color="#0f172a" metalness={0.7} roughness={0.25} />
          </mesh>

          {/* Front Touchscreen Display Console (10-inch Bezel) */}
          <mesh position={[0.085, 0.02, 0]}>
            <boxGeometry args={[0.015, 0.16, 0.22]} />
            <meshStandardMaterial color="#020617" roughness={0.1} metalness={0.9} />
          </mesh>
          {/* Glowing Active Display Surface */}
          <mesh position={[0.094, 0.02, 0]}>
            <planeGeometry args={[0.19, 0.13]} />
            <meshBasicMaterial color="#0284c7" />
          </mesh>

          {/* Inspection Vision Camera Head */}
          <mesh position={[0.08, 0.12, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.05, 16]} />
            <meshStandardMaterial color="#18181b" metalness={0.9} roughness={0.1} />
          </mesh>

          {/* --- [Professional Edition]: 6-DOF Articulated Robotic Arm Assembly --- */}
          {isPro && (
            <group position={[0.11, -0.02, 0]}>
              {/* Shoulder Base Turntable */}
              <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.042, 0.042, 0.05, 16]} />
                <meshStandardMaterial color="#3b82f6" metalness={0.7} />
              </mesh>
              {/* Upper Arm Link */}
              <group position={[0.05, 0.08, 0]} rotation={[0, 0, -0.65]}>
                <mesh position={[0, 0.12, 0]}>
                  <cylinderGeometry args={[0.028, 0.032, 0.24, 16]} />
                  <meshStandardMaterial color="#f8fafc" metalness={0.8} />
                </mesh>
                {/* Forearm Joint */}
                <group position={[0, 0.24, 0]} rotation={[0, 0, 1.2]}>
                  <mesh position={[0, 0.10, 0]}>
                    <cylinderGeometry args={[0.022, 0.026, 0.20, 16]} />
                    <meshStandardMaterial color="#38bdf8" metalness={0.6} />
                  </mesh>
                  {/* Gripper Tool Tip */}
                  <mesh position={[0.01, 0.21, 0.015]}>
                    <boxGeometry args={[0.015, 0.045, 0.012]} />
                    <meshStandardMaterial color="#18181b" metalness={0.9} />
                  </mesh>
                  <mesh position={[0.01, 0.21, -0.015]}>
                    <boxGeometry args={[0.015, 0.045, 0.012]} />
                    <meshStandardMaterial color="#18181b" metalness={0.9} />
                  </mesh>
                </group>
              </group>
            </group>
          )}

          {/* --- [Power Edition]: High-Voltage TEV/AE Partial Discharge Probe Horn --- */}
          {isPower && (
            <group position={[0.10, 0.05, 0]}>
              <mesh position={[0.06, 0, 0]}>
                <boxGeometry args={[0.12, 0.07, 0.12]} />
                <meshStandardMaterial color="#f59e0b" emissive="#f59e0b" emissiveIntensity={0.6} />
              </mesh>
              <mesh position={[0.13, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                <coneGeometry args={[0.05, 0.09, 16]} />
                <meshStandardMaterial color="#d97706" metalness={0.8} />
              </mesh>
            </group>
          )}
        </group>

        {/* 4. Top 360° PTZ Panoramic Camera Dome (Rotates with ptzPanRad) */}
        <group position={[-0.06, kinematics.height_m + 0.06, 0]} rotation={[0, ptzPanRad, 0]}>
          {/* Swivel Camera Base Neck */}
          <mesh position={[0, 0, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.04, 20]} />
            <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
          </mesh>
          {/* Glossy Black Spherical Dome */}
          <mesh position={[0, 0.05, 0]}>
            <sphereGeometry args={[0.085, 24, 24]} />
            <meshStandardMaterial color="#09090b" metalness={0.95} roughness={0.08} />
          </mesh>
          {/* Dual Optical Lens Hood */}
          <mesh position={[0.07, 0.05, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.028, 0.032, 0.04, 16]} />
            <meshStandardMaterial color="#000000" roughness={0.1} metalness={0.95} />
          </mesh>
          {/* Forward View Frustum Laser Guide */}
          <mesh position={[0.26, 0.05, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.14, 0.42, 16, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.24} side={THREE.DoubleSide} />
          </mesh>
        </group>

        {/* Minimal English Name Badge Box */}
        <Html position={[0, kinematics.height_m + 0.32, 0]} center distanceFactor={10}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            title="클릭하여 모델 상세 정보 보기"
            style={{
              background: isDarkMode ? "rgba(10, 16, 32, 0.94)" : "rgba(255, 255, 255, 0.96)",
              border: isDarkMode
                ? `1.5px solid ${isSelected ? "#38bdf8" : "rgba(255, 255, 255, 0.16)"}`
                : `1.5px solid ${isSelected ? "#2563eb" : "#cbd5e1"}`,
              borderRadius: 99,
              padding: "4px 12px",
              color: isDarkMode ? "#ffffff" : "#0f172a",
              fontSize: 11.5,
              fontWeight: 800,
              fontFamily: "Calibri, 'Malgun Gothic', sans-serif",
              letterSpacing: "0.04em",
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isDarkMode
                ? isSelected
                  ? "0 0 16px rgba(56, 189, 248, 0.6), 0 4px 12px rgba(0, 0, 0, 0.7)"
                  : "0 4px 14px rgba(0, 0, 0, 0.6)"
                : isSelected
                ? "0 0 12px rgba(37, 99, 235, 0.35), 0 2px 8px rgba(0, 0, 0, 0.08)"
                : "0 2px 8px rgba(0, 0, 0, 0.12)",
              display: "flex",
              alignItems: "center",
              gap: 7,
              userSelect: "none",
              transition: "all 0.15s ease",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS"
                  ? (isDarkMode ? "#22c55e" : "#16a34a")
                  : (isDarkMode ? "#ef4444" : "#dc2626"),
                boxShadow: telemetry?.online_mode === "LIVE_WEBSOCKET_REDIS"
                  ? `0 0 8px ${isDarkMode ? "#22c55e" : "#16a34a"}`
                  : `0 0 6px ${isDarkMode ? "#ef4444" : "#dc2626"}`,
              }}
            />
            <span style={{ color: isSelected ? (isDarkMode ? "#38bdf8" : "#2563eb") : (isDarkMode ? "#ffffff" : "#0f172a") }}>
              {englishName}
            </span>
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
  isDarkMode = false,
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
        background: isDarkMode ? "#0d0d10" : "#f8fafc",
        borderRadius: 20,
        overflow: "hidden",
        border: isDarkMode ? "1.5px solid #222226" : "1.5px solid #e2e8f0",
      }}
    >
      <Canvas camera={{ position: [center[0] + 5.6, 6.0, -center[1] + 5.6], fov: 40 }}>
        <color attach="background" args={[isDarkMode ? "#080a14" : "#f8fafc"]} />
        <ambientLight intensity={isDarkMode ? 0.9 : 1.3} />
        <directionalLight position={[8, 16, 10]} intensity={isDarkMode ? 1.4 : 1.8} />
        <pointLight position={[1.5, 4, 1.5]} intensity={0.8} color="#3b82f6" />

        <OrbitControls target={[center[0], 0.4, -center[1]]} maxPolarAngle={Math.PI / 2.08} />

        <Grid
          position={[center[0], 0.01, -center[1]]}
          args={[26, 26]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor={isDarkMode ? "#1e293b" : "#cbd5e1"}
          sectionSize={2.5}
          sectionThickness={1.2}
          sectionColor={isDarkMode ? "#2563eb" : "#3b82f6"}
          fadeDistance={24}
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0, -center[1]]}>
          <planeGeometry args={[26, 26]} />
          <meshStandardMaterial color={isDarkMode ? "#080a14" : "#f1f5f9"} transparent opacity={0.9} />
        </mesh>

        {masterMap?.overlap_blocks ? (
          <>
            {/* Overlapped Wall Blocks where Flagship map.pgm and Power map.pgm match (Solid & Prominent) */}
            <ExtrudedWalls
              blocks={masterMap.overlap_blocks}
              wallHeight={wallHeight}
              color="#1e293b"
              emissive="#22c55e"
              opacity={0.92}
              emissiveIntensity={0.35}
            />
            {/* Flagship-only Non-matching Blocks (80% 투명도 -> 20% 불투명도로 거의 안보이게 처리) */}
            <ExtrudedWalls
              blocks={masterMap.flag_only_blocks || []}
              wallHeight={wallHeight}
              color="#0f172a"
              emissive="#00f2fe"
              opacity={0.20}
              emissiveIntensity={0.06}
            />
            {/* Power-only Calibrated Non-matching Blocks (80% 투명도 -> 20% 불투명도로 거의 안보이게 처리) */}
            <ExtrudedWalls
              blocks={masterMap.power_only_blocks || []}
              wallHeight={wallHeight}
              color="#0f172a"
              emissive="#f59e0b"
              opacity={0.20}
              emissiveIntensity={0.06}
            />
          </>
        ) : (
          masterMap?.wall_blocks && <ExtrudedWalls blocks={masterMap.wall_blocks} wallHeight={wallHeight} />
        )}

        <VirtualFacilityPOIs pois={masterMap?.spatial_pois || []} />

        {/* Per-Robot Most-Frequent Patrol Path (Refined Gray Dashed Line with Sleek Waypoint Markers) */}
        {liveRobots.map((robot) => {
          const rawPts = robot.patrol_path_world || [];
          if (rawPts.length < 2) return null;
          const pts = rawPts.map(([x, y]) => [x, 0.025, -y] as [number, number, number]);

          return (
            <group key={`patrol-path-${robot.id}`}>
              {/* Elegant Gray Dashed Patrol Trajectory Line */}
              <Line
                points={pts}
                color="#64748b"
                lineWidth={1.8}
                dashed
                dashSize={0.24}
                gapSize={0.14}
                dashScale={1}
              />

              {/* Refined Waypoint Nodes (Subtle Flat Rings with Center Markers) */}
              {pts.map((p, idx) => {
                const isDock = idx === 0 || idx === pts.length - 1;
                return (
                  <group key={`wp-${robot.id}-${idx}`} position={p}>
                    {isDock ? (
                      // Charging Dock Origin Station (Subtle Emerald Green Ring)
                      <group position={[0, 0.005, 0]}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                          <ringGeometry args={[0.08, 0.13, 24]} />
                          <meshBasicMaterial color="#10b981" side={THREE.DoubleSide} transparent opacity={0.85} />
                        </mesh>
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                          <ringGeometry args={[0.03, 0.05, 16]} />
                          <meshBasicMaterial color="#34d399" side={THREE.DoubleSide} />
                        </mesh>
                      </group>
                    ) : (
                      // Standard Waypoint Node: Sleek Slate Gray Ring + Center Point
                      <group position={[0, 0.002, 0]}>
                        <mesh rotation={[-Math.PI / 2, 0, 0]}>
                          <ringGeometry args={[0.035, 0.055, 16]} />
                          <meshBasicMaterial color="#64748b" side={THREE.DoubleSide} transparent opacity={0.55} />
                        </mesh>
                        <mesh position={[0, 0.002, 0]}>
                          <sphereGeometry args={[0.018, 10, 10]} />
                          <meshBasicMaterial color="#94a3b8" />
                        </mesh>
                      </group>
                    )}
                  </group>
                );
              })}
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
            isDarkMode={isDarkMode}
          />
        ))}
      </Canvas>
    </div>
  );
};
