import { AINodeType } from '../store/appStore';

// ComfyUI 能力画像（由主进程抓取 /object_info 汇总而来）
export interface ComfyCapability {
  ok: boolean;
  error?: string;
  nodeTypes: string[];
  nodeSet: Set<string>;
  models: {
    checkpoints: string[]; loras: string[]; vaes: string[]; controlnets: string[];
    upscalers: string[]; clip_visions: string[]; unets: string[];
  };
}

const EMPTY_MODELS = { checkpoints: [], loras: [], vaes: [], controlnets: [], upscalers: [], clip_visions: [], unets: [] };

const base = (url = '') => String(url).trim().replace(/\/+$/, '');

// 抓取并缓存能力画像（按 serverUrl 缓存，避免每次生成都请求）
const capCache = new Map<string, { at: number; cap: ComfyCapability }>();
const CACHE_TTL = 5 * 60 * 1000;

export async function getCapability(serverUrl: string, force = false): Promise<ComfyCapability> {
  const url = base(serverUrl);
  const cached = capCache.get(url);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.cap;
  const win = window as any;
  let cap: ComfyCapability = { ok: false, nodeTypes: [], nodeSet: new Set(), models: { ...EMPTY_MODELS } };
  try {
    if (win?.yijingAPI?.comfyui?.capability) {
      const r = await win.yijingAPI.comfyui.capability({ serverUrl: url });
      if (r?.ok) {
        cap = { ok: true, nodeTypes: r.nodeTypes || [], nodeSet: new Set(r.nodeTypes || []), models: { ...EMPTY_MODELS, ...(r.models || {}) } };
      } else {
        cap.error = r?.error || '体检失败';
      }
    } else {
      const resp = await fetch(`${url}/object_info`);
      if (resp.ok) {
        const info = await resp.json();
        const nodeTypes = Object.keys(info || {});
        const enumFrom = (cls: string, key: string): string[] => {
          const spec = info?.[cls]?.input?.required?.[key] || info?.[cls]?.input?.optional?.[key];
          const arr = Array.isArray(spec) ? spec[0] : undefined;
          return Array.isArray(arr) ? arr.filter((x: any) => typeof x === 'string') : [];
        };
        cap = { ok: true, nodeTypes, nodeSet: new Set(nodeTypes), models: {
          checkpoints: enumFrom('CheckpointLoaderSimple', 'ckpt_name'),
          loras: enumFrom('LoraLoader', 'lora_name'),
          vaes: enumFrom('VAELoader', 'vae_name'),
          controlnets: enumFrom('ControlNetLoader', 'control_net_name'),
          upscalers: enumFrom('UpscaleModelLoader', 'model_name'),
          clip_visions: enumFrom('CLIPVisionLoader', 'clip_name'),
          unets: enumFrom('UNETLoader', 'unet_name'),
        } };
      } else { cap.error = `HTTP ${resp.status}`; }
    }
  } catch (e: any) {
    cap.error = e?.message || String(e);
  }
  if (cap.ok) capCache.set(url, { at: Date.now(), cap });
  return cap;
}

// 功能 → 所需节点/模型的能力要求。用于判断某台 ComfyUI 是否支持该功能。
export interface FeatureRequirement {
  feature: AINodeType;
  label: string;
  // 至少要满足其一的节点集合（每个子数组是一种可行实现）
  anyOf: string[][];
  needsCheckpoint?: boolean;
  // 官方模板匹配关键词（模糊匹配模板名/标题）
  templateKeywords: string[];
}

