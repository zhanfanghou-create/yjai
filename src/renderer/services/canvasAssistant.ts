import { useAppStore, AINode, AINodeType, APIConfig } from '../store/appStore';
import { runCapabilityReport, formatReport } from './comfyCapability';

// 画布助手可创建的节点类型（与 store 中 AINodeType 对齐，附中文说明供 LLM 判断意图）
export const ASSISTANT_NODE_TYPES: { type: AINodeType; label: string; keywords: string }[] = [
  { type: 'text-to-image', label: '文生图', keywords: '文字生成图片 画图 出图 生成图像' },
  { type: 'image-to-image', label: '图生图', keywords: '参考图生成 改图 图转图' },
  { type: 'image-blend', label: '多图融合', keywords: '多张图片融合 风格融合 合成' },
  { type: 'image-upscale', label: '图片高清修复', keywords: '高清 放大 修复 超分 清晰' },
  { type: 'image-to-video', label: '图生视频', keywords: '图片转视频 图片生成视频' },
  { type: 'text-to-video', label: '文生视频', keywords: '文字生成视频 文本转视频' },
  { type: 'frame-to-video', label: '首尾帧生成视频', keywords: '首帧 尾帧 首尾帧 关键帧视频' },
  { type: 'live-portrait', label: '换脸/驱动', keywords: '换脸 人脸替换 表情驱动' },
  { type: 'video-extend', label: '视频延长', keywords: '视频延长 续写视频' },
  { type: 'video-remix', label: '视频改写', keywords: '视频风格改写 视频转绘' },
  { type: 'lip-sync', label: '对口型', keywords: '对口型 唇形同步 配音口型' },
  { type: 'tts', label: '文字转语音', keywords: '配音 语音合成 朗读 tts' },
  { type: 'story-script', label: '故事脚本', keywords: '剧本 脚本 分镜文案' },
  { type: 'result', label: '结果节点', keywords: '展示结果 汇总' },
];

export interface AssistantAction {
  action: 'addNode' | 'updateNode' | 'executeNode' | 'deleteNode' | 'connectNodes';
  type?: AINodeType;
  nodeId?: string;
  // connectNodes：连线的源与目标节点（可用 $last 指代最近新建的节点）
  source?: string;
  target?: string;
  prompt?: string;
  options?: Record<string, any>;
  // 新建节点使用的执行后端：'comfyui' 或 'api'（走用户配置的 API 模型）
  backend?: 'comfyui' | 'api';
  // 当有多个 ComfyUI 配置时，可按名称指定用哪个
  comfyName?: string;
}

export interface AssistantResult {
  reply: string;
  actions: AssistantAction[];
  raw?: string;
}

const base = (url = '') => String(url).trim().replace(/\/+$/, '');
const normalizeApiBase = (url = '') => base(url)
  .replace(/\/(?:chat\/completions|images\/generations|images\/edits|videos\/generations|api\/generate|api\/result|models|agnesapi)(?:\/.*)?$/i, '');
const redirectAgnesHost = (url = '') => url.replace(/^(https?:\/\/)api\.agnes-ai\.com(\/|$)/i, '$1apihub.agnes-ai.com$2');

// 选择用户已配置的对话(聊天)模型。
// 注意：只能用聊天类配置(apiConfigs/chatAPIConfigs)，绝不能用 generationParams.selectedModel，
// 那是画布“生成”用的模型(可能是图片/视频模型，如 agnes-video-v2.0)，拿去做对话会报 No deployments。
export function resolveChatConfig(): { config: APIConfig | null; model: string } {
  const s = useAppStore.getState();
  const pool: APIConfig[] = [...(s.chatAPIConfigs || []), ...(s.apiConfigs || [])];
  const seen = new Set<string>();
  const uniq = pool.filter(c => (c && !seen.has(c.id) ? (seen.add(c.id), true) : false));
  // 仅当选中的配置确实存在于聊天池中时才复用它（避免误用视频/图片配置）
  const selectedId = s.generationParams?.selectedConfigId || '';
  let config = selectedId ? uniq.find(c => c.id === selectedId && c.baseUrl && c.apiKey) || null : null;
  if (!config) config = uniq.find(c => c.enabled && c.baseUrl && c.apiKey) || uniq.find(c => c.baseUrl && c.apiKey) || null;
  // 模型必须属于该聊天配置：优先其 defaultModel / models[0]；
  // 只有当全局 selectedModel 恰好是该配置的可用模型时才沿用。
  const globalModel = s.generationParams?.selectedModel || '';
  const configModels = config ? [config.defaultModel, ...(config.models || [])].filter(Boolean) : [];
  const model = (globalModel && configModels.includes(globalModel))
    ? globalModel
    : (config?.defaultModel || config?.models?.[0] || '');
  return { config, model };
}

