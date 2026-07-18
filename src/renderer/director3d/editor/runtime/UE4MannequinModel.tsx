import { useLoader } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Box3,
  Color,
  Group,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { CharacterRigState } from "../schema/directorProject";
import { VIEWPORT_OBJECT_LABEL_VERTICAL_GAP } from "../schema/viewportLabels";
import type { CharacterBodyType } from "./mannequin/bodyTypes";
import {
  UE4_MANNEQUIN_BONE_MAP,
  UE4_MANNEQUIN_MODEL_URL,
  getUE4ModelScale,
} from "./ue4Mannequin/ue4MannequinRig";
import { applyUE4RestPoseAndRig, captureUE4RestPose } from "./ue4Mannequin/ue4MannequinPoseApplication";
import { JointHandle } from "./mannequin/JointHandle";

interface UE4MannequinModelProps {
  bodyType?: CharacterBodyType;
  color?: string;
  onLabelAnchorYChange?: (anchorY: number) => void;
  rigState?: CharacterRigState;
}

interface LoadedGLTF {
  scene: Group;
  animations: unknown[];
}

/** 关节高亮圆点对应的调节前缀（与右侧面板 poseGroups 对齐） */
const UE4_JOINT_HANDLE_KEYS: Array<{ prefix: keyof typeof UE4_MANNEQUIN_BONE_MAP; jointKey: string; radius: number }> = [
  { prefix: "head", jointKey: "head.pitch", radius: 0.12 },
  { prefix: "torso", jointKey: "torso.pitch", radius: 0.13 },
  { prefix: "leftShoulder", jointKey: "leftShoulder.pitch", radius: 0.08 },
  { prefix: "rightShoulder", jointKey: "rightShoulder.pitch", radius: 0.08 },
  { prefix: "leftElbow", jointKey: "leftElbow.bend", radius: 0.07 },
  { prefix: "rightElbow", jointKey: "rightElbow.bend", radius: 0.07 },
  { prefix: "leftHip", jointKey: "leftHip.pitch", radius: 0.09 },
  { prefix: "rightHip", jointKey: "rightHip.pitch", radius: 0.09 },
  { prefix: "leftKnee", jointKey: "leftKnee.bend", radius: 0.08 },
  { prefix: "rightKnee", jointKey: "rightKnee.bend", radius: 0.08 },
];

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

interface JointHandleAnchor {
  jointKey: string;
  prefix: string;
  radius: number;
  position: [number, number, number];
}

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return "isSkinnedMesh" in object && object.isSkinnedMesh === true;
}

function tintMaterial(material: Material | Material[], color: string) {
  const materials = Array.isArray(material) ? material : [material];
  const nextColor = new Color(color);

  materials.forEach((item) => {
    if (item instanceof MeshStandardMaterial && item.name !== "SK_Mannequin_M_UE4Man_ChestLogo") {
      item.color.copy(nextColor);
      item.roughness = 0.68;
      item.metalness = 0.04;
      item.needsUpdate = true;
    }
  });
}

function cloneMaterialInstance(material: Material | Material[]) {
  return Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
}

export function isolateAndTintUE4MannequinMaterials(scene: Object3D, color: string) {
  scene.traverse((object) => {
    object.frustumCulled = false;

    if (isSkinnedMesh(object)) {
      object.castShadow = true;
      object.receiveShadow = true;

      if (!object.userData.storyAiIsolatedMaterial) {
        object.material = cloneMaterialInstance(object.material);
        object.userData.storyAiIsolatedMaterial = true;
      }

      tintMaterial(object.material, color);
    }
  });
}

function getBoundsInParentLocal(object: Object3D) {
  (object.parent ?? object).updateMatrixWorld(true);

  const worldBounds = new Box3().setFromObject(object, true);
  if (!object.parent || worldBounds.isEmpty()) return worldBounds;

  const parentInverse = new Matrix4().copy(object.parent.matrixWorld).invert();
  const bounds = new Box3().makeEmpty();
  const vertex = new Vector3();
  const xValues = [worldBounds.min.x, worldBounds.max.x];
  const yValues = [worldBounds.min.y, worldBounds.max.y];
  const zValues = [worldBounds.min.z, worldBounds.max.z];

  xValues.forEach((x) => {
    yValues.forEach((y) => {
      zValues.forEach((z) => {
        vertex.set(x, y, z).applyMatrix4(parentInverse);
        bounds.expandByPoint(vertex);
      });
    });
  });

  return bounds;
}