export const FEATURE_REQUIREMENTS: FeatureRequirement[] = [
  { feature: 'text-to-image', label: '文生图', needsCheckpoint: true,
    anyOf: [['KSampler', 'CLIPTextEncode', 'VAEDecode']],
    templateKeywords: ['text to image', 'txt2img', 'text2image', '文生图', 'default'] },
  { feature: 'image-to-image', label: '图生图', needsCheckpoint: true,
    anyOf: [['KSampler', 'VAEEncode', 'LoadImage']],
    templateKeywords: ['image to image', 'img2img', '图生图'] },
  { feature: 'image-upscale', label: '图片高清修复',
    anyOf: [['UpscaleModelLoader', 'ImageUpscaleWithModel'], ['ImageScale']],
    templateKeywords: ['upscale', 'hires', 'high res', '高清', '放大'] },
  { feature: 'image-blend', label: '多图融合', needsCheckpoint: true,
    anyOf: [['IPAdapterAdvanced', 'IPAdapter'], ['IPAdapterApply'], ['ImageBlend']],
    templateKeywords: ['ipadapter', 'ip-adapter', 'blend', 'style', '融合', '参考'] },
  { feature: 'live-portrait', label: '换脸/驱动',
    anyOf: [['ReActorFaceSwap'], ['ApplyInstantID', 'InstantIDModelLoader'], ['LivePortraitProcess']],
    templateKeywords: ['face swap', 'faceswap', 'reactor', 'instantid', 'live portrait', '换脸'] },
  { feature: 'text-to-video', label: '文生视频',
    anyOf: [['WanVideoSampler'], ['CogVideoSampler'], ['SVD_img2vid_Conditioning'], ['ADE_AnimateDiffLoaderGen1', 'KSampler']],
    templateKeywords: ['text to video', 'txt2video', 'wan', 'cogvideo', 'mochi', 'ltxv', '文生视频'] },
  { feature: 'image-to-video', label: '图生视频',
    anyOf: [['WanVideoImageToVideo'], ['SVD_img2vid_Conditioning', 'VideoLinearCFGGuidance'], ['CogVideoImageEncode']],
    templateKeywords: ['image to video', 'img2video', 'svd', 'i2v', 'wan', '图生视频'] },
  { feature: 'frame-to-video', label: '首尾帧生成视频',
    anyOf: [['WanVideoImageToVideo'], ['CogVideoImageEncode']],
    templateKeywords: ['start end frame', 'first last frame', 'flf', '首尾帧', 'keyframe'] },
  { feature: 'video-extend', label: '视频延长',
    anyOf: [['WanVideoSampler'], ['CogVideoSampler']],
    templateKeywords: ['extend', 'video extend', '延长'] },
  { feature: 'video-remix', label: '视频改写',
    anyOf: [['ADE_AnimateDiffLoaderGen1'], ['WanVideoSampler']],
    templateKeywords: ['video to video', 'vid2vid', 'remix', '改写', '转绘'] },
  { feature: 'lip-sync', label: '对口型',
    anyOf: [['LatentSyncNode'], ['SONICSampler'], ['Wav2LipNode']],
    templateKeywords: ['lip sync', 'lipsync', 'sonic', 'latentsync', '对口型', '唇形'] },
];

export interface FeatureCheck {
  feature: AINodeType;
  label: string;
  supported: boolean;
  reason?: string;
  matchedTemplate?: string;
}

// 官方模板索引里的条目（尽量兼容不同前端版本的结构）
export interface TemplateEntry { name: string; title?: string; category?: string; }

const tplCache = new Map<string, { at: number; list: TemplateEntry[] }>();

export async function getTemplateList(serverUrl: string, force = false): Promise<TemplateEntry[]> {
  const url = base(serverUrl);
  const cached = tplCache.get(url);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.list;
  const win = window as any;
  let list: TemplateEntry[] = [];
  try {
    let index: any = null;
    if (win?.yijingAPI?.comfyui?.templates) {
      const r = await win.yijingAPI.comfyui.templates({ serverUrl: url });
      if (r?.ok) index = r.index;
    } else {
      const resp = await fetch(`${url}/api/workflow_templates`).catch(() => null);
      if (resp && resp.ok) index = await resp.json();
    }
    list = flattenTemplateIndex(index);
  } catch { /* ignore */ }
  if (list.length) tplCache.set(url, { at: Date.now(), list });
  return list;
}

