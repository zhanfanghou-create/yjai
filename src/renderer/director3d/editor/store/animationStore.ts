import { create } from "zustand";
import type { DirectorTransform } from "../schema/directorProject";
import {
  cloneTransform,
  createEmptyTimeline,
  createId,
  sampleTrackAtTime,
  type AnimationGroup,
  type AnimationTargetKind,
  type AnimationTimeline,
  type AnimationTrack,
  type EaseType,
  type Keyframe,
  type Vec3,
} from "../schema/animationSchema";
import { useDirectorStore } from "./directorStore";

export type RecordingState = "idle" | "recording" | "processing";

interface AnimationStoreState {
  timeline: AnimationTimeline;
  playhead: number;
  isPlaying: boolean;
  isTimelineOpen: boolean;
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  recordingState: RecordingState;

  toggleTimeline: () => void;
  setTimelineOpen: (open: boolean) => void;
  setPlayhead: (time: number) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  setDuration: (duration: number) => void;
  setFps: (fps: number) => void;

  ensureTrack: (targetId: string, targetKind: AnimationTargetKind, name: string) => AnimationTrack;
  getTrackByTarget: (targetId: string) => AnimationTrack | undefined;
  addKeyframe: (targetId: string, targetKind: AnimationTargetKind, name: string, time: number, transform: DirectorTransform) => void;
  removeKeyframe: (trackId: string, keyframeId: string) => void;
  removeTrack: (trackId: string) => void;
  updateKeyframe: (trackId: string, keyframeId: string, patch: Partial<Keyframe>) => void;
  moveKeyframeTime: (trackId: string, keyframeId: string, time: number) => void;
  setKeyframeEase: (trackId: string, keyframeId: string, ease: EaseType) => void;
  setKeyframeSpeed: (trackId: string, keyframeId: string, speed: number) => void;
  updateKeyframeHandle: (trackId: string, keyframeId: string, which: "in" | "out", handle: Vec3) => void;
  selectKeyframe: (trackId: string | null, keyframeId: string | null) => void;

  addGroup: (name: string, memberIds: string[]) => void;
  removeGroup: (groupId: string) => void;

  setRecordingState: (state: RecordingState) => void;

  applyTimelineAtTime: (time: number) => void;
}

let rafId: number | null = null;
let lastFrameTime = 0;

function stopRaf() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

/**
 * 把某一时间点所有轨道的采样写回 directorStore（对象/相机变换）。
 * 播放时使用，不进入 undo 批次。
 */
function writeTrackToDirector(track: AnimationTrack, transform: DirectorTransform) {
  const directorState = useDirectorStore.getState();
  if (track.targetKind === "camera") {
    directorState.updateCamera(track.targetId, {
      transform: cloneTransform(transform),
    });
  } else {
    directorState.updateObjectTransform(track.targetId, {
      position: [...transform.position] as Vec3,
      rotation: [...transform.rotation] as Vec3,
      scale: [...transform.scale] as Vec3,
    });
  }
}