// 按名称（可选）挑选 ComfyUI 配置；无名时优先已连接、其次第一个有地址的
export function pickComfyConfig(byName?: string) {
  const list = useAppStore.getState().comfyuiConfigs || [];
  const withUrl = list.filter(c => c.serverUrl);
  if (byName) {
    const n = byName.trim().toLowerCase();
    const hit = withUrl.find(c => (c.name || '').trim().toLowerCase() === n)
      || withUrl.find(c => (c.name || '').trim().toLowerCase().includes(n));
    if (hit) return hit;
  }
  return withUrl.find(c => c.connected) || withUrl[0];
}

// 已配置的 ComfyUI 名称清单（供助手/提示展示）
export function listComfyConfigNames(): string[] {
  return (useAppStore.getState().comfyuiConfigs || []).filter(c => c.serverUrl).map(c => c.name || 'ComfyUI');
}

// 取当前可用的 ComfyUI 地址
export function resolveComfyServerUrl(byName?: string): string {
  return (pickComfyConfig(byName)?.serverUrl || '').trim();
}

function looksLikeCapabilityQuery(text: string): boolean {
  return /体检|能支持|能做什么|支持哪些|能力|检测|检查.*(环境|comfy)|comfy.*(检测|检查|支持|能力)/i.test(text);
}

