import { useEffect, useState } from "react";
import type { CharacterRigState } from "../../schema/directorProject";
import { getBodyPreset, type CharacterBodyType } from "./bodyTypes";
import { degreesToRadians, getBodyTypePoseLimit, getRotationFromControls, getSingleAxisRotation } from "./mannequinPose";
import { Foot, Hand, Head, Joint, Segment, Torso } from "./mannequinParts";
import { JointHandle } from "./JointHandle";

interface ProceduralMannequinProps {
  bodyType?: CharacterBodyType;
  color?: string;
  rigState?: CharacterRigState;
}

const JOINT_SELECTED_MESSAGE = "storyai:director-desk-joint-selected";

function broadcastJointSelected(jointKey: string) {
  window.postMessage({ type: JOINT_SELECTED_MESSAGE, payload: { jointKey } }, "*");
}

function useSelectedJointKey() {
  const [selectedJointKey, setSelectedJointKey] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === JOINT_SELECTED_MESSAGE && typeof data.payload?.jointKey === "string") {
        setSelectedJointKey(data.payload.jointKey);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return selectedJointKey;
}

function isJointActive(selectedJointKey: string | null, prefix: string) {
  if (!selectedJointKey) return false;
  return selectedJointKey.split(".")[0] === prefix;
}

function clampDegrees(value: number, bodyType?: CharacterBodyType) {
  const limit = getBodyTypePoseLimit(bodyType);
  return Math.min(limit, Math.max(-limit, value));
}

function getLimbRotation(
  controls: Record<string, number>,
  prefix: string,
  bodyType?: CharacterBodyType
): [number, number, number] {
  return [
    degreesToRadians(clampDegrees(controls[`${prefix}.pitch`] ?? 0, bodyType)),
    degreesToRadians(clampDegrees(controls[`${prefix}.twist`] ?? 0, bodyType)),
    degreesToRadians(clampDegrees(controls[`${prefix}.spread`] ?? 0, bodyType)),
  ];
}

