/**
 * 动作预设：带关键帧循环的常规动态运动姿势。
 * 每个动作由若干关键帧组成，运行时在关键帧之间线性插值并循环播放，
 * 从而形成行走、跑步、蹲起等连续动态。
 */

export interface ActionKeyframe {
  /** 归一化时间 0~1（循环内位置） */
  t: number;
  /** 该帧的关节参数（度） */
  controls: Record<string, number>;
}

export interface ActionPresetDefinition {
  id: string;
  label: string;
  /** 单个循环时长（秒） */
  duration: number;
  keyframes: ActionKeyframe[];
}

export const MANNEQUIN_ACTION_PRESETS: ActionPresetDefinition[] = [
  {
    id: "walk-cycle",
    label: "正常行走",
    duration: 1.1,
    keyframes: [
      {
        t: 0,
        controls: {
          "leftShoulder.pitch": 24,
          "rightShoulder.pitch": -24,
          "leftElbow.bend": 18,
          "rightElbow.bend": 24,
          "leftHip.pitch": -22,
          "rightHip.pitch": 22,
          "leftKnee.bend": 8,
          "rightKnee.bend": 28,
        },
      },
      {
        t: 0.25,
        controls: {
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 16,
          "rightElbow.bend": 16,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 18,
          "rightKnee.bend": 10,
        },
      },
      {
        t: 0.5,
        controls: {
          "leftShoulder.pitch": -24,
          "rightShoulder.pitch": 24,
          "leftElbow.bend": 24,
          "rightElbow.bend": 18,
          "leftHip.pitch": 22,
          "rightHip.pitch": -22,
          "leftKnee.bend": 28,
          "rightKnee.bend": 8,
        },
      },
      {
        t: 0.75,
        controls: {
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 16,
          "rightElbow.bend": 16,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 10,
          "rightKnee.bend": 18,
        },
      },
      {
        t: 1,
        controls: {
          "leftShoulder.pitch": 24,
          "rightShoulder.pitch": -24,
          "leftElbow.bend": 18,
          "rightElbow.bend": 24,
          "leftHip.pitch": -22,
          "rightHip.pitch": 22,
          "leftKnee.bend": 8,
          "rightKnee.bend": 28,
        },
      },
    ],
  },
  {
    id: "run-cycle",
    label: "跑步",
    duration: 0.72,
    keyframes: [
      {
        t: 0,
        controls: {
          "body.pitch": 12,
          "leftShoulder.pitch": 46,
          "rightShoulder.pitch": -46,
          "leftElbow.bend": 78,
          "rightElbow.bend": 86,
          "leftHip.pitch": -38,
          "rightHip.pitch": 44,
          "leftKnee.bend": 26,
          "rightKnee.bend": 70,
        },
      },
      {
        t: 0.25,
        controls: {
          "body.pitch": 12,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 82,
          "rightElbow.bend": 82,
          "leftHip.pitch": 6,
          "rightHip.pitch": 6,
          "leftKnee.bend": 46,
          "rightKnee.bend": 30,
        },
      },
      {
        t: 0.5,
        controls: {
          "body.pitch": 12,
          "leftShoulder.pitch": -46,
          "rightShoulder.pitch": 46,
          "leftElbow.bend": 86,
          "rightElbow.bend": 78,
          "leftHip.pitch": 44,
          "rightHip.pitch": -38,
          "leftKnee.bend": 70,
          "rightKnee.bend": 26,
        },
      },
      {
        t: 0.75,
        controls: {
          "body.pitch": 12,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 82,
          "rightElbow.bend": 82,
          "leftHip.pitch": 6,
          "rightHip.pitch": 6,
          "leftKnee.bend": 30,
          "rightKnee.bend": 46,
        },
      },
      {
        t: 1,
        controls: {
          "body.pitch": 12,
          "leftShoulder.pitch": 46,
          "rightShoulder.pitch": -46,
          "leftElbow.bend": 78,
          "rightElbow.bend": 86,
          "leftHip.pitch": -38,
          "rightHip.pitch": 44,
          "leftKnee.bend": 26,
          "rightKnee.bend": 70,
        },
      },
    ],
  },
  {
    id: "crouch-cycle",
    label: "蹲下起立",
    duration: 2.2,
    keyframes: [
      {
        t: 0,
        controls: {
          "body.offsetY": 0,
          "body.pitch": 0,
          "torso.pitch": 0,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 10,
          "rightElbow.bend": 10,
        },
      },
      {
        t: 0.5,
        controls: {
          "body.offsetY": -0.43,
          "body.pitch": -26,
          "torso.pitch": -24,
          "leftHip.pitch": 92,
          "rightHip.pitch": 92,
          "leftKnee.bend": 112,
          "rightKnee.bend": 112,
          "leftShoulder.pitch": 52,
          "rightShoulder.pitch": 50,
          "leftElbow.bend": 80,
          "rightElbow.bend": 76,
        },
      },
      {
        t: 1,
        controls: {
          "body.offsetY": 0,
          "body.pitch": 0,
          "torso.pitch": 0,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
          "leftElbow.bend": 10,
          "rightElbow.bend": 10,
        },
      },
    ],
  },
  {
    id: "side-step-left",
    label: "左跨步",
    duration: 1.4,
    keyframes: [
      {
        t: 0,
        controls: {
          "body.roll": 0,
          "leftHip.spread": 0,
          "rightHip.spread": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.spread": 0,
          "rightShoulder.spread": 0,
        },
      },
      {
        t: 0.5,
        controls: {
          "body.roll": -8,
          "leftHip.spread": -34,
          "rightHip.spread": 12,
          "leftKnee.bend": 22,
          "rightKnee.bend": 10,
          "leftShoulder.spread": -22,
          "rightShoulder.spread": 16,
        },
      },
      {
        t: 1,
        controls: {
          "body.roll": 0,
          "leftHip.spread": 0,
          "rightHip.spread": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.spread": 0,
          "rightShoulder.spread": 0,
        },
      },
    ],
  },
  {
    id: "jump-cycle",
    label: "原地跳跃",
    duration: 1.0,
    keyframes: [
      {
        t: 0,
        controls: {
          "body.offsetY": 0,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
        },
      },
      {
        t: 0.3,
        controls: {
          "body.offsetY": -0.28,
          "leftHip.pitch": 46,
          "rightHip.pitch": 46,
          "leftKnee.bend": 70,
          "rightKnee.bend": 70,
          "leftShoulder.pitch": -20,
          "rightShoulder.pitch": -20,
        },
      },
      {
        t: 0.55,
        controls: {
          "body.offsetY": 0.32,
          "leftHip.pitch": -10,
          "rightHip.pitch": -10,
          "leftKnee.bend": 6,
          "rightKnee.bend": 6,
          "leftShoulder.pitch": 60,
          "rightShoulder.pitch": 60,
        },
      },
      {
        t: 0.8,
        controls: {
          "body.offsetY": -0.2,
          "leftHip.pitch": 40,
          "rightHip.pitch": 40,
          "leftKnee.bend": 62,
          "rightKnee.bend": 62,
          "leftShoulder.pitch": -10,
          "rightShoulder.pitch": -10,
        },
      },
      {
        t: 1,
        controls: {
          "body.offsetY": 0,
          "leftHip.pitch": 0,
          "rightHip.pitch": 0,
          "leftKnee.bend": 0,
          "rightKnee.bend": 0,
          "leftShoulder.pitch": 0,
          "rightShoulder.pitch": 0,
        },
      },
    ],
  },
  {
    id: "wave-cycle",
    label: "挥手打招呼",
    duration: 1.2,
    keyframes: [
      {
        t: 0,
        controls: {
          "rightShoulder.pitch": 60,
          "rightShoulder.spread": 0,
          "rightShoulder.twist": 30,
          "rightElbow.bend": 90,
          "rightHand.roll": -30,
          "leftShoulder.pitch": -10,
          "leftElbow.bend": 18,
        },
      },
      {
        t: 0.5,
        controls: {
          "rightShoulder.pitch": 60,
          "rightShoulder.spread": 0,
          "rightShoulder.twist": 30,
          "rightElbow.bend": 60,
          "rightHand.roll": 10,
          "leftShoulder.pitch": -10,
          "leftElbow.bend": 18,
        },
      },
      {
        t: 1,
        controls: {
          "rightShoulder.pitch": 60,
          "rightShoulder.spread": 0,
          "rightShoulder.twist": 30,
          "rightElbow.bend": 90,
          "rightHand.roll": -30,
          "leftShoulder.pitch": -10,
          "leftElbow.bend": 18,
        },
      },
    ],
  },
];
