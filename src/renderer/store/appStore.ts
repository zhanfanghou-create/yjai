import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { resolveWorkflowForFeature } from '../services/comfyCapability';
import { localizeMedia } from '../utils/pathUtils';
import { toolService } from '../services/toolService';
import { classifyModel, featuredOf, findPresetByBase } from '../data/providerPresets';
import type { DramartProject, AIConfigInput, DramartStyle } from '../services/dramartWorkflow';

export type APIProvider = 'comfyui' | 'openai' | 'grsai' | 'siliconflow' | 'zhipu' | 'custom' | 'modelscope';
export type NavSection = 'home' | 'assets' | 'prompt-library' | 'canvas' | 'drama' | 'money-printer' | 'settings' | 'tools' | 'drama-workshop' | 'comfyui';
export type GenerationType = 'text-chat' | 'text-to-image' | 'text-to-video' | 'image-to-video' | 'text-to-document' | 'image-edit' | 'multi-modal-to-video';
export type AINodeType = 'text-to-image' | 'text-to-video' | 'image-blend' | 'frame-to-video' | 'story-script' | 'story-script-adv' | 'character-view' | 'img2video' | 'audio2video' | 'video-composite' | 'director-stage' | 'material-lib' | 'tts' | 'image-to-video' | 'video-extend' | 'video-remix' | 'lip-sync' | 'video-super-resolution' | 'live-portrait' | 'image-to-image' | 'image-upscale' | 'audio-to-text' | 'video-to-music' | 'video-interpolate' | 'video-realtime' | 'subtitle' | 'result' | 'comfyui';
export type RecommendedAPIType = 'openai-chat' | 'openai-generations' | 'openai-image-edit' | 'openai-completions' | 'openai-image-to-video' | 'openai-audio-to-video' | 'openai-voice' | 'openai-music' | 'openai-subtitle' | 'openai-face-swap' | 'openai-video-compose' | 'seedance-video' | 'edge-tts' | 'azure-tts' | 'pexels' | 'volcano-coding-plan' | 'modelscope';

export interface ChatMessage { id: string; role: 'user' | 'assistant' | 'system'; content: string; timestamp: number; type: 'text' | 'image' | 'video' | 'audio' | 'document'; files?: string[]; model?: string; provider?: string; meta?: Record<string, any>; }
export interface ChatSession { id: string; title: string; messages: ChatMessage[]; createdAt: number; updatedAt: number; }
export interface AINode { id: string; type: AINodeType; provider: APIProvider; x: number; y: number; width: number; height: number; status: 'idle' | 'loading' | 'processing' | 'success' | 'error'; prompt?: string; options: Record<string, any>; result?: { url: string; type: 'image' | 'video' | 'audio' | 'text'; text?: string; remoteUrl?: string }; error?: string; thumbnail?: string; meta?: Record<string, any>; configId?: string; model?: string; aspectRatio?: string; size?: string; resolution?: string; baseUrl?: string; workflow?: string; }
export interface APIConfig { id: string; name: string; provider: APIProvider; baseUrl: string; apiKey: string; defaultModel: string; models: string[]; enabled: boolean; connected: boolean; }
export interface ComfyUIConfig { id: string; name: string; serverUrl: string; dataPath?: string; apiFile?: string; connected: boolean; nodeType?: 'image' | 'video' | 'audio'; runtime?: 'local' | 'cloud'; workflowJSON?: string; description?: string; components?: any[]; parsed?: boolean; generated?: boolean; workflowFiles?: Array<{ name: string; path?: string; content?: string; kind?: string; type?: string; workflow?: any }>; categoryPresets?: Record<string, string>; }
export interface RecommendedConfig { id: string; name: string; baseUrl: string; apiKey: string; apiType: RecommendedAPIType; models: string[]; defaultModel?: string; cardKey?: string; applyUrl?: string; }
export interface ModelScopeConfig { id: string; name: string; apiKey: string; authType: 'apikey' | 'oauth'; oauthToken?: string; selectedModels: string[]; categories: string[]; enabled: boolean; }
export interface GenerationParams { aspectRatio?: string; imageSize?: string; resolution?: string; selectedConfigId?: string; selectedModel?: string; stepConfigs?: StepConfigs; }
// 画布助手（猫头鹰）设置：语音朗读来源 + 新建节点默认执行后端偏好
export interface AssistantSettings {
  // 语音朗读来源：'edge-tts'（内置，默认）或 'api'（用户配置的语音 API）
  voiceSource: 'edge-tts' | 'api';
  voiceConfigId?: string;   // voiceSource==='api' 时使用的语音 API 配置 id
  voiceModel?: string;      // 选中的语音模型/音色
  speakReplies: boolean;    // 是否朗读助手回复
  // 新建节点默认执行后端：'ask'（每次与用户确认，默认）| 'comfyui' | 'api'
  nodeBackend: 'ask' | 'comfyui' | 'api';
}
// ComfyUI 工作流缓存：按 服务器+功能类型 记住已解析/搭建好的工作流，供同类型复用
export interface ComfyWorkflowCacheItem {
  id: string;
  name: string;          // 展示名，如 “文生图·官方模板” 或 “图生视频·内置”
  feature: string;       // 节点功能类型（AINodeType）
  serverUrl: string;     // 归属的 ComfyUI 地址
  source: 'official-template' | 'builtin' | 'manual';
  templateName?: string;
  workflow: any;         // API 格式 workflow
  options?: Record<string, any>;  // 记住的参数
  // 参数指纹：由影响 workflow 结构的关键参数（比例/清晰度/帧数/FPS/张数/负面词/CFG/steps/seed/sampler/scheduler/denoise/参考图数量 等）
  // 拼接后取短哈希。同 服务器+功能+指纹 命中缓存时直接复用，避免每次都重搭；参数变化则自动新建。
  paramFingerprint?: string;
  createdAt: number;
  updatedAt: number;
}
export interface StepApiConfig { configId: string; model: string; }
export interface StepConfigs { script?: StepApiConfig & { prompt?: string; }; cover?: StepApiConfig & { prompt?: string; }; video?: StepApiConfig & { prompt?: string; materialSourceId?: string; }; voice?: StepApiConfig & { prompt?: string; voiceName?: string; }; music?: StepApiConfig & { prompt?: string; }; compose?: StepApiConfig & { ffmpegPath?: string; }; }
export type StockMediaProvider = 'pexels' | 'pixabay' | 'local';
export interface StockMediaSource { id: string; name: string; provider: StockMediaProvider; apiKey?: string; folderPath?: string; enabled: boolean; }
export interface AssetItem { id: string; name: string; type: 'image' | 'video' | 'audio' | 'document'; path: string; thumbnail?: string; size: number; createdAt: number; folderId?: string; sourceId?: string; sourceType?: 'chat' | 'canvas' | 'drama' | 'tools' | 'moneyprinter'; }
export interface AssetFolder { id: string; name: string; parentId?: string; children: string[]; items: string[]; createdAt: number; sourceId?: string; sourceType?: AssetItem['sourceType']; autoCreated?: boolean; }
export interface CanvasHistory { id: string; name: string; thumbnail?: string; data: any; createdAt: number; updatedAt: number; }
export interface DramaChatMessage { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; thinking?: string; }
export interface StoryboardRow { scene: string; shot: string; shotType: string; cameraMove: string; description: string; dialogue: string; duration: string; text2imgPrompt: string; img2videoPrompt: string; imageUrl?: string; videoUrl?: string; imageGenerating?: boolean; videoGenerating?: boolean; }
export interface StoryboardPreset { id: string; name: string; description: string; rows?: StoryboardRow[]; steps?: any[]; createdAt: number; }
export interface DramaRecord { id: string; name?: string; createdAt: number; updatedAt: number; [key: string]: any; }
export interface PromptItem { id: string; name: string; prompt: string; type: 'text' | 'image' | 'video'; thumbnail?: string; filePath?: string; tags?: string[]; createdAt: number; updatedAt: number; }
export interface SearchResult { id: string; title: string; subtitle?: string; snippet?: string; type: 'asset' | 'canvas' | 'chat' | 'drama' | 'prompt'; section: NavSection; targetId?: string; }
export interface TestConnectionResult { ok: boolean; error?: string; }

export const IMAGE_ASPECT_RATIOS = ['auto', '1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
export const VIDEO_ASPECT_RATIOS = [{ label: '1:1', value: '1:1' }, { label: '竖屏 3:4', value: '3:4' }, { label: '竖屏 9:16', value: '9:16' }, { label: '横屏 4:3', value: '4:3' }, { label: '横屏 16:9', value: '16:9' }];
export const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'];
export const EDGE_TTS_MODELS = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural'];
export const NANO_BANANA_MODELS: string[] = [];
export const getCallableRecommendedConfigs = (configs: RecommendedConfig[] = []) => (Array.isArray(configs) ? configs : []).filter(c => c.apiType === 'edge-tts' || ((c.id || '').trim() && (c.baseUrl || '').trim() && (c.apiKey || '').trim()));
// 获取 DramaPage 的推荐配置 - 只返回对话类型的 API
export const getDramaPageRecommendedConfigs = (configs: RecommendedConfig[] = []) =>
  (Array.isArray(configs) ? configs : []).filter(c =>
    // 只返回 chat 类型的 API，用于剧本生成
    ['openai-chat', 'openai-completions', 'custom-chat'].includes(c.apiType) &&
    (c.id || '').trim() && (c.baseUrl || '').trim() && (c.apiKey || '').trim()
  );

// 获取 ComfyUI 配置在指定分类（chat/image/video/audio）下的默认工作流名
export const getComfyCategoryPreset = (config: any, category: string) => {
  if (!config) return undefined;
  const files = Array.isArray(config.workflowFiles) ? config.workflowFiles : [];
  const p = config.categoryPresets?.[category];
  if (p && files.some((w: any) => String(w.name || w.path || '') === p)) return p;
  return undefined;
};

const id = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
const rootFolderId = 'root';
const rootFolder = (): AssetFolder => ({ id: rootFolderId, name: '全部资产', children: [], items: [], createdAt: Date.now() });
const base = (url = '') => String(url).trim().replace(/\/+$/, '');
// 规范化 API 基础地址：剥离 /chat/completions、/images/generations 等端点后缀，避免与端点拼接产生错误 URL
const normalizeApiBase = (url = '') => base(url)
  .replace(/\/(?:chat\/completions|chat\/completions\/chat|images\/generations|images\/edits|videos\/generations|api\/generate|api\/result|models|agnesapi)(?:\/.*)?$/i, '');
const redirectAgnesHost = (url = '') => url.replace(/^(https?:\/\/)(?:api\.agnes-ai\.com|apihub\.agnes-ai\.cn)(\/|$)/i, '$1api.agnes-ai.cn$2');
// 清理损坏的 UTF-8 字符（检测乱码后回退为默认名称）
const sanitizeText = (s: string | undefined, fallback = '新对话') => {
  if (!s) return fallback;
  // 包含 \uFFFD 替换符或不可打印控制字符则视为损坏
  if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) return fallback;
  // 连续问号/乱码也视为损坏
  if (/\?{2,}|锘�/.test(s)) return fallback;
  return s;
};
const composePrompt = (...parts: Array<string | undefined>) => { const seen = new Set<string>(); return parts.map(part => (part || '').trim()).filter(part => { if (!part || seen.has(part)) return false; seen.add(part); return true; }).join('\n\n'); };

// 根据正向提示词自动推理画风，并生成与画风一致的负向提示词，避免生成结果风格漂移。
// 仅在用户未显式填写负向提示词时启用；不修改用户正向提示词内容，只补足缺省的负向约束。
const inferComfyNegativePrompt = (prompt: string, kind: 'image' | 'video' | 'audio'): string => {
  const text = String(prompt || '').toLowerCase();
  const has = (...keys: string[]) => keys.some(k => text.includes(k.toLowerCase()));
  const base = ['lowres', 'low quality', 'worst quality', 'blurry', 'jpeg artifacts', 'watermark', 'signature', 'text', 'logo', 'deformed', 'bad anatomy', 'extra limbs', 'missing fingers', 'extra fingers', 'fused fingers', 'mutated hands', 'disfigured', 'cropped', 'out of frame', 'duplicate'];
  const isAnime = has('anime', 'cartoon', '二次元', '动漫', '卡通', 'cel shading', 'manga', 'chibi');
  const isPhoto = has('photorealistic', 'photo', 'realistic', 'photograph', '写实', '真实', 'raw photo', 'cinematic', 'dslr', '8k', '4k', 'hyperrealistic');
  const isPainting = has('oil painting', 'watercolor', 'ink', '水墨', '油画', '水彩', 'sketch', '素描', 'illustration', 'concept art');
  const is3d = has('3d', 'render', 'octane', 'blender', 'unreal', 'c4d', 'cgi', '三维');
  if (isPhoto && !isAnime) base.push('cartoon', 'anime', 'illustration', 'painting', '3d render', 'cgi', 'plastic skin', 'over-saturated');
  if (isAnime && !isPhoto) base.push('photorealistic', 'realistic photo', '3d', 'extra digits', 'ugly');
  if (isPainting) base.push('photorealistic', 'over-sharpened', 'harsh lighting');
  if (is3d) base.push('flat', 'low-poly artifacts', 'noise');
  if (kind === 'video') base.push('flickering', 'temporal artifacts', 'jitter', 'frame jumps', 'ghosting', 'morphing', 'warping');
  return Array.from(new Set(base)).join(', ');
};