export const useAnimationStore = create<AnimationStoreState>((set, get) => ({
  timeline: createEmptyTimeline(),
  playhead: 0,
  isPlaying: false,
  isTimelineOpen: false,
  selectedTrackId: null,
  selectedKeyframeId: null,
  recordingState: "idle",

  toggleTimeline: () => set((state) => ({ isTimelineOpen: !state.isTimelineOpen })),
  setTimelineOpen: (open) => set({ isTimelineOpen: open }),

  setPlayhead: (time) => {
    const { timeline } = get();
    const clamped = Math.min(Math.max(time, 0), timeline.duration);
    set({ playhead: clamped });
    get().applyTimelineAtTime(clamped);
  },

  play: () => {
    if (get().isPlaying) return;
    set({ isPlaying: true });
    lastFrameTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      const state = get();
      let next = state.playhead + dt;
      if (next >= state.timeline.duration) {
        next = state.timeline.duration;
        set({ playhead: next });
        state.applyTimelineAtTime(next);
        set({ isPlaying: false });
        stopRaf();
        return;
      }

      set({ playhead: next });
      state.applyTimelineAtTime(next);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
  },

  pause: () => {
    stopRaf();
    set({ isPlaying: false });
  },

  stop: () => {
    stopRaf();
    set({ isPlaying: false, playhead: 0 });
    get().applyTimelineAtTime(0);
  },

  setDuration: (duration) =>
    set((state) => ({
      timeline: { ...state.timeline, duration: Math.max(0.5, duration) },
      playhead: Math.min(state.playhead, Math.max(0.5, duration)),
    })),

  setFps: (fps) =>
    set((state) => ({
      timeline: { ...state.timeline, fps: Math.min(60, Math.max(1, Math.round(fps))) },
    })),

  ensureTrack: (targetId, targetKind, name) => {
    const existing = get().timeline.tracks.find((track) => track.targetId === targetId);
    if (existing) return existing;

    const track: AnimationTrack = {
      id: createId("track"),
      targetId,
      targetKind,
      channel: "transform",
      name,
      keyframes: [],
    };
    set((state) => ({
      timeline: { ...state.timeline, tracks: [...state.timeline.tracks, track] },
    }));
    return track;
  },

  getTrackByTarget: (targetId) => get().timeline.tracks.find((track) => track.targetId === targetId),

  addKeyframe: (targetId, targetKind, name, time, transform) => {
    const track = get().ensureTrack(targetId, targetKind, name);
    const roundedTime = Number(time.toFixed(3));

    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((current) => {
          if (current.id !== track.id) return current;

          const withoutSameTime = current.keyframes.filter(
            (frame) => Math.abs(frame.time - roundedTime) > 1e-3
          );
          const keyframe: Keyframe = {
            id: createId("kf"),
            time: roundedTime,
            transform: cloneTransform(transform),
            ease: "easeInOut",
            speed: 1,
            spatialInHandle: [0, 0, 0],
            spatialOutHandle: [0, 0, 0],
          };
          return {
            ...current,
            keyframes: [...withoutSameTime, keyframe].sort((a, b) => a.time - b.time),
          };
        }),
      },
    }));
  },

  removeKeyframe: (trackId, keyframeId) =>
    set((state) => ({
      selectedKeyframeId: state.selectedKeyframeId === keyframeId ? null : state.selectedKeyframeId,
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === trackId
            ? { ...track, keyframes: track.keyframes.filter((frame) => frame.id !== keyframeId) }
            : track
        ),
      },
    })),

  removeTrack: (trackId) =>
    set((state) => ({
      selectedTrackId: state.selectedTrackId === trackId ? null : state.selectedTrackId,
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.filter((track) => track.id !== trackId),
      },
    })),

  updateKeyframe: (trackId, keyframeId, patch) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                keyframes: track.keyframes.map((frame) =>
                  frame.id === keyframeId ? { ...frame, ...patch } : frame
                ),
              }
            : track
        ),
      },
    })),

  moveKeyframeTime: (trackId, keyframeId, time) => {
    const duration = get().timeline.duration;
    const clamped = Number(Math.min(Math.max(time, 0), duration).toFixed(3));
    set((state) => ({
      timeline: {
        ...state.timeline,
        tracks: state.timeline.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                keyframes: track.keyframes
                  .map((frame) => (frame.id === keyframeId ? { ...frame, time: clamped } : frame))
                  .sort((a, b) => a.time - b.time),
              }
            : track
        ),
      },
    }));
  },

  setKeyframeEase: (trackId, keyframeId, ease) =>
    get().updateKeyframe(trackId, keyframeId, { ease }),

  setKeyframeSpeed: (trackId, keyframeId, speed) =>
    get().updateKeyframe(trackId, keyframeId, { speed: Math.min(4, Math.max(0.1, speed)) }),

  updateKeyframeHandle: (trackId, keyframeId, which, handle) =>
    get().updateKeyframe(
      trackId,
      keyframeId,
      which === "in" ? { spatialInHandle: handle } : { spatialOutHandle: handle }
    ),

  selectKeyframe: (trackId, keyframeId) =>
    set({ selectedTrackId: trackId, selectedKeyframeId: keyframeId }),

  addGroup: (name, memberIds) => {
    const group: AnimationGroup = { id: createId("group"), name, memberIds };
    set((state) => ({
      timeline: { ...state.timeline, groups: [...state.timeline.groups, group] },
    }));
  },

  removeGroup: (groupId) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        groups: state.timeline.groups.filter((group) => group.id !== groupId),
      },
    })),

  setRecordingState: (recordingState) => set({ recordingState }),

  applyTimelineAtTime: (time) => {
    const { timeline } = get();
    timeline.tracks.forEach((track) => {
      const sampled = sampleTrackAtTime(track, time);
      if (sampled) {
        writeTrackToDirector(track, sampled);
      }
    });
  },
}));
