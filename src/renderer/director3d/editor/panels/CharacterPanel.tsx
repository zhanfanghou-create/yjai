import { useEffect, useMemo, useRef, useState } from "react";
import {
  InspectorAxisGroup,
  InspectorColorField,
  InspectorPanel,
  InspectorRangeNumberField,
  InspectorSelectField,
  InspectorTextField,
  InspectorSection,
} from "./InspectorControls";
import { MANNEQUIN_POSE_PRESETS } from "../presets/mannequinPosePresets";
import { MANNEQUIN_ACTION_PRESETS } from "../presets/mannequinActionPresets";
import { getCrowdAnchorTransform, useDirectorStore } from "../store/directorStore";

function replaceAxis(tuple: [number, number, number], axis: 0 | 1 | 2, value: number): [number, number, number] {
  return tuple.map((item, index) => (index === axis ? value : item)) as [number, number, number];
}

// 关节前缀 → 三个旋转环（ringIndex 0/1/2）对应的调节参数键。
// 单轴关节（肘/膝）只有一个 bend，其余环回退到该键。
const JOINT_RING_CONTROLS: Record<string, string[]> = {
  body: ["body.pitch", "body.yaw", "body.roll"],
  torso: ["torso.pitch", "torso.yaw", "torso.roll"],
  head: ["head.pitch", "head.yaw", "head.roll"],
  leftShoulder: ["leftShoulder.pitch", "leftShoulder.spread", "leftShoulder.twist"],
  rightShoulder: ["rightShoulder.pitch", "rightShoulder.spread", "rightShoulder.twist"],
  leftElbow: ["leftElbow.bend"],
  rightElbow: ["rightElbow.bend"],
  leftHip: ["leftHip.pitch", "leftHip.spread", "leftHip.twist"],
  rightHip: ["rightHip.pitch", "rightHip.spread", "rightHip.twist"],
  leftKnee: ["leftKnee.bend"],
  rightKnee: ["rightKnee.bend"],
};