// 从各种返回结构里提取 base64 图片数据（火山方舟 Seedream 等返回 b64_json 而非 url），统一转成 data URL 以便本地化。
const extractBase64Image = (d: any): string => {
  const b64 = d?.b64_json || d?.data?.[0]?.b64_json || d?.data?.b64_json || d?.images?.[0]?.b64_json || d?.output?.[0]?.b64_json || d?.data?.[0]?.image_base64 || d?.image_base64 || d?.results?.[0]?.b64_json || '';
  if (typeof b64 !== 'string' || b64.length < 32) return '';
  if (b64.startsWith('data:')) return b64;
  return `data:image/png;base64,${b64}`;
};
const extractUrl = (d: any) => d?.url || d?.output?.url || d?.output?.video_url || d?.output?.image_url || d?.output?.results?.[0]?.url || d?.content?.video_url || d?.content?.url || d?.content?.file_url || d?.filePaths?.[0] || d?.urls?.[0] || d?.metadata?.url || d?.data?.metadata?.url || d?.data?.[0]?.url || d?.images?.[0]?.url || d?.results?.[0]?.url || d?.results?.[0]?.videos?.[0]?.url || d?.results?.[0]?.image_url || d?.output?.[0] || d?.files?.[0] || d?.video_url || d?.output?.url || d?.video?.url || d?.data?.video_url || d?.data?.[0]?.video_url || extractBase64Image(d) || '';
const resultType = (url: string, fallback: 'image' | 'video' | 'audio' | 'text' = 'image') => /\.(mp4|webm|mov|ogg)$/i.test(url) ? 'video' : /\.(mp3|wav|m4a|aac|flac)$/i.test(url) ? 'audio' : fallback;
const modeOf = (n: AINode) => String(n.options?.generationType || n.type);
const videoModes = new Set(['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'lip-sync', 'video-super-resolution', 'live-portrait', 'video-to-music', 'video-interpolate', 'video-realtime']);
const imageModes = new Set(['text-to-image', 'image-to-image', 'image-upscale', 'image-blend', 'character-view']);
// 计算 workflow 缓存的参数指纹：仅采纳会影响 workflow 结构/尺寸/帧数的关键字段，避免噪声。
// 相同指纹 = 可直接复用之前搭建好的 workflow；指纹变化 = 参数变了，需重新按新参数搭建。
function buildWorkflowParamFingerprint(opts: any): string {
  const pick: Record<string, any> = {
    // 图片相关
    w: opts?.width,
    h: opts?.height,
    b: opts?.batch_size ?? opts?.batchSize ?? opts?.numberOfImages ?? opts?.n,
    ir: opts?.imageRatio || opts?.aspectRatio,
    ic: opts?.imageClarity || opts?.resolution || opts?.size,
    // 视频相关
    vr: opts?.videoConfig?.ratio || opts?.videoRatio,
    vc: opts?.videoConfig?.clarity || opts?.videoClarity,
    vd: opts?.videoConfig?.duration || opts?.videoDuration,
    vf: opts?.videoConfig?.fps || opts?.fps || opts?.videoFps,
    vfr: opts?.frames || opts?.numFrames || opts?.videoConfig?.frames,
    va: opts?.videoConfig?.generateAudio ?? opts?.generateAudio,
    vcam: opts?.videoConfig?.cameraMovement?.id || opts?.cameraMovementId,
    // 采样超参
    s: opts?.steps,
    c: opts?.cfg,
    sm: opts?.sampler,
    sc: opts?.scheduler,
    dn: opts?.denoise,
    // 结构相关（有无源图/参考图会影响 image-to-image/i2v 等回退分支）
    ri: opts?.referenceCount ?? (Array.isArray(opts?.referenceImages) ? opts.referenceImages.length : 0),
    src: opts?.hasSourceImage ?? !!opts?.sourceImage,
    // 负面词是否为空（不同的负面词对 workflow 结构影响很小，只区分「有/无」）
    ne: (opts?.negativePrompt || opts?.negative_prompt) ? 1 : 0,
  };
  const norm: Record<string, any> = {};
  Object.keys(pick).sort().forEach(k => {
    const v = (pick as any)[k];
    if (v === undefined || v === null || v === '') return;
    norm[k] = v;
  });
  const str = JSON.stringify(norm);
  // FNV-1a 32-bit 简短哈希（前端够用；不追求密码学强度）
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}


interface AppState {
  // 授权状态
  licenseStatus: 'loading' | 'trial' | 'activated' | 'expired';
  licenseInfo: { machineCode: string; daysLeft: number; expiresAt?: string; activationCode?: string } | null;
  setLicenseStatus: (status: AppState['licenseStatus'], info?: AppState['licenseInfo']) => void;
  
  mediaPreview: { src: string; type: 'image' | 'video' | 'audio' } | null; toast: { message: string; type: 'success' | 'error' | 'info' | 'warning' } | null;
  sidebarCollapsed: boolean; activeSection: NavSection; activeCanvasId: string | null;
  chatSessions: ChatSession[]; activeSessionId: string | null; isGenerating: boolean; selectedProvider: APIProvider; selectedModel: string; generationType: GenerationType; defaultProvider: string; defaultModel: string;
  apiConfigs: APIConfig[]; chatAPIConfigs: APIConfig[]; imageAPIConfigs: APIConfig[]; videoAPIConfigs: APIConfig[]; voiceAPIConfigs: APIConfig[]; musicAPIConfigs: APIConfig[]; comfyuiConfigs: ComfyUIConfig[]; voiceLibrary: any[]; recommendedConfigs: RecommendedConfig[]; modelscopeConfig: ModelScopeConfig | null; stockMediaSources: StockMediaSource[]; generationParams: GenerationParams; assistantSettings: AssistantSettings; comfyWorkflowCache: ComfyWorkflowCacheItem[];
  assets: Record<string, AssetItem>; assetFolders: Record<string, AssetFolder>; selectedFolderId: string | null; assetClipboard: { id: string; type: 'asset' | 'folder'; action: 'copy' | 'cut' } | null; rootFolderId: string;
  canvasHistory: CanvasHistory[]; canvasGridVisible: boolean; nodes: Record<string, AINode>; undoStack: Record<string, AINode>[]; redoStack: Record<string, AINode>[]; clipboard: { nodes: AINode[]; isCut: boolean } | null; activeNodeId: string | null;
  taskQueue: any[]; queuePanelOpen: boolean;
  dramaRecords: DramaRecord[]; currentDramaRecordId: string | null; dramaApiConfigId: string; dramaModel: string; promptLibrary: PromptItem[]; searchQuery: string; searchResults: SearchResult[]; storyboardPresets: StoryboardPreset[];
  dramartProjects: DramartProject[]; activeDramartId: string | null; dramartDraft: DramartProject | null; dramartCreateParams: { mode: 'agent' | 'manual'; ratio: string; resolution: string; styleId: string; assetImageSource?: { kind: 'api' | 'comfyui'; model?: string; workflow?: string; serverUrl?: string } | null }; dramartCustomStyles: DramartStyle[];
  setMediaPreview: (p: AppState['mediaPreview']) => void; showToast: (m: string, t?: 'success' | 'error' | 'info' | 'warning') => void; toggleSidebar: () => void; setActiveSection: (s: NavSection) => void; setActiveCanvas: (id: string | null) => void;
  submitDramaDraft: (project: DramartProject) => void; clearDramartDraft: () => void; setActiveDramartId: (id: string | null) => void; updateDramartProject: (id: string, updater: (p: DramartProject) => DramartProject) => void;
  saveDramartProject: (project: DramartProject) => void; setDramartCreateParams: (p: Partial<{ mode: 'agent' | 'manual'; ratio: string; resolution: string; styleId: string; assetImageSource?: { kind: 'api' | 'comfyui'; model?: string; workflow?: string; serverUrl?: string } | null }>) => void; saveDramartCustomStyle: (style: DramartStyle) => void; deleteDramartCustomStyle: (id: string) => void; deleteDramartProject: (id: string) => void;
  setQueuePanelOpen: (v: boolean) => void;
  addToQueue: (id: string) => void; removeFromQueue: (id: string) => void; clearCompletedTasks: () => void; executeQueue: () => Promise<void>;
  createChatSession: () => string; deleteChatSession: (id: string) => void; setActiveSession: (id: string) => void; updateChatSession: (id: string, u: Partial<ChatSession>) => void; addMessage: (sid: string, m: Omit<ChatMessage, 'id' | 'timestamp'>) => string; updateMessage: (sid: string, mid: string, u: Partial<ChatMessage>) => void; deleteMessage: (sid: string, mid: string) => void;
  setGenerating: (v: boolean) => void; setSelectedProvider: (p: APIProvider) => void; setSelectedModel: (m: string) => void; setGenerationType: (t: GenerationType) => void; setDefaultConfig: (p: string, m: string) => void; setDramaApiConfig: (id: string) => void; setDramaModel: (m: string) => void;
  addAPIConfig: (c: Omit<APIConfig, 'id'>) => string; updateAPIConfig: (id: string, u: Partial<APIConfig>) => void; deleteAPIConfig: (id: string) => void; testAPIConnection: (id: string) => Promise<boolean>;
  addImageAPIConfig: (c: Omit<APIConfig, 'id'>) => string; updateImageAPIConfig: (id: string, u: Partial<APIConfig>) => void; deleteImageAPIConfig: (id: string) => void; testImageAPIConnection: (id: string) => Promise<boolean>;
  addVideoAPIConfig: (c: Omit<APIConfig, 'id'>) => string; updateVideoAPIConfig: (id: string, u: Partial<APIConfig>) => void; deleteVideoAPIConfig: (id: string) => void; testVideoAPIConnection: (id: string) => Promise<boolean>;
  addVoiceAPIConfig: (c: Omit<APIConfig, 'id'>) => string; updateVoiceAPIConfig: (id: string, u: Partial<APIConfig>) => void; deleteVoiceAPIConfig: (id: string) => void; testVoiceAPIConnection: (id: string) => Promise<boolean>; addMusicAPIConfig: (c: Omit<APIConfig, 'id'>) => string; updateMusicAPIConfig: (id: string, u: Partial<APIConfig>) => void; deleteMusicAPIConfig: (id: string) => void; testMusicAPIConnection: (id: string) => Promise<boolean>; addComfyUIConfig: (c: Omit<ComfyUIConfig, 'id'>) => string; updateComfyUIConfig: (id: string, u: Partial<ComfyUIConfig>) => void; deleteComfyUIConfig: (id: string) => void; testComfyUIConnection: (id: string) => Promise<boolean>; addVoiceToLibrary: (v: any) => string; removeVoiceFromLibrary: (id: string) => void; updateVoiceInLibrary: (id: string, u: any) => void;
  addStockMediaSource: (c: Omit<StockMediaSource, 'id'>) => string; updateStockMediaSource: (id: string, u: Partial<StockMediaSource>) => void; deleteStockMediaSource: (id: string) => void;
  addRecommendedConfig: (c: Omit<RecommendedConfig, 'id'> & { id?: string }) => string; updateRecommendedConfig: (id: string, u: Partial<RecommendedConfig>) => void; deleteRecommendedConfig: (id: string) => void; testRecommendedConnection: (id: string) => Promise<TestConnectionResult>; fetchModelsForConfig: (id: string, overrides?: { baseUrl?: string; apiKey?: string }, kind?: string) => Promise<{ ok: boolean; models?: string[]; error?: string }>; clearAllRecommendedConfigs: () => void;
  setModelScopeConfig: (c: ModelScopeConfig | null) => void; updateModelScopeConfig: (u: Partial<ModelScopeConfig>) => void; testModelScopeConnection: () => Promise<TestConnectionResult>; fetchModelScopeModels: (category?: string) => Promise<{ ok: boolean; models?: Array<{ id: string; name: string; description: string; category: string }>; error?: string }>; callModelScopeModel: (modelId: string, input: any) => Promise<{ ok: boolean; url?: string; text?: string; error?: string }>;
  setGenerationParams: (p: Partial<GenerationParams>) => void; updateAssistantSettings: (u: Partial<AssistantSettings>) => void; saveComfyWorkflowCache: (item: Omit<ComfyWorkflowCacheItem, 'id' | 'createdAt' | 'updatedAt'>) => string; deleteComfyWorkflowCache: (id: string) => void; getComfyWorkflowCache: (feature: string, serverUrl?: string) => ComfyWorkflowCacheItem[]; addAsset: (a: Omit<AssetItem, 'id' | 'createdAt'>) => string; deleteAsset: (id: string) => void; createFolder: (n: string, p?: string) => string; deleteFolder: (id: string) => void; moveAssetToFolder: (aid: string, fid?: string) => void; copyAsset: (id: string, fid?: string) => void; copyFolder: (id: string, fid?: string) => void; setSelectedFolderId: (id: string | null) => void; setAssetClipboard: (c: AppState['assetClipboard']) => void;
  saveCanvas: (n: string, d: any, t?: string) => string; updateCanvasData: (id: string, d: any, t?: string) => void; deleteCanvas: (id: string) => void; updateCanvasName: (id: string, n: string) => void; loadCanvas: (id: string) => void; setCanvasGridVisible: (v: boolean) => void;
  addNode: (n: Omit<AINode, 'id'>) => string; updateNode: (id: string, u: Partial<AINode>) => void; deleteNode: (id: string) => void; executeNode: (id: string, videoConfig?: any) => Promise<void>; setActiveNode: (id: string | null) => void; pushUndo: () => void; undo: () => void; redo: () => void; copyNodes: (ids: string[]) => void; cutNodes: (ids: string[]) => void; pasteNodes: () => string[]; retryNode: (id: string) => Promise<void>; cancelNode: (id: string) => Promise<void>; runNode: (id: string) => Promise<void>;
  saveDramaRecord: (r: Omit<DramaRecord, 'id' | 'createdAt' | 'updatedAt'>, n?: string) => string; loadDramaRecord: (id: string) => void; deleteDramaRecord: (id: string) => void; copyDramaRecord: (id: string) => void; renameDramaRecord: (id: string, n: string) => void; sendDramaToCanvas: (...args: any[]) => void; submitDramaToCanvas: (data: { episodes: any[]; currentEpisodeIndex: number; storyboardRows: any[] }) => void;
  addPromptItem: (i: Omit<PromptItem, 'id' | 'createdAt' | 'updatedAt'>) => string; updatePromptItem: (id: string, u: Partial<PromptItem>) => void; deletePromptItem: (id: string) => void; setSearchQuery: (q: string) => void; runGlobalSearch: () => void; clearSearch: () => void; addStoryboardPreset: (p: Omit<StoryboardPreset, 'id' | 'createdAt'>) => string; updateStoryboardPreset: (id: string, u: Partial<Omit<StoryboardPreset, 'id' | 'createdAt'>>) => void; deleteStoryboardPreset: (id: string) => void; exportStoryboardPreset: (id: string) => string; importStoryboardPreset: (json: string) => { ok: boolean; error?: string };
}

const testConfig = async (c?: APIConfig) => {
  if (!c?.baseUrl) return false;
  try {
    const win = window as any;
    if (win?.yijingAPI?.grsai?.refreshModels) {
      return !!(await win.yijingAPI.grsai.refreshModels({ baseUrl: c.baseUrl, apiKey: c.apiKey, apiType: 'openai-chat' }))?.ok;
    }
    const baseUrl = normalizeApiBase(c.baseUrl);
    // Agnes API 不支持 /models 端点，使用 /v1/chat/completions 测试连接
    if (/agnes-ai\.(?:com|cn)/i.test(baseUrl)) {
      const r = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: c.defaultModel || 'agnes-3.0-flash', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 })
      });
      return r.ok;
    }
    const r = await fetch(`${baseUrl}/models`, { headers: c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {} });
    return r.ok;
  } catch { return false; }
};

