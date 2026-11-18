import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Html, Line } from "@react-three/drei";
import * as THREE from "three";

export interface RobotRecord {
  id: string;
  hostname: string;
  display_name: string;
  model_type: string;
  model_code: string;
  color: string;
  ip: string;
  tags: string[];
  kinematics: {
    length_m: number;
    width_m: number;
    height_m: number;
    wheel_base_m: number;
    laser_tf_xyz: [number, number, number];
    lift_range_m: [number, number];
    drive_type: string;
    arm_type: string;
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
    battery_pct: number;
    fsm_state: string;
    move_mode: string;
    lift_height_m: number;
    ptz_pan_deg: number;
    ptz_zoom: number;
    arm_pose: string;
    is_stop: boolean;
  };
}

interface UnifiedMapViewer3DProps {
  mapData: any;
  robots: RobotRecord[];
  selectedRobotId: string;
  onSelectRobot: (id: string) => void;
  onGroundClick: (wx: number, wy: number) => void;
}

const ExtrudedWalls: React.FC<{ blocks: number[][]; wallHeight: number }> = ({ blocks, wallHeight }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  React.useLayoutEffect(() => {
    if (!meshRef.current || !blocks?.length) return;
    blocks.forEach(([wx, wy, size], idx) => {
      // ROS (X, Y, Z-up) -> Three.js (X, Z_up -> Y, -Y -> Z)
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
        color="#0ea5e9"
        emissive="#0284c7"
        emissiveIntensity={0.35}
        transparent
        opacity={0.78}
        roughness={0.25}
        metalness={0.7}
      />
    </instancedMesh>
  );
};

const ParametricURDFRobot: React.FC<{
  robot: RobotRecord;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ robot, isSelected, onSelect }) => {
  const lidarRingRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (lidarRingRef.current) {
      const s = 1 + (clock.getElapsedTime() * 1.4) % 1.8;
      lidarRingRef.current.scale.set(s, s, 1);
    }
  });

  const { kinematics, telemetry, color } = robot;
  const wx = telemetry?.world_x ?? 0;
  const wy = telemetry?.world_y ?? 0;
  const yawRad = THREE.MathUtils.degToRad(telemetry?.world_yaw_deg ?? 0);
  const liftH = Math.min(kinematics.height_m - 0.25, Math.max(0.25, telemetry?.lift_height_m ?? 0.9));
  const ptzPanRad = THREE.MathUtils.degToRad(telemetry?.ptz_pan_deg ?? 0);
  const isPro = robot.model_type === "profession_4wd";
  const isPower = robot.model_type === "power_4wd";

  return (
    <group>
      {/* Navigation Path Line from Current World Pose to Target World Pose */}
      <Line
        points={[
          [wx, 0.06, -wy],
          [telemetry?.target_world_x ?? wx, 0.06, -(telemetry?.target_world_y ?? wy)],
        ]}
        color={color}
        lineWidth={2.5}
        dashed
        dashSize={0.18}
        gapSize={0.1}
      />

      <group
        position={[wx, 0, -wy]}
        rotation={[0, yawRad, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        {/* Selection Halo */}
        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.42, 0.52, 32]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        )}

        {/* LiDAR Pulse Wave at exact TF Z=0.37m */}
        <mesh
          ref={lidarRingRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[kinematics.laser_tf_xyz[0], kinematics.laser_tf_xyz[2], 0]}
        >
          <ringGeometry args={[0.15, 0.19, 28]} />
          <meshBasicMaterial color={color} transparent opacity={0.45} side={THREE.DoubleSide} />
        </mesh>

        {/* Base Link Chassis (Real move_base_params.yaml L x W x 0.30m) */}
        <mesh position={[0, 0.16, 0]}>
          <boxGeometry args={[kinematics.length_m, 0.28, kinematics.width_m]} />
          <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* Signature Accent Bumper Strip */}
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[kinematics.length_m + 0.02, 0.05, kinematics.width_m + 0.02]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>

        {/* Telescopic Lift Mast (1.57m ~ 1.58m Total Height) */}
        <mesh position={[-0.05, kinematics.height_m / 2, 0]}>
          <boxGeometry args={[0.18, kinematics.height_m - 0.28, 0.22]} />
          <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.3} />
        </mesh>

        {/* Dynamic Lift Carriage (Moves with live telemetry.lift_height_m) */}
        <group position={[0.08, liftH, 0]}>
          <mesh>
            <boxGeometry args={[0.16, 0.16, 0.26]} />
            <meshStandardMaterial color={color} metalness={0.6} roughness={0.2} />
          </mesh>

          {/* Pro 6-DOF Manipulator Arm & Force Gripper */}
          {isPro && (
            <group
              position={[0.18, 0, 0]}
              rotation={[0, 0, telemetry.arm_pose === "OPENING_CABINET_DOOR" ? -0.35 : -0.95]}
            >
              <mesh position={[0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.035, 0.04, 0.36, 16]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.85} />
              </mesh>
              <mesh position={[0.35, 0, 0]}>
                <boxGeometry args={[0.08, 0.09, 0.12]} />
                <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} />
              </mesh>
            </group>
          )}

          {/* Power 2-DOF Partial Discharge Probe */}
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
            <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* PTZ Camera Lens & FOV Cone */}
          <mesh position={[0.18, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.12, 0.32, 16, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.28} side={THREE.DoubleSide} />
          </mesh>
        </group>

        {/* Floating DNS Hostname & Telemetry Badge */}
        <Html position={[0, kinematics.height_m + 0.35, 0]} center distanceFactor={11}>
          <div
            onClick={() => onSelect()}
            style={{
              background: isSelected ? "rgba(15, 23, 42, 0.95)" : "rgba(15, 23, 42, 0.82)",
              border: `1.5px solid ${color}`,
              borderRadius: 8,
              padding: "5px 10px",
              color: "#f8fafc",
              fontSize: 11,
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isSelected ? `0 0 14px ${color}` : "none",
            }}
          >
            <div style={{ fontWeight: 700, color }}>
              {robot.hostname} ({telemetry?.battery_pct ?? 90}%)
            </div>
            <div style={{ fontSize: 10, color: "#cbd5e1" }}>
              World: ({wx.toFixed(2)}m, {wy.toFixed(2)}m) | Lift: {liftH.toFixed(2)}m
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
  onGroundClick,
}) => {
  const masterMap = mapData?.master_map;
  const wallHeight = mapData?.alignment?.wall_extrusion_height_m ?? 1.85;
  const center = masterMap?.center_world_m ?? [2.5, -2.5];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#060a12" }}>
      <Canvas camera={{ position: [center[0] + 6.5, 7.2, -center[1] + 6.5], fov: 42 }}>
        <color attach="background" args={["#060a12"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[10, 18, 12]} intensity={1.3} />
        <pointLight position={[center[0], 5, -center[1]]} intensity={0.9} color="#38bdf8" />

        <OrbitControls target={[center[0], 0.5, -center[1]]} maxPolarAngle={Math.PI / 2.08} />

        {/* Cybernetic Isometric Floor Grid */}
        <Grid
          position={[center[0], 0.01, -center[1]]}
          args={[28, 28]}
          cellSize={0.5}
          cellThickness={0.6}
          cellColor="#1e293b"
          sectionSize={2.5}
          sectionThickness={1.2}
          sectionColor="#0284c7"
          fadeDistance={26}
        />

        {/* Clickable Floor Plane for Inverse SE(2) Click-to-Move Navigation */}
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[center[0], 0, -center[1]]}
          onClick={(e) => {
            e.stopPropagation();
            const wx = Number(e.point.x.toFixed(2));
            const wy = Number((-e.point.z).toFixed(2));
            onGroundClick(wx, wy);
          }}
        >
          <planeGeometry args={[28, 28]} />
          <meshStandardMaterial color="#09101d" transparent opacity={0.85} />
        </mesh>

        {/* 3D Extruded Walls & Server Racks from real Flagship map.pgm */}
        {masterMap?.wall_blocks && (
          <ExtrudedWalls blocks={masterMap.wall_blocks} wallHeight={wallHeight} />
        )}

        {/* Render All Registered Robots in Unified World Coordinates */}
        {robots.map((robot) => (
          <ParametricURDFRobot
            key={robot.id}
            robot={robot}
            isSelected={robot.id === selectedRobotId}
            onSelect={() => onSelectRobot(robot.id)}
          />
        ))}
      </Canvas>

      {/* Overlay Legend */}
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          background: "rgba(10, 15, 28, 0.86)",
          border: "1px solid #1e293b",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        <div style={{ color: "#38bdf8", fontWeight: 700 }}>
          🌐 3D Isometric Digital Twin (Master Map: {masterMap?.folder || "flagship"}/map.pgm)
        </div>
        <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
          Res: {masterMap?.resolution || 0.05}m/px | Extruded Voxels: {masterMap?.wall_count || 0}개 | 바닥 클릭 시 선택 로봇 즉시 이동 (SE(2) 역행렬 자동 변환)
        </div>
      </div>
    </div>
  );
};