export function CharacterPanel() {
  const [activeTab, setActiveTab] = useState<"properties" | "pose">("properties");
  const [selectedJointPrefix, setSelectedJointPrefix] = useState<string>("body");
  const [playingActionId, setPlayingActionId] = useState<string | null>(null);
  const selectedCrowdId = useDirectorStore((state) => state.selectedCrowdId);
  const selectedObjectId = useDirectorStore((state) => state.selectedObjectId);
  const objects = useDirectorStore((state) => state.project.objects);
  const updateObjectName = useDirectorStore((state) => state.updateObjectName);
  const updateCrowdLabel = useDirectorStore((state) => state.updateCrowdLabel);
  const updateObjectTransform = useDirectorStore((state) => state.updateObjectTransform);
  const updateCrowdTransform = useDirectorStore((state) => state.updateCrowdTransform);
  const updateUniformScale = useDirectorStore((state) => state.updateUniformScale);
  const updateCrowdUniformScale = useDirectorStore((state) => state.updateCrowdUniformScale);
  const updateObjectColor = useDirectorStore((state) => state.updateObjectColor);
  const updateCrowdColor = useDirectorStore((state) => state.updateCrowdColor);
  const applyPosePreset = useDirectorStore((state) => state.applyPosePreset);
  const applyCrowdPosePreset = useDirectorStore((state) => state.applyCrowdPosePreset);
  const updatePoseControl = useDirectorStore((state) => state.updatePoseControl);
  const updateCrowdPoseControl = useDirectorStore((state) => state.updateCrowdPoseControl);

  const applyControlsRef = useRef<(controls: Record<string, number>) => void>(() => {});
  const rotateHandlerRef = useRef<(prefix: string, ringIndex: number, delta: number) => void>(() => {});
  const rafRef = useRef<number | null>(null);

  const selection = useMemo(() => {
    const role = objects.find((item) => item.id === selectedObjectId && item.kind === "character");

    if (selectedCrowdId) {
      const crowdMembers = objects.filter((item) => item.kind === "character" && item.crowdId === selectedCrowdId);
      const crowdAnchor = getCrowdAnchorTransform(objects, selectedCrowdId);

      if (crowdMembers.length && crowdAnchor) {
        return {
          mode: "crowd" as const,
          crowdId: selectedCrowdId,
          crowdMembers,
          crowdAnchor,
          role: crowdMembers[crowdMembers.length - 1] ?? crowdMembers[0],
          name: crowdMembers[0]?.crowdLabel ?? "群众",
          color: crowdMembers[0]?.color ?? "#4F8EF7",
        };
      }
    }

    if (!role) return null;

    return {
      mode: "single" as const,
      crowdId: null,
      crowdMembers: [role],
      crowdAnchor: role.transform,
      role,
      name: role.name,
      color: role.color ?? "#4F8EF7",
    };
  }, [objects, selectedCrowdId, selectedObjectId]);

  const selectionCrowdId = selection?.crowdId ?? null;
  const selectionRoleId = selection?.role.id ?? null;
  const selectionIsCrowd = selection?.mode === "crowd";

  // 保持一个稳定的“应用整组关节参数”函数引用，供关键帧循环调用
  applyControlsRef.current = (controls: Record<string, number>) => {
    if (selectionIsCrowd && selectionCrowdId) {
      Object.entries(controls).forEach(([key, value]) => updateCrowdPoseControl(selectionCrowdId, key, value));
    } else if (selectionRoleId) {
      Object.entries(controls).forEach(([key, value]) => updatePoseControl(selectionRoleId, key, value));
    }
  };

  // 动作预设关键帧循环播放（在关键帧之间线性插值，循环）
  useEffect(() => {
    if (!playingActionId) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const action = MANNEQUIN_ACTION_PRESETS.find((item) => item.id === playingActionId);
    if (!action || action.keyframes.length === 0) return;

    // 收集本动作涉及的所有关节键，保证每帧对未提及关节归零，避免残留
    const allKeys = new Set<string>();
    action.keyframes.forEach((frame) => Object.keys(frame.controls).forEach((key) => allKeys.add(key)));

    const durationMs = Math.max(0.2, action.duration) * 1000;
    const startTime = performance.now();

    const sample = (t: number): Record<string, number> => {
      const frames = action.keyframes;
      let a = frames[0];
      let b = frames[frames.length - 1];
      for (let i = 0; i < frames.length - 1; i += 1) {
        if (t >= frames[i].t && t <= frames[i + 1].t) {
          a = frames[i];
          b = frames[i + 1];
          break;
        }
      }
      const span = b.t - a.t || 1;
      const local = Math.min(1, Math.max(0, (t - a.t) / span));
      const result: Record<string, number> = {};
      allKeys.forEach((key) => {
        const av = a.controls[key] ?? 0;
        const bv = b.controls[key] ?? 0;
        result[key] = av + (bv - av) * local;
      });
      return result;
    };

    const tick = () => {
      const elapsed = performance.now() - startTime;
      const t = (elapsed % durationMs) / durationMs;
      applyControlsRef.current(sample(t));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playingActionId, selectionRoleId, selectionCrowdId, selectionIsCrowd, updatePoseControl, updateCrowdPoseControl]);

  // 保持一个稳定的“拖拽圆环旋转关节”函数引用，供预览窗内的三轴圆环拖拽调用
  rotateHandlerRef.current = (prefix: string, ringIndex: number, delta: number) => {
    const keys = JOINT_RING_CONTROLS[prefix];
    if (!keys || keys.length === 0) return;
    const key = keys[ringIndex] ?? keys[0];
    if (!key) return;
    const controls = selection?.role.characterRig?.controls ?? {};
    const current = controls[key] ?? 0;
    const next = Math.min(90, Math.max(-90, current + delta));
    if (selectionIsCrowd && selectionCrowdId) {
      updateCrowdPoseControl(selectionCrowdId, key, next);
    } else if (selectionRoleId) {
      updatePoseControl(selectionRoleId, key, next);
    }
  };

  // 停止播放：当切换选中对象时自动停止
  useEffect(() => {
    setPlayingActionId(null);
  }, [selectionRoleId, selectionCrowdId]);

  // 监听预览窗中关节高亮圆点的点击/圆环拖拽 → 自动切换到对应关节参数并联动滑杆
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "storyai:director-desk-joint-selected" && typeof data.payload?.jointKey === "string") {
        setActiveTab("pose");
        const prefix = String(data.payload.jointKey).split(".")[0];
        if (prefix) setSelectedJointPrefix(prefix);
        return;
      }
      if (
        data.type === "storyai:director-desk-joint-rotate" &&
        typeof data.payload?.prefix === "string" &&
        typeof data.payload?.ringIndex === "number" &&
        typeof data.payload?.delta === "number"
      ) {
        setActiveTab("pose");
        setSelectedJointPrefix(data.payload.prefix);
        rotateHandlerRef.current(data.payload.prefix, data.payload.ringIndex, data.payload.delta);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  if (!selection) return null;

  const role = selection.role;
  const roleColor = selection.color;
  const transform = selection.crowdAnchor;
  const isCrowd = selection.mode === "crowd";
  const poseGroups = [
    {
      title: "身体",
      controls: [
        { key: "body.pitch", label: "前倾" },
        { key: "body.yaw", label: "转身" },
        { key: "body.roll", label: "侧倾" },
      ],
    },
    {
      title: "躯干",
      controls: [
        { key: "torso.pitch", label: "前倾" },
        { key: "torso.yaw", label: "扭转" },
        { key: "torso.roll", label: "侧倾" },
      ],
    },
    {
      title: "头部",
      controls: [
        { key: "head.pitch", label: "点头" },
        { key: "head.yaw", label: "转头" },
        { key: "head.roll", label: "歪头" },
      ],
    },
    {
      title: "左肩",
      controls: [
        { key: "leftShoulder.pitch", label: "前举" },
        { key: "leftShoulder.spread", label: "外展" },
        { key: "leftShoulder.twist", label: "扭转" },
      ],
    },
    {
      title: "右肩",
      controls: [
        { key: "rightShoulder.pitch", label: "前举" },
        { key: "rightShoulder.spread", label: "外展" },
        { key: "rightShoulder.twist", label: "扭转" },
      ],
    },
    {
      title: "左肘",
      controls: [{ key: "leftElbow.bend", label: "弯曲" }],
    },
    {
      title: "右肘",
      controls: [{ key: "rightElbow.bend", label: "弯曲" }],
    },
    {
      title: "左髋",
      controls: [
        { key: "leftHip.pitch", label: "前抬" },
        { key: "leftHip.spread", label: "外展" },
        { key: "leftHip.twist", label: "扭转" },
      ],
    },
    {
      title: "右髋",
      controls: [
        { key: "rightHip.pitch", label: "前抬" },
        { key: "rightHip.spread", label: "外展" },
        { key: "rightHip.twist", label: "扭转" },
      ],
    },
    {
      title: "左膝",
      controls: [{ key: "leftKnee.bend", label: "弯曲" }],
    },
    {
      title: "右膝",
      controls: [{ key: "rightKnee.bend", label: "弯曲" }],
    },
  ] as const;

  return (
    <InspectorPanel
      title="角色"
      ariaLabel="角色右侧属性面板"
      className="character-inspector"
      tabs={[
        { label: "属性", active: activeTab === "properties", onClick: () => setActiveTab("properties") },
        { label: "姿势", active: activeTab === "pose", onClick: () => setActiveTab("pose") },
      ]}
    >
      {activeTab === "properties" ? (
        <>
          <InspectorTextField
            label="名称"
            ariaLabel="角色名称"
            value={selection.name}
            onChange={(value) => {
              if (isCrowd && selection.crowdId) {
                updateCrowdLabel(selection.crowdId, value);
                return;
              }

              updateObjectName(role.id, value);
            }}
          />
          <InspectorAxisGroup
            label="位置"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色位置 X",
                value: transform.position[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色位置 Y",
                value: transform.position[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色位置 Z",
                value: transform.position[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        position: replaceAxis(transform.position, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label="旋转"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色旋转 X",
                value: transform.rotation[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色旋转 Y",
                value: transform.rotation[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色旋转 Z",
                value: transform.rotation[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        rotation: replaceAxis(transform.rotation, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorAxisGroup
            label="缩放"
            axes={[
              {
                axis: "X",
                ariaLabel: "角色缩放 X",
                step: "0.01",
                value: transform.scale[0],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 0, Number(value)),
                      }),
              },
              {
                axis: "Y",
                ariaLabel: "角色缩放 Y",
                step: "0.01",
                value: transform.scale[1],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 1, Number(value)),
                      }),
              },
              {
                axis: "Z",
                ariaLabel: "角色缩放 Z",
                step: "0.01",
                value: transform.scale[2],
                onChange: (value) =>
                  isCrowd && selection.crowdId
                    ? updateCrowdTransform(selection.crowdId, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      })
                    : updateObjectTransform(role.id, {
                        scale: replaceAxis(transform.scale, 2, Number(value)),
                      }),
              },
            ]}
          />
          <InspectorRangeNumberField
            label="统一缩放"
            rangeAriaLabel="角色统一缩放滑杆"
            numberAriaLabel="角色统一缩放"
            max="3"
            min="0.2"
            step="0.01"
            value={transform.scale[0]}
            onValueChange={(value) =>
              isCrowd && selection.crowdId
                ? updateCrowdUniformScale(selection.crowdId, Number(value))
                : updateUniformScale(role.id, Number(value))
            }
          />
          <InspectorColorField
            label="颜色"
            colorAriaLabel="角色颜色"
            hexAriaLabel="角色颜色 HEX"
            value={roleColor}
            onColorChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
            onHexChange={(value) =>
              isCrowd && selection.crowdId ? updateCrowdColor(selection.crowdId, value) : updateObjectColor(role.id, value)
            }
          />
        </>
      ) : (
        <InspectorSection title="姿势预设" className="pose-preset-section">
          {role.characterRig ? (
            <>
              <InspectorSelectField
                label="姿势预设"
                ariaLabel="选择姿势预设"
                value={role.characterRig?.posePresetId ?? ""}
                onChange={(value) =>
                  isCrowd && selection.crowdId
                    ? applyCrowdPosePreset(selection.crowdId, value as Parameters<typeof applyCrowdPosePreset>[1])
                    : applyPosePreset(role.id, value as Parameters<typeof applyPosePreset>[1])
                }
                options={[
                  { value: "", label: "选择姿势…", disabled: true },
                  ...MANNEQUIN_POSE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })),
                ]}
              />
              <InspectorSection title="动作预设" className="action-preset-section">
                <InspectorSelectField
                  label="动作预设"
                  ariaLabel="选择动作预设"
                  value={playingActionId ?? ""}
                  onChange={(value) => setPlayingActionId(value || null)}
                  options={[
                    { value: "", label: "停止 / 不播放" },
                    ...MANNEQUIN_ACTION_PRESETS.map((action) => ({ value: action.id, label: action.label })),
                  ]}
                />
                {playingActionId ? (
                  <p className="action-preset-hint">
                    正在循环播放动作，停止后可继续手动调节关节。
                  </p>
                ) : null}
              </InspectorSection>
              <InspectorSection title="姿势调节" className="pose-adjust-section">
                {(() => {
                  const getPrefix = (group: (typeof poseGroups)[number]) =>
                    group.controls[0].key.split(".")[0];
                  const activeGroup =
                    poseGroups.find((group) => getPrefix(group) === selectedJointPrefix) ?? poseGroups[0];

                  return (
                    <div className="pose-joint-picker">
                      <InspectorSelectField
                        label="选择关节"
                        ariaLabel="选择要调节的关节"
                        value={getPrefix(activeGroup)}
                        onChange={(value) => setSelectedJointPrefix(value)}
                        options={poseGroups.map((group) => ({
                          value: getPrefix(group),
                          label: group.title,
                        }))}
                      />
                      <div className="pose-joint-sliders">
                        {activeGroup.controls.map((control) => (
                          <InspectorRangeNumberField
                            key={control.key}
                            label={`${activeGroup.title} · ${control.label}`}
                            rangeAriaLabel={`${activeGroup.title} ${control.label} 滑杆`}
                            numberAriaLabel={`${activeGroup.title} ${control.label}`}
                            max="90"
                            min="-90"
                            step="1"
                            value={role.characterRig?.controls[control.key] ?? 0}
                            onValueChange={(value) =>
                              isCrowd && selection.crowdId
                                ? updateCrowdPoseControl(selection.crowdId, control.key, Number(value))
                                : updatePoseControl(role.id, control.key, Number(value))
                            }
                          />
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </InspectorSection>
            </>
          ) : (
            <p>该模型未识别到标准 humanoid 骨骼，暂不支持姿势编辑。</p>
          )}
        </InspectorSection>
      )}
    </InspectorPanel>
  );
}
