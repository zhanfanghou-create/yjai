import { useDirectorStore } from "../store/directorStore";
import { useAnimationStore } from "../store/animationStore";

interface HostReferencePayload {
  url?: unknown;
  kind?: unknown;
  durationSeconds?: unknown;
}

interface HostPanoramaPayload {
  edgeId?: unknown;
  sourceNodeId?: unknown;
  imageUrl?: unknown;
  fileName?: unknown;
}

interface HostSessionPayload {
  instanceId?: unknown;
  theme?: unknown;
}

export interface HostCaptureItemPayload {
  dataUrl?: unknown;
  fileName?: unknown;
}

export interface HostCaptureBatchPayload {
  captures?: HostCaptureItemPayload[];
}

interface HostConnectedPanorama {
  edgeId: string;
  sourceNodeId: string;
}

let initialized = false;
let hostConnectedPanorama: HostConnectedPanorama | null = null;
let removeUnsubscribe: (() => void) | null = null;
let suppressNextPanoramaRemovalNotice = false;

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getHostOrigin() {
  return window.location.origin;
}

function normalizeTheme(value: unknown): "dark" | "light" | null {
  return value === "light" || value === "dark" ? value : null;
}

function applyDirectorDeskTheme(_theme: "dark" | "light") {
  // 主题已由宿主通过 <Director3dApp theme themeClassName /> 作用在 .director3d-root 容器上，
  // 这里不再修改全局 documentElement，避免污染宿主应用（yijing-ai）的主题系统。
}

function getInitialHostTheme() {
  try {
    return normalizeTheme(new URLSearchParams(window.location.search).get("theme"));
  } catch {
    return null;
  }
}

function notifyPanoramaRemoved() {
  if (!hostConnectedPanorama) {
    return;
  }

  window.parent?.postMessage(
    {
      type: "storyai:director-desk-panorama-removed",
      payload: hostConnectedPanorama,
    },
    getHostOrigin()
  );
  hostConnectedPanorama = null;
}

function subscribeToPanoramaRemoval() {
  if (removeUnsubscribe) {
    return;
  }

  let previousPanoramaAssetId = useDirectorStore.getState().project.panoramaAssetId;
  removeUnsubscribe = useDirectorStore.subscribe((state) => {
    const nextPanoramaAssetId = state.project.panoramaAssetId;

    if (previousPanoramaAssetId && !nextPanoramaAssetId) {
      if (suppressNextPanoramaRemovalNotice) {
        suppressNextPanoramaRemovalNotice = false;
        hostConnectedPanorama = null;
      } else {
        notifyPanoramaRemoved();
      }
    }

    previousPanoramaAssetId = nextPanoramaAssetId;
  });
}

function importHostPanorama(payload: HostPanoramaPayload) {
  const imageUrl = normalizeString(payload.imageUrl);
  if (!imageUrl) {
    return;
  }

  const fileName = normalizeString(payload.fileName) || "画布全景图.png";
  const edgeId = normalizeString(payload.edgeId);
  const sourceNodeId = normalizeString(payload.sourceNodeId);

  hostConnectedPanorama = edgeId && sourceNodeId ? { edgeId, sourceNodeId } : null;
  useDirectorStore.getState().addImportedAsset({
    kind: "panorama",
    name: fileName,
    fileName,
    url: imageUrl,
    projectionMode: "backdrop",
  });
}

interface HostPrevizPayload {
  plan?: unknown;
  durationSeconds?: unknown;
}

function importHostReference(payload: HostReferencePayload) {
  // 参考视频：把录制默认时长设为参考视频时长（钳制 1~600 秒）；不再显示视口底图
  const kind = payload.kind === "video" ? "video" : "image";
  if (kind === "video") {
    const duration = Number(payload.durationSeconds);
    if (Number.isFinite(duration) && duration > 0) {
      useAnimationStore.getState().setDuration(Math.min(600, Math.max(1, Math.round(duration))));
    }
  }
}