// 语音连接测试：豆包语音（openspeech.bytedance.com）使用 X-Api-Key 头 + text_prompt 格式，需单独适配
const testVoiceConfig = async (c?: APIConfig): Promise<boolean> => {
  if (!c?.baseUrl) return false;
  const baseUrl = String(c.baseUrl || '').trim().replace(/\/+$/, '');
  if (/openspeech\.bytedance\.com/i.test(baseUrl)) {
    try {
      // 豆包语音正确端点固定在 https://openspeech.bytedance.com/api/v3/tts/create，
      // 不向 baseUrl（可能是 /api/v1/tts）后拼接，避免 /api/v1/tts/api/v3/tts/create 404
      const origin = (() => { try { return new URL(baseUrl).origin; } catch { return baseUrl; } })();
      const url = `${origin}/api/v3/tts/create`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'X-Api-Key': c.apiKey || '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: c.defaultModel || 'seed-audio-1.0', text_prompt: '你好，测试。', audio_config: { format: 'mp3' } }),
      });
      return resp.ok;
    } catch { return false; }
  }
  return testConfig(c);
};

const directImageCapability = (n: AINode, prompt: string) => {
  const featureText = `${n.options?.mediaFeature || ''} ${n.options?.sourceFeature || ''} ${n.options?.workflowProject || ''} ${n.options?.apiCapability || ''} ${n.options?.panoramaFeature || ''} ${prompt}`.toLowerCase();
  const has = (...keys: string[]) => keys.some(key => featureText.includes(key.toLowerCase()));
  const explicitPanorama = n.options?.panoramaType === '720' || n.options?.outputType === 'panorama' || n.options?.apiCapability === 'image-to-720-panorama';
  if (explicitPanorama || has('全景', 'panorama', 'equirectangular')) return { githubProject: 'PanFusion / SD-T2I-360PanoImage', apiCapability: 'image-to-720-panorama', outputType: 'panorama', aspectRatio: '2:1', imageRatio: '2:1', resolution: n.options?.resolution || '2K', size: n.options?.size || '2048x1024', projectPromptHint: 'PanFusion or SD-T2I-360PanoImage style: create a seamless 720 degree equirectangular panorama from the reference image, 2:1, no black border.' };
  if (has('multi-angle', 'multiview', 'multi-view', 'zero123', 'wonder3d')) return { githubProject: 'Wonder3D / Zero123', apiCapability: 'image-to-multiview', outputType: 'multi-view-image', projectPromptHint: 'Wonder3D or Zero123 style: generate the requested camera angle or multi-view sheet from the reference image while preserving identity and style.' };
  if (has('lighting', 'relight', 'ic-light')) return { githubProject: 'IC-Light / DPR', apiCapability: 'free-angle-relighting', outputType: 'relit-image', projectPromptHint: 'IC-Light style: preserve subject and composition, only modify lighting direction, intensity, color and rim light.' };
  if (has('upscale', 'super-resolution', 'realesrgan', 'swinir') || modeOf(n) === 'image-upscale') return { githubProject: 'Real-ESRGAN / SwinIR', apiCapability: 'image-super-resolution', outputType: 'upscaled-image', resolution: n.options?.resolution || n.options?.imageClarity || '4K', projectPromptHint: 'Real-ESRGAN or SwinIR style: improve clarity, details and sharpness while preserving content.' };
  if (has('outpaint')) return { githubProject: 'Stable Diffusion Outpainting / LaMa', apiCapability: 'image-outpainting', outputType: 'outpainted-image', projectPromptHint: 'Outpainting style: extend the image beyond original borders while preserving perspective, lighting and style.' };
  if (has('inpaint', 'erase', 'redraw')) return { githubProject: 'LaMa / Stable Diffusion Inpaint', apiCapability: has('erase') ? 'object-removal-inpaint' : 'image-redraw', outputType: 'inpainted-image', projectPromptHint: 'Inpainting style: repair or redraw requested areas while preserving identity, layout and style.' };
  if (has('cutout', 'background-removal', 'remove-background')) return { githubProject: 'rembg / BiRefNet', apiCapability: 'background-removal', outputType: 'transparent-cutout', transparentBackground: true, projectPromptHint: 'rembg or BiRefNet style: extract the main subject with clean edges and transparent background.' };
  if (has('grid', 'split')) return { githubProject: 'grid-split-api', apiCapability: 'grid-split', outputType: 'grid-split-image', projectPromptHint: 'Grid split/contact sheet style: produce the requested grid layout while keeping each tile clear and usable.' };
  return {};
};

const extractRemoteUrl = (r: any): string | undefined => {
  const u = r?.data?.[0]?.url || r?.data?.url || r?.images?.[0]?.url || r?.results?.[0]?.url || r?.url;
  return (typeof u === 'string' && /^https?:\/\//i.test(u)) ? u : undefined;
};

const callApi = async (c: APIConfig, n: AINode) => {
  const mode = modeOf(n), apiBase = redirectAgnesHost(normalizeApiBase(c.baseUrl)), model = n.model || n.options?.model || c.defaultModel, prompt = composePrompt(n.options?.upstreamPrompt, n.prompt) || '', win = window as any;
  const imageRefs = Array.isArray(n.options?.referenceImages) ? n.options.referenceImages.map((item: any) => item?.url).filter(Boolean) : [];
  const sourceImage = n.options?.sourceImage || imageRefs[0];
  const isPanorama720 = n.options?.panoramaType === '720' || n.options?.mediaFeature === '720度全景图' || /720度?全景|720 panorama/i.test(prompt);
  const imageSize = isPanorama720 ? '2048x1024' : n.options?.size || n.size || '1024x1024';
  const capabilityPayload = directImageCapability(n, prompt);
  const enhancedPrompt = capabilityPayload.projectPromptHint ? composePrompt(prompt, capabilityPayload.projectPromptHint) : prompt;
  const imagePayload = { model, prompt: enhancedPrompt, size: capabilityPayload.size || imageSize, imageSize: capabilityPayload.size || imageSize, n: 1, ...capabilityPayload, ...n.options, image: sourceImage, images: sourceImage ? [sourceImage, ...imageRefs.filter((url: string) => url !== sourceImage)] : imageRefs, sourceImage, panoramaType: isPanorama720 ? '720' : n.options?.panoramaType || (capabilityPayload as any).panoramaType, outputType: isPanorama720 ? 'panorama' : n.options?.outputType || (capabilityPayload as any).outputType, aspectRatio: n.options?.aspectRatio || n.aspectRatio || n.options?.imageRatio || (capabilityPayload as any).aspectRatio || (isPanorama720 ? '2:1' : undefined), resolution: n.options?.resolution || n.resolution || n.options?.imageClarity || (capabilityPayload as any).resolution || (isPanorama720 ? '2K' : undefined) };
  if (mode === 'tts' || mode === 'audio2video') {
    // 优先使用设置页配置的语音 API（支持豆包语音 / OpenAI 兼容等自定义语音接口）；未配置时回退内置 Edge TTS
    if (c.apiKey && c.baseUrl && !String(c.baseUrl).trim().startsWith('edge-tts://')) {
      try {
        const vres = await toolService.generateVoice(prompt, c, { voice: n.options?.voice || c.defaultModel || '' });
        if (vres?.url) return { url: vres.url, type: 'audio' as const };
      } catch (e: any) {
        throw new Error('语音生成失败：' + (e?.message || String(e)));
      }
    }
    if (win?.yijingAPI?.edgeTts?.synthesizeToBase64) { const res = await win.yijingAPI.edgeTts.synthesizeToBase64({ text: prompt, voice: n.options?.voice || EDGE_TTS_MODELS[0], options: { rate: n.options?.speed } }); if (res?.ok && res?.base64) { return { url: `data:audio/mpeg;base64,${res.base64}`, type: 'audio' as const }; } throw new Error(res?.error || 'Edge TTS 合成失败，请确认已安装 edge-tts（pip install edge-tts）'); } if (win?.yijingAPI?.edgeTTS?.speak) { const r = await win.yijingAPI.edgeTTS.speak({ text: prompt, voice: n.options?.voice || EDGE_TTS_MODELS[0], rate: n.options?.speed || 1 }); return { url: extractUrl(r), type: 'audio' as const }; } return { url: `edge-tts://${encodeURIComponent(prompt)}`, type: 'audio' as const };
  }
  if (imageModes.has(mode)) { if (win?.yijingAPI?.openai?.generate) { const r = await win.yijingAPI.openai.generate({ apiKey: c.apiKey, baseUrl: apiBase, ...imagePayload }); const errMsg = r?.error?.message || (typeof r?.error === 'string' ? r.error : '') || r?.message; if (errMsg) throw new Error(String(errMsg)); const imgUrl = extractUrl(r); if (!imgUrl) throw new Error('图片生成未返回结果（可能模型不支持或返回了 base64 之外的结构）：' + JSON.stringify(r).slice(0, 200)); const imgRemote = extractRemoteUrl(r); return { url: imgUrl, type: 'image' as const, remoteUrl: imgRemote }; } const r = await fetch(`${apiBase}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(imagePayload) }); const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || d?.error || `HTTP ${r.status}`); const imgUrl = extractUrl(d); if (!imgUrl) throw new Error('图片生成未返回结果：' + JSON.stringify(d).slice(0, 200)); const imgRemote = extractRemoteUrl(d); return { url: imgUrl, type: 'image' as const, remoteUrl: imgRemote }; }
  if (videoModes.has(mode)) {
    // 从 videoConfig 或节点选项中提取视频参数
    const vc = n.options?.videoConfig || {};
    // 智能双轨·轨B：配置了方舟 AK/SK 时，把 TOS URL 参考图转 asset:// 素材资产引用（增强信任、规避真人卡图）；未配置回退轨A（TOS URL 直接透传）
    // 注意：视频生成 API 不支持 asset:// 作为 image_url（会报 resource download failed），因此视频生成时强制使用轨A（TOS URL 直接透传）
    let videoRefs = imageRefs;
    const volcApi = win?.yijingAPI?.volc;
    const isVideoGen = true; // 此处为视频生成流程，禁用 asset:// 转换
    if (!isVideoGen && (c as any).accessKeyId && (c as any).accessKeySecret && volcApi?.createAsset && videoRefs.some((r: string) => /^https?:\/\//i.test(r))) {
      try {
        const converted: string[] = [];
        for (const r of videoRefs) {
          if (/^https?:\/\//i.test(r)) {
            const aRes = await volcApi.createAsset({ ak: (c as any).accessKeyId, sk: (c as any).accessKeySecret, url: r, name: 'ref_' + Date.now() });
            converted.push(aRes?.ok && aRes?.assetUri ? aRes.assetUri : r);
          } else converted.push(r);
        }
        videoRefs = converted;
      } catch { /* 转换失败回退轨A */ }
    }
    const payload = {
      model,
      prompt,
      // 先展开节点其它选项，随后由下方显式计算的字段覆盖，
      // 保证「输入框下方参数」（videoConfig / videoRatio 等）真正生效，
      // 而不会被 n.options 中的旧值覆盖掉。
      ...n.options,
      // 参考图（轨A=TOS URL / 轨B=asset://，主进程原样透传）
      referenceImages: videoRefs,
      images: videoRefs,
      image: videoRefs[0] || n.options?.image,
      // 视频比例（优先使用最新的 videoConfig / videoRatio）
      aspectRatio: vc.ratio || n.options?.videoRatio || n.options?.aspectRatio || n.aspectRatio || '16:9',
      // 清晰度/分辨率
      resolution: vc.clarity || n.options?.videoClarity || n.options?.resolution || n.resolution || '720p',
      // 时长（秒）
      duration: vc.duration || n.options?.videoDuration || 5,
      // 是否生成音频
      generateAudio: vc.generateAudio !== undefined ? vc.generateAudio : (n.options?.generateAudio !== false),
      // 运镜参数
      cameraMovement: vc.cameraMovement || (n.options?.cameraMovementId ? {
        id: n.options.cameraMovementId,
        name: n.options.cameraMovementName,
        prompt: n.options.cameraMovementPrompt,
      } : null),
    };
    if (win?.yijingAPI?.grsai?.generate) {
      const r = await win.yijingAPI.grsai.generate({ baseUrl: apiBase, apiKey: c.apiKey, ...payload });
      if (r?.accepted && r?.id) return { url: '', type: 'video' as const, jobId: r.id };
      const url = extractUrl(r);
      if (!url) throw new Error('视频生成未返回 URL：' + JSON.stringify(r).slice(0, 100));
      return { url, type: 'video' as const };
    }
    const r = await fetch(`${apiBase}/videos`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || d?.error || `HTTP ${r.status}`);
    const url = extractUrl(d);
    if (!url) throw new Error('视频生成未返回 URL：' + JSON.stringify(d).slice(0, 100));
    return { url, type: 'video' as const };
  }
  // 优先使用主进程 IPC（统一在主进程规范化 baseUrl + 添加 /v1）
  if (win?.yijingAPI?.openai?.chat) { const r = await win.yijingAPI.openai.chat({ apiKey: c.apiKey, baseUrl: c.baseUrl, model, messages: [{ role: 'user', content: prompt }] }); const data = r?.data; if (!r?.ok || !r?.connected) throw new Error(data?.error?.message || data?.error || r?.error || `HTTP ${r?.status || '未知'}`); const text = data?.choices?.[0]?.message?.content || data?.text || JSON.stringify(data); return { url: text, text, type: 'text' as const }; }
  const r = await fetch(`${apiBase}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }) }); const d = await r.json(); if (!r.ok) throw new Error(d?.error?.message || d?.error || `HTTP ${r.status}`); const text = d?.choices?.[0]?.message?.content || d?.text || JSON.stringify(d); return { url: text, text, type: 'text' as const };
};

