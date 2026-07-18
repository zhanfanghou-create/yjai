import { useCallback, useMemo, useRef, useState } from "react";
import { useDirectorStore } from "../store/directorStore";
import { useAnimationStore } from "../store/animationStore";
import { cloneTransform, type AnimationTargetKind, type EaseType } from "../schema/animationSchema";
import { recordViewportAnimation } from "./recordAnimation";

const EASE_OPTIONS: Array<{ value: EaseType; label: string }> = [
  { value: "linear", label: "线性" },
  { value: "easeIn", label: "缓入" },
  { value: "easeOut", label: "缓出" },
  { value: "easeInOut", label: "缓入缓出" },
];

function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const s = Math.floor(total);
  const cs = Math.floor((total - s) * 100);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}.${String(cs).padStart(2, "0")}`;
}

export function TimelinePanel() {
  const isOpen = useAnimationStore((state) => state.isTimelineOpen);
  const toggleTimeline = useAnimationStore((state) => state.toggleTimeline);
  const timeline = useAnimationStore((state) => state.timeline);
  const playhead = useAnimationStore((state) => state.playhead);
  const isPlaying = useAnimationStore((state) => state.isPlaying);
  const recordingState = useAnimationStore((state) => state.recordingState);
  const selectedTrackId = useAnimationStore((state) => state.selectedTrackId);
  const selectedKeyframeId = useAnimationStore((state) => state.selectedKeyframeId);

  const play = useAnimationStore((state) => state.play);
  const pause = useAnimationStore((state) => state.pause);
  const stop = useAnimationStore((state) => state.stop);
  const setPlayhead = useAnimationStore((state) => state.setPlayhead);
  const setDuration = useAnimationStore((state) => state.setDuration);
  const setFps = useAnimationStore((state) => state.setFps);
  const addKeyframe = useAnimationStore((state) => state.addKeyframe);
  const removeKeyframe = useAnimationStore((state) => state.removeKeyframe);
  const removeTrack = useAnimationStore((state) => state.removeTrack);
  const moveKeyframeTime = useAnimationStore((state) => state.moveKeyframeTime);
  const setKeyframeEase = useAnimationStore((state) => state.setKeyframeEase);
  const setKeyframeSpeed = useAnimationStore((state) => state.setKeyframeSpeed);
  const selectKeyframe = useAnimationStore((state) => state.selectKeyframe);
  const setRecordingState = useAnimationStore((state) => state.setRecordingState);
  const applyTimelineAtTime = useAnimationStore((state) => state.applyTimelineAtTime);

  const objects = useDirectorStore((state) => state.project.objects);
  const cameras = useDirectorStore((state) => state.project.cameras);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const selectedObjectIds = useDirectorStore((state) => state.selectedObjectIds);
  const activeCameraId = useDirectorStore((state) => state.project.activeCameraId);
  const viewMode = useDirectorStore((state) => state.viewMode);
  const selectObject = useDirectorStore((state) => state.selectObject);

  const trackAreaRef = useRef<HTMLDivElement | null>(null);
  const recordAbortRef = useRef<AbortController | null>(null);
  const [dragKeyframe, setDragKeyframe] = useState<{ trackId: string; keyframeId: string } | null>(null);

  const duration = timeline.duration;

  const selectedKeyframe = useMemo(() => {
    if (!selectedTrackId || !selectedKeyframeId) return null;
    const track = timeline.tracks.find((t) => t.id === selectedTrackId);
    return track?.keyframes.find((f) => f.id === selectedKeyframeId) ?? null;
  }, [selectedKeyframeId, selectedTrackId, timeline.tracks]);

  const resolveActiveTargets = useCallback((): Array<{
    id: string;
    kind: AnimationTargetKind;
    name: string;
    transform: ReturnType<typeof cloneTransform>;
  }> => {
    const targets: Array<{
      id: string;
      kind: AnimationTargetKind;
      name: string;
      transform: ReturnType<typeof cloneTransform>;
    }> = [];

    if (viewMode === "camera" && activeCameraId) {
      const camera = cameras.find((c) => c.id === activeCameraId);
      if (camera) {
        targets.push({
          id: camera.id,
          kind: "camera",
          name: camera.name,
          transform: cloneTransform(camera.transform),
        });
      }
      return targets;
    }

    const ids = selectedObjectIds.length > 0 ? selectedObjectIds : selectedObjectId ? [selectedObjectId] : [];
    ids.forEach((id) => {
      const object = objects.find((o) => o.id === id);
      if (object) {
        const kind: AnimationTargetKind = object.kind === "camera" ? "camera" : "object";
        targets.push({
          id: object.id,
          kind,
          name: object.name,
          transform: cloneTransform(object.transform),
        });
      }
    });
    return targets;
  }, [activeCameraId, cameras, objects, selectedObjectId, selectedObjectIds, viewMode]);

  const handleAddKeyframe = useCallback(() => {
    const targets = resolveActiveTargets();
    if (targets.length === 0) return;
    targets.forEach((target) => {
      addKeyframe(target.id, target.kind, target.name, playhead, target.transform);
    });
  }, [addKeyframe, playhead, resolveActiveTargets]);

  const timeToPercent = useCallback(
    (time: number) => `${(time / Math.max(duration, 1e-6)) * 100}%`,
    [duration]
  );

  const percentToTime = useCallback(
    (clientX: number) => {
      const el = trackAreaRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
      return ratio * duration;
    },
    [duration]
  );

  const handleScrub = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (dragKeyframe) return;
      setPlayhead(percentToTime(event.clientX));
    },
    [dragKeyframe, percentToTime, setPlayhead]
  );

  const handleKeyframePointerDown = useCallback(
    (trackId: string, keyframeId: string, event: React.PointerEvent) => {
      event.stopPropagation();
      selectKeyframe(trackId, keyframeId);
      setDragKeyframe({ trackId, keyframeId });
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
    },
    [selectKeyframe]
  );

  const handleKeyframePointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (!dragKeyframe) return;
      moveKeyframeTime(dragKeyframe.trackId, dragKeyframe.keyframeId, percentToTime(event.clientX));
    },
    [dragKeyframe, moveKeyframeTime, percentToTime]
  );

  const handleKeyframePointerUp = useCallback(() => {
    setDragKeyframe(null);
  }, []);

  const handleRecord = useCallback(async () => {
    // 录制中再次点击 -> 终止录制（提交已录内容）
    if (recordingState === "recording") {
      recordAbortRef.current?.abort();
      return;
    }
    if (recordingState !== "idle") return;
    pause();
    setPlayhead(0);
    setRecordingState("recording");
    const controller = new AbortController();
    recordAbortRef.current = controller;
    try {
      await recordViewportAnimation({
        fps: timeline.fps,
        durationSeconds: duration,
        signal: controller.signal,
        onTick: (t) => applyTimelineAtTime(t),
      });
    } catch (error) {
      console.error("录制失败", error);
    } finally {
      recordAbortRef.current = null;
      setRecordingState("idle");
      setPlayhead(0);
    }
  }, [applyTimelineAtTime, duration, pause, recordingState, setPlayhead, setRecordingState, timeline.fps]);

  const ticks = useMemo(() => {
    const count = Math.min(20, Math.max(4, Math.round(duration)));
    return Array.from({ length: count + 1 }, (_, i) => (duration / count) * i);
  }, [duration]);

  return (
    <div className={`timeline-panel${isOpen ? " is-open" : ""}`}>
      <button type="button" className="timeline-toggle" onClick={toggleTimeline}>
        <span className="timeline-toggle-icon">{isOpen ? "▾" : "▴"}</span>
        <span>时间线 / 帧动画</span>
        <span className="timeline-toggle-time">
          {formatTime(playhead)} / {formatTime(duration)}
        </span>
      </button>

      {isOpen ? (
        <div className="timeline-body">
          <div className="timeline-controls">
            <div className="timeline-transport">
              <button type="button" onClick={() => setPlayhead(0)} title="回到开头">
                ⏮
              </button>
              {isPlaying ? (
                <button type="button" onClick={pause} title="暂停">
                  ⏸
                </button>
              ) : (
                <button type="button" onClick={play} title="播放">
                  ▶
                </button>
              )}
              <button type="button" onClick={stop} title="停止">
                ⏹
              </button>
              <button
                type="button"
                className={recordingState === "recording" ? "is-recording" : ""}
                onClick={handleRecord}
                title={recordingState === "recording" ? "点击终止录制并提交到画布" : "录制 480P 预览并提交到画布"}
              >
                {recordingState === "recording" ? "■ 终止录制" : "● 录制"}
              </button>
            </div>

            <button type="button" className="timeline-key-btn" onClick={handleAddKeyframe}>
              ◆ 打关键帧
            </button>

            <label className="timeline-field">
              时长
              <input
                type="number"
                min={1}
                max={600}
                step={0.5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 1)}
              />
              秒
            </label>

            <label className="timeline-field">
              帧率
              <select value={timeline.fps} onChange={(e) => setFps(Number(e.target.value))}>
                {[10, 12, 15, 24, 30].map((fps) => (
                  <option key={fps} value={fps}>
                    {fps} fps
                  </option>
                ))}
              </select>
            </label>

            {selectedKeyframe && selectedTrackId ? (
              <div className="timeline-keyframe-editor">
                <span className="timeline-keyframe-title">
                  关键帧 @ {formatTime(selectedKeyframe.time)}
                </span>
                <label className="timeline-field">
                  缓动
                  <select
                    value={selectedKeyframe.ease}
                    onChange={(e) =>
                      setKeyframeEase(selectedTrackId, selectedKeyframe.id, e.target.value as EaseType)
                    }
                  >
                    {EASE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="timeline-field">
                  速度 {selectedKeyframe.speed.toFixed(1)}x
                  <input
                    type="range"
                    min={0.1}
                    max={4}
                    step={0.1}
                    value={selectedKeyframe.speed}
                    onChange={(e) =>
                      setKeyframeSpeed(selectedTrackId, selectedKeyframe.id, Number(e.target.value))
                    }
                  />
                </label>
                <button
                  type="button"
                  className="timeline-danger"
                  onClick={() => removeKeyframe(selectedTrackId, selectedKeyframe.id)}
                >
                  删除关键帧
                </button>
              </div>
            ) : null}
          </div>

          <div className="timeline-tracks">
            <div className="timeline-track-labels">
              <div className="timeline-track-labels-head">对象</div>
              {timeline.tracks.length === 0 ? (
                <div className="timeline-empty-hint">
                  选中对象/相机后点击「打关键帧」
                </div>
              ) : (
                timeline.tracks.map((track) => (
                  <div
                    key={track.id}
                    className={`timeline-track-label${
                      selectedObjectId === track.targetId ? " is-active" : ""
                    }`}
                    onClick={() => {
                      if (track.targetKind !== "camera") {
                        selectObject(track.targetId);
                      }
                    }}
                  >
                    <span className="timeline-track-kind">
                      {track.targetKind === "camera" ? "🎥" : "◆"}
                    </span>
                    <span className="timeline-track-name">{track.name}</span>
                    <button
                      type="button"
                      className="timeline-track-remove"
                      title="移除轨道"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTrack(track.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="timeline-track-area" ref={trackAreaRef} onMouseDown={handleScrub}>
              <div className="timeline-ruler">
                {ticks.map((t, i) => (
                  <div key={i} className="timeline-tick" style={{ left: timeToPercent(t) }}>
                    <span>{t.toFixed(1)}</span>
                  </div>
                ))}
              </div>

              <div
                className="timeline-playhead"
                style={{ left: timeToPercent(playhead) }}
              />

              <div className="timeline-track-rows">
                {timeline.tracks.map((track) => (
                  <div key={track.id} className="timeline-track-row">
                    {track.keyframes.map((frame) => (
                      <button
                        type="button"
                        key={frame.id}
                        className={`timeline-keyframe-dot${
                          selectedKeyframeId === frame.id ? " is-selected" : ""
                        }`}
                        style={{ left: timeToPercent(frame.time) }}
                        onPointerDown={(e) => handleKeyframePointerDown(track.id, frame.id, e)}
                        onPointerMove={handleKeyframePointerMove}
                        onPointerUp={handleKeyframePointerUp}
                        title={`${formatTime(frame.time)} · ${frame.ease}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
