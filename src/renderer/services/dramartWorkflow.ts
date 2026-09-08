// 剧创工厂 · 短剧项目工作流服务
// 负责：风格库、自动分析（分析剧本→分镜设计→提取资产→提示词生成）、结构化结果生成
// 原则：有可用对话 API 时调用 AI 生成；否则回退到内置的结构化示例，确保界面始终可用。

export type DramartRatio = '16:9' | '4:3' | '3:4' | '9:16' | '21:9';
export type DramartResolution = '480p' | '720p' | '1080p' | '4k';
export type DramartMode = 'agent' | 'manual';
export type DramartCategory = 'real' | '3d' | '2d' | 'custom';

export interface DramartStyle {
  id: string;
  name: string;
  category: DramartCategory;
  desc: string;
  img?: string;
  /** 风格正向提示词：生成图片时统一追加，确保出图严格贴合所选风格 */
  stylePrompt: string;
}

export interface DramartAssetItem {
  id: string;
  name: string;
  kind: 'character' | 'scene' | 'prop';
  imageSummary: string;
  count: number;
  hue: number;
  img?: string;
  /** 生图模型返回的远程图片地址（火山方舟 TOS URL 等）。方舟同账号产物受信任，视频参考图优先使用，避免真人拦截 */
  remoteUrl?: string;
  prompt?: string;
  voice?: string;
  variants?: { id: string; label: string; img?: string; remoteUrl?: string; candidates?: string[]; prompt?: string }[];
}

export interface DramartStoryboard {
  id: string;
  index: number;
  label: string;
  rawScript: string;
  characters: string[];
  scenes: string[];
  props: string[];
  videoPrompt: string;
  duration: number;
  videoUrl?: string;
  videoCandidates?: string[];
  videoStatus?: 'idle' | 'generating' | 'done' | 'error';
  /** 角色配音音频地址（生成视频时同步生成） */
  voiceUrl?: string;
  /** 序列帧缩略图 dataURL 数组（视频生成后自动抽取并持久化，视频页直接读取，无需每次重新抽帧） */
  frameStrip?: string[];
}

export interface DramartAnalysisState {
  step: number;
  total: number;
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  percent: number;
}

export type AssetImageSource = {
  kind: 'api' | 'comfyui';
  /** kind=api 时：API 图片模型名 */
  model?: string;
  /** kind=comfyui 时：ComfyUI 图片工作流名 */
  workflow?: string;
  /** kind=comfyui 时：ComfyUI 服务器地址 */
  serverUrl?: string;
}

export interface DramartProject {
  id: string;
  name: string;
  ratio: DramartRatio;
  resolution: DramartResolution;
  styleId: string;
  styleName: string;
  scriptText: string;
  scriptFileName: string;
  mode: DramartMode;
  createdAt: number;
  analysis: DramartAnalysisState;
  characters: DramartAssetItem[];
  scenes: DramartAssetItem[];
  props: DramartAssetItem[];
  storyboards: DramartStoryboard[];
  /** 资产图默认生成源（创建项目时选择）：api=API 图片模型，comfyui=ComfyUI 图片工作流 */
  assetImageSource?: AssetImageSource;
  /** 创建短剧项目时选择的分镜最大时长（秒），默认15，可选5/10/15/20/25/30；用于分镜视频时长默认值 */
  shotDuration?: number;
  /** 创建项目时选定的推理（对话）模型显示标签（分析进度提示区分用） */
  inferenceModelLabel?: string;
  /** 创建项目时选定的视频生成模型默认值：API 视频模型名 或 ComfyUI 视频工作流名 */
  videoModel?: string;
  /** 创建项目时选定的视频 API 配置 ID（分镜视频生成优先使用该配置） */
  videoConfigId?: string;
  /** 剧创模式：来自剧创的剧本步骤最终结果（用于分镜页剧本原文） */
  scriptContent?: string;
  /** 剧创模式：来自剧创的提示词生成页内容（资产表 + 分幕分镜表，直接解析） */
  promptsContent?: string;
  /** 剧本页封面图（自动生成） */
  cover?: string;
  /** 色彩标签 */
  genres?: string[];
  /** 剧本类型 */
  scriptType?: string;
  /** 分镜风格 */
  storyboardStyle?: string;
  /** 大纲 */
  outline?: string;
  /** 分集剧情 */
  plotEpisodes?: { index: number; title: string; content: string }[];
}

// ==================== 风格库 ====================

export const DRAMART_STYLES: DramartStyle[] = [
  { id: 'modern-city', name: '现代都市通用', category: 'real', desc: '现代都市日常，贴近真实光影与质感', stylePrompt: 'modern urban realistic photography, contemporary city life, natural daylight, realistic skin texture, high detail, 35mm lens, photorealistic' },
  { id: 'cinematic', name: '电影感', category: 'real', desc: '电影级调色，强烈情绪氛围', stylePrompt: 'cinematic film still, dramatic lighting, shallow depth of field, film grain, moody color grading, anamorphic lens, movie frame' },
  { id: 'us-real', name: '美式真人通用', category: 'real', desc: '美式写实，自然光与生活化场景', stylePrompt: 'american realistic photography, natural light, candid lifestyle, photorealistic, documentary style' },
  { id: 'palace-cold', name: '宫斗权谋冷峻风', category: 'real', desc: '冷峻压抑，权谋氛围', stylePrompt: 'ancient Chinese palace drama, cold desaturated tones, royal court costume, solemn oppressive atmosphere, realistic period drama' },
  { id: 'mystery-cold', name: '国产悬疑冷调风', category: 'real', desc: '悬疑冷色，紧张神秘', stylePrompt: 'Chinese mystery thriller, cold blue-grey color grading, tense atmosphere, low-key lighting, realistic crime drama' },
  { id: 'antique-soft', name: '古偶唯美柔光', category: 'real', desc: '古偶柔光，唯美浪漫', stylePrompt: 'ancient Chinese costume romance, soft dreamy lighting, pastel tones, ethereal glow, beautiful idealistic period drama, 4k' },
  { id: 'korea-soft', name: '韩剧都市柔光', category: 'real', desc: '韩剧质感，柔光都市', stylePrompt: 'Korean drama soft light aesthetic, warm gentle tones, urban romance, glossy skin, melodramatic, realistic' },
  { id: 'hollywood', name: '美式复古好莱坞', category: 'real', desc: '复古胶片，好莱坞质感', stylePrompt: 'vintage hollywood film, retro 35mm, warm color grading, classic glamour, nostalgic cinema, film grain' },
  { id: 'rural-90s', name: '90年代中国农村电影', category: 'real', desc: '90年代中国农村，土墙瓦房纪实感', stylePrompt: '1990s Chinese countryside film, earthen walls, tiled houses, documentary realism, nostalgic, warm daylight, film grain' },
  { id: 'gongbi', name: '工笔画', category: 'real', desc: '中国传统工笔，细腻勾勒', stylePrompt: 'traditional Chinese gongbi painting, fine brushwork, delicate ink lines, meticulous details, elegant colors, paper texture' },
  { id: '3d-cartoon', name: '3D卡通', category: '3d', desc: '3D卡通，活泼鲜明', stylePrompt: '3D cartoon render, Pixar style, vibrant colors, soft shading, cute stylized characters, octane render' },
  { id: '3d-guofeng', name: '3D国风', category: '3d', desc: '3D国风，东方美学', stylePrompt: '3D Chinese national style render, oriental aesthetics, elegant, ink-inspired textures, cinematic, octane render' },
  { id: '3d-xianxia', name: '3D仙侠', category: '3d', desc: '3D仙侠，飘逸灵动', stylePrompt: '3D xianxia fantasy render, ethereal flying immortals, oriental fantasy, misty clouds, cinematic, octane render, unreal engine' },
  { id: 'cg-style', name: 'CG风格', category: '3d', desc: 'CG写实，电影级渲染', stylePrompt: 'CG render, photorealistic, film quality, octane render, unreal engine, high detail, cinematic lighting' },
  { id: 'cg-cyber', name: 'CG赛博朋克', category: '3d', desc: '赛博朋克霓虹，未来都市', stylePrompt: 'cyberpunk CG render, neon lights, futuristic megacity, rain-slick streets, holograms, octane render, cinematic' },
  { id: '2d-anime', name: '2D日漫', category: '2d', desc: '日系动漫，清爽明快', stylePrompt: 'Japanese anime style, cel shading, clean lineart, vibrant colors, detailed eyes, 2D animation key visual' },
  { id: '2d-hanman', name: '2D韩漫', category: '2d', desc: '韩系漫画，律动都市', stylePrompt: 'Korean webtoon style, dynamic 2D comic, clean shading, stylish characters, vivid colors, manhwa' },
  { id: '2d-hanman-city', name: '2D韩漫都市', category: '2d', desc: '韩漫都市，时尚潮流', stylePrompt: 'Korean webtoon urban style, fashionable city characters, dynamic compositions, trendy colors, manhwa' },
  { id: '2d-otome', name: '2D乙女', category: '2d', desc: '乙女向，精致唯美', stylePrompt: 'otome game style, beautiful 2D anime, soft delicate coloring, elegant romantic, refined bishoujo' },
  { id: '2d-guoman', name: '2D国漫', category: '2d', desc: '国漫风，东方韵味', stylePrompt: 'Chinese donghua style, oriental aesthetic, 2D animation, elegant ink-wash influence, dynamic' },
  { id: 'gu-yun', name: '古韵写实雅致风', category: '2d', desc: '古韵写实，雅致东方', stylePrompt: 'ancient Chinese elegant realistic style, refined oriental aesthetics, ink-wash colors, classical beauty, sophisticated' },
];

