// ─────────────────────────────────────────────────────────────
// providerPresets.ts — 模型服务一键接入预设
// 预设主流 AI 平台（火山引擎方舟 / 阿里云百炼千问 / 通用 OpenAI 兼容等）的
// 官方接口地址、API Key 申请链接、精选模型、类型规则与官方音色清单。
// 仅用于设置页「一键接入」与配置卡上的申请链接/音色下拉，不影响任何现有调取逻辑。
// ─────────────────────────────────────────────────────────────

export interface ProviderSpeechPreset {
  /** 语音服务名称（如「火山引擎语音」） */
  label: string;
  /** 语音接口基础地址（填入「语音 API 配置」的 baseUrl） */
  baseUrl: string;
  /** 语音 API 申请地址 */
  applyUrl: string;
  /** 申请链接文案 */
  applyLabel: string;
  /** 语音接口默认模型（音色所在模型） */
  defaultModel?: string;
  /** 官方音色清单（填入语音配置的 defaultModel / 音色选择） */
  voices: Array<{ id: string; name: string }>;
  /** 说明文字（如鉴权方式） */
  note?: string;
}

export interface ProviderPreset {
  key: string;
  label: string;
  desc: string;
  icon: string;
  color: string;
  /** 对话（文本）基础地址 */
  chatBaseUrl: string;
  /** 备用域名列表（该平台可能使用的其他主机名，用于 baseUrl 反查预设） */
  altHosts?: string[];
  /** 对话 API Key 申请地址 */
  chatApplyUrl: string;
  /** 申请链接文案 */
  chatApplyLabel: string;
  /** 常见默认对话模型（可被「获取模型」覆盖） */
  defaultModel?: string;
  /** 是否支持图片生成（复用 chatBaseUrl，或独立地址） */
  imageBaseUrl?: string;
  /** 是否支持视频生成 */
  videoBaseUrl?: string;
  /** 图片接口默认模型 */
  imageDefaultModel?: string;
  /** 视频接口默认模型 */
  videoDefaultModel?: string;
  /** 对话精选模型清单（下拉框只显示这些，∩ 账号实际可用） */
  featuredChat?: string[];
  /** 图像精选模型清单 */
  featuredImage?: string[];
  /** 视频精选模型清单 */
  featuredVideo?: string[];
  /** 归类为「图像生成」的模型 ID 正则（用于 /models 结果按类型过滤） */
  imageModelRule?: string[];
  /** 归类为「视频生成」的模型 ID 正则 */
  videoModelRule?: string[];
  /** 语音接入预设（存在则支持「继续接入语音」） */
  speech?: ProviderSpeechPreset;
  /** 该平台是否提供 /models 模型列表接口 */
  modelListSupported?: boolean;
  /** 图片/视频接口是否需要额外的 AK/SK（如火山方舟素材资产库）；需要时配置卡才会引导填写 */
  needsAccessKey?: boolean;
  /** AK/SK 创建/申请地址 */
  akskApplyUrl?: string;
  /** AK/SK 申请链接文案 */
  akskApplyLabel?: string;
  /** 平台「模型广场/精选模型」页面（默认展示该页面每类模型的精选清单） */
  modelPlazaUrl?: string;
  /** 模型广场链接文案 */
  modelPlazaLabel?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    key: 'volc',
    label: '火山引擎',
    desc: '火山方舟 Ark · 豆包大模型（文本/图像/视频）',
    icon: '◆',
    color: '#ff6b35',
    chatBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    chatApplyUrl: 'https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey',
    chatApplyLabel: '申请火山方舟 API Key',
    defaultModel: 'doubao-seed-2-1-turbo-260628',
    imageBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    imageDefaultModel: 'doubao-seedream-4-0-250828',
    videoBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    videoDefaultModel: 'doubao-seedance-2-5-260628',
    modelListSupported: true,
    modelPlazaUrl: 'https://console.volcengine.com/ark/region:cn-beijing/model?view=DEFAULT_VIEW&groupType=ModelGroups',
    modelPlazaLabel: '在方舟控制台查看每类精选模型',
    // 精选对话（官方推荐模型：seed-evolving / seed-2.1-pro / seed-2.1-turbo，附近期稳定 2.0 系列）
    featuredChat: [
      'doubao-seed-evolving',
      'doubao-seed-2-1-pro-260628',
      'doubao-seed-2-1-turbo-260628',
      'doubao-seed-2-0-pro-260215',
      'doubao-seed-2-0-lite-260428',
      'doubao-seed-2-0-mini-260428',
    ],
    // 精选图像（官方最新：Seedream 5.0 pro / 5.0 / 4.5，附 4.0 主线）
    featuredImage: [
      'doubao-seedream-5-0-pro-260628',
      'doubao-seedream-5-0-260128',
      'doubao-seedream-4-5-251128',
      'doubao-seedream-4-0-250828',
    ],
    // 精选视频（官方最新：Seedance 2.5，附 2.0）
    featuredVideo: [
      'doubao-seedance-2-5-260628',
      'doubao-seedance-2-0-260128',
    ],
    imageModelRule: ['seedream'],
    videoModelRule: ['seedance'],
    needsAccessKey: true,
    akskApplyUrl: 'https://console.volcengine.com/iam/keymanage/',
    akskApplyLabel: '创建火山引擎 AK/SK（访问控制 IAM）',
    speech: {
      label: '火山引擎语音（豆包语音合成）',
      baseUrl: 'https://openspeech.bytedance.com/api/v1/tts',
      applyUrl: 'https://console.volcengine.com/speech/app',
      applyLabel: '申请火山引擎语音（语音技术控制台）',
      defaultModel: 'BV001_streaming',
      note: '火山引擎语音使用 X-Api-Key 鉴权，音色在下方选择',
      voices: [
        { id: 'BV001_streaming', name: '讲解男声（阳光青年）' },
        { id: 'BV002_streaming', name: '成熟男声' },
        { id: 'BV003_streaming', name: '温暖女声' },
        { id: 'BV004_streaming', name: '知性女声' },
        { id: 'BV005_streaming', name: '温柔女声' },
        { id: 'BV006_streaming', name: '活泼童声' },
        { id: 'BV007_streaming', name: '解说男声' },
        { id: 'BV008_streaming', name: '解说女声' },
        { id: 'BV017_streaming', name: '磁性男声' },
        { id: 'BV018_streaming', name: '御姐女声' },
        { id: 'BV019_streaming', name: '甜美少女' },
        { id: 'BV020_streaming', name: '邻家女生' },
        { id: 'BV100_streaming', name: '热门影视男声' },
        { id: 'BV101_streaming', name: '热门影视女声' },
        { id: 'BV406_streaming', name: '数字人男声（自然直播）' },
        { id: 'BV407_streaming', name: '数字人女声（自然直播）' },
        { id: 'BV700_streaming', name: '广告男声（男主播）' },
        { id: 'BV701_streaming', name: '广告女声（女主播）' },
        { id: 'BV056_streaming', name: '新闻男声' },
        { id: 'BV057_streaming', name: '新闻女声' },
      ],
    },
  },
  {
    key: 'qwen',
    label: '千问',
    desc: '阿里云百炼 DashScope · 通义千问（文本/万相图像/视频）',
    icon: '◈',
    color: '#38bdf8',
    chatBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatApplyUrl: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
    chatApplyLabel: '申请百炼 DashScope API Key',
    defaultModel: 'qwen-plus',
    imageBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    imageDefaultModel: 'qwen-image-3.0-pro',
    videoBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    videoDefaultModel: 'wan3.0-video-prime',
    modelListSupported: true,
    featuredChat: [
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen-long',
      'qwen3-max',
      'qwen3-plus',
      'qwen3-235b-a22b-instruct',
      'qwq-plus',
      'deepseek-v3',
      'deepseek-r1',
    ],
    // 精选图像（百炼推荐：Qwen-Image-3.0-Pro 高质量 / 3.0 平衡 / wan2.7-image / z-image-turbo 低成本）
    featuredImage: [
      'qwen-image-3.0-pro',
      'qwen-image-3.0',
      'qwen-image-2.0-pro',
      'qwen-image-2.0',
      'wan2.7-image-pro',
      'wan2.7-image',
      'z-image-turbo',
      'qwen-image-plus',
      'qwen-image',
    ],
    // 精选视频（万相 3.0 All-in-One：wan3.0-video 标准版 / wan3.0-video-prime 高速版，最长30秒；附 2.7 / 2.2 稳定版）
    featuredVideo: [
      'wan3.0-video-prime',
      'wan3.0-video',
      'wan2.7-t2v-2026-06-12',
      'wan2.7-i2v-2026-04-25',
      'wan2.7-r2v-2026-06-12',
      'wan2.7-videoedit',
      'wan2.2-t2v-plus',
    ],
    imageModelRule: ['^qwen-image', '^qwen-mt-image', 'wan.*-image', '^z-image', 'wanx.*t2i', '^wanx-v'],
    videoModelRule: ['(t2v|i2v|r2v|videoedit)', 'wan-video', 'wan3\.0', '^wan3'],
    speech: {
      label: '千问语音（百炼 CosyVoice 语音合成）',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      applyUrl: 'https://bailian.console.aliyun.com/?apiKey=1#/api-key',
      applyLabel: '申请百炼 API Key（语音音色同用）',
      defaultModel: 'cosyvoice-v2',
      note: '千问语音：模型固定选 cosyvoice-v2（匹配下方 V2 音色），音色在下方选择；cosyvoice-flash 不存在，勿选',
      voices: [
        // cosyvoice-v2 官方音色（音色名必须带 _v2 后缀，配 cosyvoice-v2 模型，不能与 v1/v3 混用）
        { id: 'longxiaochun_v2', name: '龙小淳（知性女声）' },
        { id: 'longxiaoxia_v2', name: '龙小夏（温柔女声）' },
        { id: 'longyumi_v2', name: '龙玉米（甜美女声）' },
        { id: 'longmiao_v2', name: '龙淼（活泼女声）' },
        { id: 'longxiu_v2', name: '龙秀（清亮女声）' },
        { id: 'longyue_v2', name: '龙月（成熟女声）' },
        { id: 'longwan_v2', name: '龙湾（知性女声）' },
        { id: 'longyuan_v2', name: '龙远（温暖女声）' },
        { id: 'longshu_v2', name: '龙小白（阳光男声）' },
        { id: 'longhua_v2', name: '龙华（沉稳男声）' },
        { id: 'longcheng_v2', name: '龙澄（温柔男声）' },
        { id: 'longxiaobai_v2', name: '龙小白（少年男声）' },
        { id: 'longnan_v2', name: '龙楠（磁性男声）' },
        { id: 'longqiang_v2', name: '龙强（浑厚男声）' },
        { id: 'longzhe_v2', name: '龙哲（儒雅男声）' },
        { id: 'libai_v2', name: '李白（古风男声）' },
        { id: 'loongstella_v2', name: 'Stella（英文女声）' },
        { id: 'loongbella_v2', name: 'Bella（英文女声）' },
      ],
    },
  },
  {
    key: 'openai',
    label: '通用 OpenAI',
    desc: 'OpenAI 兼容接口（文本/图像/视频/语音）',
    icon: '●',
    color: '#34d399',
    chatBaseUrl: 'https://api.openai.com/v1',
    chatApplyUrl: 'https://platform.openai.com/api-keys',
    chatApplyLabel: '申请 OpenAI API Key',
    defaultModel: 'gpt-4o-mini',
    imageBaseUrl: 'https://api.openai.com/v1',
    imageDefaultModel: 'gpt-image-1',
    videoBaseUrl: 'https://api.openai.com/v1',
    videoDefaultModel: 'sora-1',
    modelListSupported: true,
    featuredChat: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4.5-preview',
      'o3',
      'o3-mini',
      'o4-mini',
    ],
    featuredImage: [
      'gpt-image-1',
      'dall-e-3',
    ],
    featuredVideo: [
      'sora-1',
      'sora-2',
    ],
    imageModelRule: ['dall-e', 'gpt-image'],
    videoModelRule: ['sora'],
    speech: {
      label: 'OpenAI 语音合成（TTS）',
      baseUrl: 'https://api.openai.com/v1',
      applyUrl: 'https://platform.openai.com/api-keys',
      applyLabel: '申请 OpenAI API Key（TTS 同用）',
      defaultModel: 'gpt-4o-mini-tts',
      note: 'OpenAI TTS 走 /audio/speech，模型 gpt-4o-mini-tts，音色在下方选择',
      voices: [
        { id: 'alloy', name: 'Alloy（中性）' },
        { id: 'echo', name: 'Echo（沉稳男声）' },
        { id: 'fable', name: 'Fable（英伦男声）' },
        { id: 'onyx', name: 'Onyx（低沉男声）' },
        { id: 'nova', name: 'Nova（温暖女声）' },
        { id: 'shimmer', name: 'Shimmer（清亮女声）' },
      ],
    },
  },
  {
    key: 'siliconflow',
    label: '硅基流动',
    desc: 'SiliconFlow · 多模型聚合平台（文本/图像）',
    icon: '○',
    color: '#818cf8',
    chatBaseUrl: 'https://api.siliconflow.cn/v1',
    chatApplyUrl: 'https://cloud.siliconflow.cn/account/ak',
    chatApplyLabel: '申请 SiliconFlow API Key',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    imageBaseUrl: 'https://api.siliconflow.cn/v1',
    imageDefaultModel: 'black-forest-labs/FLUX.1-schnell',
    modelListSupported: true,
    featuredChat: [
      'Qwen/Qwen3-235B-A22B-Instruct',
      'Qwen/Qwen3-32B',
      'Qwen/Qwen2.5-7B-Instruct',
      'deepseek-ai/DeepSeek-V3',
      'deepseek-ai/DeepSeek-R1',
      'THUDM/glm-4-9b-chat',
      'meta-llama/Llama-3.3-70B-Instruct',
    ],
    featuredImage: [
      'black-forest-labs/FLUX.1-schnell',
      'black-forest-labs/FLUX.1-dev',
      'stabilityai/stable-diffusion-3-5-large',
      'Kwai-Kolors/Kolors',
      'Qwen/Qwen-Image',
    ],
    featuredVideo: [
      'Wan-AI/Wan2.1-T2V-1.3B',
      'Wan-AI/Wan2.1-I2V-1.3B',
    ],
    imageModelRule: ['flux', 'stable-diffusion', 'sdxl', 'kolors', 'qwen-image', 'playground', 'sana', 'dall-e', 'hunyuan-dit', 'seedream'],
    videoModelRule: ['wan', 'kling', 'sora', 'hunyuan-video', 'cogvideox', 'ltx-video', 'mochi', 'pixverse', 'cosyvideo', 't2v', 'i2v'],
  },
  {
    key: 'zhipu',
    label: '智谱 GLM',
    desc: '智谱开放平台 · GLM 系列（文本/图像）',
    icon: '▲',
    color: '#34d399',
    chatBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    chatApplyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    chatApplyLabel: '申请智谱 API Key',
    defaultModel: 'glm-4-flash',
    imageBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    imageDefaultModel: 'cogview-4',
    modelListSupported: true,
    featuredChat: [
      'glm-4-flash',
      'glm-4-air',
      'glm-4-plus',
      'glm-4-0520',
      'glm-4-long',
      'glm-z1-air',
      'glm-z1-plus',
    ],
    featuredImage: [
      'cogview-4',
      'cogview-3-flash',
    ],
    featuredVideo: [
      'cogvideox',
    ],
    imageModelRule: ['cogview'],
    videoModelRule: ['cogvideox', 'cog-video'],
  },
  {
    key: 'agnesi',
    label: 'agnes AI',
    desc: 'agnes AI · 对话/图像/视频生成',
    icon: '◇',
    color: '#a78bfa',
    chatBaseUrl: 'https://apihub.agnes-ai.cn/v1',
    altHosts: ['https://api.agnes-ai.cn/v1'],
    chatApplyUrl: 'https://platform.agnes-ai.cn/settings/apiKeys',
    chatApplyLabel: '申请 agnes API Key',
    defaultModel: 'agnes-3.0-flash',
    imageBaseUrl: 'https://apihub.agnes-ai.cn/v1',
    imageDefaultModel: 'agnes-image-2.5-flash',
    videoBaseUrl: 'https://apihub.agnes-ai.cn/v1',
    videoDefaultModel: 'agnes-video-2.5-flash',
    modelListSupported: false,
    // 精选对话（agnes 当前代际：2.5 pro/flash 系列，附 2.0）
    featuredChat: [
      'agnes-3.0-flash',
      'agnes-2.5-flash',
      'agnes-2.0-flash',
    ],
    // 精选图像（agnes 原生 image 系列，附 GPT-Image 备选）
    featuredImage: [
      'agnes-image-2.5-flash',
      'agnes-image-2.1-flash',
      'agnes-image-2.0-flash',
    ],
    // 精选视频（agnes 原生 video 系列）
    featuredVideo: [
      'agnes-video-2.5-flash',
      'agnes-video-2.5',
      'agnes-video-v2.0',
    ],
    imageModelRule: ['agnes-image', 'image-2', 'gpt-image', 'dall-e'],
    videoModelRule: ['agnes-video', 'video-v', 'sora', 'seedance', 'kling', 'wan'],
  },
];

