import { useRef, useState } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";

interface JointHandleProps {
  /** 关节对应的调节参数键，例如 "leftShoulder.pitch" */
  jointKey: string;
  /** 关节所在的本地坐标 */
  position: [number, number, number];
  /** 关节球半径，用于计算高亮圆点与操作球的尺寸 */
  radius: number;
  /** 是否为当前选中的关节（由外部驱动，选中后展示三轴旋转操作球） */
  active: boolean;
  /** 点击圆点时回调，携带 jointKey */
  onSelect: (jointKey: string) => void;
}

const AXIS_COLORS = {
  x: "#FF5B6E",
  y: "#4ED07A",
  z: "#4F8EF7",
} as const;

const JOINT_ROTATE_MESSAGE = "storyai:director-desk-joint-rotate";

/** 拖拽灵敏度：屏幕横向每移动 1px 对应的调节角度（度） */
const DRAG_SENSITIVITY = 0.6;

function broadcastJointRotate(prefix: string, ringIndex: number, delta: number) {
  window.postMessage(
    { type: JOINT_ROTATE_MESSAGE, payload: { prefix, ringIndex, delta } },
    "*"
  );
}

/**
 * 关节高亮圆点 + 三轴旋转操作球。
 * - 平时在关节处显示一个微小高亮圆点，鼠标悬停放大。
 * - 点击后触发 onSelect（右侧面板自动弹到对应关节参数），
 *   并在关节处渲染一个半透明圆球，圆球外包裹 X/Y/Z 三个轴线圆环。
 * - 选中后可直接拖拽三个圆环进行旋转可视化操作：拖动时向外广播
 *   增量角度消息，右侧对应滑杆会实时联动更新。
 */
export function JointHandle({ jointKey, position, radius, active, onSelect }: JointHandleProps) {
  const [hovered, setHovered] = useState(false);
  const [draggingRing, setDraggingRing] = useState<number | null>(null);
  const lastXRef = useRef(0);
  const controls = useThree((state) => state.controls) as { enabled?: boolean } | null;

  const prefix = jointKey.split(".")[0];
  const dotRadius = Math.max(radius * 0.42, 0.028);
  const sphereRadius = Math.max(radius * 1.55, 0.09);
  const ringRadius = sphereRadius * 1.12;
  const tube = Math.max(sphereRadius * 0.05, 0.006);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(jointKey);
  };

  const setControlsEnabled = (enabled: boolean) => {
    if (controls && typeof controls.enabled === "boolean") {
      controls.enabled = enabled;
    }
  };

  const handleRingPointerDown = (ringIndex: number) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    // 若圆环所在关节尚未选中，先选中它
    if (!active) onSelect(jointKey);
    setDraggingRing(ringIndex);
    lastXRef.current = event.nativeEvent.clientX;
    setControlsEnabled(false);
    (event.target as Element)?.setPointerCapture?.(event.pointerId);
    document.body.style.cursor = "ew-resize";
  };

  const handleRingPointerMove = (ringIndex: number) => (event: ThreeEvent<PointerEvent>) => {
    if (draggingRing !== ringIndex) return;
    event.stopPropagation();
    const currentX = event.nativeEvent.clientX;
    const deltaPx = currentX - lastXRef.current;
    lastXRef.current = currentX;
    if (deltaPx !== 0) {
      broadcastJointRotate(prefix, ringIndex, deltaPx * DRAG_SENSITIVITY);
    }
  };

  const endDrag = (event: ThreeEvent<PointerEvent>) => {
    if (draggingRing === null) return;
    event.stopPropagation();
    setDraggingRing(null);
    setControlsEnabled(true);
    (event.target as Element)?.releasePointerCapture?.(event.pointerId);
    document.body.style.cursor = "";
  };

  const ringProps = (ringIndex: number) => ({
    onPointerDown: handleRingPointerDown(ringIndex),
    onPointerMove: handleRingPointerMove(ringIndex),
    onPointerUp: endDrag,
    onPointerOut: endDrag,
    onPointerOver: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      if (draggingRing === null) document.body.style.cursor = "ew-resize";
    },
  });

  return (
    <group position={position}>
      {/* 微小高亮圆点：始终可点击，作为关节选择的入口 */}
      <mesh
        name={`joint-dot-${jointKey}`}
        scale={hovered || active ? 1.5 : 1}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
        renderOrder={999}
      >
        <sphereGeometry args={[dotRadius, 16, 16]} />
        <meshBasicMaterial
          color={active ? "#FFE45B" : hovered ? "#FFD34D" : "#7FE7FF"}
          transparent
          opacity={active ? 1 : 0.9}
          depthTest={false}
        />
      </mesh>

      {/* 选中后展示半透明操作球 + 三轴旋转圆环（可拖拽旋转） */}
      {active ? (
        <group name={`joint-gizmo-${jointKey}`}>
          <mesh renderOrder={998}>
            <sphereGeometry args={[sphereRadius, 24, 24]} />
            <meshBasicMaterial color="#8CE3FF" transparent opacity={0.16} depthTest={false} />
          </mesh>
          {/* X 轴旋转环（绕 X 轴，圆环平面在 YZ） */}
          <mesh rotation={[0, Math.PI / 2, 0]} renderOrder={1000} {...ringProps(0)}>
            <torusGeometry args={[ringRadius, tube, 12, 48]} />
            <meshBasicMaterial
              color={AXIS_COLORS.x}
              transparent
              opacity={draggingRing === 0 ? 1 : 0.95}
              depthTest={false}
            />
          </mesh>
          {/* Y 轴旋转环 */}
          <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={1000} {...ringProps(1)}>
            <torusGeometry args={[ringRadius, tube, 12, 48]} />
            <meshBasicMaterial
              color={AXIS_COLORS.y}
              transparent
              opacity={draggingRing === 1 ? 1 : 0.95}
              depthTest={false}
            />
          </mesh>
          {/* Z 轴旋转环 */}
          <mesh renderOrder={1000} {...ringProps(2)}>
            <torusGeometry args={[ringRadius, tube, 12, 48]} />
            <meshBasicMaterial
              color={AXIS_COLORS.z}
              transparent
              opacity={draggingRing === 2 ? 1 : 0.95}
              depthTest={false}
            />
          </mesh>
        </group>
      ) : null}
    </group>
  );
}
