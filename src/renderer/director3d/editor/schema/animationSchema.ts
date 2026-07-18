import type { DirectorTransform } from "./directorProject";

export type EaseType = "linear" | "easeIn" | "easeOut" | "easeInOut";

export type AnimationTargetKind = "object" | "camera" | "crowd" | "group";

export type Vec3 = [number, number, number];

/**
 * 单个关键帧。
 * - time: 秒
 * - transform: 该时间点对象的完整变换（位置/旋转/缩放）
 * - ease: 时间缓动类型（缓入/缓出）
 * - speed: 局部速度倍率（<1 慢放，>1 快放），用于影响该关键帧到下一帧的时间重映射
 * - spatialInHandle / spatialOutHandle: 相对该关键帧位置的贝塞尔手柄偏移（世界/场景空间），
 *   用于在 3D 视口内弯曲、圆滑运动轨迹曲线。
 */
export interface Keyframe {
  id: string;
  time: number;
  transform: DirectorTransform;
  ease: EaseType;
  speed: number;
  spatialInHandle: Vec3;
  spatialOutHandle: Vec3;
}

export interface AnimationTrack {
  id: string;
  targetId: string;
  targetKind: AnimationTargetKind;
  channel: "transform";
  name: string;
  keyframes: Keyframe[];
}

export interface AnimationGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface AnimationTimeline {
  tracks: AnimationTrack[];
  groups: AnimationGroup[];
  duration: number;
  fps: number;
}

export const DEFAULT_TIMELINE_DURATION = 10;
export const DEFAULT_TIMELINE_FPS = 12;

export function createEmptyTimeline(): AnimationTimeline {
  return {
    tracks: [],
    groups: [],
    duration: DEFAULT_TIMELINE_DURATION,
    fps: DEFAULT_TIMELINE_FPS,
  };
}

export function cloneTransform(transform: DirectorTransform): DirectorTransform {
  return {
    position: [...transform.position] as Vec3,
    rotation: [...transform.rotation] as Vec3,
    scale: [...transform.scale] as Vec3,
  };
}

export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function easeScalar(t: number, ease: EaseType): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  switch (ease) {
    case "easeIn":
      return clamped * clamped;
    case "easeOut":
      return clamped * (2 - clamped);
    case "easeInOut":
      return clamped < 0.5 ? 2 * clamped * clamped : -1 + (4 - 2 * clamped) * clamped;
    case "linear":
    default:
      return clamped;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * 三次贝塞尔插值 position（使用出/入手柄作为控制点）。
 * p0 = frameA.position, p1 = p0 + frameA.spatialOutHandle,
 * p2 = p3 + frameB.spatialInHandle, p3 = frameB.position
 */
function cubicBezierVec3(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const u = 1 - t;
  const w0 = u * u * u;
  const w1 = 3 * u * u * t;
  const w2 = 3 * u * t * t;
  const w3 = t * t * t;
  return [
    w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0],
    w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1],
    w0 * p0[2] + w1 * p1[2] + w2 * p2[2] + w3 * p3[2],
  ];
}

function sortedKeyframes(track: AnimationTrack): Keyframe[] {
  return [...track.keyframes].sort((a, b) => a.time - b.time);
}

/**
 * 在给定时间对轨道采样，得到插值后的完整 transform。
 * - position 使用贝塞尔手柄插值（圆滑轨迹）
 * - rotation / scale 使用带 ease 的线性插值
 * - speed 用于重映射区间内的归一化时间
 */
export function sampleTrackAtTime(track: AnimationTrack, time: number): DirectorTransform | null {
  const frames = sortedKeyframes(track);
  if (frames.length === 0) return null;
  if (frames.length === 1) return cloneTransform(frames[0].transform);

  if (time <= frames[0].time) return cloneTransform(frames[0].transform);
  const last = frames[frames.length - 1];
  if (time >= last.time) return cloneTransform(last.transform);

  let a = frames[0];
  let b = frames[1];
  for (let i = 0; i < frames.length - 1; i += 1) {
    if (time >= frames[i].time && time <= frames[i + 1].time) {
      a = frames[i];
      b = frames[i + 1];
      break;
    }
  }

  const span = Math.max(b.time - a.time, 1e-6);
  let raw = (time - a.time) / span;

  // speed 重映射：speed>1 前段更快，speed<1 更慢
  const speed = a.speed > 0 ? a.speed : 1;
  if (speed !== 1) {
    raw = Math.pow(raw, 1 / speed);
  }

  const eased = easeScalar(raw, a.ease);

  const p0 = a.transform.position;
  const p1: Vec3 = [
    a.transform.position[0] + a.spatialOutHandle[0],
    a.transform.position[1] + a.spatialOutHandle[1],
    a.transform.position[2] + a.spatialOutHandle[2],
  ];
  const p2: Vec3 = [
    b.transform.position[0] + b.spatialInHandle[0],
    b.transform.position[1] + b.spatialInHandle[1],
    b.transform.position[2] + b.spatialInHandle[2],
  ];
  const p3 = b.transform.position;

  const hasHandles =
    a.spatialOutHandle.some((v) => Math.abs(v) > 1e-6) || b.spatialInHandle.some((v) => Math.abs(v) > 1e-6);

  const position = hasHandles
    ? cubicBezierVec3(p0, p1, p2, p3, eased)
    : lerpVec3(a.transform.position, b.transform.position, eased);

  return {
    position,
    rotation: lerpVec3(a.transform.rotation, b.transform.rotation, eased),
    scale: lerpVec3(a.transform.scale, b.transform.scale, eased),
  };
}

/**
 * 生成用于绘制轨迹曲线的采样点（世界/场景空间），供 drei <Line> 使用。
 */
export function buildTrajectoryPoints(track: AnimationTrack, segmentsPerSpan = 24): Vec3[] {
  const frames = sortedKeyframes(track);
  if (frames.length < 2) return frames.map((f) => [...f.transform.position] as Vec3);

  const points: Vec3[] = [];
  for (let i = 0; i < frames.length - 1; i += 1) {
    const a = frames[i];
    const b = frames[i + 1];
    const p0 = a.transform.position;
    const p1: Vec3 = [
      a.transform.position[0] + a.spatialOutHandle[0],
      a.transform.position[1] + a.spatialOutHandle[1],
      a.transform.position[2] + a.spatialOutHandle[2],
    ];
    const p2: Vec3 = [
      b.transform.position[0] + b.spatialInHandle[0],
      b.transform.position[1] + b.spatialInHandle[1],
      b.transform.position[2] + b.spatialInHandle[2],
    ];
    const p3 = b.transform.position;
    const hasHandles =
      a.spatialOutHandle.some((v) => Math.abs(v) > 1e-6) || b.spatialInHandle.some((v) => Math.abs(v) > 1e-6);

    for (let s = 0; s <= segmentsPerSpan; s += 1) {
      const t = s / segmentsPerSpan;
      if (i > 0 && s === 0) continue;
      points.push(hasHandles ? cubicBezierVec3(p0, p1, p2, p3, t) : lerpVec3(p0, p3, t));
    }
  }
  return points;
}