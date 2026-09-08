import { app, BrowserWindow, ipcMain, shell, dialog, session } from 'electron';
import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { registerShortVideoFactoryIPC } from './shortVideoFactory';

// Clean environment variables that may contain non-ASCII or cause encoding issues on Windows
// This prevents "通过环境变量注入" (garbled as "閫氳繃鐜鍙橀噺娉...") errors
for (const key of Object.keys(process.env)) {
  const value = process.env[key];
  if (value && /[^\x00-\x7F]/.test(value)) {
    delete process.env[key];
  }
}

const execAsync = promisify(exec);

let mainWindow: BrowserWindow | null = null;

// Electron may be started without an attached/valid stdout pipe on Windows.
// Prevent EPIPE errors from crashing the main process.
const isBrokenPipeError = (error: unknown) => (error as NodeJS.ErrnoException | undefined)?.code === 'EPIPE';

// 已知的可安全忽略的异步噪音：msedge-tts 内部 metadata unlink、child_process 抢注 socket 前的 ENOTCONN
const isHarmlessAsyncNoise = (error: unknown): boolean => {
  const e = error as NodeJS.ErrnoException | undefined;
  if (!e) return false;
  const code = e.code;
  const msg = e.message || String(e);
  const stack = e.stack || '';
  if (code === 'ENOTCONN' && (stack.includes('createSocket') || stack.includes('child_process'))) return true;
  if (code === 'ENOENT' && /metadata\.json/i.test(msg)) return true;
  return false;
};
for (const stream of [process.stdout, process.stderr]) {
  stream?.on?.('error', (error: NodeJS.ErrnoException) => {
    if (!isBrokenPipeError(error)) throw error;
  });
}

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (isBrokenPipeError(error)) return;
  if (isHarmlessAsyncNoise(error)) return;
  try {
    const line = `[uncaughtException] ${new Date().toISOString()} ${error?.stack || error?.message || String(error)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch {}
  safeSend('main:error', { where: 'uncaughtException', error: error?.message || String(error) });
});

process.on('unhandledRejection', (reason: any) => {
  if (isHarmlessAsyncNoise(reason)) return;
  try {
    const line = `[unhandledRejection] ${new Date().toISOString()} ${reason?.stack || reason?.message || String(reason)}\n`;
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
  } catch {}
  safeSend('main:error', { where: 'unhandledRejection', error: reason?.message || String(reason) });
});

// Safe send helper - suppresses EPERM when renderer is not ready
function safeSend(channel: string, ...args: any[]) {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch (_e) {
    // Suppress EPERM and other pipe errors when renderer is closing/not ready
  }
}

// Background job tracking
const grsaiJobMap: Map<string, NodeJS.Timeout> = new Map();

// Configurable polling params
let grsaiPollingIntervalMs = 3000;
let grsaiMaxAttempts = 120;

async function checkFfmpegInstalled() {
  try {
    const { stdout } = await execAsync('ffmpeg -version', {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 1024 * 1024,
    });
    const firstLine = stdout.split(/\r?\n/).find(Boolean) || 'FFmpeg 已安装';
    return { ok: true, version: firstLine };
  } catch (error) {
    return {
      ok: false,
      error: '未检测到 FFmpeg。请确认已安装并加入系统 PATH，或点击“确认安装 FFmpeg”。',
      detail: (error as Error).message,
    };
  }
}

async function installFfmpegWithPackageManager() {
  try {
    if (process.platform === 'win32') {
      try {
        await execAsync('where winget', { windowsHide: true, timeout: 10000 });
        const result = await execAsync(
          'winget install --id Gyan.FFmpeg -e --accept-package-agreements --accept-source-agreements',
          { windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 1024 * 1024 * 8 }
        );
        return { ok: true, log: `${result.stdout}\n${result.stderr}`.trim() };
      } catch (wingetError) {
        try {
          await execAsync('where choco', { windowsHide: true, timeout: 10000 });
          const result = await execAsync('choco install ffmpeg -y', {
            windowsHide: true,
            timeout: 10 * 60 * 1000,
            maxBuffer: 1024 * 1024 * 8,
          });
          return { ok: true, log: `${result.stdout}\n${result.stderr}`.trim() };
        } catch (chocoError) {
          return {
            ok: false,
            error: '自动安装失败：未找到可用的 winget 或 Chocolatey。请手动安装 FFmpeg 并重启艺镜 AI。',
            detail: `${(wingetError as Error).message}\n${(chocoError as Error).message}`,
          };
        }
      }
    }

    if (process.platform === 'darwin') {
      const result = await execAsync('brew install ffmpeg', {
        timeout: 10 * 60 * 1000,
        maxBuffer: 1024 * 1024 * 8,
      });
      return { ok: true, log: `${result.stdout}\n${result.stderr}`.trim() };
    }

    return {
      ok: false,
      error: '当前系统暂不支持自动安装 FFmpeg，请使用系统包管理器手动安装后重启艺镜 AI。',
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

// 针对上游 API 的瞬时错误（503 服务繁忙 / 429 限流 / 502 / 504 / 网络抖动）自动重试。
// 采用指数退避，避免一次瞬时繁忙就把错误直接抛给用户。仅对幂等的生成/对话请求使用。
async function fetchWithRetry(
  url: string,
  init: any,
  opts: { retries?: number; baseDelayMs?: number; timeoutMs?: number } = {}
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1500;
  const timeoutMs = opts.timeoutMs ?? 0; // 0 = 不设超时
  const retryableStatus = new Set([429, 500, 502, 503, 504]);
  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let controller: AbortController | null = null;
      let timer: NodeJS.Timeout | null = null;
      let fetchInit: any = init;
      if (timeoutMs > 0) {
        controller = new AbortController();
        timer = setTimeout(() => controller!.abort(), timeoutMs);
        fetchInit = { ...init, signal: controller.signal };
      }
      let response: Response;
      try {
        response = await fetch(url, fetchInit);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (retryableStatus.has(response.status) && attempt < retries) {
        // 读取并丢弃响应体，释放连接
        try { await response.text(); } catch { /* ignore */ }
        const retryAfter = Number(response.headers.get('retry-after')) * 1000;
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter
          : baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        console.warn(`[Main] fetchWithRetry: HTTP ${response.status}，第 ${attempt + 1}/${retries} 次重试，${delay}ms 后重试 -> ${url}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      // 超时中止：直接抛出，不再无意义重试
      if ((error as Error)?.name === 'AbortError') {
        throw new Error(`请求超时（超过 ${Math.round(timeoutMs / 1000)} 秒），上游响应过慢，请检查 API 配置或模型是否可用`);
      }
      if (attempt < retries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 500);
        console.warn(`[Main] fetchWithRetry: 网络错误，第 ${attempt + 1}/${retries} 次重试，${delay}ms 后重试 -> ${url}`, (error as Error).message);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastError || new Error('fetchWithRetry: 请求失败');
}

async function startGrsaiJobPolling(jobId: string, baseUrl: string, apiKey: string) {
  try {
    const volcV = detectVolcengineVideoBase(baseUrl);
    const dsScope = /:\/\/dashscope[a-z0-9-]*\.aliyuncs\.com(?:\/|$)/i.test(baseUrl) || /:\/\/[a-z0-9-]+\.maas\.aliyuncs\.com(?:\/|$)/i.test(baseUrl);
    const dsOrigin = dsScope ? (() => { try { return new URL(baseUrl).origin; } catch { return baseUrl; } })() : '';
    // Agnes Video 2.5 Flash 官方查询端点：/agnesapi?video_id=<id>&model_name=<model>
    // 其他 OpenAI 兼容视频用 /v1/videos/<id>
    const isAgnesHost = /:\/\/(?:api|apihub)\.agnes-ai\.(?:com|cn)(?:\/|$)/i.test(baseUrl);
    const agnesModelName = (() => {
      // 从 grsaiJobMap 或全局无法直接拿到 model，用约定的默认值；创建任务时已存入 job 元数据
      return 'agnes-video-2.5-flash';
    })();
    const url = (id: string) => dsScope
      ? `${dsOrigin}/api/v1/tasks/${encodeURIComponent(id)}`
      : (volcV.isVolc
        ? `${volcV.taskUrl}/${encodeURIComponent(id)}`
        : isAgnesHost
          ? `${baseUrl.replace(/\/v1\/?$/, '')}/agnesapi?video_id=${encodeURIComponent(id)}&model_name=${encodeURIComponent(agnesModelName)}`
          : `${buildVersionedApiUrl(baseUrl, '/videos')}/${encodeURIComponent(id)}`);
    const assetsDir = path.join(app.getPath('userData'), 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    let attempts = 0;
    const maxAttempts = grsaiMaxAttempts;
    const intervalMs = grsaiPollingIntervalMs;

    const timer = setInterval(async () => {
      attempts++;
      try {
        const resp = await fetch(url(jobId), {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        const data = await resp.json().catch(() => null);
        if (data) {
          // DashScope 原生任务：状态在 output.task_status（SUCCEEDED），视频地址在 output.video_url
          const status = dsScope ? (data?.output?.task_status || data?.output?.status) : data.status;
          const isDone = dsScope ? status === 'SUCCEEDED' : (status === 'succeeded' || status === 'completed' || status === 'success');
          const fileUrls: string[] = isDone ? extractJobResultUrls(data) : [];
          if (isDone && fileUrls.length > 0) {
            // Download result files and save locally
            const saved: string[] = [];
            for (const fu of fileUrls) {
              try {
                const r2 = await fetch(fu);
                if (!r2.ok) continue;
                const buffer = Buffer.from(await r2.arrayBuffer());
                // Try to determine extension from content-type or URL
                const ct = r2.headers.get('content-type') || '';
                let ext = '';
                if (ct.includes('image/png')) ext = '.png';
                else if (ct.includes('image/jpeg')) ext = '.jpg';
                else if (ct.includes('video/mp4')) ext = '.mp4';
                else {
                  const parsed = path.parse(new URL(fu).pathname || '');
                  ext = parsed.ext || '';
                }
                const fname = `grsai_${jobId}_${Date.now()}${ext}`;
                const fpath = path.join(assetsDir, fname);
                fs.writeFileSync(fpath, buffer);
                saved.push(fpath);
              } catch (e) {
                console.error('download error', e);
              }
            }

            // Send event to renderer
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
              safeSend('grsai:jobUpdate', { id: jobId, status: 'succeeded', results: data.results, urls: fileUrls, filePaths: saved, data });
            }
            clearInterval(timer);
            grsaiJobMap.delete(jobId);
            return;
          } else if (isDone) {
            // 已完成但未解析到结果地址：把原始响应回传，交给渲染进程兜底解析
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
              safeSend('grsai:jobUpdate', { id: jobId, status: 'succeeded', results: data.results, data });
            }
            clearInterval(timer);
            grsaiJobMap.delete(jobId);
            return;
          } else if (dsScope ? (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') : (status === 'failed' || status === 'error')) {
            console.error('[Grsai Poll] job FAILED', jobId, JSON.stringify(data).slice(0, 1000));
            if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
              safeSend('grsai:jobUpdate', { id: jobId, status: 'failed', data });
            }
            clearInterval(timer);
            grsaiJobMap.delete(jobId);
            return;
          }
        }
      } catch (e) {
        console.error('[Grsai Poll] error', e);
      }

      if (attempts >= maxAttempts) {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
          safeSend('grsai:jobUpdate', { id: jobId, status: 'timeout' });
        }
        clearInterval(timer);
        grsaiJobMap.delete(jobId);
      }
    }, intervalMs);

    grsaiJobMap.set(jobId, timer);
  } catch (e) {
    console.error('startGrsaiJobPolling error', e);
  }
}

