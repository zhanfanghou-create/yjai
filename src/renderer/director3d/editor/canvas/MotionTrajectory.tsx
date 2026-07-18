import { Line } from "@react-three/drei";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import { Plane, Vector2, Vector3 } from "three";
import { useAnimationStore } from "../store/animationStore";
import { useDirectorStore } from "../store/directorStore";
import { buildTrajectoryPoints, type AnimationTrack, type Vec3 } from "../schema/animationSchema";

const TRAJECTORY_COLOR = "#7fd4ff";
const HANDLE_COLOR = "#ffd27f";
const KEYFRAME_COLOR = "#ffffff";
const KEYFRAME_SELECTED_COLOR = "#ffd27f";

type DragTarget =
  | { kind: "handle"; keyframeId: string; which: "in" | "out"; basePosition: Vec3 }
  | null;

function toVec3Tuple(v: Vector3): Vec3 {
  return [v.x, v.y, v.z];
}

function TrajectoryForTrack({ track }: { track: AnimationTrack }) {
  const selectedKeyframeId = useAnimationStore((state) => state.selectedKeyframeId);
  const selectKeyframe = useAnimationStore((state) => state.selectKeyframe);
  const updateKeyframeHandle = useAnimationStore((state) => state.updateKeyframeHandle);

  const { camera, gl } = useThree();
  const dragRef = useRef<DragTarget>(null);
  const dragPlane = useRef(new Plane());
  const ndc = useRef(new Vector2());

  const points = useMemo(() => buildTrajectoryPoints(track), [track]);

  const sortedFrames = useMemo(
    () => [...track.keyframes].sort((a, b) => a.time - b.time),
    [track.keyframes]
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const rect = gl.domElement.getBoundingClientRect();
      ndc.current.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const rayOrigin = new Vector3();
      const rayDir = new Vector3();
      rayOrigin.setFromMatrixPosition(camera.matrixWorld);
      rayDir.set(ndc.current.x, ndc.current.y, 0.5).unproject(camera).sub(rayOrigin).normalize();

      const hit = new Vector3();
      const ray = { origin: rayOrigin, direction: rayDir };
      const denom = dragPlane.current.normal.dot(ray.direction);
      if (Math.abs(denom) < 1e-6) return;
      const t = -(dragPlane.current.normal.dot(ray.origin) + dragPlane.current.constant) / denom;
      if (t < 0) return;
      hit.copy(ray.origin).add(ray.direction.clone().multiplyScalar(t));

      const base = new Vector3(...drag.basePosition);
      const handle = toVec3Tuple(hit.sub(base));
      updateKeyframeHandle(track.id, drag.keyframeId, drag.which, handle);
    },
    [camera, gl.domElement, track.id, updateKeyframeHandle]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", endDrag);
  }, [handlePointerMove]);

  const beginHandleDrag = useCallback(
    (event: ThreeEvent<PointerEvent>, keyframeId: string, which: "in" | "out", basePosition: Vec3) => {
      event.stopPropagation();
      dragRef.current = { kind: "handle", keyframeId, which, basePosition };
      // 拖拽平面：以关键帧位置为原点，法线朝向相机
      const normal = new Vector3();
      camera.getWorldDirection(normal);
      dragPlane.current.setFromNormalAndCoplanarPoint(normal, new Vector3(...basePosition));
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", endDrag);
    },
    [camera, endDrag, handlePointerMove]
  );

  if (sortedFrames.length === 0) return null;

  return (
    <group>
      {points.length >= 2 ? (
        <Line
          points={points}
          color={TRAJECTORY_COLOR}
          lineWidth={1.5}
          dashed
          dashSize={0.18}
          gapSize={0.12}
          transparent
          opacity={0.65}
        />
      ) : null}

      {sortedFrames.map((frame) => {
        const pos = frame.transform.position;
        const isSelected = selectedKeyframeId === frame.id;
        const inHandlePos: Vec3 = [
          pos[0] + frame.spatialInHandle[0],
          pos[1] + frame.spatialInHandle[1],
          pos[2] + frame.spatialInHandle[2],
        ];
        const outHandlePos: Vec3 = [
          pos[0] + frame.spatialOutHandle[0],
          pos[1] + frame.spatialOutHandle[1],
          pos[2] + frame.spatialOutHandle[2],
        ];
        const hasIn = frame.spatialInHandle.some((v) => Math.abs(v) > 1e-6);
        const hasOut = frame.spatialOutHandle.some((v) => Math.abs(v) > 1e-6);

        return (
          <group key={frame.id}>
            {/* 关键帧空间点 */}
            <mesh
              position={pos}
              onClick={(e) => {
                e.stopPropagation();
                selectKeyframe(track.id, frame.id);
              }}
            >
              <sphereGeometry args={[0.09, 16, 12]} />
              <meshBasicMaterial color={isSelected ? KEYFRAME_SELECTED_COLOR : KEYFRAME_COLOR} />
            </mesh>

            {isSelected ? (
              <>
                {/* 入手柄线 + 端点 */}
                <Line points={[pos, inHandlePos]} color={HANDLE_COLOR} lineWidth={1} transparent opacity={0.8} />
                <mesh
                  position={hasIn ? inHandlePos : pos}
                  onPointerDown={(e) => beginHandleDrag(e, frame.id, "in", pos)}
                >
                  <sphereGeometry args={[0.06, 12, 8]} />
                  <meshBasicMaterial color={HANDLE_COLOR} />
                </mesh>

                {/* 出手柄线 + 端点 */}
                <Line points={[pos, outHandlePos]} color={HANDLE_COLOR} lineWidth={1} transparent opacity={0.8} />
                <mesh
                  position={hasOut ? outHandlePos : pos}
                  onPointerDown={(e) => beginHandleDrag(e, frame.id, "out", pos)}
                >
                  <sphereGeometry args={[0.06, 12, 8]} />
                  <meshBasicMaterial color={HANDLE_COLOR} />
                </mesh>
              </>
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

/**
 * 运动轨迹叠加层：为当前选中对象/相机（若已在时间线上有轨道）显示 3D 运动轨迹虚线、
 * 关键帧空间点与贝塞尔手柄。放置在 SceneRoot 的场景 group 内，与对象共享坐标系。
 */
export function MotionTrajectory() {
  const isTimelineOpen = useAnimationStore((state) => state.isTimelineOpen);
  const tracks = useAnimationStore((state) => state.timeline.tracks);

  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const selectedObjectIds = useDirectorStore((state) => state.selectedObjectIds);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const activeCameraId = useDirectorStore((state) => state.project.activeCameraId);
  const objects = useDirectorStore((state) => state.project.objects);

  const activeTargetIds = useMemo(() => {
    const ids = new Set<string>();
    if (viewMode === "camera" && activeCameraId) {
      ids.add(activeCameraId);
    }
    if (selectedObjectIds.length > 0) {
      selectedObjectIds.forEach((id) => ids.add(id));
    } else if (selectedObjectId) {
      ids.add(selectedObjectId);
    }
    // 相机对象：若选中相机对象，映射到其 linkedCameraId
    objects.forEach((obj) => {
      if (obj.kind === "camera" && obj.linkedCameraId && ids.has(obj.id)) {
        ids.add(obj.linkedCameraId);
      }
    });
    return ids;
  }, [activeCameraId, objects, selectedObjectId, selectedObjectIds, viewMode]);

  if (!isTimelineOpen) return null;

  const visibleTracks = tracks.filter((track) => activeTargetIds.has(track.targetId));
  if (visibleTracks.length === 0) return null;

  return (
    <group>
      {visibleTracks.map((track) => (
        <TrajectoryForTrack key={track.id} track={track} />
      ))}
    </group>
  );
}