// 风格缩略图（由 static public 提供，缺失时页面回退渐变占位）
// 使用 import.meta.env.BASE_URL 构建相对路径，确保 Electron（file:// 协议）打包后也能正常访问
function resolveStyleAssetUrl(rawUrl: string): string {
  if (/^(https?:|data:|blob:)/i.test(rawUrl)) return rawUrl;
  const baseUrl = import.meta.env.BASE_URL || './';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const normalizedPath = rawUrl.replace(/^\/+/, '');
  return `${normalizedBase}${normalizedPath}`;
}
DRAMART_STYLES.forEach(s => { s.img = resolveStyleAssetUrl('/dramart-styles/' + s.id + '.png'); });

// 按风格名称（或 id）取风格正向提示词，用于图片生成时统一追加，确保严格贴合所选风格
export function stylePromptOf(styleNameOrId: string): string {
  const key = String(styleNameOrId || '').trim();
  if (!key) return '';
  const hit = DRAMART_STYLES.find(s => s.name === key || s.id === key);
  return hit?.stylePrompt || '';
}

export const DRAMART_RATIOS: { id: DramartRatio; label: string }[] = [
  { id: '16:9', label: '16:9' },
  { id: '4:3', label: '4:3' },
  { id: '3:4', label: '3:4' },
  { id: '9:16', label: '9:16' },
  { id: '21:9', label: '21:9' },
];

export const DRAMART_RESOLUTIONS: { id: DramartResolution; label: string }[] = [
  { id: '480p', label: '480p' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '4k', label: '4k' },
];

// ==================== 分析步骤 ====================

export const DRAMART_ANALYSIS_STEPS = [
  '分析剧本',
  '分镜设计',
  '提取资产',
  '生成提示词',
  '生成资产图',
] as const;

// ==================== 生成工具 ====================

let __seq = 0;
const rid = (p: string) => p + '_' + Date.now().toString(36) + '_' + (++__seq).toString(36);

function assetItem(name: string, kind: DramartAssetItem['kind'], imageSummary: string, hue: number, count = 1): DramartAssetItem {
  return { id: rid(kind), name, kind, imageSummary, hue, count };
}

function defaultStoryboards(scriptText: string): DramartStoryboard[] {
  void scriptText;
  const by1 = '深夜空旷的办公室，电脑屏幕透出蓝光，一名泛黄的老旧全家福照片静躺着。林望独自坐在这里，周围是狭长的阴影，反光映在孤独家具上。';
  const by2 = '陈年农村土墙瓦房，耳边响起长辈熟悉的叮嘱声，一束暖光洒在泛黄的全家福上，岁月印记清晰。';
  return [
    { id: rid('sb'), index: 1, label: '分镜1', rawScript: by1, characters: ['成年林望'], scenes: ['城市写字楼办公室'], props: ['泛黄全家福照片'], videoPrompt: makeVideoPrompt('成年林望', '城市写字楼办公室', '泛黄全家福照片', by1, undefined, undefined, { index: 1, duration: 15 }), duration: 15 },
    { id: rid('sb'), index: 2, label: '分镜2', rawScript: by2, characters: ['幼年林望'], scenes: ['农村土墙瓦房室内'], props: ['胸片检查报告单'], videoPrompt: makeVideoPrompt('幼年林望', '农村土墙瓦房室内', '胸片检查报告单', by2, undefined, undefined, { index: 2, duration: 15 }), duration: 15 },
  ];
}

// 分镜视频提示词：按参考格式输出（画风约束 + 素材引用 + 画面描写 + 约束词），参数均取实际值，不固定具体内容
export function makeVideoPrompt(character: string, scene: string, prop: string, description: string, styleName = '90年代中国农村电影', explicitWord?: string, opts?: { index?: number; duration?: number }): string {
  const styleWord = explicitWord || stylePromptOf(styleName) || styleName;
  const idx = opts && opts.index ? opts.index : 1;
  const dur = opts && opts.duration ? opts.duration : 15;
  const scriptText = (description || '').trim();
  const charName = character || '主角';
  const sceneName = scene || '场景';
  const propName = prop || '道具';
  return [
    '画风: ' + styleName,
    '视频中不得出现任何字幕、文字叠加、纯画面，不要bgm，不要配乐。',
    '',
    '### 素材引用',
    '',
    '【人物】',
    '<' + charName + '>对应' + charName + '，只采用外貌、发型和服装。',
    '【场景】',
    '<' + sceneName + '>参考' + sceneName + '，只采用空间布局、建筑和光线，不采用图中人物。',
    '【道具】',
    '<' + propName + '>对应' + propName + '，只采用结构、材质和颜色。',
    '',
    '### 画面描写',
    '',
    '分镜场景设定在：',
    sceneName,
    '',
    '分镜具体动作描述：',
    '镜头1',
    dur + 's',
    '',
    '[站位]',
    charName + (propName !== '道具' ? '（手持' + propName + '）' : '') + '位于画面中。',
    '[动作]',
    scriptText || '（暂无画面描述）',
    '',
    '### 约束词',
    '【保持一致】',
    '保持<' + charName + '身份、数量、服装、道具归属、空间方向和声音关系>稳定。',
  ].join('\n');
}

// 资产参考图提示词：按参考格式生成（角色三视图 / 场景四宫格 / 道具特写），参数均取实际资产信息，不固定具体内容
export function buildAssetImagePrompt(a: { name?: string; kind?: string; imageSummary?: string }): string {
  const name = a.name || '资产';
  const summary = a.imageSummary ? a.imageSummary.replace(/^1个形象\s*/, '').trim() : '';
  const desc = summary || name;
  if (a.kind === 'character') {
    return [
      '任务：完成角色的上半身正面平视特写和该角色的全身三视图。左边是角色的上半身正面平视特写，右边是该角色的全身三视图。三视图不可以有分割线。左侧为角色胸部以上特写大图，占画面约 40% 宽度，用于展示面部、发型、表情、眼神、上半身服装和配饰细节；右侧为同一角色的三视图，占画面约 60% 宽度，依次展示正面全身、侧面全身、背面全身。',
      '重要要求：',
      '1. 纯白色背景，无任何场景、道具、装饰或其他人物，只有该角色一个人。',
      '2. 左侧特写和右侧三视图必须是同一个角色，外貌、服装、发型完全一致，不能出现不同的人。',
      '3. 三视图中正面、侧面、背面各一个人物，总共三个人物，加上左侧特写共四个人物形象，不能多也不能少。',
      '4. 人物站姿标准，全身完整展示，不裁切。',
      '---',
      '角色描述:',
      desc,
    ].join('\n');
  }
  if (a.kind === 'scene') {
    return [
      '生成四宫格画面，展示同一个场景中的四个不同视角。左上角为正视图，主体正面清晰可见，构图居中，细节完整；右上角为俯视图，从高空俯视整体空间布局，展示环境关系和场景结构；左下角为背视图，从主体后方观察，突出背部轮廓、空间纵深和环境延展；右下角为侧视图，从主体侧面观察，展示主体比例、层次和空间关系。四个画面保持同一场景、同一光照、同一色调、同一时间状态。不输出文字信息。',
      '1. 只出现场景，不出现人物、道具等无关内容。',
      '2. 必须只展示静态事物，不能包含人、动物等可以自行运行的事物。',
      '3. 无动态、特效、技能、光效及战斗相关描写。',
      '---',
      '场景描述:',
      desc,
    ].join('\n');
  }
  if (a.kind === 'prop') {
    return [
      '任务：生成道具的高清特写静物图。',
      '重要要求：',
      '1. 纯白色背景，无任何场景、人物或其他元素，只有该道具一个物品。',
      '2. 道具居中展示，真实还原物品形态、材质、颜色与细节，质感清晰，光影自然。',
      '3. 体现出岁月与材质特征（如真实纹理、边缘磨损、岁月斑点、卷边龟裂等，如适用）。',
      '4. 仅呈现该物品本身，无人物、无多余元素，无动态特效。不输出文字信息。',
      '---',
      '道具描述:',
      desc,
    ].join('\n');
  }
  return name + '，' + summary;
}

