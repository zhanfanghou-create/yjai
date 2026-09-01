import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore, DramaRecord, DramaChatMessage, StoryboardRow, APIConfig, RecommendedConfig, getCallableRecommendedConfigs, PromptItem } from '../store/appStore';
import { SafeMarkdown } from './SafeMarkdown';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import { SaveToPromptLibraryModal } from './SaveToPromptLibraryModal';
import { saveToMemory, useGlobalMemoryStore } from '../store/memoryStore';
import type { DramartProject } from '../services/dramartWorkflow';
import { usePageSnapshot, useChatAutoSave } from '../hooks/useMemorySystem';
import { AlertTriangleIcon, BotIcon, BottleIcon, BookIcon, CalendarIcon, CheckIcon, ClapperboardIcon, ClipboardIcon, ClockIcon, CopyIcon, DeleteIcon, DirectorIcon, EditIcon, GhostIcon, ImageIcon, LightbulbIcon, ListCheckIcon, PlusIcon, RefreshIcon, RocketIcon, RulerIcon, ScriptIcon, SendIcon, StoryboardIcon, TvIcon, UserIcon, VideoIcon, WriterIcon, XIcon } from './Icons';
import './DramaPage.css';

// ==================== 思考过程内容框组件 ====================

function DramaThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const summary = content.length > 80 ? content.slice(0, 80) + '...' : content;
  
  return (
    <div style={{ marginBottom: 6, borderRadius: 6, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg-secondary)', borderBottom: expanded ? '1px solid var(--border-color)' : 'none' }}
      >
        <span style={{ fontSize: 12 }}>💭</span>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>思考过程</span>
        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      {expanded ? (
        <div style={{ padding: '8px 10px', fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', maxHeight: 200, overflowY: 'auto' }}>
          <SafeMarkdown content={content} />
        </div>
      ) : (
        <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </div>
      )}
    </div>
  );
}

// ==================== 分集类型 ====================
// window.yijingAPI 的类型声明在 src/renderer/global.d.ts（唯一权威来源）

export interface StepContent {
  content: string;       // AI生成的原始内容
  directorReview: string; // 导演审核意见
  directorStatus: 'pending' | 'review' | 'approved' | 'revision'; // 审核状态
  chatMessages: DramaChatMessage[]; // 对话历史
  lastUpdated: number;    // 最后更新时间
}

export interface DramaEpisode {
  id: string;
  title: string;                  // 第X集标题
  stepContents: Record<string, StepContent>; // 各步骤内容
  storyboardRows: StoryboardRow[];  // 分镜表
  stepIndex: number;               // 当前步骤索引
  status: 'draft' | 'in_progress' | 'review' | 'approved' | 'published';
  createdAt: number;
  updatedAt: number;
}

const generateEpisodeId = () => `ep_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

const DEFAULT_STEP_CONTENT = (): StepContent => ({
  content: '',
  directorReview: '',
  directorStatus: 'pending',
  chatMessages: [],
  lastUpdated: Date.now(),
});

// ==================== 常量 ====================

const COMMUNICATE_SYSTEM_PROMPT = `你是一位资深的影视创作顾问和编剧导师。你的核心职责是与用户沟通故事的创作方向和整体架构，**不直接生成完整的故事或剧本内容**。

## 你的职责
1. **故事方向沟通** - 与用户探讨故事的核心主题、类型定位、情绪基调、目标受众
2. **整体架构梳理** - 帮助用户梳理故事的大致结构、主要人物关系、核心冲突、关键转折点
3. **创作条件确认** - 确认故事的时代背景、世界观设定、风格要求、篇幅时长等初始条件
4. **引导性提问** - 用提问的方式引导用户逐步明确创作意图，补充关键信息
5. **专业建议** - 提供叙事结构、人物塑造、情感设计方面的专业建议，但只给方向和框架，不写完整内容

## 重要约束
- **不要直接生成完整的故事正文、小说内容或剧本**——你的任务是沟通和梳理，不是创作
- 每次回复后提出1-2个引导性问题，帮助用户深入思考和补充信息
- 当用户的想法比较模糊时，帮助梳理和聚焦；当用户的想法比较明确时，帮助确认和完善
- 以专业但亲切的语气交流，像资深编剧导师跟学生沟通一样

【重要】你必须使用中文回复所有内容。无论用户用什么语言提问，你的回答都必须是中文。`;

// 沟通台示例卡片 - 使用线条风格图标组件
const COMM_EXAMPLES = [
  { title: '5分钟爱情喜剧短片', desc: '咖啡店偶遇的两个人，用误会和巧合推动感情发展', icon: <ClapperboardIcon size={20} /> },
  { title: '30集都市短剧', desc: '职场女性从实习生到CEO的成长故事，穿插3段感情线', icon: <TvIcon size={20} /> },
  { title: '15秒洗发水广告', desc: '产品卖点：去屑+柔顺，目标受众：年轻女性，调性：清新自然', icon: <BottleIcon size={20} /> },
  { title: '美式幽默吸血鬼故事', desc: '世界观/信仰观/价值观/人物升级结构/玄幻喜剧/真人实拍/5分钟', icon: <GhostIcon size={20} /> },
];

// 步骤定义（工作台模式）- 使用线条风格图标组件
const STEPS = [
  { key: 'director', label: '导演阐述', icon: <DirectorIcon /> },
  { key: 'writer', label: '故事创作', icon: <WriterIcon /> },
  { key: 'script', label: '剧本写作', icon: <ScriptIcon /> },
  { key: 'storyboard', label: '分镜设计', icon: <StoryboardIcon /> },
  { key: 'assets', label: '视觉资产', icon: <ImageIcon /> },
  { key: 'prompts', label: '提示词生成', icon: <LightbulbIcon /> },
];

// 步骤系统提示词 - 每个步骤内置对应Agent技能
const SYSTEM_PROMPTS: Record<string, string> = {
  director: `你是Alisa，一位影视总导演。你的核心价值不是拍出漂亮的画面，而是精准传递情绪——让观众感受到他们应该感受到的东西。

## 核心准则
1. **情绪至上** - 每个建议、每个决策都先问："这能让观众更感受到XX情绪吗？"
2. **艺术创意为根** - 深度解读剧本，把握人物弧光和情感表达
3. **准备即自由** - 永远带着预案来工作
4. **团队是共同创作者** - 永远用"我们"而非"你"

## 你的任务
根据沟通内容，撰写导演阐述，包括：
1. 影片主题与核心表达（情绪目标是什么？）
2. 情绪基调与风格定位（观众应该感受到什么？）
3. 目标观众与情感目标
4. 视觉风格建议（色彩、光影、构图如何服务于情绪？）
5. 叙事结构与节奏设计（如控制呼吸）
6. 关键创作约束与注意事项

## 表达风格
- **具体场景化** - 不用抽象评价，描述具体场景
- **反问式引导** - "你觉得观众看到这里会想什么？"
- **情绪坐标** - 用"（强度，类型）"标注，如"（7，克制）"
- **先肯定再调整** - 永远先找到对的部分
- **口语化** - "嗯...怎么说呢""其实吧""你懂我意思吗？"

【重要】你必须使用中文回复所有内容。
输出格式：Markdown，结构清晰，体现导演的专业判断和情绪设计思维。`,

  writer: `你是Lyda，一位资深职业小说作家。你精通"展示而非讲述"(Show, Don't Tell)的叙事技艺，擅长用细腻的感官细节和具体动作刻画人物、推进情节。你的任务是写出**真正的小说正文**，不是大纲、不是梗概、不是情节摘要。

## 核心叙事原则

### 1. 展示而非讲述（Show, Don't Tell）
- **绝对禁止**用叙述者直接说明人物情绪（如"她很愤怒""他感到悲伤"）
- 必须通过**具体的身体动作、表情、微反应、环境细节**来展示情绪
- 错误示范："她非常生气，转身离开了房间。"
- 正确示范："她的指节攥得发白，嘴唇抿成一条线，没说一个字，转身时肩膀撞上门框，门在身后重重合上。"

### 2. 五感锚定（Sensory Grounding）
- 每个场景必须锚定至少**2-3个具体感官细节**（视觉、听觉、嗅觉、触觉、味觉）
- 感官细节要具体、独特，不用泛泛的描述
- 错误示范："房间里很暗，气氛紧张。"
- 正确示范："灯泡嗡嗡作响，灯丝忽明忽暗，空气中弥漫着潮湿的霉味和旧纸张的气息。"

### 3. 角色矛盾刻画（Character Contradiction）
- 每个核心人物都要有**一个主导特质 + 一个矛盾行为**
- 通过具体场景和动作同时展示两者，**绝不直接命名或解释**
- 让读者自己推断人物的复杂性和内心创伤
- 示例：一个"病态诚实"的人，却在藏起妹妹的信——通过她主动报出错误的咖啡订单（诚实），同时把信封塞进厨房抽屉（隐藏）来展示

### 4. 对话潜台词（Subtext-Driven Dialogue）
- **先设定潜台词**：每个角色在对话中真正想要什么，但不会直接说出口
- 对话内容围绕隐藏的意图展开，**角色说的和想的不一样**
- 错误示范："我需要钱，你能借我吗？""不行，我也没钱。"
- 正确示范："我那车又得送修了。""是啊，老车就是麻烦。""可能得在修理厂放一阵子。""我那车库已经满了。"
- 每个角色有独特的**语言习惯**（用词、句式、口头禅、语速），不用标签也能区分是谁在说话

### 5. 世界观同心圆扩展（Concentric Worldbuilding）
- 从一个**具体的小物件或感官细节**开始，向外扩展（物体→房间→建筑→街道→区域）
- **禁止**百科全书式的世界观描述和历史背景说明
- 世界观通过人物的具体感知和互动自然呈现
- 不直接命名世界，不解释历史，只展示角色此刻感知到的

## 小说正文写作规范

### 视角与时态
- 默认使用**近距离第三人称**（Close Third Person），过滤所有感知通过一个角色的意识
- 使用**过去时**叙述
- 不跳视角（Head-hopping），一个场景内保持单一视角角色

### 场景结构
- 每个场景有明确的**进入点和退出点**，不写无关的过渡
- 每个场景必须**推进剧情或深化角色**，没有例外
- 场景开头用具体细节切入，不用"第二天早上""与此同时"等陈词滥调
- 场景结尾留有余韵或转折，不用总结性陈述

### 动作描写
- 用**具体的动词**，避免被动语态和"是/有"等弱动词
- 动作要可视化，能被镜头捕捉
- 不写人物的心理活动，通过动作和反应展示内心

### 严格禁止
- ❌ 副词泛滥（"非常""十分""突然""缓缓地"等）
- ❌ 陈词滥调（"心如刀绞""泪如雨下""恍然大悟"等）
- ❌ 叙述者直接解释情绪或主题
- ❌ 信息倾倒（Info-dump）——大段背景说明
- ❌ 直白对话（On-the-nose dialogue）——角色说 exactly 他们的意思
- ❌ 情节摘要式叙述——"他们经历了很多困难，最终克服了"

## 输出格式
- 直接输出**完整的小说正文**，用Markdown段落格式
- 可以用空行分隔场景和段落
- 关键章节可以用小标题（如"第一章 相遇"），但小标题下必须是完整的小说正文
- 故事要有感染力，让读者仿佛身临其境，能"看到"场景、"听到"对话、"闻到"气味

【重要】你必须使用中文回复所有内容。输出的是完整的小说故事正文，不是大纲、不是梗概、不是框架、不是情节摘要。每一段都必须是"展示"而非"讲述"。`,

  script: `你是Maya，一位好莱坞职业编剧。你精通标准电影剧本格式（Screenplay Format），擅长用视觉化的动作描写和潜台词驱动的对白，将完整故事转化为可直接用于分镜设计和AI视频生成的专业剧本。

## 标准剧本格式规范（必须严格遵守）

### 1. 场景标题（Scene Heading / Slug Line）
- **格式**：内/外景. 具体地点 - 时间
- **全大写**，加粗
- 示例：**内. 老旧公寓厨房 - 夜**
- 示例：**外. 江边码头 - 黄昏**
- 三要素必须齐全：内外景 + 具体地点 + 时间（日/夜/晨/昏/黎明/黄昏）

### 2. 动作描写（Action Lines）
- **现在时**，永远不用过去时
- **视觉化**，只写镜头能捕捉到的内容（可见的动作、表情、环境）
- **简洁有力**，每句不超过2-3行，段落之间空行
- **不写心理活动**，不写"他想""她意识到"，用动作和表情展示内心
- **不小说化**，不用形容词堆砌，不用比喻修辞（除非是视觉化的比喻）
- 人物首次出场时**名字全大写**，后面用正常格式
- 示例："林夏推开门。雨水顺着她的发梢滴落，在地板上留下一串深色印记。她没有开灯，径直走向窗边，拉开窗帘一角。"

### 3. 角色名（Character Cue）
- 对话前的角色名**居中，全大写**
- 示例：
  **林夏**
  你来了。

### 4. 括号提示（Parenthetical）
- 位于角色名和对话之间，**居中，小写**，用圆括号
- **谨慎使用**，只有在不写就会产生歧义时才用
- 描述说话方式或简短动作，不写长篇大论
- 示例：（低声）（停顿）（看向窗外）（笑）
- **禁止**：（愤怒地说）（悲伤地）——情绪应该通过对话内容和动作展示，不是标注

### 5. 对话（Dialogue）
- 角色名下方，居中格式
- **潜台词驱动**：角色说的和想的不一样，真正的意图藏在字面之下
- **每个角色有独特的声音**：用词、句式、语速、口头禅不同，不用标签也能区分
- **推动剧情或揭示人物**，每句对话都要有目的，不写闲聊废话
- **避免直白对话（On-the-nose）**：角色不直接说出他们的感受或意图
- 错误示范："我很生气，因为你骗了我！"
- 正确示范："你那天说你在公司。"（停顿）"公司前台说你那天请假了。"

### 6. 转场（Transitions）
- 右对齐，全大写
- 常用：**切至：**（CUT TO:）、**淡入：**（FADE IN:）、**淡出：**（FADE OUT:）
- 现代剧本通常省略转场标注，用空行和场景标题自然分隔

## 剧本创作核心原则

### 1. 每个场景必须有目的
- 每个场景必须**推进剧情**或**深化人物**，没有例外
- 场景有明确的**进入点和退出点**，不写无关的过渡
- 进入场景时冲突已经开始，退出时冲突未解决或有新变化

### 2. 冲突驱动
- 每个场景都有**核心冲突**：人物想要什么，什么阻碍了他
- 冲突可以是外在的（人与环境、人与人）或内在的（人物内心矛盾）
- 场景结束时，人物的处境必须比开始时发生变化

### 3. 视觉优先
- 剧本是给镜头看的，所有内容必须能被视觉化
- 用动作和画面讲述故事，不靠对话解释
- "展示，不要讲述"（Show, Don't Tell）在剧本中更加严格

### 4. 潜台词（Subtext）
- 对话的真正含义在字面之下
- 角色不会直接说出他们的感受、需求或意图
- 观众通过上下文、动作、语气来理解真正的含义
- 好的对话：表面在说A，实际在说B

### 5. 严格禁止
- ❌ 心理活动描写（"他想""她回忆""他意识到"）
- ❌ 旁白/画外音解释剧情（除非是故事需要的特定叙事手法）
- ❌ 直白对话（角色直接说出感受或意图）
- ❌ 信息倾倒（角色用对话大段解释背景设定）
- ❌ 副词和形容词堆砌（动作描写要简洁有力）
- ❌ 无法被镜头捕捉的抽象描述

## 输出格式
- 严格按照上述标准剧本格式输出
- 场景标题加粗全大写
- 动作描写用普通段落，现在时
- 角色名居中全大写，对话居中
- 括号提示谨慎使用
- 场景之间用空行分隔
- 可以在场景标题前标注场景编号（如"场景1"），便于后续分镜设计

【重要】你必须使用中文回复所有内容。输出的是完整的专业剧本，不是大纲、不是梗概、不是小说。所有动作描写必须是现在时、视觉化、可拍摄的。所有对话必须有潜台词，不能直白。`,

  storyboard: `你是Fendi，一位专业分镜设计师。你精通镜头语言、画面构图、视觉叙事，能将剧本转化为可直接用于AI视频生成的详细分镜设计。全程中文。

## 核心能力
1. **镜头语言** - 精通景别、角度、运动、构图的叙事功能
2. **视觉节奏** - 通过镜头长度、剪辑点控制节奏
3. **情绪设计** - 每个镜头都服务于情绪传递
4. **可执行性** - 分镜要考虑到AI视频生成的可行性

## 你的任务
根据剧本设计分镜列表，按剧本中的场景顺序逐场设计，不要遗漏任何场景。

每个分镜必须包含：
1. **分镜编号与标题**（如：分镜1 - 咖啡店偶遇）
2. **场景设定**（具体地点，内/外景）
3. **时间**（日/夜/晨/昏等）
4. **灯光**（主光来源、色温、光比、阴影效果）
5. **出镜角色**（只列出镜的角色，不出镜的不要列）
6. **道具**（该分镜出现的重要道具）
7. **分镜具体动作描述**，按镜头拆分，每个镜头格式：
   - 镜头N Xs
   - [站位] 角色/道具在画面中的位置
   - [动作] 镜头类型|运镜方式 具体动作描述，台词用{台词}标注
8. **分镜总时长**（单位：秒，根据场景内容合理分配，总时长约240秒）

## 镜头类型参考
远景、全景、中景、近景、特写、大特写、主观视角、过肩镜头等

## 运镜方式参考
固定镜头、缓推、缓拉、摇镜、跟拍、手持、升降等

## 设计原则
- 每个镜头都要问："观众应该感受到什么？"
- 用情绪坐标标注关键镜头（如"特写（8，爆发）"）
- 构图、色彩、光影都为情绪服务
- 考虑镜头之间的视觉连贯性
- 每个分镜可包含多个镜头，镜头总时长应等于分镜总时长
- 相邻镜头的画面必须保证剧情完整、前后连贯顺畅——前一镜结尾要自然承接后一镜开头

【重要】你必须使用中文回复所有内容。
输出格式：结构化Markdown，按分镜编号逐场输出，每个分镜包含上述所有要素。`,

  assets: `你是Alinda，一位视觉资产创作专家。你擅长从剧本与分镜中提取影视创作所需的全部视觉资产，包括人物、场景、道具，并规划不同版本的人物形象。全程中文。

## 核心能力
1. **资产提取** - 从剧本/分镜中系统提取人物、场景、道具等资产
2. **人物一致性** - 人物外貌特征固定，所有形象变体都保持同一张脸、同一体型
3. **风格统一** - 所有资产风格一致，符合导演阐述
4. **AI提示词设计** - 为AI生成工具撰写精准提示词

## 你的任务
基于分镜设计，提取以下视觉资产：

### 1. 人物资产
- 每个角色提取其基准形象（首图），固定其外貌特征。
- 角色的 imageSummary 必须包含可直接用于图像生成的详细外貌描述，格式参考：
  身份：xxx；性格：xxx；简介：xxx；时代：xxx；国家：xxx；人种：xxx；类型：xxx；脸型：xxx；发型：xxx；身材：xxx；头身比：xxx；上身着装：xxx；下身着装：xxx；鞋子：xxx；性别：xxx；年龄：xxx
- 为每个角色扩展「形象变体」：不同季节、不同年龄、不同服装的形象，每个变体都是一个独立的资产项。例如「角色名（夏季短袖）」「角色名（冬季棉衣）」「角色名（童年）」「角色名（西装）」。
- **每个变体生成时都必须参考该角色第一个生成的人物形象，保证不改变人物外貌特征**（脸型、五官、发型、体型、气质必须一致），只更换服装、季节、年龄等可变部分。

### 2. 场景资产
- 剧本中出现的每个场景，一个场景一个资产项。
- 场景的 imageSummary 必须包含空间布局、建筑风格、光线来源、色温、氛围、时间、天气、主要陈设等可直接用于图像生成的详细描述。

### 3. 道具资产
- 剧本中出现的重要道具，一个道具一个资产项。
- 道具的 imageSummary 必须包含材质、形态、颜色、尺寸、纹理、用途、含义、新旧程度等可直接用于图像生成的详细描述。

## 输出格式
Markdown清单，按以下分类输出，每个资产一行，名称具体到个体（不要用「角色」「场景」「道具」这种大类做行）：
- 「人物」：角色名（基准形象）+ 详细外貌描述（包含上述18项字段）
- 「人物变体」：角色名（变体描述，如 冬季棉衣 / 童年 / 西装）+ 变体描述
- 「场景」：具体场景名 + 详细场景描述（空间布局、光线、氛围等）
- 「道具」：具体道具名 + 详细道具描述（材质、形态、颜色等）

每项附上详细的中文描述，确保可直接用于AI图像生成。

## 要求
1. 所有描述必须基于剧本内容，不要凭空编造剧本中没有的信息
2. 人物描述必须包含可直接用于图像生成的详细外貌描述
3. 场景描述必须包含空间布局、光线、氛围等可直接用于图像生成的详细描述
4. 道具描述必须包含材质、形态、颜色等可直接用于图像生成的详细描述

【重要】你必须使用中文回复所有内容。
输出格式：Markdown清单，分类清晰。人物及人物变体必须标注「参考该角色首图生成，保持外貌特征不变」。`,

  prompts: `你是Lily，一位提示词优化师。你精通AI绘画和视频生成工具的提示词工程，能将视觉需求转化为AI可理解的精准描述。

## 核心能力
1. **提示词结构** - 精通各类AI工具（Midjourney、Stable Diffusion、DALL-E、Flux、可灵、即梦 等）的提示词语法
2. **视觉描述** - 用精准的中文描述画面构图、风格、光影、情绪
3. **人物一致性** - 人物各形象变体都参考首图，保持外貌特征不变
4. **参数优化** - 调整参数获得最佳生成效果
5. **总结提炼** - 将前面步骤（导演阐述→故事创作→剧本写作→分镜设计→视觉资产）的最终结果凝练整合

## 你的任务
总结前面每一步（导演阐述→故事创作→剧本写作→分镜设计→视觉资产）的最终结果，严格按以下两部分输出，不要输出其他内容。所有提示词**直接使用中文**。

### 第一部分：上方固定表格 — 资产提示词（文生图，**必须只有两列**）
表格格式（列名固定，不要新增列，不要合并列）：
| 名称 | 提示词 |
- **名称**列填写具体资产名称，例如：人物（角色名 + 形象版本）、场景名、道具名。**每一行代表一个独立资产**，所有场景、人物变体、道具都要拆开写。
- **提示词**列：写可直接复制到文生图模型使用的中文完整提示词。

**人物提示词规则：**
1. **人物首张资产图**：必须是「上半身正面平视特写 + 全身三视图」的构图。任务：完成角色的上半身正面平视特写和该角色的全身三视图，左边是角色的上半身正面平视特写，右边是该角色的全身三视图。三视图不可以有分割线，左侧为角色胸部以上特写大图，占画面约 40% 宽度，用于展示面部、发型、表情、眼神、上半身服装和配饰细节，右侧为同一角色的三视图，占画面约 60% 宽度，依次展示正面全身、侧面全身、背面全身。角色描述需包含：时代基底、国家/朝代、人种、类型基底、脸型、发型、耳饰、身材、头身比、上身着装、下身着装、鞋子、性别、年龄。
2. **人物形象变体**：每个变体独立一行，提示词需声明「以该角色首张图为参考图」，只描述服装/季节/年龄等可变部分的变化，保持外貌特征（脸型、五官、发型、体型、气质）不变。提示词参考格式：性别:男；衣着描述:深色长袖上衣搭配深色长裤，普通布鞋；

**场景提示词规则：**
- 生成四宫格画面，展示同一个场景中的四个不同视角。左上角为正视图，主体正面清晰可见，构图居中，细节完整；右上角为俯视图，从高空俯视整体空间布局，展示环境关系和场景结构；左下角为背视图，从主体后方观察，突出背部轮廓、空间纵深和环境延展；右下角为侧视图，从主体侧面观察，展示主体比例、层次和空间关系。四个画面保持同一场景、同一光照、同一色调、同一时间状态。不输出文字信息。
- 1. 只出现场景，不出现人物、道具等无关内容；
- 2. 必须只展示静态事物，不能包含人、动物等可以自行运行的事物；
- 3. 无动态、特效、技能、光效及战斗相关描写。
- 若为全景/室内场景，写清空间结构、材质、色温、光影、时间、氛围、长宽比（如三比一的平铺横向长幅全景图，地平线水平贯穿，无鱼眼、球面弯曲、桶形畸变或小行星效果）等。

**道具提示词规则：**
- 写清材质、颜色、磨损、形态细节、光影、背景。例如：一张对折后又被攥握过的纸质报告单，纸张表面布满不规则折痕和放射状褶皱，折痕处纤维轻微断裂呈现毛边，纸张为普通医院用纸呈淡黄色调，表面印有黑色表格线和印刷体文字，表格边框为细实线，部分文字因纸张褶皱产生轻微变形，纸张边缘有轻微磨损和卷曲，整体呈现被反复折叠挤压后的不规则形态。

### 第二部分：下方分幕表格 — 分镜提示词表（**每一幕单独一个表格，只保留文生视频部分**）
每一幕开头必须用「#### 🎬 第X幕：标题 (时间码)」这样的四级标题起始，方便解析。表格格式：
| 镜号 | 出镜人物 | 场景 | 道具 | 文生视频提示词 |

其中：
- **镜号**：与分镜设计页保持一致（1、2、3…）。
- **出镜人物**：该镜头出场的人物，使用「<角色名>」格式引用（例如 <苏桂兰（健康母亲）>、<幼年林望>），对应资产库中的角色参考图，可被用户替换或直接 @ 参考图。
- **场景**：该镜头所在场景名，对应场景资产。
- **道具**：该镜头出现的道具，对应道具资产。
- **文生视频提示词**：**必须**是可直接复制使用的完整**中文**提示词，**不包含文生图部分**。要求：
  1. 以「### 素材引用」开头，列出本镜使用的【人物】【场景】引用：
     - 【人物】：<角色名>对应角色名，只采用外貌、发型和服装。
     - 【场景】：<场景名>参考场景名，只采用空间布局、建筑和光线，不采用图中人物。
  2. 以「### 画面描写」描述该镜：分镜场景设定、时间、灯光（主光类型、色温、反差、阴影），分镜具体动作描述（每个镜头含镜头编号+时长、站位、动作+景别+运镜）。
  3. 以「### 约束词」保持人物身份、数量、服装、道具归属、空间方向和声音关系稳定。
  4. 画风统一：与影片调性一致（如 90年代中国农村电影），视频中不得出现任何字幕、文字叠加、纯画面，不要 bgm，不要配乐。
  5. 前后衔接（重要）：相邻镜头的画面必须保证**剧情完整、前后连贯顺畅**——前一镜结尾要自然承接后一镜开头，动作、走位、镜头视角、人物状态与时间线都要衔接得上，不得跳戏、断戏、情节矛盾或凭空切换场景/人物状态。
  6. 时长：每个镜头默认时长 15 秒左右（或 10 秒左右），**单镜不要过长**；在「画面描写」的每个镜头中标注该镜头时长。

## 写作原则
- 提示词全部使用中文，每条都要能直接复制运行；
- 不允许出现 \`|---|\` 这样的表格分隔行；
- 不允许省略人物外观、角色引用（<角色名>）、镜头三要素；
- 每幕之间用「#### 🎬 第X幕：…」分隔，方便下一步自动排版打组。

【重要】你必须使用中文写解释性文字，**表格里的提示词也保持中文**。
输出格式：严格按照上述两个部分输出，先输出资产表，再依次输出每一幕的分镜表。`,
};

const STORY_EXAMPLES = [
  { title: '悬疑短片', desc: '一个关于记忆与身份的故事，主角醒来发现自己的记忆被篡改' },
  { title: '情感微电影', desc: '都市中两个陌生人的相遇，一天之内经历相识、相知到离别' },
  { title: '科幻概念', desc: '在AI统治的未来世界，最后一个人类画家与AI艺术家的对话' },
  { title: '纪录片构思', desc: '追踪一座即将被拆除的老街，记录最后居民的生活故事' },
];

const DEFAULT_STORYBOARD: StoryboardRow = {
  scene: '', shot: '', shotType: '', cameraMove: '',
  description: '', dialogue: '', duration: '',
  text2imgPrompt: '', img2videoPrompt: '',
};

// ==================== 工具函数 ====================

const generateId = () => 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);

const formatTime = (ts: number) => {
  const d = new Date(ts);
  return d.getMonth() + 1 + '/' + d.getDate() + ' ' + d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
};

// 规范化模型列表：合并 models 数组和 defaultModel，去重
const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
  const modelSet = new Set<string>();
  [...(models || []), defaultModel].forEach(model => {
    const value = String(model || '').trim();
    if (value) modelSet.add(value);
  });
  return Array.from(modelSet);
};