const hostOf = (u?: string): string => {
  if (!u) return '';
  try { return new URL(u).hostname.toLowerCase(); } catch { return ''; }
};

/** 根据 baseUrl 反查所属平台预设（用于配置卡显示申请链接/音色） */
export const findPresetByBase = (baseUrl?: string): ProviderPreset | undefined => {
  const h = hostOf(baseUrl);
  if (!h) return undefined;
  return PROVIDER_PRESETS.find(p => {
    if (hostOf(p.chatBaseUrl) === h) return true;
    if (p.altHosts?.some(a => hostOf(a) === h)) return true;
    if (p.imageBaseUrl && hostOf(p.imageBaseUrl) === h) return true;
    if (p.videoBaseUrl && hostOf(p.videoBaseUrl) === h) return true;
    if (p.speech && hostOf(p.speech.baseUrl) === h) return true;
    return false;
  });
};

// ── 模型类型分类：用于设置页按「对话 / 图像 / 视频」分区只显示对应类型模型 ──
export type ModelKind = 'chat' | 'image' | 'video';

/** 根据平台预设的规则把模型 ID 归类；默认（无规则命中 / 无预设）归为对话 */
export function classifyModel(modelId: string, preset?: ProviderPreset): ModelKind {
  if (!preset) return 'chat';
  // 精选清单是权威来源：出现在图像/视频精选里的模型直接归类，防止无规则平台（如 agnes）误判
  if (preset.featuredVideo?.includes(modelId)) return 'video';
  if (preset.featuredImage?.includes(modelId)) return 'image';
  const hit = (rules?: string[]) => rules?.some(r => { try { return new RegExp(r, 'i').test(modelId); } catch { return false; } }) ?? false;
  if (hit(preset.videoModelRule)) return 'video';
  if (hit(preset.imageModelRule)) return 'image';
  return 'chat';
}

/** 取某类型的精选模型清单（对话/图像/视频） */
export function featuredOf(preset: ProviderPreset | undefined, kind?: string): string[] {
  if (!preset) return [];
  if (kind === 'image') return preset.featuredImage || [];
  if (kind === 'video') return preset.featuredVideo || [];
  return preset.featuredChat || [];
}