// 官方模板索引可能是：数组、{模块:[名字...]}、或 {templates:[{name,title}]}，统一拍平
function flattenTemplateIndex(index: any): TemplateEntry[] {
  if (!index) return [];
  const out: TemplateEntry[] = [];
  const pushName = (n: any, category?: string, title?: string) => {
    if (typeof n === 'string' && n.trim()) out.push({ name: n, title: title || n, category });
    else if (n && typeof n === 'object') {
      const nm = n.name || n.id || n.filename || n.template;
      if (nm) out.push({ name: String(nm), title: n.title || n.name || String(nm), category: n.category || category });
      if (Array.isArray(n.templates)) n.templates.forEach((t: any) => pushName(t, n.category || n.moduleName || category));
    }
  };
  if (Array.isArray(index)) index.forEach((x) => pushName(x));
  else if (Array.isArray(index.templates)) index.templates.forEach((x: any) => pushName(x));
  else if (typeof index === 'object') {
    for (const k of Object.keys(index)) {
      const v = index[k];
      if (Array.isArray(v)) v.forEach((x) => pushName(x, k));
      else pushName(v, k);
    }
  }
  return out;
}

function matchTemplate(templates: TemplateEntry[], keywords: string[]): string | undefined {
  if (!templates.length) return undefined;
  const kws = keywords.map(k => k.toLowerCase());
  let best: { name: string; score: number } | null = null;
  for (const t of templates) {
    const hay = `${t.name} ${t.title || ''} ${t.category || ''}`.toLowerCase();
    let score = 0;
    for (const k of kws) if (hay.includes(k)) score += k.length;
    if (score > 0 && (!best || score > best.score)) best = { name: t.name, score };
  }
  return best?.name;
}

function checkFeature(cap: ComfyCapability, req: FeatureRequirement, templates: TemplateEntry[]): FeatureCheck {
  const hasNodes = req.anyOf.some(group => group.every(n => cap.nodeSet.has(n)));
  const hasCkpt = !req.needsCheckpoint || cap.models.checkpoints.length > 0;
  const matchedTemplate = matchTemplate(templates, req.templateKeywords);
  const supported = (hasNodes && hasCkpt) || !!matchedTemplate;
  let reason: string | undefined;
  if (!supported) {
    if (!hasCkpt) reason = '未检测到可用的大模型(checkpoint)';
    else reason = '缺少所需节点：' + req.anyOf.map(g => g.join('+')).join(' 或 ');
  }
  return { feature: req.feature, label: req.label, supported, reason, matchedTemplate };
}

export interface CapabilityReport {
  ok: boolean;
  error?: string;
  serverUrl: string;
  nodeCount: number;
  checkpointCount: number;
  features: FeatureCheck[];
  templateCount: number;
}

// 生成完整体检报告：连通性 + 各功能是否可用 + 模板匹配情况
export async function runCapabilityReport(serverUrl: string, force = false): Promise<CapabilityReport> {
  const cap = await getCapability(serverUrl, force);
  if (!cap.ok) {
    return { ok: false, error: cap.error, serverUrl: base(serverUrl), nodeCount: 0, checkpointCount: 0, features: [], templateCount: 0 };
  }
  const templates = await getTemplateList(serverUrl, force);
  const features = FEATURE_REQUIREMENTS.map(req => checkFeature(cap, req, templates));
  return {
    ok: true,
    serverUrl: base(serverUrl),
    nodeCount: cap.nodeTypes.length,
    checkpointCount: cap.models.checkpoints.length,
    features,
    templateCount: templates.length,
  };
}

export function formatReport(report: CapabilityReport): string {
  if (!report.ok) return `无法连接 ComfyUI（${report.serverUrl}）：${report.error || '未知错误'}`;
  const green = report.features.filter(f => f.supported).map(f => f.label);
  const red = report.features.filter(f => !f.supported);
  const lines: string[] = [];
  lines.push(`已连接 ComfyUI：${report.nodeCount} 个节点、${report.checkpointCount} 个大模型、${report.templateCount} 个官方模板。`);
  if (green.length) lines.push(`✅ 可用：${green.join('、')}`);
  if (red.length) lines.push('⚠️ 暂不可用：' + red.map(f => `${f.label}（${f.reason || '缺依赖'}）`).join('；'));
  return lines.join('\n');
}