function buildSystemPrompt(): string {
  const typeLines = ASSISTANT_NODE_TYPES.map(t => `- "${t.type}"（${t.label}）：${t.keywords}`).join('\n');
  return [
    '你是"艺镜AI"无限画布中的智能助手（猫头鹰）。你的职责是把用户的自然语言需求，翻译成对画布的操作指令。',
    '你只能通过下面的动作操作画布，不要编造其它字段：',
    '- addNode：新建一个节点。字段：type(必填)、prompt(该节点的正向提示词)、backend(可选，"comfyui" 或 "api")、comfyName(可选，当有多个 ComfyUI 时按名称指定)、options(可选，如 {"size":"1024x1024","aspectRatio":"16:9"})。',
    '- updateNode：修改已有节点。字段：nodeId(必填)、prompt、options。',
    '- executeNode：运行已有节点生成结果。字段：nodeId(必填)。',
    '- deleteNode：删除节点。字段：nodeId(必填)。',
    '- connectNodes：把两个已有节点连线（上游→下游，会自动把上游结果作为下游参考图/文本传入）。字段：source(必填)、target(必填)。source/target 可用 "$last" 指代最近新建的节点，或用 "$prev" 指代上一个新建的节点。',
    '可用的节点 type 取值如下（务必从中选择最贴合用户意图的一个）：',
    typeLines,
    '',
    '严格只返回一个 JSON 对象，禁止输出多余文字或 markdown 代码块，格式如下：',
    '{"reply":"给用户的简短中文回复","actions":[{"action":"addNode","type":"text-to-image","prompt":"...","options":{}}]}',
    '规则：',
    '1. 如果用户是新建生成需求，用 addNode，并把提炼后的高质量正向提示词写进 prompt。',
    '2. 如果用户要求"生成/运行/开始跑"且指向已有节点，用 executeNode。若同一句里要求先建后跑，可先 addNode 再 executeNode，此时 executeNode 的 nodeId 用 "$last" 占位表示刚新建的节点。系统会在执行成功后自动创建一个结果节点并连线展示返回结果，你无需手动创建 result 节点。',
    '3. 用户只是闲聊或询问时，actions 返回空数组，只在 reply 里回答。',
    '4. reply 要简洁友好，说明你做了什么。',
'5. 关于执行后端(backend)：如果系统提示里"默认后端"是 ask，且用户没有明确说用 ComfyUI 还是用 API 模型，则本轮 actions 返回空数组，在 reply 里询问用户想用哪种（本机 ComfyUI 或已配置的 API 模型）。若用户已明确或默认后端不是 ask，则直接在 addNode 里带上 backend 字段。',
    '6. 需要多个节点配合（如：先文生图，再把图片喂给图生视频）时，可依次 addNode 多个节点，并用 connectNodes 按处理顺序把它们连接起来（用 "$prev"/"$last" 指代刚建的节点），最后对需要出结果的末端节点 executeNode。',
    '7. 当用户说"把刚刚/上一张/上一个/这张 图片/视频/音频 X 生成/转成 Y"这类需求时：**不要新建 X 节点**，直接使用画布上已有的 X 结果节点作为源，用以下动作串联：a) addNode 一个 Y 类型的节点（例如 image-to-video / lip-sync / image-upscale 等），b) connectNodes 从已有 X 节点连到刚建的 Y 节点，c) executeNode 运行 Y 节点。source 可用以下占位符指代画布上已有的最近节点："$lastImage"（最近一张图片，含 text-to-image/image-to-image/image-upscale/image-blend 等结果）、"$lastVideo"（最近一个视频）、"$lastAudio"（最近一段音频）、"$lastText"（最近一段文本）。这四个占位符只用于 connectNodes.source 或 updateNode.nodeId / executeNode.nodeId，不要放到 target。',
    '8. 用户明确说"某个已有节点"（如 "nodeId 是 xxx"）时，直接引用其 id；否则优先用 $lastImage/$lastVideo/$lastAudio/$lastText 占位符，系统会自动定位到最近对应类型的节点。',
    '9. 示例：用户说"把刚刚的图片生成视频"，你应该返回：',
    '{"reply":"好的，我在这张图片后面接一个图生视频节点。","actions":[{"action":"addNode","type":"image-to-video","prompt":"..."},{"action":"connectNodes","source":"$lastImage","target":"$last"},{"action":"executeNode","nodeId":"$last"}]}',
  ].join('\n');
}

function buildContext(): string {
  const s = useAppStore.getState();
  const nodes = Object.values(s.nodes || {}) as AINode[];
  if (!nodes.length) return '当前画布没有节点。';
  // 罗列前 30 个节点
  const lines = nodes.slice(0, 30).map((n) => {
    const name = n.options?.displayName || n.type;
    const status = n.status || 'idle';
    const pr = (n.prompt || '').slice(0, 40);
    const rtype = n.result?.type || '';
    return `- nodeId=${n.id} 类型=${n.type} 名称=${name} 状态=${status}${rtype ? ` 结果=${rtype}` : ''}${pr ? ` 提示词=${pr}` : ''}`;
  });
  // 帮 LLM 直接定位「最近的一张图 / 一个视频 / 一段音频 / 一段文本」
  const kindMap: Array<{ label: string; matcher: (n: AINode) => boolean }> = [
    { label: '最近图片', matcher: (n) => (n.status === 'success' && n.result?.type === 'image') || !!n.thumbnail },
    { label: '最近视频', matcher: (n) => n.status === 'success' && n.result?.type === 'video' },
    { label: '最近音频', matcher: (n) => n.status === 'success' && n.result?.type === 'audio' },
    { label: '最近文本', matcher: (n) => n.status === 'success' && n.result?.type === 'text' },
  ];
  const hints: string[] = [];
  for (const { label, matcher } of kindMap) {
    const hit = nodes.slice().reverse().find(matcher);
    if (hit) hints.push(`${label}=nodeId ${hit.id}（类型=${hit.type}${hit.options?.displayName ? '，名称=' + hit.options.displayName : ''}）`);
  }
  const hintBlock = hints.length ? ('\n可直接引用的最近节点：\n' + hints.map(h => '- ' + h).join('\n')
    + '\n以及占位符：$lastImage / $lastVideo / $lastAudio / $lastText 可自动指向对应类型的最近节点。')
    : '';
  return '当前画布节点列表：\n' + lines.join('\n') + hintBlock;
}

