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
    online_mode?: string;
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
        opacity={0.82}
        roughness={0.3}
        metalness={0.65}
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
  const liftH = Math.min(kinematics.height_m - 0.25, Math.max(0.17, telemetry?.lift_height_m ?? 0.17));
  const ptzPanRad = THREE.MathUtils.degToRad(telemetry?.ptz_pan_deg ?? 0);
  const isPro = robot.model_type === "profession_4wd";
  const isPower = robot.model_type === "power_4wd";

  return (
    <group>
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
        {isSelected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.42, 0.52, 32]} />
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
            <group
              position={[0.18, 0, 0]}
              rotation={[0, 0, telemetry.arm_pose === "OPENING_CABINET_DOOR" ? -0.35 : -0.95]}
            >
              <mesh position={[0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.035, 0.04, 0.36, 16]} />
                <meshStandardMaterial color="#f4f4f5" metalness={0.85} />
              </mesh>
              <mesh position={[0.35, 0, 0]}>
                <boxGeometry args={[0.08, 0.09, 0.12]} />
                <meshStandardMaterial color="#a855f7" emissive="#a855f7" emissiveIntensity={0.5} />
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

        {/* Clean Floating Tag */}
        <Html position={[0, kinematics.height_m + 0.35, 0]} center distanceFactor={10}>
          <div
            onClick={() => onSelect()}
            style={{
              background: isSelected ? "#141417" : "rgba(20, 20, 23, 0.88)",
              border: `1.5px solid ${isSelected ? "#ff3b30" : color}`,
              borderRadius: 10,
              padding: "6px 12px",
              color: "#ffffff",
              fontSize: 12,
              whiteSpace: "nowrap",
              cursor: "pointer",
              boxShadow: isSelected ? "0 8px 24px rgba(255, 59, 48, 0.35)" : "0 4px 12px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: telemetry?.online_mode === "LIVE_REDIS_SYNC" ? "#22c55e" : "#f59e0b",
                }}
              />
              <span>{robot.display_name}</span>
              <span style={{ color: "#a1a1aa", fontWeight: 600 }}>{telemetry?.battery_pct}%</span>
            </div>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>
              {telemetry?.position_name || "실시간 주행"} · ({ telemetry?.local_x?.toFixed(2) }, { telemetry?.local_y?.toFixed(2) })m
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
  // Center camera around real charging station [0, 0]
  const center = [0.6, -1.2];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#0d0d10", borderRadius: 18, overflow: "hidden" }}>
      <Canvas camera={{ position: [center[0] + 5.2, 5.8, -center[1] + 5.2], fov: 40 }}>
        <color attach="background" args={["#0d0d10"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[8, 16, 10]} intensity={1.4} />
        <pointLight position={[0, 4, 0]} intensity={1.0} color="#ff3b30" />

        <OrbitControls target={[center[0], 0.4, -center[1]]} maxPolarAngle={Math.PI / 2.08} />

        {/* Synthwave / Rookiss Style Red-Accented Perspective Grid */}
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
          <planeGeometry args={[26, 26]} />
          <meshStandardMaterial color="#0d0d10" transparent opacity={0.88} />
        </mesh>

        {masterMap?.wall_blocks && (
          <ExtrudedWalls blocks={masterMap.wall_blocks} wallHeight={wallHeight} />
        )}

        {robots.map((robot) => (
          <ParametricURDFRobot
            key={robot.id}
            robot={robot}
            isSelected={robot.id === selectedRobotId}
            onSelect={() => onSelectRobot(robot.id)}
          />
        ))}
      </Canvas>

      {/* Clean Minimal Badge */}
      <div
        style={{
          position: "absolute",
          top: 16,
          left: 16,
          background: "rgba(18, 18, 22, 0.88)",
          border: "1px solid #27272a",
          borderRadius: 10,
          padding: "8px 14px",
          fontSize: 12,
          color: "#d4d4d8",
          pointerEvents: "none",
        }}
      >
        <span style={{ color: "#ff3b30", fontWeight: 800, marginRight: 8 }}>LIVE 3D TWIN</span>
        바닥을 클릭하면 선택한 로봇이 해당 좌표로 이동합니다 (실시간 Redis 위치 동기화 중)
      </div>
    </div>
  );
};