// 内置回退工作流（API 格式）。仅覆盖最通用的功能；其余优先走官方模板。
// 模型名会用体检到的真实 checkpoint 重绑定，避免写死不存在的文件名。
function pickCheckpoint(cap: ComfyCapability): string | undefined {
  return cap.models.checkpoints[0];
}

function builtinTextToImage(ckpt: string, prompt: string, opts: any): any {
  const width = Number(opts?.width) || 1024;
  const height = Number(opts?.height) || 1024;
  const steps = Number(opts?.steps) || 25;
  const cfg = Number(opts?.cfg) > 0 ? Number(opts?.cfg) : 7;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const batch = Number(opts?.batch_size || opts?.batchSize || opts?.numberOfImages) || 1;
  const sampler = opts?.sampler || 'euler';
  const scheduler = opts?.scheduler || 'normal';
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: batch } },
    '6': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: prompt || 'a photo', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', _meta: { title: 'Negative' }, inputs: { text: opts?.negativePrompt || 'low quality, blurry, worst quality', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'YijingAI', images: ['8', 0] } },
  };
}

function builtinImageToImage(ckpt: string, prompt: string, opts: any): any {
  const steps = Number(opts?.steps) || 25;
  const cfg = Number(opts?.cfg) > 0 ? Number(opts?.cfg) : 7;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const denoise = Number(opts?.denoise) > 0 ? Number(opts?.denoise) : 0.6;
  const sampler = opts?.sampler || 'euler';
  const scheduler = opts?.scheduler || 'normal';
  return {
    '3': { class_type: 'KSampler', inputs: { seed, steps, cfg, sampler_name: sampler, scheduler, denoise, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['12', 0] } },
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '6': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: prompt || 'a photo', clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', _meta: { title: 'Negative' }, inputs: { text: opts?.negativePrompt || 'low quality, blurry, worst quality', clip: ['4', 1] } },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'YijingAI_i2i', images: ['8', 0] } },
    '10': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    '12': { class_type: 'VAEEncode', inputs: { pixels: ['10', 0], vae: ['4', 2] } },
  };
}

function builtinImageUpscale(cap: ComfyCapability, opts: any): any | null {
  const model = cap.models.upscalers[0];
  if (!model || !cap.nodeSet.has('UpscaleModelLoader') || !cap.nodeSet.has('ImageUpscaleWithModel')) return null;
  return {
    '10': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    '11': { class_type: 'UpscaleModelLoader', inputs: { model_name: model } },
    '12': { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['11', 0], image: ['10', 0] } },
    '13': { class_type: 'SaveImage', inputs: { filename_prefix: 'YijingAI_upscale', images: ['12', 0] } },
  };
}

// 图生视频（SVD）内置回退：需 ImageOnlyCheckpointLoader + SVD_img2vid_Conditioning + VideoLinearCFGGuidance
function builtinImageToVideoSVD(cap: ComfyCapability, opts: any): any | null {
  const need = ['ImageOnlyCheckpointLoader', 'SVD_img2vid_Conditioning', 'VideoLinearCFGGuidance', 'KSampler', 'VAEDecode'];
  if (!need.every(n => cap.nodeSet.has(n))) return null;
  // SVD 权重通常出现在 checkpoints 里（如 svd.safetensors / svd_xt.safetensors）
  const svd = cap.models.checkpoints.find(m => /svd/i.test(m)) || cap.models.checkpoints[0];
  if (!svd) return null;
  const width = Number(opts?.width) || 1024;
  const height = Number(opts?.height) || 576;
  const frames = Number(opts?.frames) || 14;
  const fps = Number(opts?.fps) || 6;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const saveNode = cap.nodeSet.has('SaveAnimatedWEBP')
    ? { class_type: 'SaveAnimatedWEBP', inputs: { images: ['21', 0], filename_prefix: 'YijingAI_i2v', fps, lossless: false, quality: 90, method: 'default' } }
    : { class_type: 'SaveImage', inputs: { images: ['21', 0], filename_prefix: 'YijingAI_i2v' } };
  return {
    '15': { class_type: 'ImageOnlyCheckpointLoader', inputs: { ckpt_name: svd } },
    '16': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    '17': { class_type: 'SVD_img2vid_Conditioning', inputs: { clip_vision: ['15', 1], init_image: ['16', 0], vae: ['15', 2], width, height, video_frames: frames, motion_bucket_id: Number(opts?.motion) || 127, fps, augmentation_level: 0 } },
    '18': { class_type: 'VideoLinearCFGGuidance', inputs: { model: ['15', 0], min_cfg: 1 } },
    '19': { class_type: 'KSampler', inputs: { seed, steps: Number(opts?.steps) || 20, cfg: 2.5, sampler_name: 'euler', scheduler: 'karras', denoise: 1, model: ['18', 0], positive: ['17', 0], negative: ['17', 1], latent_image: ['17', 2] } },
    '21': { class_type: 'VAEDecode', inputs: { samples: ['19', 0], vae: ['15', 2] } },
    '22': saveNode,
  };
}