function defaultProjectData(): Pick<DramartProject, 'characters' | 'scenes' | 'props' | 'storyboards'> {
  return {
    characters: [
      assetItem('幼年林望', 'character', '1个形象 身份：学生，幼年；性格：懦弱敏感，沉默寡言；简介：幼年林望是主角林望的童年时期，7岁时病卧床榻，是家中弱子。', 204),
      assetItem('成年林望', 'character', '1个形象 身份：职场人士；性格：内敛，重情；简介：童年曾患病，成年后事业有成，却难以抹去故乡记忆。', 210),
      assetItem('林建国', 'character', '1个形象 身份：林望父亲，一位普通的工人；性格：沉默、隐忍；简介：勤劳朴实的父亲，默默支撑一家人的生计。', 24),
      assetItem('林浩', 'character', '1个形象 身份：林望的哥哥；性格：开朗爽直；简介：童年时最疼爱林望的人，无奈常年在外地谋生。', 210),
      assetItem('苏桂兰', 'character', '1个形象 身份：林望母亲；性格：温婉朴实；简介：操持家务的母亲，目光里满是温柔与不舍。', 330),
    ],
    scenes: [
      assetItem('城市写字楼办公室', 'scene', '1个形象 深夜黯淡的写字楼办公室，冷色显像、空旷无人；简介：承载打工人在城市中的孤独与疲惫。', 210),
      assetItem('农村土墙瓦房室内', 'scene', '1个形象 1998年夏的农村土墙瓦房室内，土墙、老式白炽灯泡；简介：温暖回忆的起点。', 34),
      assetItem('农村庭院', 'scene', '1个形象 2000年夏日的农村庭院，土墙瓦房前有一棵老槐树；简介：一家人围坐的温馨时光。', 120),
      assetItem('农村土灶厨房', 'scene', '1个形象 2000年秋天的农村土灶厨房，土墙黑砖、灶膛内柴火燃烧；简介：人间烟火气的最深印记。', 200),
    ],
    props: [
      assetItem('胸片检查报告单', 'prop', '1个形象 一张泛黄的纸质报告单，表面隐约折叠痕迹；简介：承载健康与记忆的信物。', 46),
      assetItem('泛黄全家福照片', 'prop', '1个形象 一张泛黄老旧的全家福照片，照片中的人物面容温润；简介：关于家的回忆。', 36),
    ],
    storyboards: defaultStoryboards(''),
  };
}

// ==================== AI 调用 ====================

export interface AIConfigInput { baseUrl?: string; apiKey?: string; model?: string; }

async function callChat(system: string, user: string, config: AIConfigInput | null): Promise<string | null> {
  const win = window as any;
  // 未配置 API 时返回 null，由调用方决定是否使用本地兜底
  if (!win?.yijingAPI?.grsai?.chat || !config?.apiKey || !config?.baseUrl || !config?.model) {
    return null;
  }
  try {
    // 渲染进程层也加超时保护：即使 IPC/主进程意外挂起也不会无限等待
    // 长剧本分析可能需要较长时间，默认 10 分钟超时
    const timeoutMs = 600000; // 10 分钟
    const result = await Promise.race([
      win.yijingAPI.grsai.chat({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI 对话响应超时（超过 10 分钟），请检查网络或模型是否正常')), timeoutMs)),
    ]);
    if (result?.ok) {
      // 尝试多种常见返回字段，兼容不同模型/平台的响应结构
      const msg = result.data?.choices?.[0]?.message;
      const content =
        msg?.content ||
        msg?.reasoning_content ||
        result.data?.choices?.[0]?.text ||
        result.data?.content ||
        result.data?.response ||
        result.data?.output_text ||
        result.data?.output ||
        null;
      if (!content) {
        const dataPreview = JSON.stringify(result.data || {}).slice(0, 500);
        throw new Error('AI 返回内容为空（模型可能未开通、max_tokens 不足或输出被截断）。原始返回：' + dataPreview);
      }
      return content;
    }
    // 有配置但调用失败：抛出明确错误，不让用户无感知地看到演示数据
    throw new Error(result?.error?.message || result?.msg || 'AI 对话接口调用失败，请检查 API 配置或模型是否可用');
  } catch (e: any) {
    if (e?.message) throw e;
    throw new Error('AI 对话接口调用异常：' + String(e));
  }
}

function parseJsonObject(text: string): any | null {
  if (!text) return null;
  let cleaned = String(text).trim();
  // 处理 markdown 代码块：```json ... ``` 或 ``` ... ```
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    cleaned = codeBlockMatch[1].trim();
  }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    console.log('[PARSEDBG] start=', start, 'end=', end);
    return null;
  }
  const jsonStr = cleaned.slice(start, end + 1);
  // 第一次尝试：直接解析
  try {
    return JSON.parse(jsonStr);
  } catch (e: any) {
    console.log('[PARSEDBG] 第一次解析失败:', e?.message);
  }
  // 第二次尝试：修复未转义的双引号
  // 思路：遍历字符串，跟踪是否在字符串值中，如果在字符串值中遇到双引号，
  // 检查后面是否跟着JSON结构字符（, : } ]），如果不是，说明是未转义的双引号
  const fixed = fixUnescapedQuotes(jsonStr);
  try {
    return JSON.parse(fixed);
  } catch (e: any) {
    console.log('[PARSEDBG] 第二次修复后解析失败:', e?.message);
  }
  // 第三次尝试：移除控制字符后再修复
  let fixed2 = fixed.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  try {
    return JSON.parse(fixed2);
  } catch (e: any) {
    console.log('[PARSEDBG] 第三次解析失败:', e?.message);
  }
  // 第四次尝试：使用eval解析（更宽松，但有安全风险，仅用于调试）
  try {
    // eslint-disable-next-line no-eval
    const result = eval('(' + fixed2 + ')');
    if (result && typeof result === 'object') {
      console.log('[PARSEDBG] 第四次eval解析成功');
      return result;
    }
  } catch (e: any) {
    console.log('[PARSEDBG] 第四次eval解析失败:', e?.message);
  }
  return null;
}

// 修复JSON中未转义的双引号
function fixUnescapedQuotes(jsonStr: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      if (!inString) {
        // 开始字符串
        inString = true;
        result += ch;
      } else {
        // 在字符串中遇到双引号，检查是否是字符串结束
        // 向后看，跳过空白字符，看是否跟着JSON结构字符
        let j = i + 1;
        while (j < jsonStr.length && (jsonStr[j] === ' ' || jsonStr[j] === '\t' || jsonStr[j] === '\n' || jsonStr[j] === '\r')) {
          j++;
        }
        const nextChar = jsonStr[j];
        if (nextChar === ',' || nextChar === ':' || nextChar === '}' || nextChar === ']' || j >= jsonStr.length) {
          // 是字符串结束
          inString = false;
          result += ch;
        } else {
          // 是未转义的双引号，添加反斜杠
          result += '\\' + ch;
        }
      }
      continue;
    }
    result += ch;
  }
  return result;
}