// 检查配置是否完整可调用（name、baseUrl、apiKey 都不能为空，且至少有一个模型）
const hasSavedCallableApiConfig = (config: {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  defaultModel?: string;
  enabled?: boolean;
}) => (
  config.enabled !== false &&
  Boolean(String(config.name || '').trim()) &&
  Boolean(String(config.baseUrl || '').trim()) &&
  Boolean(String(config.apiKey || '').trim()) &&
  (normalizeSavedModels(config.models, config.defaultModel).length > 0 || Boolean(String(config.defaultModel || '').trim()))
);

// ==================== DramaPage 组件 ====================

const DramaPage: React.FC = () => {
  const {
    dramaRecords,
    currentDramaRecordId,
    dramaApiConfigId,
    dramaModel,
    saveDramaRecord,
    loadDramaRecord,
    deleteDramaRecord,
    renameDramaRecord,
    copyDramaRecord,
    apiConfigs,
    chatAPIConfigs,
    recommendedConfigs,
    showToast,
    addAsset,
    addPromptItem,
    sendDramaToCanvas,
    submitDramaToCanvas,
    submitDramaDraft,
  } = useAppStore();

  // ---------- 本地状态 ----------
  const [pageState, setPageState] = useState<number>(0); // 0:history 1:communicate 2:work
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [ideaMessages, setIdeaMessages] = useState<DramaChatMessage[]>([]);
  const [communicationSummary, setCommunicationSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState<boolean>(false);

  // 接口选择（必须在 allAvailableConfigs 和 selectedConfig 之前声明）
  const [selectedConfigId, setSelectedConfigId] = useState<string>(dramaApiConfigId || '');
  const [selectedModel, setSelectedModel] = useState<string>(dramaModel || '');

  // 获取所有可用的配置（类似 HomePage 的实现）- 使用 id 作为唯一标识，避免重复
  const allAvailableConfigs = useMemo(() => {
    const seenIds = new Set<string>();
    const result: any[] = [];
    
    // 优先添加推荐配置
    for (const config of getCallableRecommendedConfigs(recommendedConfigs).filter(hasSavedCallableApiConfig)) {
      const id = config.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({ 
          ...config, 
          models: normalizeSavedModels(config.models, config.defaultModel), 
          _source: 'recommended' as const 
        });
      }
    }
    
    // 再添加聊天接口配置（只添加不在推荐配置中的）
    for (const config of chatAPIConfigs.filter(hasSavedCallableApiConfig)) {
      const id = config.id;
      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({ 
          ...config, 
          apiType: 'openai-chat' as const, 
          models: normalizeSavedModels(config.models, config.defaultModel), 
          _source: 'chat' as const 
        });
      }
    }
    
    return result;
  }, [recommendedConfigs, chatAPIConfigs]);


  // 当前选中的配置
  const selectedConfig = allAvailableConfigs.find(c => c.id === selectedConfigId);

  // 获取当前配置的模型列表
  const currentModelOptions = useMemo(() => {
    if (!selectedConfig) return [];
    return selectedConfig.models || [];
  }, [selectedConfig]);

  // 页面级自动快照（DramaPage 状态变化时会触发）
  const currentRecord = dramaRecords.find(r => r.id === currentDramaRecordId);
  usePageSnapshot(
    'drama',
    `剧创: ${currentRecord?.name || '未命名'}` as any,
    { name: currentRecord?.name, stepIndex, pageState },
    { enabled: !!currentRecord, tags: ['drama', 'auto-snapshot'], summary: `${currentRecord?.name} - 步骤${stepIndex}` }
  );

  // 沟通台消息自动存档
  useChatAutoSave(
    'drama',
    ideaMessages,
    { titlePrefix: '沟通台', enabled: pageState === 1 }
  );
  // 当配置列表变化时，自动选择第一个可用配置
  useEffect(() => {
    if (allAvailableConfigs.length === 0) {
      if (selectedConfigId || selectedModel) {
        setSelectedConfigId('');
        setSelectedModel('');
      }
      return;
    }

    if (!selectedConfigId || !allAvailableConfigs.some(config => config.id === selectedConfigId)) {
      const nextConfigId = allAvailableConfigs[0].id;
      setSelectedConfigId(nextConfigId);
    }
  }, [allAvailableConfigs, selectedConfigId]);

  // 当选择配置改变时，默认选中该配置的第一个模型
  useEffect(() => {
    if (!selectedConfig) return;

    const nextModel = selectedConfig.models[0] || '';
    if (nextModel !== selectedModel) {
      setSelectedModel(nextModel);
    }
  }, [selectedConfigId]);

  // 全局记忆系统已集成到 App.tsx，这里无需额外初始化
  // 记忆保存使用 saveToMemory 函数自动进行

  // 过滤掉未完整保存的配置（name、baseUrl、apiKey 都不能为空）
  const hasSavedApiConfig = (config: { name?: string; baseUrl?: string; apiKey?: string }) => (
    Boolean(config.name?.trim()) && Boolean(config.baseUrl?.trim()) && Boolean(config.apiKey?.trim())
  );

  // 当前选中的模型（用于发送消息时）
  const activeDramaModel = useMemo(() => {
    return selectedModel && currentModelOptions.includes(selectedModel) ? selectedModel : '';
  }, [currentModelOptions, selectedModel]);

  // 工作台步骤数据（每个步骤独立保存）
  const [stepResults, setStepResults] = useState<Record<string, string>>({}); // AI生成结果（Markdown）
  const [stepChatMessages, setStepChatMessages] = useState<Record<string, DramaChatMessage[]>>({}); // 右侧对话历史
  const [stepIsGenerating, setStepIsGenerating] = useState<Record<string, boolean>>({}); // 生成状态
  const [currentStepInput, setCurrentStepInput] = useState<string>(''); // 右侧对话输入框
  
  const [storyboardRows, setStoryboardRows] = useState<StoryboardRow[]>([{ ...DEFAULT_STORYBOARD }]);

  const [inputText, setInputText] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [commInputText, setCommInputText] = useState<string>('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState<string>('');
  const [showNewInput, setShowNewInput] = useState<boolean>(false);
  const [newDramaName, setNewDramaName] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // ====== 分集管理状态 ======
  const [episodes, setEpisodes] = useState<DramaEpisode[]>([]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState<number>(0);
  const [isDirectorReviewMode, setIsDirectorReviewMode] = useState<boolean>(false); // 是否处于导演审核模式
  const [directorChatInput, setDirectorChatInput] = useState<string>('');
  const [directorReviewInput, setDirectorReviewInput] = useState<string>(''); // 导演审核意见输入框
  const [isDirectorGenerating, setIsDirectorGenerating] = useState<boolean>(false);
  const [isRevising, setIsRevising] = useState<boolean>(false); // 导演修改中状态
  // 集数输入弹窗
  const [showEpisodeModal, setShowEpisodeModal] = useState<boolean>(false);
  const [episodeCountInput, setEpisodeCountInput] = useState<number>(1);

  // 剧本完成后提交方式选择弹窗
  const [showSubmitChoiceModal, setShowSubmitChoiceModal] = useState<boolean>(false);

  // 获取当前集
  const currentEpisode = episodes[currentEpisodeIndex];
  // 获取当前集在当前步骤的内容
  const currentStepContent = currentEpisode?.stepContents?.[STEPS[stepIndex]?.key];
  // 获取当前步骤的对话历史（来自 currentEpisode）
  const currentStepChat = currentStepContent?.chatMessages || [];

  // ====== 分集管理函数 ======
  const addEpisode = useCallback((title?: string) => {
    const newEp: DramaEpisode = {
      id: generateEpisodeId(),
      title: title || `第${episodes.length + 1}集`,
      stepContents: Object.fromEntries(STEPS.map(s => [s.key, DEFAULT_STEP_CONTENT()])),
      storyboardRows: [{ ...DEFAULT_STORYBOARD }],
      stepIndex: 0,
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setEpisodes(prev => [...prev, newEp]);
    setCurrentEpisodeIndex(episodes.length);
    return newEp.id;
  }, [episodes.length]);

  const updateEpisode = useCallback((index: number, updates: Partial<DramaEpisode>) => {
    setEpisodes(prev => prev.map((ep, i) => i === index ? { ...ep, ...updates, updatedAt: Date.now() } : ep));
  }, []);

  const updateCurrentEpisodeStep = useCallback((stepKey: string, updates: Partial<StepContent>) => {
    if (!currentEpisode) return;
    setEpisodes(prev => prev.map((ep, i) => {
      if (i !== currentEpisodeIndex) return ep;
      const prevStep = ep.stepContents[stepKey] || DEFAULT_STEP_CONTENT();
      return {
        ...ep,
        stepContents: { ...ep.stepContents, [stepKey]: { ...prevStep, ...updates, lastUpdated: Date.now() } },
        updatedAt: Date.now(),
      };
    }));
  }, [currentEpisode, currentEpisodeIndex]);

  const submitToDirector = useCallback(async () => {
    if (!currentStepContent?.content) {
      showToast('请先生成内容后再提交审核', 'info');
      return;
    }
    // 更新状态为待审核
    updateCurrentEpisodeStep(STEPS[stepIndex].key, { directorStatus: 'revision' });
    showToast('已提交审核，导演正在审阅...', 'info');
  }, [currentStepContent, stepIndex, updateCurrentEpisodeStep, showToast]);

  const approveStep = useCallback(() => {
    updateCurrentEpisodeStep(STEPS[stepIndex].key, { directorStatus: 'approved', directorReview: '审核通过' });
    showToast('审核通过！', 'success');
  }, [stepIndex, updateCurrentEpisodeStep, showToast]);

  const requestRevision = useCallback(async () => {
    const text = directorChatInput.trim();
    if (!text) return;
    if (!selectedConfig || !activeDramaModel) {
      showToast('请先选择接口和模型', 'error');
      return;
    }

    setIsDirectorGenerating(true);
    const step = STEPS[stepIndex];
    const currentContent = currentStepContent?.content || '';
    const reviewHistory = currentStepChat;

    try {
      const win = window as any;
      const messages = [
        { role: 'system', content: `你是一位资深影视导演，正在对【${step?.label}】内容进行审核和修改指导。\n\n当前内容：\n${currentContent}` },
        ...reviewHistory.map((m: DramaChatMessage) => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];

      if (win?.yijingAPI?.grsai?.chat) {
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages,
        });
        if (result.ok) {
          const reply = result.data?.choices?.[0]?.message?.content || result.data?.content || '';
          const userMsg: DramaChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
          const assistantMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: reply, timestamp: Date.now() };
          updateCurrentEpisodeStep(STEPS[stepIndex].key, {
            chatMessages: [...(currentStepChat), userMsg, assistantMsg],
            directorReview: reply,
            directorStatus: 'revision',
          });
          setDirectorChatInput('');
        }
      }
    } catch (e: any) {
      showToast(`审核出错：${e.message}`, 'error');
    }
    setIsDirectorGenerating(false);
  }, [directorChatInput, selectedConfig, activeDramaModel, stepIndex, currentStepContent, currentStepChat, updateCurrentEpisodeStep, showToast]);

  // 从剧创记录加载分集
  const loadEpisodesFromRecord = useCallback((record: DramaRecord) => {
    if (record.episodes && Array.isArray(record.episodes) && record.episodes.length > 0) {
      setEpisodes(record.episodes);
      setCurrentEpisodeIndex(Math.min(record.currentEpisodeIndex || 0, record.episodes.length - 1));
    } else if (record.stepContents && Object.keys(record.stepContents).length > 0) {
      // 兼容旧格式：把 stepContents 转成 episodes[0]
      const legacyEp: DramaEpisode = {
        id: generateEpisodeId(),
        title: '第1集',
        stepContents: Object.fromEntries(
          STEPS.map(s => [s.key, {
            content: record.stepContents?.[s.key] || '',
            directorReview: '',
            directorStatus: record.stepContents?.[s.key] ? 'pending' as const : 'pending' as const,
            chatMessages: (record.stepChats?.[s.key]) || [],
            lastUpdated: Date.now(),
          }])
        ),
        storyboardRows: record.storyboardRows?.length ? record.storyboardRows : [{ ...DEFAULT_STORYBOARD }],
        stepIndex: record.stepIndex || 0,
        status: 'in_progress',
        createdAt: record.createdAt || Date.now(),
        updatedAt: Date.now(),
      };
      setEpisodes([legacyEp]);
      setCurrentEpisodeIndex(0);
      setStepIndex(record.stepIndex || 0);
      setStoryboardRows(record.storyboardRows?.length ? record.storyboardRows : [{ ...DEFAULT_STORYBOARD }]);
    } else {
      // 没有旧数据，创建第1集
      const newEp: DramaEpisode = {
        id: generateEpisodeId(),
        title: '第1集',
        stepContents: Object.fromEntries(STEPS.map(s => [s.key, DEFAULT_STEP_CONTENT()])),
        storyboardRows: [{ ...DEFAULT_STORYBOARD }],
        stepIndex: 0,
        status: 'draft',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setEpisodes([newEp]);
      setCurrentEpisodeIndex(0);
    }
  }, []);

  const dramaPageRecommendedConfigs = useMemo(
    () => getCallableRecommendedConfigs(recommendedConfigs),
    [recommendedConfigs]
  );

  // 图片/视频接口配置
  const [imgConfigId, setImgConfigId] = useState<string>('');
  const [imgModel, setImgModel] = useState<string>('');
  const [imgRatio, setImgRatio] = useState<string>('1:1');
  const [videoConfigId, setVideoConfigId] = useState<string>('');
  const [videoModel, setVideoModel] = useState<string>('');
  const [videoRatio, setVideoRatio] = useState<string>('16:9');
  const [videoPixel, setVideoPixel] = useState<string>('720p');

  // 展开状态
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // 提示词库弹窗状态
  const [saveToPromptModal, setSaveToPromptModal] = useState<{
    isOpen: boolean;
    prompt: string;
    name: string;
    thumbnail?: string;
    sourceType: 'text' | 'image' | 'video';
  }>({
    isOpen: false,
    prompt: '',
    name: '',
    sourceType: 'text',
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const stepChatEndRef = useRef<HTMLDivElement>(null);
  // 记录已加载的剧创记录 id，避免因 dramaRecords 引用变化（每次自动保存都会生成新数组）导致的加载死循环
  const loadedRecordIdRef = useRef<string | null>(null);

  // ---------- 从 store 加载 ----------
  // 【关键修复：打开剧创页卡死】
  // 此 effect 绝不能依赖 dramaRecords —— saveDramaRecord 每次都会生成新的 dramaRecords 数组引用。
  // 若加载 effect 依赖它，就会与下方「自动保存 effect」形成无限循环：
  //   加载 → loadEpisodesFromRecord 生成新 episodes → 自动保存 → 新 dramaRecords → 再次加载 …
  // 因此只依赖 currentDramaRecordId，并用 ref 保证同一条记录只加载一次。
  useEffect(() => {
    if (!currentDramaRecordId) {
      loadedRecordIdRef.current = null;
      return;
    }
    // 同一条记录只加载一次，防止后续自动保存触发的重渲染再次覆盖本地编辑状态
    if (loadedRecordIdRef.current === currentDramaRecordId) return;

    // 读取 store 中最新的记录快照（而非闭包捕获的旧值）
    const record = useAppStore.getState().dramaRecords.find(r => r.id === currentDramaRecordId);
    if (!record) return;

    loadedRecordIdRef.current = currentDramaRecordId;
    setPageState(record.pageState);
    setIdeaMessages(record.ideaMessages || []);
    setImgConfigId(record.imgApiConfigId || '');
    setImgModel(record.imgModel || '');
    setImgRatio(record.imgRatio || '1:1');
    setVideoConfigId(record.videoApiConfigId || '');
    setVideoModel(record.videoModel || '');
    setVideoRatio(record.videoRatio || '16:9');
    setVideoPixel(record.videoPixel || '720p');
    setSelectedConfigId(record.dramaApiConfigId || '');
    setSelectedModel(record.dramaModel || '');
    // 加载分集数据（包含旧字段兼容）
    loadEpisodesFromRecord(record);
    // 恢复步骤内容和对话历史（关键修复！）
    if (record.stepContents) {
      setStepResults(record.stepContents);
    }
    if (record.stepChats) {
      setStepChatMessages(record.stepChats);
    }
    if (record.storyboardRows?.length) {
      setStoryboardRows(record.storyboardRows);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDramaRecordId]);

  // 自动滚动到底部
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ideaMessages]);

  useEffect(() => {
    stepChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [stepChatMessages]);

  // ---------- 持久化 ----------
  // 注意：currentEpisode 不能作为依赖项（每次渲染都是新引用，会导致 useEffect 死循环 React #185）
  // 改用 episodes + currentEpisodeIndex 间接访问
  const persistRecord = useCallback(() => {
    if (!currentDramaRecordId) return;
    // 直接从 episodes + currentEpisodeIndex 推导当前集，避免依赖 currentEpisode
    const ep = episodes[currentEpisodeIndex];
    saveDramaRecord({
      pageState,
      stepIndex,
      ideaMessages,
      stepInput: currentStepInput,
      imgApiConfigId: imgConfigId,
      imgModel,
      imgRatio,
      videoApiConfigId: videoConfigId,
      videoModel,
      videoRatio,
      videoPixel,
      dramaApiConfigId: selectedConfigId,
      dramaModel: selectedModel,
      // 新分集格式（主数据源）
      episodes,
      currentEpisodeIndex,
      // 兼容旧字段（从当前集提取）
      stepContents: Object.fromEntries(
        STEPS.map(s => [s.key, ep?.stepContents?.[s.key]?.content || ''])
      ),
      stepChats: Object.fromEntries(
        STEPS.map(s => [s.key, ep?.stepContents?.[s.key]?.chatMessages || []])
      ),
      storyboardRows: ep?.storyboardRows || [],
    });
  }, [
    pageState, stepIndex, ideaMessages, currentStepInput,
    imgConfigId, imgModel, imgRatio,
    videoConfigId, videoModel, videoRatio, videoPixel,
    selectedConfigId, selectedModel, currentDramaRecordId, saveDramaRecord,
    episodes, currentEpisodeIndex,
  ]);

  // 每次关键状态变更自动保存
  // 注意：persistRecord 不能作为依赖项（其内部会调用 saveDramaRecord 触发 store 更新，导致死循环）
  useEffect(() => {
    persistRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pageState, stepIndex, ideaMessages, storyboardRows,
    imgConfigId, imgModel, imgRatio, videoConfigId, videoModel, videoRatio, videoPixel,
    selectedConfigId, selectedModel,
    episodes, currentEpisodeIndex, stepChatMessages, stepResults,
  ]);

  // ---------- 沟通台：发送消息 ----------
  const handleSendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    const userMsg: DramaChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...ideaMessages, userMsg];
    setIdeaMessages(updatedMessages);
    setInputText('');
    setIsSending(true);

    try {
      const win = window as any;
      if (win?.yijingAPI?.grsai?.chat) {
        // 自动续传：循环获取完整回复
        let allContent = '';
        let allThinking = '';
        let continueFetching = true;
        let maxRetries = 5; // 最多续传5次，防止无限循环
        let currentMessages = [
          { role: 'system', content: COMMUNICATE_SYSTEM_PROMPT },
          ...updatedMessages.map(m => ({ role: m.role, content: m.content })),
        ];

        while (continueFetching && maxRetries > 0) {
          const result = await win.yijingAPI.grsai.chat({
            baseUrl: selectedConfig.baseUrl || '',
            apiKey: selectedConfig.apiKey || '',
            model: activeDramaModel,
            messages: currentMessages,
          });

          if (!result.ok) {
            const errorMsg: DramaChatMessage = {
              id: generateId(),
              role: 'assistant',
              content: `[错误] 调用失败：${result.error || '未知错误'}`,
              timestamp: Date.now(),
            };
            setIdeaMessages(prev => [...prev, errorMsg]);
            break;
          }

          const msg = result.data?.choices?.[0]?.message;
          const finishReason = result.data?.choices?.[0]?.finish_reason;
          const reasoningContent = msg?.reasoning_content
            || result.data?.choices?.[0]?.reasoning_content
            || result.data?.reasoning_content
            || result.data?.thinking
            || '';
          // 内容优先从 content 取，如果为空则用 reasoning_content（某些模型把回答放在这里）
          const content = msg?.content || result.data?.choices?.[0]?.content || result.data?.content || result.data?.response || reasoningContent || '';
          const thinking = reasoningContent;

          allContent += content;
          if (thinking) allThinking += (allThinking ? '\n' : '') + thinking;

          // 如果 finish_reason 是 length，继续获取剩余内容
          if (finishReason === 'length') {
            maxRetries--;
            if (content) {
              // 添加已获取的内容作为 assistant 回复，然后让 AI 继续
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content },
                { role: 'user', content: '请继续完成上面的回答，不要重复已说过的内容。' },
              ];
            }
            // 如果 maxRetries 耗尽，强制退出
            if (maxRetries <= 0) {
              continueFetching = false;
            }
          } else {
            continueFetching = false;
          }
        }

        const assistantMsg: DramaChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: allContent || '(AI 未返回内容)',
          timestamp: Date.now(),
          thinking: allThinking || undefined,
        };
        setIdeaMessages(prev => [...prev, assistantMsg]);
      } else {
        // fallback 模拟回复
        const assistantMsg: DramaChatMessage = {
          id: generateId(),
          role: 'assistant',
          content: `收到您的想法：「${text}」\n\n这是一个很好的起点！让我帮您梳理一下：\n\n1. **核心主题**：这个想法围绕……\n2. **情感目标**：观众应该感受到……\n3. **建议方向**：您可以考虑从……切入\n\n您觉得这个方向怎么样？或者您有其他想法想深入探讨？`,
          timestamp: Date.now(),
        };
        setIdeaMessages(prev => [...prev, assistantMsg]);
      }
    } catch (e: any) {
      const errorMsg: DramaChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `[错误] 发生错误：${e.message || e}`,
        timestamp: Date.now(),
      };
      setIdeaMessages(prev => [...prev, errorMsg]);
    }
    setIsSending(false);
  }, [inputText, isSending, selectedConfig, activeDramaModel, ideaMessages, showToast]);

  // 支持沟通台输入框与示例卡片调用的发送函数（使用 commInputText）
  const handleCommSend = useCallback(async (textArg?: string) => {
    const text = (typeof textArg === 'string' ? textArg : commInputText).trim();
    if (!text || isSending) return;
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    const userMsg: DramaChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    const updatedMessages = [...ideaMessages, userMsg];
    setIdeaMessages(updatedMessages);
    setCommInputText('');
    setIsSending(true);

    try {
      const win = window as any;
      if (win?.yijingAPI?.grsai?.chat) {
        // 自动续传：循环获取完整回复
        let allContent = '';
        let allThinking = '';
        let continueFetching = true;
        let maxRetries = 5; // 最多续传5次，防止无限循环
        let currentMessages = [
          { role: 'system', content: COMMUNICATE_SYSTEM_PROMPT },
          ...updatedMessages.map(m => ({ role: m.role, content: m.content })),
        ];

        while (continueFetching && maxRetries > 0) {
          const result = await win.yijingAPI.grsai.chat({
            baseUrl: (selectedConfig as any).baseUrl || '',
            apiKey: (selectedConfig as any).apiKey || '',
            model: activeDramaModel,
            messages: currentMessages,
          });

          if (!result.ok) {
            const errorMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: `[错误] 调用失败：${result.error || '未知错误'}`, timestamp: Date.now() };
            setIdeaMessages([...updatedMessages, errorMsg]);
            break;
          }

          const msg = result.data?.choices?.[0]?.message;
          const finishReason = result.data?.choices?.[0]?.finish_reason;
          const reasoningContent = msg?.reasoning_content
            || result.data?.choices?.[0]?.reasoning_content
            || result.data?.reasoning_content
            || result.data?.thinking
            || '';
          // 内容优先从 content 取，如果为空则用 reasoning_content（某些模型把回答放在这里）
          const content = msg?.content || result.data?.choices?.[0]?.content || result.data?.content || result.data?.response || reasoningContent || '';
          const thinking = reasoningContent;

          allContent += content;
          if (thinking) allThinking += (allThinking ? '\n' : '') + thinking;

          // 如果 finish_reason 是 length，继续获取剩余内容
          if (finishReason === 'length') {
            maxRetries--;
            if (content) {
              // 添加已获取的内容作为 assistant 回复，然后让 AI 继续
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content },
                { role: 'user', content: '请继续完成上面的回答，不要重复已说过的内容。' },
              ];
            }
            // 如果 maxRetries 耗尽，强制退出
            if (maxRetries <= 0) {
              continueFetching = false;
            }
          } else {
            continueFetching = false;
          }
        }

        const assistantMsg: DramaChatMessage = {
          id: generateId(), role: 'assistant', content: allContent || '(AI 未返回内容)', timestamp: Date.now(), thinking: allThinking || undefined,
        };
        setIdeaMessages([...updatedMessages, assistantMsg]);
      } else {
        const assistantMsg: DramaChatMessage = {
          id: generateId(), role: 'assistant', content: `收到您的想法：「${text}」\n\n这是一个很好的起点！让我帮您梳理一下：\n\n1. **核心主题**：这个想法围绕……\n2. **情感目标**：观众应该感受到……\n3. **建议方向**：您可以考虑从……切入\n\n您觉得这个方向怎么样？或者您有其他想法想深入探讨？`, timestamp: Date.now(),
        };
        setIdeaMessages([...updatedMessages, assistantMsg]);
      }
    } catch (e: any) {
      const errorMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: `[错误] 发生错误：${e.message || e}`, timestamp: Date.now() };
      setIdeaMessages([...updatedMessages, errorMsg]);
    }

    setIsSending(false);
  }, [commInputText, isSending, selectedConfig, activeDramaModel, ideaMessages, showToast]);

  // ---------- 工作台：提交导演审核 ----------
  const handleDirectorReview = useCallback(async () => {
    const step = STEPS[stepIndex];
    if (!step) return;
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    // 设置审核状态为 review
    const currentStepKey = STEPS[stepIndex].key;
    const currentContent = episodes[currentEpisodeIndex]?.stepContents?.[currentStepKey] || DEFAULT_STEP_CONTENT();
    updateEpisode(currentEpisodeIndex, {
      stepContents: {
        ...episodes[currentEpisodeIndex].stepContents,
        [currentStepKey]: {
          ...currentContent,
          directorStatus: 'review',
          lastUpdated: Date.now(),
        },
      },
    });

    // 设置生成状态
    setStepIsGenerating(prev => ({ ...prev, [step.key]: true }));

    try {
      const win = window as any;

      // 获取当前步骤的内容
      const currentStepContent = currentEpisode?.stepContents?.[step.key]?.content || '';
      
      // 获取前面所有步骤的内容作为上下文
      const getStepContent = (s: { key: string; label: string }) => {
        const content = currentEpisode?.stepContents?.[s.key]?.content || '';
        return content ? `## ${s.label}\n${content}` : '';
      };
      
      const previousSteps = STEPS.slice(0, stepIndex + 1)
        .map(getStepContent)
        .filter(Boolean)
        .join('\n\n');

      // 获取所有前置步骤的内容用于对比审核
      const getPreviousStepsContent = () => {
        const contents: string[] = [];
        for (let i = 0; i < stepIndex; i++) {
          const s = STEPS[i];
          const content = currentEpisode?.stepContents?.[s.key]?.content || '';
          if (content) {
            contents.push(`=== ${s.label} ===\n${content}`);
          }
        }
        return contents.join('\n\n');
      };

      const previousStepsContent = getPreviousStepsContent();

      const messages = [
        {
          role: 'system',
          content: `你是Alisa，一位影视总导演。你的核心价值是精准传递情绪——让观众感受到他们应该感受到的东西。

## 审核原则
1. **情绪一致性** - 当前步骤的情绪设计是否与导演阐述一致？
2. **逻辑连贯性** - 故事发展是否前后呼应？人物行为是否符合设定？
3. **专业标准** - 是否符合该步骤的专业要求（故事结构/剧本格式/分镜规范等）
4. **可执行性** - 内容是否具体可执行？还是过于抽象？

## 审核方法
- 对比前置步骤：将当前内容与导演阐述、故事大纲等进行对比
- 标注情绪坐标：用"（强度，类型）"评估情绪传递是否到位
- 具体场景化：不说"不够好"，而是指出"哪里不够好，怎么改"
- 先肯定再调整：先找到对的部分，再提修改建议

## 输出格式
1. **一致性检查** - 与前置步骤的对比分析
2. **总体评价** - 优点 + 需要改进的地方
3. **具体修改建议** - 逐条列出，包含"问题+修改方案"
4. **情绪审核** - 情绪坐标标注和评估
5. **审核结论** - 【通过】或【需修改】+ 理由

【重要】你必须使用中文回复。语气专业但亲切，像导演跟团队沟通一样。`,
        },
        {
          role: 'user',
          content: previousStepsContent 
            ? `=== 前置创作内容 ===\n\n${previousStepsContent}\n\n=== 待审核：${step.label} ===\n\n${currentStepContent}\n\n请作为总导演Alisa，对比前置内容进行审核。检查情绪一致性、逻辑连贯性和专业标准，给出具体修改建议。`
            : `=== 待审核：${step.label} ===\n\n${currentStepContent}\n\n请作为总导演Alisa进行审核。这是第一个步骤，请重点评估其情绪目标是否清晰、风格定位是否明确、是否具有可执行性。`,
        },
      ];

      if (win?.yijingAPI?.grsai?.chat) {
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages,
        });

        if (result.ok) {
          // 提取内容
          let content = '';
          const msg = result.data?.choices?.[0]?.message;
          
          if (msg?.content && msg.content.trim()) {
            content = msg.content;
          } else if (msg?.reasoning_content && msg.reasoning_content.trim()) {
            content = msg.reasoning_content;
          } else if (result.data?.choices?.[0]?.content) {
            content = result.data.choices[0].content;
          } else if (result.data?.content) {
            content = result.data.content;
          } else if (result.data?.response) {
            content = result.data.response;
          } else if (result.data?.message?.content) {
            content = result.data.message.content;
          } else if (typeof result.data === 'string') {
            content = result.data;
          } else {
            content = JSON.stringify(result.data, null, 2);
          }
          
          if (!content || content.trim() === '') {
            content = '审核完成，但未返回具体内容。';
          }

          // 自动判断是否通过审核（简单关键词匹配）
          const isApproved = content.includes('通过') || content.includes('认可') || content.includes('可以') || content.includes('达标') || content.includes('通过审核');
          const newStatus = isApproved ? 'approved' : 'review';

          // 将审核意见添加到右侧对话栏
          const reviewMsg: DramaChatMessage = {
            id: `director_review_${Date.now()}`,
            role: 'assistant',
            content: `【导演审核意见】${isApproved ? ' ✅ 通过' : ' ⚠️ 需修改'}\n\n${content}`,
            timestamp: Date.now(),
          };
          
          const updatedChatMessages = [...(currentContent.chatMessages || []), reviewMsg];
          updateEpisode(currentEpisodeIndex, {
            stepContents: {
              ...episodes[currentEpisodeIndex].stepContents,
              [currentStepKey]: {
                ...currentContent,
                directorStatus: newStatus,
                chatMessages: updatedChatMessages,
                lastUpdated: Date.now(),
              },
            },
          });
          
          showToast(isApproved ? '导演审核已通过' : '导演提出了修改意见', isApproved ? 'success' : 'warning');
        } else {
          // 恢复状态
          updateEpisode(currentEpisodeIndex, {
            stepContents: {
              ...episodes[currentEpisodeIndex].stepContents,
              [currentStepKey]: {
                ...currentContent,
                directorStatus: 'pending',
                lastUpdated: Date.now(),
              },
            },
          });
          showToast(`审核失败：${result.error || '未知错误'}`, 'error');
        }
      } else {
        // fallback 模拟
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const mockReview = `【导演审核意见】

**总体评价：**
整体构思不错，故事有潜力。但在人物动机和情节转折上还有提升空间。

**具体修改建议：**
1. 主角的行为动机需要更加明确，建议增加内心独白的描写
2. 第二幕的转折点略显突兀，建议铺垫更多细节
3. 结尾的情感高潮可以更加克制，用"留白"的方式更有力量

**审核结论：**
建议修改后再次提交审核。`;

        const reviewMsg: DramaChatMessage = {
          id: `director_review_${Date.now()}`,
          role: 'assistant',
          content: mockReview,
          timestamp: Date.now(),
        };
        
        const updatedChatMessages = [...(currentContent.chatMessages || []), reviewMsg];
        updateEpisode(currentEpisodeIndex, {
          stepContents: {
            ...episodes[currentEpisodeIndex].stepContents,
            [currentStepKey]: {
              ...currentContent,
              directorStatus: 'review',
              chatMessages: updatedChatMessages,
              lastUpdated: Date.now(),
            },
          },
        });
        
        showToast('导演审核意见已生成（模拟）', 'success');
      }
    } catch (e: any) {
      // 恢复状态
      updateEpisode(currentEpisodeIndex, {
        stepContents: {
          ...episodes[currentEpisodeIndex].stepContents,
          [currentStepKey]: {
            ...currentContent,
            directorStatus: 'pending',
            lastUpdated: Date.now(),
          },
        },
      });
      showToast(`审核出错：${e.message || e}`, 'error');
    }

    setStepIsGenerating(prev => ({ ...prev, [step.key]: false }));
  }, [stepIndex, selectedConfig, activeDramaModel, currentEpisode, currentEpisodeIndex, episodes, updateEpisode, showToast]);

  // ---------- 导演修改：发送修改意见并更新左侧内容 ----------
  const handleDirectorRevision = useCallback(async () => {
    const text = directorReviewInput.trim();
    if (!text) return;
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    const currentStepKey = STEPS[stepIndex].key;
    const currentContent = episodes[currentEpisodeIndex]?.stepContents?.[currentStepKey] || DEFAULT_STEP_CONTENT();
    const currentLeftContent = currentContent.content || '';

    // 添加用户消息到沟通记录
    const userMsg: DramaChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };
    const updatedChatMessages = [...(currentContent.chatMessages || []), userMsg];
    updateEpisode(currentEpisodeIndex, {
      stepContents: {
        ...episodes[currentEpisodeIndex].stepContents,
        [currentStepKey]: {
          ...currentContent,
          chatMessages: updatedChatMessages,
          lastUpdated: Date.now(),
        },
      },
    });
    setDirectorReviewInput('');
    setIsSending(true);
    setIsRevising(true);

    try {
      const win = window as any;
      if (win?.yijingAPI?.grsai?.chat) {
        // 构建包含左侧内容的上下文
        const stepTitle = STEPS[stepIndex]?.label || '';
        let contextPrompt = '';
        if (currentLeftContent) {
          contextPrompt = `【当前 ${stepTitle} 内容】\n${currentLeftContent}\n\n【导演修改要求】\n${text}\n\n请根据导演的要求修改上面的内容，直接输出修改后的完整内容，不需要解释。`;
        } else {
          contextPrompt = `【导演要求】\n${text}\n\n请直接输出符合要求的 ${stepTitle} 内容，不需要解释。`;
        }

        // 自动续传：循环获取完整回复
        let allContent = '';
        let continueFetching = true;
        let maxRetries = 5;
        let currentMessages = [
          { role: 'system', content: COMMUNICATE_SYSTEM_PROMPT },
          { role: 'user', content: contextPrompt },
        ];

        while (continueFetching && maxRetries > 0) {
          const result = await win.yijingAPI.grsai.chat({
            baseUrl: (selectedConfig as any).baseUrl || '',
            apiKey: (selectedConfig as any).apiKey || '',
            model: activeDramaModel,
            messages: currentMessages,
          });

          if (!result.ok) {
            showToast(`AI 调用失败：${result.error || '未知错误'}`, 'error');
            break;
          }

          const msg = result.data?.choices?.[0]?.message;
          const finishReason = result.data?.choices?.[0]?.finish_reason;
          const reasoningContent = msg?.reasoning_content
            || result.data?.choices?.[0]?.reasoning_content
            || result.data?.reasoning_content
            || result.data?.thinking
            || '';
          const content = msg?.content || result.data?.choices?.[0]?.content || result.data?.content || result.data?.response || reasoningContent || '';

          allContent += content;

          // 如果 finish_reason 是 length，继续获取剩余内容
          if (finishReason === 'length') {
            maxRetries--;
            if (content) {
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content },
                { role: 'user', content: '请继续完成上面的回答，不要重复已说过的内容。' },
              ];
            }
            if (maxRetries <= 0) {
              continueFetching = false;
            }
          } else {
            continueFetching = false;
          }
        }

        // 将 AI 回复添加到沟通记录并更新左侧内容
        if (allContent) {
          const assistantMsg: DramaChatMessage = {
            id: generateId(),
            role: 'assistant',
            content: allContent,
            timestamp: Date.now(),
          };
          const finalChatMessages = [...updatedChatMessages, assistantMsg];
          updateEpisode(currentEpisodeIndex, {
            stepContents: {
              ...episodes[currentEpisodeIndex].stepContents,
              [currentStepKey]: {
                ...currentContent,
                content: allContent, // 更新左侧内容
                chatMessages: finalChatMessages,
                lastUpdated: Date.now(),
              },
            },
          });
          // 自动保存到全局记忆系统
          saveToMemory(
            'drama',
            'drama',
            `${currentEpisode?.title || '剧创'} - ${currentStepKey}`,
            allContent,
            {
              tags: ['剧创', currentStepKey as string, '导演修改'],
              metadata: { episodeIndex: currentEpisodeIndex, episodeTitle: episodes[currentEpisodeIndex]?.title, type: 'revision' },
            }
          );
        }
      } else {
        showToast('AI 接口不可用', 'error');
      }
    } catch (e: any) {
      showToast(`发生错误：${e.message || e}`, 'error');
    }

    setIsSending(false);
    setIsRevising(false);
  }, [directorReviewInput, stepIndex, selectedConfig, activeDramaModel, currentEpisodeIndex, episodes, updateEpisode, showToast]);

  // ---------- 工作台：生成步骤内容 ----------
  const handleStepGenerate = useCallback(async (targetStepIndex?: number) => {
    const idx = targetStepIndex ?? stepIndex;
    const step = STEPS[idx];
    if (!step) return;
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    // 设置生成状态
    setStepIsGenerating(prev => ({ ...prev, [step.key]: true }));
    // 更新分集状态为进行中
    updateEpisode(currentEpisodeIndex, { status: 'in_progress' });

    try {
      const win = window as any;
      let messages: { role: string; content: string }[] = [];

      // 获取当前集的各步骤内容
      const getStepContent = (s: { key: string }) => currentEpisode?.stepContents?.[s.key]?.content || '';

      if (idx === 0) {
        // 第一步：使用沟通历史作为上下文
        const communicateContext = ideaMessages.map(m =>
          `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`
        ).join('\n\n');

        messages = [
          { role: 'system', content: SYSTEM_PROMPTS[step.key] },
          { role: 'user', content: `以下是与用户的沟通记录，请根据这些内容生成${step.label}：\n\n${communicateContext}` },
        ];
      } else {
        // 后续步骤：使用前面所有步骤的结果作为上下文（从当前集获取）
        const previousResults = STEPS.slice(0, idx).map(s =>
          `## ${s.label}\n${getStepContent(s) || '（未生成）'}`
        ).join('\n\n');

        messages = [
          { role: 'system', content: SYSTEM_PROMPTS[step.key] },
          { role: 'user', content: `以下是前面步骤的创作结果：\n\n${previousResults}\n\n请根据这些内容，生成【${step.label}】的内容。` },
        ];
      }

      if (win?.yijingAPI?.grsai?.chat) {
        // 自动续传：循环获取完整回复，超出文字限制时后台继续生成直到完整
        let allContent = '';
        let continueFetching = true;
        let maxRetries = 8; // 最多续传8次，确保长文本（小说/剧本）完整生成
        let currentMessages = [...messages];
        let hasError = false;

        while (continueFetching && maxRetries > 0) {
          const result = await win.yijingAPI.grsai.chat({
            baseUrl: (selectedConfig as any).baseUrl || '',
            apiKey: (selectedConfig as any).apiKey || '',
            model: activeDramaModel,
            messages: currentMessages,
          });

          if (!result.ok) {
            showToast(`生成失败：${result.error || '未知错误'}`, 'error');
            hasError = true;
            break;
          }

          // 尝试多种可能的数据结构提取内容
          let content = '';
          const msg = result.data?.choices?.[0]?.message;
          const finishReason = result.data?.choices?.[0]?.finish_reason;

          // 优先使用 content，如果为空则使用 reasoning_content
          if (msg?.content && msg.content.trim()) {
            content = msg.content;
          } else if (msg?.reasoning_content && msg.reasoning_content.trim()) {
            content = msg.reasoning_content;
          } else if (result.data?.choices?.[0]?.content) {
            content = result.data.choices[0].content;
          } else if (result.data?.content) {
            content = result.data.content;
          } else if (result.data?.response) {
            content = result.data.response;
          } else if (result.data?.message?.content) {
            content = result.data.message.content;
          } else if (typeof result.data === 'string') {
            content = result.data;
          } else {
            content = JSON.stringify(result.data, null, 2);
          }

          allContent += content;

          // 如果 finish_reason 是 length，继续获取剩余内容（超出文字限制）
          if (finishReason === 'length' && content.trim()) {
            maxRetries--;
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content },
              { role: 'user', content: '请继续完成上面的回答，不要重复已说过的内容，直接继续输出剩余部分，保持同样的格式和风格。' },
            ];
            if (maxRetries <= 0) {
              continueFetching = false;
            }
          } else {
            continueFetching = false;
          }
        }

        if (!hasError) {
          if (!allContent || allContent.trim() === '') {
            allContent = '生成完成，但未返回内容。';
          }

          // 更新分集步骤内容
          updateCurrentEpisodeStep(step.key, { content: allContent, directorStatus: 'pending', lastUpdated: Date.now() });
          // 同步更新旧字段（兼容）
          setStepResults(prev => ({ ...prev, [step.key]: allContent }));
          // 自动保存到全局记忆系统
          saveToMemory(
            'drama',
            'drama',
            `${currentEpisode?.title || '剧创'} - ${step.label}`,
            allContent,
            {
              tags: ['剧创', step.label, '自动保存'],
              metadata: { episodeIndex: currentEpisodeIndex, episodeTitle: currentEpisode?.title },
            }
          );
          showToast(`${step.label}生成完成`, 'success');
        }
      } else {
        // fallback 模拟
        await new Promise(resolve => setTimeout(resolve, 1500));
        const mockContent = `# ${step.label}\n\n## 自动生成的内容\n\n这是基于沟通记录自动生成的${step.label}内容框架...`;
        updateCurrentEpisodeStep(step.key, { content: mockContent, directorStatus: 'pending', lastUpdated: Date.now() });
        setStepResults(prev => ({ ...prev, [step.key]: mockContent }));
        showToast(`${step.label}生成完成（模拟）`, 'info');
      }
    } catch (e: any) {
      showToast(`生成错误：${e.message || e}`, 'error');
    }

    setStepIsGenerating(prev => ({ ...prev, [step.key]: false }));
  }, [stepIndex, selectedConfig, activeDramaModel, ideaMessages, stepResults]);

  // 添加分集后自动触发第一步创作
  const handleAddEpisode = useCallback((title?: string) => {
    addEpisode(title);
    setTimeout(() => {
      handleStepGenerate(0);
    }, 200);
  }, [addEpisode, handleStepGenerate]);

  // ---------- 工作台：右侧对话发送 ----------
  const handleStepChatSend = useCallback(async () => {
    const text = currentStepInput.trim();
    if (!text || !selectedConfig || !activeDramaModel) return;

    const step = STEPS[stepIndex];
    if (!step) return;

    const userMsg: DramaChatMessage = { id: generateId(), role: 'user', content: text, timestamp: Date.now() };

    // 更新分集对话
    updateCurrentEpisodeStep(step.key, {
      chatMessages: [...(currentStepChat), userMsg],
    });
    // 同步旧字段
    setStepChatMessages(prev => ({ ...prev, [step.key]: [...(prev[step.key] || []), userMsg] }));
    setCurrentStepInput('');
    setStepIsGenerating(prev => ({ ...prev, [step.key]: true }));

    try {
      const win = window as any;
      const currentContent = currentEpisode?.stepContents?.[step.key]?.content || '';
      const chatHistory = currentStepChat;

      const messages = [
        { role: 'system', content: `你是${step.label}步骤的修改助手。当前内容：\n\n${currentContent}` },
        ...chatHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: `请根据以下修改意见，更新${step.label}的内容：${text}` },
      ];

      if (win?.yijingAPI?.grsai?.chat) {
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages,
        });

        if (result.ok) {
          // 尝试多种可能的数据结构提取内容
          let replyContent = '';
          const msg = result.data?.choices?.[0]?.message;
          
          // 优先使用 content，如果为空则使用 reasoning_content
          if (msg?.content && msg.content.trim()) {
            replyContent = msg.content;
          } else if (msg?.reasoning_content && msg.reasoning_content.trim()) {
            replyContent = msg.reasoning_content;
          } else if (result.data?.choices?.[0]?.content) {
            replyContent = result.data.choices[0].content;
          } else if (result.data?.content) {
            replyContent = result.data.content;
          } else if (result.data?.response) {
            replyContent = result.data.response;
          } else if (result.data?.message?.content) {
            replyContent = result.data.message.content;
          } else if (typeof result.data === 'string') {
            replyContent = result.data;
          } else {
            replyContent = JSON.stringify(result.data, null, 2);
          }
          
          if (!replyContent || replyContent.trim() === '') {
            replyContent = '已收到修改意见';
          }
          
          const thinkingContent = result.data?.choices?.[0]?.message?.reasoning_content
            || result.data?.choices?.[0]?.reasoning_content
            || result.data?.reasoning_content
            || result.data?.thinking
            || undefined;

          const assistantMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: replyContent, timestamp: Date.now(), thinking: thinkingContent };
          // 更新分集
          updateCurrentEpisodeStep(step.key, {
            chatMessages: [...(currentStepChat), userMsg, assistantMsg],
            directorReview: replyContent,
          });
          // 同步旧字段
          setStepChatMessages(prev => ({ ...prev, [step.key]: [...(prev[step.key] || []), assistantMsg] }));
          setStepResults(prev => ({ ...prev, [step.key]: replyContent }));
        } else {
          const errorMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: `[错误] 调用失败：${result.error || '未知错误'}`, timestamp: Date.now() };
          updateCurrentEpisodeStep(step.key, { chatMessages: [...(currentStepChat), userMsg, errorMsg] });
          setStepChatMessages(prev => ({ ...prev, [step.key]: [...(prev[step.key] || []), errorMsg] }));
        }
      } else {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const assistantMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: `已收到修改意见：「${text}」\n\n正在根据您的意见更新内容...`, timestamp: Date.now() };
        updateCurrentEpisodeStep(step.key, { chatMessages: [...(currentStepChat), userMsg, assistantMsg] });
        setStepChatMessages(prev => ({ ...prev, [step.key]: [...(prev[step.key] || []), assistantMsg] }));
      }
    } catch (e: any) {
      const errorMsg: DramaChatMessage = { id: generateId(), role: 'assistant', content: `[错误] 发生错误：${e.message || e}`, timestamp: Date.now() };
      updateCurrentEpisodeStep(step.key, { chatMessages: [...(currentStepChat), userMsg, errorMsg] });
      setStepChatMessages(prev => ({ ...prev, [step.key]: [...(prev[step.key] || []), errorMsg] }));
    }

    setStepIsGenerating(prev => ({ ...prev, [step.key]: false }));
  }, [currentStepInput, stepIndex, selectedConfig, activeDramaModel, currentEpisode, currentStepChat, updateCurrentEpisodeStep]);

  // ---------- 开始新创作 ----------
  const handleNewCreation = useCallback(() => {
    const id = saveDramaRecord({
      pageState: 1,
      stepIndex: 0,
      ideaMessages: [],
      stepContents: {},
      stepChats: {},
      stepInput: '',
      storyboardRows: [{ ...DEFAULT_STORYBOARD }],
      imgApiConfigId: '',
      imgModel: '',
      imgRatio: '1:1',
      videoApiConfigId: '',
      videoModel: '',
      videoRatio: '16:9',
      videoPixel: '720p',
      dramaApiConfigId: selectedConfigId,
      dramaModel: selectedModel,
    });
    loadDramaRecord(id);
    setPageState(1);
    setIdeaMessages([]);
    setStepResults({});
    setStepChatMessages({});
    setStepIndex(0);
    setStoryboardRows([{ ...DEFAULT_STORYBOARD }]);
  }, [saveDramaRecord, loadDramaRecord, selectedConfigId, selectedModel]);

  // ---------- 加载记录 ----------
  const handleLoadRecord = useCallback((id: string) => {
    loadDramaRecord(id);
    const record = dramaRecords.find(r => r.id === id);
    if (record) {
      setPageState(record.pageState || 1);
      setStepIndex(record.stepIndex || 0);
      setIdeaMessages(record.ideaMessages || []);
      if (record.stepContents) {
        setStepResults(record.stepContents);
      }
      if (record.stepChats) {
        setStepChatMessages(record.stepChats);
      }
      setStoryboardRows(record.storyboardRows?.length ? record.storyboardRows : [{ ...DEFAULT_STORYBOARD }]);
      setImgConfigId(record.imgApiConfigId || '');
      setImgModel(record.imgModel || '');
      setImgRatio(record.imgRatio || '1:1');
      setVideoConfigId(record.videoApiConfigId || '');
      setVideoModel(record.videoModel || '');
      setVideoRatio(record.videoRatio || '16:9');
      setVideoPixel(record.videoPixel || '720p');
      setSelectedConfigId(record.dramaApiConfigId || '');
      setSelectedModel(record.dramaModel || '');
    }
  }, [loadDramaRecord, dramaRecords]);

  // ---------- 沟通完成，生成总结 ----------
  const handleFinishCommunication = useCallback(async () => {
    if (ideaMessages.length === 0) return;
    if (!selectedConfig || !activeDramaModel) {
      showToast('请先选择接口和模型', 'error');
      return;
    }

    setIsGeneratingSummary(true);
    try {
      const win = window as any;
      const conversationText = ideaMessages.map(m =>
        `${m.role === 'user' ? '用户' : 'AI'}：${m.content}`
      ).join('\n\n');

      const summaryPrompt = `基于以下沟通记录，生成一个简洁的创作框架总结：

${conversationText}

请按以下格式输出：

## 创作框架总结

### 1. 核心主题
（一句话描述故事核心）

### 2. 类型与风格
（影片类型、情绪基调、视觉风格）

### 3. 目标观众
（目标人群、情感目标）

### 4. 主要人物
（主角设定、核心矛盾）

### 5. 关键场景
（2-3个关键场景概要）

### 6. 创作建议
（给导演的创作建议）`;

      if (win?.yijingAPI?.grsai?.chat) {
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: selectedConfig.baseUrl || '',
          apiKey: selectedConfig.apiKey || '',
          model: activeDramaModel,
          messages: [{ role: 'user', content: summaryPrompt }],
        });

        if (result.ok) {
          const summary = result.data?.choices?.[0]?.message?.content
            || result.data?.content
            || result.data?.response
            || '总结生成失败，请手动总结沟通内容';
          setCommunicationSummary(summary);
        } else {
          showToast(`总结生成失败：${result.error || '未知错误'}`, 'error');
        }
      } else {
        // fallback 模拟总结
        setCommunicationSummary(`## 创作框架总结

### 1. 核心主题
基于沟通记录的主题

### 2. 类型与风格
根据用户需求确定

### 3. 目标观众
根据沟通内容确定

### 4. 主要人物
待进一步设定

### 5. 关键场景
待进一步设计

### 6. 创作建议
进入创作工作台开始详细创作`);
      }
    } catch (e: any) {
      showToast(`生成总结出错：${e.message || e}`, 'error');
    }
    setIsGeneratingSummary(false);
  }, [ideaMessages, selectedConfig, activeDramaModel, showToast]);

  // ---------- 示例点击 ----------
  const handleExampleClick = useCallback(async (title: string, desc: string) => {
    if (!selectedConfig) {
      showToast('请先选择已保存的剧创接口', 'error');
      return;
    }
    if (!activeDramaModel) {
      showToast('请先从已保存接口中选择模型', 'error');
      return;
    }

    const userMsg: DramaChatMessage = {
      id: generateId(), role: 'user', content: `我想创作一个${title}：${desc}`, timestamp: Date.now(),
    };
    setIdeaMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    try {
      const win = window as any;
      if (win?.yijingAPI?.grsai?.chat) {
        const messages = [
          { role: 'system', content: COMMUNICATE_SYSTEM_PROMPT },
          { role: 'user', content: `我想创作一个${title}：${desc}` },
        ];
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages,
        });
        if (result.ok) {
          const replyContent = result.data?.choices?.[0]?.message?.content
            || result.data?.content
            || result.data?.response
            || '很好的主题！';
          const assistantMsg: DramaChatMessage = {
            id: generateId(), role: 'assistant', content: replyContent, timestamp: Date.now(),
          };
          setIdeaMessages(prev => [...prev, assistantMsg]);
        }
      }
    } catch (e) { /* ignore */ }
    setIsSending(false);
  }, [selectedConfig, activeDramaModel, showToast]);

  // ---------- 重命名 ----------
  const handleRename = useCallback((id: string, name: string) => {
    saveDramaRecord({
      pageState, stepIndex, ideaMessages, stepContents: stepResults, stepChats: stepChatMessages, stepInput: currentStepInput,
      storyboardRows, imgApiConfigId: imgConfigId, imgModel, imgRatio,
      videoApiConfigId: videoConfigId, videoModel, videoRatio, videoPixel,
      dramaApiConfigId: selectedConfigId, dramaModel: selectedModel,
    }, name);
    setEditingId(null);
  }, [pageState, stepIndex, ideaMessages, stepResults, stepChatMessages, currentStepInput,
    storyboardRows, imgConfigId, imgModel, imgRatio,
    videoConfigId, videoModel, videoRatio, videoPixel,
    selectedConfigId, selectedModel, saveDramaRecord]);

  // ---------- 删除记录 ----------
  const handleDelete = useCallback((id: string) => {
    if (confirm('确定删除这条创作记录吗？')) {
      deleteDramaRecord(id);
      if (currentDramaRecordId === id) {
        setPageState(0);
        setIdeaMessages([]);
        setStepResults({});
        setStepChatMessages({});
        setStoryboardRows([{ ...DEFAULT_STORYBOARD }]);
      }
    }
  }, [deleteDramaRecord, currentDramaRecordId]);

  // ---------- 历史记录操作 ----------
  const handleResumeWork = useCallback((rec: DramaRecord) => {
    loadDramaRecord(rec.id);
    setPageState(rec.pageState || 1);
    setIdeaMessages(rec.commMessages || rec.ideaMessages || []);
    if (rec.stepsData) {
      setStepResults(rec.stepsData);
    }
    setStepIndex(rec.currentStepIndex || 0);
  }, [loadDramaRecord]);

  const handleStartRename = useCallback((rec: DramaRecord) => {
    setRenamingId(rec.id);
    setRenameText(rec.name || '未命名创作');
  }, []);

  const handleConfirmRename = useCallback((id: string) => {
    if (!renameText.trim()) { setRenamingId(null); return; }
    renameDramaRecord(id, renameText.trim());
    setRenamingId(null);
    setRenameText('');
  }, [renameText, renameDramaRecord]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameText('');
  }, []);

  // ---------- 保存并关闭 ----------
  const handleSaveAndClose = useCallback(() => {
    persistRecord();
    setPageState(0);
  }, [persistRecord]);

  // ---------- 去创作：检测集数 → 弹窗确认 ----------
  const handleGoToWorkClick = useCallback(() => {
    // 从对话消息中检测是否提到了具体集数
    const allText = ideaMessages.map(m => m.content).join(' ');
    const match = allText.match(/(\d+)\s*[集部话]/);
    const detected = match ? parseInt(match[1], 10) : 1;
    setEpisodeCountInput(Math.max(1, detected));
    setShowEpisodeModal(true);
  }, [ideaMessages]);

  const handleConfirmGoToWork = useCallback(() => {
    const count = Math.max(1, episodeCountInput);
    // 创建指定数量的分集
    const newEpisodes: DramaEpisode[] = Array.from({ length: count }, (_, i) => ({
      id: generateEpisodeId(),
      title: count === 1 ? '正片' : `第${i + 1}集`,
      stepContents: Object.fromEntries(STEPS.map(s => [s.key, DEFAULT_STEP_CONTENT()])),
      storyboardRows: [{ ...DEFAULT_STORYBOARD }],
      stepIndex: 0,
      status: 'draft' as const,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
    setEpisodes(newEpisodes);
    setCurrentEpisodeIndex(0);
    setStepIndex(0);
    setPageState(2);
    setShowEpisodeModal(false);
    // 触发导演阐述步骤自动生成
    setTimeout(() => { handleStepGenerate(0); }, 100);
  }, [episodeCountInput, handleStepGenerate]);

  // ---------- 故事板操作 ----------
  const addStoryboardRow = useCallback(() => {
    setStoryboardRows(prev => [...prev, { ...DEFAULT_STORYBOARD }]);
  }, []);

  const updateStoryboardRow = useCallback((index: number, field: keyof StoryboardRow, value: string) => {
    setStoryboardRows(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const removeStoryboardRow = useCallback((index: number) => {
    setStoryboardRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const generateStoryboardPrompts = useCallback(async (rowIndex: number) => {
    const row = storyboardRows[rowIndex];
    if (!row) return;

    const sceneInfo = `场景：${row.scene || '未指定'}\n镜头：${row.shot || '未指定'}\n描述：${row.description || '未指定'}`;

    try {
      const win = window as any;
      if (win?.yijingAPI?.grsai?.chat && selectedConfig && activeDramaModel) {
        // 生成 text2img 提示词
        const imgResult = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages: [
            { role: 'system', content: '你是一个专业的AI绘画提示词工程师。根据分镜描述，生成高质量的英文提示词，用于文生图模型。只返回提示词本身。' },
            { role: 'user', content: sceneInfo },
          ],
        });
        if (imgResult.ok) {
          const imgPrompt = imgResult.data?.choices?.[0]?.message?.content || imgResult.data?.content || '';
          updateStoryboardRow(rowIndex, 'text2imgPrompt', imgPrompt);
        }

        // 生成 img2video 提示词
        const vidResult = await win.yijingAPI.grsai.chat({
          baseUrl: (selectedConfig as any).baseUrl || '',
          apiKey: (selectedConfig as any).apiKey || '',
          model: activeDramaModel,
          messages: [
            { role: 'system', content: '你是一个专业的AI视频提示词工程师。根据分镜描述，生成高质量的英文提示词，用于图生视频模型。包含镜头运动。只返回提示词本身。' },
            { role: 'user', content: sceneInfo + `\n镜头运动：${row.cameraMove || '固定镜头'}` },
          ],
        });
        if (vidResult.ok) {
          const vidPrompt = vidResult.data?.choices?.[0]?.message?.content || vidResult.data?.content || '';
          updateStoryboardRow(rowIndex, 'img2videoPrompt', vidPrompt);
        }

        showToast('提示词生成完成！', 'success');
      } else {
        // fallback
        updateStoryboardRow(rowIndex, 'text2imgPrompt', `cinematic shot, ${row.scene || 'scene'}, ${row.description || 'atmosphere'}, photorealistic, 8k, detailed --ar 16:9`);
        updateStoryboardRow(rowIndex, 'img2videoPrompt', `cinematic video, ${row.scene || 'scene'}, ${row.cameraMove || 'slow pan'}, ${row.description || 'atmospheric'}, smooth motion, 24fps`);
        showToast('已生成默认提示词', 'info');
      }
    } catch (e) {
      showToast('提示词生成失败', 'error');
    }
  }, [storyboardRows, selectedConfig, activeDramaModel, updateStoryboardRow, showToast]);

  // ---------- 搜索过滤 ----------
  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return dramaRecords;
    const term = searchTerm.toLowerCase();
    return dramaRecords.filter(r => r.name.toLowerCase().includes(term));
  }, [dramaRecords, searchTerm]);

  // ---------- 右键菜单处理 ----------
  const handleContextMenu = useCallback((e: React.MouseEvent, type: 'message' | 'content' | 'scene', data: any) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [];

    // 复制功能
    items.push({
      label: '复制',
      icon: '📋',
      onClick: async () => {
        try {
          let textToCopy = '';
          if (type === 'message' && data.content) {
            textToCopy = data.content;
          } else if (type === 'content' && data) {
            textToCopy = typeof data === 'string' ? data : (data.content || data.text || '');
          } else if (type === 'scene' && data) {
            textToCopy = JSON.stringify(data, null, 2);
          }
          if (textToCopy) {
            await navigator.clipboard.writeText(textToCopy);
            setCopyToast('已复制到剪贴板');
            setTimeout(() => setCopyToast(null), 1500);
          }
        } catch (err) {
          console.error('复制失败', err);
        }
      }
    });

    // 存入提示词库功能
    if (type === 'message' || type === 'content' || type === 'scene') {
      items.push({ label: '---' });
      items.push({
        label: '存入提示词库',
        icon: '📚',
        onClick: () => {
          let promptText = '';
          if (type === 'message') {
            promptText = data.content || '';
          } else if (type === 'scene') {
            promptText = typeof data === 'string' ? data : (data.description || data.name || JSON.stringify(data, null, 2));
          } else {
            promptText = typeof data === 'string' ? data : (data.content || data.text || '');
          }
          setSaveToPromptModal({
            isOpen: true,
            prompt: promptText,
            name: promptText.slice(0, 20) + (promptText.length > 20 ? '...' : ''),
            sourceType: 'text',
          });
        }
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      onClose: () => setContextMenu(null)
    });
  }, []);

  // ---------- 发送到画布 ----------
  const handleSendToCanvas = useCallback((stepKey: string, content: string, stepLabel: string) => {
    if (!content) {
      showToast('没有可发送的内容', 'error');
      return;
    }
    if (!sendDramaToCanvas) {
      showToast('画布功能未就绪', 'error');
      return;
    }
    sendDramaToCanvas(stepKey, content, stepLabel);
  }, [sendDramaToCanvas, showToast]);

  // ---------- 提交全部到画布 ----------
  const handleSubmitToCanvas = useCallback(() => {
    if (!submitDramaToCanvas) {
      showToast('画布功能未就绪', 'error');
      return;
    }
    if (!episodes.length || !currentEpisode) {
      showToast('没有可提交的内容', 'error');
      return;
    }
    submitDramaToCanvas({
      episodes,
      currentEpisodeIndex,
      storyboardRows,
    });
    showToast('已提交到画布创作', 'success');
  }, [submitDramaToCanvas, episodes, currentEpisode, currentEpisodeIndex, storyboardRows, showToast]);

  // ---------- 提交到剧创工厂创作 ----------
  const handleSubmitToDramart = useCallback(() => {
    persistRecord(); // 提交前确保最新剧本内容已实时保存到历史记录
    if (!currentEpisode && !currentRecord) {
      showToast('没有可提交的内容', 'error');
      return;
    }
    // 只从剧本写作步骤的中心区域获取最终内容（不使用右侧对话框内容）
    const scriptText = currentEpisode?.stepContents?.script?.content || '';
    // 验证剧本内容完整性
    if (!scriptText || scriptText.trim().length < 50) {
      showToast('剧本内容为空或过短，请先完成剧本写作步骤', 'error');
      return;
    }
    // 只提交剧本完整内容，剧创工场会自行分析剧本生成角色/场景/道具/分镜
    const project: DramartProject = {
      id: 'dr_' + Date.now().toString(36),
      name: currentEpisode?.title || currentRecord?.name || '剧创项目',
      ratio: '9:16',
      resolution: '720p',
      styleId: 'rural-90s',
      styleName: '90年代中国农村电影',
      scriptText,
      scriptFileName: (currentEpisode?.title || '剧创') + '.md',
      mode: 'manual',
      createdAt: Date.now(),
      analysis: { step: 0, total: 4, label: '分析剧本', status: 'idle', percent: 0 },
      characters: [],
      scenes: [],
      props: [],
      storyboards: [],
      scriptContent: scriptText,
    };
    submitDramaDraft(project);
    const wordCount = scriptText.trim().length;
    showToast(`已提交剧创工场（剧本${wordCount}字），正在跳转...`, 'success');
  }, [currentEpisode, currentRecord, submitDramaDraft, showToast, persistRecord]);

  // ==================== 渲染 ====================

  // ---- 历史记录页 ----
  if (pageState === 0) {
    const records = dramaRecords || [];
    return (
      <div className="drama-page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {/* 顶栏 */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>  剧创工坊</h2>
            <button onClick={handleNewCreation} style={{ padding: '9px 22px', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(106, 106, 106, 0.3)', display: 'flex', alignItems: 'center', gap: '6px' }}><PlusIcon size={16} /> 开始新创作</button>
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {records.length === 0 ? (
            /* 空状态 */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ClapperboardIcon size={40} /></div>
              <p style={{ fontSize: 16, color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}><CalendarIcon size={16} /> 还没有创作记录</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>点击右上角“开始新创作”，和AI创作顾问聊天梳理想法，再进入工作台生成剧本</p>
              <button onClick={handleNewCreation} style={{ marginTop: 12, padding: '12px 32px', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', color: '#fff', border: 'none', borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: 'pointer', boxShadow: '0 6px 20px rgba(106, 106, 106, 0.35)', display: 'flex', alignItems: 'center', gap: '6px' }}><RocketIcon size={18} /> 去沟通台</button>
            </div>
          ) : (
            /* 记录列表 */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {records.map(rec => (
                <div key={rec.id} onClick={() => handleResumeWork(rec)}
                  style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 12, padding: 18, cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.25)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                  {/* 卡片头部 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {renamingId === rec.id ? (
                        <input value={renameText} onChange={e => setRenameText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleConfirmRename(rec.id); if (e.key === 'Escape') handleCancelRename(); }} onBlur={() => handleConfirmRename(rec.id)} autoFocus
                          style={{ width: '100%', padding: '4px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--accent-color)', borderRadius: 6, fontSize: 14, outline: 'none' }} />
                      ) : (
                        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec.name}</h3>
                      )}
                    </div>
                    {renamingId !== rec.id && (
                      <div style={{ display: 'flex', gap: 4, marginLeft: 8, flexShrink: 0 }}>
<button onClick={(e) => { e.stopPropagation(); handleStartRename(rec); }} style={{ padding: '2px 6px', background: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><EditIcon size={14} /></button>
<button onClick={(e) => { e.stopPropagation(); handleDelete(rec.id); }} style={{ padding: '2px 6px', background: 'transparent', color: '#ef4444', border: 'none', borderRadius: 4, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><DeleteIcon size={14} /></button>
                      </div>
                    )}
                  </div>
                  {/* 卡片信息 */}
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ListCheckIcon size={12} /> {(rec.commMessages?.length || 0) + Object.keys(rec.stepsData || {}).filter(k => (rec.stepsData || {})[k]).length} 步</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><CalendarIcon size={12} /> {new Date(rec.updatedAt || rec.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- 沟通台页 ----
  if (pageState === 1) {
    return (
      <div className="drama-page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
        {/* 顶栏 */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => { persistRecord(); setPageState(0); }} style={{ padding: '6px 16px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-light)', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>← 返回历史</button>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>创作沟通台</h2>
          <div style={{ width: 90 }} />
        </div>

        {/* 对话消息区 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {ideaMessages.length === 0 ? (
            <>
              {/* 示例卡片 */}
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: '6px' }}><LightbulbIcon size={16} /> 选择一个示例开始，或直接输入你的创作想法：</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { title: '5分钟爱情喜剧短片', desc: '咖啡店偶遇的两个人，用误会和巧合推动感情发展' },
                  { title: '30集都市短剧', desc: '职场女性从实习生到CEO的成长故事，穿插3段感情线' },
                  { title: '15秒洗发水广告', desc: '产品卖点：去屑+柔顺，目标受众：年轻女性，调性：清新自然' },
                  { title: '美式幽默吸血鬼故事', desc: '世界观/信仰观/价值观/人物升级结构/玄幻喜剧/真人实拍/5分钟' },
                ].map((ex, i) => (
                  <div key={i} onClick={() => { setCommInputText(ex.title + '\uff1a' + ex.desc); setTimeout(() => handleCommSend(ex.title + '\uff1a' + ex.desc), 100); }}
                    style={{ padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, transition: 'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{ex.title}</div>
                    <div>{ex.desc}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            ideaMessages.map((msg, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, maxWidth: '85%', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}><BotIcon size={14} /></div>
                )}
                <div
                  onContextMenu={(e) => handleContextMenu(e, 'message', msg)}
                  style={{ padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '4px 14px 14px 14px', background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--bg-secondary)', color: msg.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'context-menu' }}
                >
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><UserIcon size={14} /></div>
                )}
              </div>
            ))
          )}
          {/* AI 正在输入指示器 */}
          {isSending && (
              <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff' }}><BotIcon size={14} /></div>
              <div style={{ padding: '10px 14px', borderRadius: '4px 14px 14px 14px', background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>正在思考...</div>
            </div>
          )}

        </div>

        {/* 底部输入区 */}
        <div className="chat-input-area">
          <div className="input-wrapper" style={{ width: '100%', maxWidth: 'none', margin: 0, boxSizing: 'border-box' }}>
            <textarea
              value={commInputText}
              onChange={e => setCommInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommSend(commInputText);
                }
              }}
              placeholder="输入消息，Shift+Enter 换行..."
              className="chat-textarea"
              rows={3}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 300) + 'px';
              }}
            />

            <div className="input-actions">
              <div className="left-controls">
                <select
                  value={selectedConfigId || ''}
                  onChange={e => setSelectedConfigId(e.target.value)}
                  className="control-select"
                >
                  <option value="">选择接口</option>
                  {allAvailableConfigs.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select
                  value={selectedModel || ''}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="control-select"
                >
                  <option value="">选择模型</option>
                  {(currentModelOptions || []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button
                className="send-button"
                onClick={() => handleCommSend(commInputText)}
                disabled={isSending || !commInputText.trim()}
              >
                {isSending ? '发送中...' : '发送 ▶'}
              </button>

              <button
                onClick={handleGoToWorkClick}
                disabled={!ideaMessages.some(m => m.role === 'assistant')}
                style={{ padding: '12px 24px', background: ideaMessages.some(m => m.role === 'assistant') ? 'var(--accent-color)' : 'var(--border-light)', color: ideaMessages.some(m => m.role === 'assistant') ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: ideaMessages.some(m => m.role === 'assistant') ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RocketIcon size={16} /> 去创作
              </button>
            </div>
          </div>
        </div>

        {/* 集数输入弹窗 */}
        {showEpisodeModal && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: 'var(--bg-primary)', borderRadius: 16, padding: '28px 32px',
              minWidth: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
              border: '1px solid var(--border-color)',
            }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, textAlign: 'center' }}>
                <ClapperboardIcon size={18} /> 设定集数
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  请问要创作几集？
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={episodeCountInput}
                  onChange={e => setEpisodeCountInput(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  onKeyDown={e => e.key === 'Enter' && handleConfirmGoToWork()}
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 14px', fontSize: 16,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: 10, color: 'var(--text-primary)', outline: 'none', textAlign: 'center',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {episodeCountInput === 1 ? '单集创作，无需分集' : `将创建 ${episodeCountInput} 个分集`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowEpisodeModal(false)}
                  style={{ flex: 1, padding: '9px 0', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}
                >取消</button>
                <button
                  onClick={handleConfirmGoToWork}
                  style={{ flex: 1, padding: '9px 0', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >确定，开始创作</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---- 工作台页 ----
  // 右键菜单
  const contextMenuElement = contextMenu ? (
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={contextMenu.items}
      onClose={contextMenu.onClose}
    />
  ) : null;

  // 复制成功提示
  const copyToastElement = copyToast ? (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '10px 20px',
      background: 'var(--accent-color)',
      color: '#fff',
      borderRadius: '8px',
      fontSize: '14px',
      zIndex: 10000,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }}>
      {copyToast}
    </div>
  ) : null;

  // 存入提示词库弹窗
  const saveModalElement = (
    <SaveToPromptLibraryModal
      isOpen={saveToPromptModal.isOpen}
      defaultPrompt={saveToPromptModal.prompt}
      defaultName={saveToPromptModal.name}
      thumbnail={saveToPromptModal.thumbnail}
      sourceType={saveToPromptModal.sourceType}
      onClose={() => setSaveToPromptModal(prev => ({ ...prev, isOpen: false }))}
    />
  );

  if (pageState === 2) {
    const currentStep = STEPS[stepIndex];
    const isCurrentStepGenerating = stepIsGenerating[currentStep?.key];
    const episodeStepContent = currentEpisode?.stepContents?.[currentStep?.key];
    const currentStepContent = episodeStepContent?.content || '';
    const directorStatus = episodeStepContent?.directorStatus || 'pending';
    const directorReview = episodeStepContent?.directorReview || '';
    const reviewChats = currentStepChat;

    // 审核状态颜色
    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'var(--text-muted)', text: '#fff', label: '未提交' },
      review: { bg: 'var(--warning-color)', text: '#fff', label: '审核中' },
      revision: { bg: 'var(--warning-color)', text: '#fff', label: '审核中' },
      approved: { bg: 'var(--accent-color)', text: '#fff', label: '已通过' },
    };
    const statusColor = statusColors[directorStatus] || statusColors.pending;

    return (
      <div className="drama-page" style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>

        {/* 顶部栏：分集标签 + 步骤标签 + 保存关闭 */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* 分集标签行 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'auto', maxWidth: '70%' }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}><TvIcon size={14} /> 分集:</span>
              {episodes.map((ep, i) => {
                const epStatus = ep.status;
                const epStatusColor = { draft: 'var(--text-muted)', in_progress: 'var(--accent-color)', review: 'var(--warning-color)', approved: 'var(--accent-color)', published: 'var(--accent-color)' }[epStatus] || 'var(--text-muted)';
                return (
                  <button
                    key={ep.id}
                    onClick={() => { setCurrentEpisodeIndex(i); setStepIndex(ep.stepIndex || 0); }}
                    style={{
                      padding: '4px 12px', borderRadius: 12, fontSize: 12,
                      background: currentEpisodeIndex === i ? epStatusColor : 'transparent',
                      color: currentEpisodeIndex === i ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${currentEpisodeIndex === i ? epStatusColor : 'var(--border-color)'}`,
                      cursor: 'pointer', fontWeight: currentEpisodeIndex === i ? 600 : 400,
                      transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
                    }}
                  >
                    {ep.title}
                  </button>
                );
              })}
              <button
                onClick={() => handleAddEpisode()}
                title="新增分集"
                style={{ padding: '4px 10px', borderRadius: 12, fontSize: 12, background: 'transparent', color: 'var(--text-muted)', border: '1px dashed var(--border-color)', cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                ＋ 新增分集
              </button>
            </div>
            <button onClick={handleSaveAndClose} style={{ padding: '5px 14px', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 8, cursor: 'pointer', fontSize: 12, transition: 'all 0.2s', flexShrink: 0 }}>
              ← 保存并关闭
            </button>
          </div>

          {/* 步骤标签行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'auto' }}>
            {STEPS.map((step, idx) => {
              const epStep = currentEpisode?.stepContents?.[step.key];
              const hasContent = Boolean(epStep?.content);
              const isCurrent = stepIndex === idx;
              const stepStatusColor = { pending: 'var(--border-color)', approved: 'var(--accent-color)', revision: 'var(--warning-color)' }[epStep?.directorStatus] || 'var(--border-color)';
              return (
                <button
                  key={step.key}
                  onClick={() => { 
                    setStepIndex(idx); 
                    updateEpisode(currentEpisodeIndex, { stepIndex: idx }); 
                    // 如果该步骤没有内容且不在生成中，则自动触发创作
                    if (!hasContent) {
                      setTimeout(() => {
                        handleStepGenerate(idx);
                      }, 100);
                    }
                  }}
                  style={{
                    padding: '6px 16px', borderRadius: 16, fontSize: 12,
                    background: isCurrent ? 'var(--accent-color)' : 'transparent',
                    color: isCurrent ? '#fff' : 'var(--text-secondary)',
                    border: isCurrent ? 'none' : `1px solid ${stepStatusColor}`,
                    cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap', flexShrink: 0,
                    fontWeight: isCurrent ? 600 : 400,
                  }}
                >
                  {step.icon} {step.label}
                  {hasContent && <span style={{ marginLeft: 4, fontSize: 10 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* 主体：左内容区 + 右导演审核区 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* 左栏：创作内容区 */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column' }}>
            {/* 步骤说明 */}
            {currentStep && (
              <div style={{ marginBottom: 20, flexShrink: 0 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  {currentStep.icon} {currentStep.label}
                  <span style={{ marginLeft: 10, fontSize: 12, padding: '2px 10px', borderRadius: 10, background: statusColor.bg, color: statusColor.text, fontWeight: 500 }}>
                    {statusColor.label}
                  </span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {stepIndex === 0 && '确定影片主题、风格、情绪基调'}
                  {stepIndex === 1 && '完善故事大纲、人物设定与叙事结构'}
                  {stepIndex === 2 && '撰写或完善剧本，输出标准剧本格式'}
                  {stepIndex === 3 && '设计分镜，包括镜头编号、景别、构图描述'}
                  {stepIndex === 4 && '提取人物（含不同季节/年龄/服装变体，参考首图保持一致）、场景、道具等视觉资产'}
                  {stepIndex === 5 && '生成资产提示词（文生图）与分镜文生视频提示词'}
                </div>
              </div>
            )}

            {/* 创作内容区 */}
            <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-secondary)', borderRadius: 12, padding: 24, position: 'relative' }}>
              {/* 无内容且不在生成中 - 显示等待 */}
              {!currentStepContent && !isCurrentStepGenerating ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.2 }}>{currentStep?.icon || <ClapperboardIcon size={48} />}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>等待生成 {currentStep?.label}</div>
                  <div style={{ fontSize: 13, marginTop: 8 }}>点击下方「创作」按钮开始，或点击「提交审核」</div>
                </div>
              ) : /* 无内容但在生成中 - 显示创作中 */ (!currentStepContent && isCurrentStepGenerating) ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
                    <span className="loading-dots"><ClapperboardIcon size={14} /> AI正在创作中...</span>
                  </div>
                </div>
              ) : /* 有内容 - 始终显示内容（审核状态在右侧显示） */ (
                <>
                  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleSendToCanvas(currentStep.key, currentStepContent, currentStep.label)}
                      title="发送到画布"
                      style={{ padding: '6px 12px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <RulerIcon size={14} /> 发送到画布
                    </button>
                    <button
                      onClick={() => {
                        const name = prompt('保存到提示词库:', `${currentEpisode?.title || ''}_${currentStep?.label}`);
                        if (name) {
                          try {
                            addPromptItem({ name, prompt: currentStepContent, tags: [currentStep?.label || ''], type: 'text' });
                            showToast('已保存到提示词库', 'success');
                          } catch (e) { showToast('保存失败', 'error'); }
                        }
                      }}
                      title="保存到提示词库"
                      style={{ padding: '6px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <LightbulbIcon size={14} /> 保存提示词
                    </button>
                  </div>
                  <SafeMarkdown content={currentStepContent} />
                </>
              )}
            </div>
          </div>

          {/* 右栏：导演审核区 ~340px */}
          <div style={{ width: 340, borderLeft: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
            {/* 标题 + 审核状态 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DirectorIcon size={16} /> 导演审核
                </div>
                <span style={{ padding: '2px 10px', borderRadius: 10, background: statusColor.bg, color: statusColor.text, fontSize: 11, fontWeight: 600 }}>
                  {statusColor.label}
                </span>
              </div>
              {/* 审核意见摘要 */}
              {directorReview && directorStatus !== 'pending' && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '8px 10px', borderRadius: 8, maxHeight: 80, overflow: 'auto', lineHeight: 1.5 }}>
                  {directorReview.slice(0, 200)}{directorReview.length > 200 ? '...' : ''}
                </div>
              )}
            </div>

            {/* 对话消息区 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '12px 14px' }}>
              {reviewChats.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: 13 }}>
                  点击下方「提交审核」<br />开始导演审核流程
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(() => {
                    const seen = new Set<string>();
                    return reviewChats.filter(msg => { if (seen.has(msg.id)) return false; seen.add(msg.id); return true; });
                  })().map(msg => (
                    <div key={msg.id} style={{ display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                        {msg.role === 'user' ? <UserIcon size={12} /> : <ClapperboardIcon size={12} />}
                      </div>
                      <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px', background: msg.role === 'user' ? 'var(--accent-color)' : 'var(--bg-tertiary)', color: msg.role === 'user' ? '#fff' : 'var(--text-primary)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {/* 导演审核中提示 - 在审核状态且正在生成时显示 */}
                  {(isDirectorGenerating || (directorStatus === 'review' && isCurrentStepGenerating)) && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}><ClapperboardIcon size={12} /></div>
                      <div style={{ padding: '8px 14px', borderRadius: 12, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', fontSize: 12 }}>导演审核中...</div>
                    </div>
                  )}
                  <div ref={stepChatEndRef} />
                </div>
              )}
            </div>

            {/* 接口选择（精简版） */}
            <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', gap: 6 }}>
              <select value={selectedConfigId} onChange={e => setSelectedConfigId(e.target.value)} style={{ flex: 1, padding: '4px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                <option value="">接口▼</option>
                {allAvailableConfigs.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
              <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} style={{ flex: 1, padding: '4px 8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 6, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
                <option value="">{selectedConfig ? '模型▼' : '请选接口'}</option>
                {currentModelOptions.map(m => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>

{/* 审核操作区 */}
<div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
{/* 修改意见输入框 - 所有步骤都显示 */}
<div style={{ marginBottom: 10 }}>
<textarea
value={directorReviewInput}
onChange={e => setDirectorReviewInput(e.target.value)}
onKeyDown={e => {
if (e.key === 'Enter' && !e.shiftKey) {
e.preventDefault();
handleDirectorRevision();
}
}}
placeholder="输入修改意见，按 Enter 发送，Shift+Enter 换行..."
style={{
width: '100%',
minHeight: 60,
padding: '8px 10px',
background: 'var(--bg-primary)',
color: 'var(--text-primary)',
border: '1px solid var(--border-color)',
borderRadius: 8,
fontSize: 12,
resize: 'vertical',
outline: 'none',
}}
/>
</div>

{/* 发送修改意见按钮 */}
<div style={{ marginBottom: 10 }}>
<button
onClick={() => handleDirectorRevision()}
disabled={!directorReviewInput.trim() || isSending}
style={{
width: '100%',
padding: '8px 0',
background: directorReviewInput.trim() && !isSending ? 'var(--accent-color)' : 'var(--bg-tertiary)',
color: directorReviewInput.trim() && !isSending ? '#fff' : 'var(--text-muted)',
border: 'none',
borderRadius: 8,
fontSize: 13,
fontWeight: 500,
cursor: directorReviewInput.trim() ? 'pointer' : 'not-allowed',
display: 'flex',
alignItems: 'center',
justifyContent: 'center',
gap: 4,
}}
>
{isRevising ? '正在修改...' : <><SendIcon size={14} /> 发送修改意见</>}
</button>
</div>

{/* 审核操作按钮 */}
<div style={{ display: 'flex', gap: 6 }}>
{/* 未生成内容时：生成内容 */}
{directorStatus === 'pending' && !currentStepContent && (
<button
onClick={() => handleStepGenerate()}
disabled={isCurrentStepGenerating}
style={{ flex: 1, padding: '7px 0', background: isCurrentStepGenerating ? 'var(--bg-tertiary)' : 'var(--accent-color)', color: isCurrentStepGenerating ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: isCurrentStepGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
>
{isCurrentStepGenerating ? '创作中...' : <><ClapperboardIcon size={12} /> 开始创作</>}
</button>
)}
{/* 有内容但未审核：提交导演审核 */}
{directorStatus === 'pending' && currentStepContent && (
<button
onClick={() => handleDirectorReview()}
disabled={isCurrentStepGenerating}
style={{ flex: 1, padding: '7px 0', background: isCurrentStepGenerating ? 'var(--bg-tertiary)' : 'var(--accent-color)', color: isCurrentStepGenerating ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: isCurrentStepGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
>
{isCurrentStepGenerating ? '审核中...' : <><CheckIcon size={12} /> 提交导演审核</>}
</button>
)}
{/* 审核中状态：显示通过审核按钮 */}
{directorStatus === 'review' && (
<button
onClick={() => {
const currentStepKey = STEPS[stepIndex].key;
const currentContent = episodes[currentEpisodeIndex]?.stepContents?.[currentStepKey] || DEFAULT_STEP_CONTENT();
updateEpisode(currentEpisodeIndex, {
stepContents: {
...episodes[currentEpisodeIndex].stepContents,
[currentStepKey]: {
...currentContent,
directorStatus: 'approved',
lastUpdated: Date.now(),
},
},
});
showToast('审核已通过，可以进入下一步', 'success');
}}
style={{ flex: 1, padding: '7px 0', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
>
<><CheckIcon size={12} /> 通过审核</>
</button>
)}
{/* 已通过状态：重新生成 */}
{directorStatus === 'approved' && (
<button
onClick={() => handleStepGenerate()}
disabled={isCurrentStepGenerating}
style={{ flex: 1, padding: '7px 0', background: isCurrentStepGenerating ? 'var(--bg-tertiary)' : 'var(--accent-color)', color: isCurrentStepGenerating ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: isCurrentStepGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
>
{isCurrentStepGenerating ? '创作中...' : <><RefreshIcon size={12} /> 重新生成</>}
</button>
)}
</div>

</div>
</div>
</div>
        {/* 底部导航 */}
        <div style={{ padding: '10px 24px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-secondary)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={() => { setStepIndex(Math.max(0, stepIndex - 1)); updateEpisode(currentEpisodeIndex, { stepIndex: Math.max(0, stepIndex - 1) }); }}
            disabled={stepIndex === 0}
            style={{ padding: '7px 20px', background: stepIndex === 0 ? 'var(--bg-tertiary)' : 'transparent', color: stepIndex === 0 ? 'var(--text-muted)' : 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 13, cursor: stepIndex === 0 ? 'default' : 'pointer', transition: 'all 0.2s' }}
          >
            ← 上一步
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            正片 · {currentStep?.label} · {currentEpisode?.title}
          </div>
          {stepIndex === STEPS.length - 1 ? (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleSubmitToCanvas} style={{ padding: '7px 20px', background: 'var(--accent-color)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(59,130,246,0.3)', whiteSpace: 'nowrap' }}>提交到画布创作 🎬</button>
            </div>
          ) : (
            <button
              onClick={async () => {
                if (directorStatus !== 'approved') {
                  showToast('请先通过导演审核后再进入下一步', 'warning');
                  return;
                }
                // 剧本写作步骤完成后，弹出提交方式选择
                if (stepIndex === 2) {
                  setShowSubmitChoiceModal(true);
                  return;
                }
                const ni = stepIndex + 1;
                setStepIndex(ni);
                updateEpisode(currentEpisodeIndex, { stepIndex: ni });
                setTimeout(async () => { await handleStepGenerate(ni); }, 200);
              }}
              disabled={false}
              style={{ padding: '7px 20px', background: directorStatus === 'approved' ? 'var(--accent-color)' : 'var(--bg-tertiary)', color: directorStatus === 'approved' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', boxShadow: directorStatus === 'approved' ? '0 4px 12px rgba(59,130,246,0.3)' : 'none' }}
            >
              {directorStatus === 'approved' ? '下一步 →' : '需审核通过'}
            </button>
          )}
        </div>

        {/* 右键菜单 / 复制提示 / 保存弹窗 / 剧本提交方式选择弹窗 */}
        {contextMenuElement}
        {copyToastElement}
        {saveModalElement}
{showSubmitChoiceModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }} onClick={() => setShowSubmitChoiceModal(false)}>
          <div style={{
            background: 'var(--bg-primary)', borderRadius: 20, padding: '32px 36px',
            width: 560, maxWidth: '90vw', boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
            border: '1px solid var(--border-color)',
          }} onClick={e => e.stopPropagation()}>
            {/* 头部 */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: '0 8px 24px rgba(59,130,246,0.3)' }}>
                <ClapperboardIcon size={28} />
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>剧本创作完成</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>剧本已通过导演审核，请选择后续创作方式</div>
            </div>

            {/* 选项卡片 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              {/* 选项1：提交到剧创工场 */}
              <button
                onClick={() => { setShowSubmitChoiceModal(false); handleSubmitToDramart(); }}
                style={{
                  padding: '20px 18px', background: 'var(--bg-secondary)',
                  border: '2px solid var(--border-color)', borderRadius: 14,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <VideoIcon size={20} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>剧创工场生成</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  自动提取角色、场景、道具，AI生成分镜与提示词，一键生成视频
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-color)', fontWeight: 600, marginTop: 'auto' }}>
                  <RocketIcon size={12} /> 推荐 · 全自动流程
                </div>
              </button>

              {/* 选项2：继续下一步到无限画布 */}
              <button
                onClick={() => {
                  setShowSubmitChoiceModal(false);
                  const ni = stepIndex + 1;
                  setStepIndex(ni);
                  updateEpisode(currentEpisodeIndex, { stepIndex: ni });
                  setTimeout(async () => { await handleStepGenerate(ni); }, 200);
                }}
                style={{
                  padding: '20px 18px', background: 'var(--bg-secondary)',
                  border: '2px solid var(--border-color)', borderRadius: 14,
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-color)'; e.currentTarget.style.background = 'var(--bg-tertiary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, var(--accent-color), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <RulerIcon size={20} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>继续分步创作</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  继续分镜设计、视觉资产、提示词生成步骤，完成后提交到无限画布
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500, marginTop: 'auto' }}>
                  <ListCheckIcon size={12} /> 精细控制 · 6步流程
                </div>
              </button>
            </div>

            {/* 底部取消按钮 */}
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setShowSubmitChoiceModal(false)}
                style={{ padding: '8px 28px', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: 10, fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-color)'; }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
  }


};

export default DramaPage;