const callComfy = async (c: ComfyUIConfig, n: AINode) => {
  const serverUrl = base(c.serverUrl);
  const win = window as any;
  // 只有真正是 JSON 对象（或可解析为对象的字符串）时才认为「用户已粘贴工作流」；
  // 否则一律走「填了 ComfyUI 地址即自动搭建」路径：官方模板 → 内置回退。
  const _pickWf = (v: any): any => {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim().startsWith('{')) {
      try { return JSON.parse(v); } catch { return null; }
    }
    return null;
  };
  let workflow: any = _pickWf(c.workflowJSON)
    || _pickWf(n.workflow)
    || _pickWf(n.options?.workflow)
    || _pickWf(c.apiFile)
    || null;
  // 画布下拉选择了「该服务器下扫描到的工作流」→ 直接用对应 JSON（未选择或「自动搭建」时跳过）
  if (!workflow && Array.isArray(c.workflowFiles) && c.workflowFiles.length > 0) {
    const wfName = String(n.model || n.options?.workflowName || '');
    if (wfName && wfName !== '自动搭建') {
      const hit = c.workflowFiles.find((w: any) => String(w?.name || '') === wfName);
      if (hit) workflow = _pickWf(hit.content) || _pickWf(hit.workflow) || null;
    }
  }
  // 若没有可用的 workflow（既没粘贴，也没在节点上指定），
  // 优先复用同类型缓存的工作流；否则按功能类型自动解析（官方模板→内置回退），并回写缓存供下次复用。
  // 将当前节点判定为视频/图片：优先看 nodeType/AINodeType，其次看 generationType（含参考类别名）。
  const kindIsVideo = c.nodeType === 'video' || videoModes.has(String(n.type)) || videoModes.has(modeOf(n));
  const kindIsAudio = c.nodeType === 'audio';
  const kind: 'image' | 'video' | 'audio' = kindIsVideo ? 'video' : kindIsAudio ? 'audio' : 'image';
  const hasWorkflowObject = workflow && typeof workflow === 'object';
  if (!hasWorkflowObject) {
    // 规范化 feature：视频节点若 generationType 不是标准视频功能（如「reference/image-reference/first-frame」等）
    // 会导致按图片解析工作流，这里回退到 n.type（AINodeType）或最贴近的视频功能。
    let rawFeature: any = modeOf(n) || n.type;
    if (kindIsVideo && !videoModes.has(String(rawFeature))) {
      // 常见业务别名 → 标准 AINodeType
      const alias: Record<string, string> = {
        'reference': 'text-to-video',
        'text-to-video-ref': 'text-to-video',
        'image-reference': 'image-to-video',
        'first-frame': 'frame-to-video',
        'audio2video': 'lip-sync',
      };
      rawFeature = alias[String(rawFeature)] || n.type || 'text-to-video';
    }
    const feature = rawFeature as any;
    // 1) 节点指定了缓存工作流名（node.options.workflowCacheId 或 node.model 命中缓存名）
    // 将画布节点上的选项（比例/清晰度/时长/张数/参考图/负面词/采样超参）
    // 归一化为 builtin 工作流构造函数期望的字段（width/height/frames/fps/steps/cfg/seed/negativePrompt），
    // 保证 ComfyUI 工作流真按输入框下方的参数搭建。
    const _optsIn: any = n.options || {};
    const _vc: any = _optsIn.videoConfig || {};
    const _parseRatio = (r: any): { rw: number; rh: number } | null => {
      if (!r || r === 'auto') return null;
      const m = String(r).match(/^(\d+(?:\.\d+)?)\s*[:xX×]\s*(\d+(?:\.\d+)?)$/);
      if (!m) return null;
      const rw = Number(m[1]); const rh = Number(m[2]);
      return (rw > 0 && rh > 0) ? { rw, rh } : null;
    };
    const _clarityBase = (v: any, fb: number): number => {
      const s = String(v || '').trim().toUpperCase();
      if (/^\d+P$/.test(s)) return parseInt(s.replace('P',''), 10) || fb;
      if (s === '4K') return 2048;
      if (s === '2K') return 1440;
      if (s === '1K') return 1024;
      const n2 = parseInt(s, 10);
      return n2 > 0 ? n2 : fb;
    };
    const _sizeFor = (rObj: { rw: number; rh: number } | null, base: number): { w: number; h: number } => {
      if (!rObj) return { w: base, h: base };
      let w: number, h: number;
      if (rObj.rw >= rObj.rh) { h = base; w = Math.round(base * rObj.rw / rObj.rh); }
      else { w = base; h = Math.round(base * rObj.rh / rObj.rw); }
      w = Math.max(64, Math.round(w / 8) * 8);
      h = Math.max(64, Math.round(h / 8) * 8);
      return { w, h };
    };
    const _imgWH = _sizeFor(_parseRatio(_optsIn.imageRatio || _optsIn.aspectRatio || ''), _clarityBase(_optsIn.imageClarity || _optsIn.resolution || _optsIn.size, 1024));
    const _vidWH = _sizeFor(_parseRatio(_vc.ratio || _optsIn.videoRatio || ''), _clarityBase(_vc.clarity || _optsIn.videoClarity, kindIsVideo ? 720 : 1024));
    const _fps = Number(_vc.fps || _optsIn.fps || _optsIn.videoFps || (kindIsVideo ? 24 : 0)) || (kindIsVideo ? 24 : 0);
    const _duration = Number(_vc.duration || _optsIn.videoDuration || 0) || 0;
    let _frames = 0;
    if (kindIsVideo) {
      if (_duration > 0 && _fps > 0) _frames = Math.max(1, Math.round(_duration * _fps));
      else if (Number(_vc.frames) > 0) _frames = Math.round(Number(_vc.frames));
      else if (Number(_optsIn.numFrames) > 0) _frames = Math.round(Number(_optsIn.numFrames));
      else _frames = 16;
    }
    const _gp: any = _optsIn.generationParams || {};
    const _batch = Number(_optsIn.numberOfImages || _optsIn.batchSize || _optsIn.n || 1) || 1;
    const builtOpts: any = {
      ..._optsIn,
      width: (kindIsVideo ? _vidWH.w : _imgWH.w),
      height: (kindIsVideo ? _vidWH.h : _imgWH.h),
      frames: kindIsVideo ? _frames : undefined,
      fps: kindIsVideo ? (_fps || 24) : undefined,
      batch_size: _batch,
      seed: (_gp.seed ?? _optsIn.seed) !== undefined ? Number(_gp.seed ?? _optsIn.seed) : undefined,
      steps: (_gp.steps ?? _optsIn.steps) !== undefined ? Number(_gp.steps ?? _optsIn.steps) : undefined,
      cfg: (_gp.cfg ?? _optsIn.cfg ?? _gp.guidance ?? _optsIn.guidance) !== undefined ? Number(_gp.cfg ?? _optsIn.cfg ?? _gp.guidance ?? _optsIn.guidance) : undefined,
      sampler: _gp.sampler ?? _optsIn.sampler,
      scheduler: _gp.scheduler ?? _optsIn.scheduler,
      denoise: (_gp.denoise ?? _optsIn.denoise) !== undefined ? Number(_gp.denoise ?? _optsIn.denoise) : undefined,
      negativePrompt: _optsIn.negativePrompt || _optsIn.negative_prompt || _gp.negativePrompt || inferComfyNegativePrompt(composePrompt(n.options?.upstreamPrompt, n.prompt), kind),
      referenceCount: Array.isArray(_optsIn.referenceImages) ? _optsIn.referenceImages.length : 0,
      hasSourceImage: !!_optsIn.sourceImage,
      generateAudio: _vc.generateAudio !== undefined ? !!_vc.generateAudio : (_optsIn.generateAudio !== undefined ? !!_optsIn.generateAudio : undefined),
    };
    const cacheList = useAppStore.getState().getComfyWorkflowCache(feature, serverUrl);
    const wantCacheId = n.options?.workflowCacheId;
    const wantName = n.model || n.options?.workflowName;
    // 参数指纹：把当前节点关键参数编码成短哈希，作为缓存 key 的一部分
    const paramFp = buildWorkflowParamFingerprint(builtOpts);
    // 1) 用户显式指定 workflowCacheId / model / workflowName 时走精确匹配
    // 2) 否则用「服务器+功能+参数指纹」匹配上一次同参数搭建过的 workflow，复用避免每次重搭
    const cached = (wantCacheId && cacheList.find(x => x.id === wantCacheId))
      || (wantName && cacheList.find(x => x.name === wantName))
      || cacheList.find(x => x.paramFingerprint === paramFp)
      || undefined;
    if (cached && cached.workflow) {
      workflow = JSON.parse(JSON.stringify(cached.workflow));
    } else {
      const resolved = await resolveWorkflowForFeature(serverUrl, feature, n.prompt || '', builtOpts);
      if (resolved.ok && resolved.workflow) {
        workflow = resolved.workflow;
        // 回写缓存：同 服务器+功能+来源+参数指纹 只保留一条，命名便于节点下拉展示
        try {
          const srcLabel = resolved.source === 'official-template' ? '官方模板' : resolved.source === 'builtin' ? '内置' : '手动';
          const nm = resolved.templateName ? `${resolved.templateName} · ${paramFp}` : `${feature}·${srcLabel}·${paramFp}`;
          useAppStore.getState().saveComfyWorkflowCache({ name: nm, feature, serverUrl, source: resolved.source as any, templateName: resolved.templateName, workflow: resolved.workflow, options: n.options || {}, paramFingerprint: paramFp });
        } catch { /* 缓存失败不影响生成 */ }
      } else {
        throw new Error(resolved.error || '未能为该节点自动搭建 ComfyUI 工作流，请在 ComfyUI 配置中粘贴工作流或安装所需模型/节点');
      }
    }
  }
  // 合并配置页勾选的组件（含 targetNodeId/inputKey/defaultValue）与节点上覆盖的值。
  // 主进程 comfyui:generate 期望每个组件带 value 字段，这里把 defaultValue 归一为 value，
  // 并允许节点 options.comfyComponents（数组或以 "targetNodeId:inputKey" 为键的对象）覆盖默认值。
  const configComponents = Array.isArray(c.components) ? c.components : [];
  const nodeOverrides = n.options?.comfyComponents;
  const findOverride = (comp: any) => {
    if (!nodeOverrides) return undefined;
    const key = `${comp.targetNodeId}:${comp.inputKey || comp.name}`;
    if (Array.isArray(nodeOverrides)) return nodeOverrides.find((x: any) => `${x.targetNodeId}:${x.inputKey || x.name}` === key || x.name === comp.name);
    if (typeof nodeOverrides === 'object') return nodeOverrides[key] ?? nodeOverrides[comp.name];
    return undefined;
  };
  const mergedComponents = configComponents.map((comp: any) => {
    const override = findOverride(comp);
    const overrideValue = override && typeof override === 'object' ? override.value : override;
    const value = overrideValue !== undefined && overrideValue !== null && overrideValue !== ''
      ? overrideValue
      : (comp.value ?? comp.defaultValue);
    return { ...comp, value };
  });
  // 收集参考图/参考视频：优先 sourceImage，其次 referenceImages 数组，
  // 供主进程上传到 ComfyUI 的 LoadImage / LoadVideo 等加载节点。
  const refList = Array.isArray(n.options?.referenceImages)
    ? n.options.referenceImages.filter((it: any) => it && it.url)
    : [];
  const referenceMedia = [
    ...(n.options?.sourceImage ? [{ url: n.options.sourceImage, kind: 'image' }] : []),
    ...refList.map((it: any) => ({ url: it.url, kind: it.kind || 'image', name: it.name })),
  ].filter((it, idx, arr) => it.url && arr.findIndex(x => x.url === it.url) === idx);
  // 组合最终提交给 ComfyUI 的提示词：主提示词 + 运镜提示词（如有）
  const vcCam = n.options?.videoConfig?.cameraMovement || (n.options?.cameraMovementId ? { prompt: n.options?.cameraMovementPrompt } : null);
  const cameraPromptText = (vcCam && (vcCam as any).prompt) ? String((vcCam as any).prompt) : (n.options?.cameraMovementPrompt || '');
  const finalPrompt = [n.options?.upstreamPrompt || '', n.prompt || '', cameraPromptText].filter(x => x && String(x).trim()).join(', ').trim();
  // 主进程 comfyui:generate IPC 期望的字段名为 workflowJson。
  // 明确把 isVideo/kind 传给主进程，便于按视频还是图片注入 width/height/frame_count/batch_size 等参数。
  const injectHint = { isVideo: kind === 'video', isAudio: kind === 'audio', kind };
  const autoNegativePrompt = n.options?.negativePrompt || n.options?.negative_prompt || n.options?.generationParams?.negativePrompt || inferComfyNegativePrompt(finalPrompt, kind);
  const payload: any = { serverUrl, workflowJson: workflow, prompt: finalPrompt, options: { ...(n.options || {}), negativePrompt: autoNegativePrompt, __injectHint: injectHint }, model: n.model, params: { components: mergedComponents }, referenceMedia };
  // 期望结果类型：与上方 kind 判定保持一致（含视频节点即使 generationType 是「reference」等别名的场景）
  const expectedType: 'image' | 'video' | 'audio' = kind;
  if (win?.yijingAPI?.comfyui?.generate) {
    const r = await win.yijingAPI.comfyui.generate(payload);
    if (r?.ok === false) throw new Error(r?.error || 'ComfyUI 生成失败');
    // 优先使用主进程按类型归类的结果数组，其次回退到通用提取
    const videoUrl = Array.isArray(r?.videoFiles) ? r.videoFiles[0] : undefined;
    const audioUrl = Array.isArray(r?.audioFiles) ? r.audioFiles[0] : undefined;
    const imageUrl = Array.isArray(r?.files) ? r.files[0] : undefined;
    let url = '';
    let type: 'image' | 'video' | 'audio' = expectedType;
    if (expectedType === 'video' && videoUrl) { url = videoUrl; type = 'video'; }
    else if (expectedType === 'audio' && audioUrl) { url = audioUrl; type = 'audio'; }
    else if (videoUrl) { url = videoUrl; type = 'video'; }
    else if (imageUrl) { url = imageUrl; type = 'image'; }
    else if (audioUrl) { url = audioUrl; type = 'audio'; }
    else { url = r?.url || extractUrl(r?.data || r); }
    if (!url) throw new Error('ComfyUI 未返回结果文件');
    return { url, type };
  }
  const r = await fetch(`${serverUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || `ComfyUI HTTP ${r.status}`);
  const url = extractUrl(d) || d?.prompt_id || '';
  return { url, type: resultType(url, videoModes.has(modeOf(n)) ? 'video' : 'image') };
};

export const useAppStore = create<AppState>()(persist((set, get) => ({
  // 授权状态
  licenseStatus: 'loading' as AppState['licenseStatus'],
  licenseInfo: null,
  setLicenseStatus: (status, info) => set({ licenseStatus: status, licenseInfo: info ?? get().licenseInfo }),
  
  mediaPreview: null, toast: null, sidebarCollapsed: false, activeSection: 'home', activeCanvasId: null,
  chatSessions: [], activeSessionId: null, isGenerating: false, selectedProvider: 'openai', selectedModel: '', generationType: 'text-chat', defaultProvider: 'openai', defaultModel: '',
  apiConfigs: [], chatAPIConfigs: [], imageAPIConfigs: [], videoAPIConfigs: [], voiceAPIConfigs: [], musicAPIConfigs: [], comfyuiConfigs: [], voiceLibrary: [], recommendedConfigs: [], generationParams: {}, assistantSettings: { voiceSource: 'edge-tts', speakReplies: false, nodeBackend: 'ask' }, comfyWorkflowCache: [],
  assets: {}, assetFolders: { [rootFolderId]: rootFolder() }, selectedFolderId: rootFolderId, assetClipboard: null, rootFolderId,
  canvasHistory: [], canvasGridVisible: true, nodes: {}, undoStack: [], redoStack: [], clipboard: null, activeNodeId: null,
  taskQueue: [], queuePanelOpen: false,
  dramaRecords: [], currentDramaRecordId: null, dramaApiConfigId: '', dramaModel: '', promptLibrary: [], searchQuery: '', searchResults: [], storyboardPresets: [],
  dramartProjects: [], activeDramartId: null, dramartDraft: null, dramartCreateParams: { mode: 'agent', ratio: '9:16', resolution: '720p', styleId: 'modern-city' }, dramartCustomStyles: [],
  modelscopeConfig: null,
  stockMediaSources: [],

  setMediaPreview: mediaPreview => set({ mediaPreview }),
  showToast: (message, type = 'info') => { set({ toast: { message, type } }); window.setTimeout(() => useAppStore.setState({ toast: null }), 2400); },
  toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })), setActiveSection: activeSection => set({ activeSection, activeCanvasId: null }), setActiveCanvas: activeCanvasId => set({ activeCanvasId }), setQueuePanelOpen: v => set({ queuePanelOpen: v }),
  submitDramaDraft: (project) => set(s => ({ dramartDraft: project, dramartProjects: [project, ...s.dramartProjects.filter(x => x.id !== project.id)], activeDramartId: project.id, activeSection: 'drama-workshop', activeCanvasId: null })),
  clearDramartDraft: () => set({ dramartDraft: null }),
  setActiveDramartId: activeDramartId => set({ activeDramartId }),
  updateDramartProject: (id, updater) => set(s => ({ dramartProjects: s.dramartProjects.map(p => p.id === id ? updater(p) : p) })),
  // 剧创工厂：自动保存项目（覆盖写入 + 设为当前），供持久化
  saveDramartProject: (project) => set(s => ({ dramartProjects: [project, ...s.dramartProjects.filter(x => x.id !== project.id)], activeDramartId: project.id })),
  // 剧创工厂：删除创作历史记录（同时清掉对应当前项目）
  deleteDramartProject: (id) => set(s => ({ dramartProjects: s.dramartProjects.filter(x => x.id !== id), activeDramartId: s.activeDramartId === id ? null : s.activeDramartId })),
  // 剧创工厂：创建页参数选择自动保存（比例/分辨率/风格/模式）
  setDramartCreateParams: (params) => set(s => ({ dramartCreateParams: { ...s.dramartCreateParams, ...params } })),
  // 剧创工厂：自定义风格保存/删除（持久化）
  saveDramartCustomStyle: (style) => set(s => ({ dramartCustomStyles: [style, ...s.dramartCustomStyles.filter(x => x.id !== style.id)] })),
  deleteDramartCustomStyle: (id) => set(s => ({ dramartCustomStyles: s.dramartCustomStyles.filter(x => x.id !== id) })),
  addToQueue: nid => set(s => (s.taskQueue.includes(nid) ? s : { taskQueue: [...s.taskQueue, nid] })),
  removeFromQueue: nid => set(s => ({ taskQueue: s.taskQueue.filter(x => x !== nid) })),
  clearCompletedTasks: () => set(s => ({ taskQueue: s.taskQueue.filter(nid => { const n = s.nodes[nid]; return n && n.status !== 'success' && n.status !== 'error'; }) })),
  executeQueue: async () => { const queue = [...get().taskQueue]; for (const nid of queue) { const n = get().nodes[nid]; if (!n || n.status === 'success') continue; await get().executeNode(nid); } set(s => ({ taskQueue: s.taskQueue.filter(nid => { const n = s.nodes[nid]; return n && n.status !== 'success' && n.status !== 'error'; }) })); },
  createChatSession: () => { const cid = id(); const session: ChatSession = { id: cid, title: '新对话', messages: [], createdAt: Date.now(), updatedAt: Date.now() }; set(s => ({ chatSessions: [session, ...s.chatSessions], activeSessionId: cid })); return cid; },
  deleteChatSession: sid => set(s => ({ chatSessions: s.chatSessions.filter(x => x.id !== sid), activeSessionId: s.activeSessionId === sid ? null : s.activeSessionId })),
  setActiveSession: activeSessionId => set({ activeSessionId }), updateChatSession: (sid, u) => set(s => ({ chatSessions: s.chatSessions.map(x => x.id === sid ? { ...x, ...u, title: u.title !== undefined ? sanitizeText(u.title, '新对话') : x.title, updatedAt: Date.now() } : x) })),
  addMessage: (sid, m) => { const mid = id(); const msg: ChatMessage = { ...m, id: mid, timestamp: Date.now() }; set(s => ({ chatSessions: s.chatSessions.map(x => x.id === sid ? { ...x, messages: [...x.messages, msg], updatedAt: Date.now() } : x) })); return mid; },
  updateMessage: (sid, mid, u) => set(s => ({ chatSessions: s.chatSessions.map(x => x.id === sid ? { ...x, messages: x.messages.map(m => m.id === mid ? { ...m, ...u } : m), updatedAt: Date.now() } : x) })),
  deleteMessage: (sid, mid) => set(s => ({ chatSessions: s.chatSessions.map(x => x.id === sid ? { ...x, messages: x.messages.filter(m => m.id !== mid), updatedAt: Date.now() } : x) })),
  setGenerating: isGenerating => set({ isGenerating }), setSelectedProvider: selectedProvider => set({ selectedProvider }), setSelectedModel: selectedModel => set({ selectedModel }), setGenerationType: generationType => set({ generationType }), setDefaultConfig: (defaultProvider, defaultModel) => set({ defaultProvider, defaultModel }), setDramaApiConfig: dramaApiConfigId => set({ dramaApiConfigId }), setDramaModel: dramaModel => set({ dramaModel }),

  addAPIConfig: c => { const cid = id(), item = { ...c, id: cid, models: [] }; set(s => ({ apiConfigs: [...s.apiConfigs, item], chatAPIConfigs: [...s.chatAPIConfigs, item] })); return cid; },
  updateAPIConfig: (cid, u) => set(s => { const apiConfigs = s.apiConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c); const chatAPIConfigs = s.chatAPIConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c); return { apiConfigs, chatAPIConfigs }; }), deleteAPIConfig: cid => set(s => ({ apiConfigs: s.apiConfigs.filter(c => c.id !== cid), chatAPIConfigs: s.chatAPIConfigs.filter(c => c.id !== cid) })), testAPIConnection: async cid => { const ok = await testConfig(get().apiConfigs.find(c => c.id === cid)); get().updateAPIConfig(cid, { connected: ok }); return ok; },
  addImageAPIConfig: c => { const cid = id(); set(s => ({ imageAPIConfigs: [...s.imageAPIConfigs, { ...c, id: cid, models: [] }] })); return cid; }, updateImageAPIConfig: (cid, u) => set(s => ({ imageAPIConfigs: s.imageAPIConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c) })), deleteImageAPIConfig: cid => set(s => ({ imageAPIConfigs: s.imageAPIConfigs.filter(c => c.id !== cid) })), testImageAPIConnection: async cid => { const ok = await testConfig(get().imageAPIConfigs.find(c => c.id === cid)); get().updateImageAPIConfig(cid, { connected: ok }); return ok; },
  addVideoAPIConfig: c => { const cid = id(); set(s => ({ videoAPIConfigs: [...s.videoAPIConfigs, { ...c, id: cid, models: [] }] })); return cid; }, updateVideoAPIConfig: (cid, u) => set(s => ({ videoAPIConfigs: s.videoAPIConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c) })), deleteVideoAPIConfig: cid => set(s => ({ videoAPIConfigs: s.videoAPIConfigs.filter(c => c.id !== cid) })), testVideoAPIConnection: async cid => { const ok = await testConfig(get().videoAPIConfigs.find(c => c.id === cid)); get().updateVideoAPIConfig(cid, { connected: ok }); return ok; },
  addVoiceAPIConfig: c => { const cid = id(); set(s => ({ voiceAPIConfigs: [...s.voiceAPIConfigs, { ...c, id: cid, models: [] }] })); return cid; }, updateVoiceAPIConfig: (cid, u) => set(s => ({ voiceAPIConfigs: s.voiceAPIConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c) })), deleteVoiceAPIConfig: cid => set(s => ({ voiceAPIConfigs: s.voiceAPIConfigs.filter(c => c.id !== cid) })), testVoiceAPIConnection: async cid => { const ok = await testVoiceConfig(get().voiceAPIConfigs.find(c => c.id === cid)); get().updateVoiceAPIConfig(cid, { connected: ok }); return ok; },
  addMusicAPIConfig: c => { const cid = id(); set(s => ({ musicAPIConfigs: [...s.musicAPIConfigs, { ...c, id: cid, models: [] }] })); return cid; }, updateMusicAPIConfig: (cid, u) => set(s => ({ musicAPIConfigs: s.musicAPIConfigs.map(c => c.id === cid ? { ...c, ...u, models: u.models || [] } : c) })), deleteMusicAPIConfig: cid => set(s => ({ musicAPIConfigs: s.musicAPIConfigs.filter(c => c.id !== cid) })), testMusicAPIConnection: async cid => { const ok = await testConfig(get().musicAPIConfigs.find(c => c.id === cid)); get().updateMusicAPIConfig(cid, { connected: ok }); return ok; },
  addComfyUIConfig: c => { const cid = id(); set(s => ({ comfyuiConfigs: [...s.comfyuiConfigs, { ...c, id: cid, port: undefined }] })); return cid; }, updateComfyUIConfig: (cid, u) => set(s => ({ comfyuiConfigs: s.comfyuiConfigs.map(c => c.id === cid ? { ...c, ...u, port: undefined } : c) })), deleteComfyUIConfig: cid => set(s => ({ comfyuiConfigs: s.comfyuiConfigs.filter(c => c.id !== cid) })), addVoiceToLibrary: v => { const vid = id(); set(s => ({ voiceLibrary: [{ ...v, id: vid, createdAt: Date.now() }, ...s.voiceLibrary] })); return vid; }, removeVoiceFromLibrary: vid => set(s => ({ voiceLibrary: s.voiceLibrary.filter(x => x.id !== vid) })), updateVoiceInLibrary: (vid, u) => set(s => ({ voiceLibrary: s.voiceLibrary.map(x => x.id === vid ? { ...x, ...u } : x) })), testComfyUIConnection: async cid => {const c = get().comfyuiConfigs.find(x => x.id === cid);if (!c?.serverUrl) return false;try {const win = window as any, url = base(c.serverUrl);if (win?.yijingAPI?.comfyui?.connect) {const result = await win.yijingAPI.comfyui.connect({ serverUrl: url, dataPath: c.dataPath });if (result?.ok) {get().updateComfyUIConfig(cid, { connected: true });return true;} else {get().updateComfyUIConfig(cid, { connected: false });return false;}} else {const resp = await fetch(`${url}/system_stats`);if (resp.ok) {get().updateComfyUIConfig(cid, { connected: true });return true;} else {get().updateComfyUIConfig(cid, { connected: false });return false;}}} catch {get().updateComfyUIConfig(cid, { connected: false });return false;}},
  addStockMediaSource: c => { const cid = id(); set(s => ({ stockMediaSources: [...(s.stockMediaSources || []), { ...c, id: cid }] })); return cid; }, updateStockMediaSource: (cid, u) => set(s => ({ stockMediaSources: (s.stockMediaSources || []).map(c => c.id === cid ? { ...c, ...u } : c) })), deleteStockMediaSource: cid => set(s => ({ stockMediaSources: (s.stockMediaSources || []).filter(c => c.id !== cid) })),
  addRecommendedConfig: c => { const cid = c.id || id(); const models = c.apiType === 'edge-tts' ? EDGE_TTS_MODELS : (c.models?.length ? c.models : (c.defaultModel ? [c.defaultModel] : [])); set(s => ({ recommendedConfigs: [...s.recommendedConfigs, { ...c, id: cid, models }] })); return cid; }, updateRecommendedConfig: (cid, u) => set(s => ({ recommendedConfigs: s.recommendedConfigs.map(c => { if (c.id !== cid) return c; const models = c.apiType === 'edge-tts' ? EDGE_TTS_MODELS : (u.models?.length ? u.models : (u.defaultModel ? [u.defaultModel] : c.models)); return { ...c, ...u, models }; }) })), deleteRecommendedConfig: cid => set(s => ({ recommendedConfigs: s.recommendedConfigs.filter(c => c.id !== cid) })), testRecommendedConnection: async cid => { const c = get().recommendedConfigs.find(x => x.id === cid); if (!c) return { ok: false, error: '配置不存在' }; if (c.apiType === 'edge-tts') { get().updateRecommendedConfig(cid, { baseUrl: 'edge-tts://local', apiKey: '', models: EDGE_TTS_MODELS }); return { ok: true }; } return { ok: await testConfig({ id: c.id, name: c.name, provider: 'openai', baseUrl: c.baseUrl, apiKey: c.apiKey, defaultModel: '', models: [], enabled: true, connected: false }) }; },
  fetchModelsForConfig: async (cid, overrides, kind) => { const s = get(); const c = [...s.apiConfigs, ...s.imageAPIConfigs, ...s.videoAPIConfigs, ...s.voiceAPIConfigs, ...s.musicAPIConfigs].find(x => x.id === cid); const r = s.recommendedConfigs.find(x => x.id === cid); if (r?.apiType === 'edge-tts') return { ok: true, models: EDGE_TTS_MODELS }; const cfg: any = c || r; if (!cfg) return { ok: false, error: '配置不存在' }; const useBaseUrl = overrides?.baseUrl ?? cfg.baseUrl; const useApiKey = overrides?.apiKey ?? cfg.apiKey; const preset = findPresetByBase(useBaseUrl); try { const win = window as any; let models: string[] = []; if (win?.yijingAPI?.grsai?.refreshModels) { const res = await win.yijingAPI.grsai.refreshModels({ baseUrl: useBaseUrl, apiKey: useApiKey, apiType: 'openai-chat' }); if (Array.isArray(res?.models)) models = res.models.map(String); } if (!models.length) { const resp = await fetch(`${base(useBaseUrl)}/models`, { headers: useApiKey ? { Authorization: `Bearer ${useApiKey}` } : {} }); const data = await resp.json(); models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name).filter(Boolean) : []; } if (kind) models = models.filter(m => classifyModel(String(m), preset) === kind); const feat = featuredOf(preset, kind); if (feat.length) { const avail = models.filter(m => feat.includes(String(m))); models = avail.length ? avail : feat; } return { ok: true, models }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; } }, clearAllRecommendedConfigs: () => set({ recommendedConfigs: [] }),
  setModelScopeConfig: c => set({ modelscopeConfig: c }),
  updateModelScopeConfig: u => set(s => ({ modelscopeConfig: s.modelscopeConfig ? { ...s.modelscopeConfig, ...u } : null })),
  testModelScopeConnection: async () => { const ms = get().modelscopeConfig; if (!ms) return { ok: false, error: '未配置 ModelScope' }; try { const resp = await fetch('https://modelscope.cn/api/v1/models', { headers: ms.apiKey ? { Authorization: `Bearer ${ms.apiKey}` } : {} }); return { ok: resp.ok }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; } },
  fetchModelScopeModels: async (category?: string) => { const ms = get().modelscopeConfig; if (!ms) return { ok: false, error: '未配置 ModelScope' }; try { const url = category ? `https://modelscope.cn/api/v1/models?category=${encodeURIComponent(category)}` : 'https://modelscope.cn/api/v1/models'; const resp = await fetch(url, { headers: ms.apiKey ? { Authorization: `Bearer ${ms.apiKey}` } : {} }); const data = await resp.json(); const models = (data?.Data || data?.data || []).map((m: any) => ({ id: m.Id || m.id || m.name, name: m.Name || m.name, description: m.Description || '', category: m.Tasks?.[0] || category || 'general' })); return { ok: true, models }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; } },
  callModelScopeModel: async (modelId: string, input: any) => { const ms = get().modelscopeConfig; if (!ms) return { ok: false, error: '未配置 ModelScope' }; try { const resp = await fetch(`https://modelscope.cn/api/v1/models/${encodeURIComponent(modelId)}/infer`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(ms.apiKey ? { Authorization: `Bearer ${ms.apiKey}` } : {}) }, body: JSON.stringify(input) }); const data = await resp.json(); if (!resp.ok) return { ok: false, error: data?.error || data?.message || `HTTP ${resp.status}` }; const url = data?.output?.url || data?.data?.url || data?.url || ''; return { ok: true, url }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; } },
  setGenerationParams: p => set(s => ({ generationParams: { ...s.generationParams, ...p } })),
  updateAssistantSettings: u => set(s => { const defaults = { voiceSource: 'edge-tts', speakReplies: false, nodeBackend: 'ask' } as any; const base = (s.assistantSettings && typeof s.assistantSettings === 'object') ? s.assistantSettings : defaults; return { assistantSettings: { ...defaults, ...base, ...(u || {}) } }; }),
  saveComfyWorkflowCache: item => {
    const now = Date.now();
    const base2 = (item.serverUrl || '').trim();
    const s2 = get();
    // 唯一键：feature + serverUrl + (paramFingerprint 有则以之为准，否则回退到 name)
    const fp = (item as any).paramFingerprint || '';
    const existing = s2.comfyWorkflowCache.find(x =>
      x.feature === item.feature
      && x.serverUrl === base2
      && (fp ? x.paramFingerprint === fp : x.name === item.name)
    );
    if (existing) {
      set(st => ({ comfyWorkflowCache: st.comfyWorkflowCache.map(x => x.id === existing.id ? { ...x, ...item, updatedAt: now } : x) }));
      return existing.id;
    }
    const cid = id();
    set(st => ({ comfyWorkflowCache: [{ ...item, id: cid, createdAt: now, updatedAt: now }, ...st.comfyWorkflowCache].slice(0, 200) }));
    return cid;
  },
  deleteComfyWorkflowCache: cid => set(s => ({ comfyWorkflowCache: s.comfyWorkflowCache.filter(x => x.id !== cid) })),
  getComfyWorkflowCache: (feature, serverUrl) => { const su = (serverUrl || '').trim(); return get().comfyWorkflowCache.filter(x => x.feature === feature && (!su || x.serverUrl === su)).sort((a, b) => b.updatedAt - a.updatedAt); },

  addAsset: a => { const aid = id(); const item: AssetItem = { ...a, id: aid, createdAt: Date.now() }; set(s => ({ assets: { ...s.assets, [aid]: item }, assetFolders: a.folderId && s.assetFolders[a.folderId] ? { ...s.assetFolders, [a.folderId]: { ...s.assetFolders[a.folderId], items: [...s.assetFolders[a.folderId].items, aid] } } : s.assetFolders })); return aid; }, deleteAsset: aid => set(s => { const { [aid]: _, ...assets } = s.assets; const assetFolders = Object.fromEntries(Object.entries(s.assetFolders).map(([fid, f]) => [fid, { ...f, items: f.items.filter(x => x !== aid) }])); return { assets, assetFolders }; }), createFolder: (name, parentId = rootFolderId) => { const fid = id(), folder: AssetFolder = { id: fid, name, parentId, children: [], items: [], createdAt: Date.now() }; set(s => ({ assetFolders: { ...s.assetFolders, [fid]: folder, [parentId]: s.assetFolders[parentId] ? { ...s.assetFolders[parentId], children: [...s.assetFolders[parentId].children, fid] } : rootFolder() } })); return fid; }, deleteFolder: fid => set(s => { const { [fid]: _, ...folders } = s.assetFolders; Object.keys(folders).forEach(k => folders[k] = { ...folders[k], children: folders[k].children.filter(x => x !== fid) }); return { assetFolders: folders, selectedFolderId: s.selectedFolderId === fid ? rootFolderId : s.selectedFolderId }; }), moveAssetToFolder: (aid, fid) => set(s => { const assets = { ...s.assets, [aid]: { ...s.assets[aid], folderId: fid } }; const folders = Object.fromEntries(Object.entries(s.assetFolders).map(([k, f]) => [k, { ...f, items: f.items.filter(x => x !== aid) }])); if (fid && folders[fid]) folders[fid] = { ...folders[fid], items: [...folders[fid].items, aid] }; return { assets, assetFolders: folders }; }), copyAsset: (aid, fid) => { const a = get().assets[aid]; if (a) get().addAsset({ ...a, name: `${a.name} 副本`, folderId: fid }); }, copyFolder: (fid, target = rootFolderId) => { const f = get().assetFolders[fid]; if (f) get().createFolder(`${f.name} 副本`, target); }, setSelectedFolderId: selectedFolderId => set({ selectedFolderId }), setAssetClipboard: assetClipboard => set({ assetClipboard }),
  saveCanvas: (name, data, thumbnail) => { const cid = id(); const c: CanvasHistory = { id: cid, name, data, thumbnail, createdAt: Date.now(), updatedAt: Date.now() }; set(s => ({ canvasHistory: [c, ...s.canvasHistory] })); return cid; }, updateCanvasData: (cid, data, thumbnail) => set(s => ({ canvasHistory: s.canvasHistory.map(c => c.id === cid ? { ...c, data: { ...(c.data || {}), ...data }, thumbnail: thumbnail ?? c.thumbnail, updatedAt: Date.now() } : c) })), deleteCanvas: cid => set(s => ({ canvasHistory: s.canvasHistory.filter(c => c.id !== cid), activeCanvasId: s.activeCanvasId === cid ? null : s.activeCanvasId })), updateCanvasName: (cid, name) => set(s => ({ canvasHistory: s.canvasHistory.map(c => c.id === cid ? { ...c, name, updatedAt: Date.now() } : c) })), loadCanvas: cid => { const c = get().canvasHistory.find(x => x.id === cid); set({ activeCanvasId: cid, nodes: c?.data?.nodes || {}, canvasGridVisible: c?.data?.canvasGridVisible ?? get().canvasGridVisible }); }, setCanvasGridVisible: canvasGridVisible => set({ canvasGridVisible }),
  addNode: n => { const nid = id(); set(s => ({ nodes: { ...s.nodes, [nid]: { ...n, id: nid, status: n.status || 'idle' } } })); return nid; }, updateNode: (nid, u) => set(s => ({ nodes: s.nodes[nid] ? { ...s.nodes, [nid]: { ...s.nodes[nid], ...u } } : s.nodes })), deleteNode: nid => set(s => { const { [nid]: _, ...nodes } = s.nodes; return { nodes }; }),
  executeNode: async (nid, videoConfig?) => {
    const n = get().nodes[nid];
    if (!n) return;
    set(s => ({ nodes: { ...s.nodes, [nid]: { ...s.nodes[nid], status: 'loading', error: undefined } } }));
    try {
      const mode = modeOf(n);
      const cfg = n.provider === 'comfyui'
        ? undefined
        : (videoModes.has(mode) ? get().videoAPIConfigs : imageModes.has(mode) ? get().imageAPIConfigs : mode === 'tts' ? get().voiceAPIConfigs : mode === 'video-to-music' ? get().musicAPIConfigs : get().apiConfigs).find(c => c.id === n.configId)
          || get().apiConfigs.find(c => c.id === n.configId)
          || get().imageAPIConfigs[0]
          || get().videoAPIConfigs[0]
          || get().apiConfigs[0];
      const comfy = n.provider === 'comfyui' ? get().comfyuiConfigs.find(c => c.id === n.configId) || get().comfyuiConfigs[0] : undefined;
      if (!cfg && !comfy && mode !== 'tts') throw new Error('请在设置页面配置可用的 API');
      // 合并 videoConfig 到节点选项
      const nodeWithConfig = videoConfig ? { ...n, options: { ...n.options, videoConfig } } : n;
      const res: any = comfy
        ? await callComfy(comfy, nodeWithConfig)
        : await callApi(cfg || { id: 'edge', name: 'Edge TTS', provider: 'openai', baseUrl: 'edge-tts://local', apiKey: '', defaultModel: EDGE_TTS_MODELS[0], models: [], enabled: true, connected: true }, nodeWithConfig);
      if (res.jobId) {
        set(s => ({ nodes: { ...s.nodes, [nid]: { ...s.nodes[nid], status: 'processing', meta: { ...(s.nodes[nid].meta || {}), jobId: res.jobId } } } }));
        return;
      }
      let url = res.url || res.text || '';
      const isTextResult = res.type === 'text';
      const genRemoteUrl = (res as any)?.remoteUrl;
      // 统一让生成的媒体先下载到本地再呈现，保证预览秒开
      if (!isTextResult && url) {
        url = await localizeMedia(url, `${mode}`, res.type === 'video' ? 'mp4' : res.type === 'audio' ? 'mp3' : undefined);
      }
      const targetId = n.options?.resultTargetNodeId;
      set(s => ({
        nodes: {
          ...s.nodes,
          [nid]: {
            ...s.nodes[nid],
            status: 'success',
            prompt: s.nodes[nid].prompt,
            result: isTextResult
              ? { url, type: 'text', text: res.text || '' }
              : { url, type: res.type, text: res.text, remoteUrl: genRemoteUrl || undefined },
            thumbnail: res.type === 'image' ? url : s.nodes[nid].thumbnail,
            options: s.nodes[nid].options,
          },
          ...(targetId && s.nodes[targetId] && !isTextResult ? {
            [targetId]: {
              ...s.nodes[targetId],
              status: 'success',
              result: { url, type: res.type, text: res.text, remoteUrl: genRemoteUrl || undefined },
              thumbnail: res.type === 'image' ? url : s.nodes[targetId].thumbnail,
              prompt: s.nodes[targetId].prompt || s.nodes[nid].prompt,
            },
          } : {}),
        },
      }));
      if (url && !isTextResult) {
        const exists = Object.values(get().assets).some(asset => asset.path === url);
        if (!exists) {
          get().addAsset({
            name: `${mode}-${Date.now()}`,
            type: res.type === 'audio' ? 'audio' : res.type === 'video' ? 'video' : 'image',
            path: url,
            thumbnail: res.type === 'image' ? url : undefined,
            size: 0,
            sourceId: targetId || nid,
            sourceType: 'canvas',
          });
        }
      }
    } catch (e: any) {
      set(s => ({ nodes: { ...s.nodes, [nid]: { ...s.nodes[nid], status: 'error', error: e?.message || String(e) } } }));
    }
  },
  setActiveNode: activeNodeId => set({ activeNodeId }), pushUndo: () => set(s => ({ undoStack: [...s.undoStack.slice(-49), s.nodes], redoStack: [] })), undo: () => set(s => { const prev = s.undoStack.at(-1); return prev ? { nodes: prev, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, s.nodes] } : s; }), redo: () => set(s => { const next = s.redoStack.at(-1); return next ? { nodes: next, redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, s.nodes] } : s; }), copyNodes: ids => set(s => ({ clipboard: { nodes: ids.map(x => s.nodes[x]).filter(Boolean), isCut: false } })), cutNodes: ids => set(s => ({ clipboard: { nodes: ids.map(x => s.nodes[x]).filter(Boolean), isCut: true } })), pasteNodes: () => { const cb = get().clipboard; if (!cb) return []; const ids = cb.nodes.map(n => { const { id: _oldId, ...rest } = n as any; return get().addNode({ ...rest, x: n.x + 40, y: n.y + 40, options: { ...(n.options || {}), displayName: `${n.options?.displayName || '节点'} 副本` } }); }); if (cb.isCut) set({ clipboard: null }); return ids; }, retryNode: async nid => { get().updateNode(nid, { status: 'idle', error: undefined }); await get().executeNode(nid); }, cancelNode: async nid => { const jobId = get().nodes[nid]?.meta?.jobId; const win = window as any; if (jobId && win?.yijingAPI?.grsai?.cancelJob) { try { await win.yijingAPI.grsai.cancelJob({ id: jobId }); } catch { /* noop */ } } get().updateNode(nid, { status: 'error', error: '已取消' }); }, runNode: async nid => get().executeNode(nid),
  saveDramaRecord: (r, name) => { const did = get().currentDramaRecordId || id(); const now = Date.now(); const old = get().dramaRecords.find(x => x.id === did); const rec: DramaRecord = { ...r, id: did, name: name || r.name || '未命名剧本', createdAt: old?.createdAt || now, updatedAt: now }; set(s => ({ currentDramaRecordId: did, dramaRecords: [rec, ...s.dramaRecords.filter(x => x.id !== did)] })); return did; }, loadDramaRecord: currentDramaRecordId => set({ currentDramaRecordId }), deleteDramaRecord: did => set(s => ({ dramaRecords: s.dramaRecords.filter(x => x.id !== did), currentDramaRecordId: s.currentDramaRecordId === did ? null : s.currentDramaRecordId })), copyDramaRecord: did => { const r = get().dramaRecords.find(x => x.id === did); if (r) get().saveDramaRecord({ ...r, name: `${r.name || '剧本'} 副本` }); }, renameDramaRecord: (did, name) => set(s => ({ dramaRecords: s.dramaRecords.map(x => x.id === did ? { ...x, name, updatedAt: Date.now() } : x) })), sendDramaToCanvas: (stepKey?: string, content?: string, stepLabel?: string) => {
    const s = get();
    let canvasId = s.activeCanvasId;
    if (!canvasId) {
      const cid = id();
      set(st => ({ canvasHistory: [{ id: cid, name: '剧创画布', data: { nodes: {} }, createdAt: Date.now(), updatedAt: Date.now() }, ...st.canvasHistory] }));
      canvasId = cid;
    }
    if (stepKey && content) {
      const existingNodes = Object.values(get().nodes);
      const baseX = 200;
      const baseY = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.y)) + 400 : 100;
      let cfg: Omit<AINode, 'id'>;
      switch (stepKey) {
        case 'director':
        case 'writer':
          cfg = { type: 'story-script', provider: 'openai', x: baseX, y: baseY, width: 500, height: 400, status: 'idle', prompt: content, options: { displayName: stepLabel || stepKey } }; break;
        case 'script':
          cfg = { type: 'story-script-adv', provider: 'openai', x: baseX, y: baseY, width: 550, height: 450, status: 'idle', prompt: content, options: { displayName: stepLabel || stepKey } }; break;
        case 'storyboard':
          cfg = { type: 'director-stage', provider: 'openai', x: baseX, y: baseY, width: 600, height: 500, status: 'idle', prompt: content, options: { displayName: stepLabel || stepKey } }; break;
        default:
          cfg = { type: 'story-script', provider: 'openai', x: baseX, y: baseY, width: 500, height: 400, status: 'idle', prompt: content, options: { displayName: stepLabel || stepKey } };
      }
      get().addNode(cfg);
      const us = get();
      set(st => ({ canvasHistory: st.canvasHistory.map(c => c.id === canvasId ? { ...c, data: { ...c.data, nodes: us.nodes }, updatedAt: Date.now() } : c) }));
    }
    set({ activeCanvasId: canvasId, activeSection: 'canvas' });
  },
  submitDramaToCanvas: (data) => {
    const { episodes, currentEpisodeIndex, storyboardRows } = data;
    const s = get();
    let canvasId = s.activeCanvasId;
    if (!canvasId) {
      const cid = id();
      set(st => ({ canvasHistory: [{ id: cid, name: '剧创画布', data: { nodes: {}, edges: [], groups: [] }, createdAt: Date.now(), updatedAt: Date.now() }, ...st.canvasHistory] }));
      canvasId = cid;
    }
    const episode = episodes?.[currentEpisodeIndex];
    if (!episode) { set({ activeCanvasId: canvasId, activeSection: 'canvas' }); return; }

    const existingNodes = Object.values(get().nodes);
    let startY = existingNodes.length > 0 ? Math.max(...existingNodes.map(n => n.y + n.height)) + 200 : 100;
    const startX = 100;
    const nodeWidth = 320;
    const nodeHeight = 280;
    const gapX = 40;
    const gapY = 60;
    const rowGap = 120;

    // 只提交视频节点，不再自动生成文生图→图生视频链路，因此不再创建连线
    const newEdges: any[] = [];

    // 新增的组
    const newGroups: Array<{ id: string; nodeIds: string[]; label: string }> = [];

    // ========== 解析提示词步骤 markdown（资产两列表 + 各幕分镜表） ==========
    const promptsContent: string = episode.stepContents?.prompts?.content || '';
    const mdLines = promptsContent.split(/\r?\n/);
    const allTableBlocks: Array<{ headers: string[]; rows: string[][]; startLine: number }> = [];
    {
      let li = 0;
      while (li < mdLines.length) {
        const ln = mdLines[li].trim();
        if (ln.startsWith('|') && ln.endsWith('|')) {
          const blockLines: string[] = [];
          const startLine = li;
          while (li < mdLines.length && mdLines[li].trim().startsWith('|') && mdLines[li].trim().endsWith('|')) {
            blockLines.push(mdLines[li]);
            li++;
          }
          const parsed = blockLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));
          if (parsed.length >= 2) {
            const splitRow = (row: string) => {
              const cells = row.split('|');
              if (cells.length >= 2) { cells.shift(); cells.pop(); }
              return cells.map(x => x.trim());
            };
            const headers = splitRow(parsed[0]);
            const rows = parsed.slice(1).map(splitRow);
            allTableBlocks.push({ headers, rows, startLine });
          }
        } else {
          li++;
        }
      }
    }
    // 第一个表格视为资产表
    const assetItems: Array<{ name: string; prompt: string }> = [];
    // 判断首个表格是否其实是分镜表（模型漏写资产表时会发生），避免把第一幕镜头误当资产、导致丢镜。
    const firstBlock = allTableBlocks[0];
    const firstIsShotTable = !!firstBlock && (/镜号|文生图|图生视频|景别/.test(firstBlock.headers.join('|')) || firstBlock.headers.length >= 5);
    if (allTableBlocks.length > 0 && !firstIsShotTable) {
      const first = allTableBlocks[0];
      const isTwoCol = first.headers.length === 2;
      if (isTwoCol) {
        first.rows.forEach(cells => {
          const name = (cells[0] || '').trim();
          const prompt = (cells[1] || '').trim();
          if (name || prompt) assetItems.push({ name: name || '资产', prompt });
        });
      } else if (first.headers.length >= 3) {
        const skipFirstCol = /类型/.test(first.headers[0]);
        first.rows.forEach(cells => {
          for (let colIdx = skipFirstCol ? 1 : 0; colIdx < cells.length; colIdx++) {
            const content = (cells[colIdx] || '').trim();
            if (!content) continue;
            const colName = first.headers[colIdx] || '资产';
            const shortName = content.split(/\n|<br>/i)[0].replace(/[<*_`]/g, '').substring(0, 24) || colName;
            assetItems.push({ name: shortName, prompt: content });
          }
        });
      }
    }

    let currentY = startY;

    // ========== 1) 创建视觉资产节点并打组「资产」 ==========
    if (assetItems.length > 0) {
      const groupId = `group-drama-assets-${Date.now()}`;
      const groupNodeIds: string[] = [];
      const colsPerRow = 4;
      assetItems.forEach((item, idx) => {
        const col = idx % colsPerRow;
        const row = Math.floor(idx / colsPerRow);
        const nodeId = get().addNode({
          type: 'text-to-image',
          provider: 'openai',
          x: startX + col * (nodeWidth + gapX),
          y: currentY + row * (nodeHeight + gapY),
          width: nodeWidth,
          height: nodeHeight,
          status: 'idle',
          prompt: item.prompt,
          options: {
            displayName: item.name,
            generationType: 'text-to-image',
            groupId,
            isGroupReference: true,
          },
        });
        groupNodeIds.push(nodeId);
      });
      const rowsCount = Math.ceil(assetItems.length / colsPerRow);
      currentY += rowsCount * (nodeHeight + gapY) + rowGap;
      newGroups.push({ id: groupId, nodeIds: groupNodeIds, label: '资产' });
    }
    // ========== 2) 从 markdown 解析分幕分镜表 ==========
    const actTables: Array<{ actName: string; rows: any[] }> = [];
    if (allTableBlocks.length > 1 || firstIsShotTable) {
      const actTitleRegex = /^####[^\n]*第[^\n]*幕[^\n]*/gm;
      const actTitles: Array<{ title: string; index: number }> = [];
      let mm: RegExpExecArray | null;
      while ((mm = actTitleRegex.exec(promptsContent)) !== null) {
        actTitles.push({ title: mm[0].replace(/^####\s*/, '').trim(), index: mm.index });
      }
      const linePos: number[] = [];
      {
        let ci = 0;
        for (let li = 0; li < mdLines.length; li++) { linePos.push(ci); ci += (mdLines[li]?.length || 0) + 1; }
      }
      for (let ti = firstIsShotTable ? 0 : 1; ti < allTableBlocks.length; ti++) {
        const tb = allTableBlocks[ti];
        const headStr = tb.headers.join('|');
        // 分镜表识别放宽：命中任一分镜关键字或列数≥5（分镜表 8 列），即视为分镜表，
        // 避免大模型微调表头（如「文生图提示词(prompt)」）时整幕镜头被丢弃。
        const looksLikeShotTable = /镜号|文生图|图生视频|景别|镜头|内容/.test(headStr) || tb.headers.length >= 5;
        if (!looksLikeShotTable) continue;
        const tblPos = linePos[tb.startLine] || 0;
        const owner = actTitles.slice().reverse().find(at => at.index < tblPos);
        const cnNums = ['一','二','三','四','五','六','七','八','九','十'];
        const actName = owner ? owner.title.replace(/[🎬📽️]/g, '').trim() : `第${cnNums[actTables.length] || (actTables.length+1)}幕`;
        // 表头模糊匹配 + 固定列序兜底：先按关键字找列，找不到再用列序，保证任何一列提示词都不丢。
        const findCol = (...keys: string[]) => tb.headers.findIndex(h => keys.some(k => (h || '').includes(k)));
        const colShot = findCol('镜号', '镜头号', '序号');
        const colDesc = findCol('内容', '画面', '描述');
        const colShotType = findCol('景别');
        const colCamParams = findCol('镜头参数', '参数', '焦距');
        const colCamModel = findCol('相机', '机型', '型号');
        // 新分镜表：出镜人物 / 场景 / 道具 / 文生视频提示词（兼容旧的文生图+图生视频 8 列表）
        const colChar = findCol('出镜人物', '人物', '角色');
        const colScene = findCol('场景');
        const colProp = findCol('道具');
        const colVideo = findCol('文生视频', '视频提示', '图生视频', '动态');
        const colT2I = findCol('文生图', '图片提示');
        const colI2V = findCol('图生视频');
        const colSfx = findCol('音效', '声音', '配乐');
        const parsedRows = tb.rows.map((cells, rowIdx) => {
          const at = (idx: number, fallbackIdx: number) => {
            const useIdx = idx >= 0 ? idx : fallbackIdx;
            return useIdx >= 0 ? (cells[useIdx] || '').trim() : '';
          };
          return {
            shot: at(colShot, 0) || `${rowIdx + 1}`,
            description: at(colDesc, -1),
            shotType: at(colShotType, -1),
            cameraParams: at(colCamParams, -1),
            cameraModel: at(colCamModel, -1),
            characters: at(colChar, 1),
            scene: at(colScene, 2),
            props: at(colProp, 3),
            videoPrompt: at(colVideo, 4),
            text2imgPrompt: at(colT2I, -1),
            img2videoPrompt: at(colI2V, -1),
            sfx: at(colSfx, -1),
          };
        });
        actTables.push({ actName, rows: parsedRows });
      }
    }

    // 回退：如果 markdown 没解析出分幕，则用分镜设计页 storyboardRows
    let actGroupsList: Array<{ actName: string; rows: any[] }> = actTables;
    // 分幕存在但没有解析到任何镜头时，同样回退到分镜设计页数据，避免丢镜。
    const totalParsedShots = actGroupsList.reduce((sum, a) => sum + (a.rows?.length || 0), 0);
    if (actGroupsList.length === 0 || totalParsedShots === 0) {
      const rows = storyboardRows || episode.storyboardRows || [];
      const cnNums2 = ['一','二','三','四','五','六','七','八','九','十'];
      const extractAct = (scene: string, fallbackIdx: number): string => {
        if (!scene) return `第${cnNums2[fallbackIdx] || (fallbackIdx+1)}幕`;
        const mm = scene.match(/第([一二三四五六七八九十\d]+)幕/);
        if (mm) return `第${mm[1]}幕`;
        const m2 = scene.match(/^(\d+)-/);
        if (m2) return `第${cnNums2[parseInt(m2[1])-1] || m2[1]}幕`;
        return `第${cnNums2[fallbackIdx] || (fallbackIdx+1)}幕`;
      };
      const grouped: Record<string, any[]> = {};
      const order: string[] = [];
      rows.forEach((r: any, idx: number) => {
        const a = extractAct(r.scene || '', idx);
        if (!grouped[a]) { grouped[a] = []; order.push(a); }
        grouped[a].push(r);
      });
      actGroupsList = order.map(a => ({ actName: a, rows: grouped[a] }));
    }
    // ========== 3) 每一幕：每镜一个文生视频节点（只提交文生视频提示词，不再自动生成文生图+图生视频链路） ==========
    actGroupsList.forEach((actGroup, actIdx) => {
      const actName = (actGroup.actName || `第${actIdx + 1}幕`).replace(/\s+/g, ' ').trim();
      const actGroupId = `group-drama-act-${Date.now()}-${actIdx}`;
      const actNodeIds: string[] = [];

      actGroup.rows.forEach((row: any, shotIndex: number) => {
        const shotNum = ((row.shot || `${shotIndex + 1}`).toString().trim()) || `${shotIndex + 1}`;

        const videoPrompt = (row.videoPrompt || row.img2videoPrompt || '').trim();
        if (!videoPrompt) return;

        // 文生视频节点（视频提示词直接驱动生成，无需文生图作为中间步骤）
        const videoNodeId = get().addNode({
          type: 'text-to-video',
          provider: 'openai',
          x: startX,
          y: currentY,
          width: nodeWidth,
          height: nodeHeight,
          status: 'idle',
          prompt: videoPrompt,
          options: {
            displayName: `${actName}-镜${shotNum}-文生视频`,
            generationType: 'text-to-video',
            groupId: actGroupId,
            shotMeta: {
              shot: shotNum,
              description: row.description,
              shotType: row.shotType,
              cameraParams: row.cameraParams,
              cameraModel: row.cameraModel,
              characters: row.characters,
              scene: row.scene,
              props: row.props,
              sfx: row.sfx,
            },
          },
        });
        actNodeIds.push(videoNodeId);

        currentY += nodeHeight + gapY;
      });

      // 该幕结束打组
      newGroups.push({ id: actGroupId, nodeIds: actNodeIds, label: actName });
      currentY += rowGap;
    });

    // ========== 保存画布状态（含 edges 与 groups） ==========
    const finalS = get();
    const currentCanvas = get().canvasHistory.find(c => c.id === canvasId);
    const existingEdges: any[] = Array.isArray(currentCanvas?.data?.edges) ? currentCanvas.data.edges : [];
    const existingGroups: any[] = Array.isArray(currentCanvas?.data?.groups) ? currentCanvas.data.groups : [];
    const allEdges = [...existingEdges, ...newEdges];
    const allGroups = [...existingGroups, ...newGroups];
    set(st => ({
      canvasHistory: st.canvasHistory.map(c => c.id === canvasId ? { ...c, data: { ...c.data, nodes: finalS.nodes, edges: allEdges, groups: allGroups }, updatedAt: Date.now() } : c),
      activeCanvasId: canvasId,
      activeSection: 'canvas'
    }));
  },  addPromptItem: p => { const pid = id(); set(s => ({ promptLibrary: [{ ...p, id: pid, createdAt: Date.now(), updatedAt: Date.now() }, ...s.promptLibrary] })); return pid; }, updatePromptItem: (pid, u) => set(s => ({ promptLibrary: s.promptLibrary.map(p => p.id === pid ? { ...p, ...u, updatedAt: Date.now() } : p) })), deletePromptItem: pid => set(s => ({ promptLibrary: s.promptLibrary.filter(p => p.id !== pid) })),
  setSearchQuery: searchQuery => set({ searchQuery }), runGlobalSearch: () => { const s = get(), q = s.searchQuery.trim().toLowerCase(); if (!q) { set({ searchResults: [] }); return; } const results: SearchResult[] = []; Object.values(s.assets).forEach(a => { if (a.name.toLowerCase().includes(q)) results.push({ id: a.id, title: a.name, type: 'asset', section: 'assets', targetId: a.id }); }); s.canvasHistory.forEach(c => { if (c.name.toLowerCase().includes(q)) results.push({ id: c.id, title: c.name, type: 'canvas', section: 'canvas', targetId: c.id }); }); s.promptLibrary.forEach(p => { if (p.name.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q)) results.push({ id: p.id, title: p.name, type: 'prompt', section: 'prompt-library', targetId: p.id }); }); set({ searchResults: results }); }, clearSearch: () => set({ searchQuery: '', searchResults: [] }),
  addStoryboardPreset: p => { const pid = id(); set(s => ({ storyboardPresets: [{ ...p, id: pid, createdAt: Date.now() }, ...s.storyboardPresets] })); return pid; }, updateStoryboardPreset: (pid, u) => set(s => ({ storyboardPresets: s.storyboardPresets.map(p => p.id === pid ? { ...p, ...u } : p) })), deleteStoryboardPreset: pid => set(s => ({ storyboardPresets: s.storyboardPresets.filter(p => p.id !== pid) })),
  exportStoryboardPreset: pid => { const p = get().storyboardPresets.find(x => x.id === pid); if (!p) return ''; const { id: _id, createdAt: _c, ...rest } = p; return JSON.stringify(rest, null, 2); },
  importStoryboardPreset: json => { try { const data = JSON.parse(json); if (!data || typeof data !== 'object') return { ok: false, error: '无效的预设格式' }; get().addStoryboardPreset({ name: data.name || '导入的预设', description: data.description || '', rows: Array.isArray(data.rows) ? data.rows : undefined, steps: Array.isArray(data.steps) ? data.steps : undefined }); return { ok: true }; } catch (e: any) { return { ok: false, error: e?.message || String(e) }; } },
}), {
  name: 'yijing-ai-storage-v2',
  storage: createJSONStorage(() => localStorage),
  partialize: s => ({ chatSessions: s.chatSessions, assets: s.assets, assetFolders: s.assetFolders, canvasHistory: s.canvasHistory, nodes: s.nodes, activeCanvasId: s.activeCanvasId, apiConfigs: s.apiConfigs, chatAPIConfigs: s.chatAPIConfigs, imageAPIConfigs: s.imageAPIConfigs, videoAPIConfigs: s.videoAPIConfigs, voiceAPIConfigs: s.voiceAPIConfigs, musicAPIConfigs: s.musicAPIConfigs, comfyuiConfigs: s.comfyuiConfigs, voiceLibrary: s.voiceLibrary, recommendedConfigs: s.recommendedConfigs, stockMediaSources: s.stockMediaSources, generationParams: s.generationParams, assistantSettings: s.assistantSettings, comfyWorkflowCache: s.comfyWorkflowCache, promptLibrary: s.promptLibrary, sidebarCollapsed: s.sidebarCollapsed, storyboardPresets: s.storyboardPresets, dramartProjects: s.dramartProjects, activeDramartId: s.activeDramartId, dramartCreateParams: s.dramartCreateParams, dramartCustomStyles: s.dramartCustomStyles, dramartDraft: s.dramartDraft }),
  // 从 localStorage 加载时清理已损坏的乱码数据
  migrate: (persisted: any) => {
    if (!persisted) return persisted;
    if (Array.isArray(persisted.chatSessions)) {
      persisted.chatSessions = persisted.chatSessions.map((s: any) => ({
        ...s,
        title: sanitizeText(s?.title, '新对话'),
      }));
    }
    if (Array.isArray(persisted.assets)) {
      persisted.assets = persisted.assets.map((a: any) => ({ ...a, name: sanitizeText(a?.name, '未命名') }));
    } else if (persisted.assets && typeof persisted.assets === 'object') {
      Object.keys(persisted.assets).forEach(k => {
        if (persisted.assets[k]) persisted.assets[k].name = sanitizeText(persisted.assets[k].name, '未命名');
      });
    }
    // 兜底：确保 assistantSettings 是一个完整对象，避免历史 persist 数据缺字段导致 UI 崩溃
    try {
      const defaults = { voiceSource: 'edge-tts', speakReplies: false, nodeBackend: 'ask' } as any;
      const cur = persisted.assistantSettings && typeof persisted.assistantSettings === 'object' ? persisted.assistantSettings : {};
      persisted.assistantSettings = { ...defaults, ...cur };
      if (persisted.assistantSettings.voiceSource !== 'api' && persisted.assistantSettings.voiceSource !== 'edge-tts') {
        persisted.assistantSettings.voiceSource = 'edge-tts';
      }
      if (typeof persisted.assistantSettings.speakReplies !== 'boolean') persisted.assistantSettings.speakReplies = false;
      const nb = persisted.assistantSettings.nodeBackend;
      if (nb !== 'ask' && nb !== 'comfyui' && nb !== 'api') persisted.assistantSettings.nodeBackend = 'ask';
    } catch { persisted.assistantSettings = { voiceSource: 'edge-tts', speakReplies: false, nodeBackend: 'ask' } as any; }
    // Agnes API 地址自动迁移：
    // 1. 旧国际站 .com -> 新国内节点 .cn
    // 2. 旧 apihub.agnes-ai.cn -> 新正式地址 api.agnes-ai.cn（2026年9月官方文档确认）
    const agnesConfigKeys = ['apiConfigs', 'chatAPIConfigs', 'imageAPIConfigs', 'videoAPIConfigs', 'voiceAPIConfigs', 'musicAPIConfigs'];
    for (const key of agnesConfigKeys) {
      if (Array.isArray(persisted[key])) {
        persisted[key] = persisted[key].map((cfg: any) => {
          if (cfg && typeof cfg.baseUrl === 'string') {
            // 迁移1：旧国际站 .com -> 新国内节点 .cn
            if (cfg.baseUrl.includes('agnes-ai.com')) {
              cfg.baseUrl = cfg.baseUrl.replace('agnes-ai.com', 'agnes-ai.cn');
            }
            // 迁移2：旧 apihub.agnes-ai.cn -> 新正式地址 api.agnes-ai.cn
            if (cfg.baseUrl.includes('apihub.agnes-ai.cn')) {
              cfg.baseUrl = cfg.baseUrl.replace('apihub.agnes-ai.cn', 'api.agnes-ai.cn');
            }
          }
          return cfg;
        });
      }
    }
    return persisted;
  },
  version: 2,
}));

try {
  const win = window as any;
  if (win?.yijingAPI?.onGrsaiJobUpdate) {
    win.yijingAPI.onGrsaiJobUpdate(async (data: any) => {
      const st = useAppStore.getState();

      // 同步更新首页对话中处于"生成中"的占位消息(通过 meta.jobId 匹配)
      try {
        for (const session of st.chatSessions) {
          const msg = session.messages.find((m: any) => m?.meta?.jobId === data.id);
          if (!msg) continue;
          if (data.status === 'succeeded' || data.status === 'completed') {
            const hint = (msg.meta?.mediaType as 'image' | 'video' | 'audio' | undefined) || 'image';
            let url = extractUrl(data) || extractUrl(data.data);
            const type = resultType(url, hint);
            if (url && type !== 'text') url = await localizeMedia(url, `chat-${type}`, type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : undefined);
            if (url) {
              st.updateMessage(session.id, msg.id, {
                content: '',
                type: type === 'text' ? 'text' : type,
                files: [url],
                meta: { ...(msg.meta || {}), generating: false },
              });
              const exists = Object.values(useAppStore.getState().assets).some(asset => asset.path === url);
              if (!exists && type !== 'text') {
                st.addAsset({
                  name: `chat-${type}-${Date.now()}`,
                  type: type === 'audio' ? 'audio' : type === 'video' ? 'video' : 'image',
                  path: url,
                  thumbnail: type === 'image' ? url : undefined,
                  size: 0,
                  sourceType: 'chat',
                });
              }
            } else {
              st.updateMessage(session.id, msg.id, {
                content: '生成完成,但未返回可用的结果链接。',
                meta: { ...(msg.meta || {}), generating: false },
              });
            }
          } else if (data.status === 'failed' || data.status === 'timeout') {
            st.updateMessage(session.id, msg.id, {
              content: `生成失败:${data.data?.error || data.status}`,
              meta: { ...(msg.meta || {}), generating: false },
            });
          }
          break;
        }
      } catch { /* noop */ }

      const nid = Object.keys(st.nodes).find(k => st.nodes[k]?.meta?.jobId === data.id);
      if (!nid) return;
      if (data.status === 'succeeded' || data.status === 'completed') {
        const nodeIsVideo = videoModes.has(modeOf(st.nodes[nid]));
        let url = extractUrl(data) || extractUrl(data.data);
        const type = resultType(url, nodeIsVideo ? 'video' : 'image');
        if (url && type !== 'text') url = await localizeMedia(url, `${st.nodes[nid]?.type || type}`, type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : undefined);
        const targetId = st.nodes[nid]?.options?.resultTargetNodeId;
        useAppStore.setState(s => ({
          nodes: {
            ...s.nodes,
            [nid]: {
              ...s.nodes[nid],
              status: 'success',
              result: targetId ? undefined : { url, type },
              thumbnail: type === 'image' ? url : s.nodes[nid].thumbnail,
            },
            ...(targetId && s.nodes[targetId] ? {
              [targetId]: {
                ...s.nodes[targetId],
                status: 'success',
                result: { url, type },
                thumbnail: type === 'image' ? url : s.nodes[targetId].thumbnail,
                prompt: s.nodes[targetId].prompt || s.nodes[nid].prompt,
              },
            } : {}),
          },
        }));
        if (url && type !== 'text') {
          const next = useAppStore.getState();
          const exists = Object.values(next.assets).some(asset => asset.path === url);
          if (!exists) {
            next.addAsset({
              name: `${next.nodes[nid]?.type || type}-${Date.now()}`,
              type: type === 'audio' ? 'audio' : type === 'video' ? 'video' : 'image',
              path: url,
              thumbnail: type === 'image' ? url : undefined,
              size: 0,
              sourceId: targetId || nid,
              sourceType: 'canvas',
            });
          }
        }
      } else if (data.status === 'failed' || data.status === 'timeout') {
        useAppStore.setState(s => ({ nodes: { ...s.nodes, [nid]: { ...s.nodes[nid], status: 'error', error: data.data?.error || '生成失败' } } }));
      }
    });
  }
} catch { /* noop */ }