function normalizeAssets(raw: any): Pick<DramartProject, 'characters' | 'scenes' | 'props'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: DramartAssetItem[] = [];
  const keys: [string, DramartAssetItem['kind']][] = [
    ['characters', 'character'],
    ['scenes', 'scene'],
    ['props', 'prop'],
  ];
  for (const [key, kind] of keys) {
    const list = Array.isArray(raw[key]) ? raw[key] : [];
    list.forEach((it: any, i: number) => {
      const name = String(it?.name || it?.title || '').trim();
      if (!name) return;
      out.push(assetItem(name, kind, it?.imageSummary || it?.desc || it?.summary || '', (it?.hue ?? (i * 51 + 20) % 360)));
    });
  }
  if (!out.length) return null;
  return {
    characters: out.filter(a => a.kind === 'character'),
    scenes: out.filter(a => a.kind === 'scene'),
    props: out.filter(a => a.kind === 'prop'),
  };
}

// ==================== 主分析入口 ====================

export interface RunAnalysisOptions {
  scriptText: string;
  scriptFileName: string;
  styleName: string;
  /** 已解析的风格提示词（含自定义风格），用于分镜视频提示词中严格保持该画风 */
  styleWord?: string;
  ratio: DramartRatio;
  resolution: DramartResolution;
  config: AIConfigInput | null;
  /** 资产图默认生成源（来自项目创建选择），透传给 imageFetcher */
  imageSource?: AssetImageSource;
  imageFetcher?: (prompt: string, opts?: { size?: string; source?: AssetImageSource }) => Promise<{ url: string; remoteUrl?: string } | null>;
  onProgress: (step: number, label: string, percent: number, msg?: string) => void;
  /** 分镜最大时长（秒），默认15秒，可选5/10/15/20/25/30 */
  shotDuration?: number;
}

// 根据比例和分辨率计算图片 size 参数（WIDTHxHEIGHT 格式）
function calcImageSize(ratio: DramartRatio, resolution: DramartResolution): string {
  const baseW: Record<string, number> = { '1k': 1280, '480p': 854, '720p': 1280, '1080p': 1920, '4k': 3840 };
  const w = baseW[String(resolution || '720p').toLowerCase()] || 1280;
  const ratioMap: Record<string, [number, number]> = {
    '1:1': [1, 1], '16:9': [16, 9], '9:16': [9, 16], '4:3': [4, 3], '3:4': [3, 4], '21:9': [21, 9],
  };
  const [rw, rh] = ratioMap[ratio] || [16, 9];
  const h = Math.round((w * rh) / rw);
  return `${w}x${h}`;
}