// 图生视频（Wan Video）内置回退：需 WanVideoModelLoader/WanVideoImageToVideoEncode(或 WanVideoImageToVideo)/WanVideoSampler/WanVideoDecode
function builtinImageToVideoWan(cap: ComfyCapability, opts: any): any | null {
  const ns = cap.nodeSet;
  if (!(ns.has('WanVideoSampler') && ns.has('WanVideoDecode'))) return null;
  if (!(ns.has('WanVideoImageToVideoEncode') || ns.has('WanVideoImageToVideo'))) return null;
  if (!ns.has('WanVideoModelLoader')) return null;
  const width = Number(opts?.width) || 720;
  const height = Number(opts?.height) || 480;
  const frames = Number(opts?.frames) || 49;
  const fps = Number(opts?.fps) || 16;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const encodeCls = ns.has('WanVideoImageToVideoEncode') ? 'WanVideoImageToVideoEncode' : 'WanVideoImageToVideo';
  const vaeLoader = ns.has('WanVideoVAELoader') ? 'WanVideoVAELoader' : (ns.has('VAELoader') ? 'VAELoader' : '');
  if (!vaeLoader) return null;
  const saveNode: any = ns.has('VHS_VideoCombine')
    ? { class_type: 'VHS_VideoCombine', inputs: { images: ['6', 0], frame_rate: fps, filename_prefix: 'YijingAI_wan_i2v', format: 'video/h264-mp4' } }
    : (ns.has('SaveAnimatedWEBP')
      ? { class_type: 'SaveAnimatedWEBP', inputs: { images: ['6', 0], filename_prefix: 'YijingAI_wan_i2v', fps, lossless: false, quality: 90, method: 'default' } }
      : { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'YijingAI_wan_i2v' } });
  return {
    '1': { class_type: 'WanVideoModelLoader', inputs: {} },
    '2': { class_type: vaeLoader, inputs: {} },
    '3': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    '4': { class_type: encodeCls, inputs: { image: ['3', 0], vae: ['2', 0], width, height, num_frames: frames } },
    '5': { class_type: 'WanVideoSampler', inputs: { model: ['1', 0], image_embeds: ['4', 0], steps: Number(opts?.steps) || 25, cfg: Number(opts?.cfg) || 6, seed, scheduler: 'unipc' } },
    '6': { class_type: 'WanVideoDecode', inputs: { samples: ['5', 0], vae: ['2', 0] } },
    '7': saveNode,
  };
}