/** 应用由宿主（DirectorStageModal）根据参考图/文本推断出的 3D 预演布局：角色站位/姿势/朝向 + 机位/焦距。 */
function importHostPreviz(payload: HostPrevizPayload) {
  const plan = payload?.plan;
  if (!plan || typeof plan !== "object") return;
  const characters = Array.isArray((plan as any).characters) ? (plan as any).characters : [];
  const camera = (plan as any).camera;
  if (characters.length === 0 && !camera) return;
  useDirectorStore.getState().applyPrevizPlan({ characters, camera });
  const duration = Number(payload?.durationSeconds);
  if (Number.isFinite(duration) && duration > 0) {
    useAnimationStore.getState().setDuration(Math.min(600, Math.max(1, Math.round(duration))));
  }
}

function openHostSession(payload: HostSessionPayload) {
  const instanceId = normalizeString(payload.instanceId);
  const theme = normalizeTheme(payload.theme);
  if (theme) {
    applyDirectorDeskTheme(theme);
  }
  suppressNextPanoramaRemovalNotice = Boolean(useDirectorStore.getState().project.panoramaAssetId);
  useDirectorStore.getState().openScopedScene(instanceId || null);
  suppressNextPanoramaRemovalNotice = false;
  hostConnectedPanorama = null;
  // 新会话开始时清除上一次的视口参考底图
  useDirectorStore.getState().setViewportReference(null);
}

export function postDirectorDeskCapturesToHost(
  captures: Array<{
    dataUrl: string;
    fileName?: string;
  }>
) {
  const normalizedCaptures = captures
    .map((capture, index) => {
      const dataUrl = normalizeString(capture.dataUrl);
      if (!dataUrl) {
        return null;
      }

      return {
        dataUrl,
        fileName: normalizeString(capture.fileName) || `director-desk-capture-${index + 1}.png`,
      };
    })
    .filter((capture): capture is { dataUrl: string; fileName: string } => Boolean(capture));

  if (normalizedCaptures.length === 0) {
    return;
  }

  window.parent?.postMessage(
    {
      type: "storyai:director-desk-captures-sent",
      payload: {
        captures: normalizedCaptures,
      },
    },
    getHostOrigin()
  );
}

export function postDirectorDeskVideoToHost(payload: {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  fileName?: string;
}) {
  const dataUrl = normalizeString(payload.dataUrl);
  if (!dataUrl) {
    return;
  }

  window.parent?.postMessage(
    {
      type: "storyai:director-desk-submit-video",
      payload: {
        dataUrl,
        mimeType: normalizeString(payload.mimeType) || "video/webm",
        width: payload.width,
        height: payload.height,
        fps: payload.fps,
        durationSeconds: payload.durationSeconds,
        fileName: normalizeString(payload.fileName) || "director-desk-preview.webm",
      },
    },
    getHostOrigin()
  );
}

function handleHostMessage(event: MessageEvent) {
  if (event.origin !== getHostOrigin()) {
    return;
  }

  if (event.data?.type === "storyai:director-desk-session") {
    openHostSession((event.data.payload || {}) as HostSessionPayload);
    return;
  }

  if (event.data?.type === "storyai:director-desk-panorama") {
    importHostPanorama((event.data.payload || {}) as HostPanoramaPayload);
    return;
  }

  if (event.data?.type === "storyai:director-desk-reference") {
    importHostReference((event.data.payload || {}) as HostReferencePayload);
    return;
  }

  if (event.data?.type === "storyai:director-desk-previz") {
    importHostPreviz((event.data.payload || {}) as HostPrevizPayload);
  }
}

export function initDirectorDeskHostBridge() {
  if (initialized) {
    return;
  }

  initialized = true;
  applyDirectorDeskTheme(getInitialHostTheme() ?? "dark");
  window.addEventListener("message", handleHostMessage);
  subscribeToPanoramaRemoval();
}

export function clearDirectorDeskHostBridge() {
  if (!initialized) {
    return;
  }

  initialized = false;
  hostConnectedPanorama = null;
  suppressNextPanoramaRemovalNotice = false;
  window.removeEventListener("message", handleHostMessage);
  removeUnsubscribe?.();
  removeUnsubscribe = null;
}