export async function runDramartAnalysis(opts: RunAnalysisOptions): Promise<Pick<DramartProject, 'characters' | 'scenes' | 'props' | 'storyboards'>> {
  const { scriptText, scriptFileName, styleName, styleWord, ratio, resolution, config, imageFetcher, onProgress, shotDuration = 15 } = opts;
  void scriptFileName;
  const imgSize = calcImageSize(ratio, resolution);
  const total = DRAMART_ANALYSIS_STEPS.length;
  // 初始化为空资产，不再使用林望故事等演示占位数据
  let result: Pick<DramartProject, 'characters' | 'scenes' | 'props' | 'storyboards'> = { characters: [], scenes: [], props: [], storyboards: [] };
  let aiStoryboards: DramartStoryboard[] | null = null;

  // 明确检查对话 API 配置：未配置时直接抛出错误，避免静默完成但无资产
  const win = window as any;
  if (!win?.yijingAPI?.grsai?.chat || !config?.apiKey || !config?.baseUrl || !config?.model) {
    throw new Error('未配置可用的对话 API，请先在设置页配置对话接口（需包含 API Key、Base URL 和模型），剧本分析需要调用 AI 提取角色/场景/道具和分镜');
  }

  const assetPrompt = [
    '你是影视创作专家，请从剧本中提取「角色、场景、道具」三类资产。严格输出 JSON，不要输出任何其他文字：',
    '{',
    '  "characters":[{"name":"角色名","imageSummary":"详细结构化描述，包含：身份、性格、简介、时代、国家、人种、类型、脸型、发型、身材、头身比、上身着装、下身着装、鞋子、性别、年龄"}],',
    '  "scenes":[{"name":"场景名","imageSummary":"详细描述：空间布局、建筑风格、光线来源、色温、氛围、时间、天气、主要陈设"}],',
    '  "props":[{"name":"道具名","imageSummary":"详细描述：材质、形态、颜色、尺寸、纹理、用途、含义、新旧程度"}]',
    '}',
    '要求：',
    '1. 角色的 imageSummary 必须包含可直接用于图像生成的详细外貌描述，格式参考：身份：xxx；性格：xxx；简介：xxx；时代：xxx；国家：xxx；人种：xxx；类型：xxx；脸型：xxx；发型：xxx；身材：xxx；头身比：xxx；上身着装：xxx；下身着装：xxx；鞋子：xxx；性别：xxx；年龄：xxx',
    '2. 场景的 imageSummary 必须包含空间布局、光线、氛围等可直接用于图像生成的详细描述',
    '3. 道具的 imageSummary 必须包含材质、形态、颜色等可直接用于图像生成的详细描述',
    '4. 所有描述必须基于剧本内容，不要凭空编造剧本中没有的信息',
    '剧本：',
    scriptText,
  ].join('\n');

  // 分镜提示词构建函数：在资产提取完成后调用，传入已提取的资产列表
  const buildStoryboardPrompt = (assets: { characters: any[]; scenes: any[]; props: any[] }) => {
    const charNames = assets.characters.map((c: any) => c.name).join('、');
    const sceneNames = assets.scenes.map((s: any) => s.name).join('、');
    const propNames = assets.props.map((p: any) => p.name).join('、');
    return [
      '你是影视分镜设计师，请根据剧本设计分镜列表。严格输出 JSON，不要输出任何其他文字：',
      '{',
      '  "storyboards":[',
      '    {"index":1,"label":"分镜1","scene":"场景名","characters":["角色名"],"props":["道具名"],"rawScript":"该分镜对应的剧本原文片段，必须从剧本中原样摘录，不要改写","description":"完整分镜描述，包含场景设定、时间、灯光、以及每个镜头的站位和动作描述","duration":' + shotDuration + '}',
      '  ]',
      '}',
      '【已提取资产列表 - 分镜引用必须严格从此列表中选择】',
      '角色：' + (charNames || '（无）'),
      '场景：' + (sceneNames || '（无）'),
      '道具：' + (propNames || '（无）'),
      '',
      '要求：',
      '1. 按剧本中的场景顺序逐场设计，不要遗漏任何场景',
      '2. rawScript 字段必须是该分镜对应的剧本原文片段，从剧本中原样摘录，不要改写、不要总结、不要添加内容',
      '3. 每个分镜的 description 必须包含：',
      '   - 分镜场景设定（具体地点）',
      '   - 时间（日/夜/晨/昏等）',
      '   - 灯光（主光来源、色温、光比、阴影效果）',
      '   - 分镜具体动作描述，按镜头拆分，每个镜头格式：',
      '     镜头N Xs',
      '     [站位] 角色/道具在画面中的位置',
      '     [动作] 镜头类型|运镜方式 具体动作描述，台词用{台词}标注',
      '4. duration 单位为秒，每个分镜的 duration 必须小于等于 ' + shotDuration + ' 秒，绝对不能超过 ' + shotDuration + ' 秒，根据场景内容合理分配',
      '5. 【资产引用严格约束】',
      '   - characters、scene、props 字段必须严格从上方已提取资产列表中选择，绝对不能引用列表中不存在的资产',
      '   - 类似的场景（如同一个房间的不同角度、同一条街道的不同位置）必须合并为同一个场景引用，不要重复生成新场景',
      '   - 不重要的、只出现一次的背景道具（如路边的树、桌上的杯子），只在 description 中用文字描述，不要在 props 字段中生成资产引用',
      '   - 只有对剧情有重要作用、多次出现的核心道具才在 props 字段中引用',
      '   - characters 只列出镜的角色，不出镜的不要列',
      '6. 每个分镜可包含多个镜头，镜头总时长应小于等于分镜 duration，且每个镜头时长也不能超过 ' + shotDuration + ' 秒',
      '7. 镜头类型参考：远景、全景、中景、近景、特写、大特写、主观视角、过肩镜头等',
      '8. 运镜方式参考：固定镜头、缓推、缓拉、摇镜、跟拍、手持、升降等',
      '剧本：',
      scriptText,
    ].join('\n');
  };

  for (let i = 0; i < total; i++) {
    const label = DRAMART_ANALYSIS_STEPS[i];
    onProgress(i, label, Math.round((i / total) * 100));
    await new Promise(r => setTimeout(r, 600));

    if (i === 0) {
      // 第1步：分析剧本 → 提取角色/场景/道具资产
      const system = '你是专业编剧与制片助理。全程中文。严格按用户要求格式输出。';
      const content = await callChat(system, assetPrompt, config);
      console.log('[ASSETDBG] content长度=', content?.length, '前100字符=', content?.slice(0, 100));
      if (content) {
        const parsed = parseJsonObject(content);
        console.log('[ASSETDBG] parsed=', parsed ? '成功' : 'null', 'keys=', parsed ? Object.keys(parsed) : []);
        const norm = normalizeAssets(parsed);
        console.log('[ASSETDBG] norm=', norm ? '成功' : 'null', 'characters=', norm?.characters?.length, 'scenes=', norm?.scenes?.length, 'props=', norm?.props?.length);
        if (norm) { result = { ...result, ...norm }; }
        console.log('[ASSETDBG] result.characters=', result.characters?.length, 'result.scenes=', result.scenes?.length, 'result.props=', result.props?.length);
      }
    } else if (i === 1) {
      // 第2步：分镜设计 → 调用AI生成分镜列表（使用已提取的资产构建提示词，严格约束资产引用）
      // 增加3秒延迟，避免请求太频繁被限流
      await new Promise(r => setTimeout(r, 3000));
      const system = '你是专业分镜设计师。全程中文。严格按用户要求格式输出。';
      const storyboardPrompt = buildStoryboardPrompt(result);
      const content = await callChat(system, storyboardPrompt, config);
      if (content) {
        const parsed = parseJsonObject(content);
        const sbList = Array.isArray(parsed?.storyboards) ? parsed.storyboards : [];
        if (sbList.length) {
          aiStoryboards = sbList.map((sb: any, idx: number) => {
            const idxNum = Number(sb?.index) || (idx + 1);
            const chars = Array.isArray(sb?.characters) ? sb.characters.map((c: any) => String(c).trim()).filter(Boolean) : [];
            const scenes = sb?.scene ? [String(sb.scene).trim()] : [];
            const props = Array.isArray(sb?.props) ? sb.props.map((p: any) => String(p).trim()).filter(Boolean) : [];
            const desc = String(sb?.description || '').trim();
            // rawScript 优先使用 AI 输出的剧本原文片段，如果没有则回退到分镜描述
            const rawScript = String(sb?.rawScript || '').trim() || desc;
            // 确保分镜时长不超过用户选择的最大时长
            const rawDur = Number(sb?.duration) || shotDuration;
            const dur = Math.min(Math.max(rawDur, 1), shotDuration);
            return {
              id: rid('sb'),
              index: idxNum,
              label: sb?.label || ('分镜' + idxNum),
              rawScript: rawScript,
              characters: chars,
              scenes,
              props,
              videoPrompt: makeVideoPrompt(chars[0] || (result.characters[0]?.name || '主角'), scenes[0] || (result.scenes[0]?.name || '场景'), props[0] || (result.props[0]?.name || '道具'), desc, styleName, styleWord, { index: idxNum, duration: dur }),
              duration: dur,
              videoUrl: undefined,
              videoStatus: 'idle' as const,
            };
          });
        }
      }
    }
    // 第3步（提取资产）：复用第1步结果，无需额外调用
    // 第4步（生成提示词）：已在分镜设计中通过 makeVideoPrompt 本地生成

    onProgress(i + 1, label, Math.round(((i + 1) / total) * 100));
  }

  // 自动生成人物/场景/道具参考图（批量并发生成，最大并发3个，避免API限流）
  if (imageFetcher) {
    const all = [...result.characters, ...result.scenes, ...result.props];
    if (all.length > 0) {
      onProgress(4, '生成资产图', 0, `批量生成 ${all.length} 个资产图（并发处理）`);
      let completed = 0;
      const MAX_CONCURRENT = 3;
      const queue = [...all];
      const workers: Promise<void>[] = [];

      const processNext = async (): Promise<void> => {
        while (queue.length > 0) {
          const a = queue.shift()!;
          try {
            const r = await imageFetcher(buildAssetImagePrompt(a), { size: imgSize, source: opts.imageSource });
            if (r?.url) { a.img = r.url; if (r.remoteUrl) a.remoteUrl = r.remoteUrl; }
          } catch { /* 单个失败不影响其他 */ }
          completed++;
          onProgress(4, '生成资产图', Math.round((completed / all.length) * 100), `已完成 ${completed}/${all.length}：${a.name}`);
        }
      };

      // 启动并发 worker
      for (let i = 0; i < Math.min(MAX_CONCURRENT, all.length); i++) {
        workers.push(processNext());
      }
      await Promise.all(workers);
    }
  }

  // 分镜：优先使用AI生成的分镜设计，否则回退到基于剧本的本地切分
  if (aiStoryboards && aiStoryboards.length) {
    result.storyboards = aiStoryboards;
  } else {
    result.storyboards = deriveStoryboardsFromScript({ scriptText, assets: result, styleName, styleWord });
  }

  // 资产同步：检查分镜中引用的资产是否都在资产列表中，缺失的自动补充
  const referencedChars = new Set<string>();
  const referencedScenes = new Set<string>();
  const referencedProps = new Set<string>();
  result.storyboards.forEach(sb => {
    sb.characters.forEach(c => referencedChars.add(c));
    sb.scenes.forEach(s => referencedScenes.add(s));
    sb.props.forEach(p => referencedProps.add(p));
  });

  const existingChars = new Set(result.characters.map(a => a.name));
  const existingScenes = new Set(result.scenes.map(a => a.name));
  const existingProps = new Set(result.props.map(a => a.name));

  const missingChars = Array.from(referencedChars).filter(n => n && !existingChars.has(n));
  const missingScenes = Array.from(referencedScenes).filter(n => n && !existingScenes.has(n));
  const missingProps = Array.from(referencedProps).filter(n => n && !existingProps.has(n));

  if (missingChars.length || missingScenes.length || missingProps.length) {
    // 为缺失的资产生成描述（基于资产名称和剧本内容）
    const supplementPrompt = [
      '请为以下影视资产生成详细的 imageSummary 描述，严格输出 JSON，不要输出任何其他文字：',
      '{',
      missingChars.length ? `  "characters":[${missingChars.map((n, i) => `{"name":"${n}","imageSummary":"详细外貌描述"}`).join(',')}],` : '',
      missingScenes.length ? `  "scenes":[${missingScenes.map((n, i) => `{"name":"${n}","imageSummary":"详细场景描述"}`).join(',')}],` : '',
      missingProps.length ? `  "props":[${missingProps.map((n, i) => `{"name":"${n}","imageSummary":"详细道具描述"}`).join(',')}]` : '',
      '}',
      '要求：',
      '1. 角色的 imageSummary 必须包含可直接用于图像生成的详细外貌描述，格式参考：身份：xxx；性格：xxx；简介：xxx；时代：xxx；国家：xxx；人种：xxx；类型：xxx；脸型：xxx；发型：xxx；身材：xxx；头身比：xxx；上身着装：xxx；下身着装：xxx；鞋子：xxx；性别：xxx；年龄：xxx',
      '2. 场景的 imageSummary 必须包含空间布局、光线、氛围等可直接用于图像生成的详细描述',
      '3. 道具的 imageSummary 必须包含材质、形态、颜色等可直接用于图像生成的详细描述',
      '4. 所有描述必须基于剧本内容，不要凭空编造剧本中没有的信息',
      '剧本：',
      scriptText,
    ].join('\n');

    try {
      const system = '你是专业编剧与制片助理。全程中文。严格按用户要求格式输出。';
      const content = await callChat(system, supplementPrompt, config);
      if (content) {
        const parsed = parseJsonObject(content);
        const norm = normalizeAssets(parsed);
        if (norm) {
          // 合并补充的资产到结果中
          norm.characters.forEach(a => { if (!existingChars.has(a.name)) { result.characters.push(a); existingChars.add(a.name); } });
          norm.scenes.forEach(a => { if (!existingScenes.has(a.name)) { result.scenes.push(a); existingScenes.add(a.name); } });
          norm.props.forEach(a => { if (!existingProps.has(a.name)) { result.props.push(a); existingProps.add(a.name); } });
        }
      }
    } catch { /* 补充失败不影响主流程 */ }

    // 如果AI补充失败，为剩余缺失的资产创建基本描述
    const stillMissingChars = Array.from(referencedChars).filter(n => n && !existingChars.has(n));
    const stillMissingScenes = Array.from(referencedScenes).filter(n => n && !existingScenes.has(n));
    const stillMissingProps = Array.from(referencedProps).filter(n => n && !existingProps.has(n));

    stillMissingChars.forEach((name, i) => {
      result.characters.push(assetItem(name, 'character', `身份：未知；性格：未知；简介：${name}；时代：现代；国家：中国；人种：黄种人；类型：真人；脸型：标准；发型：标准；身材：标准；头身比：7头身；上身着装：日常服装；下身着装：日常裤子；鞋子：日常鞋子；性别：未知；年龄：未知`, (i * 51 + 20) % 360));
      existingChars.add(name);
    });
    stillMissingScenes.forEach((name, i) => {
      result.scenes.push(assetItem(name, 'scene', `空间布局：${name}；建筑风格：现代；光线来源：自然光；色温：中性；氛围：普通；时间：白天；天气：晴；主要陈设：基础陈设`, (i * 51 + 80) % 360));
      existingScenes.add(name);
    });
    stillMissingProps.forEach((name, i) => {
      result.props.push(assetItem(name, 'prop', `材质：未知；形态：${name}；颜色：未知；尺寸：标准；纹理：普通；用途：未知；含义：未知；新旧程度：普通`, (i * 51 + 140) % 360));
      existingProps.add(name);
    });
  }

  onProgress(total, '完成', 100);
  return result;
}
// ==================== 剧创模式：解析剧创结果 ====================