// 图生视频（CogVideoX）内置回退
function builtinImageToVideoCog(cap: ComfyCapability, opts: any): any | null {
  const ns = cap.nodeSet;
  if (!(ns.has('CogVideoSampler') && ns.has('CogVideoDecode'))) return null;
  if (!(ns.has('CogVideoImageEncode') || ns.has('CogVideoXImageEncode'))) return null;
  const modelLoader = ns.has('DownloadAndLoadCogVideoModel') ? 'DownloadAndLoadCogVideoModel' : (ns.has('CogVideoModelLoader') ? 'CogVideoModelLoader' : '');
  if (!modelLoader) return null;
  const width = Number(opts?.width) || 720;
  const height = Number(opts?.height) || 480;
  const frames = Number(opts?.frames) || 49;
  const fps = Number(opts?.fps) || 8;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const encodeCls = ns.has('CogVideoXImageEncode') ? 'CogVideoXImageEncode' : 'CogVideoImageEncode';
  const saveNode: any = ns.has('VHS_VideoCombine')
    ? { class_type: 'VHS_VideoCombine', inputs: { images: ['6', 0], frame_rate: fps, filename_prefix: 'YijingAI_cog_i2v', format: 'video/h264-mp4' } }
    : { class_type: 'SaveAnimatedWEBP', inputs: { images: ['6', 0], filename_prefix: 'YijingAI_cog_i2v', fps, lossless: false, quality: 90, method: 'default' } };
  return {
    '1': { class_type: modelLoader, inputs: {} },
    '3': { class_type: 'LoadImage', inputs: { image: 'input.png' } },
    '4': { class_type: encodeCls, inputs: { pipeline: ['1', 0], image: ['3', 0], width, height, num_frames: frames } },
    '5': { class_type: 'CogVideoSampler', inputs: { pipeline: ['1', 0], samples: ['4', 0], steps: Number(opts?.steps) || 50, cfg: Number(opts?.cfg) || 6, seed } },
    '6': { class_type: 'CogVideoDecode', inputs: { pipeline: ['1', 0], samples: ['5', 0] } },
    '7': saveNode,
  };
}

// 文生视频（Wan）内置回退
function builtinTextToVideoWan(cap: ComfyCapability, prompt: string, opts: any): any | null {
  const ns = cap.nodeSet;
  if (!(ns.has('WanVideoSampler') && ns.has('WanVideoDecode') && ns.has('WanVideoTextEncode') && ns.has('WanVideoModelLoader'))) return null;
  const vaeLoader = ns.has('WanVideoVAELoader') ? 'WanVideoVAELoader' : (ns.has('VAELoader') ? 'VAELoader' : '');
  if (!vaeLoader) return null;
  const width = Number(opts?.width) || 720;
  const height = Number(opts?.height) || 480;
  const frames = Number(opts?.frames) || 49;
  const fps = Number(opts?.fps) || 16;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const saveNode: any = ns.has('VHS_VideoCombine')
    ? { class_type: 'VHS_VideoCombine', inputs: { images: ['6', 0], frame_rate: fps, filename_prefix: 'YijingAI_wan_t2v', format: 'video/h264-mp4' } }
    : { class_type: 'SaveAnimatedWEBP', inputs: { images: ['6', 0], filename_prefix: 'YijingAI_wan_t2v', fps, lossless: false, quality: 90, method: 'default' } };
  return {
    '1': { class_type: 'WanVideoModelLoader', inputs: {} },
    '2': { class_type: vaeLoader, inputs: {} },
    '3': { class_type: 'WanVideoTextEncode', inputs: { positive_prompt: prompt || 'a video', negative_prompt: opts?.negativePrompt || '' } },
    '5': { class_type: 'WanVideoSampler', inputs: { model: ['1', 0], text_embeds: ['3', 0], steps: Number(opts?.steps) || 25, cfg: Number(opts?.cfg) || 6, seed, scheduler: 'unipc', width, height, num_frames: frames } },
    '6': { class_type: 'WanVideoDecode', inputs: { samples: ['5', 0], vae: ['2', 0] } },
    '7': saveNode,
  };
}

