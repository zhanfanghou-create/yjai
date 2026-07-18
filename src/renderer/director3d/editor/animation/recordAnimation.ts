import { postDirectorDeskVideoToHost } from "../io/hostBridge";

const TARGET_HEIGHT = 480;

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "video/webm";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export interface RecordOptions {
  fps: number;
  durationSeconds: number;
  onStart?: () => void;
  onStop?: () => void;
  /** 每帧回调：录制时驱动动画到指定时间（秒）。 */
  onTick?: (time: number) => void;
  /** 中止信号：触发后立即停止录制并提交已录制内容。 */
  signal?: AbortSignal;
}

/**
 * 录制 3D 视口 canvas 为 480P 低码率 webm，并通过宿主桥提交为画布视频节点。
 * 使用离屏 canvas 缩放到 480P 以降低文件体积。
 */
export async function recordViewportAnimation(options: RecordOptions): Promise<void> {
  const sourceCanvas = document.querySelector<HTMLCanvasElement>(".director-canvas canvas");
  if (!sourceCanvas) {
    throw new Error("找不到 3D 视口 canvas，无法录制");
  }

  const fps = Math.min(30, Math.max(6, Math.round(options.fps)));
  const srcWidth = sourceCanvas.width || sourceCanvas.clientWidth || 640;
  const srcHeight = sourceCanvas.height || sourceCanvas.clientHeight || 480;
  const scale = TARGET_HEIGHT / srcHeight;
  const outWidth = Math.max(2, Math.round((srcWidth * scale) / 2) * 2);
  const outHeight = TARGET_HEIGHT;

  const scaledCanvas = document.createElement("canvas");
  scaledCanvas.width = outWidth;
  scaledCanvas.height = outHeight;
  const ctx = scaledCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建离屏绘制上下文");
  }

  const stream = scaledCanvas.captureStream(fps);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 600_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  options.onStart?.();

  let rafId = 0;
  const startTime = performance.now();
  const drawLoop = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    const t = Math.min(elapsed, options.durationSeconds);
    options.onTick?.(t);
    ctx.drawImage(sourceCanvas, 0, 0, srcWidth, srcHeight, 0, 0, outWidth, outHeight);
    if (elapsed < options.durationSeconds) {
      rafId = requestAnimationFrame(drawLoop);
    }
  };

  recorder.start(200);
  rafId = requestAnimationFrame(drawLoop);

  await new Promise<void>((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, options.durationSeconds * 1000);

    const onAbort = () => {
      cleanup();
      resolve();
    };

    function cleanup() {
      window.clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }
  });

  cancelAnimationFrame(rafId);
  if (recorder.state !== "inactive") {
    recorder.stop();
  }
  await finished;
  options.onStop?.();

  const blob = new Blob(chunks, { type: mimeType });
  const dataUrl = await blobToDataUrl(blob);

  postDirectorDeskVideoToHost({
    dataUrl,
    mimeType,
    width: outWidth,
    height: outHeight,
    fps,
    durationSeconds: options.durationSeconds,
    fileName: `director-desk-preview-${Date.now()}.webm`,
  });
}