export interface DramaDraftAnalyzeOptions {
  draft: DramartProject;
  /** 剧创模式：所选风格的提示词（含自定义风格），统一替换剧创草稿里的所有风格提示词 */
  styleWord?: string;
  /** 图片比例，如 16:9、1:1 等，用于资产生成 */
  ratio?: DramartRatio;
  /** 图片分辨率，如 1k、2k、4k 等，用于资产生成 */
  resolution?: DramartResolution;
  /** 资产图默认生成源（来自项目创建选择），透传给 imageFetcher */
  imageSource?: AssetImageSource;
  imageFetcher?: (prompt: string, opts?: { size?: string; source?: AssetImageSource }) => Promise<{ url: string; remoteUrl?: string } | null>;
  onProgress: (step: number, label: string, percent: number, msg?: string) => void;
}

// 解析 Markdown 表格块：返回行数组 + 表头（跳过分隔行）
function parseMdTables(md: string): Array<{ headers: string[]; rows: string[][] }> {
  const out: Array<{ headers: string[]; rows: string[][] }> = [];
  const lines = String(md || '').split(/\r?\n/);
  let li = 0;
  while (li < lines.length) {
    const ln = lines[li].trim();
    if (ln.startsWith('|') && ln.endsWith('|')) {
      const block: string[] = [];
      while (li < lines.length && lines[li].trim().startsWith('|') && lines[li].trim().endsWith('|')) { block.push(lines[li]); li++; }
      const parsed = block.filter(l => !/^\|[\s\-:|]+\|$/.test(l.trim()));
      if (parsed.length >= 2) {
        const split = (row: string) => { const c = row.split('|'); if (c.length >= 2) { c.shift(); c.pop(); } return c.map(x => x.trim()); };
        out.push({ headers: split(parsed[0]), rows: parsed.slice(1).map(split) });
      }
    } else { li++; }
  }
  return out;
}

// 从表格头里按关键字找列
function findCol(headers: string[], ...keys: string[]): number {
  return headers.findIndex(h => keys.some(k => (h || '').includes(k)));
}

export async function runDramaDraftAnalysis(opts: DramaDraftAnalyzeOptions): Promise<Pick<DramartProject, 'characters' | 'scenes' | 'props' | 'storyboards'>> {
  const { draft, styleWord, ratio, resolution, imageFetcher, onProgress } = opts;
  const total = DRAMART_ANALYSIS_STEPS.length;
  const prompts = draft.promptsContent || '';
  const script = draft.scriptContent || draft.scriptText || '';
  // 计算资产生成的尺寸参数（默认 16:9, 720p）
  const imgSize = calcImageSize(ratio || '16:9', resolution || '720p');
  const characters: DramartAssetItem[] = [];
  const scenes: DramartAssetItem[] = [];
  const props: DramartAssetItem[] = [];
  const storyboards: DramartStoryboard[] = [];

  const tables = parseMdTables(prompts);
  // 第一张两列表 = 资产表
  const assetTable = tables.find(t => t.headers.length === 2);
  if (assetTable) {
    assetTable.rows.forEach((cells, i) => {
      const name = (cells[0] || '').trim();
      const prompt = (cells[1] || '').trim();
      if (!name || !prompt) return;
      const item = assetItem(name, name.includes('场景') || /房间|室|院|房|桥|街道|办公室/.test(name) ? 'scene' : name.includes('道具') || /报告单|照片|证件|信/.test(name) ? 'prop' : 'character', prompt.slice(0, 60), (i * 47 + 20) % 360);
      item.prompt = prompt;
      if (item.kind === 'character') characters.push(item);
      else if (item.kind === 'scene') scenes.push(item);
      else props.push(item);
    });
  }

  // 其余表 = 分镜表
  tables.forEach(tb => {
    const head = tb.headers.join('|');
    const looksShot = /镜号|分镜|文生视频|视频/ig.test(head) || tb.headers.length >= 5;
    if (!looksShot) return;
    const cShot = findCol(tb.headers, '镜号', '序号', '镜头');
    const cChar = findCol(tb.headers, '出镜人物', '人物', '角色');
    const cScene = findCol(tb.headers, '场景');
    const cProp = findCol(tb.headers, '道具');
    const cVid = findCol(tb.headers, '文生视频', '视频提示', '提示词');
    tb.rows.forEach((cells, rIdx) => {
      const shot = (cShot >= 0 ? cells[cShot] : cells[0] || '').trim() || String(rIdx + 1);
      const shotNum = parseInt(shot, 10);
      const idxNum = Number.isFinite(shotNum) ? shotNum : (storyboards.length + 1);
      const charactersStr = (cChar >= 0 ? cells[cChar] || '' : '').trim();
      const scene = (cScene >= 0 ? cells[cScene] || '' : '').trim();
      const prop = (cProp >= 0 ? cells[cProp] || '' : '').trim();
      const vid = (cVid >= 0 ? cells[cVid] || '' : '').trim();
      const chars = charactersStr.split(/[、,，\s]+/).map(s => s.replace(/[<>]/g, '').trim()).filter(Boolean).slice(0, 2);
      // 剧创模式：统一按所选风格生成 —— 将剧创草稿里的风格提示词替换为所选风格提示词（仅作用于本分镜副本，不改动草稿/画布数据）
      const charName = chars[0] || characters[0]?.name || '主角';
      const sceneName = (scene || scenes[0]?.name || '场景').replace(/[<>]/g, '').trim();
      const propName = (prop || props[0]?.name || '道具').replace(/[<>]/g, '').trim();
      const shotStyleName = draft.styleName || '90年代中国农村电影';
      const shotStyleW = styleWord || stylePromptOf(shotStyleName) || shotStyleName;
      const styleLine = '画风：' + shotStyleName + '（' + shotStyleW + '），全程严格保持该画风';
      const shotDesc = vid && vid.trim()
        ? styleLine + '\n' + vid
        : makeVideoPrompt(charName, sceneName, propName, script, shotStyleName, shotStyleW, { index: idxNum, duration: 15 });
      // rawScript 使用本分镜对应的视频描述/场景内容，不再使用完整剧本
      const shotRawScript = vid && vid.trim() ? vid : (scene ? '【' + sceneName + '】' + script.slice(0, 300) : script.slice(0, 300));
      storyboards.push({
        id: rid('sb'),
        index: idxNum,
        label: '分镜' + idxNum,
        rawScript: shotRawScript,
        characters: chars.length ? chars : characters.slice(0, 2).map(a => a.name),
        scenes: scene ? [sceneName] : scenes.slice(0, 1).map(a => a.name),
        props: prop ? [propName] : props.slice(0, 1).map(a => a.name),
        videoPrompt: shotDesc,
        duration: 15,
        videoUrl: undefined,
        videoStatus: 'idle',
      });
    });
  });

  // 兜底：没有解析到时用空资产 + 基于剧本的分镜切分，不再使用林望故事等演示占位数据
  if (!storyboards.length) {
    const derived = deriveStoryboardsFromScript({ scriptText: script, assets: { characters, scenes, props }, styleName: draft.styleName || '现代都市通用', styleWord });
    storyboards.push(...derived);
  }


  // 给角色补变装（主形象已生成，变装为待生成占位）
  characters.forEach(a => {
    a.variants = [
      { id: rid('va'), label: '主形象', img: a.img },
      { id: rid('va'), label: '秋季' },
      { id: rid('va'), label: '夏季' },
      { id: rid('va'), label: '冬季' },
    ];
  });

  const result = { characters, scenes, props, storyboards };

  // 资产同步：检查分镜中引用的资产是否都在资产列表中，缺失的自动补充
  const referencedChars = new Set<string>();
  const referencedScenes = new Set<string>();
  const referencedProps = new Set<string>();
  storyboards.forEach(sb => {
    sb.characters.forEach(c => referencedChars.add(c));
    sb.scenes.forEach(s => referencedScenes.add(s));
    sb.props.forEach(p => referencedProps.add(p));
  });

  const existingChars = new Set(characters.map(a => a.name));
  const existingScenes = new Set(scenes.map(a => a.name));
  const existingProps = new Set(props.map(a => a.name));

  const missingChars = Array.from(referencedChars).filter(n => n && !existingChars.has(n));
  const missingScenes = Array.from(referencedScenes).filter(n => n && !existingScenes.has(n));
  const missingProps = Array.from(referencedProps).filter(n => n && !existingProps.has(n));

  if (missingChars.length || missingScenes.length || missingProps.length) {
    // 为缺失的资产创建基本描述（剧创模式下基于名称生成）
    missingChars.forEach((name, i) => {
      const item = assetItem(name, 'character', `身份：未知；性格：未知；简介：${name}；时代：现代；国家：中国；人种：黄种人；类型：真人；脸型：标准；发型：标准；身材：标准；头身比：7头身；上身着装：日常服装；下身着装：日常裤子；鞋子：日常鞋子；性别：未知；年龄：未知`, (i * 51 + 20) % 360);
      characters.push(item);
      existingChars.add(name);
    });
    missingScenes.forEach((name, i) => {
      const item = assetItem(name, 'scene', `空间布局：${name}；建筑风格：现代；光线来源：自然光；色温：中性；氛围：普通；时间：白天；天气：晴；主要陈设：基础陈设`, (i * 51 + 80) % 360);
      scenes.push(item);
      existingScenes.add(name);
    });
    missingProps.forEach((name, i) => {
      const item = assetItem(name, 'prop', `材质：未知；形态：${name}；颜色：未知；尺寸：标准；纹理：普通；用途：未知；含义：未知；新旧程度：普通`, (i * 51 + 140) % 360);
      props.push(item);
      existingProps.add(name);
    });
  }

  // 生成资产参考图
  if (imageFetcher) {
    const all = [...characters, ...scenes, ...props];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      onProgress(4, '生成资产图', Math.round(((i + 1) / all.length) * 100), '正在生成' + a.name + (a.kind === 'character' ? '形象' : '') + '（' + (i + 1) + '/' + all.length + '）');
      const r = await imageFetcher(a.prompt || buildAssetImagePrompt(a), { size: imgSize, source: opts.imageSource }).catch(() => null);
      if (r?.url) { a.img = r.url; if (r.remoteUrl) a.remoteUrl = r.remoteUrl; }
    }
  }
  onProgress(total, '完成', 100);
  return result;
}

