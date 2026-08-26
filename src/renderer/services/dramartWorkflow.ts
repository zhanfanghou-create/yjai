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
  prompt?: string;
  voice?: string;
  variants?: { id: string; label: string; img?: string; candidates?: string[]; prompt?: string }[];
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
}

export interface DramartAnalysisState {
  step: number;
  total: number;
  label: string;
  status: 'idle' | 'running' | 'done' | 'error';
  percent: number;
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
DRAMART_STYLES.forEach(s => { s.img = '/dramart-styles/' + s.id + '.png'; });

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
    { id: rid('sb'), index: 1, label: '分镜1', rawScript: by1, characters: ['成年林望'], scenes: ['城市写字楼办公室'], props: ['泛黄全家福照片'], videoPrompt: makeVideoPrompt('成年林望', '城市写字楼办公室', '泛黄全家福照片', by1, undefined, undefined, { index: 1, duration: 11 }), duration: 11 },
    { id: rid('sb'), index: 2, label: '分镜2', rawScript: by2, characters: ['幼年林望'], scenes: ['农村土墙瓦房室内'], props: ['胸片检查报告单'], videoPrompt: makeVideoPrompt('幼年林望', '农村土墙瓦房室内', '胸片检查报告单', by2, undefined, undefined, { index: 2, duration: 6 }), duration: 6 },
  ];
}

// 分镜视频提示词：按参考格式输出（场次标题 + 时长 + 场景 + 完整分镜剧本原文 + 素材引用），参数均取实际值，不固定具体内容
export function makeVideoPrompt(character: string, scene: string, prop: string, description: string, styleName = '90年代中国农村电影', explicitWord?: string, opts?: { index?: number; duration?: number }): string {
  const styleWord = explicitWord || stylePromptOf(styleName) || styleName;
  const idx = opts && opts.index ? opts.index : 1;
  const dur = opts && opts.duration ? opts.duration : 11;
  const scriptText = (description || '').trim();
  return [
    '画风：' + styleName + '（' + styleWord + '），全程严格保持该画风',
    '视频中不得出现任何字幕、文字叠加、纯画面，不要bgm，不要配乐。',
    '',
    '【第' + idx + '场】0:00 - ' + dur + 's（' + scene + ' · 日常）',
    '时长：' + dur + 's',
    '场景：' + scene,
    '',
    '### 画面与台词（完整分镜剧本原文）',
    scriptText || '（暂无画面描述）',
    '',
    '### 素材引用',
    '【人物】<' + character + '>对应' + character + '，只采用外貌、发型和服装。',
    '【场景】<' + scene + '>参考' + scene + '，只采用空间布局、建筑和光线，不采用图中人物。',
    '【道具】<' + prop + '>对应' + prop + '，只采用结构、材质和颜色。',
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
    return desc;
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
  try {
    const win = window as any;
    if (win?.yijingAPI?.grsai?.chat && config?.apiKey && config?.baseUrl && config?.model) {
      const result = await win.yijingAPI.grsai.chat({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      if (result?.ok) {
        return result.data?.choices?.[0]?.message?.content || result.data?.content || result.data?.response || null;
      }
    }
  } catch {
    // 忽略，走 fallback
  }
  return null;
}

function parseJsonObject(text: string): any | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
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
  imageFetcher?: (prompt: string) => Promise<string | null>;
  onProgress: (step: number, label: string, percent: number, msg?: string) => void;
}

export async function runDramartAnalysis(opts: RunAnalysisOptions): Promise<Pick<DramartProject, 'characters' | 'scenes' | 'props' | 'storyboards'>> {
  const { scriptText, scriptFileName, styleName, styleWord, ratio, resolution, config, imageFetcher, onProgress } = opts;
  void scriptFileName; void ratio; void resolution;
  const total = DRAMART_ANALYSIS_STEPS.length;
  let result = defaultProjectData();
  let aiOk = false;

  const assetPrompt = [
    '你是影视创作专家，请从剧本中提取「角色、场景、道具」三类资产。严格输出 JSON，不要输出任何其他文字：',
    '{',
    '  "characters":[{"name":"角色名","imageSummary":"一句话身份+性格+简介"}],',
    '  "scenes":[{"name":"场景名","imageSummary":"空间+光线+氛围"}],',
    '  "props":[{"name":"道具名","imageSummary":"材质+形态+含义"}]',
    '}',
    '剧本：',
    scriptText.slice(0, 3000),
  ].join('\n');

  for (let i = 0; i < total; i++) {
    const label = DRAMART_ANALYSIS_STEPS[i];
    onProgress(i, label, Math.round((i / total) * 100));
    await new Promise(r => setTimeout(r, 600));

    if (i === 0) {
      const system = '你是专业编剧与制片助理。全程中文。严格按用户要求格式输出。';
      const content = await callChat(system, assetPrompt, config);
      if (content) {
        const parsed = parseJsonObject(content);
        const norm = normalizeAssets(parsed);
        if (norm) { result = { ...result, ...norm }; aiOk = true; }
      }
    }

    onProgress(i + 1, label, Math.round(((i + 1) / total) * 100));
  }

  // 自动生成人物/场景/道具参考图（best-effort，无图时页面回退渐变占位）
  if (imageFetcher) {
    const all = [...result.characters, ...result.scenes, ...result.props];
    for (let ai = 0; ai < all.length; ai++) {
      const a = all[ai];
      onProgress(4, '生成资产图', Math.round(((ai + 1) / all.length) * 100), '正在生成' + a.name + (a.kind === 'character' ? '形象' : '') + '（' + (ai + 1) + '/' + all.length + '）');
      const url = await imageFetcher(buildAssetImagePrompt(a)).catch(() => null);
      if (url) a.img = url;
    }
  }


  // 用真实剧本切分生成分镜：按「第*集」切分，逐集生成分镜（真实原文 + 出镜资产）；无集数标记时按段落分块，不再使用演示占位分镜
  result.storyboards = deriveStoryboardsFromScript({ scriptText, assets: result, styleName, styleWord });

  onProgress(total, '完成', 100);
  return result;
}
// ==================== 剧创模式：解析剧创结果 ====================

export interface DramaDraftAnalyzeOptions {
  draft: DramartProject;
  /** 剧创模式：所选风格的提示词（含自定义风格），统一替换剧创草稿里的所有风格提示词 */
  styleWord?: string;
  imageFetcher?: (prompt: string) => Promise<string | null>;
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
  const { draft, styleWord, imageFetcher, onProgress } = opts;
  const total = DRAMART_ANALYSIS_STEPS.length;
  const prompts = draft.promptsContent || '';
  const script = draft.scriptContent || draft.scriptText || '';
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
        : makeVideoPrompt(charName, sceneName, propName, script, shotStyleName, shotStyleW, { index: idxNum, duration: 11 });
      storyboards.push({
        id: rid('sb'),
        index: idxNum,
        label: '分镜' + idxNum,
        rawScript: script,
        characters: chars.length ? chars : characters.slice(0, 2).map(a => a.name),
        scenes: scene ? [sceneName] : scenes.slice(0, 1).map(a => a.name),
        props: prop ? [propName] : props.slice(0, 1).map(a => a.name),
        videoPrompt: shotDesc,
        duration: 11,
        videoUrl: undefined,
        videoStatus: 'idle',
      });
    });
  });

  // 兜底：没有解析到时用默认
  if (!characters.length && !scenes.length && !props.length) {
    const d = defaultProjectData();
    characters.push(...d.characters); scenes.push(...d.scenes); props.push(...d.props);
  }
  if (!storyboards.length) storyboards.push(...defaultStoryboards(script));


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

  // 生成资产参考图
  if (imageFetcher) {
    const all = [...characters, ...scenes, ...props];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      onProgress(4, '生成资产图', Math.round(((i + 1) / all.length) * 100), '正在生成' + a.name + (a.kind === 'character' ? '形象' : '') + '（' + (i + 1) + '/' + all.length + '）');
      const url = await imageFetcher(a.prompt || buildAssetImagePrompt(a)).catch(() => null);
      if (url) a.img = url;
    }
  }
  onProgress(total, '完成', 100);
  return result;
}