function extractJson(text: string): any | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch {}
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch {}
  }
  return null;
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string; }

// 调用用户自己配置的对话模型，得到结构化指令
export async function askCanvasAssistant(userText: string, history: ChatTurn[] = []): Promise<AssistantResult> {
  // 能力体检快捷通道：用户询问"这台 ComfyUI 能做什么"时，直接跑体检，不必经过 LLM
  if (looksLikeCapabilityQuery(userText)) {
    const server = resolveComfyServerUrl();
    if (!server) return { reply: '还没有配置 ComfyUI 地址。请到侧边栏"ComfyUI"页填写服务器地址后，我就能为你体检环境能力。', actions: [] };
    try {
      const report = await runCapabilityReport(server, true);
      return { reply: formatReport(report), actions: [] };
    } catch (e: any) {
      return { reply: `体检失败：${e?.message || String(e)}`, actions: [] };
    }
  }
  const { config, model } = resolveChatConfig();
  if (!config || !config.baseUrl || !config.apiKey) {
    return { reply: '还没有可用的对话模型。请先到"设置"里配置并选择一个聊天 API，再来找我。', actions: [] };
  }
  const apiBase = redirectAgnesHost(normalizeApiBase(config.baseUrl));
  // 附加 ComfyUI 能力提示：让模型只建议该环境支持的功能
  let comfyNote = 'ComfyUI 尚未配置地址，生成类节点可能无法执行。';
  const comfyServer = resolveComfyServerUrl();
  if (comfyServer) {
    try {
      const report = await runCapabilityReport(comfyServer);
      if (report.ok) {
        const green = report.features.filter(f => f.supported).map(f => f.feature);
        const red = report.features.filter(f => !f.supported).map(f => `${f.label}(${f.reason || '缺依赖'})`);
        comfyNote = `当前 ComfyUI 可用功能类型：${green.join(', ') || '无'}。` + (red.length ? ` 暂不可用：${red.join('；')}。优先建议可用功能，若用户要求不可用功能，请在 reply 中说明缺少的依赖。` : '');
      } else {
        comfyNote = `ComfyUI 连接异常：${report.error || '未知'}。`;
      }
    } catch { /* ignore capability errors */ }
  }
  const backendPref = useAppStore.getState().assistantSettings?.nodeBackend || 'ask';
  const comfyNames = listComfyConfigNames();
  const backendNote = `默认后端：${backendPref}。` + (comfyNames.length > 1 ? ` 已配置多个 ComfyUI：${comfyNames.join('、')}。若用户指定了某个 ComfyUI，请在 addNode 里带上 comfyName 字段；若未指定且有多个，可在 reply 中询问用哪一个。` : '');
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'system', content: buildContext() },
    { role: 'system', content: comfyNote },
    { role: 'system', content: backendNote },
    ...history.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: userText },
  ];
  let content = '';
  try {
    const resp = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || config.defaultModel, messages, stream: false, temperature: 0.3 }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${resp.status}`);
    content = data?.choices?.[0]?.message?.content || data?.text || '';
  } catch (e: any) {
    return { reply: `调用对话模型失败：${e?.message || String(e)}`, actions: [] };
  }
  const parsed = extractJson(content);
  if (!parsed) return { reply: content || '我没太理解，请换个说法。', actions: [], raw: content };
  const actions: AssistantAction[] = Array.isArray(parsed.actions) ? parsed.actions : [];
  return { reply: String(parsed.reply || '好的。'), actions, raw: content };
}

const NODE_SIZE = { width: 280, height: 220 };
const VALID_TYPES = new Set(ASSISTANT_NODE_TYPES.map(t => t.type));

// 判断某功能类型对应哪一类 API 配置池（用于 backend==='api' 时挑配置）
const IMAGE_TYPES = new Set<AINodeType>(['text-to-image', 'image-to-image', 'image-upscale', 'image-blend']);
const VIDEO_TYPES = new Set<AINodeType>(['text-to-video', 'image-to-video', 'frame-to-video', 'video-extend', 'video-remix', 'lip-sync', 'live-portrait']);

// 依据助手设置 + 指令 backend，决定新建节点的 provider 与 configId
function resolveNodeBackend(type: AINodeType, backend?: 'comfyui' | 'api', comfyName?: string): { provider: any; configId?: string; note: string } {
  const s = useAppStore.getState();
  const pref = s.assistantSettings?.nodeBackend || 'ask';
  const chosen = backend || (pref === 'ask' ? undefined : pref);
  const comfy = pickComfyConfig(comfyName);
  if (chosen === 'comfyui') {
    return { provider: 'comfyui', configId: comfy?.id, note: comfy ? `ComfyUI · ${comfy.name || 'ComfyUI'}` : 'ComfyUI' };
  }
  if (chosen === 'api') {
    const pool = VIDEO_TYPES.has(type) ? s.videoAPIConfigs : IMAGE_TYPES.has(type) ? s.imageAPIConfigs : type === 'tts' ? s.voiceAPIConfigs : s.apiConfigs;
    const cfg = (pool || []).find((c: any) => c.baseUrl) || (s.apiConfigs || [])[0];
    return { provider: (cfg?.provider as any) || 'openai', configId: cfg?.id, note: cfg?.name || 'API 模型' };
  }
  // 未指定：优先 ComfyUI（若已配置），否则 API
  if (comfy) return { provider: 'comfyui', configId: comfy.id, note: `ComfyUI · ${comfy.name || 'ComfyUI'}` };
  const cfg = (s.apiConfigs || [])[0];
  return { provider: (cfg?.provider as any) || 'openai', configId: cfg?.id, note: cfg?.name || 'API 模型' };
}

function nextNodePosition(): { x: number; y: number } {
  const s = useAppStore.getState();
  const nodes = Object.values(s.nodes || {}) as AINode[];
  if (!nodes.length) return { x: 240, y: 200 };
  const maxX = Math.max(...nodes.map(n => n.x || 0));
  const atMaxX = nodes.filter(n => Math.abs((n.x || 0) - maxX) < 40);
  const maxY = atMaxX.length ? Math.max(...atMaxX.map(n => n.y || 0)) : 200;
  return { x: maxX, y: maxY + NODE_SIZE.height + 60 };
}

// 执行助手返回的指令，作用到画布 store。返回执行摘要（每条一句中文）。
export async function runAssistantActions(actions: AssistantAction[]): Promise<string[]> {
  const summary: string[] = [];
  if (!Array.isArray(actions) || !actions.length) return summary;
  // 规范化：如果同一批指令里 connectNodes.source='$lastImage/$lastVideo/...' 且 target='$last'，
  // 说明用户想「把已有的X接到刚建的Y节点」。这时候如果 addNode.type 是通用的 text-to-video / text-to-image，
  // 应改成对应的输入-输出变体，避免 LLM 建错节点类型。
  try {
    const rewrites: Record<string, AINodeType> = {
      'image->text-to-video': 'image-to-video',
      'image->text-to-image': 'image-to-image',
      'video->image-to-video': 'video-remix',
      'video->text-to-video': 'video-remix',
      'audio->text-to-video': 'lip-sync',
    };
    const kindOf = (raw?: string): string | null => {
      if (!raw) return null;
      if (raw === '$lastImage' || raw === 'lastImage') return 'image';
      if (raw === '$lastVideo' || raw === 'lastVideo') return 'video';
      if (raw === '$lastAudio' || raw === 'lastAudio') return 'audio';
      if (raw === '$lastText' || raw === 'lastText') return 'text';
      return null;
    };
    const conn = actions.find(a => a.action === 'connectNodes' && (a.target === '$last' || a.target === 'last'));
    if (conn) {
      const kind = kindOf(conn.source);
      const addAct = actions.find(a => a.action === 'addNode');
      if (kind && addAct && addAct.type) {
        const key = `${kind}->${addAct.type}`;
        const nextType = (rewrites as any)[key];
        if (nextType && addAct.type !== nextType) addAct.type = nextType;
      }
    }
  } catch { /* ignore normalization errors */ }
  const s = useAppStore.getState();
  s.pushUndo?.();
  let lastCreatedId: string | null = null;
  let prevCreatedId: string | null = null;
  // 找最近的某类结果节点（按 status=success && result.type 匹配，其次按缩略图/节点类型回退）。
  const findLatestByResult = (kind: 'image' | 'video' | 'audio' | 'text'): string | null => {
    const st = useAppStore.getState();
    const nodes = Object.values(st.nodes || {}) as AINode[];
    const done = nodes.filter(n => n.status === 'success' && n.result && n.result.type === kind);
    const withThumb = kind === 'image' ? nodes.filter(n => !!n.thumbnail && (!n.result || n.result.type !== 'text')) : [];
    const kindTypes: Record<string, string[]> = {
      image: ['text-to-image', 'image-to-image', 'image-upscale', 'image-blend', 'character-view', 'live-portrait'],
      video: ['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'video-super-resolution', 'video-interpolate'],
      audio: ['tts', 'audio2video', 'video-to-music'],
      text: ['story-script', 'story-script-adv'],
    };
    const byType = nodes.filter(n => (kindTypes[kind] || []).includes(String(n.type)));
    const pool = [...done, ...withThumb, ...byType];
    if (!pool.length) return null;
    // 尽量选「最右下 / 最近新建」的节点
    const sorted = pool.slice().sort((a, b) => ((b.x || 0) + (b.y || 0)) - ((a.x || 0) + (a.y || 0)));
    return sorted[0]?.id || null;
  };
  const resolveId = (raw?: string): string | null => {
    if (!raw) return null;
    if (raw === '$last' || raw === 'last') return lastCreatedId;
    if (raw === '$prev' || raw === 'prev') return prevCreatedId;
    if (raw === '$lastImage' || raw === 'lastImage' || raw === '$prevImage') return findLatestByResult('image');
    if (raw === '$lastVideo' || raw === 'lastVideo' || raw === '$prevVideo') return findLatestByResult('video');
    if (raw === '$lastAudio' || raw === 'lastAudio' || raw === '$prevAudio') return findLatestByResult('audio');
    if (raw === '$lastText' || raw === 'lastText' || raw === '$prevText') return findLatestByResult('text');
    return raw;
  };
  const labelOf = (type?: AINodeType) => ASSISTANT_NODE_TYPES.find(t => t.type === type)?.label || type || '节点';
  const setCreated = (id: string) => { prevCreatedId = lastCreatedId; lastCreatedId = id; };
  // 生成类节点执行成功后，自动创建结果节点并连线展示返回结果
  const RESULT_CAPABLE = new Set<AINodeType>(['text-to-image','image-to-image','image-blend','image-upscale','image-to-video','text-to-video','frame-to-video','video-extend','video-remix','lip-sync','live-portrait','tts']);
  const attachResultNode = (sourceId: string): void => {
    const st = useAppStore.getState();
    const src = st.nodes[sourceId];
    if (!src || !RESULT_CAPABLE.has(src.type)) return;
    // 已有结果目标则复用
    if (src.options?.resultTargetNodeId && st.nodes[src.options.resultTargetNodeId]) return;
    const resultId = st.addNode({
      type: 'result',
      provider: src.provider,
      x: (src.x || 0) + (src.width || NODE_SIZE.width) + 130,
      y: src.y || 0,
      width: NODE_SIZE.width,
      height: NODE_SIZE.height,
      status: 'idle',
      prompt: '',
      options: { displayName: `${labelOf(src.type)} · 结果`, generationType: 'result', createdBy: 'owl-assistant' },
    });
    st.updateNode(sourceId, { options: { ...st.nodes[sourceId].options, resultTargetNodeId: resultId } });
    try { window.dispatchEvent(new CustomEvent('canvas:assistant-connect', { detail: { source: sourceId, target: resultId } })); } catch { /* ignore */ }
  };
  for (const act of actions) {
    try {
      if (act.action === 'addNode') {
        const type = (act.type && VALID_TYPES.has(act.type)) ? act.type : 'text-to-image';
        const pos = nextNodePosition();
        const st = useAppStore.getState();
        const sameType = Object.values(st.nodes || {}).filter((n: any) => n.type === type).length;
        const displayName = `${labelOf(type)}${sameType > 0 ? ' ' + (sameType + 1) : ''}`;
        const be = resolveNodeBackend(type, act.backend, act.comfyName);
        const id = st.addNode({
          type,
          provider: be.provider,
          configId: be.configId,
          x: pos.x,
          y: pos.y,
          width: NODE_SIZE.width,
          height: NODE_SIZE.height,
          status: 'idle',
          prompt: act.prompt || '',
          options: { displayName, generationType: type, createdBy: 'owl-assistant', backend: be.note, ...(act.options || {}) },
        });
        setCreated(id);
        summary.push(`已新建【${displayName}】节点（后端：${be.note}）`);
      } else if (act.action === 'updateNode') {
        const id = resolveId(act.nodeId);
        if (!id || !useAppStore.getState().nodes[id]) { summary.push('未找到要修改的节点'); continue; }
        const patch: any = {};
        if (typeof act.prompt === 'string') patch.prompt = act.prompt;
        if (act.options) patch.options = { ...useAppStore.getState().nodes[id].options, ...act.options };
        useAppStore.getState().updateNode(id, patch);
        summary.push('已更新节点参数');
      } else if (act.action === 'connectNodes') {
        const sourceId = resolveId(act.source || act.nodeId);
        const targetId = resolveId(act.target);
        const st = useAppStore.getState();
        if (!sourceId || !targetId || !st.nodes[sourceId] || !st.nodes[targetId]) { summary.push('未找到要连接的节点'); continue; }
        try { window.dispatchEvent(new CustomEvent('canvas:assistant-connect', { detail: { source: sourceId, target: targetId } })); } catch { /* ignore */ }
        summary.push('已连接节点');
      } else if (act.action === 'executeNode') {
        const id = resolveId(act.nodeId);
        if (!id || !useAppStore.getState().nodes[id]) { summary.push('未找到要运行的节点'); continue; }
        attachResultNode(id);
        summary.push('已开始生成，结果会自动显示在结果节点中');
        void useAppStore.getState().executeNode(id);
      } else if (act.action === 'deleteNode') {
        const id = resolveId(act.nodeId);
        if (!id || !useAppStore.getState().nodes[id]) { summary.push('未找到要删除的节点'); continue; }
        useAppStore.getState().deleteNode(id);
        summary.push('已删除节点');
      }
    } catch (e: any) {
      summary.push(`执行失败：${e?.message || String(e)}`);
    }
  }
  return summary;
}

// 朗读助手回复：按助手设置选择内置 edge-tts 或用户配置的语音 API
// 强防御：所有分支都 try/catch，边界任何错误只写 console.warn，不抛异常，避免设置面板触发时导致 UI 崩溃
const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(label + ' timeout after ' + ms + 'ms')), ms);
  p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
});

export async function speakAssistantReply(text: string): Promise<void> {
  try {
    const clean = (text || '').replace(/[\n·]+/g, '，').trim();
    if (!clean) return;
    const s = useAppStore.getState();
    const settings = s.assistantSettings || ({ voiceSource: 'edge-tts', speakReplies: false, nodeBackend: 'ask' } as any);
    const win: any = typeof window !== 'undefined' ? window : {};
    // 1) 用户配置的语音 API
    if (settings?.voiceSource === 'api' && settings.voiceConfigId) {
      const cfg = (s.voiceAPIConfigs || []).find(c => c.id === settings.voiceConfigId);
      if (cfg && cfg.baseUrl && cfg.apiKey) {
        try {
          const apiBase = redirectAgnesHost(normalizeApiBase(cfg.baseUrl));
          const modelId = settings.voiceModel || cfg.defaultModel || cfg.models?.[0] || 'tts-1';
          const isDS = /:\/\/dashscope[a-z0-9-]*\.aliyuncs\.com(?:\/|$)/i.test(apiBase) || /:\/\/[a-z0-9-]+\.maas\.aliyuncs\.com(?:\/|$)/i.test(apiBase);
          const ttsUrl = isDS
            ? (() => { try { return new URL(apiBase).origin; } catch { return apiBase; } })() + '/api/v1/services/audio/tts/SpeechSynthesizer'
            : `${apiBase}/audio/speech`;
          const ttsBody = isDS
            ? JSON.stringify({ model: modelId, input: { text: clean, voice: (settings.voiceModel && settings.voiceModel !== 'alloy' ? settings.voiceModel : undefined), format: 'mp3', sample_rate: 24000 } })
            : JSON.stringify({ model: modelId, input: clean, voice: settings.voiceModel || 'alloy' });
          const resp = await withTimeout(fetch(ttsUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
            body: ttsBody,
          }), 30000, 'voice-api-fetch');
          if (resp.ok) {
            const buf = await resp.arrayBuffer();
            const blob = new Blob([buf], { type: 'audio/mpeg' });
            await playAudioUrl(URL.createObjectURL(blob));
            return;
          } else {
            console.warn('[assistant.tts] voice API returned', resp.status);
          }
        } catch (e) { console.warn('[assistant.tts] voice API failed, fallback edge-tts', e); }
      }
    }
    // 2) 内置 edge-tts（默认）
    if (win?.yijingAPI?.edgeTts?.synthesizeToBase64) {
      try {
        const voice = settings?.voiceModel || 'zh-CN-XiaoxiaoNeural';
        const res: any = await withTimeout<any>(win.yijingAPI.edgeTts.synthesizeToBase64({ text: clean, voice, options: {} }), 45000, 'edge-tts-ipc');
        if (res?.ok && res?.base64) { await playAudioUrl(`data:audio/mpeg;base64,${res.base64}`); return; }
        console.warn('[assistant.tts] edge-tts failed, no fallback:', res?.error || 'unknown');
        try { win.yijingAPI?.system?.reportRendererError?.({ where: 'speakAssistantReply.edgeTts', error: res?.error || 'unknown' }); } catch {}
        return; // 不再走 speechSynthesis，避免在 Windows 上冻结渲染进程
      } catch (e: any) {
        console.warn('[assistant.tts] edge-tts exception', e?.message || e);
        try { win.yijingAPI?.system?.reportRendererError?.({ where: 'speakAssistantReply.edgeTts.exc', error: e?.message || String(e) }); } catch {}
        return;
      }
    }
    console.warn('[assistant.tts] no available tts backend, skip');
  } catch (outer: any) {
    // 兜底：绝不让 speakAssistantReply 抛异常影响 UI
    console.warn('[assistant.tts] fatal', outer?.message || outer);
    try { (window as any)?.yijingAPI?.system?.reportRendererError?.({ where: 'speakAssistantReply.fatal', error: outer?.message || String(outer) }); } catch {}
  }
}

function playAudioUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const audio = new Audio(url);
      // 追踪最近一个语音，重复朗读时打断上一次
      try {
        const prev = (window as any).__yijingLastAssistantAudio as HTMLAudioElement | undefined;
        if (prev) { try { prev.pause(); prev.src = ''; } catch {} }
        (window as any).__yijingLastAssistantAudio = audio;
      } catch {}
      audio.onended = () => resolve();
      audio.onerror = () => { console.warn('[assistant.tts] audio decode/play error'); resolve(); };
      void audio.play().catch(err => { console.warn('[assistant.tts] play blocked', err); resolve(); });
    } catch { resolve(); }
  });
}

// 语音音色/模型的可选项（供设置面板展示）
export const EDGE_TTS_VOICES = ['zh-CN-XiaoxiaoNeural', 'zh-CN-YunxiNeural', 'zh-CN-YunyangNeural', 'zh-CN-XiaoyiNeural', 'zh-CN-YunjianNeural'];