// ==================== 补充剧本：资产复用 + 分镜接续 ====================

// 按场景标记切分剧本（支持中文数字与阿拉伯数字，多种格式），无标记时视为一个片段
const CN_NUM_STR = '一二三四五六七八九十百千零〇';
// 支持：第X集、第X场、场X、场 X、场景X、Scene X、SCENE X
const EP_MARK_RE = new RegExp(
  '(?:第[' + CN_NUM_STR + '0-9]+[集场幕]|场\\s*[' + CN_NUM_STR + '0-9]+|场景\\s*[' + CN_NUM_STR + '0-9]+|Scene\\s*\\d+|SCENE\\s*\\d+)',
  'i'
);

export interface SupplementEpisode { title: string; content: string; }

export function splitSupplementEpisodes(scriptText: string): SupplementEpisode[] {
  const text = String(scriptText || '').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const episodes: SupplementEpisode[] = [];
  let cur: SupplementEpisode | null = null;
  let preamble: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(EP_MARK_RE);
    if (m) {
      if (cur) episodes.push(cur);
      cur = { title: m[0], content: line };
      if (preamble.length) { cur.content = preamble.join('\n') + '\n' + cur.content; preamble = []; }
    } else if (cur) {
      cur.content += '\n' + raw;
    } else if (raw.trim()) {
      preamble.push(raw);
    }
  }
  if (cur) episodes.push(cur);
  if (episodes.length === 0 && text) episodes.push({ title: '补充剧情', content: text });
  return episodes;
}

export interface DeriveStoryboardsInput {
  scriptText: string;
  assets: Pick<DramartProject, 'characters' | 'scenes' | 'props'>;
  styleName: string;
  styleWord?: string;
}

/** 从真实剧本切分生成分镜（逐集/逐场景块），并自动匹配出镜资产，不再使用演示占位分镜 */
export function deriveStoryboardsFromScript(input: DeriveStoryboardsInput): DramartStoryboard[] {
  const { scriptText, assets, styleName, styleWord } = input;
  const assetChars = (assets.characters || []).map(a => a.name);
  const assetScenes = (assets.scenes || []).map(a => a.name);
  const assetProps = (assets.props || []).map(a => a.name);
  const raw = String(scriptText || '').trim();
  const pickNames = (list: DramartAssetItem[], text: string): string[] => {
    const hit = list.filter(a => text.includes(a.name)).map(a => a.name);
    return hit.length ? hit : list.slice(0, 1).map(a => a.name);
  };
  let episodes = splitSupplementEpisodes(scriptText);
  if (episodes.length <= 1 && raw) {
    const blocks = raw.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
    if (blocks.length > 1) episodes = blocks.map((b, i) => ({ title: '场景' + (i + 1), content: b }));
  }
  if (!episodes.length && raw) episodes = [{ title: '分镜1', content: raw }];
  return episodes.map((ep, i) => {
    const chars = pickNames(assets.characters, ep.content).slice(0, 2);
    const scenes = pickNames(assets.scenes, ep.content).slice(0, 1);
    const props = pickNames(assets.props, ep.content).slice(0, 1);
    return {
      id: rid('sb'),
      index: i + 1,
      label: '分镜' + (i + 1),
      rawScript: ep.content,
      characters: chars,
      scenes,
      props,
      videoPrompt: makeVideoPrompt(chars[0] || (assetChars[0] || '主角'), scenes[0] || (assetScenes[0] || '场景'), props[0] || (assetProps[0] || '道具'), ep.content, styleName, styleWord, { index: i + 1, duration: 15 }),
      duration: 15,
      videoUrl: undefined,
      videoStatus: 'idle',
    };
  });
}

export interface SupplementAnalysisOptions {
  scriptText: string;
  scriptFileName: string;
  styleName: string;
  /** 已解析的风格提示词（含自定义风格），用于分镜视频提示词中严格保持该画风 */
  styleWord?: string;
  ratio: DramartRatio;
  resolution: DramartResolution;
  config: AIConfigInput | null;
  /** 资产图默认生成源（来自项目创建选择），透传给 imageFetcher */
  imageSource?: AssetImageSource;
  /** 补充前已有资产（角色/场景/道具），用于去重复用 */
  existing: Pick<DramartProject, 'characters' | 'scenes' | 'props'>;
  /** 既有分镜数量：新分镜的集数从该数量之后接续 */
  storyboardOffset: number;
  imageFetcher?: (prompt: string, opts?: { source?: AssetImageSource }) => Promise<{ url: string; remoteUrl?: string } | null>;
  onProgress: (step: number, label: string, percent: number, msg?: string) => void;
}

export interface SupplementAnalysisResult {
  /** 仅新增（补充前资产库中不存在）的资产，含已生成的参考图 */
  added: Pick<DramartProject, 'characters' | 'scenes' | 'props'>;
  /** 补充部分生成的分镜（集数已接续既有分镜之后） */
  storyboards: DramartStoryboard[];
  /** 直接复用的补充前已有资产数量（同名去重命中） */
  reusedCount: number;
}