// 文生视频（CogVideoX）内置回退
function builtinTextToVideoCog(cap: ComfyCapability, prompt: string, opts: any): any | null {
  const ns = cap.nodeSet;
  if (!(ns.has('CogVideoSampler') && ns.has('CogVideoDecode') && ns.has('CogVideoTextEncode'))) return null;
  const modelLoader = ns.has('DownloadAndLoadCogVideoModel') ? 'DownloadAndLoadCogVideoModel' : (ns.has('CogVideoModelLoader') ? 'CogVideoModelLoader' : '');
  if (!modelLoader) return null;
  const width = Number(opts?.width) || 720;
  const height = Number(opts?.height) || 480;
  const frames = Number(opts?.frames) || 49;
  const fps = Number(opts?.fps) || 8;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const saveNode: any = ns.has('VHS_VideoCombine')
    ? { class_type: 'VHS_VideoCombine', inputs: { images: ['6', 0], frame_rate: fps, filename_prefix: 'YijingAI_cog_t2v', format: 'video/h264-mp4' } }
    : { class_type: 'SaveAnimatedWEBP', inputs: { images: ['6', 0], filename_prefix: 'YijingAI_cog_t2v', fps, lossless: false, quality: 90, method: 'default' } };
  return {
    '1': { class_type: modelLoader, inputs: {} },
    '3': { class_type: 'CogVideoTextEncode', inputs: { pipeline: ['1', 0], prompt: prompt || 'a video' } },
    '5': { class_type: 'CogVideoSampler', inputs: { pipeline: ['1', 0], text_embeds: ['3', 0], steps: Number(opts?.steps) || 50, cfg: Number(opts?.cfg) || 6, seed, width, height, num_frames: frames } },
    '6': { class_type: 'CogVideoDecode', inputs: { pipeline: ['1', 0], samples: ['5', 0] } },
    '7': saveNode,
  };
}

// 文生视频内置回退：优先 AnimateDiff(Gen1)+文生图基座；需要相应节点与 checkpoint
function builtinTextToVideoAD(cap: ComfyCapability, prompt: string, opts: any): any | null {
  const need = ['ADE_AnimateDiffLoaderGen1', 'ADE_AnimateDiffUniformContextOptions', 'KSampler', 'CheckpointLoaderSimple', 'CLIPTextEncode', 'VAEDecode'];
  if (!need.every(n => cap.nodeSet.has(n))) return null;
  const ckpt = cap.models.checkpoints[0];
  const motionLora = cap.nodeSet.has('ADE_AnimateDiffLoaderGen1');
  if (!ckpt || !motionLora) return null;
  const width = Number(opts?.width) || 512;
  const height = Number(opts?.height) || 512;
  const frames = Number(opts?.frames) || 16;
  const fps = Number(opts?.fps) || 8;
  const seed = Number(opts?.seed) || Math.floor(Math.random() * 1e15);
  const saveNode = cap.nodeSet.has('SaveAnimatedWEBP')
    ? { class_type: 'SaveAnimatedWEBP', inputs: { images: ['30', 0], filename_prefix: 'YijingAI_t2v', fps, lossless: false, quality: 90, method: 'default' } }
    : { class_type: 'SaveImage', inputs: { images: ['30', 0], filename_prefix: 'YijingAI_t2v' } };
  return {
    '24': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '25': { class_type: 'ADE_AnimateDiffUniformContextOptions', inputs: { context_length: 16, context_stride: 1, context_overlap: 4, context_schedule: 'uniform', closed_loop: false } },
    '26': { class_type: 'ADE_AnimateDiffLoaderGen1', inputs: { model: ['24', 0], context_options: ['25', 0], beta_schedule: 'sqrt_linear (AnimateDiff)', motion_scale: 1, apply_v2_models_properly: true } },
    '27': { class_type: 'CLIPTextEncode', _meta: { title: 'Positive' }, inputs: { text: prompt || 'a video', clip: ['24', 1] } },
    '28': { class_type: 'CLIPTextEncode', _meta: { title: 'Negative' }, inputs: { text: opts?.negativePrompt || 'low quality, blurry', clip: ['24', 1] } },
    '29': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: frames } },
    '31': { class_type: 'KSampler', inputs: { seed, steps: Number(opts?.steps) || 20, cfg: 8, sampler_name: 'euler', scheduler: 'normal', denoise: 1, model: ['26', 0], positive: ['27', 0], negative: ['28', 0], latent_image: ['29', 0] } },
    '30': { class_type: 'VAEDecode', inputs: { samples: ['31', 0], vae: ['24', 2] } },
    '32': saveNode,
  };
}

export interface ResolvedWorkflow {
  ok: boolean;
  workflow?: any;
  source: 'official-template' | 'builtin' | 'none';
  templateName?: string;
  error?: string;
}