export function alignUE4MannequinToGround(scene: Object3D) {
  const rootX = scene.position.x;
  const rootZ = scene.position.z;

  function measureBoundsInParentLocal() {
    return getBoundsInParentLocal(scene);
  }

  scene.position.set(rootX, 0, rootZ);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const bounds = measureBoundsInParentLocal();
    const correctionY = bounds.isEmpty() || !Number.isFinite(bounds.min.y) ? 0 : -bounds.min.y;

    if (Math.abs(correctionY) < 0.00001) break;

    scene.position.set(rootX, scene.position.y + correctionY, rootZ);
  }

  scene.position.set(rootX, scene.position.y, rootZ);
  (scene.parent ?? scene).updateMatrixWorld(true);

  return scene.position.y;
}

/**
 * 计算各关节骨骼在模型外层 group 本地坐标系（未含 scale）的位置，
 * 供 JointHandle 高亮圆点放置。骨骼位于 scene（primitive）内部，
 * 而外层 group 只包含 scale，因此把骨骼世界坐标转换到 group 本地。
 */
function computeJointAnchors(scene: Object3D): JointHandleAnchor[] {
  const parent = scene.parent;
  if (!parent) return [];

  parent.updateMatrixWorld(true);

  const parentInverse = new Matrix4().copy(parent.matrixWorld).invert();
  const worldPos = new Vector3();
  const anchors: JointHandleAnchor[] = [];

  UE4_JOINT_HANDLE_KEYS.forEach(({ prefix, jointKey, radius }) => {
    const boneName = UE4_MANNEQUIN_BONE_MAP[prefix];
    const bone = scene.getObjectByName(boneName);
    if (!bone) return;

    bone.getWorldPosition(worldPos);
    const local = worldPos.clone().applyMatrix4(parentInverse);

    if (!Number.isFinite(local.x) || !Number.isFinite(local.y) || !Number.isFinite(local.z)) return;

    anchors.push({
      jointKey,
      prefix,
      radius,
      position: [local.x, local.y, local.z],
    });
  });

  return anchors;
}

export function UE4MannequinModel({
  bodyType = "mannequin",
  color = "#F3F5F7",
  onLabelAnchorYChange,
  rigState,
}: UE4MannequinModelProps) {
  const gltf = useLoader(GLTFLoader, UE4_MANNEQUIN_MODEL_URL) as LoadedGLTF;
  const scene = useMemo(() => cloneSkeleton(gltf.scene) as Group, [gltf.scene]);
  const restPose = useMemo(() => captureUE4RestPose(scene), [scene]);
  const modelScale = getUE4ModelScale(bodyType);
  const selectedJointKey = useSelectedJointKey();
  const [jointAnchors, setJointAnchors] = useState<JointHandleAnchor[]>([]);

  useLayoutEffect(() => {
    isolateAndTintUE4MannequinMaterials(scene, color);

    applyUE4RestPoseAndRig(scene, {
      bodyType,
      controls: rigState?.controls ?? {},
      restPose,
    });
    alignUE4MannequinToGround(scene);

    const modelRoot = scene.parent ?? scene;
    const bounds = getBoundsInParentLocal(modelRoot);
    const labelAnchorY = bounds.max.y + VIEWPORT_OBJECT_LABEL_VERTICAL_GAP;

    if (Number.isFinite(labelAnchorY)) {
      onLabelAnchorYChange?.(Number(labelAnchorY.toFixed(4)));
    }

    // 关节骨骼位置在应用姿势后重新采样，供高亮圆点跟随姿势更新。
    setJointAnchors(computeJointAnchors(scene));
  }, [bodyType, color, onLabelAnchorYChange, restPose, rigState?.controls, scene]);

  return (
    <group name={`ue-retopology-mannequin-${bodyType}`} scale={modelScale}>
      <primitive object={scene} />
      {jointAnchors.map((anchor) => (
        <JointHandle
          key={anchor.jointKey}
          jointKey={anchor.jointKey}
          position={anchor.position}
          radius={anchor.radius}
          active={isJointActive(selectedJointKey, anchor.prefix)}
          onSelect={broadcastJointSelected}
        />
      ))}
    </group>
  );
}