// ==================== 补充剧本：资产复用 + 分镜接续 ====================

// 按「第*集」字段切分补充剧本（支持中文数字与阿拉伯数字），无标记时视为一个补充片段
const CN_NUM_STR = '一二三四五六七八九十百千零〇';
const EP_MARK_RE = new RegExp('第[' + CN_NUM_STR + '0-9]+集');

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
      videoPrompt: makeVideoPrompt(chars[0] || (assetChars[0] || '主角'), scenes[0] || (assetScenes[0] || '场景'), props[0] || (assetProps[0] || '道具'), ep.content, styleName, styleWord, { index: i + 1, duration: 11 }),
      duration: 11,
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
  /** 补充前已有资产（角色/场景/道具），用于去重复用 */
  existing: Pick<DramartProject, 'characters' | 'scenes' | 'props'>;
  /** 既有分镜数量：新分镜的集数从该数量之后接续 */
  storyboardOffset: number;
  imageFetcher?: (prompt: string) => Promise<string | null>;
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
    scriptText.slice(0, 3000),
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

  // 2. 资产去重：补充前已有同名资产直接引用（不重复生成），仅保留真正新增的
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

  // 3. 分镜：按「第*集」切分补充剧本，集数从既有分镜之后接续
  const episodes = splitSupplementEpisodes(scriptText);
  const allChars = [...(existing.characters || []), ...added.characters];
  const allScenes = [...(existing.scenes || []), ...added.scenes];
  const allProps = [...(existing.props || []), ...added.props];
  const pickNames = (list: DramartAssetItem[], text: string): string[] => {
    const hit = list.filter(a => text.includes(a.name)).map(a => a.name);
    return hit.length ? hit : list.slice(0, 1).map(a => a.name);
  };
  const storyboards: DramartStoryboard[] = episodes.map((ep, i) => {
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
      videoPrompt: makeVideoPrompt(character, scene, prop, ep.content, styleName, styleWord, { index: idx, duration: 11 }),
      duration: 11,
      videoUrl: undefined,
      videoStatus: 'idle',
    };
  });
  onProgress(3, '提示词生成', 90);

  // 4. 仅为新增资产生成参考图（既有资产直接复用，不重复生成）
  if (imageFetcher && (added.characters.length || added.scenes.length || added.props.length)) {
    const all = [...added.characters, ...added.scenes, ...added.props];
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      onProgress(4, '生成资产图', Math.round(((i + 1) / all.length) * 100), '正在生成' + a.name + (a.kind === 'character' ? '形象' : '') + '（' + (i + 1) + '/' + all.length + '）');
      const url = await imageFetcher(buildAssetImagePrompt(a)).catch(() => null);
      if (url) a.img = url;
    }
  }
  await new Promise(r => setTimeout(r, 300));
  onProgress(total, '完成', 100);
  return { added, storyboards, reusedCount };
}