// 为某个功能解析出可用 workflow：官方模板优先，其次内置回退，附 checkpoint 重绑定。
export async function resolveWorkflowForFeature(serverUrl: string, feature: AINodeType, prompt: string, opts: any = {}): Promise<ResolvedWorkflow> {
  const url = base(serverUrl);
  const cap = await getCapability(url);
  if (!cap.ok) return { ok: false, source: 'none', error: cap.error || '无法连接 ComfyUI' };
  const req = FEATURE_REQUIREMENTS.find(r => r.feature === feature);
  const win = window as any;
  // 1) 官方模板
  if (req) {
    const templates = await getTemplateList(url);
    const name = matchTemplate(templates, req.templateKeywords);
    if (name && win?.yijingAPI?.comfyui?.templateWorkflow) {
      try {
        const r = await win.yijingAPI.comfyui.templateWorkflow({ serverUrl: url, name });
        if (r?.ok && r.workflow) {
          const wf = rebindCheckpoint(r.workflow, cap);
          return { ok: true, workflow: wf, source: 'official-template', templateName: name };
        }
      } catch { /* fall through */ }
    }
  }
  // 2) 内置回退
  const ckpt = pickCheckpoint(cap);
  if (feature === 'text-to-image') {
    if (!ckpt) return { ok: false, source: 'none', error: '未检测到可用大模型(checkpoint)，无法生成' };
    return { ok: true, workflow: builtinTextToImage(ckpt, prompt, opts), source: 'builtin' };
  }
  if (feature === 'image-to-image') {
    if (!ckpt) return { ok: false, source: 'none', error: '未检测到可用大模型(checkpoint)，无法生成' };
    return { ok: true, workflow: builtinImageToImage(ckpt, prompt, opts), source: 'builtin' };
  }
  if (feature === 'image-upscale') {
    const wf = builtinImageUpscale(cap, opts);
    if (wf) return { ok: true, workflow: wf, source: 'builtin' };
    return { ok: false, source: 'none', error: '未检测到放大模型或所需节点' };
  }
  if (feature === 'image-to-video' || feature === 'frame-to-video') {
    const tryList = [
      builtinImageToVideoWan(cap, opts),
      builtinImageToVideoCog(cap, opts),
      builtinImageToVideoSVD(cap, opts),
    ];
    const wf = tryList.find(Boolean);
    if (wf) return { ok: true, workflow: wf, source: 'builtin' };
    return { ok: false, source: 'none', error: '未检测到图生视频所需的节点（可安装 ComfyUI-WanVideoWrapper / ComfyUI-CogVideoXWrapper / SVD，或使用官方模板）' };
  }
  if (feature === 'text-to-video' || feature === 'video-remix') {
    const tryList = [
      builtinTextToVideoWan(cap, prompt, opts),
      builtinTextToVideoCog(cap, prompt, opts),
      builtinTextToVideoAD(cap, prompt, opts),
    ];
    const wf = tryList.find(Boolean);
    if (wf) return { ok: true, workflow: wf, source: 'builtin' };
    return { ok: false, source: 'none', error: '未检测到文生视频所需的节点（可安装 ComfyUI-WanVideoWrapper / ComfyUI-CogVideoXWrapper / AnimateDiff-Evolved，或使用官方模板）' };
  }
  return { ok: false, source: 'none', error: `该 ComfyUI 未找到"${req?.label || feature}"的官方模板，且暂无内置回退方案` };
}

// 把 workflow 里 CheckpointLoaderSimple 的 ckpt_name 重绑定为真实存在的模型
function rebindCheckpoint(workflow: any, cap: ComfyCapability): any {
  if (!workflow || Array.isArray(workflow.nodes)) return workflow; // UI 格式交给主进程转换，不改
  const ckpts = cap.models.checkpoints;
  if (!ckpts.length) return workflow;
  try {
    for (const id of Object.keys(workflow)) {
      const node = workflow[id];
      if (node?.class_type === 'CheckpointLoaderSimple' && node.inputs) {
        const cur = node.inputs.ckpt_name;
        if (!cur || !ckpts.includes(cur)) node.inputs.ckpt_name = ckpts[0];
      }
    }
  } catch { /* ignore */ }
  return workflow;
}