export async function runSupplementAnalysis(opts: SupplementAnalysisOptions): Promise<SupplementAnalysisResult> {
  const { scriptText, scriptFileName, styleName, styleWord, ratio, resolution, config, existing, storyboardOffset, imageFetcher, onProgress } = opts;
  void scriptFileName; void ratio; void resolution;
  const total = DRAMART_ANALYSIS_STEPS.length;
  const offset = Math.max(0, Number(storyboardOffset) || 0);

  // 1. 从补充剧本提取资产（AI 优先，失败则仅依赖既有资产直接引用）
  let extracted: Pick<DramartProject, 'characters' | 'scenes' | 'props'> | null = null;
  const assetPrompt = [
    '你是影视创作专家，请从补充剧本中提取「角色、场景、道具」三类资产。严格输出 JSON，不要输出任何其他文字：',
    '{',
    '  "characters":[{"name":"角色名","imageSummary":"一句话身份+性格+简介"}],',
    '  "scenes":[{"name":"场景名","imageSummary":"空间+光线+氛围"}],',
    '  "props":[{"name":"道具名","imageSummary":"材质+形态+含义"}]',
    '}',
    '注意：仅提取补充剧本中新增出现的角色、场景、道具；与之前剧本中相同的不要重复。',
    '补充剧本：',
    scriptText,
  ].join('\n');

  onProgress(0, DRAMART_ANALYSIS_STEPS[0], 10);
  await new Promise(r => setTimeout(r, 400));
  const system = '你是专业编剧与制片助理。全程中文。严格按用户要求格式输出。';
  const content = await callChat(system, assetPrompt, config);
  if (content) {
    const parsed = parseJsonObject(content);
    const norm = normalizeAssets(parsed);
    if (norm) extracted = norm;
  }
  onProgress(1, '分镜设计', 45);

  // 2. 分镜设计：调用AI生成分镜列表（与主流程一致）
  const storyboardPrompt = [
    '你是影视分镜设计师，请根据补充剧本设计分镜列表。严格输出 JSON，不要输出任何其他文字：',
    '{',
    '  "storyboards":[',
    '    {"index":1,"label":"分镜1","scene":"场景名","characters":["角色名"],"props":["道具名"],"description":"完整画面描述与台词","duration":15}',
    '  ]',
    '}',
    '要求：',
    '1. 按补充剧本中的场景顺序逐场设计，不要遗漏任何场景',
    '2. 每个分镜的 description 必须包含该场景的完整画面描述、台词和动作',
    '3. duration 单位为秒，根据场景内容合理分配',
    '4. characters 只列出镜的角色，不出镜的不要列',
    '补充剧本：',
    scriptText,
  ].join('\n');
  let aiStoryboards: DramartStoryboard[] | null = null;
  const sbSystem = '你是专业分镜设计师。全程中文。严格按用户要求格式输出。';
  // 增加3秒延迟，避免请求太频繁被限流
  await new Promise(r => setTimeout(r, 3000));
  const sbContent = await callChat(sbSystem, storyboardPrompt, config);
  if (sbContent) {
    const sbParsed = parseJsonObject(sbContent);
    const sbList = Array.isArray(sbParsed?.storyboards) ? sbParsed.storyboards : [];
    if (sbList.length) {
      const allCharsForPrompt = [...(existing.characters || []), ...(extracted?.characters || [])];
      const allScenesForPrompt = [...(existing.scenes || []), ...(extracted?.scenes || [])];
      const allPropsForPrompt = [...(existing.props || []), ...(extracted?.props || [])];
      aiStoryboards = sbList.map((sb: any, idx: number) => {
        const idxNum = offset + idx + 1;
        const chars = Array.isArray(sb?.characters) ? sb.characters.map((c: any) => String(c).trim()).filter(Boolean) : [];
        const scenes = sb?.scene ? [String(sb.scene).trim()] : [];
        const props = Array.isArray(sb?.props) ? sb.props.map((p: any) => String(p).trim()).filter(Boolean) : [];
        const desc = String(sb?.description || '').trim();
        const dur = Number(sb?.duration) || 15;
        return {
          id: rid('sb'),
          index: idxNum,
          label: sb?.label || ('分镜' + idxNum),
          rawScript: desc,
          characters: chars,
          scenes,
          props,
          videoPrompt: makeVideoPrompt(chars[0] || (allCharsForPrompt[0]?.name || '主角'), scenes[0] || (allScenesForPrompt[0]?.name || '场景'), props[0] || (allPropsForPrompt[0]?.name || '道具'), desc, styleName, styleWord, { index: idxNum, duration: dur }),
          duration: dur,
          videoUrl: undefined,
          videoStatus: 'idle' as const,
        };
      });
    }
  }

  // 3. 资产去重：补充前已有同名资产直接引用（不重复生成），仅保留真正新增的
  const added: Pick<DramartProject, 'characters' | 'scenes' | 'props'> = { characters: [], scenes: [], props: [] };
  let reusedCount = 0;
  const hasAsset = (kind: DramartAssetItem['kind'], name: string): boolean => {
    const plural = kind === 'character' ? 'characters' : kind === 'scene' ? 'scenes' : 'props';
    const list = existing[plural] || [];
    const n = String(name || '').trim();
    if (!n) return true;
    return list.some(a => a.name === n || n.includes(a.name) || a.name.includes(n));
  };
  if (extracted) {
    const KIND_MAP: Record<'characters' | 'scenes' | 'props', DramartAssetItem['kind']> = {
      characters: 'character',
      scenes: 'scene',
      props: 'prop',
    };
    (['characters', 'scenes', 'props'] as const).forEach(kind => {
      (extracted[kind] || []).forEach(a => {
        if (hasAsset(KIND_MAP[kind], a.name)) { reusedCount += 1; return; } // 已有同名资产 → 直接引用，不重复生成
        added[kind].push(a);
      });
    });
  }
  onProgress(2, '提取资产', 70);

  // 3. 分镜：优先使用AI生成的分镜设计，否则回退到基于剧本的本地切分
  let storyboards: DramartStoryboard[];
  if (aiStoryboards && aiStoryboards.length) {
    storyboards = aiStoryboards;
  } else {
    const episodes = splitSupplementEpisodes(scriptText);
    const allChars = [...(existing.characters || []), ...added.characters];
    const allScenes = [...(existing.scenes || []), ...added.scenes];
    const allProps = [...(existing.props || []), ...added.props];
    const pickNames = (list: DramartAssetItem[], text: string): string[] => {
      const hit = list.filter(a => text.includes(a.name)).map(a => a.name);
      return hit.length ? hit : list.slice(0, 1).map(a => a.name);
    };
    storyboards = episodes.map((ep, i) => {
      const idx = offset + i + 1;
      const chars = pickNames(allChars, ep.content).slice(0, 2);
      const scenes = pickNames(allScenes, ep.content).slice(0, 1);
      const props = pickNames(allProps, ep.content).slice(0, 1);
      const character = chars[0] || '主角';
      const scene = scenes[0] || (allScenes[0]?.name || '场景');
      const prop = props[0] || (allProps[0]?.name || '道具');
      return {
        id: rid('sb'),
        index: idx,
        label: '分镜' + idx,
        rawScript: ep.content,
        characters: chars,
        scenes,
        props,
        videoPrompt: makeVideoPrompt(character, scene, prop, ep.content, styleName, styleWord, { index: idx, duration: 15 }),
        duration: 15,
        videoUrl: undefined,
        videoStatus: 'idle',
      };
    });
  }
  onProgress(3, '提示词生成', 90);

  // 4. 仅为新增资产生成参考图（既有资产直接复用，不重复生成）
  if (imageFetcher && (added.characters.length || added.scenes.length || added.props.length)) {
    const all = [...added.characters, ...added.scenes, ...added.props];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      onProgress(4, '生成资产图', Math.round(((i + 1) / all.length) * 100), '正在生成' + a.name + (a.kind === 'character' ? '形象' : '') + '（' + (i + 1) + '/' + all.length + '）');
      const r = await imageFetcher(buildAssetImagePrompt(a), { source: opts.imageSource }).catch(() => null);
      if (r?.url) { a.img = r.url; if (r.remoteUrl) a.remoteUrl = r.remoteUrl; }
    }
  }
  await new Promise(r => setTimeout(r, 300));
  onProgress(total, '完成', 100);
  return { added, storyboards, reusedCount };
}