export function ProceduralMannequin({ bodyType, color = "#4F8EF7", rigState }: ProceduralMannequinProps) {
  const preset = getBodyPreset(bodyType);
  const controls = rigState?.controls ?? {};
  const p = preset.proportions;
  const selectedJointKey = useSelectedJointKey();

  const bodyRotation = getRotationFromControls(controls, "body", preset.bodyType);
  const torsoRotation = getRotationFromControls(controls, "torso", preset.bodyType);
  const headRotation = getRotationFromControls(controls, "head", preset.bodyType);
  const leftShoulderRotation = getLimbRotation(controls, "leftShoulder", preset.bodyType);
  const rightShoulderRotation = getLimbRotation(controls, "rightShoulder", preset.bodyType);
  const leftElbowRotation = getSingleAxisRotation(controls, "leftElbow.bend", preset.bodyType);
  const rightElbowRotation = getSingleAxisRotation(controls, "rightElbow.bend", preset.bodyType);
  const leftHipRotation = getLimbRotation(controls, "leftHip", preset.bodyType);
  const rightHipRotation = getLimbRotation(controls, "rightHip", preset.bodyType);
  const leftKneeRotation = getSingleAxisRotation(controls, "leftKnee.bend", preset.bodyType);
  const rightKneeRotation = getSingleAxisRotation(controls, "rightKnee.bend", preset.bodyType);

  const abdomenY = p.hipY + p.pelvisRadius * 0.6 + p.torsoLowerHeight * 0.5;
  const chestY = abdomenY + p.torsoLowerHeight * 0.5 + p.torsoUpperHeight * 0.5 + p.torsoUpperRadius * 0.1;
  const neckY = chestY + p.torsoUpperHeight * 0.5 + p.neckHeight * 0.5 + p.torsoUpperRadius * 0.2;
  const headY = neckY + p.neckHeight * 0.5 + p.headRadius * 0.75;

  const shoulderY = chestY + p.torsoUpperHeight * 0.16 + p.shoulderRadius * 0.4;
  const armOriginY = shoulderY - p.shoulderRadius * 0.55;
  const elbowY = -(p.upperArmLength + p.upperArmRadius + p.elbowRadius);
  const wristY = -(p.forearmLength + p.forearmRadius + p.wristRadius);
  const handY = wristY - p.handRadius - 0.05;

  const hipJointY = p.hipY - p.pelvisRadius * 0.15;
  const legOriginY = p.hipY - p.pelvisRadius * 0.35;
  const kneeY = -(p.thighLength + p.thighRadius + p.kneeRadius);
  const ankleY = -(p.calfLength + p.calfRadius + p.ankleRadius);
  const footY = ankleY - p.footRadius - 0.045;
  const jointScale: [number, number, number] = [p.jointRadiusScale, p.jointRadiusScale, p.jointRadiusScale];

  return (
    <group name={`procedural-${preset.bodyType}`} rotation={bodyRotation} scale={preset.defaultScale}>
      <group rotation={torsoRotation}>
        <Torso
          abdomenPosition={[0, abdomenY, 0]}
          abdomenScale={p.torsoLowerScale}
          chestPosition={[0, chestY, 0]}
          chestScale={p.torsoUpperScale}
          color={color}
          pelvisPosition={[0, p.hipY, 0]}
          pelvisRadius={p.pelvisRadius}
          pelvisScale={p.pelvisScale}
          torsoLowerHeight={p.torsoLowerHeight}
          torsoLowerRadius={p.torsoLowerRadius}
          torsoUpperHeight={p.torsoUpperHeight}
          torsoUpperRadius={p.torsoUpperRadius}
        />
        <Head
          color={color}
          eyeRadius={p.eyeRadius}
          faceOffsetZ={p.faceOffsetZ}
          headRadius={p.headRadius}
          headScale={p.headScale}
          mouthScale={p.mouthScale}
          neckHeight={p.neckHeight}
          neckPosition={[0, neckY, 0]}
          neckRadius={p.neckRadius}
          noseScale={p.noseScale}
          position={[0, headY, 0]}
          rotation={headRotation}
        />

        <JointHandle jointKey="head.pitch" position={[0, headY, 0]} radius={p.headRadius * 0.9} active={isJointActive(selectedJointKey, "head")} onSelect={broadcastJointSelected} />
        <JointHandle jointKey="torso.pitch" position={[0, chestY, 0]} radius={p.torsoUpperRadius * 0.8} active={isJointActive(selectedJointKey, "torso")} onSelect={broadcastJointSelected} />

        <Joint color={color} position={[-p.shoulderWidth * 0.86, shoulderY, 0]} radius={p.shoulderRadius} scale={jointScale} />
        <Joint color={color} position={[p.shoulderWidth * 0.86, shoulderY, 0]} radius={p.shoulderRadius} scale={jointScale} />

        <JointHandle jointKey="leftShoulder.pitch" position={[-p.shoulderWidth, armOriginY, 0]} radius={p.shoulderRadius} active={isJointActive(selectedJointKey, "leftShoulder")} onSelect={broadcastJointSelected} />
        <JointHandle jointKey="rightShoulder.pitch" position={[p.shoulderWidth, armOriginY, 0]} radius={p.shoulderRadius} active={isJointActive(selectedJointKey, "rightShoulder")} onSelect={broadcastJointSelected} />

        <group position={[-p.shoulderWidth, armOriginY, 0]} rotation={leftShoulderRotation}>
          <Segment color={color} length={p.upperArmLength} position={[0, -(p.upperArmLength * 0.5 + p.upperArmRadius), 0]} radius={p.upperArmRadius} />
          <group position={[0, elbowY, 0]} rotation={leftElbowRotation}>
            <Joint color={color} position={[0, 0, 0]} radius={p.elbowRadius} scale={jointScale} />
            <JointHandle jointKey="leftElbow.bend" position={[0, 0, 0]} radius={p.elbowRadius} active={isJointActive(selectedJointKey, "leftElbow")} onSelect={broadcastJointSelected} />
            <Segment color={color} length={p.forearmLength} position={[0, -(p.forearmLength * 0.5 + p.forearmRadius), 0]} radius={p.forearmRadius} />
            <Joint color={color} position={[0, wristY, 0]} radius={p.wristRadius} scale={jointScale} />
            <Hand color={color} position={[0, handY, 0.02]} radius={p.handRadius} scale={p.handScale} side="left" />
          </group>
        </group>

        <group position={[p.shoulderWidth, armOriginY, 0]} rotation={rightShoulderRotation}>
          <Segment color={color} length={p.upperArmLength} position={[0, -(p.upperArmLength * 0.5 + p.upperArmRadius), 0]} radius={p.upperArmRadius} />
          <group position={[0, elbowY, 0]} rotation={rightElbowRotation}>
            <Joint color={color} position={[0, 0, 0]} radius={p.elbowRadius} scale={jointScale} />
            <JointHandle jointKey="rightElbow.bend" position={[0, 0, 0]} radius={p.elbowRadius} active={isJointActive(selectedJointKey, "rightElbow")} onSelect={broadcastJointSelected} />
            <Segment color={color} length={p.forearmLength} position={[0, -(p.forearmLength * 0.5 + p.forearmRadius), 0]} radius={p.forearmRadius} />
            <Joint color={color} position={[0, wristY, 0]} radius={p.wristRadius} scale={jointScale} />
            <Hand color={color} position={[0, handY, 0.02]} radius={p.handRadius} scale={p.handScale} side="right" />
          </group>
        </group>
      </group>

      <Joint color={color} position={[-p.legSpread, hipJointY, 0]} radius={p.kneeRadius} scale={jointScale} />
      <Joint color={color} position={[p.legSpread, hipJointY, 0]} radius={p.kneeRadius} scale={jointScale} />

      <JointHandle jointKey="leftHip.pitch" position={[-p.legSpread, legOriginY, 0]} radius={p.kneeRadius * 1.2} active={isJointActive(selectedJointKey, "leftHip")} onSelect={broadcastJointSelected} />
      <JointHandle jointKey="rightHip.pitch" position={[p.legSpread, legOriginY, 0]} radius={p.kneeRadius * 1.2} active={isJointActive(selectedJointKey, "rightHip")} onSelect={broadcastJointSelected} />

      <group position={[-p.legSpread, legOriginY, 0]} rotation={leftHipRotation}>
        <Segment color={color} length={p.thighLength} position={[0, -(p.thighLength * 0.5 + p.thighRadius), 0]} radius={p.thighRadius} />
        <group position={[0, kneeY, 0]} rotation={leftKneeRotation}>
          <Joint color={color} position={[0, 0, 0]} radius={p.kneeRadius} scale={jointScale} />
          <JointHandle jointKey="leftKnee.bend" position={[0, 0, 0]} radius={p.kneeRadius} active={isJointActive(selectedJointKey, "leftKnee")} onSelect={broadcastJointSelected} />
          <Segment color={color} length={p.calfLength} position={[0, -(p.calfLength * 0.5 + p.calfRadius), 0]} radius={p.calfRadius} />
          <Joint color={color} position={[0, ankleY, 0]} radius={p.ankleRadius} scale={jointScale} />
          <Foot color={color} length={p.footLength} position={[0, footY, 0.02]} radius={p.footRadius} scale={p.footScale} side="left" />
        </group>
      </group>

      <group position={[p.legSpread, legOriginY, 0]} rotation={rightHipRotation}>
        <Segment color={color} length={p.thighLength} position={[0, -(p.thighLength * 0.5 + p.thighRadius), 0]} radius={p.thighRadius} />
        <group position={[0, kneeY, 0]} rotation={rightKneeRotation}>
          <Joint color={color} position={[0, 0, 0]} radius={p.kneeRadius} scale={jointScale} />
          <JointHandle jointKey="rightKnee.bend" position={[0, 0, 0]} radius={p.kneeRadius} active={isJointActive(selectedJointKey, "rightKnee")} onSelect={broadcastJointSelected} />
          <Segment color={color} length={p.calfLength} position={[0, -(p.calfLength * 0.5 + p.calfRadius), 0]} radius={p.calfRadius} />
          <Joint color={color} position={[0, ankleY, 0]} radius={p.ankleRadius} scale={jointScale} />
          <Foot color={color} length={p.footLength} position={[0, footY, 0.02]} radius={p.footRadius} scale={p.footScale} side="right" />
        </group>
      </group>
    </group>
  );
}