// IPC: Update Grsai polling config
ipcMain.handle('grsai:setPollingConfig', async (_event, cfg: any) => {
  try {
    if (cfg.intervalMs && typeof cfg.intervalMs === 'number') grsaiPollingIntervalMs = cfg.intervalMs;
    if (cfg.maxAttempts && typeof cfg.maxAttempts === 'number') grsaiMaxAttempts = cfg.maxAttempts;
    return { ok: true, intervalMs: grsaiPollingIntervalMs, maxAttempts: grsaiMaxAttempts };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

ipcMain.handle('grsai:getPollingConfig', async () => ({ ok: true, intervalMs: grsaiPollingIntervalMs, maxAttempts: grsaiMaxAttempts }));

// IPC: 取消正在轮询的异步任务，清理主进程定时器
ipcMain.handle('grsai:cancelJob', async (_event, opts: any) => {
  try {
    const jobId = typeof opts === 'string' ? opts : opts?.id || opts?.jobId;
    if (!jobId) return { ok: false, error: 'jobId required' };
    const timer = grsaiJobMap.get(jobId);
    if (timer) {
      clearInterval(timer);
      grsaiJobMap.delete(jobId);
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

function redirectAgnesHost(url: string): string {
  return url.replace(/^(https?:\/\/)api\.agnes-ai\.com(\/|$)/i, '$1apihub.agnes-ai.com$2');
}

function normalizeApiBase(baseUrl: string | undefined): string {
  let base = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:chat\/completions|images\/generations|api\/generate|api\/result|models|videos|agnesapi)$/i, '');
  base = redirectAgnesHost(base);
  if (!base) throw new Error('API接口地址未配置，请先在设置页填写接口地址');
  return base;
}

// 识别火山方舟视频接口地址：/api/plan（Agent Plan）或 /api/v3（标准方舟）+ 可选 /contents/generations/tasks
// 返回 isVolc 是否火山方舟、taskUrl 视频任务创建/查询基础地址（已含 /contents/generations/tasks）
function detectVolcengineVideoBase(base: string): { isVolc: boolean; taskUrl: string } {
  if (!/:\/\/ark\.cn-beijing\.volces\.com\/api\/(?:plan|v\d+)/i.test(base)) {
    return { isVolc: false, taskUrl: base };
  }
  if (/\/contents\/generations\/tasks$/i.test(base)) {
    return { isVolc: true, taskUrl: base };
  }
  const taskUrl = /\/api\/v\d+/i.test(base)
    ? `${base}/contents/generations/tasks`
    : `${base}/v3/contents/generations/tasks`;
  return { isVolc: true, taskUrl };
}

function hasVersionSegment(url: string): boolean {
  return /\/v\d+(?:\/|$)/i.test(url);
}

function buildVersionedApiUrl(baseUrl: string | undefined, endpoint: string): string {
  let base = normalizeApiBase(baseUrl);
  if (base.endsWith(endpoint)) return base;
  if (!hasVersionSegment(base)) base += '/v1';
  return `${base}${endpoint}`;
}

// 从异步任务结果响应中提取媒体地址（兼容 Agnes / OpenAI / grsai 等多种格式）
// Agnes 视频把地址放在 metadata.url；其它接口可能在 results[]/images[]/data[]/顶层
function extractJobResultUrls(data: any): string[] {
  if (!data) return [];
  const urls: string[] = [];
  const pick = (r: any): string | undefined => {
    if (!r) return undefined;
    if (typeof r === 'string') return /^https?:\/\//i.test(r) ? r : undefined;
    return r.url || r.uri || r.image_url || r.video_url || undefined;
  };
  const pushArray = (arr: any) => {
    if (Array.isArray(arr)) arr.forEach((r: any) => { const u = pick(r); if (u) urls.push(u); });
  };
  if (data.metadata && typeof data.metadata.url === 'string') urls.push(data.metadata.url);
  // 火山方舟视频任务查询响应：视频地址在 content.video_url / content.file_url / content.last_frame_url
  if (data.content && typeof data.content === 'object') {
    const cu = data.content.video_url || data.content.url || data.content.file_url || data.content.last_frame_url;
    if (typeof cu === 'string' && /^https?:|^data:/i.test(cu)) urls.push(cu);
  }
  pushArray(data.results);
  pushArray(data.images);
  pushArray(data.data);
  // DashScope 原生协议：output.results[].url / output.url / output.video_url / output.image_url
  if (data.output && typeof data.output === 'object') {
    const ores = data.output.results;
    if (Array.isArray(ores)) ores.forEach((r: any) => { const u = pick(r); if (u) urls.push(u); });
    const ou = data.output.url || data.output.video_url || data.output.image_url;
    if (typeof ou === 'string' && /^https?:|^data:/i.test(ou) && !urls.includes(ou)) urls.push(ou);
  }
  if (urls.length === 0) {
    const top = pick(data) || pick(data.output) || pick(data.video) || (data.data ? pick(data.data) : undefined);
    if (top) urls.push(top);
  }
  return Array.from(new Set(urls.filter(Boolean)));
}

// IPC: Read file from main process and return as Data URL
// 允许读取的媒体扩展名白名单：本 IPC 仅用于加载图片/视频/音频素材，防止读取任意系统文件
const ALLOWED_MEDIA_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.mp4', '.webm', '.mov', '.mkv', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.fbx', '.obj', '.gltf', '.glb', '.stl']);

ipcMain.handle('fs:readFileAsDataUrl', async (_event, p: string) => {
  try {
    if (!p) throw new Error('path required');
    // Already a data URL, return directly
    if (String(p).startsWith('data:')) return { ok: true, dataUrl: p };

    let fsPath = String(p);
    if (fsPath.startsWith('file://')) {
      const u = new URL(fsPath);
      fsPath = u.pathname;
      if (process.platform === 'win32' && fsPath.startsWith('/')) fsPath = fsPath.slice(1);
    }

    // 扩展名白名单：仅允许读取媒体文件，阻止读取配置/密钥/脚本等任意系统文件
    if (!ALLOWED_MEDIA_EXTS.has(path.extname(fsPath).toLowerCase())) {
      return { ok: false, error: 'unsupported-file-type' };
    }

    if (!fs.existsSync(fsPath)) return { ok: false, error: 'file-not-found' };
    const buffer = fs.readFileSync(fsPath);
    const ext = path.extname(fsPath).toLowerCase();
    let mime = 'application/octet-stream';
    if (ext === '.png') mime = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg';
    else if (ext === '.webp') mime = 'image/webp';
    else if (ext === '.gif') mime = 'image/gif';
    else if (ext === '.mp4') mime = 'video/mp4';
    else if (ext === '.mp3') mime = 'audio/mpeg';

    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: Save dialog - save Data URL / local file / remote URL to target path
ipcMain.handle('system:saveFileFromData', async (_event, opts: { dataUrl: string; suggestedName?: string }) => {
  try {
    const { dataUrl, suggestedName } = opts || ({} as any);
    const defaultPath = suggestedName || 'download';
    const res: any = await dialog.showSaveDialog({ defaultPath });
    // Electron versions differ: some return a string path, others an object
    let dest: string | undefined;
    if (typeof res === 'string') {
      dest = res;
    } else if (Array.isArray(res?.filePaths) && res.filePaths.length > 0) {
      dest = res.filePaths[0];
    } else {
      dest = res?.filePath;
    }
    if (!dest || (res && res.canceled === true)) return { ok: false, canceled: true };

    if (String(dataUrl).startsWith('data:')) {
      const idx = String(dataUrl).indexOf(',');
      const base64 = String(dataUrl).slice(idx + 1);
      const buffer = Buffer.from(base64, 'base64');
      fs.writeFileSync(dest, buffer);
      return { ok: true, path: dest };
    }

    if (String(dataUrl).startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(String(dataUrl))) {
      let src = String(dataUrl);
      if (src.startsWith('file://')) {
        const u = new URL(src);
        src = u.pathname;
        if (process.platform === 'win32' && src.startsWith('/')) src = src.slice(1);
      }
      fs.copyFileSync(src, dest);
      return { ok: true, path: dest };
    }

    // Otherwise try fetch download
    try {
      const r = await fetch(String(dataUrl));
      const arr = await r.arrayBuffer();
      fs.writeFileSync(dest, Buffer.from(arr));
      return { ok: true, path: dest };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: 无对话框下载 —— 把远程 URL / data URL / base64 落到本地 assets 目录，返回本地绝对路径
// 用于统一让所有生成结果先下载到本地再呈现，保证预览秒开。
ipcMain.handle('system:downloadToAssets', async (_event, opts: { url?: string; suggestedExt?: string; prefix?: string }) => {
  try {
    const src = String(opts?.url || '').trim();
    if (!src) return { ok: false, error: '缺少 url' };
    const assetsDir = path.join(app.getPath('userData'), 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const prefix = (opts?.prefix || 'media').replace(/[^a-zA-Z0-9_-]/g, '') || 'media';
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // 1) 已是本地文件：直接返回（避免重复复制）
    if (/^file:\/\//i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) {
      let fp = src;
      if (fp.startsWith('file://')) { try { const u = new URL(fp); fp = u.pathname; if (process.platform === 'win32' && fp.startsWith('/')) fp = fp.slice(1); } catch { /* ignore */ } }
      return fs.existsSync(fp) ? { ok: true, path: fp, alreadyLocal: true } : { ok: false, error: 'file-not-found' };
    }
    let buffer: Buffer | null = null;
    let ext = String(opts?.suggestedExt || '').replace(/^\./, '');
    // 2) data URL
    if (src.startsWith('data:')) {
      const comma = src.indexOf(',');
      const meta = src.slice(5, comma);
      buffer = Buffer.from(src.slice(comma + 1), meta.includes('base64') ? 'base64' : 'utf8');
      if (!ext) {
        if (/image\/png/.test(meta)) ext = 'png';
        else if (/image\/jpe?g/.test(meta)) ext = 'jpg';
        else if (/image\/webp/.test(meta)) ext = 'webp';
        else if (/image\/gif/.test(meta)) ext = 'gif';
        else if (/video\/mp4/.test(meta)) ext = 'mp4';
        else if (/video\/webm/.test(meta)) ext = 'webm';
        else if (/audio\/mpeg|audio\/mp3/.test(meta)) ext = 'mp3';
        else if (/audio\/wav/.test(meta)) ext = 'wav';
      }
    } else {
      // 3) 远程 URL：带常见 headers 下载，避免防盗链/UA 限制导致 403
      let r: Response | null = null;
      const fetchOpts: RequestInit = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      };
      try {
        r = await fetch(src, fetchOpts);
      } catch {
        r = null;
      }
      // 第一次失败时，尝试带 Referer 重试
      if (!r || !r.ok) {
        try {
          const host = new URL(src).hostname;
          r = await fetch(src, {
            ...fetchOpts,
            headers: { ...fetchOpts.headers, 'Referer': `https://${host}/` },
          } as RequestInit);
        } catch {
          r = null;
        }
      }
      if (!r || !r.ok) return { ok: false, error: `下载失败 HTTP ${r?.status || 'network'}` };
      buffer = Buffer.from(await r.arrayBuffer());
      if (!ext) {
        const ct = r.headers.get('content-type') || '';
        if (ct.includes('image/png')) ext = 'png';
        else if (ct.includes('image/jpeg')) ext = 'jpg';
        else if (ct.includes('image/webp')) ext = 'webp';
        else if (ct.includes('image/gif')) ext = 'gif';
        else if (ct.includes('video/mp4')) ext = 'mp4';
        else if (ct.includes('video/webm')) ext = 'webm';
        else if (ct.includes('audio/mpeg')) ext = 'mp3';
        else if (ct.includes('audio/wav')) ext = 'wav';
        else { try { const parsed = path.parse(new URL(src).pathname || ''); ext = (parsed.ext || '').replace(/^\./, ''); } catch { /* ignore */ } }
      }
    }
    if (!buffer || !buffer.length) return { ok: false, error: '下载内容为空' };
    const fname = `${prefix}_${stamp}${ext ? '.' + ext : ''}`;
    const fpath = path.join(assetsDir, fname);
    fs.writeFileSync(fpath, buffer);
    return { ok: true, path: fpath };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: 将远程 URL 转换为 data URL（base64），解决渲染进程 fetch 受 CORS 限制导致图片无法显示的问题
ipcMain.handle('system:urlToDataUrl', async (_event, opts: { url?: string }) => {
  try {
    const src = String(opts?.url || '').trim();
    if (!src) return { ok: false, error: '缺少 url' };
    // 已经是 data URL 或本地路径，直接返回
    if (src.startsWith('data:') || src.startsWith('blob:') || /^[a-zA-Z]:[\\/]/.test(src) || src.startsWith('file://')) {
      return { ok: true, dataUrl: src };
    }
    // 主进程 fetch 不受 CORS 限制
    const r = await fetch(src, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });
    if (!r.ok) return { ok: false, error: `下载失败 HTTP ${r.status}` };
    const buffer = Buffer.from(await r.arrayBuffer());
    if (!buffer || !buffer.length) return { ok: false, error: '下载内容为空' };
    const ct = r.headers.get('content-type') || 'image/png';
    const dataUrl = `data:${ct};base64,${buffer.toString('base64')}`;
    return { ok: true, dataUrl };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: Open file/folder in system
// IPC: 渲染进程上报运行期错误（ErrorBoundary 捕获的组件崩溃等），写入 userData/crash.log
ipcMain.handle('system:reportRendererError', async (_event, info: any) => {
  try {
    const line = `[${new Date().toISOString()}] renderer-error ${JSON.stringify(info || {})}` + '\n';
    fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
    console.error('[Main][renderer-error]', info);
  } catch { /* ignore */ }
  return { ok: true };
});

ipcMain.handle('system:openPath', async (_event, p: string) => {
  try {
    if (!p) throw new Error('path required');
    const res = await shell.openPath(p);
    // shell.openPath returns empty string on success
    if (typeof res === 'string' && res.length === 0) return { ok: true };
    return { ok: false, error: res };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: 用系统默认浏览器打开外部网址（配置页“申请 API”等链接），避免在应用内窗口打开
ipcMain.handle('system:openExternal', async (_event, url: string) => {
  try {
    if (!url || typeof url !== 'string') throw new Error('url required');
    // 仅允许 http/https，避免打开本地文件或危险协议
    if (!/^https?:\/\//i.test(url)) throw new Error('only http(s) urls are allowed');
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: FFmpeg detection / guided installation for local video compose
const GITHUB_RELEASE_REPOSITORY = 'zhanfanghou-create/yijing-ai-downloads';
const CNB_RELEASE_REPOSITORY = 'yijingshijue-2026/yijing-ai-downloads';
const OSS_RELEASE_PREFIX = 'https://yjai-releases-cn-20260818.oss-cn-hangzhou.aliyuncs.com/yijing/';
const RELEASE_MANIFEST_URLS = [
  `https://cnb.cool/${CNB_RELEASE_REPOSITORY}/-/releases/latest/download/latest.json`,
  `${OSS_RELEASE_PREFIX}latest.json`,
  `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/latest/download/latest.json`,
];
const GITHUB_RELEASE_PREFIX = `https://github.com/${GITHUB_RELEASE_REPOSITORY}/releases/download/`;
const CNB_RELEASE_PREFIX = `https://cnb.cool/${CNB_RELEASE_REPOSITORY}/-/releases/download/`;
const ALLOWED_RELEASE_PREFIXES = [CNB_RELEASE_PREFIX, OSS_RELEASE_PREFIX, GITHUB_RELEASE_PREFIX];

function compareVersions(left: string, right: string): number {
  const leftParts = left.replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const rightParts = right.replace(/^v/, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    if ((leftParts[index] || 0) !== (rightParts[index] || 0)) return (leftParts[index] || 0) - (rightParts[index] || 0);
  }
  return 0;
}

async function fetchLatestManifest(): Promise<any> {
  let lastError: unknown;
  for (const url of RELEASE_MANIFEST_URLS) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'YijingAI-Updater' },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法连接更新服务器');
}

function isAllowedReleaseUrl(value: unknown): boolean {
  return ALLOWED_RELEASE_PREFIXES.some(prefix => String(value || '').startsWith(prefix));
}

function selectInstallerAsset(manifest: any): any {
  if (process.platform === 'win32') return manifest?.assets?.windows;
  return process.arch === 'arm64' ? manifest?.assets?.macosArm64 : manifest?.assets?.macosX64;
}

function releaseCandidates(asset: any): Array<{ name: string; url: string }> {
  const mirrors = Array.isArray(asset?.mirrors) ? asset.mirrors : [];
  const priority = new Map([['cnb', 0], ['oss', 1], ['github', 2]]);
  const candidates: Array<{ name: string; url: string }> = mirrors
    .filter((mirror: any) => mirror?.url && isAllowedReleaseUrl(mirror.url))
    .sort((left: any, right: any) => (priority.get(String(left?.id)) ?? 99) - (priority.get(String(right?.id)) ?? 99))
    .map((mirror: any) => ({ name: String(mirror.name || '下载节点'), url: String(mirror.url) }));
  if (asset?.url && isAllowedReleaseUrl(asset.url) && !candidates.some(candidate => candidate.url === asset.url)) {
    candidates.push({ name: '备用下载节点', url: String(asset.url) });
  }
  return candidates;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function writeUpdateFile(response: Response, savePath: string): Promise<number> {
  if (!response.body) throw new Error('下载响应为空');
  const total = Number(response.headers.get('content-length') || 0);
  const writer = fs.createWriteStream(savePath);
  const reader = response.body.getReader();
  let downloaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      downloaded += chunk.length;
      if (!writer.write(chunk)) await new Promise<void>((resolve, reject) => {
        writer.once('drain', resolve);
        writer.once('error', reject);
      });
      safeSend('system:updateProgress', {
        progress: total > 0 ? Math.min(100, Math.round(downloaded * 100 / total)) : 0,
        downloaded,
        total,
      });
    }
    await new Promise<void>((resolve, reject) => {
      writer.once('error', reject);
      writer.end(resolve);
    });
    return downloaded;
  } catch (error) {
    writer.destroy();
    throw error;
  }
}

// 同步返回应用版本号（打包后 process.env.npm_package_version 不存在，必须用 app.getVersion()）
ipcMain.on('system:getVersion', (event) => {
  event.returnValue = app.getVersion();
});

ipcMain.handle('system:checkUpdate', async () => {
  try {
    const manifest = await fetchLatestManifest();
    const latestVersion = String(manifest?.version || '').replace(/^v/, '');
    const currentVersion = app.getVersion();
    const asset = selectInstallerAsset(manifest);
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion) || !asset?.fileName || !asset?.sha256 || !isAllowedReleaseUrl(asset.url)) throw new Error('更新清单不完整');
    return {
      ok: true,
      hasUpdate: Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0 && asset),
      currentVersion,
      latestVersion,
      releaseName: '艺镜 AI 无限画布',
      releaseNotes: manifest?.notes || '',
      publishDate: manifest?.publishedAt || '',
      downloadUrl: asset?.url || '',
      fileName: asset?.fileName || '',
      fileSize: asset?.size || 0,
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// 下载自定义安装器。按 OSS、CNB、GitHub 的顺序重试，避免单一线路失败。
ipcMain.handle('system:downloadUpdate', async (_event) => {
  try {
    const manifest = await fetchLatestManifest();
    const asset = selectInstallerAsset(manifest);
    if (!asset?.url || !asset?.fileName || !asset?.sha256 || !isAllowedReleaseUrl(asset.url)) throw new Error('未找到对应平台的自定义安装包');
    const tmpDir = path.join(app.getPath('temp'), 'yijing-update');
    fs.mkdirSync(tmpDir, { recursive: true });
    const savePath = path.join(tmpDir, path.basename(asset.fileName));
    let lastError: unknown;
    for (const candidate of releaseCandidates(asset)) {
      try {
        if (fs.existsSync(savePath)) fs.unlinkSync(savePath);
        const response = await fetch(candidate.url, { signal: AbortSignal.timeout(30 * 60 * 1000), redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const size = await writeUpdateFile(response, savePath);
        if (size <= 0) throw new Error('下载文件为空');
        if ((await sha256File(savePath)).toLowerCase() !== String(asset.sha256).toLowerCase()) throw new Error('下载文件校验失败');
        safeSend('system:updateProgress', { progress: 100, downloaded: size, total: size });
        return { ok: true, path: savePath, fileName: asset.fileName, size, latestVersion: String(manifest?.version || '').replace(/^v/, '') };
      } catch (error) {
        lastError = error;
        try { if (fs.existsSync(savePath)) fs.unlinkSync(savePath); } catch { /* ignore */ }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('所有下载线路均不可用');
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('system:installUpdate', async (_event, installerPath: string) => {
  try {
    if (!installerPath || !fs.existsSync(installerPath)) throw new Error('更新安装包不存在');
    const result = await shell.openPath(installerPath);
    if (result) throw new Error(result);
    setTimeout(() => app.quit(), 800);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('ffmpeg:check', async () => {
  return checkFfmpegInstalled();
});

ipcMain.handle('ffmpeg:install', async () => {
  const installResult = await installFfmpegWithPackageManager();
  if (!installResult.ok) return installResult;

  const checkResult = await checkFfmpegInstalled();
  if (checkResult.ok) return { ...checkResult, installLog: installResult.log };

  return {
    ok: false,
    error: 'FFmpeg 安装命令已执行，但当前进程仍未检测到 ffmpeg。请重启艺镜 AI，或检查系统 PATH。',
    detail: checkResult.detail || checkResult.error,
    installLog: installResult.log,
  };
});

async function loadBuiltRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const rendererIndex = path.join(__dirname, '../renderer/index.html');
  if (!fs.existsSync(rendererIndex)) {
    throw new Error(`Renderer entry not found: ${rendererIndex}. Please run "npm run build:renderer" first.`);
  }

  await mainWindow.loadFile(rendererIndex);
}

async function createWindow() {
  console.log('[Main] createWindow() called at', new Date().toISOString());
  try {
    mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 生产/打包模式开启 webSecurity（更安全）；开发模式关闭以便 Vite 热更新与调试，
      // 渲染进程直连第三方 API 已由 onHeadersReceived 注入宽松 CORS 头兜底
      webSecurity: process.env.NODE_ENV === 'development' ? false : true,
    },
    title: '艺镜AI.正式版',
  });
    console.log('[Main] BrowserWindow created, mainWindow:', !!mainWindow, 'isDestroyed:', mainWindow?.isDestroyed());
  } catch(e: any) {
    console.error('[Main] createWindow failed:', e?.message, e?.stack);
    return;
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main] Renderer load failed:', { errorCode, errorDescription, validatedURL });
  });

  // 渲染进程崩溃/无响应：写日志到 userData/crash.log，便于打包版定位“闪退”原因
  const writeCrashLog = (tag: string, detail: any) => {
    try {
      const line = `[${new Date().toISOString()}] ${tag} ${JSON.stringify(detail)}` + '\n';
      fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), line);
      console.error('[Main][crash]', tag, detail);
    } catch { /* ignore */ }
  };
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    writeCrashLog('render-process-gone', details);
  });
  mainWindow.webContents.on('unresponsive', () => writeCrashLog('unresponsive', {}));
  mainWindow.webContents.on('preload-error', (_e, preloadPath, error) => {
    writeCrashLog('preload-error', { preloadPath, message: (error as Error)?.message });
  });

  // Only use Vite when explicitly started through npm run dev:main.
  // A plain `electron .` is also "not packaged", but it should load the built renderer
  // instead of waiting on localhost and leaving the window at about:blank.
  if (process.env.NODE_ENV === 'development') {
    const candidatePorts = [
      Number(process.env.VITE_PORT) || undefined,
      Number(process.env.PORT) || undefined,
      5174, 3002, 3001, 5173
    ].filter(Boolean) as number[];

    const waitForServer = async (url: string, attempts = 50, delayMs = 200) => {
      for (let i = 0; i < attempts; i++) {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (res && (res.ok || res.status === 200 || res.status === 405)) return true;
        } catch (e) {
          // ignore until timeout
        }
        await new Promise(r => setTimeout(r, delayMs));
      }
      return false;
    };

    let loaded = false;
    for (const port of candidatePorts) {
      const devUrl = `http://localhost:${port}`;
      const ready = await waitForServer(devUrl, 50, 200);
      if (!ready) continue;

      try {
        await mainWindow.loadURL(devUrl);
        mainWindow.webContents.openDevTools();
        loaded = true;
        break;
      } catch (e) {
        console.warn('[Main] loadURL failed for', devUrl, e);
      }
    }

    if (!loaded) {
      console.warn('[Main] Vite dev server not available; falling back to built renderer.');
      try {
        await loadBuiltRenderer();
      } catch (e) {
        console.error('[Main] Built renderer fallback failed:', e);
      }
    }
  } else {
    try {
      await loadBuiltRenderer();
    } catch (e) {
      console.error('[Main] Failed to load built renderer:', e);
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC: Call Grsai chat API (bypass CORS)
ipcMain.handle('grsai:chat', async (_event, config: any) => {
  console.log('[IPC] grsai:chat called');
  const { baseUrl, apiKey, model, messages } = config;
  try {
    const url = buildVersionedApiUrl(baseUrl, '/chat/completions');
    console.log('[IPC] grsai:chat url=', url, 'model=', model);
    // 对话请求设置超时：长剧本分析可能需要较长时间，但避免请求无限挂起
    const timeoutMs = config.timeoutMs || 300000; // 默认 5 分钟
    // max_tokens：长剧本分析需要输出大量 JSON，必须设足够大的值；
    // 不传时部分模型默认输出极少 token，导致 content 为空被截断
    const maxTokens = config.maxTokens || 16384;
    // 火山方舟 seed 系列推理模型默认开启深度思考，会输出超长 reasoning_content 导致超时；
    // 检测到火山方舟推理模型时自动关闭深度思考，让模型直接输出结果
    const isVolcengineArk = /ark\.cn-beijing\.volces\.com/i.test(baseUrl || '');
    const isReasoningModel = /seed|evolving|reasoning|deepseek|r1/i.test(model || '');
    // 千问 qwen3 系列为混合思考模型，DashScope 官方用 enable_thinking=false 关闭深度思考，
    // 否则会输出超长 reasoning_content 导致长剧本分析超时
    const isDashScopeChat = /dashscope\.aliyuncs\.com/i.test(baseUrl || '') || /\.maas\.aliyuncs\.com/i.test(baseUrl || '');
    const isQwenReasoning = /qwen3|qwen-r1|qwen2\.5-r1/i.test(model || '');
    const body: any = { model, messages, stream: false, max_tokens: maxTokens };
    if (isVolcengineArk && isReasoningModel) {
      body.thinking = { type: 'disabled' };
      console.log('[IPC] grsai:chat: 检测到火山方舟推理模型，已关闭深度思考 (thinking.disabled)');
    }
    if (isDashScopeChat && isQwenReasoning) {
      body.enable_thinking = false;
      console.log('[IPC] grsai:chat: 检测到千问 qwen3 推理模型，已关闭深度思考 (enable_thinking=false)');
    }
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, { timeoutMs });
    const data = await response.json();
    console.log('[IPC] grsai:chat status=', response.status, 'data=', JSON.stringify(data).slice(0, 800));
    return { ok: true, connected: response.ok, status: response.status, data };
  } catch (error) {
    console.error('[IPC] grsai:chat error=', error);
    return { ok: false, error: (error as Error).message };
  }
});

// ===== 火山方舟素材资产库 AK/SK 签名（HMAC-SHA256）与 CreateAsset 流程 =====
// 素材资产库 OpenAPI 仅支持 AK/SK 签名（Service=ark, Region=cn-beijing, Version=2024-01-01）
const VOLC_ASSET_HOST = 'ark.cn-beijing.volcengineapi.com';
const VOLC_ASSET_BASE = 'https://ark.cn-beijing.volcengineapi.com/';
const VOLC_ASSET_REGION = 'cn-beijing';
const VOLC_ASSET_SERVICE = 'ark';

function volcHmacSHA256(key: Buffer, content: string): Buffer {
  return crypto.createHmac('sha256', key).update(content).digest();
}
function volcSha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
function volcSignRequest(opts: { ak: string; sk: string; action: string; body: any }): { url: string; headers: Record<string, string> } {
  const { ak, sk, action, body } = opts;
  const bodyBuf = Buffer.from(JSON.stringify(body));
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const authDate = xDate.slice(0, 8);
  const payload = volcSha256Hex(bodyBuf);
  const queries = new URLSearchParams({ Action: action, Version: '2024-01-01' });
  const queryString = queries.toString().replace(/\+/g, '%20');
  const path = '/';
  const signedHeaders = ['host', 'x-date', 'x-content-sha256', 'content-type'];
  const headerValues: Record<string, string> = {
    'X-Date': xDate,
    'X-Content-Sha256': payload,
    'Content-Type': 'application/json',
    host: VOLC_ASSET_HOST,
  };
  const headerString = signedHeaders.map(h => h + ':' + headerValues[h].trim()).join('\n');
  const canonicalString = ['POST', path, queryString, headerString + '\n', signedHeaders.join(';'), payload].join('\n');
  const hashedCanonical = volcSha256Hex(canonicalString);
  const credentialScope = authDate + '/' + VOLC_ASSET_REGION + '/' + VOLC_ASSET_SERVICE + '/request';
  const signString = ['HMAC-SHA256', xDate, credentialScope, hashedCanonical].join('\n');
  const kDate = volcHmacSHA256(Buffer.from(sk), authDate);
  const kRegion = volcHmacSHA256(kDate, VOLC_ASSET_REGION);
  const kService = volcHmacSHA256(kRegion, VOLC_ASSET_SERVICE);
  const kSigning = volcHmacSHA256(kService, 'request');
  const signature = volcHmacSHA256(kSigning, signString).toString('hex');
  const authorization = 'HMAC-SHA256 Credential=' + ak + '/' + credentialScope + ', SignedHeaders=' + signedHeaders.join(';') + ', Signature=' + signature;
  return {
    url: VOLC_ASSET_BASE + '?' + queryString,
    headers: { 'Authorization': authorization, 'X-Date': xDate, 'X-Content-Sha256': payload, 'Content-Type': 'application/json' },
  };
}
async function callVolcAssetApi(opts: { ak: string; sk: string; action: string; body: any }): Promise<{ ok: boolean; error?: string; result?: any; status?: number }> {
  const req = volcSignRequest(opts);
  const resp = await fetch(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify(opts.body) });
  const data = await resp.json().catch(() => null);
  if (!resp.ok || data?.ResponseMetadata?.Error) {
    const err = data?.ResponseMetadata?.Error?.Message || data?.ResponseMetadata?.Error?.Code || ('HTTP ' + resp.status);
    return { ok: false, error: String(err), status: resp.status };
  }
  return { ok: true, result: data?.Result, status: resp.status };
}

// IPC: 上传素材资产并返回 asset:// 引用（CreateAssetGroup -> CreateAsset -> 轮询 GetAsset 至 Active）
ipcMain.handle('volc:createAsset', async (_event, opts: { ak: string; sk: string; url: string; name?: string; projectName?: string; groupId?: string }) => {
  try {
    const { ak, sk, url, name, projectName = 'default', groupId } = opts || {};
    if (!ak || !sk || !url) return { ok: false, error: '缺少 AK/SK 或素材 URL' };
    // 1. 确保 AssetGroup（优先复用传入的 groupId，否则创建）
    let gid = groupId;
    if (!gid) {
      const gRes = await callVolcAssetApi({ ak, sk, action: 'CreateAssetGroup', body: { GroupType: 'AIGC', ProjectName: projectName } });
      if (!gRes.ok) return gRes;
      gid = gRes.result?.GroupId || gRes.result?.Id;
      if (!gid) return { ok: false, error: '创建素材资产组合失败（未返回 GroupId）' };
    }
    // 2. 创建素材资产（异步）
    const aRes = await callVolcAssetApi({ ak, sk, action: 'CreateAsset', body: { GroupId: gid, URL: url, Name: name || ('asset_' + Date.now()), AssetType: 'Image', ProjectName: projectName } });
    if (!aRes.ok) return aRes;
    const assetId = aRes.result?.Id;
    if (!assetId) return { ok: false, error: '创建素材资产失败（未返回 AssetId）' };
    // 3. 轮询 GetAsset 至 Active（最长约 60 秒）
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const g = await callVolcAssetApi({ ak, sk, action: 'GetAsset', body: { Id: assetId, ProjectName: projectName } });
      const status = g.result?.Status;
      if (status === 'Active') return { ok: true, assetId, groupId: gid, assetUri: 'asset://' + assetId };
      if (status === 'Failed') return { ok: false, error: '素材资产处理失败（Failed）' };
    }
    return { ok: false, error: '素材资产处理超时（未在 60 秒内变为 Active）', assetId, groupId: gid };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: Call Grsai image/video generation API
ipcMain.handle('grsai:generate', async (_event, config: any) => {
  console.log('[IPC] grsai:generate called');
  const { baseUrl, apiKey, model, prompt, aspectRatio } = config;
  try {
    const normalizedBase = normalizeApiBase(baseUrl);
    const isAgnesHost = /:\/\/(?:api|apihub)\.agnes-ai\.com(?:\/|$)/i.test(normalizedBase);
    const isGrsaiHost = /:\/\/grsai\.dakka\.com\.cn(?:\/|$)/i.test(normalizedBase);
    // 火山方舟视频接口：/api/plan（Agent Plan）或 /api/v3（标准方舟），兼容完整任务端点
    const volcVideo = detectVolcengineVideoBase(normalizedBase);
    const isAgnesVideo = isAgnesHost && (
      config.apiType === 'seedance-video' ||
      /agnes-video/i.test(String(model || '')) ||
      (config.apiType === 'openai-completions' && /video|seedance/i.test(String(model || '')))
    );
    // Agnes Image 2.5 Flash：图生图参考图必须放 extra_body.image，response_format 必须放 extra_body
    const isAgnesImage = isAgnesHost && !isAgnesVideo && (
      config.apiType === 'openai-generations' ||
      /agnes-image|image/i.test(String(model || ''))
    );
    // 火山方舟视频生成：apiType 为 openai-completions 或模型名含 video/seedance
    const isVolcenginePlanVideo = volcVideo.isVolc && (
      config.apiType === 'openai-completions' ||
      /video|seedance/i.test(String(model || ''))
    );
    const isOpenAIImageGen = !isGrsaiHost && !isAgnesVideo && !isAgnesImage && !isVolcenginePlanVideo && (
      config.apiType === 'openai-generations' ||
      isAgnesHost ||
      (model && /dall|gpt-image|image/i.test(String(model)))
    );
    // —— 千问/阿里百炼 DashScope 原生协议 ——
    // 官方明确：Qwen-Image 文生图不支持 OpenAI 兼容（compatible-mode）模式，图像/视频必须走 DashScope 原生接口；
    // 用户配置的 baseUrl 通常是 dashscope.aliyuncs.com/compatible-mode/v1，这里按主机识别后改用原生 /api/v1/services 路径。
    const isDashScope = /:\/\/dashscope[a-z0-9-]*\.aliyuncs\.com(?:\/|$)/i.test(normalizedBase) || /:\/\/[a-z0-9-]+\.maas\.aliyuncs\.com(?:\/|$)/i.test(normalizedBase);
    const _modelLc = String(model || '').toLowerCase();
    const isDashScopeVideo = isDashScope && !/image/i.test(_modelLc) && (
      config.apiType === 'openai-completions' ||
      /video|seedance|^wan|wan\d/i.test(_modelLc)
    );
    const isDashScopeImage = isDashScope && !isDashScopeVideo && (
      config.apiType === 'openai-generations' ||
      /image|z-image/i.test(_modelLc)
    );
    // 通用 OpenAI 兼容视频（非火山/agnes/dashscope）：Sora 风格 POST /videos，返回任务 id 后轮询 GET /videos/{id}
    const isGenericVideo = !isGrsaiHost && !isVolcenginePlanVideo && !isAgnesVideo && !isDashScope && (
      config.apiType === 'openai-completions' ||
      (/video|seedance|sora|wan/i.test(_modelLc) && !/image/i.test(_modelLc))
    );
    const dashScopeOrigin = isDashScope ? (() => { try { return new URL(normalizedBase).origin; } catch { return normalizedBase; } })() : '';
    const url = isVolcenginePlanVideo
      ? volcVideo.taskUrl
      : isDashScopeVideo
        ? `${dashScopeOrigin}/api/v1/services/aigc/video-generation/video-synthesis`
        : isAgnesVideo
          ? buildVersionedApiUrl(normalizedBase, '/videos')
          : isDashScopeImage
            ? `${dashScopeOrigin}/api/v1/services/aigc/${/^wan/i.test(_modelLc) ? 'image-generation/generation' : 'multimodal-generation/generation'}`
            : isGenericVideo
              ? buildVersionedApiUrl(normalizedBase, '/videos')
              : isOpenAIImageGen
                ? buildVersionedApiUrl(normalizedBase, '/images/generations')
                : buildVersionedApiUrl(normalizedBase, '/api/generate');

    const isGenerationRequest = Boolean(
      config.apiType === 'openai-generations' ||
      config.apiType === 'openai-completions' ||
      config.imageSize ||
      config.image_size ||
      config.size ||
      config.resolution ||
      config.pixel ||
      config.pixels ||
      config.aspectRatio ||
      config.aspect_ratio ||
      config.ratio ||
      (config.images && Array.isArray(config.images) && config.images.length > 0) ||
      (model && /image|video|generate|gpt-image|dall/i.test(String(model)))
    );

    const aspectValue = config.aspectRatio || config.aspect_ratio || config.ratio || aspectRatio;
    const rawImageSize = config.imageSize || config.image_size || config.size;
    const resolutionValue = config.resolution || config.pixel || config.pixels;

    // 把 1K/2K/3K/4K + 比例转换成 WIDTHxHEIGHT 格式（兼容火山引擎等要求 WIDTHxHEIGHT 或 2k/3k/4k 的接口）
    const convertImageSize = (size: string, ratio?: string): string => {
      if (!size) return size;
      if (/^\d+x\d+$/i.test(size)) return size;
      if (/^[234]k$/i.test(size)) return size.toLowerCase();
      const kMatch = size.match(/^(\d+)k$/i);
      if (kMatch) {
        const k = parseInt(kMatch[1], 10);
        let width: number;
        switch (k) {
          case 1: width = 1280; break;
          case 2: width = 2048; break;
          case 3: width = 3072; break;
          case 4: width = 4096; break;
          default: width = 1024;
        }
        let height = width;
        if (ratio) {
          const ratioMatch = ratio.match(/^(\d+):(\d+)$/);
          if (ratioMatch) {
            const rw = parseInt(ratioMatch[1], 10);
            const rh = parseInt(ratioMatch[2], 10);
            height = Math.round(width * rh / rw);
          }
        }
        return `${width}x${height}`;
      }
      return size;
    };
    const imageSizeValue = convertImageSize(rawImageSize, aspectValue);
    const sourceImage = config.sourceImage || config.image || (Array.isArray(config.images) ? config.images[0] : undefined);
    const imagesValue = Array.isArray(config.images) && config.images.length > 0
      ? config.images
      : sourceImage
        ? [sourceImage]
        : [];
    const isPanorama720 = config.panoramaType === '720' || /720°?全景|720 panorama/i.test(String(prompt || ''));

    // 参考图转 base64（方舟 API 无法访问本地 file:// 路径，远程 URL 也可能过期或无权限，统一转 data URL 确保可访问）
    const toVolcImageValue = async (img: string): Promise<string> => {
      // data: 原样透传
      if (/^data:/i.test(img)) return img;
      // asset: 视频API不支持（会报 resource download failed），返回空字符串跳过
      if (/^asset:/i.test(img)) {
        console.warn('[VolcVideo] asset:// 引用不支持作为视频参考图，已跳过:', img.slice(0, 80));
        return '';
      }
      try {
        let buf: Buffer;
        let ext: string;
        if (/^https?:\/\//i.test(img)) {
          // 远程 URL：下载后转 base64（避免 TOS URL 过期或跨账号无权限导致 resource download failed）
          const resp = await fetch(img);
          if (!resp.ok) {
            console.warn('[VolcImage] 下载远程参考图失败:', resp.status, img.slice(0, 100));
            return '';
          }
          buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length > 25 * 1024 * 1024) return ''; // 超大图片跳过
          const ct = resp.headers.get('content-type') || '';
          ext = ct.includes('jpeg') ? 'jpg' : ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : (path.extname(new URL(img).pathname).slice(1) || 'png').toLowerCase();
        } else {
          // 本地路径：读取文件转 base64
          const p = img.replace(/^file:\/\//i, '');
          const st = await fs.promises.stat(p);
          if (!st.isFile() || st.size > 25 * 1024 * 1024) return ''; // 超大图片跳过，避免请求体超限
          buf = await fs.promises.readFile(p);
          ext = (path.extname(p).slice(1) || 'png').toLowerCase();
        }
        const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext;
        return 'data:image/' + mime + ';base64,' + buf.toString('base64');
      } catch (e) {
        console.warn('[VolcImage] 参考图转base64失败:', img.slice(0, 80), e);
        return '';
      }
    };

    const dsSizeValue = (() => {
      const sz = String(imageSizeValue || config.imageSize || config.size || '').trim();
      if (!sz) return /^wan/i.test(_modelLc) ? '2K' : '2048*2048';
      return /^[234]k$/i.test(sz) ? sz.toLowerCase() : sz.replace(/[xX\u00d7]/g, '*');
    })();
    const body: any = isVolcenginePlanVideo
      ? {
          model: model || '',
          content: [{ type: 'text', text: prompt }],
          // 按火山方舟官方文档：视频参数直接放请求体顶层（强校验），并关闭视频水印
          ratio: aspectValue || '16:9',
          resolution: resolutionValue || '720p',
          duration: Math.min(30, Math.max(4, Number(config.duration) || 5)),
          watermark: false,
        }
      : isDashScopeVideo
        ? {
            model: model || '',
            input: {
              prompt,
              negative_prompt: String(config.negativePrompt || config.negative_prompt || ''),
              // 图生视频关键：参考图必须放进 input.media（wan2.7/wan3.0 统一用 media 数组，
              // 第1张 first_frame 作首帧/主参考，其余 reference_image 作参考图）或 input.img_url（老 wan i2v）。
              // 若只写在顶层 body.image/images，DashScope 会忽略，请求退化为纯文生视频。
              ...(imagesValue.length > 0
                ? /^wan2\.2|^wan2\.1|^wanx/i.test(_modelLc)
                  ? { img_url: imagesValue[0] }
                  : /wan3/i.test(_modelLc)
                    ? {
                        // wan3.0 全能参考（All-in-One）：官方规定 reference_xx 与 first_frame/last_frame 互斥，
                        // 多张角色/场景/道具参考图统一用 reference_image（最多10张），全部生效且不报错
                        media: imagesValue.slice(0, 10).map((img: string) => ({ type: 'reference_image', url: img })),
                      }
                    : {
                        // wan2.7 等 i2v：仅用第1张作首帧
                        media: [{ type: 'first_frame', url: imagesValue[0] }],
                      }
                : {}),
            },
            // 万相视频官方参数：resolution(720P/1080P)、ratio(16:9)、duration、watermark
            parameters: {
              // DashScope 要求 resolution 大写（720P/1080P），小写 720p 会被参数校验拒绝
              resolution: resolutionValue ? String(resolutionValue).toUpperCase().replace(/^720$/i, '720P').replace(/^1080$/i, '1080P') : '720P',
              ratio: aspectValue || '16:9',
              duration: Math.min(30, Math.max(4, Number(config.duration) || 5)),
              watermark: false,
            },
          }
        : isDashScopeImage
          ? {
              model: model || '',
              input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
              parameters: {
                size: dsSizeValue,
                n: config.n || 1,
                watermark: false,
                ...(String(config.negativePrompt || config.negative_prompt || '').trim() ? { negative_prompt: String(config.negativePrompt || config.negative_prompt).trim() } : {}),
              },
            }
          : isAgnesVideo
            ? {
                model: model || '',
                prompt,
                aspectRatio: aspectValue || '16:9',
              }
            : isGenericVideo
              ? {
                  model: model || '',
                  prompt,
                  aspectRatio: aspectValue || '16:9',
                }
              : isAgnesImage
                ? {
                    model: model || '',
                    prompt,
                    // Agnes Image 2.5 Flash：size 支持 1K/2K/3K/4K 档位或精确尺寸
                    size: imageSizeValue || '2K',
                    // ratio 与 size 配合使用
                    ratio: aspectValue || '1:1',
                    n: config.n || 1,
                    // Agnes 官方要求：response_format 必须放在 extra_body 中，不能放顶层
                    extra_body: {
                      response_format: 'url',
                    },
                  }
                : isOpenAIImageGen
                ? {
                    model: model || '',
                    prompt,
                    size: imageSizeValue || '1024x1024',
                    n: config.n || 1,
                    // 火山引擎 Seedream 扩展参数：关闭AI视觉水印，输出PNG格式
                    // watermark 必须放在 extra_body 内部才生效，写外层完全无效
                    extra_body: {
                      watermark: false,
                      output_format: 'png',
                    },
                  }
                : { model, prompt, replyType: config.replyType || 'json' };

    if (imagesValue.length > 0 && !isVolcenginePlanVideo && !isAgnesImage) {
      // 非方舟视频、非Agnes图片分支才写 body.image（方舟视频参考图已放 content 内）
      body.image = imagesValue[0];
      body.images = imagesValue;
      body.sourceImage = sourceImage || imagesValue[0];
    }
    // Agnes Image 2.5 Flash 图生图：参考图必须放在 extra_body.image 数组中（官方规范）
    if (isAgnesImage && imagesValue.length > 0) {
      body.extra_body = body.extra_body || {};
      body.extra_body.image = imagesValue;
    }

    if (isPanorama720) {
      body.panoramaType = '720';
      body.outputType = 'panorama';
      body.aspectRatio = aspectValue || '2:1';
      body.aspect_ratio = aspectValue || '2:1';
      body.ratio = aspectValue || '2:1';
      body.resolution = resolutionValue || '2K';
    }

    if (isVolcenginePlanVideo) {
      // 火山引擎 方舟 视频：参考图支持（本地路径需转 base64，方舟无法访问 file:// 本地路径）
      if (imagesValue.length > 0) {
        const refs: string[] = [];
        for (const img of imagesValue) {
          const v = await toVolcImageValue(img);
          if (v) refs.push(v);
        }
        body.content = [
          ...refs.map((img: string) => ({ type: 'image_url', image_url: { url: img }, role: 'reference_image' })),
          { type: 'text', text: prompt },
        ];
      }
    } else if (isAgnesVideo) {
      if (imagesValue.length > 0) body.images = imagesValue;
      if (sourceImage) body.image = sourceImage;
      if (config.duration) {
        body.duration = config.duration;
        // OpenAI/Sora 兼容视频接口用 seconds（字符串）表示时长；同时带上以兼容不同上游实现。
        body.seconds = String(config.duration);
      }

      if (aspectValue) {
        body.aspectRatio = aspectValue;
        body.aspect_ratio = aspectValue;
        body.ratio = aspectValue;
      }

      if (imageSizeValue) {
        body.imageSize = imageSizeValue;
        body.image_size = imageSizeValue;
        body.size = imageSizeValue;
      }

      if (resolutionValue) {
        body.resolution = resolutionValue;
        body.pixel = resolutionValue;
        body.pixels = resolutionValue;
      }
    } else if (!isOpenAIImageGen) {
      body.images = imagesValue;

      if (aspectValue) {
        body.aspectRatio = aspectValue;
        body.aspect_ratio = aspectValue;
        body.ratio = aspectValue;
      }

      if (imageSizeValue) {
        body.imageSize = imageSizeValue;
        body.image_size = imageSizeValue;
        body.size = imageSizeValue;
      }

      if (resolutionValue) {
        body.resolution = resolutionValue;
        body.pixel = resolutionValue;
        body.pixels = resolutionValue;
      }
    } else if (isOpenAIImageGen) {
      if (imagesValue.length > 0) body.image = imagesValue[0];

      // 比例参数：Agnes / OpenAI 兼容图片接口真正生效的是 `ratio`（如 16:9），
      // 之前只传 aspectRatio/aspect_ratio 被上游忽略，导致对话页选择的比例不生效。
      // 这里三种键都带上以兼容不同上游实现。
      if (aspectValue) {
        body.ratio = aspectValue;
        body.aspectRatio = aspectValue;
        body.aspect_ratio = aspectValue;
      }

      // 分辨率/尺寸：兼容像素尺寸与 1K/2K/4K 档位。
      if (imageSizeValue) {
        body.size = imageSizeValue;
        body.imageSize = imageSizeValue;
        body.image_size = imageSizeValue;
      }
      if (resolutionValue) {
        body.resolution = resolutionValue;
      }
    }

    if (isAgnesVideo) {
      // Agnes Video 2.5 Flash 官方规范：mode 必填（text/reference/keyframe），size 固定 "720P"，seconds 为字符串
      const hasRefImages = imagesValue.length > 0;
      body.mode = hasRefImages ? 'reference' : 'text';
      body.size = '720P'; // Flash 模型固定 720P，其他值返回 400
      body.n = 1;
      if (hasRefImages) {
        body.images = imagesValue.slice(0, 5); // Flash 最多 5 张参考图
      }
      if (sourceImage && !hasRefImages) {
        // 单张首帧图走 keyframe 模式
        body.mode = 'keyframe';
        body.first_frame = sourceImage;
        delete body.images;
      }
      if (config.duration) {
        body.duration = config.duration;
        // Agnes 官方要求 seconds 为字符串 "4"-"12"
        const dur = Math.min(12, Math.max(4, Number(config.duration) || 5));
        body.seconds = String(dur);
      } else {
        body.seconds = '5';
      }

      if (aspectValue) {
        body.aspectRatio = aspectValue;
        body.aspect_ratio = aspectValue;
        body.ratio = aspectValue;
      }
    }

    const headers: any = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };
    // DashScope 原生：万相视频/万相图像为异步接口，必须带 X-DashScope-Async: enable；
    // qwen-image 走 multimodal-generation（同步返回 output.results[].url），不带该头
    if (isDashScopeVideo || (isDashScopeImage && /^wan/i.test(_modelLc))) headers['X-DashScope-Async'] = 'enable';
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    // 视频队列经常瞬时过载（publish_video_queue_failed / 500），给视频创建请求更多重试次数。
    }, (isAgnesVideo || isDashScopeVideo || isGenericVideo) ? { retries: 8, baseDelayMs: 2000 } : undefined);

    const data = await response.json().catch(() => null);

    // If async job returned, start polling
    // 注意：火山方舟创建视频任务只返回 {id:"cgt-..."}，没有 status 字段，必须单独判定；
    // DashScope 原生异步任务返回 output.task_id（万相视频/万相图像）
    const dashscopeTaskId = (data && data.output && typeof data.output === 'object') ? (data.output.task_id || undefined) : undefined;
    const isAsyncJobResp = !!((dashscopeTaskId || (data && data.id)) && (isVolcenginePlanVideo || isDashScope || data.status));
    if (isAsyncJobResp && data.status !== 'succeeded') {
      const jobId = dashscopeTaskId || data.id;
      startGrsaiJobPolling(jobId, normalizedBase, apiKey).catch((e) => console.error('start polling failed', e));
      return { ok: true, accepted: true, id: jobId, status: data.status || data?.output?.task_status || 'queued', data };
    }

    // If direct result with URLs, download and return local paths
    if (data) {
      const fileUrls: string[] = [];
      const base64Items: Array<{ b64: string; ext: string }> = [];

      const pickUrl = (r: any): string | undefined => {
        if (!r) return undefined;
        if (typeof r === 'string') return r;
        return r.url || r.uri || r.image_url || r.video_url || undefined;
      };

      if (Array.isArray(data.results) && data.results.length > 0) {
        data.results.forEach((r: any) => { const u = pickUrl(r); if (u) fileUrls.push(u); });
      }
      if (Array.isArray(data.images) && data.images.length > 0) {
        data.images.forEach((r: any) => { const u = pickUrl(r); if (u) fileUrls.push(u); });
      }
      // OpenAI images/generations format: { data: [ { url | b64_json } ] }
      if (Array.isArray(data.data) && data.data.length > 0) {
        data.data.forEach((r: any) => {
          const u = pickUrl(r);
          if (u) {
            fileUrls.push(u);
          } else if (r && typeof r.b64_json === 'string' && r.b64_json.length > 0) {
            base64Items.push({ b64: r.b64_json, ext: '.png' });
          }
        });
      }
      // DashScope 原生图像/视频：output.results[].url / output.url / output.video_url
      if (data.output && typeof data.output === 'object') {
        const ores = data.output.results;
        if (Array.isArray(ores) && ores.length > 0) {
          ores.forEach((r: any) => { const u = pickUrl(r); if (u) fileUrls.push(u); });
        } else {
          const ou = pickUrl(data.output);
          if (ou) fileUrls.push(ou);
        }
      }
      // Some responses put the url at the top level
      if (fileUrls.length === 0 && base64Items.length === 0) {
        const topUrl = pickUrl(data);
        if (topUrl) fileUrls.push(topUrl);
      }

      const saved: string[] = [];
      if (fileUrls.length > 0 || base64Items.length > 0) {
        try {
          const assetsDir = path.join(app.getPath('userData'), 'assets');
          fs.mkdirSync(assetsDir, { recursive: true });
          for (const fu of fileUrls) {
            try {
              const r2 = await fetch(fu);
              if (!r2.ok) continue;
              const buffer = Buffer.from(await r2.arrayBuffer());
              const ct = r2.headers.get('content-type') || '';
              let ext = '';
              if (ct.includes('image/png')) ext = '.png';
              else if (ct.includes('image/jpeg')) ext = '.jpg';
              else if (ct.includes('image/webp')) ext = '.webp';
              else if (ct.includes('video/mp4')) ext = '.mp4';
              else if (ct.includes('video/webm')) ext = '.webm';
              else {
                try {
                  const parsed = path.parse(new URL(fu).pathname || '');
                  ext = parsed.ext || '';
                } catch { ext = ''; }
              }
              const fname = `grsai_${Date.now()}_${saved.length}${ext}`;
              const fpath = path.join(assetsDir, fname);
              fs.writeFileSync(fpath, buffer);
              saved.push(fpath);
            } catch (e) {
              console.error('download immediate result error', e);
            }
          }
          for (const item of base64Items) {
            try {
              const buffer = Buffer.from(item.b64, 'base64');
              const fname = `grsai_${Date.now()}_${saved.length}${item.ext}`;
              const fpath = path.join(assetsDir, fname);
              fs.writeFileSync(fpath, buffer);
              saved.push(fpath);
            } catch (e) {
              console.error('save base64 result error', e);
            }
          }
        } catch (e) {
          console.error('saving immediate results failed', e);
        }
      }

      return { ok: true, accepted: false, status: response.status, data, filePaths: saved };
    }

    return { ok: true, accepted: false, status: response.status, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Check async generation result
ipcMain.handle('grsai:checkResult', async (_event, opts: any) => {
  try {
    const { baseUrl, apiKey, id } = opts;
    if (!baseUrl) throw new Error('baseUrl required');
    if (!id) throw new Error('id required');

    const normalizedBase = normalizeApiBase(baseUrl);
    const volcVideo = detectVolcengineVideoBase(normalizedBase);
    const dsScope = /:\/\/dashscope[a-z0-9-]*\.aliyuncs\.com(?:\/|$)/i.test(normalizedBase) || /:\/\/[a-z0-9-]+\.maas\.aliyuncs\.com(?:\/|$)/i.test(normalizedBase);
    const dsOrigin = dsScope ? (() => { try { return new URL(normalizedBase).origin; } catch { return normalizedBase; } })() : '';
    const url = dsScope
      ? `${dsOrigin}/api/v1/tasks/${encodeURIComponent(id)}`
      : (volcVideo.isVolc
        ? `${volcVideo.taskUrl}/${encodeURIComponent(id)}`
        : `${buildVersionedApiUrl(baseUrl, '/videos')}/${encodeURIComponent(id)}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: OpenAI-compatible chat API (DeepSeek, OpenAI, etc.)
ipcMain.handle('openai:chat', async (_event, config: any) => {
  const { baseUrl, apiKey, model, messages } = config;
  try {
    const url = buildVersionedApiUrl(baseUrl, '/chat/completions');
    
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const data = await response.json();
    return { ok: true, connected: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Refresh Grsai / Agnes / OpenAI-compatible model list
ipcMain.handle('grsai:refreshModels', async (_event, config: any) => {
  const { baseUrl, apiKey, apiType } = config || {};
  try {
    if (!baseUrl || String(baseUrl).trim() === '') {
      return { ok: false, error: 'baseUrl required' };
    }

    const normalizedBase = normalizeApiBase(baseUrl);
    try {
      new URL(normalizedBase);
    } catch {
      return { ok: false, error: '接口地址格式不正确' };
    }

    const isAgnesBase = /:\/\/(?:api|apihub)\.agnes-ai\.com(?:\/|$)/i.test(normalizedBase);
    if (isAgnesBase) {
      // Agnes AI 官方未提供 /models 接口，不返回假模型列表
      return {
        ok: true,
        status: 200,
        models: [],
        data: {
          object: 'list',
          data: [],
          note: 'Agnes 官方未提供 /models 接口，请手动在设置页填写模型名称。',
        },
      };
    }

    if (apiType === 'seedance-video' || apiType === 'openai-image-to-video' || apiType === 'custom-video') {
      // 视频接口未提供 /models 接口，不返回假模型列表
      return {
        ok: true,
        status: 200,
        models: [],
        data: {
          object: 'list',
          data: [],
          note: '该视频接口未提供 /models 接口，请手动在设置页填写模型名称。',
        },
      };
    }

    const url = buildVersionedApiUrl(baseUrl, '/models');
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        Accept: 'application/json',
      },
    });

    const text = await response.text().catch(() => '');
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `HTTP ${response.status} ${response.statusText}${text ? ` - ${text}` : ''}`,
        data,
      };
    }

    const toModelId = (item: any): string => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return String(item);
      return String(item.id || item.name || item.model || item.value || '');
    };

    let models: string[] = [];
    if (Array.isArray(data)) {
      models = data.map(toModelId);
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.data)) models = data.data.map(toModelId);
      else if (Array.isArray(data.models)) models = data.models.map(toModelId);
      else if (Array.isArray(data.result)) models = data.result.map(toModelId);
      else if (Array.isArray(data.results)) models = data.results.map(toModelId);
    }

    models = Array.from(new Set(models.map((m) => String(m).trim()).filter(Boolean)));
    if (models.length === 0) {
      return { ok: false, status: response.status, error: '未能解析模型列表', data };
    }

    return { ok: true, status: response.status, models, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Call OpenAI image generation API
ipcMain.handle('openai:generate', async (_event, config: any) => {
  const { apiKey, baseUrl, model, prompt, size, n } = config;
  
  try {
    const url = buildVersionedApiUrl(baseUrl, '/images/generations');
    const sourceImage = config.sourceImage || config.image || (Array.isArray(config.images) ? config.images[0] : undefined);
    const imagesValue = Array.isArray(config.images) && config.images.length > 0 ? config.images : sourceImage ? [sourceImage] : [];
    const isPanorama720 = config.panoramaType === '720' || /720°?全景|720 panorama/i.test(String(prompt || ''));
    const passthroughKeys = ['aspectRatio', 'aspect_ratio', 'ratio', 'resolution', 'imageRatio', 'imageQuality', 'imageClarity', 'sourceImage', 'referenceImages', 'images', 'image', 'mediaFeature', 'sourceFeature', 'workflowProject', 'githubProject', 'apiCapability', 'outputType', 'panoramaType', 'projectPromptHint', 'gridSplit', 'gridCount', 'viewMode', 'multiView', 'lightingSettings', 'lightingDirection', 'lightingView', 'hdFeature', 'splitMode', 'transparentBackground'];
    
    // 把 1K/2K/3K/4K + 比例转换成 WIDTHxHEIGHT 格式
    const aspectValueForSize = config.ratio || config.aspectRatio || config.aspect_ratio || config.imageRatio;
    const rawSize = size || config.imageSize || config.size;
    const convertSize = (s: string, r?: string): string => {
      if (!s) return s;
      if (/^\d+x\d+$/i.test(s)) return s;
      if (/^[234]k$/i.test(s)) return s.toLowerCase();
      const kMatch = s.match(/^(\d+)k$/i);
      if (kMatch) {
        const k = parseInt(kMatch[1], 10);
        let width: number;
        switch (k) {
          case 1: width = 1280; break;
          case 2: width = 2048; break;
          case 3: width = 3072; break;
          case 4: width = 4096; break;
          default: width = 1024;
        }
        let height = width;
        if (r) {
          const ratioMatch = r.match(/^(\d+):(\d+)$/);
          if (ratioMatch) {
            const rw = parseInt(ratioMatch[1], 10);
            const rh = parseInt(ratioMatch[2], 10);
            height = Math.round(width * rh / rw);
          }
        }
        return `${width}x${height}`;
      }
      return s;
    };
    const convertedSize = convertSize(rawSize, aspectValueForSize);
    
    const body: any = {
      model: model || '',
      prompt: config.projectPromptHint ? `${prompt || ''}\n\n${config.projectPromptHint}` : prompt,
      size: convertedSize || '1024x1024',
      n: n || 1,
    };
    passthroughKeys.forEach((key) => { if (config[key] !== undefined) body[key] = config[key]; });
    // 比例参数归一：上游真正生效的是 `ratio`。若上游只收到 aspectRatio/aspect_ratio，
    // 会忽略比例导致图片仍是默认 1:1，这里补齐 ratio。
    {
      const aspectValue = config.ratio || config.aspectRatio || config.aspect_ratio || config.imageRatio;
      if (aspectValue && aspectValue !== 'auto') {
        body.ratio = aspectValue;
        body.aspectRatio = aspectValue;
        body.aspect_ratio = aspectValue;
      } else {
        delete body.ratio; delete body.aspectRatio; delete body.aspect_ratio;
      }
    }
    if (imagesValue.length > 0) {
      body.image = imagesValue[0];
      body.images = imagesValue;
      body.sourceImage = sourceImage || imagesValue[0];
    }
    if (isPanorama720) {
      body.panoramaType = '720';
      body.outputType = 'panorama';
      body.aspectRatio = config.aspectRatio || config.aspect_ratio || '2:1';
      body.aspect_ratio = body.aspectRatio;
      body.ratio = body.aspectRatio;
      body.resolution = config.resolution || '2K';
    }
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    return await response.json();
  } catch (error) {
    return { error: (error as Error).message };
  }
});

// IPC: ComfyUI connection test
ipcMain.handle('comfyui:connect', async (_event, config: any) => {
  const { serverUrl, dataPath } = config;
  const base = String(serverUrl || '').replace(/\/+$/, '');
  try {
    // 测试连接 - 使用 system_stats 端点
    const statsResponse = await fetch(`${base}/system_stats`);
    if (!statsResponse.ok) {
      return { ok: false, status: statsResponse.status, error: '无法连接到 ComfyUI 服务器' };
    }
    
    // 获取模型列表（checkpoints）- ComfyUI 标准端点
    let models: string[] = [];
    try {
      const modelResponse = await fetch(`${base}/object_info/CheckpointLoaderSimple`);
      if (modelResponse.ok) {
        const data = await modelResponse.json();
        const ckptNames = data?.CheckpointLoaderSimple?.input?.required?.ckpt_name;
        if (Array.isArray(ckptNames)) {
          models = ckptNames.filter((m: any) => typeof m === 'string');
        }
      }
    } catch (e) {
      // 忽略模型获取错误
    }
    
    // 获取工作流列表
    let workflows: string[] = [];
    
    // 方式 1：从文件系统扫描（如果提供了 dataPath）
    if (dataPath && typeof dataPath === 'string' && dataPath.trim()) {
      try {
        const workflowsDir = path.join(dataPath, 'userdata', 'workflows');
        if (fs.existsSync(workflowsDir)) {
          const files = fs.readdirSync(workflowsDir);
          workflows = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace(/\.json$/i, ''))
            .filter(Boolean);
        }
      } catch (e) {
        // 忽略文件系统错误，继续尝试其他方式
      }
    }
    
    // 方式 2：尝试 ComfyUI Manager API
    if (workflows.length === 0) {
      try {
        const managerResponse = await fetch(`${base}/custom/get_workflow_list`);
        if (managerResponse.ok) {
          const data = await managerResponse.json();
          if (Array.isArray(data)) {
            workflows = data.map((item: any) => 
              typeof item === 'string' ? item : (item.name || item.id || item.filename || item.title || String(item))
            ).filter(Boolean);
          }
        }
      } catch (e) {
        // Manager 未安装，继续尝试其他方式
      }
    }
    
    // 方式 3：尝试标准 HTTP 端点
    if (workflows.length === 0) {
      const workflowEndpoints = [
        `${base}/workflows`,
        `${base}/api/workflows`,
        `${base}/userdata/workflows`,
        `${base}/api/userdata/workflows`
      ];
      
      for (const endpoint of workflowEndpoints) {
        try {
          const response = await fetch(endpoint);
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data)) {
              workflows = data.map((item: any) => 
                typeof item === 'string' ? item : (item.name || item.id || item.filename || JSON.stringify(item))
              ).filter(Boolean);
              break;
            } else if (data.workflows && Array.isArray(data.workflows)) {
              workflows = data.workflows.map((item: any) => 
                typeof item === 'string' ? item : (item.name || item.id || item.filename || JSON.stringify(item))
              ).filter(Boolean);
              break;
            }
          }
        } catch (e) {
          // 继续尝试下一个端点
        }
      }
    }
    
    return { 
      ok: true, 
      status: statsResponse.status,
      models: models,      // 返回模型列表（checkpoints）
      workflows: workflows // 返回工作流列表（可能为空）
    };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Get ComfyUI workflow/model list
ipcMain.handle('comfyui:getModels', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  const endpoints = [`${base}/workflows`, `${base}/api/workflows`, `${base}/object_info`, `${base}/object_info/CheckpointLoaderSimple`];
  for (const url of endpoints) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const data = await response.json();
      const models = Array.isArray(data)
        ? data.map((item: any) => typeof item === 'string' ? item : item.name || item.id || item.filename).filter(Boolean)
        : Array.isArray(data?.workflows)
          ? data.workflows.map((item: any) => typeof item === 'string' ? item : item.name || item.id || item.filename).filter(Boolean)
          : data?.CheckpointLoaderSimple?.input?.required?.ckpt_name || Object.keys(data || {});
      if (Array.isArray(models) && models.length > 0) return { ok: true, models };
    } catch {}
  }
  return { ok: true, models: [] };
});

// IPC: ComfyUI 能力体检 —— 抓取 /object_info 全量节点，汇总模型/节点能力画像
ipcMain.handle('comfyui:capability', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '缺少 ComfyUI 地址' };
  try {
    const resp = await fetch(`${base}/object_info`);
    if (!resp.ok) return { ok: false, error: `无法获取 object_info (HTTP ${resp.status})` };
    const info = await resp.json();
    const nodeTypes = Object.keys(info || {});
    const enumFrom = (cls: string, key: string): string[] => {
      const req = info?.[cls]?.input?.required || {};
      const opt = info?.[cls]?.input?.optional || {};
      const spec = req[key] || opt[key];
      const arr = Array.isArray(spec) ? spec[0] : undefined;
      return Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : [];
    };
    const models = {
      checkpoints: enumFrom('CheckpointLoaderSimple', 'ckpt_name'),
      loras: enumFrom('LoraLoader', 'lora_name'),
      vaes: enumFrom('VAELoader', 'vae_name'),
      controlnets: enumFrom('ControlNetLoader', 'control_net_name'),
      upscalers: enumFrom('UpscaleModelLoader', 'model_name'),
      clip_visions: enumFrom('CLIPVisionLoader', 'clip_name'),
      unets: enumFrom('UNETLoader', 'unet_name'),
    };
    return { ok: true, nodeTypes, models, nodeCount: nodeTypes.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
});

// IPC: 读取用户 ComfyUI 自带的官方工作流模板索引（前端资源接口，非核心 API）
ipcMain.handle('comfyui:templates', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '缺少 ComfyUI 地址' };
  const indexEndpoints = [`${base}/api/workflow_templates`, `${base}/workflow_templates`];
  for (const url of indexEndpoints) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = await r.json();
      return { ok: true, index: data, source: url };
    } catch {}
  }
  return { ok: true, index: null };
});

// IPC: 按模板名读取某个官方模板的完整 workflow JSON
ipcMain.handle('comfyui:templateWorkflow', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  const name = String(config?.name || '').trim();
  if (!base || !name) return { ok: false, error: '缺少地址或模板名' };
  const candidates = [
    `${base}/api/workflow_templates/${encodeURIComponent(name)}`,
    `${base}/workflow_templates/${encodeURIComponent(name)}`,
    `${base}/templates/${encodeURIComponent(name)}.json`,
    `${base}/api/templates/${encodeURIComponent(name)}.json`,
  ];
  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const wf = await r.json();
      if (wf && (Array.isArray(wf.nodes) || typeof wf === 'object')) return { ok: true, workflow: wf, source: url };
    } catch {}
  }
  return { ok: false, error: `未找到模板 ${name}` };
});

// ── ComfyUI 工作流扫描（只枚举/拉取 userdata 下已保存的工作流，不加载模型）──────────
async function scanComfyWorkflows(base: string) {
  const files: Array<{ name: string; path: string }> = [];
  const seen = new Set<string>();
  const addFile = (entry: any) => {
    if (!entry || entry.type !== 'file') return;
    const nm = String(entry.name || '');
    if (!/\.json$/i.test(nm)) return;
    const p = String(entry.path || nm);
    if (seen.has(p)) return;
    seen.add(p);
    files.push({ name: nm, path: p });
  };
  // 1) v2 递归枚举
  try {
    const r = await fetch(`${base}/v2/userdata?recursive=true`);
    if (r.ok) {
      const data = await r.json(); 
      // v2/userdata?recursive=true 返回的是目录树（folder.children 嵌套），需要递归遍历提取所有文件条目 
      const walk = (node: any, depth: number = 0) => { 
        if (depth > 8 || node == null) return; 
        if (Array.isArray(node)) { node.forEach((n: any) => walk(n, depth + 1)); return; } 
        if (typeof node === 'object') { 
          if (Array.isArray(node.children)) { 
            if (node.type === 'file' || (node.name && node.path)) addFile(node); 
            node.children.forEach((c: any) => walk(c, depth + 1)); 
            return; 
          } 
          if (node.type === 'file' || (node.name && node.path)) { addFile(node); return; } 
          Object.values(node).forEach((v: any) => { if (v && typeof v === 'object') walk(v, depth + 1); }); 
        } 
      }; 
      walk(data); 
    } 
  } catch { /* 尝试下一种 */ }
  // 2) legacy 逐目录枚举
  if (files.length === 0) {
    for (const dir of ['', 'workflows', 'api', 'comfyui']) {
      try {
        const r = await fetch(`${base}/userdata${dir ? '?dir=' + encodeURIComponent(dir) : ''}`);
        if (!r.ok) continue;
        const data = await r.json();
        if (!Array.isArray(data)) continue;
        data.forEach(addFile);
      } catch { /* 忽略 */ }
    }
  }
  // 3) 逐个拉取内容（并行，最多 40 个），提取工作流
  const fetchFile = async (path: string): Promise<any | null> => {
    const urls = [
      `${base}/userdata/${path.split('/').map(encodeURIComponent).join('/')}`,
      `${base}/userdata/${encodeURIComponent(path)}`,
      `${base}/v2/userdata/file?path=${encodeURIComponent(path)}`,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const text = await r.text();
        try { return JSON.parse(text); } catch { continue; }
      } catch { /* 尝试下一个 URL */ }
    }
    return null;
  };
  const extractWorkflow = (obj: any): { kind: 'ui' | 'api'; workflow: any } | null => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const looksApi = (w: any) => w && typeof w === 'object' && !Array.isArray(w)
      && Object.keys(w).some(k => w[k] && typeof w[k] === 'object' && w[k].class_type);
    if (obj.workflow && typeof obj.workflow === 'object' && (Array.isArray(obj.workflow.nodes) || looksApi(obj.workflow))) {
      return { kind: 'ui', workflow: obj.workflow };
    }
    if (obj.prompt && looksApi(obj.prompt)) {
      return { kind: 'api', workflow: obj.prompt };
    }
    const keys = Object.keys(obj);
    if (keys.length > 0 && keys.every(k => /^\d+$/.test(k)) && keys.some(k => obj[k] && obj[k].class_type)) {
      return { kind: 'api', workflow: obj };
    }
    if (Array.isArray(obj.nodes) && obj.nodes.length > 0) {
      return { kind: 'ui', workflow: obj };
    }
    return null;
  };
  const detectKind = (workflow: any): 'image' | 'video' | 'audio' | 'chat' => {
    const classTypes: string[] = [];
    const collect = (node: any) => {
      const ct = String(node?.class_type || node?.type || '');
      if (ct) classTypes.push(ct);
    };
    if (Array.isArray(workflow?.nodes)) workflow.nodes.forEach(collect);
    else if (workflow && typeof workflow === 'object') Object.keys(workflow).forEach(k => collect(workflow[k]));
    if (workflow && workflow.definitions && Array.isArray(workflow.definitions.subgraphs)) {
      for (const sg of workflow.definitions.subgraphs) { if (Array.isArray(sg.nodes)) sg.nodes.forEach(collect); }
    }
    const all = classTypes.join('|').toLowerCase();
    const hasVideo = /videocombine|savevideo|createvideo|vhs_videocombine|saveanimatedwebp|wanvideo|cogvideo|hunyuanvideo|mochi|ltxv|svd|cosmos|animatediff/i.test(all);
    const hasAudio = /saveaudio|save_audio|av_saveaudio|vhs_audio|audio/i.test(all);
    const hasImage = /saveimage|save_image|vhs_saveimage|previewimage/i.test(all);
    if (hasVideo) return 'video';
    if (hasAudio && !hasImage) return 'audio';
    if (hasImage) return 'image';
    // 纯对话/文本类工作流（LLM 等），无媒体输出节点
    if (/llm|textgen|text_generation|chatglm|deepseek|openai|text2text|completion/i.test(all)) return 'chat';
    return 'image';
  };
  const slice = files.slice(0, 40);
  const settled = await Promise.all(slice.map(async f => {
    const obj = await fetchFile(f.path);
    const ext = obj ? extractWorkflow(obj) : null;
    if (!ext) return null;
    return { name: f.name.replace(/\.json$/i, ''), path: f.path, kind: ext.kind, type: detectKind(ext.workflow), workflow: ext.workflow };
  }));
  return settled.filter(Boolean);
}

// IPC: 扫描并拉取 ComfyUI 服务器上已保存的工作流（不加载模型）
ipcMain.handle('comfyui:listWorkflows', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: '缺少 ComfyUI 地址' };
  try {
    const workflows = await scanComfyWorkflows(base);
    return { ok: true, workflows, count: workflows.length };
  } catch (e) {
    return { ok: false, error: (e as Error).message || '扫描工作流失败' };
  }
});

// IPC: ComfyUI execute workflow
ipcMain.handle('comfyui:generate', async (_event, config: any) => {
  const base = String(config?.serverUrl || '').replace(/\/+$/, '');
  const { workflowName, workflowJson, params = {}, prompt: incomingPrompt = '', options = {}, referenceMedia = [] } = config || {};

  // 内置工作流支持：用户选择内置工作流时，使用预设的标准工作流结构（独立负向节点），自动匹配用户服务器上的模型
  const useBuiltin: string | null = config?.useBuiltin || null;
  let effectiveWorkflowJson = workflowJson;
  if (useBuiltin === 'asset_image') {
    console.log('[COMFYDBG] 使用内置资产图工作流（独立负向CLIP节点）');
    effectiveWorkflowJson = JSON.parse(JSON.stringify({
      '1': { class_type: 'UNETLoader', inputs: { unet_name: '', weight_dtype: 'default' } },
      '2': { class_type: 'CLIPLoader', inputs: { clip_name: '', type: 'qwen_image' } },
      '3': { class_type: 'VAELoader', inputs: { vae_name: '' } },
      '4': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['2', 0] } },
      '5': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['2', 0] } },
      '6': { class_type: 'EmptyLatentImage', inputs: { width: 1920, height: 1080, batch_size: 1 } },
      '7': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['4', 0], negative: ['5', 0], latent_image: ['6', 0], seed: 0, steps: 12, cfg: 1.8, sampler_name: 'res_multistep', scheduler: 'simple', denoise: 1.0 } },
      '8': { class_type: 'VAEDecode', inputs: { samples: ['7', 0], vae: ['3', 0] } },
      '9': { class_type: 'SaveImage', inputs: { images: ['8', 0], filename_prefix: 'yijing_asset' } },
    }));
    // 自动检测用户 ComfyUI 服务器上的可用模型，匹配替换
    try {
      const detectModels = async (nodeType: string, inputKey: string): Promise<string> => {
        try {
          const r = await fetch(base + '/object_info/' + encodeURIComponent(nodeType));
          if (!r.ok) return '';
          const d = await r.json();
          const spec = d?.[nodeType]?.input?.required?.[inputKey];
          if (Array.isArray(spec) && spec.length > 0 && Array.isArray(spec[0])) {
            const list: string[] = spec[0];
            // 优先匹配 z_image_turbo / qwen_image / ae / qwen_3_4b
            const priorities: Record<string, string[]> = {
              unet_name: ['z_image_turbo', 'z_image', 'qwen_image', 'flux1-dev', 'flux'],
              clip_name: ['qwen_3_4b', 'qwen', 'clip_l', 't5xxl'],
              vae_name: ['ae.safetensors', 'ae.sft', 'qwen_image_vae', 'flux2-vae', 'sdxl_vae'],
            };
            const pri = priorities[inputKey] || [];
            for (const key of pri) {
              const hit = list.find((m: string) => m.toLowerCase().includes(key.toLowerCase()));
              if (hit) return hit;
            }
            return list[0] || '';
          }
        } catch { /* ignore */ }
        return '';
      };
      const unet = await detectModels('UNETLoader', 'unet_name');
      const clip = await detectModels('CLIPLoader', 'clip_name');
      const vae = await detectModels('VAELoader', 'vae_name');
      if (unet) effectiveWorkflowJson['1'].inputs.unet_name = unet;
      if (clip) effectiveWorkflowJson['2'].inputs.clip_name = clip;
      if (vae) effectiveWorkflowJson['3'].inputs.vae_name = vae;
      console.log('[COMFYDBG] 内置工作流自动匹配模型: unet=' + unet + ', clip=' + clip + ', vae=' + vae);
    } catch (e) {
      console.log('[COMFYDBG] 内置工作流模型自动检测失败:', (e as Error).message);
    }
  } else if (useBuiltin === 'minimax_h3_video') {
    console.log('[COMFYDBG] 使用内置 MiniMax H3 全能参考视频工作流（动态参考图数量）');
    const refCount = Math.max(1, Math.min(9, Array.isArray(referenceMedia) ? referenceMedia.length : 1));
    const length = Math.min(360, Math.max(49, Number(params?.length || options?.length || 124)));
    const wf: Record<string, any> = {
      '1': { class_type: 'UNETLoader', inputs: { unet_name: '', weight_dtype: 'default' } },
      '2': { class_type: 'MiniMaxH3SigmaShift', inputs: { model: ['1', 0], shift_video: 12.0, shift_audio: 3.0 } },
      '3': { class_type: 'LoraLoader', inputs: { model: ['2', 0], clip: ['4', 0], lora_name: 'Minimax H3/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors', strength_model: 1.0, strength_clip: 1.0 } },
      '4': { class_type: 'CLIPLoader', inputs: { clip_name: '', type: 'minimax' } },
      '5': { class_type: 'VAELoader', inputs: { vae_name: '' } },
      '6': { class_type: 'VAELoader', inputs: { vae_name: '' } },
    };
    // 动态创建 LoadImage 节点
    const refImageList: any[] = [];
    for (let i = 0; i < refCount; i++) {
      const imgNodeId = String(7 + i);
      wf[imgNodeId] = { class_type: 'LoadImage', inputs: { image: '', upload: 'image' } };
      refImageList.push([imgNodeId, 0]);
    }
    const refNodeId = String(7 + refCount);
    const zeroOutId = String(8 + refCount);
    const ksamplerId = String(9 + refCount);
    const decodeId = String(10 + refCount);
    const audioDecodeId = String(11 + refCount);
    const combineId = String(12 + refCount);
    wf[refNodeId] = {
      class_type: 'MiniMaxH3ReferenceToVideo',
      inputs: {
        clip: ['4', 0],
        vae: ['5', 0],
        audio_vae: ['6', 0],
        prompt: '',
        width: 1344,
        height: 768,
        length: length,
        ref_image_size: 'match',
        ref_images: refImageList,
      },
    };
    wf[zeroOutId] = { class_type: 'ConditioningZeroOut', inputs: { conditioning: [refNodeId, 0] } };
    wf[ksamplerId] = {
      class_type: 'KSampler',
      inputs: { model: ['3', 0], positive: [refNodeId, 0], negative: [zeroOutId, 0], latent_image: [refNodeId, 1], seed: 0, steps: 4, cfg: 1.0, sampler_name: 'euler', scheduler: 'sgm_uniform', denoise: 1.0 },
    };
    wf[decodeId] = { class_type: 'VAEDecode', inputs: { vae: ['5', 0], samples: [ksamplerId, 0] } };
    wf[audioDecodeId] = { class_type: 'VAEDecodeAudio', inputs: { samples: [ksamplerId, 0], vae: ['6', 0] } };
    wf[combineId] = {
      class_type: 'VHS_VideoCombine',
      inputs: { images: [decodeId, 0], audio: [audioDecodeId, 0], frame_rate: 24, loop_count: 0, filename_prefix: 'yijing_h3_video', format: 'video/h264-mp4', pix_fmt: 'yuv420p', crf: 19, save_metadata: true, pingpong: false, save_output: true },
    };
    effectiveWorkflowJson = wf;
    // 自动检测 MiniMax H3 模型
    try {
      const detectH3Model = async (nodeType: string, inputKey: string, keywords: string[]): Promise<string> => {
        try {
          const r = await fetch(base + '/object_info/' + encodeURIComponent(nodeType));
          if (!r.ok) return '';
          const d = await r.json();
          const spec = d?.[nodeType]?.input?.required?.[inputKey];
          if (Array.isArray(spec) && spec.length > 0 && Array.isArray(spec[0])) {
            const list: string[] = spec[0];
            for (const key of keywords) {
              const hit = list.find((m: string) => m.toLowerCase().includes(key.toLowerCase()));
              if (hit) return hit;
            }
            return list[0] || '';
          }
        } catch { /* ignore */ }
        return '';
      };
      const unet = await detectH3Model('UNETLoader', 'unet_name', ['minimax_h3_ref2va', 'minimax_h3', 'h3']);
      const clip = await detectH3Model('CLIPLoader', 'clip_name', ['qwen3vl_32b_minimax_h3', 'minimax_h3', 'qwen3vl']);
      const videoVae = await detectH3Model('VAELoader', 'vae_name', ['minimax_h3_video_vae', 'h3_video_vae', 'minimax_h3_video']);
      const audioVae = await detectH3Model('VAELoader', 'vae_name', ['minimax_h3_audio_vae', 'h3_audio_vae', 'minimax_h3_audio']);
      if (unet) effectiveWorkflowJson['1'].inputs.unet_name = unet;
      if (clip) effectiveWorkflowJson['4'].inputs.clip_name = clip;
      if (videoVae) effectiveWorkflowJson['5'].inputs.vae_name = videoVae;
      if (audioVae) effectiveWorkflowJson['6'].inputs.vae_name = audioVae;
      console.log('[COMFYDBG] H3内置工作流自动匹配模型: unet=' + unet + ', clip=' + clip + ', videoVae=' + videoVae + ', audioVae=' + audioVae + ', refCount=' + refCount);
    } catch (e) {
      console.log('[COMFYDBG] H3内置工作流模型自动检测失败:', (e as Error).message);
    }
  }

  console.log('[COMFYDBG] === comfyui:generate ENTRY ===');
  console.log('[COMFYDBG] serverUrl:', base);
  console.log('[COMFYDBG] workflowName:', workflowName);
  console.log('[COMFYDBG] model:', config?.model);
  console.log('[COMFYDBG] prompt(截断前300):', String(incomingPrompt || '').slice(0, 300));
  console.log('[COMFYDBG] options:', JSON.stringify(options));
  console.log('[COMFYDBG] params.components:', JSON.stringify(params?.components || []));
  console.log('[COMFYDBG] referenceMedia count:', Array.isArray(referenceMedia) ? referenceMedia.length : 0);
  const _wfStr = JSON.stringify(workflowJson || '');
  console.log('[COMFYDBG] workflowJson: typeof=', typeof workflowJson, 'Array.isArray(nodes)=', Array.isArray(workflowJson?.nodes), 'has definitions.subgraphs=', !!(workflowJson?.definitions?.subgraphs), 'jsonLength=', _wfStr.length);
  if (Array.isArray(workflowJson?.nodes)) {
    console.log('[COMFYDBG] workflow top-level node types:', workflowJson.nodes.map((n: any) => `${n.id}:${n.type}`).join(', '));
    if (Array.isArray(workflowJson.nodes)) {
      for (const _dbgId of ['94', '95']) {
        const _dbgN = (workflowJson.nodes as any[]).find((n: any) => String(n.id) === _dbgId);
        console.log(`[COMFYDBG] wf node ${_dbgId}: widgets_values=`, JSON.stringify(_dbgN?.widgets_values), ' wvn=', JSON.stringify(_dbgN?.widgets_values_named), ' hasWvn=', !!(_dbgN && _dbgN.widgets_values_named && typeof _dbgN.widgets_values_named === 'object'));
      }
    }
  }

  try {
    // 1. 读取工作流 JSON（内置工作流时使用 effectiveWorkflowJson）
    let workflow = effectiveWorkflowJson;
    if (!workflow && workflowName) {
      // 从本地读取工作流文件
      const workflowPath = path.join(app.getPath('userData'), 'comfyui-workflows', `${workflowName}.json`);
      if (fs.existsSync(workflowPath)) {
        const workflowData = fs.readFileSync(workflowPath, 'utf-8');
        workflow = JSON.parse(workflowData);
      } else {
        return { ok: false, error: `工作流文件不存在: ${workflowName}` };
      }
    }
    
    if (!workflow) {
      return { ok: false, error: '缺少工作流定义' };
    }
    
    // 2. 将工作流转换为 API 格式（如果需要）
    // ComfyUI 的工作流 JSON 有两种格式：
    // - UI 格式：包含 nodes 数组，每个节点有 id, type, inputs, outputs 等
    // - API 格式：是一个对象，key 是节点 ID，value 是节点定义
    // 如果上传的是 UI 格式，需要转换为 API 格式
    let apiWorkflow = workflow;
    if (Array.isArray(workflow.nodes)) {
      // UI（网页导出）格式 -> API（prompt）格式：
      // 需要用 /object_info 还原每个节点 widgets_values 数组对应的输入名，
      // 并用 links 表把 inputs 数组的连接槽还原成 [nodeId, slot]，否则无法提交。
      const objInfoCache: Record<string, any> = {};
      const fetchObjInfo = async (classType: string): Promise<any> => {
        if (!classType) return null;
        if (Object.prototype.hasOwnProperty.call(objInfoCache, classType)) return objInfoCache[classType];
        try {
          const r = await fetch(`${base}/object_info/${encodeURIComponent(classType)}`);
          if (!r.ok) { objInfoCache[classType] = null; return null; }
          const d = await r.json();
          objInfoCache[classType] = d?.[classType] || null;
        } catch { objInfoCache[classType] = null; }
        return objInfoCache[classType];
      };
      const widgetOrderFromSpec = (spec: any): Array<{ name: string; cag: boolean }> => {
        if (!spec || !spec.input) return [];
        const isWidget = (s: any) => Array.isArray(s) && (Array.isArray(s[0]) || ['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMFY_DYNAMICCOMBO_V3'].includes(String(s[0])));
        const order = [...Object.keys(spec.input.required || {}), ...Object.keys(spec.input.optional || {})];
        const out: Array<{ name: string; cag: boolean }> = [];
        for (const name of order) {
          const s = (spec.input.required && spec.input.required[name]) || (spec.input.optional && spec.input.optional[name]);
          if (isWidget(s)) out.push({ name, cag: !!(s[1] && s[1].control_after_generate) });
        }
        return out;
      };
      // 新版 ComfyUI 模板（frontend 1.4x）可能使用 subgraph（definitions.subgraphs）：
      // 核心节点/连线藏在子图里，顶层只有代理节点（type 为子图 UUID + proxyWidgets）。
      // 这里扁平化：合并子图内部节点与连线、丢弃代理节点/UI节点/哨兵连线，
      // 并把顶层「代理节点 → 外部消费节点」的连线重连到子图实际输出源，还原成可提交的平面图。
      const _subgraphs = Array.isArray((workflow as any)?.definitions?.subgraphs) ? (workflow as any).definitions.subgraphs : [];
      if (_subgraphs.length > 0) {
        const _subIds = new Set(_subgraphs.map((sg: any) => sg && sg.id));
        const _UI_ONLY = /^(note|markdownnote|reroute|groupnode|primitivenode)$/i;
        const _linkArr = (l: any): any[] | null => {
          if (Array.isArray(l)) return l.length >= 5 ? l : null;
          if (l && typeof l === 'object' && l.id !== undefined && l.origin_id !== undefined && l.target_id !== undefined) {
            return [l.id, l.origin_id, l.origin_slot ?? 0, l.target_id, l.target_slot ?? 0, l.type || ''];
          }
          return null;
        };
        const _dropNodes = new Set<number>();
        const _proxyTypeById: Record<number, string> = {};
        for (const n of (Array.isArray(workflow.nodes) ? workflow.nodes : [])) {
          if (!n || n.id === undefined) continue;
          if (_subIds.has(n.type)) _proxyTypeById[n.id] = String(n.type);
          if (n && (_subIds.has(n.type) || _UI_ONLY.test(String(n.type)) || (Array.isArray(n.proxyWidgets) && n.proxyWidgets.length > 0))) _dropNodes.add(n.id);
        }
        // 每个子图：target=-20 的连线即子图实际输出源（-20 的 target_slot 对应代理输出槽），
        // 不依赖可能缺失的 outputNode.outputs。
        const _proxyOutSrc: Record<string, Array<[string, number]>> = {};
        for (const sg of _subgraphs) {
          const _outMap: Array<[string, number]> = [];
          for (const l of (Array.isArray(sg.links) ? sg.links : [])) {
            const a = _linkArr(l);
            if (a && a[3] === -20) _outMap[a[4]] = [String(a[1]), a[2]];
          }
          _proxyOutSrc[String(sg.id)] = _outMap;
        }
        const _flatNodes: any[] = [];
        const _seen = new Set<number>();
        const _push = (n: any) => { if (n && n.id !== undefined && !_seen.has(n.id)) { _seen.add(n.id); _flatNodes.push(n); } };
        for (const n of (Array.isArray(workflow.nodes) ? workflow.nodes : [])) { if (!_dropNodes.has(n.id)) _push(n); }
        for (const sg of _subgraphs) { for (const n of (Array.isArray(sg.nodes) ? sg.nodes : [])) { if (!_dropNodes.has(n.id)) _push(n); } }
        workflow.nodes = _flatNodes;
        const _allLinks: any[] = [];
        for (const l of (Array.isArray(workflow.links) ? workflow.links : [])) { const a = _linkArr(l); if (a) _allLinks.push(a); }
        for (const sg of _subgraphs) { for (const l of (Array.isArray(sg.links) ? sg.links : [])) { const a = _linkArr(l); if (a) _allLinks.push(a); } }
        const _flatLinks: any[] = [];
        const _lseen = new Set<number>();
        for (const l of _allLinks) {
          if (!Array.isArray(l) || l.length < 5) continue;
          if (l[1] < 0 || l[3] < 0) continue; // 哨兵输入/输出节点 -10 / -20
          if (_dropNodes.has(l[3])) continue; // 目标为代理/UI 节点
          let _src = l[1]; let _sslot = l[2];
          if (_dropNodes.has(_src)) { // 源为代理节点 -> 重连到子图实际输出源
            const _sid = _proxyTypeById[_src];
            const _m = _sid ? (_proxyOutSrc[_sid] || [])[_sslot] : null;
            if (!_m) continue;
            _src = Number(_m[0]); _sslot = _m[1];
          }
          if (_dropNodes.has(_src)) continue;
          if (_lseen.has(l[0])) continue;
          _lseen.add(l[0]); _flatLinks.push([l[0], _src, _sslot, l[3], l[4], l[5] || '']);
        }
        workflow.links = _flatLinks;
      }
      const links = Array.isArray(workflow.links) ? workflow.links : [];
      const linkById = new Map<any, any>();
      for (const l of links) { if (Array.isArray(l) && l.length >= 5) linkById.set(l[0], l); }
      apiWorkflow = {};
      const _UI_ONLY2 = /^(note|markdownnote|reroute|groupnode|primitivenode)$/i;
      for (const node of workflow.nodes) {
        if (!node || node.id === undefined || node.id === null) continue;
        const id = String(node.id);
        const classType = node.type;
        if (_UI_ONLY2.test(String(classType))) continue; // 纯 UI 节点（注释/路由等），后端不识别，跳过
        const inputs: any = {};
        const spec = await fetchObjInfo(classType);
        // 1. 连接：inputs 数组里带 link 的项 -> [srcNodeId, srcSlot]
        //    支持中文/本地化别名输入（如「模型」→model、「提示词」→voice_description）映射回 API 输入名
        if (Array.isArray(node.inputs)) {
          const apiKeys = new Set([
            ...Object.keys(spec?.input?.required || {}),
            ...Object.keys(spec?.input?.optional || {}),
          ].map((k: string) => k.replace(/_control_after_generate$/, '')));
          const usedKeys = new Set<string>();
          for (const inp of node.inputs) {
            if (!inp || inp.link === null || inp.link === undefined) continue;
            const l = linkById.get(inp.link);
            if (!l) continue;
            let key = inp.name;
            if (!apiKeys.has(key)) {
              // 别名项：从同节点 API 名输入里按 语义/类型 匹配
              const candidates = (node.inputs as any[]).filter((x: any) => x && x.name && apiKeys.has(x.name) && !usedKeys.has(x.name));
              const t0 = String(inp.type || '');
              const mapped =
                (t0 === 'STRING' ? candidates.find((x: any) => /voice|desc|prompt|台词|提示/i.test(String(x.name))) : undefined) ||
                candidates.find((x: any) => String(x.type || '').replace(/\d+/g, '') === t0.replace(/\d+/g, '') && String(x.type || '') !== t0) ||
                candidates.find((x: any) => String(x.type || '') === t0) ||
                candidates[0];
              if (!mapped) continue;
              key = mapped.name;
            }
            if (apiKeys.has(key) && !usedKeys.has(key)) {
              inputs[key] = [String(l[1]), l[2]];
              usedKeys.add(key);
            }
          }
        } else if (node.inputs && typeof node.inputs === 'object') {
          // 已经是 API 风格的 inputs 对象（部分导出），直接沿用
          Object.assign(inputs, node.inputs);
        }
        // 2. widgets_values：按 object_info 输入顺序还原为具名参数
        //    优先用新版 ComfyUI 工作流自带的 widgets_values_named（具名映射，能覆盖
        //    COMFY_DYNAMICCOMBO_V3 动态下拉及其子参数如 format.bit_depth / format.input_color_space），
        //    否则回退到「按 object_info 输入顺序猜名」的数组映射。
        const _wvn = (node.widgets_values_named && typeof node.widgets_values_named === 'object') ? node.widgets_values_named : null;
        if (_wvn) {
          // 具名映射优先：能覆盖 COMFY_DYNAMICCOMBO_V3 动态下拉及其子参数（如 format.bit_depth）
          for (const wname of Object.keys(_wvn)) {
            if (!(wname in inputs)) inputs[wname] = _wvn[wname];
          }
        }
        // 数组兜底（非 else-if）：具名映射未覆盖的 widget 仍按 object_info 顺序补齐，
        // 避免节点带 wvn 但缺 format 等字段时丢失参数
        if (Array.isArray(node.widgets_values)) {
          const widgetNames = widgetOrderFromSpec(spec);
          if (widgetNames.length > 0) {
            let wi = 0;
            for (const w of widgetNames) {
              if (wi >= node.widgets_values.length) break;
              // 已被连线输入占用（如 TTS 的 model/voice_description）时不覆盖，保留连线引用
              if (!(w.name in inputs)) inputs[w.name] = node.widgets_values[wi];
              wi += 1;
              if (w.cag) wi += 1; // 跳过 control_after_generate 额外占位
            }
          }
        } else if (node.widgets_values && typeof node.widgets_values === 'object') {
          for (const k of Object.keys(node.widgets_values)) inputs[k] = node.widgets_values[k];
        }
        // 2b. 值合法性归一：类型不合法/超出范围时回退 object_info 默认值（防 widgets 顺序错位导致的 400）
        for (const key of Object.keys(inputs)) {
          if (Array.isArray(inputs[key])) continue; // 连线引用不动
          const conf = spec?.input?.required?.[key] || spec?.input?.optional?.[key];
          if (!conf) continue;
          const type = Array.isArray(conf[0]) ? 'COMBO' : String(conf[0]);
          const def = conf[1]?.default;
          if (type === 'COMBO') {
            const list = conf[0];
            if (Array.isArray(list) && !list.includes(inputs[key])) inputs[key] = def !== undefined ? def : list[0];
          } else if (type === 'INT' || type === 'FLOAT') {
            const n = Number(inputs[key]);
            if (!Number.isFinite(n)) {
              if (def !== undefined) inputs[key] = def;
            } else {
              const min = conf[1]?.min, max = conf[1]?.max;
              if ((min !== undefined && n < min) || (max !== undefined && n > max)) {
                if (def !== undefined) inputs[key] = def;
              } else if (type === 'INT') {
                inputs[key] = Math.round(n);
              }
            }
          }
        }
        apiWorkflow[id] = { inputs, class_type: classType, _meta: { title: node.title || classType } };
      }
    }

    // 3. 注入参数到工作流的相应节点
    // 优先使用 components 映射（用户在配置页勾选暴露的输入），再用默认规则
    const componentParams = Array.isArray(params?.components) ? params.components : [];
    // 收集所有可作为文本输入的节点（CLIPTextEncode / Prompt / Text 关键字）
    const textNodeIds: string[] = [];
    for (const nodeId of Object.keys(apiWorkflow)) {
      const node = apiWorkflow[nodeId];
      if (!node || typeof node !== 'object') continue;
      const ct = String(node.class_type || node.type || '');
      if (/cliptextencode|cliptext|prompt|^text$/i.test(ct) && node.inputs && 'text' in node.inputs) {
        textNodeIds.push(nodeId);
      }
    }
    // 合并 prompt 与 components 中的值：components 中所有字符串/数字类型 input 一一塞进 workflow
    const applyValue = (nodeInputs: any, key: string, value: any) => {
      if (value === undefined || value === null || value === '') return;
      if (nodeInputs && Object.prototype.hasOwnProperty.call(nodeInputs, key)) {
        // 如果是数组连接 [nodeId, slotIndex] 类型的占位，不覆盖
        const existing = nodeInputs[key];
        if (Array.isArray(existing)) return;
        nodeInputs[key] = value;
      }
    };
    // 按组件声明的类型对取值做归一：number/boolean 从字符串转换为对应类型，避免工作流校验失败
    const coerceValue = (rawValue: any, type: string) => {
      if (rawValue === undefined || rawValue === null || rawValue === '') return rawValue;
      if (type === 'number') {
        const num = Number(rawValue);
        return Number.isFinite(num) ? num : rawValue;
      }
      if (type === 'boolean') {
        if (typeof rawValue === 'boolean') return rawValue;
        const normalized = String(rawValue).trim().toLowerCase();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
      }
      return rawValue;
    };
        // 推断某个 input 的 role（组件未显式声明 role 时使用）
    const inferRole = (classType: string, inputKey2: string, title = '') => {
      const ct = String(classType || '').toLowerCase();
      const key = String(inputKey2 || '').toLowerCase();
      const tt = String(title || '').toLowerCase();
      if (/loadvideo|vhs_loadvideo/.test(ct) && (key === 'video' || key === 'file')) return 'reference-video';
      if (/loadaudio|vhs_loadaudio|av_loadaudio|load_audio/.test(ct) && (key === 'audio' || key === 'file')) return 'reference-audio';
      if (/loadimage/.test(ct) && key === 'image') return 'reference-image';
      if (/cliptextencode|cliptext/.test(ct) && key === 'text') {
        if (/negative|负向|neg/.test(tt) || /negative|负向/.test(key)) return 'negative';
        return 'prompt';
      }
      if (key === 'text' && /prompt|正向|提示/.test(tt)) return 'prompt';
      return 'param';
    };
    const incomingText = String(incomingPrompt || '').trim();
    // role 指定的参考媒体加载节点（优先于启发式猜测）
    const roleImageTargets: Array<{ nodeId: string; inputKey: string }> = [];
    const roleVideoTargets: Array<{ nodeId: string; inputKey: string }> = [];
    const roleAudioTargets: Array<{ nodeId: string; inputKey: string }> = [];
    let promptRoleHandled = false;
    if (componentParams.length > 0) {
      for (const comp of componentParams) {
        if (!comp) continue;
        const targetId = comp.targetNodeId;
        const inputKey = comp.inputKey || comp.name;
        if (!targetId || !inputKey || !apiWorkflow[targetId]?.inputs) continue;
        const node = apiWorkflow[targetId];
        const role = comp.role || inferRole(node.class_type || node.type, inputKey, node?._meta?.title || comp.title);
        if (role === 'prompt') {
          const promptVal = incomingText || coerceValue(comp.value, String(comp.type || 'string'));
          applyValue(node.inputs, inputKey, promptVal);
          if (incomingText) promptRoleHandled = true;
        } else if (role === 'negative') {
          const negVal = coerceValue(comp.value, String(comp.type || 'string'));
          if (negVal !== undefined && negVal !== null && negVal !== '') applyValue(node.inputs, inputKey, negVal);
        } else if (role === 'reference-image') {
          roleImageTargets.push({ nodeId: targetId, inputKey });
        } else if (role === 'reference-video') {
          roleVideoTargets.push({ nodeId: targetId, inputKey });
        } else if (role === 'reference-audio') {
          roleAudioTargets.push({ nodeId: targetId, inputKey });
        } else {
          applyValue(node.inputs, inputKey, coerceValue(comp.value, String(comp.type || 'string')));
        }
      }
    }
    // 启发式回退：无 prompt-role 组件消费输入框文字时，写入第一个正向 CLIPTextEncode
    if (incomingText && !promptRoleHandled) {
      const positiveId =
        textNodeIds.find(id => /positive|正向|p$/i.test(String(apiWorkflow[id]?._meta?.title || apiWorkflow[id]?.class_type || ''))) ||
        textNodeIds.find(id => !/negative|负向|n$/i.test(String(apiWorkflow[id]?._meta?.title || apiWorkflow[id]?.class_type || ''))) ||
        textNodeIds[0];
      if (positiveId && apiWorkflow[positiveId]?.inputs) {
        applyValue(apiWorkflow[positiveId].inputs, 'text', incomingText);
      } else {
        // TTS/语音工作流：无 CLIPTextEncode，把台词注入到语音类节点的 text 输入
        const ttsId = Object.keys(apiWorkflow).find(id => {
          const n = apiWorkflow[id];
          return n && /tts|voice|speak/i.test(String(n.class_type || '')) && n.inputs && 'text' in n.inputs;
        });
        if (ttsId) {
          applyValue(apiWorkflow[ttsId].inputs, 'text', incomingText);
        } else {
          // MiniMax H3 等参考生成视频工作流：无 CLIPTextEncode，prompt 直接在参考生成节点的 prompt 字段
          const refVideoId = Object.keys(apiWorkflow).find(id => {
            const n = apiWorkflow[id];
            return n && /minimaxh3|referencetovideo|ref2video/i.test(String(n.class_type || '')) && n.inputs && 'prompt' in n.inputs;
          });
          if (refVideoId) {
            // MiniMax H3 音频生成会读出整个 prompt，需要明确区分画面描述和台词，只生成指定台词
            let h3Prompt = incomingText;
            let dialogue = '';
            // 提取"对白："后面的内容作为台词（简单字符串处理，避免复杂正则转义问题）
            const dIdx1 = h3Prompt.indexOf('对白：');
            const dIdx2 = h3Prompt.indexOf('对白:');
            const dIdx = dIdx1 >= 0 ? dIdx1 : dIdx2;
            if (dIdx >= 0) {
              const afterDialogue = h3Prompt.slice(dIdx + 3);
              const nextMatch = afterDialogue.match(/\n\n|\n###|\n\[|\n【|$/);
              const endPos = nextMatch ? nextMatch.index : afterDialogue.length;
              dialogue = afterDialogue.slice(0, endPos).trim();
              h3Prompt = (h3Prompt.slice(0, dIdx) + afterDialogue.slice(endPos)).trim();
            }
            // 清理元数据（剧本标题、系列名称等），避免被当成台词读出
            h3Prompt = h3Prompt.replace(/《[^》]*》[\s\S]*?(?=\n\n|\n###|\n\[|\n【|$)/g, '');
            h3Prompt = h3Prompt.replace(/^系列名称[：:].*$/gm, '');
            h3Prompt = h3Prompt.replace(/^影视剧本.*$/gm, '');
            h3Prompt = h3Prompt.replace(/^AI可解析版.*$/gm, '');
            h3Prompt = h3Prompt.replace(/^POV第一视角.*$/gm, '');
            h3Prompt = h3Prompt.replace(/\n{3,}/g, '\n\n').trim();
            // 构建最终 prompt：画面描述 + 明确的音频生成指令
            let finalH3Prompt = h3Prompt;
            if (dialogue) {
              finalH3Prompt += '\n\n【音频生成指令】音频生成以下台词和旁白，以及环境音和音效。不要读出画面描述、场景说明、镜头指令、剧本标题、系列名称等无关内容：\n' + dialogue;
            } else {
              finalH3Prompt += '\n\n【音频生成指令】音频只生成环境音和音效，不要生成任何语音、台词或旁白。';
            }
            console.log('[COMFYDBG] MiniMax H3 prompt处理: 原长度=', incomingText.length, '处理后长度=', finalH3Prompt.length, '有台词=', !!dialogue);
            applyValue(apiWorkflow[refVideoId].inputs, 'prompt', finalH3Prompt);
          }
        }
      }
    }
    // 负向提示词：用户一般不填，系统自动提交一份默认负面词（只填空节点，不覆盖用户已填内容）。
    // 优先使用画布层按正向提示词自动推理的上下文负面词（options.negativePrompt），否则用内置基础负面词兜底。
    const defaultNegative = String(options?.negativePrompt || options?.negative_prompt || '').trim();
    const builtinNegative = 'lowres, low quality, worst quality, blurry, jpeg artifacts, watermark, signature, text, logo, deformed, bad anatomy, extra limbs, missing fingers, extra fingers, fused fingers, mutated hands, disfigured, cropped, out of frame, duplicate';
    const negText = defaultNegative || builtinNegative;
    // 1) 负向角色组件值仍为空 → 写入默认负面词
    for (const comp of componentParams) {
      if (!comp || comp.role !== 'negative' || !comp.targetNodeId) continue;
      const ni = apiWorkflow[comp.targetNodeId]?.inputs;
      const nk = comp.inputKey || 'text';
      if (ni && Object.prototype.hasOwnProperty.call(ni, nk) && !Array.isArray(ni[nk])
        && (ni[nk] === undefined || ni[nk] === null || ni[nk] === '')) {
        ni[nk] = negText;
      }
    }
    // 2) 定位负向 CLIPTextEncode 节点：优先通过 KSampler 的 negative 输入连接查找（最可靠），
    //    其次用 title 启发式匹配（negative/负向/n结尾）。找到后若 text 为空则注入负向提示词。
    let negativeId: string | undefined;
    const ksamplerIdForNeg = Object.keys(apiWorkflow).find(id => /ksampler/i.test(String(apiWorkflow[id]?.class_type || '')));
    // 沿着条件连接链递归查找真正的 CLIPTextEncode 节点（可能经过 ConditioningZeroOut / ConditioningCombine 等中间节点）
    const findTextNodeAlongChain = (startId: string, visited = new Set<string>() ): string | undefined => {
      if (visited.has(startId)) return undefined;
      visited.add(startId);
      const node = apiWorkflow[startId];
      if (!node) return undefined;
      if (/cliptextencode|cliptext/i.test(String(node.class_type || ''))) return startId;
      const conditionKeys = ['conditioning', 'text', 'positive', 'negative', 'cond', 'conditioning_1', 'conditioning_2'];
      for (const key of conditionKeys) {
        const val = node.inputs?.[key];
        if (Array.isArray(val) && val[0] !== undefined && val[0] !== null) {
          const found = findTextNodeAlongChain(String(val[0]), visited);
          if (found) return found;
        }
      }
      return undefined;
    };
    if (ksamplerIdForNeg) {
      const negConn = apiWorkflow[ksamplerIdForNeg]?.inputs?.negative;
      console.log('[COMFYDBG] KSampler', ksamplerIdForNeg, 'negative 连接=', JSON.stringify(negConn));
      if (Array.isArray(negConn) && negConn[0] !== undefined && negConn[0] !== null) {
        const directId = String(negConn[0]);
        const directNode = apiWorkflow[directId];
        console.log('[COMFYDBG] negative 直接目标节点', directId, 'class_type=', directNode?.class_type, 'inputs keys=', directNode ? Object.keys(directNode?.inputs || {}) : 'N/A');
        negativeId = findTextNodeAlongChain(directId);
        console.log('[COMFYDBG] 沿链查找负向文本节点结果=', negativeId || '未找到');
      }
    }
    if (!negativeId) {
      negativeId = textNodeIds.find(id => /negative|负向|n$/i.test(String(apiWorkflow[id]?._meta?.title || apiWorkflow[id]?.class_type || '')));
    }
    // 正向文本节点（用于判断负向是否与正向共用 + 复用 CLIP 源）
    const positiveTextId = textNodeIds.find(id => /positive|正向|p$/i.test(String(apiWorkflow[id]?._meta?.title || ''))) || textNodeIds[0];
    // 关键修复：负向与正向共用同一文本节点（通常中间经 ConditioningZeroOut 将条件归零），
    // 说明工作流硬编码了空负向，不支持负向提示词。此时动态创建独立的负向 CLIPTextEncode 节点，
    // 复用正向 CLIP 源，注入负向提示词，并把 KSampler negative 直接改连到新节点（绕过 ConditioningZeroOut）。
    if (negativeId && negativeId === positiveTextId && ksamplerIdForNeg && negText) {
      const posClip = positiveTextId ? apiWorkflow[positiveTextId]?.inputs?.clip : undefined;
      if (posClip && Array.isArray(posClip)) {
        const negNodeId = 'neg_auto_' + Date.now();
        apiWorkflow[negNodeId] = {
          inputs: { clip: posClip, text: negText },
          class_type: 'CLIPTextEncode',
          _meta: { title: 'Negative (auto)' }
        };
        apiWorkflow[ksamplerIdForNeg].inputs.negative = [negNodeId, 0];
        negativeId = negNodeId;
        console.log('[COMFYDBG] 负向与正向共用节点(经ConditioningZeroOut归零)，动态创建独立负向节点', negNodeId, '→ KSampler', ksamplerIdForNeg, 'text=', negText.slice(0, 150));
      } else {
        console.log('[COMFYDBG] 负向与正向共用节点，但正向 CLIP 源未找到，无法创建独立负向节点，posClip=', JSON.stringify(posClip));
      }
    } else if (negativeId && apiWorkflow[negativeId]?.inputs
      && (apiWorkflow[negativeId].inputs.text === undefined || apiWorkflow[negativeId].inputs.text === null || apiWorkflow[negativeId].inputs.text === '')) {
      apiWorkflow[negativeId].inputs.text = negText;
      console.log('[COMFYDBG] 负向提示词已注入节点', negativeId, 'title=', apiWorkflow[negativeId]?._meta?.title, 'text=', negText.slice(0, 150));
    } else if (negativeId) {
      console.log('[COMFYDBG] 负向节点', negativeId, '已有 text，跳过覆盖，现有 text=', String(apiWorkflow[negativeId]?.inputs?.text || '').slice(0, 100));
    }
    // 3) KSampler negative 未连接时，动态创建负向节点并连接
    if (!negativeId && negText && ksamplerIdForNeg) {
      const ks = apiWorkflow[ksamplerIdForNeg];
      const negInput = ks?.inputs?.negative;
      if (!Array.isArray(negInput)) {
        const posClip2 = positiveTextId ? apiWorkflow[positiveTextId]?.inputs?.clip : undefined;
        if (posClip2 && Array.isArray(posClip2)) {
          const negNodeId = 'neg_auto_' + Date.now();
          apiWorkflow[negNodeId] = {
            inputs: { clip: posClip2, text: negText },
            class_type: 'CLIPTextEncode',
            _meta: { title: 'Negative (auto)' }
          };
          ks.inputs.negative = [negNodeId, 0];
          console.log('[COMFYDBG] 动态创建负向节点', negNodeId, '→ KSampler', ksamplerIdForNeg, 'negative，text=', negText.slice(0, 120));
        } else {
          console.log('[COMFYDBG] 无法动态创建负向节点：正向 CLIP 源未找到');
        }
      }
    }

    // 3.42 资产图生成（负向提示词含 background/scene/building）时自动微调 KSampler：
    // z_image_turbo 等蒸馏模型工作流默认 cfg=1/steps=8，负向提示词几乎无效；
    // cfg 微升到 1.8（避免 2.5+ 导致色彩过艳），steps 提升到 12（更多步数遵循纯白背景约束）
    const _assetCfgBoost = (negText && /background|scene|building|wall|roof|ground|environment/i.test(negText)) ? 1.8 : undefined;
    const _assetStepsBoost = (negText && /background|scene|building|wall|roof|ground|environment/i.test(negText)) ? 12 : undefined;

    // 3.45 移除纯注释/标签类节点（Label/Note/GroupNode 等，不参与计算；未安装对应自定义节点时会导致整图拒绝执行）
    const _ANNOTATION_RE = /^(note|markdownnote|reroute|groupnode|primitivenode|label)/i;
    const _removedAnnot = new Set<string>();
    for (const _nid of Object.keys(apiWorkflow)) {
      const _nd = apiWorkflow[_nid];
      if (_nd && _ANNOTATION_RE.test(String(_nd.class_type || _nd.type || ''))) {
        _removedAnnot.add(_nid);
        delete apiWorkflow[_nid];
      }
    }
    if (_removedAnnot.size > 0) {
      for (const _nid of Object.keys(apiWorkflow)) {
        const _nd = apiWorkflow[_nid];
        if (!_nd || !_nd.inputs) continue;
        for (const _k of Object.keys(_nd.inputs)) {
          const _v = _nd.inputs[_k];
          if (Array.isArray(_v) && _v.length >= 1 && _removedAnnot.has(String(_v[0]))) delete _nd.inputs[_k];
        }
      }
      console.log('[COMFYDBG] 移除纯注释节点(' + _removedAnnot.size + '):', Array.from(_removedAnnot).join(','));
    }

    // 3.5 上传参考图/参考视频到 ComfyUI，并注入到对应的加载节点（LoadImage / VHS_LoadVideo 等）
    const fetchToBuffer = async (src: string): Promise<Buffer | null> => {
      try {
        if (typeof src !== 'string' || !src) return null;
        if (src.startsWith('data:')) {
          const comma = src.indexOf(',');
          return Buffer.from(src.slice(comma + 1), 'base64');
        }
        if (/^file:\/\//i.test(src) || /^[a-zA-Z]:[\\/]/.test(src)) {
          let fp = src.replace(/^file:\/\//i, '');
          // Windows 路径：file:///C:/... 替换后变成 /C:/...，需要去掉开头的斜杠
          if (/^\/[a-zA-Z]:[\\/]/.test(fp)) fp = fp.slice(1);
          const exists = fs.existsSync(fp);
          console.log('[COMFYDBG] 读取本地文件:', fp, '存在=', exists);
          return exists ? fs.readFileSync(fp) : null;
        }
        const resp = await fetch(src);
        if (!resp.ok) return null;
        return Buffer.from(await resp.arrayBuffer());
      } catch (e) { console.log('[COMFYDBG] fetchToBuffer 失败:', (e as Error).message); return null; }
    };
    const uploadToComfy = async (buf: Buffer, filename: string): Promise<string | null> => {
      try {
        const form = new FormData();
        form.append('image', new Blob([new Uint8Array(buf)]), filename);
        form.append('overwrite', 'true');
        const up = await fetch(`${base}/upload/image`, { method: 'POST', body: form as any });
        if (!up.ok) {
          console.log('[COMFYDBG] 上传失败 HTTP', up.status, up.statusText);
          return null;
        }
        const data = await up.json().catch(() => null);
        if (!data) { console.log('[COMFYDBG] 上传响应解析失败'); return null; }
        const name = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
        console.log('[COMFYDBG] 上传成功:', name, '大小=', buf.length, 'bytes');
        return name;
      } catch (e) { console.log('[COMFYDBG] 上传异常:', (e as Error).message); return null; }
    };
    const mediaList = Array.isArray(referenceMedia) ? referenceMedia.filter((m: any) => m && m.url) : [];
    console.log('[COMFYDBG] 参考图数量:', mediaList.length, 'URL格式:', mediaList.map((m: any) => String(m.url).slice(0, 80)).join(' | '));
    if (mediaList.length > 0) {
      // 优先使用 role 指定的加载节点；否则按 class_type 启发式查找加载节点
      const heuristicImageIds: string[] = [];
      const heuristicVideoIds: string[] = [];
      const heuristicAudioIds: string[] = [];
      for (const nodeId of Object.keys(apiWorkflow)) {
        const node = apiWorkflow[nodeId];
        if (!node || typeof node !== 'object' || !node.inputs) continue;
        const ct = String(node.class_type || node.type || '');
        if (/loadvideo|vhs_loadvideo/i.test(ct) && ('video' in node.inputs || 'file' in node.inputs)) heuristicVideoIds.push(nodeId);
        else if (/loadaudio|vhs_loadaudio|av_loadaudio|load_audio/i.test(ct) && ('audio' in node.inputs || 'file' in node.inputs)) heuristicAudioIds.push(nodeId);
        else if (/loadimage/i.test(ct) && 'image' in node.inputs) heuristicImageIds.push(nodeId);
      }
      const imageTargets = roleImageTargets.length > 0
        ? roleImageTargets
        : heuristicImageIds.map(id => ({ nodeId: id, inputKey: 'image' }));
      const videoTargets = roleVideoTargets.length > 0
        ? roleVideoTargets
        : heuristicVideoIds.map(id => ({ nodeId: id, inputKey: ('video' in (apiWorkflow[id]?.inputs || {})) ? 'video' : 'file' }));
      const audioTargets = roleAudioTargets.length > 0
        ? roleAudioTargets
        : heuristicAudioIds.map(id => ({ nodeId: id, inputKey: ('audio' in (apiWorkflow[id]?.inputs || {})) ? 'audio' : 'file' }));
      let imgIdx = 0;
      let vidIdx = 0;
      let audIdx = 0;
      for (const media of mediaList) {
        const isVideo = media.kind === 'video';
        const isAudio = media.kind === 'audio';
        const ext = isVideo ? 'mp4' : isAudio ? 'mp3' : 'png';
        const buf = await fetchToBuffer(media.url);
        if (!buf) continue;
        const uploaded = await uploadToComfy(buf, `yijing_ref_${Date.now()}_${(isVideo ? vidIdx : isAudio ? audIdx : imgIdx)}.${ext}`);
        if (!uploaded) continue;
        if (isVideo) {
          const target = videoTargets[vidIdx] || videoTargets[0];
          if (target && apiWorkflow[target.nodeId]?.inputs) {
            const key = Object.prototype.hasOwnProperty.call(apiWorkflow[target.nodeId].inputs, target.inputKey)
              ? target.inputKey
              : ('video' in apiWorkflow[target.nodeId].inputs ? 'video' : 'file');
            if (!Array.isArray(apiWorkflow[target.nodeId].inputs[key])) apiWorkflow[target.nodeId].inputs[key] = uploaded;
          }
          vidIdx += 1;
        } else if (isAudio) {
          const target = audioTargets[audIdx] || audioTargets[0];
          if (target && apiWorkflow[target.nodeId]?.inputs) {
            const key = Object.prototype.hasOwnProperty.call(apiWorkflow[target.nodeId].inputs, target.inputKey)
              ? target.inputKey
              : ('audio' in apiWorkflow[target.nodeId].inputs ? 'audio' : 'file');
            if (!Array.isArray(apiWorkflow[target.nodeId].inputs[key])) apiWorkflow[target.nodeId].inputs[key] = uploaded;
          }
          audIdx += 1;
        } else {
          const target = imageTargets[imgIdx] || imageTargets[0];
          if (target && apiWorkflow[target.nodeId]?.inputs && !Array.isArray(apiWorkflow[target.nodeId].inputs[target.inputKey])) {
            apiWorkflow[target.nodeId].inputs[target.inputKey] = uploaded;
          }
          imgIdx += 1;
        }
      }
    }

    // 3.55 多余空 LoadImage 节点（未被传图的）断开输出连接（相当于UI里禁用），避免无图报错；
    // 节点本身保留不删除，下个分镜若需更多图可重新启用。每次生成从原始工作流重新解析，不影响下次。
    const _allImgIds2 = Object.keys(apiWorkflow).filter(_id => {
      const _n = apiWorkflow[_id];
      return _n && /loadimage/i.test(String(_n.class_type || _n.type || '')) && 'image' in (_n.inputs || {});
    }).sort((a, b) => Number(a) - Number(b));
    if (_allImgIds2.length > 0 && mediaList.length > 0) {
      const _imgCount2 = mediaList.filter((m: any) => m && m.url && m.kind !== 'video' && m.kind !== 'audio').length;
      const _usedCount2 = Math.min(_imgCount2, _allImgIds2.length);
      const _emptyIds = _allImgIds2.slice(_usedCount2);
      if (_emptyIds.length > 0) {
        for (const _nid of Object.keys(apiWorkflow)) {
          const _n = apiWorkflow[_nid];
          if (!_n || !_n.inputs) continue;
          for (const _k of Object.keys(_n.inputs)) {
            const _v = _n.inputs[_k];
            if (Array.isArray(_v) && _v.length >= 1 && _emptyIds.includes(String(_v[0]))) delete _n.inputs[_k];
          }
        }
        console.log('[COMFYDBG] 断开多余空LoadImage节点(' + _emptyIds.length + '，保留节点):', _emptyIds.join(','), '| 启用前' + _usedCount2 + '个用于' + _imgCount2 + '张参考图');
      }
    }

    // 3.6 从节点 options（输入框下方参数）自动注入到常见 ComfyUI 输入节点：
    //  - imageClarity/imageRatio -> EmptyLatentImage / SD3 / Flux 的 width/height/batch_size
    //  - videoClarity/videoRatio/videoDuration/generateAudio -> WanVideo / CogVideoX / HunyuanVideo / VHS_VideoCombine 等
    //  - 采样步数/CFG/种子若在 options.generationParams 中提供，也一并写入 KSampler
    // 这样 UI 上勾选/切换的参数才会真正落到 workflow 中。
    try {
      const opts: any = options || {};
      const vcRaw = opts.videoConfig || {};
      const injectHint = opts.__injectHint || {};
      const ratioToWH = (ratio: string, base: number): { w: number; h: number } | null => {
        if (!ratio || ratio === 'auto') return null;
        const m = String(ratio).match(/^(\d+(?:\.\d+)?)\s*[:xX×]\s*(\d+(?:\.\d+)?)$/);
        if (!m) return null;
        const rw = Number(m[1]); const rh = Number(m[2]);
        if (!(rw > 0) || !(rh > 0)) return null;
        let w: number, h: number;
        if (rw >= rh) { h = base; w = Math.round(base * rw / rh); }
        else { w = base; h = Math.round(base * rh / rw); }
        w = Math.max(64, Math.round(w / 8) * 8);
        h = Math.max(64, Math.round(h / 8) * 8);
        return { w, h };
      };
      const clarityToBase = (c: string): number => {
        const val = String(c || '').trim().toUpperCase();
        if (/^\d+P$/.test(val)) return parseInt(val.replace('P', ''), 10) || 1024;
        if (val === '4K') return 2048;
        if (val === '2K') return 1440;
        if (val === '1K') return 1024;
        const n = parseInt(val, 10);
        return n > 0 ? n : 1024;
      };
      const imgBase = clarityToBase(opts.imageClarity || opts.resolution || opts.size || '2K');
      const imgWH = ratioToWH(opts.imageRatio || opts.aspectRatio || '', imgBase);
      // 视频节点判定：优先 store 层写入的 __injectHint.isVideo，否则回退到 videoConfig 是否存在
      const isVideoNode = !!injectHint.isVideo
        || !!(vcRaw && (vcRaw.ratio || vcRaw.clarity || vcRaw.duration || vcRaw.generateAudio !== undefined || vcRaw.cameraMovement || vcRaw.fps));
      const vidBase = clarityToBase(vcRaw.clarity || opts.videoClarity || (isVideoNode ? '720P' : '2K'));
      const vidWH = ratioToWH(vcRaw.ratio || opts.videoRatio || (isVideoNode ? '16:9' : ''), vidBase);
      const fps = Number(vcRaw.fps || opts.fps || opts.videoFps || (isVideoNode ? 24 : 0)) || (isVideoNode ? 24 : 0);
      const durationSec = Number(vcRaw.duration || opts.videoDuration || 0) || 0;
      let frameCount = 0;
      if (isVideoNode) {
        if (durationSec > 0 && fps > 0) frameCount = Math.max(1, Math.round(durationSec * fps));
        else if (Number(vcRaw.frames) > 0) frameCount = Math.max(1, Math.round(Number(vcRaw.frames)));
        else if (Number(opts.numFrames) > 0) frameCount = Math.max(1, Math.round(Number(opts.numFrames)));
        else frameCount = 16;
      }
      const numberOfImages = Number(opts.numberOfImages || opts.batchSize || opts.n || 1) || 1;
      const genAudio = vcRaw.generateAudio !== undefined ? !!vcRaw.generateAudio : (opts.generateAudio !== undefined ? !!opts.generateAudio : undefined);
      const gp: any = opts.generationParams || {};
      const seedRaw: any = gp.seed ?? opts.seed;
      const stepsRaw: any = gp.steps ?? opts.steps;
      const cfgRaw: any = gp.cfg ?? opts.cfg ?? gp.guidance ?? opts.guidance;
      const sampler: any = gp.sampler ?? opts.sampler;
      const scheduler: any = gp.scheduler ?? opts.scheduler;
      const denoise: any = gp.denoise ?? opts.denoise;

      const setIf = (inputs: any, key: string, val: any) => {
        if (val === undefined || val === null || val === '') return;
        if (!inputs || !Object.prototype.hasOwnProperty.call(inputs, key)) return;
        if (Array.isArray(inputs[key])) return;
        inputs[key] = val;
      };
      const setAny = (inputs: any, keys: string[], val: any) => { for (const k of keys) setIf(inputs, k, val); };

      for (const nid of Object.keys(apiWorkflow)) {
        const nd = apiWorkflow[nid];
        if (!nd || typeof nd !== 'object' || !nd.inputs) continue;
        const ct = String(nd.class_type || nd.type || '');
        const inputs: any = nd.inputs;

        if (/^EmptyLatentImage$|^EmptySD3LatentImage$|^EmptyImage$|^EmptyLatentAudio$/i.test(ct)) {
          const wh = isVideoNode ? (vidWH || imgWH) : (imgWH || vidWH);
          if (wh) { setIf(inputs, 'width', wh.w); setIf(inputs, 'height', wh.h); }
          if (isVideoNode && frameCount > 0) setIf(inputs, 'batch_size', frameCount);
          else setIf(inputs, 'batch_size', numberOfImages);
        }
        if (/EmptyHunyuanLatentVideo|WanVideoEmptyLatent|EmptyMochiLatent|CosmosLatent|LTXVEmpty|EmptyLTXV|EmptyCogVideoXLatent/i.test(ct)) {
          if (vidWH) { setIf(inputs, 'width', vidWH.w); setIf(inputs, 'height', vidWH.h); }
          if (frameCount > 0) setAny(inputs, ['length', 'num_frames', 'frames', 'video_length'], frameCount);
          if (fps > 0) setAny(inputs, ['fps', 'frame_rate'], fps);
        }
        if (/^WanVideo/i.test(ct)) {
          if (vidWH) { setIf(inputs, 'width', vidWH.w); setIf(inputs, 'height', vidWH.h); }
          if (frameCount > 0) setAny(inputs, ['num_frames', 'length', 'frames'], frameCount);
          if (fps > 0) setAny(inputs, ['fps', 'frame_rate'], fps);
          setIf(inputs, 'seed', typeof seedRaw === 'string' ? Number(seedRaw) : seedRaw);
          setIf(inputs, 'steps', typeof stepsRaw === 'string' ? Number(stepsRaw) : stepsRaw);
          setIf(inputs, 'cfg', typeof cfgRaw === 'string' ? Number(cfgRaw) : cfgRaw);
          setIf(inputs, 'scheduler', scheduler);
        }
        if (/^CogVideo/i.test(ct)) {
          if (vidWH) { setIf(inputs, 'width', vidWH.w); setIf(inputs, 'height', vidWH.h); }
          if (frameCount > 0) setAny(inputs, ['num_frames', 'video_length', 'length', 'frames'], frameCount);
          if (fps > 0) setAny(inputs, ['fps', 'frame_rate'], fps);
          setIf(inputs, 'seed', typeof seedRaw === 'string' ? Number(seedRaw) : seedRaw);
          setIf(inputs, 'steps', typeof stepsRaw === 'string' ? Number(stepsRaw) : stepsRaw);
          setIf(inputs, 'cfg', typeof cfgRaw === 'string' ? Number(cfgRaw) : cfgRaw);
        }
        if (/HunyuanVideo|Hunyuan_Video|HYVideoSampler|HYVideoDecode/i.test(ct)) {
          if (vidWH) { setIf(inputs, 'width', vidWH.w); setIf(inputs, 'height', vidWH.h); }
          if (frameCount > 0) setAny(inputs, ['num_frames', 'length', 'frames', 'video_length'], frameCount);
          if (fps > 0) setAny(inputs, ['fps', 'frame_rate'], fps);
          setIf(inputs, 'seed', typeof seedRaw === 'string' ? Number(seedRaw) : seedRaw);
          setIf(inputs, 'steps', typeof stepsRaw === 'string' ? Number(stepsRaw) : stepsRaw);
        }
        if (/SVD_img2vid_Conditioning/i.test(ct)) {
          if (vidWH) { setIf(inputs, 'width', vidWH.w); setIf(inputs, 'height', vidWH.h); }
          if (frameCount > 0) setIf(inputs, 'video_frames', frameCount);
          if (fps > 0) setIf(inputs, 'fps', fps);
        }
        if (/^ADE_AnimateDiffUniformContextOptions$/i.test(ct)) {
          if (frameCount >= 16) setIf(inputs, 'context_length', 16);
        }
        if (/KSampler|SamplerCustom/i.test(ct)) {
          setIf(inputs, 'seed', typeof seedRaw === 'string' ? Number(seedRaw) : seedRaw);
          setIf(inputs, 'noise_seed', typeof seedRaw === 'string' ? Number(seedRaw) : seedRaw);
          setIf(inputs, 'steps', typeof stepsRaw === 'string' ? Number(stepsRaw) : stepsRaw);
          setIf(inputs, 'cfg', typeof cfgRaw === 'string' ? Number(cfgRaw) : cfgRaw);
          setIf(inputs, 'sampler_name', sampler);
          setIf(inputs, 'scheduler', scheduler);
          setIf(inputs, 'denoise', typeof denoise === 'string' ? Number(denoise) : denoise);
          // 资产图生成自动提升 cfg（蒸馏模型 cfg=1 时负向提示词几乎无效）
          if (_assetCfgBoost && (inputs.cfg === undefined || Number(inputs.cfg) < 2)) {
            const _oldCfg = inputs.cfg;
            inputs.cfg = _assetCfgBoost;
            console.log('[COMFYDBG] 资产图生成自动提升 cfg:', _oldCfg, '→', _assetCfgBoost, '(节点', nid, ')');
          }
          // 资产图生成自动提升 steps（更多步数遵循纯白背景约束）
          if (_assetStepsBoost && (inputs.steps === undefined || Number(inputs.steps) < 10)) {
            const _oldSteps = inputs.steps;
            inputs.steps = _assetStepsBoost;
            console.log('[COMFYDBG] 资产图生成自动提升 steps:', _oldSteps, '→', _assetStepsBoost, '(节点', nid, ')');
          }
        }
        if (/VideoCombine|SaveAnimatedWEBP|SaveAnimatedPNG|CreateVideo|SaveVideo|VHS_VideoCombine/i.test(ct)) {
          if (fps > 0) { setIf(inputs, 'frame_rate', fps); setIf(inputs, 'fps', fps); }
          if (genAudio === false) {
            setIf(inputs, 'audio', ''); setIf(inputs, 'save_audio', false);
          }
        }
        if (/Length|FrameCount|VideoLength/i.test(ct) && frameCount > 0) {
          setAny(inputs, ['length', 'frames', 'num_frames', 'video_length'], frameCount);
        }
      }
    } catch (paramErr) {
      console.warn('[comfyui:generate] auto-inject params failed', paramErr);
    }

    console.log('[COMFYDBG] === POST-INJECTION apiWorkflow snapshot ===');
    console.log('[COMFYDBG] node ids:', Object.keys(apiWorkflow));
    for (const _nid of Object.keys(apiWorkflow)) {
      const _nd = apiWorkflow[_nid];
      const _ct = String(_nd?.class_type || '');
      if (/CLIPTextEncode/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) title=${_nd?._meta?.title} text=`, JSON.stringify(String(_nd?.inputs?.text || '').slice(0, 300)));
      } else if (/EmptySD3LatentImage|EmptyLatentImage|EmptyImage/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) width=`, _nd?.inputs?.width, 'height=', _nd?.inputs?.height, 'batch_size=', _nd?.inputs?.batch_size);
      } else if (/KSampler/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) steps=`, _nd?.inputs?.steps, 'cfg=', _nd?.inputs?.cfg, 'seed=', _nd?.inputs?.seed, 'sampler=', _nd?.inputs?.sampler_name, 'scheduler=', _nd?.inputs?.scheduler);
      } else if (/ResolutionSelector/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) inputs=`, JSON.stringify(_nd?.inputs));
      } else if (/SaveImageAdvanced|SaveImage/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) filename_prefix=`, _nd?.inputs?.filename_prefix);
      } else if (/UNETLoader|CLIPLoader|VAELoader/i.test(_ct)) {
        console.log(`[COMFYDBG] node ${_nid} (${_ct}) unet_name=`, _nd?.inputs?.unet_name, 'clip_name=', _nd?.inputs?.clip_name, 'vae_name=', _nd?.inputs?.vae_name);
      }
    }

    // 4. 提交执行
    const clientId = `yijing_${Date.now()}`;
    const response = await fetch(`${base}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: apiWorkflow,
        client_id: clientId
      })
    });

    // ComfyUI 校验失败时返回 400，并带 node_errors / error 详情，需回传给用户便于排查
    const submitData = await response.json().catch(() => null);
    console.log('[COMFYDBG] === /prompt RESPONSE ===');
    console.log('[COMFYDBG] HTTP status:', response.status, response.statusText);
    console.log('[COMFYDBG] response body:', JSON.stringify(submitData));
    if (!response.ok) {
      let msg = submitData?.error?.message || submitData?.error || `HTTP ${response.status}`;
      const nodeErrors = submitData?.node_errors;
      if (nodeErrors && typeof nodeErrors === 'object' && Object.keys(nodeErrors).length > 0) {
        const detail = Object.entries(nodeErrors)
          .map(([nid, err]: any) => `节点 ${nid}: ${(err?.errors || []).map((e: any) => e?.message || '').join('; ') || JSON.stringify(err)}`)
          .join(' | ');
        msg = `工作流校验失败：${detail}`;
      }
      return { ok: false, error: String(msg) };
    }

    // ComfyUI 会返回它自己生成的 prompt_id，必须用它来查询 history / queue
    const jobId = submitData?.prompt_id;
    if (!jobId) {
      return { ok: false, error: '提交成功但未返回 prompt_id，无法追踪任务' };
    }

    // 5. 等待执行完成并获取结果：轮询 history，同时结合 queue 判断任务是否仍在排队/执行
    // 复杂工作流（含放大、多采样）可能耗时数分钟，这里放宽到最多 10 分钟，
    // 且只有在「history 无结果」且「queue 中也查不到该任务」时才判定失败，避免过早超时。
    let outputs: any = null;
    let lastError = '';
    const maxAttempts = 1800; // 1800 * 1s = 30 分钟（云端生成大视频可能需要更长时间）
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const historyResponse = await fetch(`${base}/history/${jobId}`);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          const entry = historyData?.[jobId];
          if (entry?.outputs && Object.keys(entry.outputs).length > 0) {
            outputs = entry.outputs;
            console.log('[COMFYDBG] 任务完成，outputs节点:', Object.keys(outputs));
            for (const nid in outputs) {
              console.log('[COMFYDBG] 节点', nid, '输出keys:', Object.keys(outputs[nid]));
              for (const k of Object.keys(outputs[nid])) {
                const arr = outputs[nid][k];
                if (Array.isArray(arr)) {
                  console.log('[COMFYDBG]   ', k, '数量:', arr.length, '首个:', JSON.stringify(arr[0]).slice(0, 150));
                }
              }
            }
            break;
          }
          // 任务已完成但报错（status.status_str === 'error'）
          const statusStr = entry?.status?.status_str;
          if (statusStr === 'error') {
            const messages = entry?.status?.messages || [];
            const errMsg = messages
              .filter((m: any) => Array.isArray(m) && m[0] === 'execution_error')
              .map((m: any) => m[1]?.exception_message || m[1]?.exception_type || '')
              .join('; ');
            lastError = errMsg || '工作流执行报错';
            break;
          }
        }
      } catch (e) {
        // 网络抖动，继续等待
      }
    }

    if (!outputs) {
      return { ok: false, error: lastError || `执行超时（等待超过 ${maxAttempts} 秒仍未返回结果）` };
    }
    
    // 6. 处理输出文件（图片 / 视频 / gif / 音频）——统一下载到本地后返回本地路径
    const files: string[] = [];
    const videoFiles: string[] = [];
    const audioFiles: string[] = [];
    const remoteUrls: string[] = [];
    const buildViewUrl = (item: any) => {
      const filename = item.filename || item.name;
      const subfolder = item.subfolder || '';
      return `${base}/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=${item.type || 'output'}`;
    };
    const isVideoName = (name: string) => /\.(mp4|webm|mov|mkv|avi|gif)$/i.test(String(name || ''));
    const isAudioName = (name: string) => /\.(mp3|wav|m4a|aac|flac|ogg)$/i.test(String(name || ''));
    // 下载远程结果到本地 assets 目录，返回本地绝对路径；失败时回退远程 URL
    const assetsDir = path.join(app.getPath('userData'), 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    const downloadToLocal = async (remoteUrl: string, srcName: string): Promise<string> => {
      remoteUrls.push(remoteUrl);
      try {
        const r2 = await fetch(remoteUrl);
        if (!r2.ok) return remoteUrl;
        const buffer = Buffer.from(await r2.arrayBuffer());
        let ext = path.parse(String(srcName || '')).ext || '';
        if (!ext) {
          const ct = r2.headers.get('content-type') || '';
          if (ct.includes('image/png')) ext = '.png';
          else if (ct.includes('image/jpeg')) ext = '.jpg';
          else if (ct.includes('image/webp')) ext = '.webp';
          else if (ct.includes('video/mp4')) ext = '.mp4';
          else if (ct.includes('video/webm')) ext = '.webm';
          else if (ct.includes('audio/mpeg')) ext = '.mp3';
          else if (ct.includes('audio/wav')) ext = '.wav';
        }
        const fname = `comfyui_${jobId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const fpath = path.join(assetsDir, fname);
        fs.writeFileSync(fpath, buffer);
        return fpath;
      } catch (e) {
        console.error('comfyui download error', e);
        return remoteUrl;
      }
    };
    for (const nodeId in outputs) {
      const nodeOutput = outputs[nodeId] || {};
      console.log('[COMFYDBG] 处理节点', nodeId, '输出:', Object.keys(nodeOutput));
      // 图片输出（部分自定义节点会把 gif/webm 也放进 images / gifs 字段）
      for (const item of [...(nodeOutput.images || []), ...(nodeOutput.gifs || [])]) {
        const name = item.filename || item.name || '';
        console.log('[COMFYDBG]   处理文件:', name, 'isVideo:', isVideoName(name), 'isAudio:', isAudioName(name));
        const local = await downloadToLocal(buildViewUrl(item), name);
        console.log('[COMFYDBG]   下载结果:', local ? local.slice(0, 80) : 'null');
        if (isVideoName(name)) videoFiles.push(local);
        else if (isAudioName(name)) audioFiles.push(local);
        else files.push(local);
      }
      // 视频输出（VHS_VideoCombine 等的 videos 字段）
      for (const item of (nodeOutput.videos || [])) {
        const name = item.filename || item.name || '';
        videoFiles.push(await downloadToLocal(buildViewUrl(item), name));
      }
      // 音频输出
      for (const item of (nodeOutput.audio || [])) {
        const name = item.filename || item.name || '';
        audioFiles.push(await downloadToLocal(buildViewUrl(item), name));
      }
    }
    // 返回首个可用结果作为 url，供渲染层直接生成对应类型的结果节点
    const primaryUrl = videoFiles[0] || files[0] || audioFiles[0] || '';
    console.log('[COMFYDBG] 结果返回: videoFiles=', videoFiles.length, 'files=', files.length, 'audioFiles=', audioFiles.length);
    console.log('[COMFYDBG] primaryUrl:', primaryUrl ? primaryUrl.slice(0, 100) : '空');
    return { ok: true, jobId, outputs, files, videoFiles, audioFiles, url: primaryUrl, remoteUrls };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Save ComfyUI workflow file
ipcMain.handle('comfyui:saveWorkflow', async (_event, config: any) => {
  const { configId, workflowName, workflowContent } = config || {};
  if (!configId || !workflowName || !workflowContent) {
    return { ok: false, error: '缺少必要参数' };
  }
  
  try {
    // 保存工作流文件到 userData/comfyui-workflows 目录
    const workflowDir = path.join(app.getPath('userData'), 'comfyui-workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    
    const fileName = `${workflowName}.json`;
    const filePath = path.join(workflowDir, fileName);
    fs.writeFileSync(filePath, workflowContent, 'utf-8');
    
    return { ok: true, fileName, filePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Select and import ComfyUI workflow file
ipcMain.handle('comfyui:selectWorkflowFile', async (_event) => {
  try {
    const result: any = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 ComfyUI 工作流文件',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    
    if (result.canceled || !result.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    
    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath, '.json');
    const workflowContent = fs.readFileSync(filePath, 'utf-8');
    
    // 保存到 userData/comfyui-workflows/ 目录
    const workflowDir = path.join(app.getPath('userData'), 'comfyui-workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    
    const savePath = path.join(workflowDir, `${fileName}.json`);
    fs.writeFileSync(savePath, workflowContent, 'utf-8');
    
    return { ok: true, workflowName: fileName, filePath: savePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Generic third-party request proxy
ipcMain.handle('thirdparty:request', async (_event, opts: any) => {
  try {
    const { method = 'GET', url, headers = {}, body } = opts;
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const contentType = response.headers.get('content-type') || '';
    let data: any;
    if (contentType.includes('application/json')) data = await response.json();
    else data = await response.text();
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Canvas storage helpers
ipcMain.handle('canvas:save', async (_event, data: string) => {
  try {
    const dir = path.join(app.getPath('userData'), 'canvases');
    fs.mkdirSync(dir, { recursive: true });
    const filename = `canvas_${Date.now()}.json`;
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, data, 'utf-8');
    return { ok: true, path: filePath };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('canvas:list', async () => {
  try {
    const dir = path.join(app.getPath('userData'), 'canvases');
    if (!fs.existsSync(dir)) return { ok: true, files: [] };
    const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('canvas:load', async (_event, filePath: string) => {
  try {
    // 安全校验：确保加载的画布文件在 canvases 目录内，防止路径遍历
    const canvasesDir = path.resolve(app.getPath('userData'), 'canvases');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(canvasesDir + path.sep)) {
      return { ok: false, error: '路径越界：只能加载 canvases 目录内的画布文件' };
    }
    if (!fs.existsSync(resolvedPath)) return { ok: false, error: 'file-not-found' };
    const data = fs.readFileSync(resolvedPath, 'utf-8');
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Memory file system operations
// 安全路径校验：防止路径遍历攻击（如 ../../etc/passwd）
const safeMemoryPath = (relativePath: string): string => {
  const userDataDir = path.resolve(app.getPath('userData'));
  const fullPath = path.resolve(userDataDir, relativePath);
  // 确保解析后的路径仍在 userData 目录内
  if (fullPath !== userDataDir && !fullPath.startsWith(userDataDir + path.sep)) {
    throw new Error('路径越界：禁止访问 userData 目录之外的文件');
  }
  return fullPath;
};

ipcMain.handle('memory:writeFile', async (_event, filePath: string, content: string) => {
  try {
    const fullPath = safeMemoryPath(filePath);
    await fs.promises.writeFile(fullPath, content, 'utf-8');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('memory:readFile', async (_event, filePath: string) => {
  try {
    const fullPath = safeMemoryPath(filePath);
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    return { ok: true, content };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true, content: null }; // File doesn't exist, not an error
    }
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('memory:deleteFile', async (_event, filePath: string) => {
  try {
    const fullPath = safeMemoryPath(filePath);
    await fs.promises.unlink(fullPath);
    return { ok: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ok: true }; // File doesn't exist, not an error
    }
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('memory:listFiles', async (_event, dirPath: string) => {
  try {
    const fullPath = safeMemoryPath(dirPath);
    if (!fs.existsSync(fullPath)) {
      return { ok: true, files: [] };
    }
    const files = await fs.promises.readdir(fullPath);
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

ipcMain.handle('memory:ensureDir', async (_event, dirPath: string) => {
  try {
    const fullPath = safeMemoryPath(dirPath);
    await fs.promises.mkdir(fullPath, { recursive: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
});

// IPC: Window controls
const getWindowFromIpcEvent = (event: Electron.IpcMainInvokeEvent) => {
  return BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getFocusedWindow();
};

ipcMain.handle('window:minimize', async (event) => {
  const w = getWindowFromIpcEvent(event);
  if (!w) return { ok: false, error: 'window-not-found' };
  w.minimize();
  return { ok: true };
});

ipcMain.handle('window:maximize', async (event) => {
  const w = getWindowFromIpcEvent(event);
  if (!w) return { ok: false, error: 'window-not-found' };
  if (w.isMaximized()) {
    w.unmaximize();
  } else {
    w.maximize();
  }
  return { ok: true, maximized: w.isMaximized() };
});

ipcMain.handle('window:close', async (event) => {
  const w = getWindowFromIpcEvent(event);
  if (!w) return { ok: false, error: 'window-not-found' };
  w.close();
  return { ok: true };
});

// ════════════════════════════════════════════════════════
// 机器码 & 激活码系统
// ════════════════════════════════════════════════════════

// 默认后台地址（用于机器码上报 / 在线校验）
const LICENSE_SERVER_URL = 'https://www.yjai.top';

// 上报机器码到后台管理（best-effort：不阻塞、不抛错、离线自动忽略）
// 调用后台 /api/license/check-trial，后台会把机器码写入 licenses 表，
// 从而保证每台安装的设备都会自动出现在后台管理里。
let lastReportedMachineCode: string | null = null;
async function reportMachineCodeToServer(machineCode: string, serverUrl?: string): Promise<void> {
  if (!machineCode) return;
  // 同一次运行内同一机器码只上报一次，避免频繁请求
  if (lastReportedMachineCode === machineCode) return;
  lastReportedMachineCode = machineCode;
  const base = serverUrl || LICENSE_SERVER_URL;
  try {
    await fetch(`${base}/api/license/check-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineCode }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 离线或后台不可用时静默忽略，允许下次启动再次尝试
    lastReportedMachineCode = null;
  }
}

// 生成机器码（基于硬件信息）
ipcMain.handle('license:getMachineCode', async () => {
  const userDataPath = app.getPath('userData');
  const licenseFile = path.join(userDataPath, 'license.json');
  
  let machineCode: string | null = null;
  let existingData: any = {};
  
  // 如果已保存，直接读取
  if (fs.existsSync(licenseFile)) {
    try {
      existingData = JSON.parse(fs.readFileSync(licenseFile, 'utf-8'));
      if (existingData.machineCode) machineCode = existingData.machineCode;
    } catch { /* ignore */ }
  }
  
  // 未生成过则生成机器码
  if (!machineCode) {
    const raw = [
      os.hostname(),
      os.arch(),
      os.platform(),
      os.cpus()[0]?.model || 'unknown',
      (os as any).machine ? (os as any).machine() : 'pc',
    ].join('|');
    machineCode = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16).toUpperCase();
    
    // 保存
    try {
      existingData.machineCode = machineCode;
      fs.writeFileSync(licenseFile, JSON.stringify(existingData, null, 2));
    } catch { /* ignore */ }
  }
  
  // 启动时自动上报机器码到后台（不阻塞返回）
  void reportMachineCodeToServer(machineCode, existingData.serverUrl);
  
  return machineCode;
});

// 本地激活验证（HMAC 算法）
ipcMain.handle('license:validate', async (_event, activationCode: string, machineCode: string) => {
  if (!activationCode || !machineCode) return { valid: false, error: '缺少参数' };
  
  const userDataPath = app.getPath('userData');
  const licenseFile = path.join(userDataPath, 'license.json');
  let existingData: any = {};
  try {
    if (fs.existsSync(licenseFile)) {
      existingData = JSON.parse(fs.readFileSync(licenseFile, 'utf-8'));
    }
  } catch { /* ignore */ }

  // 后台是激活时长的唯一来源。普通码也优先在线校验，确保续期后的真实到期日
  // 能立即同步到客户端，而不是仍按默认 15 天显示。
  try {
    const serverUrl = (existingData.serverUrl || LICENSE_SERVER_URL).replace(/\/$/, '');
    const response = await fetch(`${serverUrl}/api/license/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activationCode, machineCode }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.valid && data.expiresAt) {
        existingData.activated = true;
        existingData.activationCode = activationCode;
        existingData.activatedAt = data.activatedAt || existingData.activatedAt || new Date().toISOString();
        existingData.expiresAt = data.expiresAt;
        existingData.durationDays = data.durationDays;
        existingData.machineCode = machineCode;
        fs.writeFileSync(licenseFile, JSON.stringify(existingData, null, 2));
        return {
          valid: true,
          expiresAt: data.expiresAt,
          daysLeft: Math.max(0, Number(data.daysLeft) || 0),
          durationDays: data.durationDays,
        };
      }
      // 联网且后台明确拒绝时，不再回退到本地算法绕过禁用或延期状态。
      if (data && data.valid === false) return { valid: false, error: data.error || '激活码无效或已过期' };
    }
  } catch {
    // 离线时继续使用下方本地签名校验，保证已发出的普通码仍可离线激活。
  }
  
  // === 特殊激活码（不绑定机器码） ===
  if (activationCode.startsWith('SP-') || activationCode.startsWith('sp-')) {
    // 特殊码本地无法完全验证，尝试在线验证
    try {
      const serverUrl = existingData.serverUrl || 'https://www.yjai.top';
      const r = await fetch(`${serverUrl}/api/license/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationCode, machineCode }),
        signal: AbortSignal.timeout(5000),
      });
      const d = await r.json();
      if (d.valid) {
        existingData.activated = true;
        existingData.activationCode = activationCode;
        existingData.activatedAt = d.activatedAt || new Date().toISOString();
        existingData.expiresAt = d.expiresAt;
        existingData.machineCode = machineCode;
        fs.writeFileSync(licenseFile, JSON.stringify(existingData, null, 2));
        return { valid: true, expiresAt: d.expiresAt, daysLeft: d.daysLeft };
      }
      return { valid: false, error: d.error || '激活码无效或已过期' };
    } catch (e: any) {
      return { valid: false, error: '特殊激活码需联网验证，请确保网络连接' };
    }
  }
  
  // === 普通激活码：HMAC 本地验证 ===
  // 格式：XXXXXXXX-YYYYYYYYYY-ZZZZZZZZ 其中 X=机器码前缀, Y=到期时间(36进制), Z=签名
  const parts = activationCode.split('-');
  if (parts.length !== 3) return { valid: false, error: '激活码格式错误' };
  
  const [codePrefix, expiry36, signature] = parts;
  // 机器码必须匹配（前8位或全部）
  if (!machineCode.startsWith(codePrefix) && codePrefix !== machineCode.substring(0, 8)) {
    return { valid: false, error: '激活码不匹配此设备' };
  }
  
  // 验证签名
  const expiryTimestamp = parseInt(expiry36, 36);
  if (isNaN(expiryTimestamp)) return { valid: false, error: '激活码格式错误' };
  
  const secret = 'YIJING_AI_2024_SECRET';
  const expectedSig = crypto.createHash('sha256').update(`${machineCode}|${expiryTimestamp}|${secret}`).digest('hex').substring(0, 8).toUpperCase();
  if (signature !== expectedSig) return { valid: false, error: '激活码无效' };
  
  // 检查到期
  const now = Date.now();
  const expiresMs = expiryTimestamp * 1000;
  if (expiresMs <= now) return { valid: false, error: '激活码已过期' };
  
  // 保存激活状态
  existingData.activated = true;
  existingData.activationCode = activationCode;
  existingData.activatedAt = existingData.activatedAt || new Date().toISOString();
  existingData.expiresAt = new Date(expiresMs).toISOString();
  existingData.machineCode = machineCode;
  fs.writeFileSync(licenseFile, JSON.stringify(existingData, null, 2));
  
  const daysLeft = Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24));
  return { valid: true, expiresAt: existingData.expiresAt, daysLeft: Math.max(0, daysLeft) };
});

// 获取试用/激活信息
ipcMain.handle('license:getInfo', async (_event, machineCode: string) => {
  const userDataPath = app.getPath('userData');
  const licenseFile = path.join(userDataPath, 'license.json');

  let data: any = {};
  try {
    if (fs.existsSync(licenseFile)) {
      data = JSON.parse(fs.readFileSync(licenseFile, 'utf-8'));
    }
  } catch { /* ignore */ }

  // === 优先以后台为准（跨重装/升级保持机器码与试用/激活时长一致） ===
  // 后台按机器码持久化存储试用起始时间与激活信息；即使本地 license.json
  // 被卸载清除，只要机器码相同，后台仍返回之前的剩余时长，绝不重置。
  if (machineCode) {
    try {
      const base = (data.serverUrl || LICENSE_SERVER_URL).replace(/\/$/, '');
      const r = await fetch(`${base}/api/license/check-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machineCode }),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const s = await r.json();
        // 【SP 特殊码】不绑定机器码，后台按机器码查不到激活记录，check-trial 恒返回试用/过期。
        // 本地已用 SP 码激活且未过期时，以本地激活为准，避免被后台试用状态覆盖。
        const isSpActivated =
          data.activated && data.expiresAt &&
          new Date(data.expiresAt).getTime() > Date.now() &&
          String(data.activationCode || '').toUpperCase().startsWith('SP-');
        if (isSpActivated) {
          return {
            status: 'activated',
            machineCode,
            activationCode: data.activationCode,
            activatedAt: data.activatedAt,
            expiresAt: data.expiresAt,
            daysLeft: Math.ceil((new Date(data.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
          };
        }
        // 后台已激活（付费）
        if (s.status === 'activated' && s.expiresAt) {
          data.activated = true;
          data.machineCode = machineCode;
          data.expiresAt = s.expiresAt;
          data.activatedAt = data.activatedAt || new Date().toISOString();
          try { fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
          return {
            status: 'activated',
            machineCode,
            activationCode: data.activationCode,
            activatedAt: data.activatedAt,
            expiresAt: s.expiresAt,
            daysLeft: Math.max(0, s.daysLeft ?? 0),
          };
        }
        // 后台试用中：以后台的到期时间为准，回写本地缓存
        if (s.status === 'trial' && s.expiresAt) {
          data.machineCode = machineCode;
          data.trialExpiresAt = s.expiresAt;
          data.trialStartedAt = data.trialStartedAt || new Date().toISOString();
          try { fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
          return {
            status: 'trial',
            machineCode,
            daysLeft: Math.max(0, s.daysLeft ?? 0),
            expiresAt: s.expiresAt,
            trialStartedAt: data.trialStartedAt,
          };
        }
        // 后台判定已过期
        if (s.status === 'expired') {
          data.machineCode = machineCode;
          if (s.expiresAt) data.trialExpiresAt = s.expiresAt;
          try { fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2)); } catch { /* ignore */ }
          return {
            status: 'expired',
            machineCode,
            daysLeft: 0,
            expiresAt: data.trialExpiresAt,
            message: s.message || '试用已过期，请输入激活码',
          };
        }
      }
    } catch {
      // 离线或后台不可用：回退到本地缓存逻辑，保证离线可用
    }
  }

  // 如果已激活，直接返回
  if (data.activated && data.expiresAt) {
    const expiresMs = new Date(data.expiresAt).getTime();
    const now = Date.now();
    if (expiresMs > now) {
      return {
        status: 'activated',
        machineCode: data.machineCode,
        activationCode: data.activationCode,
        activatedAt: data.activatedAt,
        expiresAt: data.expiresAt,
        daysLeft: Math.ceil((expiresMs - now) / (1000 * 60 * 60 * 24)),
      };
    }
    // 激活过期，重置
    data.activated = false;
    data.activationCode = undefined;
    fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2));
  }
  
  // 试用逻辑
  const TRIAL_DAYS = 15;
  const now = Date.now();
  
  if (!data.trialStartedAt) {
    // 第一启动，开始试用
    data.trialStartedAt = new Date().toISOString();
    data.trialExpiresAt = new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    data.machineCode = machineCode;
    fs.writeFileSync(licenseFile, JSON.stringify(data, null, 2));
  }
  
  const trialExpiresMs = new Date(data.trialExpiresAt || data.trialStartedAt).getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000;
  
  if (trialExpiresMs <= now) {
    return {
      status: 'expired',
      machineCode,
      daysLeft: 0,
      expiresAt: data.trialExpiresAt,
      message: '试用已过期，请输入激活码',
    };
  }
  
  return {
    status: 'trial',
    machineCode,
    daysLeft: Math.min(TRIAL_DAYS, Math.ceil((trialExpiresMs - now) / (1000 * 60 * 60 * 24))),
    expiresAt: data.trialExpiresAt,
    trialStartedAt: data.trialStartedAt,
  };
});

app.whenReady().then(() => {
  // 清理缓存应在 app 就绪后执行
  try { session.defaultSession.clearCache(); } catch (e) { console.warn('clearCache failed', e); }

  // webSecurity=true 下，为渲染进程直连的第三方 API 注入宽松 CORS 响应头，
  // 避免因目标服务未返回 Access-Control-Allow-Origin 而被浏览器拦截。
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers: any = { ...(details.responseHeaders || {}) };
      const setHeader = (name: string, value: string) => {
        const existing = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
        if (existing) delete headers[existing];
        headers[name] = [value];
      };
      setHeader('Access-Control-Allow-Origin', '*');
      setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
      setHeader('Access-Control-Allow-Headers', '*');
      callback({ responseHeaders: headers });
    });
  } catch (e) { console.warn('[Main] onHeadersReceived setup failed', e); }
  
  // 注册 Short Video Factory IPC 处理器
  registerShortVideoFactoryIPC();
  
  createWindow();

  // 启动后自动检查更新（延迟3秒，避免影响启动速度），发现新版本时通知渲染层弹窗提醒
  setTimeout(async () => {
    try {
      const manifest = await fetchLatestManifest();
      const latestVersion = String(manifest?.version || '').replace(/^v/, '');
      const currentVersion = app.getVersion();
      const asset = selectInstallerAsset(manifest);
      if (/^\d+\.\d+\.\d+$/.test(latestVersion) && asset?.fileName && asset?.sha256 && isAllowedReleaseUrl(asset.url) && compareVersions(latestVersion, currentVersion) > 0) {
        console.log('[Main] 发现新版本 v' + latestVersion + '，通知渲染层弹窗提醒');
        safeSend('system:updateAvailable', {
          hasUpdate: true,
          currentVersion,
          latestVersion,
          releaseName: '艺镜 AI 无限画布',
          releaseNotes: manifest?.notes || '',
          publishDate: manifest?.publishedAt || '',
          downloadUrl: asset?.url || '',
          fileName: asset?.fileName || '',
          fileSize: asset?.size || 0,
        });
      }
    } catch (e) {
      console.warn('[Main] 自动检查更新失败:', (e as Error)?.message || String(e));
    }
  }, 3000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Disable GPU compositing to fix rendering issues on some systems,
// but keep a software WebGL fallback (SwiftShader) so Three.js based
// nodes (3D 导演台 / 720° 全景图) can still create a WebGL context.
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
// Allow software WebGL via ANGLE + SwiftShader so WebGLRenderer works
// even when hardware acceleration is unavailable/disabled.
app.commandLine.appendSwitch('use-gl', 'angle');
app.commandLine.appendSwitch('use-angle', 'swiftshader');
app.commandLine.appendSwitch('enable-unsafe-swiftshader');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-d3d11');
// 禁用所有缓存确保开发模式代码更新生效
app.commandLine.appendSwitch('disable-background-networking');


