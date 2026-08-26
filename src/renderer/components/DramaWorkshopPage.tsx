import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import {
  ClapperboardIcon,
  PlusIcon,
  CheckIcon,
  CloseIcon,
  SearchIcon,
  FileTextIcon,
  ChevronLeftIcon,
  RefreshIcon,
  BoltIcon,
  ImageIcon,
  VideoIcon,
  PlayIcon,
  EditIcon,
  SaveIcon,
  DownloadIcon,
  TrashIcon,
  AssetsIcon,
  UploadIcon,
  StarIcon,
  MicrophoneIcon,
} from './Icons';
import {
  DRAMART_STYLES,
  DRAMART_RATIOS,
  DRAMART_RESOLUTIONS,
  DRAMART_ANALYSIS_STEPS,
  runDramartAnalysis,
  runDramaDraftAnalysis,
  runSupplementAnalysis,
  stylePromptOf,
  makeVideoPrompt,
  type DramartProject,
  type DramartStyle,
  type DramartCategory,
  type AIConfigInput,
  type DramartAssetItem,
  type DramartStoryboard,
} from '../services/dramartWorkflow';
import JSZip from 'jszip';
import toolService from '../services/toolService';
import './DramaWorkshopPage.css';

type Stage = 'create' | 'analyze' | 'script' | 'sets' | 'storyboard' | 'video';
type VideoStatus = 'idle' | 'generating' | 'done' | 'error';
type Tab = 'character' | 'scene' | 'prop';
type StyleTab = 'all' | DramartCategory;

const MAX_SCRIPT_SIZE = 20 * 1024 * 1024; // 20M
const ACCEPT_EXT = ['doc', 'docx', 'txt', 'pdf', 'md'];
const TEXT_EXTS = ['txt', 'md'];

const CATEGORY_LABEL: Record<DramartCategory | 'all', string> = {
  all: '全部',
  real: '真人',
  '3d': '3D',
  '2d': '2D',
  custom: '自定义',
};

const TAB_LABEL: Record<Tab, string> = { character: '角色', scene: '场景', prop: '道具' };
const TAB_STAT_KEY: Record<Tab, (p: DramartProject) => DramartAssetItem[]> = {
  character: p => p.characters,
  scene: p => p.scenes,
  prop: p => p.props,
};

// 各分析步骤的滚动提示（每步轮播，避免客户误以为卡顿）
const STEP_HINTS: Record<string, string[]> = {
  '分析剧本': ['正在读取剧本内容…', '正在理解剧情脉络…', '正在识别关键人物与事件…'],
  '分镜设计': ['正在划分镜头…', '正在确定镜头节奏与时长…'],
  '提取资产': ['正在识别角色、场景、道具…', '正在归类场景与道具…'],
  '生成提示词': ['正在生成分镜提示词…', '正在完善画面描写与风格…'],
  '生成资产图': ['正在生成资产参考图…'],
};

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}

function isTextFile(name: string): boolean { return TEXT_EXTS.includes(extOf(name)); }

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// docx 文本提取：docx 本质是 zip，读取 word/document.xml，按段落取 <w:t> 文本并解码实体
function decodeXml(s: string): string {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'");
}

async function readDocxAsText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buf);
  const entry = zip.file('word/document.xml');
  if (!entry) return '';
  const xml = await entry.async('string');
  const paras: string[] = [];
  const pRe = /<w:p\b[\s\S]*?<\/w:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(xml))) {
    const block = pm[0];
    let line = '';
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(block))) line += tm[1];
    line = decodeXml(line.replace(/\s+/g, ' ').trim());
    paras.push(line);
  }
  return paras.join('\n').trim();
}

// 读取剧本文件文本：txt/md 直接读，docx 解压读取，doc/pdf 无法直接提取则返回空串
async function readScriptText(file: File): Promise<string> {
  const ext = extOf(file.name);
  if (TEXT_EXTS.includes(ext)) {
    try { return await readFileAsText(file); } catch { return ''; }
  }
  if (ext === 'docx') {
    try { return await readDocxAsText(file); } catch { return ''; }
  }
  return '';
}

// 比例图标的尺寸随所选比例真实呈现（16:9 横、9:16 竖、21:9 更宽）
function ratioIconStyle(ratio: string): React.CSSProperties {
  const parts = String(ratio || '16:9').split(':').map(Number);
  const wn = parts[0] || 16, hn = parts[1] || 9;
  let h = 14; let w = (h * wn) / hn;
  const cap = 22;
  if (w > cap) { w = cap; h = (w * hn) / wn; }
  return { width: Math.round(Math.max(7, w)), height: Math.round(Math.max(7, h)) };
}

// 为资产卡片生成占位缩略图的渐变样式

// 生成渐变占位图（dataURL，无图像 API 时也保证资产有图）
function gradientDataUrl(seed: string): string {
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="320"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},45%,38%)"/><stop offset="1" stop-color="hsl(${h2},50%,20%)"/></linearGradient></defs><rect width="256" height="320" fill="url(#g)"/><circle cx="128" cy="150" r="42" fill="hsl(${h},40%,60%)" opacity="0.85"/><rect x="70" y="220" width="116" height="60" rx="12" fill="hsl(${h2},35%,45%)" opacity="0.7"/></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function thumbStyle(hue: number, kind: string): React.CSSProperties {
  const h = hue % 360;
  return { background: `linear-gradient(160deg, hsl(${h} 45% 30%), hsl(${(h + 40) % 360} 50% 18%))` };
}

// 比例 + 分辨率 -> 图片像素尺寸（用于生成 API 的 size 参数）
// 该资产类型的"主形象/变装"术语
function kindTerm(kind: string): { main: string; variant: string; add: string } {
  if (kind === 'scene') return { main: '主场景', variant: '衍生场景', add: '添加衍生场景' };
  if (kind === 'prop') return { main: '主道具', variant: '衍生道具', add: '添加衍生道具' };
  return { main: '主角色', variant: '变装', add: '添加变装' };
}

function genSize(ratio: string, resolution: string): string {
  const base: Record<string, [number, number]> = {
    '1:1': [1024, 1024],
    '16:9': [1536, 864],
    '4:3': [1365, 1024],
    '3:2': [1536, 1024],
    '2:3': [1024, 1536],
    '3:4': [1024, 1365],
  };
  const k = String(resolution || '1k') === '2k' ? 2 : 1;
  const [w, h] = base[ratio] || base['16:9'];
  return (w * k) + 'x' + (h * k);
}

// ==================== 风格库弹出层 ====================
interface StyleLibraryProps {
  selectedId: string;
  onSelect: (style: DramartStyle) => void;
  onClose: () => void;
  onCustomCreate: () => void;
  onCustomDelete: (id: string) => void;
}

const StyleLibrary: React.FC<StyleLibraryProps> = ({ selectedId, onSelect, onClose, onCustomCreate, onCustomDelete }) => {
  const [tab, setTab] = useState<StyleTab>('all');
  const [q, setQ] = useState('');
  const dramartCustomStyles = useAppStore(s => s.dramartCustomStyles);

  // 按 Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  // 内置风格 + 用户自定义风格（自定义排在最前，可直接选用）
  const allStyles = useMemo(() => [...(dramartCustomStyles || []), ...DRAMART_STYLES], [dramartCustomStyles]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: allStyles.length, real: 0, '3d': 0, '2d': 0, custom: dramartCustomStyles?.length || 0 };
    DRAMART_STYLES.forEach(s => { c[s.category] += 1; });
    return c;
  }, [allStyles, dramartCustomStyles]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return allStyles.filter(s => (tab === 'all' ? true : s.category === tab) && (!qq || s.name.toLowerCase().includes(qq) || s.desc.toLowerCase().includes(qq)));
  }, [allStyles, tab, q]);

  const showCreateCard = tab === 'all' || tab === 'custom';

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-style-panel" onClick={e => e.stopPropagation()}>
        <div className="dwc-style-panel-head">
          <div className="dwc-style-panel-title">风格库</div>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-style-toolbar">
          <div className="dwc-style-tabs">
            {(['all', 'real', '3d', '2d', 'custom'] as StyleTab[]).map(t => (
              <button key={t} className={`dwc-style-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {CATEGORY_LABEL[t]} <span className="dwc-style-tab-count">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="dwc-style-search">
            <SearchIcon size={14} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索" />
          </div>
        </div>
        <div className="dwc-style-grid">
          {showCreateCard && (
            <button className="dwc-style-card custom" onClick={onCustomCreate}>
              <div className="dwc-style-thumb custom"><span className="dwc-style-plus"><PlusIcon size={24} /></span><span className="dwc-style-name">创建我的专属风格</span></div>
            </button>
          )}
          {filtered.map(s => (
            <button key={s.id} className={`dwc-style-card${s.id === selectedId ? ' active' : ''}`} onClick={() => onSelect(s)}>
              <div className="dwc-style-thumb" style={s.img ? undefined : thumbStyle(hashHue(s.name), 'scene')}>
                {s.img && <img src={s.img} alt={s.name} className="dwc-style-img" />}
                <span className="dwc-style-name">{s.name}</span>
                {s.id === selectedId && <span className="dwc-style-check"><CheckIcon size={14} /></span>}
                {s.category === 'custom' && <span className="dwc-style-del" onClick={e => { e.stopPropagation(); onCustomDelete(s.id); }} title="删除"><TrashIcon size={13} /></span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// ==================== 创建我的专属风格弹窗 ====================
const CUSTOM_STYLE_MAX_NAME = 12;
const CUSTOM_STYLE_MAX_PROMPT = 500;

interface CustomStyleModalProps {
  onSave: (style: DramartStyle) => void;
  onClose: () => void;
}

const CustomStyleModal: React.FC<CustomStyleModalProps> = ({ onSave, onClose }) => {
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [img, setImg] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickImage = useCallback((file: File | null) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) { alert('仅支持图片格式'); return; }
    const r = new FileReader();
    r.onload = () => setImg(String(r.result || ''));
    r.readAsDataURL(file);
  }, []);

  const nameLen = name.trim().length;
  const promptLen = prompt.trim().length;
  const nameOk = nameLen >= 2 && nameLen <= CUSTOM_STYLE_MAX_NAME;
  const promptOk = promptLen > 0 && promptLen <= CUSTOM_STYLE_MAX_PROMPT;
  const canSave = nameOk && promptOk;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: 'cs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
      name: name.trim(),
      category: 'custom',
      desc: name.trim(),
      stylePrompt: prompt.trim(),
      img: img || undefined,
    });
  };

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-custom-style-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">创建你的专属风格</span>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-modal-body">
          <div className="dwc-custom-style-layout">
            <div className="dwc-custom-style-left">
              <div className="dwc-custom-style-label">示例图</div>
              <div
                className={`dwc-custom-style-img${img ? ' has' : ''}${dragging ? ' dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); pickImage(e.dataTransfer.files?.[0] || null); }}
              >
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={e => { pickImage(e.target.files?.[0] || null); e.target.value = ''; }} />
                {img ? <img src={img} alt="示例" /> : <><PlusIcon size={26} /><span className="dwc-custom-style-img-tip">点击或拖拽上传示例图</span></>}
              </div>
            </div>
            <div className="dwc-custom-style-right">
              <div className="dwc-custom-style-label">风格名称 <span className="dwc-custom-style-count">{name.length}/{CUSTOM_STYLE_MAX_NAME}</span></div>
              <input className="dwc-custom-style-input" value={name} maxLength={CUSTOM_STYLE_MAX_NAME} placeholder="如90年代港片、赛博水墨等，2-12字" onChange={e => setName(e.target.value)} />
              <div className="dwc-custom-style-label">风格提示词</div>
              <div className="dwc-custom-style-prompt-wrap">
                <textarea className="dwc-custom-style-textarea" value={prompt} maxLength={CUSTOM_STYLE_MAX_PROMPT} placeholder="描述你想要的视觉效果、色彩、光影和画面质感" onChange={e => setPrompt(e.target.value)} rows={6} />
                <span className="dwc-custom-style-count ta">{prompt.length}/{CUSTOM_STYLE_MAX_PROMPT}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" disabled={!canSave} onClick={save}>保存</button>
        </div>
      </div>
    </div>
  );
};


// ==================== 通用下拉 ====================
interface DropdownOption { id: string; label: string; }
interface SimpleDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
  icon?: React.ReactNode;
  title?: string;
  renderItemFrame?: (id: string) => React.ReactNode;
}

const SimpleDropdown: React.FC<SimpleDropdownProps> = ({ value, options, onChange, icon, title, renderItemFrame }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);
  const current = options.find(o => o.id === value);
  return (
    <div className="dwc-select" ref={ref}>
      <button className="dwc-select-trigger" onClick={() => setOpen(o => !o)}>
        {icon && <span className="dwc-select-icon">{icon}</span>}
        <span>{current?.label || value}</span>
        <span className="dwc-select-chev">▾</span>
      </button>
      {open && (
        <div className="dwc-menu">
          {title && <div className="dwc-menu-title">{title}</div>}
          {options.map(o => (
            <button key={o.id} className={`dwc-menu-item${o.id === value ? ' active' : ''}`} onClick={() => { onChange(o.id); setOpen(false); }}>
              {renderItemFrame ? renderItemFrame(o.id) : null}
              {o.label}
              {o.id === value && <CheckIcon size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};


// ==================== 分镜页 ====================
interface StoryboardViewProps {
  project: DramartProject;
  storyboards: DramartStoryboard[];
  index: number;
  statusMap: Record<string, VideoStatus>;
  urlMap: Record<string, string>;
  onSelectIndex: (i: number) => void;
  onBack: () => void;
  onGenerate: (id: string, params?: { model?: string; duration?: number; count?: number; resolution?: string; format?: string }) => void;
  onNext: () => void;
  onGo: (s: Stage) => void;
  onEditPrompt: (id: string, text: string) => void;
  onSelectVideo: (id: string, url: string) => void;
  onAddAsset: (id: string, kind: 'character' | 'scene' | 'prop', name: string) => void;
}

const StoryboardView: React.FC<StoryboardViewProps> = ({ project, storyboards, index, statusMap, urlMap, onSelectIndex, onBack, onGenerate, onNext, onGo, onEditPrompt, onSelectVideo, onAddAsset }) => {
  const [scriptOpen, setScriptOpen] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [addKind, setAddKind] = useState<'character' | 'scene' | 'prop' | null>(null);
  const [promptEdit, setPromptEdit] = useState(false);
  const [previewAsset, setPreviewAsset] = useState<DramartAssetItem | null>(null);
  const [editDur, setEditDur] = useState<{ raw: string } | null>(null);
  const [editLine, setEditLine] = useState<{ raw: string } | null>(null);
  const [refPickOpen, setRefPickOpen] = useState(false);
  const [voiceReplace, setVoiceReplace] = useState<string | null>(null);
  const replaceInPrompt = (from: string, to: string) => { if (sb) onEditPrompt(sb.id, (sb.videoPrompt || '').split(from).join(to)); };
  const insertRef = () => {
    const sel = window.getSelection();
    const dom = promptRef.current;
    if (sel && sel.rangeCount && dom) promptRange.current = sel.getRangeAt(0).cloneRange();
    setRefPickOpen(true);
  };
  const insertRefToken = (token: string) => {
    const dom = promptRef.current;
    if (!dom) return;
    dom.focus();
    const range = promptRange.current;
    if (range) { const sel = window.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(range); } }
    if (document.queryCommandSupported('insertText')) document.execCommand('insertText', false, token);
    if (sb) { const t = dom.innerText; onEditPrompt(sb.id, t); }
  };
  const saveCaretOffset = (): number => {
    const dom = promptRef.current; const sel = window.getSelection();
    if (!dom || !sel || !sel.rangeCount) return -1;
    const range = sel.getRangeAt(0);
    const pre = document.createRange(); pre.selectNodeContents(dom); pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  };
  const restoreCaretOffset = (offset: number) => {
    const dom = promptRef.current; if (!dom || offset < 0) return;
    dom.focus();
    const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT);
    let cur = 0; let node: Node | null; const target = document.createRange(); let found = false;
    while ((node = walker.nextNode())) {
      const len = (node.textContent || '').length;
      if (cur + len >= offset) { target.setStart(node, Math.max(0, offset - cur)); target.collapse(true); found = true; break; }
      cur += len;
    }
    if (found) { const sel = window.getSelection(); if (sel) { sel.removeAllRanges(); sel.addRange(target); } }
  };
  const onPromptInput = () => {
    const caret = saveCaretOffset();
    const t = promptRef.current?.innerText || '';
    if (sb && t !== sb.videoPrompt) onEditPrompt(sb.id, t);
    if (caret >= 0) requestAnimationFrame(() => restoreCaretOffset(caret));
  };
  const [vmodel, setVmodel] = useState('');
  const [vdur, setVdur] = useState(6);
  const [vcount, setVcount] = useState('1');
  const [vres, setVres] = useState('1080p');
  const [vfmt, setVfmt] = useState('mov');
  const videoCfg = ((useAppStore(s => s.videoAPIConfigs) as any) || []).find((c: any) => c?.apiKey && c?.baseUrl) || undefined;
  const voiceAPIConfigs = useAppStore(s => s.voiceAPIConfigs);
  const hasVoiceCfg = !!((voiceAPIConfigs as any) || []).find((c: any) => c?.apiKey && c?.baseUrl);
  const voiceCfg2 = ((voiceAPIConfigs as any) || []).find((c: any) => c?.apiKey && c?.baseUrl) || undefined;
  const voiceLibNames = ((voiceCfg2?.models as string[] | undefined) || []).filter(Boolean);
  const promptRef = useRef<HTMLDivElement>(null);
  const promptRange = useRef<Range | null>(null);
  const videoModels = ((videoCfg?.models as string[] | undefined) || []).filter(Boolean);
  const videoModelOptions = videoModels.length ? videoModels.map((m: string) => ({ id: m, label: m })) : [];
  const effectiveVmodel = vmodel || videoCfg?.defaultModel || '';
  const sb = storyboards[index];
  const findAsset = (kind: string, name: string) => {
    const list = kind === 'character' ? project.characters : kind === 'scene' ? project.scenes : project.props;
    return list.find(a => a.name === name) || list.find(a => name.includes(a.name)) || list.find(a => a.name.includes(name));
  };
  const status = sb ? (statusMap[sb.id] || 'idle') : 'idle';
  const videoUrl = sb ? (urlMap[sb.id] || sb.videoUrl || '') : '';

  return (
    <div className="dwc-sb">
      <div className="dwc-top-bar">
        <button className="dwc-back" onClick={onBack}><ChevronLeftIcon size={16} /> 返回</button>
        <div className="dwc-project-name"><span className="dwc-edit-icon"><EditIcon size={13} /></span>{project.name}</div>
        <div className="dwc-meta">
          <span className="dwc-meta-item"><span className="dwc-ratio-icon" style={ratioIconStyle(project.ratio)} /> {project.ratio}</span>
          <span className="dwc-meta-item">{project.resolution}px</span>
          <span className="dwc-meta-item">{project.styleName}</span>
        </div>
        <button className="dwc-view-script" onClick={() => setScriptOpen(true)}>查看剧本</button>
      </div>
      <div className="dwc-step-ribbon">
        {[
          { key: 'script', label: '剧本', icon: <FileTextIcon size={15} />, done: true, target: 'script' as Stage },
          { key: 'sets', label: '设定', icon: <ImageIcon size={15} />, done: true, target: 'sets' as Stage },
          { key: 'storyboard', label: '分镜', icon: <VideoIcon size={15} />, done: false, active: true },
          { key: 'video', label: '视频', icon: <PlayIcon size={15} />, done: false, target: 'video' as Stage },
        ].map(r => (
          <div key={r.key} className={`dwc-ribbon-step${r.target ? ' clickable' : ''}${r.active ? ' active' : ''}${r.done ? ' done' : ''}`} onClick={r.target ? () => onGo(r.target) : undefined} style={{ cursor: r.target ? 'pointer' : 'default' }}>
            <span className="dwc-ribbon-icon">{r.icon}</span>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      <div className="dwc-sb-body">
        {/* 左：集数列表 */}
        <div className="dwc-sb-left">
          <div className="dwc-sb-left-title">集数</div>
          <div className="dwc-sb-left-sub">分镜表</div>
          <div className="dwc-episode-list">
            {storyboards.map((s, i) => (
              <button key={s.id} className={`dwc-episode${i === index ? ' active' : ''}`} onClick={() => onSelectIndex(i)}>
                <span className="dwc-episode-num">{i + 1}</span>
                <span className="dwc-episode-name">{s.label}</span>
                <span className="dwc-episode-dur">{s.duration}s</span>
              </button>
            ))}
          </div>
        </div>
        {/* 中：分镜信息 */}
        {sb && (
          <div className="dwc-sb-info">
            <div className="dwc-sb-info-title">分镜信息</div>
            <div className="dwc-sb-field">
              <label>剧本原文</label>
              <textarea className="dwc-sb-textarea" defaultValue={sb.rawScript} rows={5} />
            </div>
            <div className="dwc-sb-field">
              <label>出镜角色</label>
              <div className="dwc-chip-row">
                {sb.characters.map(c => (
                  <div key={c} className="dwc-chip">
                    <span className="dwc-chip-avatar" style={thumbStyle(findAsset('character', c)?.hue ?? 210, 'character')}>{findAsset('character', c)?.img ? <img src={findAsset('character', c)?.img} alt="" /> : null}</span>
                    <span>{c}</span>
                  </div>
                ))}
                <button className="dwc-chip-add" onClick={() => setAddKind('character')}>+ 添加角色</button>
              </div>
            </div>
            <div className="dwc-sb-field">
              <label>分镜场景 <span className="dwc-add-inline" onClick={() => setAddKind('scene')}>+</span></label>
              <div className="dwc-scene-list">
                {sb.scenes.map(sc => {
                  const s = findAsset('scene', sc);
                  return (
                    <div key={sc} className="dwc-scene">
                      <div className="dwc-scene-thumb" style={thumbStyle(s?.hue ?? 200, 'scene')}>{s?.img ? <img src={s.img} alt="" /> : <ImageIcon size={16} />}</div>
                      <span>{sc}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="dwc-sb-field">
              <label>场景道具 <span className="dwc-add-inline" onClick={() => setAddKind('prop')}>+</span></label>
              <div className="dwc-scene-list">
                {sb.props.map(p => (
                  <div key={p} className="dwc-chip">
                    <span className="dwc-chip-avatar" style={thumbStyle(findAsset('prop', p)?.hue ?? 60, 'prop')}>{findAsset('prop', p)?.img ? <img src={findAsset('prop', p)?.img} alt="" /> : null}</span>
                    <span>{p}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* 右：分镜视频生成 */}
        <div className="dwc-sb-gen">
          <div className="dwc-sb-gen-head">
            <span className="dwc-sb-gen-title">分镜视频生成</span>
            <div className="dwc-sb-gen-right">
              <span className="dwc-sb-tool-hint">使用 @ 引用角色、场景、道具、音色、台词等参考资料，编辑更灵活，分镜更精准</span>
              <button className="dwc-sb-tool" onClick={insertRef}>@ 引用</button>
            </div>
          </div>
          <div className="dwc-sb-prompt">
            <div className="dwc-sb-rich-editable" ref={promptRef} contentEditable suppressContentEditableWarning onInput={onPromptInput} onKeyDown={(e) => { if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); insertRef(); } }}>
              {parseRichPrompt(sb ? sb.videoPrompt : '').map((seg, i) => {
                if (seg.type === 'ref') {
                  const found = findAsset('character', seg.value) || findAsset('scene', seg.value) || findAsset('prop', seg.value) || null;
                  return <span key={i} className="dwc-rich-ref" contentEditable={false} onClick={() => found ? setPreviewAsset(found) : setVoiceReplace(seg.value)}>{found?.img ? <img src={found.img} alt="" /> : <span className="dwc-rich-at">@</span>}{seg.value}</span>;
                }
                if (seg.type === 'dur') return <span key={i} className="dwc-rich-dur" contentEditable={false} onClick={() => setEditDur({ raw: seg.value })}>⏱ {seg.value}s</span>;
                if (seg.type === 'line') return <span key={i} className="dwc-rich-line" contentEditable={false} onClick={() => setEditLine({ raw: seg.value })}>{seg.value}</span>;
                return <span key={i}>{seg.value}</span>;
              })}
            </div>
          </div>
          <div className="dwc-sb-preview">
            {videoUrl ? (
              <video src={videoUrl} controls className="dwc-sb-video" />
            ) : status === 'generating' ? (
              <div className="dwc-sb-preview-placeholder generating"><span className="dwc-spinner" /> 生成中…</div>
            ) : (
              <button className="dwc-sb-preview-placeholder" onClick={() => onGenerate(sb?.id || '')}><PlayIcon size={30} /> 点击生成视频预览</button>
            )}
            {sb?.videoCandidates?.length ? (
              <div className="dwc-sb-cands">
                {sb.videoCandidates.map((u, i) => (<button key={i} className={`dwc-sb-cand${u === videoUrl ? ' active' : ''}`} onClick={() => onSelectVideo(sb.id, u)} title="切换到该视频"><video src={u} muted /></button>))}
              </div>
            ) : null}
          </div>
          <div className="dwc-sb-gen-foot">
            {videoModelOptions.length ? <SimpleDropdown value={effectiveVmodel} options={videoModelOptions} onChange={setVmodel} icon={<BoltIcon size={13} />} /> : <span className="dwc-ai-param warn">⚠ 请先设置视频模型</span>}
            <div className="dwc-sb-params-sel">
              <button className="dwc-sb-params-pill" onClick={() => setShowParams(s => !s)}>⏱ {vdur}s | {vcount}个 | {vres} | {vfmt} ▾</button>
              {showParams && (
                <div className="dwc-sb-params-panel">
                  <div className="dwc-add-field"><span className="dwc-add-label">视频时长</span><div className="dwc-dur-row"><input type="range" min={2} max={12} value={vdur} onChange={e => setVdur(parseInt(e.target.value, 10))} /><span className="dwc-dur-val">{vdur}s</span></div></div>
                  <div className="dwc-add-field"><span className="dwc-add-label">视频数量</span><div className="dwc-opt-row">{['1','2','3','4'].map(n => <button key={n} className={`dwc-opt${vcount === n ? ' active' : ''}`} onClick={() => setVcount(n)}>{n}个</button>)}</div></div>
                  <div className="dwc-add-field"><span className="dwc-add-label">视频清晰度</span><div className="dwc-opt-row">{['480p','720p','1080p'].map(n => <button key={n} className={`dwc-opt${vres === n ? ' active' : ''}`} onClick={() => setVres(n)}>{n}</button>)}</div></div>
                  <div className="dwc-add-field"><span className="dwc-add-label">视频格式</span><div className="dwc-opt-row">{['mp4','mov'].map(n => <button key={n} className={`dwc-opt${vfmt === n ? ' active' : ''}`} onClick={() => setVfmt(n)}>{n}</button>)}</div></div>
                </div>
              )}
            </div>
            <button className="dwc-sb-gen-btn" onClick={() => onGenerate(sb?.id || '', { model: effectiveVmodel, duration: vdur, count: parseInt(vcount, 10), resolution: vres, format: vfmt })} disabled={status === 'generating' || !videoModelOptions.length}>
              {status === 'generating' ? '生成中…' : <><BoltIcon size={14} /> 生成</>}
            </button>
          </div>
        </div>
      </div>
      <div className="dwc-sb-foot">
        <div className="dwc-footer">平台内容均由人工智能模型生成，不代表平台立场</div>
        <button className="dwc-bottom-btn" onClick={onNext}><ClapperboardIcon size={15} /> 进入下一步</button>
      </div>
      {addKind && sb && (
        <div className="dwc-overlay" onClick={() => setAddKind(null)}>
          <div className="dwc-modal dwc-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">选择{addKind === 'character' ? '角色' : addKind === 'scene' ? '场景' : '道具'}</span><button className="dwc-modal-close" onClick={() => setAddKind(null)}><CloseIcon size={16} /></button></div>
            <div className="dwc-modal-body">
              <div className="dwc-picker-grid">
                {(addKind === 'character' ? project.characters : addKind === 'scene' ? project.scenes : project.props).map(a => (
                  <button key={a.id} className="dwc-picker-card" onClick={() => { onAddAsset(sb.id, addKind, a.name); setAddKind(null); }}>
                    {a.img ? <img src={a.img} alt={a.name} /> : <span className="dwc-picker-ico"><ImageIcon size={20} /></span>}
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {previewAsset && (
        <div className="dwc-overlay" onClick={() => setPreviewAsset(null)}>
          <div className="dwc-modal dwc-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">{previewAsset.name}</span><button className="dwc-modal-close" onClick={() => setPreviewAsset(null)}><CloseIcon size={16} /></button></div>
            <div className="dwc-modal-body"><img src={previewAsset.img || ''} alt={previewAsset.name} style={{ width: '100%', borderRadius: 12, objectFit: 'contain' }} /></div>
          </div>
        </div>
      )}
      {editDur && (
        <div className="dwc-overlay" onClick={() => setEditDur(null)}>
          <div className="dwc-modal dwc-mini-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">更改时间</span></div>
            <div className="dwc-modal-body"><input type="number" className="dwc-name-input" defaultValue={editDur.raw} id="dwc-dur-edit" style={{ width: '100%' }} /></div>
            <div className="dwc-modal-foot"><button className="dwc-modal-cancel" onClick={() => setEditDur(null)}>取消</button><button className="dwc-modal-ok" onClick={() => { const el = document.getElementById('dwc-dur-edit') as HTMLInputElement; const v = el?.value || editDur.raw; if (sb) replaceInPrompt(editDur.raw, v); setEditDur(null); }}>确认</button></div>
          </div>
        </div>
      )}
      {editLine && (
        <div className="dwc-overlay" onClick={() => setEditLine(null)}>
          <div className="dwc-modal dwc-mini-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">台词内容</span></div>
            <div className="dwc-modal-body"><textarea className="dwc-ai-prompt" defaultValue={editLine.raw} id="dwc-line-edit" rows={4} style={{ width: '100%' }} /></div>
            <div className="dwc-modal-foot"><button className="dwc-modal-cancel" onClick={() => setEditLine(null)}>取消</button><button className="dwc-modal-ok" onClick={() => { const el = document.getElementById('dwc-line-edit') as HTMLTextAreaElement; const v = el?.value || editLine.raw; if (sb) replaceInPrompt(editLine.raw, v); setEditLine(null); }}>确认</button></div>
          </div>
        </div>
      )}
      {refPickOpen && (
        <div className="dwc-overlay" onClick={() => setRefPickOpen(false)}>
          <div className="dwc-modal dwc-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">插入 @ 引用</span><button className="dwc-modal-close" onClick={() => setRefPickOpen(false)}><CloseIcon size={16} /></button></div>
            <div className="dwc-modal-body">
              <div className="dwc-picker-sec">角色 / 场景 / 道具</div>
              <div className="dwc-picker-grid">
                {[...project.characters, ...project.scenes, ...project.props].map(a => (<button key={a.id} className="dwc-picker-card" onClick={() => { insertRefToken('<' + a.name + '>'); setRefPickOpen(false); }}>{a.img ? <img src={a.img} alt={a.name} /> : <span className="dwc-picker-ico"><ImageIcon size={20} /></span>}<span>{a.name}</span></button>))}
              </div>
              <div className="dwc-picker-sec">音色</div>
              {hasVoiceCfg ? (
              voiceLibNames.length ? (
              <div className="dwc-voice-grid">
                {voiceLibNames.map(v => (<button key={v} className="dwc-voice-item" onClick={() => { insertRefToken('<' + v + '>'); setRefPickOpen(false); }}><span className="dwc-voice-avatar"><MicrophoneIcon size={12} /></span><span className="dwc-voice-item-info"><span className="dwc-voice-item-name">{v}</span></span></button>))}
              </div>
              ) : (<div className="dwc-picker-hint">该语音模型暂无官方音色列表</div>)
              ) : (
                <div className="dwc-picker-hint">⚠ 请先设置语音模型 API，才能引用音色</div>
              )}
              <div className="dwc-picker-sec">台词</div>
              <button className="dwc-action-btn" onClick={() => { insertRefToken('{台词内容}'); setRefPickOpen(false); }}><FileTextIcon size={14} /> 插入台词</button>
            </div>
          </div>
        </div>
      )}
      {voiceReplace !== null && (
        <div className="dwc-overlay" onClick={() => setVoiceReplace(null)}>
          <div className="dwc-modal dwc-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="dwc-modal-head"><span className="dwc-modal-title">替换音色</span><button className="dwc-modal-close" onClick={() => setVoiceReplace(null)}><CloseIcon size={16} /></button></div>
            <div className="dwc-modal-body">{voiceLibNames.length ? <div className="dwc-voice-grid">
              {voiceLibNames.map(v => (<button key={v} className="dwc-voice-item" onClick={() => { if (sb) replaceInPrompt(voiceReplace, v); setVoiceReplace(null); }}><span className="dwc-voice-avatar"><MicrophoneIcon size={14} /></span><span className="dwc-voice-item-info"><span className="dwc-voice-item-name">{v}</span></span></button>))}
            </div> : <div className="dwc-picker-hint">⚠ 请先设置语音模型 API（或该模型暂无官方音色列表）</div>}</div>
          </div>
        </div>
      )}
      {scriptOpen && <ScriptModal script={project.scriptText} fileName={project.scriptFileName} onClose={() => setScriptOpen(false)} />}
    </div>
  );
};

// 占位 toast（避免重复依赖）
function showToast2(msg: string) { void msg; }

// ==================== 视频页 ====================
interface VideoViewProps {
  project: DramartProject;
  storyboards: DramartStoryboard[];
  index: number;
  statusMap: Record<string, VideoStatus>;
  urlMap: Record<string, string>;
  onSelectIndex: (i: number) => void;
  onBack: () => void;
  onGenerate: (id: string) => void;
  onGo: (s: Stage) => void;
}

// 把分镜提示词解析成可点击片段：文本 / @引用(角色场景道具音色) / 时长 / 台词
function parseRichPrompt(text: string): { type: 'text' | 'ref' | 'dur' | 'line'; value: string }[] {
  const out: { type: 'text' | 'ref' | 'dur' | 'line'; value: string }[] = [];
  const re = /<([^<>]+)>|(\d+(?:\.\d+)?)s*s\b|(\{[^}]*\})/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(text || ''))) {
    if (m.index > last) out.push({ type: 'text', value: text.slice(last, m.index) });
    if (m[1]) out.push({ type: 'ref', value: m[1].trim() });
    else if (m[2]) out.push({ type: 'dur', value: m[2] });
    else if (m[3]) out.push({ type: 'line', value: m[3] });
    last = re.lastIndex;
  }
  if (last < (text || '').length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.max(0, Math.round(s % 60));
  return (m < 10 ? '0' + m : m) + ':' + (ss < 10 ? '0' + ss : ss);
};

const VideoView: React.FC<VideoViewProps> = ({ project, storyboards, index, statusMap, urlMap, onSelectIndex, onBack, onGenerate, onGo }) => {
  const [scriptOpen, setScriptOpen] = useState(false);
  const total = storyboards.reduce((s, x) => s + (x.duration || 0), 0);
  const cur = storyboards[index];
  const status = cur ? (statusMap[cur.id] || 'idle') : 'idle';
  const videoUrl = cur ? (urlMap[cur.id] || cur.videoUrl || '') : '';
  let acc = 0;
  const segments = storyboards.map(s => { const start = acc; acc += s.duration; return { ...s, start, width: (s.duration / Math.max(total, 1)) * 100 }; });

  return (
    <div className="dwc-vid">
      <div className="dwc-top-bar">
        <button className="dwc-back" onClick={onBack}><ChevronLeftIcon size={16} /> 返回</button>
        <div className="dwc-project-name"><span className="dwc-edit-icon"><EditIcon size={13} /></span>{project.name}</div>
        <div className="dwc-meta">
          <span className="dwc-meta-item"><span className="dwc-ratio-icon" style={ratioIconStyle(project.ratio)} /> {project.ratio}</span>
          <span className="dwc-meta-item">{project.resolution}px</span>
          <span className="dwc-meta-item">{project.styleName}</span>
        </div>
        <button className="dwc-view-script" onClick={() => setScriptOpen(true)}>查看剧本</button>
      </div>
      <div className="dwc-step-ribbon">
        {[
          { key: 'script', label: '剧本', icon: <FileTextIcon size={15} />, done: true, target: 'script' as Stage },
          { key: 'sets', label: '设定', icon: <ImageIcon size={15} />, done: true, target: 'sets' as Stage },
          { key: 'storyboard', label: '分镜', icon: <VideoIcon size={15} />, done: true, target: 'storyboard' as Stage },
          { key: 'video', label: '视频', icon: <PlayIcon size={15} />, done: false, active: true },
        ].map(r => (
          <div key={r.key} className={`dwc-ribbon-step${r.target ? ' clickable' : ''}${r.active ? ' active' : ''}${r.done ? ' done' : ''}`} onClick={r.target ? () => onGo(r.target) : undefined} style={{ cursor: r.target ? 'pointer' : 'default' }}>
            <span className="dwc-ribbon-icon">{r.icon}</span>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      <div className="dwc-vid-toolbar">
        <span className="dwc-vid-label">视频合成预览</span>
        <div className="dwc-vid-actions">
          <button className="dwc-vid-act" onClick={() => alert('编辑')}><EditIcon size={14} /> 编辑</button>
          <button className="dwc-vid-act" onClick={() => alert('导出视频')}><SaveIcon size={14} /> 导出视频</button>
          <button className="dwc-vid-act" onClick={() => alert('下载')}><DownloadIcon size={14} /> 下载</button>
        </div>
      </div>
      <div className="dwc-vid-player">
        <div className="dwc-vid-player-tag">{cur?.label || '分镜'}</div>
        {videoUrl ? (
          <video src={videoUrl} controls className="dwc-vid-video" />
        ) : status === 'generating' ? (
          <div className="dwc-vid-placeholder"><span className="dwc-spinner" /> 生成中…</div>
        ) : (
          <button className="dwc-vid-placeholder" onClick={() => cur && onGenerate(cur.id)}>
            <PlayIcon size={38} />
            {status === 'done' ? '已生成 · 重新生成此分镜' : '预览分镜视频'}
          </button>
        )}
      </div>
      {/* 角色配音预览 */}
      {cur?.voiceUrl && (
        <div className="dwc-vid-voiceover" style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <MicrophoneIcon size={14} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>角色配音</span>
          </div>
          <audio controls src={cur.voiceUrl} style={{ width: '100%' }} />
        </div>
      )}
      <div className="dwc-tl">
        <div className="dwc-tl-ruler">
          <span>00:00</span>
          <span>{fmt(total / 2)}</span>
          <span>{fmt(total)}</span>
        </div>
        <div className="dwc-tl-track">
          {segments.map(s => (
            <button key={s.id} className={`dwc-tl-seg${s.id === cur?.id ? ' active' : ''}`} style={{ width: s.width + '%' }} onClick={() => onSelectIndex(storyboards.indexOf(s))}>
              <div className="dwc-tl-thumb" style={thumbStyle(200 + s.index * 40, 'scene')}><PlayIcon size={14} /></div>
              <div className="dwc-tl-seg-meta"><span>{s.label}</span><span>{fmt(s.duration)}</span></div>
            </button>
          ))}
        </div>
      </div>
      <div className="dwc-vid-foot">
        <div className="dwc-footer">平台内容均由人工智能模型生成，不代表平台立场</div>
        <div className="dwc-vid-foot-actions">
          <button className="dwc-vid-act danger" onClick={() => alert('删除')}><TrashIcon size={14} /> 删除</button>
          <button className="dwc-bottom-btn" onClick={() => alert('导出并发布')}><DownloadIcon size={15} /> 导出视频</button>
        </div>
      </div>
      {scriptOpen && <ScriptModal script={project.scriptText} fileName={project.scriptFileName} onClose={() => setScriptOpen(false)} />}
    </div>
  );
};


// ==================== 资产详情面板/弹窗 ====================

interface AssetDetailPanelProps {
  asset: DramartAssetItem;
  kindLabel: string;
  styleName: string;
  episode?: number;
  onClose: () => void;
  onRename: (id: string, name: string) => void;
  onCollect: (a: DramartAssetItem) => void;
  onAddVariant: (id: string) => void;
  onRemoveVariant: (assetId: string, variantId: string) => void;
  onGenVariant: (assetId: string, variantId: string, prompt: string, opts: { count?: number; model?: string; resolution?: string; ratio?: string }) => void;
  onSetVariantCurrent: (assetId: string, variantId: string, img: string) => void;
  onPicker: () => void;
  onUpload: () => void;
  onOpenGen: (variantId: string) => void;
}

const VAR_MODELS = [
  { id: 'Doubao-Seedream-5.0-Pro', label: 'Doubao-Seedream-5.0-Pro' },
  { id: 'Doubao-Seedream-5.0-lite', label: 'Doubao-Seedream-5.0-lite' },
  { id: 'Doubao-Seedream-4.5', label: 'Doubao-Seedream-4.5' },
  { id: 'VisionGenesis', label: 'VisionGenesis' },
  { id: '旗舰 Pro', label: '旗舰 Pro' },
];
const VAR_COUNTS = [{ id: '1', label: '1张' }, { id: '2', label: '2张' }, { id: '4', label: '4张' }, { id: '9', label: '9张' }];
const VAR_RES = [{ id: '1k', label: '1k' }, { id: '2k', label: '2k' }];
const VAR_RATIOS = [{ id: '1:1', label: '1:1' }, { id: '3:2', label: '3:2' }, { id: '2:3', label: '2:3' }, { id: '3:4', label: '3:4' }, { id: '4:3', label: '4:3' }, { id: '16:9', label: '16:9' }];
const DEFAULT_VAR_PROMPT = '**上身着装**:\n**下身着装**:\n**鞋子**:\n**其他配饰**:';
const DEFAULT_MAIN_PROMPT = '任务：完成角色的上半身正面平视特写和该角色的全身三视图，左边是角色的上半身正面平视特写，右边是该角色的全身三视图。三视图不可以有分割线。\n\n角色描述:\n';
const DEFAULT_SCENE_PROMPT = '生成四宫格画面，展示同一个场景中的四个不同视角：左上角为正视图，主体正面清晰可见，构图居中，细节完整；右上角为俯视图，从高空俯视整体空间布局，展示环境关系和场景结构；左下角为背视图，从主体后方观察，突出背部轮廓、空间纵深和环境延展；右下角为侧视图，从主体侧面观察，展示主体比例、层次和空间关系。四个画面保持同一场景、同一光照、同一色调、同一时间状态。只出现场景，不出现人物、道具等无关内容；仅展示静态事物，不能包含人、动物等可自行运动的事物；无动态、特效、技能、光效及战斗相关描写。不输出文字信息。';
const DEFAULT_PROP_PROMPT = '生成{name}的高清特写静物图：真实还原物品形态、材质、颜色与细节，质感清晰，光影自然，体现出岁月与材质特征（如真实纹理、边缘磨损、岁月斑点、卷边龟裂等）。仅呈现该物品本身，无人物、无多余元素，无动态特效。不输出文字信息。';

const AssetDetailPanel: React.FC<AssetDetailPanelProps> = ({ asset, kindLabel, styleName, episode, onClose, onRename, onCollect, onAddVariant, onRemoveVariant, onGenVariant, onSetVariantCurrent, onPicker, onUpload, onOpenGen }) => {
  const variants = asset.variants || [];
  const mainVariant = variants.find(v => v.label === '主形象');
  const [curVariantId, setCurVariantId] = useState(mainVariant?.id || variants[0]?.id || '');
  const curIdx = variants.findIndex(v => v.id === curVariantId);
  const curVariant = variants[curIdx] || mainVariant;
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(asset.name);
  const topImg = curVariant?.img || asset.img;
  const isSetCurrent = !!curVariant?.img;
  const pending = variants.filter(v => v.label !== '主形象' && !v.img).length;
  const gender = /女/.test(asset.imageSummary || '') && !/男/.test(asset.imageSummary || '') ? '女' : '男';
  const term = kindTerm(asset.kind);
  const isCharacter = asset.kind === 'character';
  const isMainView = (curVariant?.label === '主形象') || !isCharacter;
  const addLabel = term.add;
  const genBtnLabel = isMainView
    ? (curVariant?.img ? '重绘' + term.main : '生成' + term.main)
    : (isCharacter ? (curVariant?.img ? '重绘当前变装' : '生成当前变装') : (curVariant?.img ? '重绘' + term.variant : '生成当前' + term.variant));

  const commitRename = () => { onRename(asset.id, nameInput); setEditing(false); };
  const prev = () => variants.length ? setCurVariantId(variants[(curIdx - 1 + variants.length) % variants.length].id) : undefined;
  const next = () => variants.length ? setCurVariantId(variants[(curIdx + 1) % variants.length].id) : undefined;

  return (
    <div className="dwc-detail wide">
      <div className="dwc-detail-head">
        <div className="dwc-detail-title-wrap">
          <div className="dwc-detail-name">
            {editing ? (
              <input className="dwc-name-input" value={nameInput} onChange={e => setNameInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') commitRename(); }} autoFocus />
            ) : (
              <>
                <span>{asset.name}{curVariant && curVariant.label !== '主形象' ? '-' + curVariant.label : ''}</span>
                <button className="dwc-detail-icon" title="重命名角色" onClick={() => { setNameInput(asset.name); setEditing(true); }}><EditIcon size={13} /></button>
              </>
            )}
          </div>
          {episode != null && <div className="dwc-detail-sub">出镜剧集 第{episode}集</div>}
        </div>
        <div className="dwc-detail-head-actions">
          <button className="dwc-detail-icon" title="保存到资产库" onClick={() => onCollect(asset)}><StarIcon size={15} /></button>
          <button className="dwc-detail-icon" title="导出" onClick={() => onCollect(asset)}><DownloadIcon size={15} /></button>
          <span className="dwc-detail-sep" />
          <button className="dwc-detail-icon" title="关闭弹窗" onClick={onClose}><CloseIcon size={15} /></button>
        </div>
      </div>
      <div className="dwc-detail-main">
        <button className="dwc-detail-arrow" onClick={prev} aria-label="上一个变装">‹</button>
        <div className="dwc-detail-big" style={(topImg ? undefined : thumbStyle(asset.hue, asset.kind))}>
          {topImg ? <><img src={topImg} alt={asset.name} className="dwc-detail-big-img" />{isSetCurrent && <span className="dwc-detail-current-badge"><CheckIcon size={13} /> 已设为当前变装形象</span>}</> : <span className="dwc-detail-empty"><ImageIcon size={40} /><em>此变装暂未配置设定图，点击页面下方按钮完成操作。</em></span>}
        </div>
        <button className="dwc-detail-arrow" onClick={next} aria-label="下一个变装">›</button>
      </div>
      <div className="dwc-detail-variants">
        {variants.map((v) => (
          <div key={v.id} className={`dwc-detail-variant-wrap${v.id === curVariantId ? ' active' : ''}`} onClick={() => setCurVariantId(v.id)}>
            <button className={`dwc-detail-variant${!v.img ? ' pending' : ''}`}>
              <span className="dwc-detail-variant-img" style={v.img ? undefined : thumbStyle(asset.hue + (v.label === '主形象' ? 0 : 30), asset.kind)}>{v.img ? <img src={v.img} alt={v.label} /> : <span className="dwc-detail-variant-ico"><ImageIcon size={16} /></span>}</span>
              <span className="dwc-detail-variant-label">{v.label}</span>
            </button>
            {v.id !== mainVariant?.id && <button className="dwc-detail-variant-del" onClick={e => { e.stopPropagation(); onRemoveVariant(asset.id, v.id); }} title="删除"><CloseIcon size={12} /></button>}
          </div>
        ))}
        <button className="dwc-detail-variant add" onClick={() => onAddVariant(asset.id)}><span className="dwc-detail-variant-img add"><span className="dwc-detail-variant-plus">+</span></span><span className="dwc-detail-variant-label">{addLabel}</span></button>
      </div>
      <div className="dwc-detail-desc">{asset.imageSummary}</div>
      {pending > 0 && <div className="dwc-detail-pending">🔔 {pending} 个变装待生成</div>}
      <div className="dwc-detail-actions">
        <button className="dwc-detail-act" onClick={() => onOpenGen(curVariantId)}><ImageIcon size={14} /> {genBtnLabel}</button>
        <button className="dwc-detail-act" onClick={onPicker}><AssetsIcon size={14} /> 从资产库选择</button>
        <button className="dwc-detail-act" onClick={onUpload}><UploadIcon size={14} /> 本地上传</button>
      </div>
    </div>
  );
};


interface GenerationModalProps {
  asset: DramartAssetItem;
  variantId: string;
  kindLabel: string;
  styleName: string;
  onClose: () => void;
  onGen: (assetId: string, variantId: string, prompt: string, opts: { count?: number; model?: string; resolution?: string; ratio?: string }) => void;
  onSetCurrent: (assetId: string, variantId: string, img: string) => void;
  onOpenPicker: () => void;
}

const GenerationModal: React.FC<GenerationModalProps> = ({ asset, variantId, kindLabel, styleName, onClose, onGen, onSetCurrent, onOpenPicker }) => {
  const variants = asset.variants || [];
  const variant = variants.find(v => v.id === variantId);
  const term = kindTerm(asset.kind);
  const isMain = variant?.label === '主形象' || asset.kind !== 'character';
  // 生图模型列表：自动取设置页图像 API 的模型配置（找有模型的那条，defaultModel 为默认），没有才回退内置列表
  const imageAPIConfigs = useAppStore(s => s.imageAPIConfigs);
  const cfg0 = (imageAPIConfigs || []).find((c: any) => (c?.models?.length) || c?.defaultModel) || imageAPIConfigs?.[0];
  const cfgDefault = (cfg0?.defaultModel as string | undefined) || '';
  const cfgModels = ((cfg0?.models as string[] | undefined) || []).filter(Boolean);
  const allModels = Array.from(new Set([...(cfgDefault ? [cfgDefault] : []), ...cfgModels]));
  const modelOptions = allModels.length ? allModels.map((m: string) => ({ id: m, label: m })) : [];
  const kindDefault = asset.kind === 'scene' ? DEFAULT_SCENE_PROMPT : asset.kind === 'prop' ? DEFAULT_PROP_PROMPT.replace('{name}', asset.name || '物品') : (DEFAULT_MAIN_PROMPT + asset.name + '：' + (asset.imageSummary || ''));
  const [prompt, setPrompt] = useState(variant?.prompt || asset.prompt || kindDefault);
  const [model, setModel] = useState(cfgDefault || modelOptions[0]?.id || '');
  const [count, setCount] = useState(VAR_COUNTS[0].id);
  const [resolution, setResolution] = useState(VAR_RES[0].id);
  const [ratio, setRatio] = useState('16:9');
  const candidates = variant?.candidates || [];
  const curImg = variant?.img || asset.img || '';
  const [previewImg, setPreviewImg] = useState(curImg);
  useEffect(() => { setPreviewImg(curImg); }, [variant?.id, asset.img]);
  const emptyText = asset.kind === 'scene' ? '暂无场景' : asset.kind === 'prop' ? '暂无道具' : (isMain ? '暂无角色主图' : '暂无角色变装');
  const genOpts = { count: parseInt(count, 10), model, resolution, ratio };
  const title = isMain ? (kindLabel + '生成') : (asset.name + (variant ? '-' + variant.label : ''));
  const latest = candidates[candidates.length - 1];

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-gen-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">{title}</span>
          <div className="dwc-gen-head-actions">
            <button className="dwc-modal-ok" onClick={() => onGen(asset.id, variantId, prompt, genOpts)}><BoltIcon size={14} /> 确认</button>
            <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
          </div>
        </div>
        <div className="dwc-gen-body">
          <div className="dwc-gen-preview" style={previewImg ? undefined : thumbStyle(asset.hue, asset.kind)}>
            {previewImg ? <><img src={previewImg} alt={title} className="dwc-gen-preview-img" />{curImg && <span className="dwc-detail-current-badge"><CheckIcon size={13} /> 已设为当前</span>}</> : <span className="dwc-detail-empty"><ImageIcon size={40} /><em>{emptyText}</em></span>}
          </div>
          <div className="dwc-gen-side">
            <div className="dwc-gen-side-item"><span className="dwc-gen-side-label">当前</span>{curImg ? <button className="dwc-gen-side-thumb" onClick={() => setPreviewImg(curImg)} title="点击预览"><img src={curImg} alt="" /></button> : <div className="dwc-gen-side-none">暂无</div>}</div>
            <div className="dwc-gen-side-item"><span className="dwc-gen-side-label">最新</span>{latest ? <button className="dwc-gen-side-thumb" onClick={() => setPreviewImg(latest)} title="点击预览"><img src={latest} alt="" /></button> : <div className="dwc-gen-side-none">暂无</div>}</div>
            <div className="dwc-gen-side-item"><span className="dwc-gen-side-label">{term.variant}</span><div className="dwc-gen-side-none">暂无</div></div>
          </div>
        </div>
        <div className="dwc-var-gen gen">
          <div className="dwc-var-refs">
            {asset.img && <div className="dwc-var-ref" title="主形象参考图"><img src={asset.img} alt="主形象" /></div>}
            <div className="dwc-var-ref add" onClick={onOpenPicker} title="从资产库选择"><AssetsIcon size={16} /></div>
            <span className="dwc-var-ref-label">图片1</span>
            <button className="dwc-detail-act" onClick={onOpenPicker}><AssetsIcon size={14} /> 从资产库选择</button>
          </div>
          <textarea className="dwc-ai-prompt" value={prompt} onChange={e => setPrompt(e.target.value)} rows={5} placeholder={DEFAULT_VAR_PROMPT} />
          <div className="dwc-ai-params">
            {modelOptions.length ? <SimpleDropdown value={model} options={modelOptions} onChange={setModel} /> : <span className="dwc-ai-param warn">⚠ 请先设置图像模型</span>}
            <SimpleDropdown value={count} options={VAR_COUNTS} onChange={setCount} />
            <SimpleDropdown value={resolution} options={VAR_RES} onChange={setResolution} />
            <SimpleDropdown value={ratio} options={VAR_RATIOS} onChange={setRatio} />
            <span className="dwc-ai-param style" title="创建时选择的风格">✱ {styleName || '默认风格'}</span>
            <button className="dwc-var-gen-btn" disabled={!modelOptions.length} onClick={() => onGen(asset.id, variantId, prompt, genOpts)}><BoltIcon size={14} /> 生成 ✦30</button>
          </div>
          {candidates.length > 0 && (
            <div className="dwc-var-cands">
              {candidates.map((c, i) => {
                const isCur = c === curImg;
                return (
                  <button key={i} className={`dwc-var-cand${isCur ? ' current' : ''}`} onClick={() => onSetCurrent(asset.id, variantId, c)} title={isCur ? '已设为当前变装形象' : '设置为当前变装形象'}>
                    <img src={c} alt={'生成图' + (i + 1)} />
                    <span className="dwc-var-cand-check">{isCur && <CheckIcon size={13} />}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};



interface AddAssetModalProps {
  kindLabel: string;
  styleName: string;
  modelOptions: { id: string; label: string }[];
  img?: string;
  onClose: () => void;
  onAdd: (data: { name: string; kind: DramartAssetItem['kind']; imageSummary: string; prompt?: string; img?: string; voice?: string }) => void;
  onPicker: () => void;
}

const AddAssetModal: React.FC<AddAssetModalProps> = ({ kindLabel, styleName, modelOptions, img, onClose, onAdd, onPicker }) => {
  const kind = kindLabel === '场景' ? 'scene' : kindLabel === '道具' ? 'prop' : 'character';
  const [name, setName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [prompt, setPrompt] = useState('');
  const [desc, setDesc] = useState('');
  const [model, setModel] = useState(modelOptions[0]?.id || '');
  const [resolution, setResolution] = useState(VAR_RES[0].id);
  const [ratio, setRatio] = useState('16:9');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    const voiceStr = voiceConfig ? JSON.stringify(voiceConfig) : undefined;
    onAdd({ name: name.trim(), kind, imageSummary: (desc || prompt || name).trim(), prompt: prompt || undefined, img, voice: voiceStr });
    onClose();
  };

  // 临时资产对象，用于传给 VoiceConfigModal
  const tempAsset: DramartAssetItem = {
    id: 'temp_' + Date.now().toString(36),
    name: name.trim() || '新角色',
    kind: 'character',
    imageSummary: desc || '',
    hue: 210,
    count: 1,
    voice: voiceConfig ? JSON.stringify(voiceConfig) : undefined,
  };

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-add-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head"><span className="dwc-modal-title">新增{kindLabel}</span><button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button></div>
        <div className="dwc-modal-body">
          <label className="dwc-add-field"><span className="dwc-add-label">名称 <em>*</em></span><input className="dwc-add-input" value={name} onChange={e => setName(e.target.value)} placeholder="请输入" /></label>
          {kind === 'character' && (
          <div className="dwc-add-grid">
            <label className="dwc-add-field"><span className="dwc-add-label">性别</span><select className="dwc-add-input" value={gender} onChange={e => setGender(e.target.value)}><option value="">请选择</option><option value="男">男</option><option value="女">女</option></select></label>
            <label className="dwc-add-field"><span className="dwc-add-label">年龄</span><select className="dwc-add-input" value={age} onChange={e => setAge(e.target.value)}><option value="">请选择</option>{['7','18','25','30','36','45','55'].map(a => <option key={a} value={a}>{a}岁</option>)}</select></label>
            <div className="dwc-add-field"><span className="dwc-add-label">音色选择</span><button className={`dwc-add-input voice${voiceConfig ? ' has-voice' : ''}`} onClick={() => setVoiceOpen(true)}><StarIcon size={14} /> {voiceConfig ? voiceConfig.name : '配置音色'}</button></div>
          </div>
          )}
          <div className="dwc-add-field"><span className="dwc-add-label">形象生成方式</span>
            <div className="dwc-gen-modes">
              <button className="dwc-gen-mode active"><ImageIcon size={14} /> AI生成</button>
              <button className="dwc-gen-mode" onClick={onPicker}><AssetsIcon size={14} /> 从资产库选择</button>
              <button className="dwc-gen-mode"><UploadIcon size={14} /> 本地上传</button>
            </div>
          </div>
          <label className="dwc-add-field"><span className="dwc-add-label">提示词</span><textarea className="dwc-add-input area" value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder={kind === 'scene' ? DEFAULT_SCENE_PROMPT : kind === 'prop' ? DEFAULT_PROP_PROMPT.replace('{name}', name || '物品') : '请输入提示词'} /></label>
          <label className="dwc-add-field"><span className="dwc-add-label">{kindLabel}描述</span><textarea className="dwc-add-input area" value={desc} onChange={e => setDesc(e.target.value)} rows={3} placeholder="请输入" /></label>
        </div>
        <div className="dwc-modal-foot">
          <div className="dwc-ai-params">
            {modelOptions.length ? <SimpleDropdown value={model} options={modelOptions} onChange={setModel} /> : <span className="dwc-ai-param warn">⚠ 请先设置图像模型</span>}
            <SimpleDropdown value={resolution} options={VAR_RES} onChange={setResolution} />
            <SimpleDropdown value={ratio} options={VAR_RATIOS} onChange={setRatio} />
            <span className="dwc-ai-param style">✱ {styleName || '默认风格'}</span>
          </div>
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" disabled={!canSave} onClick={save}>确认</button>
        </div>
      </div>
      {voiceOpen && (
        <VoiceConfigModal asset={tempAsset} onClose={() => setVoiceOpen(false)} onConfirm={(cfg) => { setVoiceConfig(cfg); setVoiceOpen(false); }} />
      )}
    </div>
  );
};

const VOICE_PRESETS = [
  { name: '婆婆', desc: '语调舒缓、声线慈祥，自带岁月感的长辈…' },
  { name: '幽默大爷', desc: '幽默沧桑的乐观爷爷，通透豁达又从容…' },
  { name: '和蔼奶奶', desc: '慈祥的老奶奶，耐心亲切，散发着岁月沉…' },
  { name: '武则天', desc: '声线威严、气场拉满，自带帝王霸气的御…' },
  { name: '邻居阿姨', desc: '温暖成熟的中年阿姨，兼具知性气质…' },
  { name: '女雷神', desc: '声线浑厚、气场拉满，充满力量感的御姐音…' },
  { name: '温柔妈妈', desc: '语调舒缓、咬字温润，自带母性柔光的治…' },
  { name: '胡子叔叔', desc: '历经风雨后变得沉稳的大叔，果敢让人信赖…' },
  { name: '油腻大叔', desc: '沧桑的大叔，性格张扬，十分自信爱吹牛…' },
  { name: '诡异神秘', desc: '诡异神秘的大叔，气质沧桑，自带压迫感…' },
  { name: '深沉总裁', desc: '深沉冷峻、气场沉稳的总裁音…' },
  { name: '儒雅才俊', desc: '儒雅温润、书卷气十足的才俊音…' },
];

interface VoiceConfigModalProps {
  asset: DramartAssetItem;
  onClose: () => void;
  onConfirm: (voiceConfig: VoiceConfig) => void;
}

// 结构化音色配置：支持官方音色、克隆音色、自定义设计音色三种类型
export interface VoiceConfig {
  type: 'lib' | 'clone' | 'custom';
  voiceId: string;       // 音色唯一标识（官方音色名 / 克隆返回的 voice_id / 自定义生成的标识）
  name: string;           // 展示名称
  prompt?: string;        // 自定义音色设计的提示词（type=custom 时使用）
  sampleUrl?: string;     // 克隆音色的样本音频地址（type=clone 时使用）
  previewUrl?: string;    // 试听音频地址
}

// 解析资产上的 voice 字段（兼容旧版字符串和新版结构化对象）
function parseVoiceConfig(raw: string | VoiceConfig | undefined): VoiceConfig | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  // 旧版字符串：尝试解析为 JSON，否则视为官方音色名
  try { const parsed = JSON.parse(raw); if (parsed && typeof parsed === 'object' && parsed.type) return parsed; } catch {}
  return { type: 'lib', voiceId: String(raw), name: String(raw) };
}

const VoiceConfigModal: React.FC<VoiceConfigModalProps> = ({ asset, onClose, onConfirm }) => {
  const [tab, setTab] = useState<'ai' | 'lib' | 'upload'>('ai');
  const [prompt, setPrompt] = useState('男童声，音调偏高，质感清脆雅嫩，咬字用力，尾音倔强，带轻微鼻音');
  const [listen, setListen] = useState('你好，我的声音，为你演尽喜怒哀乐。');
  const [voice, setVoice] = useState('');
  const [q, setQ] = useState('');
  // 本地上传 / 音色克隆相关状态
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);
  const [clonedVoice, setClonedVoice] = useState<VoiceConfig | null>(null);
  const [cloneError, setCloneError] = useState('');
  // 音色功能依赖设置页音频 API 配置；音色库按已配置的 API 自动展示
  const voiceAPIConfigs = useAppStore(s => s.voiceAPIConfigs);
  const voiceCfg = (voiceAPIConfigs || []).find((c: any) => c?.apiKey && c?.baseUrl) || voiceAPIConfigs?.[0];
  const hasVoiceCfg = !!(voiceCfg?.apiKey && voiceCfg?.baseUrl);
  const apiVoiceNames = ((voiceCfg?.models as string[] | undefined) || []).filter(Boolean);
  const voiceLib = apiVoiceNames.length ? apiVoiceNames.map((m: string) => ({ name: m, desc: '来自音频API模型：' + m })) : [];
  const filtered = voiceLib.filter(v => !q.trim() || v.name.includes(q.trim()));
  const [audioUrl, setAudioUrl] = useState('');
  const [generating, setGenerating] = useState(false);

  // 初始化：从资产已有 voice 配置恢复状态
  useEffect(() => {
    const existing = parseVoiceConfig(asset.voice as any);
    if (existing) {
      setVoice(existing.voiceId);
      if (existing.prompt) setPrompt(existing.prompt);
      if (existing.type === 'clone') { setClonedVoice(existing); setTab('upload'); }
      else if (existing.type === 'custom') { setTab('ai'); }
      else { setTab('lib'); }
    }
  }, [asset.voice]);

  const generate = async () => {
    if (!hasVoiceCfg) return;
    setGenerating(true);
    try {
      const res = await toolService.generateVoice(listen.trim() || prompt.trim() || '你好，我的声音，为你演尽喜怒哀乐。', voiceCfg, { voice: voice || voiceCfg.defaultModel || 'alloy' });
      if (res?.url) { setAudioUrl(res.url); } else { alert('音色生成失败，请检查音频 API 配置'); }
    } catch (e: any) { alert('音色生成失败：' + (e?.message || String(e))); }
    setGenerating(false);
  };

  // 处理文件选择
  const handleFileSelect = (file: File | null) => {
    if (!file) return;
    const validExts = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!validExts.includes(ext)) { alert('仅支持 MP3、WAV、M4A、AAC、FLAC、OGG 格式'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('文件大小不能超过 10MB'); return; }
    setUploadFile(file);
    setCloneError('');
    if (!cloneName.trim()) setCloneName(file.name.replace(/\.[^.]+$/, '') + '_克隆');
  };

  // 执行音色克隆
  const doClone = async () => {
    if (!hasVoiceCfg || !uploadFile) return;
    setCloning(true);
    setCloneError('');
    try {
      const result = await toolService.cloneVoice(uploadFile, voiceCfg, { name: cloneName.trim() || ('克隆音色_' + Date.now().toString(36)) });
      const cfg: VoiceConfig = {
        type: 'clone',
        voiceId: result.voiceId,
        name: result.name,
        sampleUrl: URL.createObjectURL(uploadFile),
        previewUrl: result.previewUrl,
      };
      setClonedVoice(cfg);
      setVoice(result.voiceId);
      // 自动试听克隆音色
      try {
        const preview = await toolService.generateVoice('你好，这是我克隆的音色。', voiceCfg, { voice: result.voiceId });
        if (preview?.url) setAudioUrl(preview.url);
      } catch {}
    } catch (e: any) {
      setCloneError(e?.message || String(e));
    }
    setCloning(false);
  };

  // 确认：根据当前标签页返回结构化音色配置
  const confirm = () => {
    let config: VoiceConfig;
    if (tab === 'upload' && clonedVoice) {
      config = clonedVoice;
    } else if (tab === 'ai') {
      config = {
        type: 'custom',
        voiceId: 'custom_' + Date.now().toString(36),
        name: '自定义音色',
        prompt,
        previewUrl: audioUrl || undefined,
      };
    } else {
      const selected = voice || voiceCfg?.defaultModel || '';
      if (!selected) { alert('请选择一个音色'); return; }
      config = { type: 'lib', voiceId: selected, name: selected };
    }
    onConfirm(config);
    onClose();
  };

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-voice-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head"><span className="dwc-modal-title">配置音色 - {asset.name}</span><button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button></div>
        <div className="dwc-voice-tabs">
          <button className={`dwc-voice-tab${tab === 'ai' ? ' active' : ''}`} onClick={() => setTab('ai')}>智能音色设计</button>
          <button className={`dwc-voice-tab${tab === 'lib' ? ' active' : ''}`} onClick={() => setTab('lib')}>音色库选择</button>
          <button className={`dwc-voice-tab${tab === 'upload' ? ' active' : ''}`} onClick={() => setTab('upload')}>本地上传克隆</button>
        </div>
        <div className="dwc-modal-body">
          {!hasVoiceCfg && <div className="dwc-voice-hint">⚠ 请先在设置页配置音频 API，才能使用音色设计 / 音色库 / 本地上传克隆功能</div>}
          {tab === 'ai' && (
            <div className="dwc-voice-ai">
              <div className="dwc-voice-col">
                <label className="dwc-add-field"><span className="dwc-add-label">① 音色描述提示词</span><textarea className="dwc-add-input area" value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="描述 desired 音色特征，如：男童声，音调偏高，质感清脆雅嫩..." /></label>
                <label className="dwc-add-field"><span className="dwc-add-label">② 试听文本（可选）</span><textarea className="dwc-add-input area" value={listen} onChange={e => setListen(e.target.value)} rows={2} placeholder="输入一段文本用于试听生成的音色" /></label>
                <button className="dwc-voice-gen" disabled={!hasVoiceCfg || generating} onClick={generate}>{generating ? '生成中…' : '生成并试听'}</button>
              </div>
              <div className="dwc-voice-history"><span className="dwc-voice-history-title">试听结果</span>{audioUrl ? <audio controls src={audioUrl} style={{ width: '100%' }} /> : <div className="dwc-voice-empty"><MicrophoneIcon size={22} /><span>点击上方按钮生成音色试听</span></div>}</div>
            </div>
          )}
          {tab === 'lib' && (
            <div className="dwc-voice-lib">
              <div className="dwc-voice-search"><SearchIcon size={14} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索音色" /></div>
              {filtered.length === 0 ? (
                <div className="dwc-picker-empty"><MicrophoneIcon size={26} /><div>暂无音色（请先在设置页配置语音 API 并刷新模型列表）</div></div>
              ) : (
              <div className="dwc-voice-grid">
                {filtered.map(v => (
                  <button key={v.name} className={`dwc-voice-item${voice === v.name ? ' active' : ''}`} onClick={() => setVoice(v.name)}>
                    <span className="dwc-voice-avatar"><MicrophoneIcon size={14} /></span>
                    <span className="dwc-voice-item-info"><span className="dwc-voice-item-name">{v.name}</span><span className="dwc-voice-item-desc">{v.desc}</span></span>
                  </button>
                ))}
              </div>
              )}
            </div>
          )}
          {tab === 'upload' && (
            <div className="dwc-voice-upload">
              {!uploadFile ? (
                <div
                  className={`dwc-upload-drop${uploadDragging ? ' dragging' : ''}`}
                  onClick={() => { const input = document.getElementById('dwc-voice-file-input') as HTMLInputElement; input?.click(); }}
                  onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
                  onDragLeave={() => setUploadDragging(false)}
                  onDrop={e => { e.preventDefault(); setUploadDragging(false); handleFileSelect(e.dataTransfer.files?.[0] || null); }}
                >
                  <input id="dwc-voice-file-input" type="file" accept=".mp3,.wav,.m4a,.aac,.flac,.ogg" hidden onChange={e => handleFileSelect(e.target.files?.[0] || null)} />
                  <MicrophoneIcon size={26} />
                  <span className="dwc-upload-hint">点击或拖拽音频文件到此处上传<br/>支持 MP3、WAV、M4A、AAC、FLAC、OGG，单个文件不超过 10MB</span>
                </div>
              ) : (
                <div className="dwc-upload-result">
                  <div className="dwc-upload-file-info">
                    <span className="dwc-upload-file-name">{uploadFile.name}</span>
                    <span className="dwc-upload-file-size">{(uploadFile.size / 1024).toFixed(1)} KB</span>
                    <button className="dwc-upload-file-remove" onClick={() => { setUploadFile(null); setClonedVoice(null); setCloneError(''); }}><CloseIcon size={12} /></button>
                  </div>
                  <audio controls src={URL.createObjectURL(uploadFile)} style={{ width: '100%', marginTop: 8 }} />
                  <label className="dwc-add-field" style={{ marginTop: 12 }}>
                    <span className="dwc-add-label">克隆音色名称</span>
                    <input className="dwc-add-input" value={cloneName} onChange={e => setCloneName(e.target.value)} placeholder="为克隆的音色命名" />
                  </label>
                  {cloneError && <div className="dwc-voice-error" style={{ color: '#e74c3c', marginTop: 8, fontSize: 13 }}>克隆失败：{cloneError}</div>}
                  {clonedVoice && (
                    <div className="dwc-clone-success" style={{ marginTop: 12, padding: 10, background: 'rgba(46,204,113,0.1)', borderRadius: 6, color: '#2ecc71' }}>
                      ✓ 克隆成功：{clonedVoice.name}（voice_id: {clonedVoice.voiceId}）
                    </div>
                  )}
                  <button className="dwc-voice-gen" style={{ marginTop: 12 }} disabled={!hasVoiceCfg || cloning || !uploadFile} onClick={doClone}>
                    {cloning ? '克隆中…（可能需要 10-30 秒）' : clonedVoice ? '重新克隆' : '开始克隆音色'}
                  </button>
                </div>
              )}
            </div>
          )}
          {/* 试听结果（所有标签页共享） */}
          {audioUrl && tab !== 'ai' && (
            <div className="dwc-voice-preview" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="dwc-voice-history-title">试听</span>
              <audio controls src={audioUrl} style={{ width: '100%', marginTop: 6 }} />
            </div>
          )}
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" disabled={!hasVoiceCfg} onClick={confirm}>确认使用</button>
        </div>
      </div>
    </div>
  );
};
interface BatchGenModalProps {
  items: DramartAssetItem[];
  styleName: string;
  modelOptions: { id: string; label: string }[];
  onClose: () => void;
  onBatchGen: (ids: string[], opts: { model: string; resolution: string; ratio: string }) => void;
}

const BatchGenModal: React.FC<BatchGenModalProps> = ({ items, styleName, modelOptions, onClose, onBatchGen }) => {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [model, setModel] = useState(modelOptions[0]?.id || '');
  const [resolution, setResolution] = useState(VAR_RES[0].id);
  const [ratio, setRatio] = useState('16:9');
  const pending = items.filter(a => !a.img);
  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSel(new Set(pending.map(a => a.id)));

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-batch-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head"><span className="dwc-modal-title">批量生成</span><button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button></div>
        <div className="dwc-modal-body">
          <div className="dwc-batch-list">
            {items.length === 0 && <div className="dwc-picker-empty"><FileTextIcon size={30} /><div>暂无数据</div></div>}
            {items.map(a => {
              const done = !!a.img;
              return (
                <div key={a.id} className={`dwc-batch-row${done ? ' done' : ''}`} onClick={() => { if (!done) toggle(a.id); }}>
                  <input type="checkbox" checked={sel.has(a.id)} disabled={done} onChange={() => { if (!done) toggle(a.id); }} onClick={e => e.stopPropagation()} />
                  <span className="dwc-batch-thumb" style={a.img ? undefined : thumbStyle(a.hue, a.kind)}>{a.img ? <img src={a.img} alt={a.name} /> : <ImageIcon size={18} />}</span>
                  <div className="dwc-batch-info">
                    <div className="dwc-batch-name">{a.name}</div>
                    <div className="dwc-batch-desc">{a.imageSummary}</div>
                  </div>
                  <span className={`dwc-batch-status${done ? ' warn' : ' ok'}`}>{done ? '已完成设定，不支持批量生成' : '未生成，可批量生成'}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="dwc-modal-foot">
          <div className="dwc-ai-params batch">
            {modelOptions.length ? <SimpleDropdown value={model} options={modelOptions} onChange={setModel} /> : <span className="dwc-ai-param warn">⚠ 请先设置图像模型</span>}
            <SimpleDropdown value={resolution} options={VAR_RES} onChange={setResolution} />
            <SimpleDropdown value={ratio} options={VAR_RATIOS} onChange={setRatio} />
            <span className="dwc-ai-param style">✱ {styleName || '默认风格'}</span>
          </div>
          <button className="dwc-modal-cancel" onClick={selectAll} disabled={!pending.length}>全选</button>
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" disabled={!sel.size || !modelOptions.length} onClick={() => { onBatchGen([...sel], { model, resolution, ratio }); onClose(); }}>确认生成</button>
        </div>
      </div>
    </div>
  );
};
interface AssetPickerModalProps { assets: Record<string, any>; onPick: (id: string) => void; onClose: () => void; }

const AssetPickerModal: React.FC<AssetPickerModalProps> = ({ assets, onPick, onClose }) => {
  const imageAssets = Object.values(assets || {}).filter((a: any) => a?.type === 'image');
  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-picker-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">资产库选择</span>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-modal-body">
          <div className="dwc-picker-tabs">
            <span className="dwc-picker-tab active">所有资产</span>
            <span className="dwc-picker-tab">文件夹</span>
            <div className="dwc-picker-search"><SearchIcon size={14} /><input placeholder="搜索资产" /></div>
          </div>
          {imageAssets.length === 0 ? (
            <div className="dwc-picker-empty"><FileTextIcon size={30} /><div>暂无数据</div></div>
          ) : (
            <div className="dwc-picker-grid">
              {imageAssets.map((a: any) => (
                <button key={a.id} className="dwc-picker-card" onClick={() => onPick(a.id)}>
                  <img src={a.thumbnail || a.path} alt={a.name} />
                  <span>{a.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  );
};

interface UploadModalProps { onPick: (file: File | null) => void; onClose: () => void; }

const UploadModal: React.FC<UploadModalProps> = ({ onPick, onClose }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-upload-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">确认角色</span>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-modal-body">
          <div className="dwc-upload-drop" onClick={() => ref.current?.click()}>
            <PlusIcon size={30} />
            <div>点击上传图片</div>
            <div className="dwc-upload-drop-sub">支持 JPG、PNG 格式</div>
            <input ref={ref} type="file" accept="image/png,image/jpeg" hidden onChange={e => { onPick(e.target.files?.[0] || null); e.target.value = ''; }} />
          </div>
          <div className="dwc-upload-note">支持 JPG、PNG 格式，单个文件不超过 20MB</div>
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" onClick={() => ref.current?.click()}>确认</button>
        </div>
      </div>
    </div>
  );
};

// ==================== 补充剧本弹窗 ====================
interface SupplementScriptModalProps {
  onConfirm: (file: { name: string; text: string; size: number } | null) => void;
  onClose: () => void;
}

const SupplementScriptModal: React.FC<SupplementScriptModalProps> = ({ onConfirm, onClose }) => {
  const [file, setFile] = useState<{ name: string; text: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(async (f: File | null) => {
    if (!f) return;
    const ext = extOf(f.name);
    if (!ACCEPT_EXT.includes(ext)) { setFile(null); alert('仅支持 doc、docx、txt、pdf、md 格式'); return; }
    if (f.size > MAX_SCRIPT_SIZE) { setFile(null); alert('文件大小不能超过 20M'); return; }
    setParsing(true);
    let text = '';
    try { text = await readScriptText(f); } catch { text = ''; }
    setParsing(false);
    if (!text && !TEXT_EXTS.includes(ext) && ext !== 'docx') {
      // doc/pdf 无法直接提取文本，提示用户换格式
      setFile(null);
      alert('doc / pdf 暂不支持直接提取文本，请使用 txt、md 或 docx 格式上传补充剧本');
      return;
    }
    setFile({ name: f.name, text, size: f.size });
  }, []);

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-supply-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">上传补充剧本</span>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-modal-body">
          <div
            className={`dwc-supply-drop${dragging ? ' dragging' : ''}${file ? ' has-file' : ''}`}
            onClick={() => ref.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0] || null); }}
          >
            <input ref={ref} type="file" accept=".doc,.docx,.txt,.pdf,.md" hidden onChange={e => { acceptFile(e.target.files?.[0] || null); e.target.value = ''; }} />
            {parsing ? (
              <div className="dwc-supply-loading"><span className="dwc-spinner" /> 正在读取文件…</div>
            ) : file ? (
              <div className="dwc-file-chip">
                <FileTextIcon size={15} />
                <span>{file.name}</span>
                <span className="dwc-file-size">{(file.size / 1024).toFixed(1)} KB</span>
                <button className="dwc-file-remove" onClick={e => { e.stopPropagation(); setFile(null); }}><CloseIcon size={14} /></button>
              </div>
            ) : (
              <>
                <FileTextIcon size={30} />
                <div className="dwc-upload-hint">点击或拖拽剧本至此，支持 doc、docx、txt、pdf 和 md 格式，文件大小不超过 20M，系统将自动按「第*集」字段识别集数边界，补充内容的集数将自动接续在已生成的分镜之后</div>
              </>
            )}
          </div>
          <div className="dwc-upload-note">仅上传新增剧本部分（剔除已解析完成的剧本内容），可缩短解析时间</div>
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" disabled={!file || parsing} onClick={() => { if (file) onConfirm(file); }}>
            <BoltIcon size={14} /> 上传并解析
          </button>
        </div>
      </div>
    </div>
  );
};



interface ScriptModalProps { script: string; fileName: string; onClose: () => void; }

const ScriptModal: React.FC<ScriptModalProps> = ({ script, fileName, onClose }) => {
  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-script-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">剧本内容</span>
          <button className="dwc-modal-close" onClick={onClose}><CloseIcon size={16} /></button>
        </div>
        <div className="dwc-modal-body">
          <div className="dwc-script-name">{fileName || '剧本'}</div>
          <div className="dwc-script-content">{script || '（无剧本内容）'}</div>
        </div>
      </div>
    </div>
  );
};


// ==================== 剧本详情页 ====================
interface ScriptDetailViewProps {
  project: DramartProject;
  onNext: () => void;
  onBack: () => void;
  onRename: (name: string) => void;
  onSupply: () => void;
  onGo: (s: Stage) => void;
}

const ScriptDetailView: React.FC<ScriptDetailViewProps> = ({ project, onNext, onBack, onRename, onSupply, onGo }) => {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(project.name);
  const [scriptOpen, setScriptOpen] = useState(false);
  const chars = project.characters || [];
  // 分集剧情：真实取自当前项目分镜（含补充剧本后接续的新集），完整展示原文
  const episodes = (project.storyboards || []).map(sb => ({ index: sb.index, title: sb.label, content: sb.rawScript }));
  const saveName = () => { onRename(nameInput.trim() || project.name); setEditingName(false); };
  return (
    <div className="dwc-script">
      <div className="dwc-top-bar">
        <button className="dwc-back" onClick={onBack}><ChevronLeftIcon size={16} /> 返回</button>
        {editingName ? (
          <input className="dwc-name-input" value={nameInput} autoFocus onChange={e => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
          />
        ) : (
          <div className="dwc-project-name" style={{ cursor: 'pointer' }} onClick={() => { setNameInput(project.name); setEditingName(true); }}><span className="dwc-edit-icon"><EditIcon size={13} /></span>{project.name}</div>
        )}
        <div className="dwc-meta">
          <span className="dwc-meta-item"><span className="dwc-ratio-icon" style={ratioIconStyle(project.ratio)} /> {project.ratio}</span>
          <span className="dwc-meta-item">{project.resolution}</span>
          <span className="dwc-meta-item">{project.styleName}</span>
        </div>
        <button className="dwc-view-script" onClick={() => setScriptOpen(true)}>查看剧本</button>
      </div>
      <div className="dwc-step-ribbon">
        {[
          { key: 'script', label: '剧本', icon: <FileTextIcon size={15} />, active: true, done: true },
          { key: 'sets', label: '设定', icon: <ImageIcon size={15} />, target: 'sets' as Stage },
          { key: 'storyboard', label: '分镜', icon: <VideoIcon size={15} />, target: 'storyboard' as Stage },
          { key: 'video', label: '视频', icon: <PlayIcon size={15} />, target: 'video' as Stage },
        ].map(r => (
          <div key={r.key} className={`dwc-ribbon-step${r.target ? ' clickable' : ''}${r.active ? ' active' : ''}${r.done ? ' done' : ''}`} onClick={r.target ? () => onGo(r.target) : undefined} style={{ cursor: r.target ? 'pointer' : 'default' }}>
            <span className="dwc-ribbon-icon">{r.icon}</span>
            <span>{r.label}</span>
          </div>
        ))}
      </div>
      <div className="dwc-script-body">
        <div className="dwc-script-hero">
          <div className="dwc-script-cover" style={project.cover ? undefined : thumbStyle(210, 'scene')}>{project.cover ? <img src={project.cover} alt="封面" className="dwc-script-cover-img" /> : <ImageIcon size={40} />}</div>
          <div className="dwc-script-hero-info">
            <div className="dwc-script-title">{project.name}</div>
            <div className="dwc-script-tags">
              <span className="dwc-script-tag">{project.storyboards.length}集</span>
              <span className="dwc-script-tag">{project.ratio}</span>
              <span className="dwc-script-tag">{project.resolution}</span>
              <span className="dwc-script-tag">{project.styleName}</span>
            </div>
            <div className="dwc-script-genres">
              {(project.genres || ['现代', '家庭', '治愈']).map(g => <span key={g} className="dwc-script-genre">{g}</span>)}
            </div>
            <button className="dwc-script-supply dwc-tip" data-tip="请仅上传新增剧本部分，剔除已解析完成的剧本内容以缩短解析时间" onClick={onSupply}><PlusIcon size={14} /> 补充剧本</button>
          </div>
        </div>
        <div className="dwc-script-card"><div className="dwc-script-card-label">剧本类型</div><div className="dwc-script-card-title">AI短剧</div><div className="dwc-script-card-desc">根据剧本内容智能规划故事镜头、分角色演绎故事</div></div>
        <div className="dwc-script-card"><div className="dwc-script-card-label">大纲</div><div className="dwc-script-outline">{project.outline || project.scriptText || '（暂无大纲）'}</div></div>
        <div className="dwc-script-card"><div className="dwc-script-card-label">人物小传</div>
          <div className="dwc-script-chars">
            {chars.map(c => (
              <div key={c.id} className="dwc-script-char">
                <div className="dwc-script-char-name">{c.name}</div>
                <div className="dwc-script-char-desc">{c.imageSummary}</div>
                <div className="dwc-script-var-title">角色变装列表</div>
                {(c.variants || []).length ? (
                  <div className="dwc-script-var-row">{c.variants!.map(v => <span key={v.id} className="dwc-script-var">{v.img ? '🖼' : '＋'} {v.label}</span>)}</div>
                ) : <div className="dwc-script-var-none">暂无变装</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="dwc-script-card"><div className="dwc-script-card-label">分集剧情</div>
          <div className="dwc-script-episodes">
            {episodes.map(ep => (
              <div key={ep.index} className="dwc-script-episode"><span className="dwc-script-ep-index">{ep.index}</span><div className="dwc-script-ep-body"><div className="dwc-script-ep-title">{ep.title}</div><div className="dwc-script-ep-content">{ep.content}</div></div></div>
            ))}
          </div>
        </div>
      </div>
      <div className="dwc-script-foot">
        <div className="dwc-footer">平台内容均由人工智能模型生成，不代表平台立场</div>
        <button className="dwc-bottom-btn" onClick={onNext}><ClapperboardIcon size={15} /> 进入下一步</button>
      </div>
      {scriptOpen && <ScriptModal script={project.scriptText} fileName={project.scriptFileName} onClose={() => setScriptOpen(false)} />}
    </div>
  );
};

// ==================== 页 ====================

export const DramaWorkshopPage: React.FC = () => {
  const { recommendedConfigs, apiConfigs, chatAPIConfigs, videoAPIConfigs, imageAPIConfigs, voiceAPIConfigs, dramartDraft, clearDramartDraft, setActiveSection, assets, showToast, dramartCreateParams, setDramartCreateParams, saveDramartProject, dramartCustomStyles, saveDramartCustomStyle, deleteDramartCustomStyle, addAsset, dramartProjects } = useAppStore();

  const [stage, setStage] = useState<Stage>('create');
  // 创建页参数：从持久化的剧创工厂参数自动恢复，并在修改时自动保存
  const [mode, setMode] = useState<'agent' | 'manual'>(() => dramartCreateParams?.mode || 'agent');
  const [ratio, setRatio] = useState<string>(() => dramartCreateParams?.ratio || '9:16');
  const [resolution, setResolution] = useState<string>(() => dramartCreateParams?.resolution || '720p');
  const [styleId, setStyleId] = useState<string>(() => dramartCreateParams?.styleId || 'modern-city');

  // 参数选择自动保存
  useEffect(() => {
    setDramartCreateParams({ mode, ratio, resolution, styleId });
  }, [mode, ratio, resolution, styleId, setDramartCreateParams]);

  const [styleOpen, setStyleOpen] = useState(false);
  const [customStyleOpen, setCustomStyleOpen] = useState(false);
  const [scriptFile, setScriptFile] = useState<{ name: string; text: string; size: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [project, setProject] = useState<DramartProject | null>(null);
  const [tab, setTab] = useState<Tab>('character');
  const [storyboardIndex, setStoryboardIndex] = useState(0);
  const [sbStatus, setSbStatus] = useState<Record<string, VideoStatus>>({});
  const [sbUrl, setSbUrl] = useState<Record<string, string>>({});
  const [videoIndex, setVideoIndex] = useState(0);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [genOpen, setGenOpen] = useState<{ assetId: string; variantId: string } | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addImg, setAddImg] = useState('');
  const [addPick, setAddPick] = useState(false);
  const [voiceAsset, setVoiceAsset] = useState<DramartAssetItem | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [pickerAsset, setPickerAsset] = useState<{ id: string; kind: DramartAssetItem['kind'] } | null>(null);
  const [uploadAsset, setUploadAsset] = useState<{ id: string; kind: DramartAssetItem['kind'] } | null>(null);
  const [menuAssetId, setMenuAssetId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [scriptOpen, setScriptOpen] = useState(false);
  const [supplementOpen, setSupplementOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState<{ step: number; total: number; label: string; percent: number; msg: string }>({ step: 0, total: DRAMART_ANALYSIS_STEPS.length, label: DRAMART_ANALYSIS_STEPS[0], percent: 0, msg: '' });
  const [hintIdx, setHintIdx] = useState(0);
  // 分析中滚动提示：每 1.8s 轮换
  useEffect(() => {
    if (stage !== 'analyze') return;
    const id = window.setInterval(() => setHintIdx(i => i + 1), 1800);
    return () => window.clearInterval(id);
  }, [stage]);
  const currentHints = STEP_HINTS[analyzing.label] || ['正在处理…'];
  const analyzeSub = analyzing.msg || currentHints[hintIdx % currentHints.length];
  const fileRef = useRef<HTMLInputElement>(null);

  // 选中的风格：自定义风格优先（用户自建可直接选用），否则回退内置风格
  const selectedStyle = useMemo(() => {
    const all = [...(dramartCustomStyles || []), ...DRAMART_STYLES];
    return all.find(s => s.id === styleId) || DRAMART_STYLES[0];
  }, [styleId, dramartCustomStyles]);

  // 所选风格的正向提示词：内置风格用风格库词，自定义风格用用户填写的风格提示词（同时用于图片与视频画风约束）
  const styleWord = useMemo(() => selectedStyle?.stylePrompt || stylePromptOf(selectedStyle?.name || ''), [selectedStyle]);

  // 当前项目内容（资产/分镜/生成结果）自动保存到持久化项目库
  useEffect(() => {
    if (project) saveDramartProject(project);
  }, [project, saveDramartProject]);

  // 生图模型选项：统一从设置页图像 API 配置读取（无则空，提示去配置）
  const genModelOptions = useMemo(() => {
    const cfg = (imageAPIConfigs || []).find((c: any) => (c?.models?.length) || c?.defaultModel) || imageAPIConfigs?.[0];
    const d = (cfg?.defaultModel as string | undefined) || '';
    const m = ((cfg?.models as string[] | undefined) || []).filter(Boolean);
    const all = Array.from(new Set([...(d ? [d] : []), ...m]));
    return all.length ? all.map((x: string) => ({ id: x, label: x })) : [];
  }, [imageAPIConfigs]);

  // 挑选可调用的对话配置（无则返回 null，走内置示例）
  const pickAIConfig = useCallback((): AIConfigInput | null => {
    const source = [recommendedConfigs, apiConfigs, chatAPIConfigs].flat() as any[];
    const c = source.find(x => x?.apiKey && x?.baseUrl && (x?.defaultModel || x?.models?.[0]));
    if (!c) return null;
    return { baseUrl: c.baseUrl, apiKey: c.apiKey, model: c.defaultModel || c.models?.[0] };
  }, [recommendedConfigs, apiConfigs, chatAPIConfigs]);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (!ACCEPT_EXT.includes(ext)) { showToast('仅支持 doc、docx、txt、pdf、md 格式', 'error'); return; }
    if (file.size > MAX_SCRIPT_SIZE) { showToast('文件大小不能超过 20M', 'error'); return; }
    let text = '';
    if (isTextFile(file.name)) {
      try { text = await readFileAsText(file); } catch { text = ''; }
    } else if (ext === 'docx') {
      // docx：解压读取 word/document.xml 提取文本
      try { text = await readDocxAsText(file); } catch { text = ''; }
    } else {
      // doc/pdf 无法直接提取文本，保持占位，自动分析时回退到内置示例
      await readFileAsDataUrl(file).catch(() => null);
      text = '';
    }
    if (text?.trim()) showToast('已提取剧本文本：' + text.length + ' 字', 'success');
    setScriptFile({ name: file.name, text, size: file.size });
  }, [showToast]);

  // 统一文生图入口：所有图片生成都会强制追加所选风格提示词（内置/自定义），确保出图严格贴合风格
  const imageFetcher = useCallback(async (prompt: string, opts?: { model?: string; size?: string }): Promise<string | null> => {
    const styledPrompt = styleWord ? `${prompt}
风格要求（必须严格遵循）：${styleWord}` : prompt;
    const cfg = imageAPIConfigs?.[0];
    if (cfg?.apiKey && cfg?.baseUrl) {
      try {
        const res = await toolService.generateImage(styledPrompt, cfg, { model: opts?.model || cfg.defaultModel, size: opts?.size });
        const url = (res as any)?.url;
        if (url) return url;
      } catch { /* fall through */ }
    }
    // 无图像 API 或生成失败：用渐变占位图兜底，保证资产有图
    return gradientDataUrl(styledPrompt || 'asset');
  }, [imageAPIConfigs, styleWord]);

  const startAnalysis = useCallback(async (base: DramartProject, config: AIConfigInput | null) => {
    setStage('analyze');
    setAnalyzing({ step: 0, total: DRAMART_ANALYSIS_STEPS.length, label: DRAMART_ANALYSIS_STEPS[0], percent: 2, msg: '' });
    try {
      const result = await runDramartAnalysis({
        scriptText: base.scriptText,
        scriptFileName: base.scriptFileName,
        styleName: base.styleName,
        styleWord,
        ratio: base.ratio,
        resolution: base.resolution,
        config,
        imageFetcher,
        onProgress: (step, label, percent, msg) => setAnalyzing({ step, total: DRAMART_ANALYSIS_STEPS.length, label, percent, msg: msg || '' }),
      });
      const cover = await imageFetcher('电影质感海报，' + base.name + '，' + base.styleName + '，大气唯美').catch(() => null);
      const p: DramartProject = { ...base, ...result,
        cover: cover || gradientDataUrl(base.name),
        outline: (base.scriptText || '').trim().slice(0, 400) || '（暂无大纲）',
        genres: ['现代','年代剧','家庭','治愈','喜剧','成长'],
        scriptType: 'AI短剧',
        storyboardStyle: '分镜解析 1.5',
        plotEpisodes: result.storyboards.map(sb => ({ index: sb.index, title: sb.label, content: sb.rawScript.slice(0, 200) })),
        analysis: { step: 4, total: 4, label: '完成', status: 'done', percent: 100 } };
      setProject(p);
      setStage('sets');
      setTab('character');
      showToast('分析完成，已生成封面与资产', 'success');
    } catch (e: any) {
      showToast('分析失败：' + (e?.message || String(e)), 'error');
      setStage('create');
    }
  }, [imageFetcher, showToast]);

  const handleCreate = useCallback(async () => {
    if (mode === 'manual' && dramartDraft) { return handleCreateDramaDraft(); }
    if (!scriptFile) { showToast('请先上传剧本', 'error'); return; }
    const base = scriptFile.name.replace(/\.[a-z0-9]+$/i, '') || '未命名项目';
    const config = pickAIConfig();
    const projectBase: DramartProject = {
      id: 'dr_' + Date.now().toString(36),
      name: base,
      ratio: ratio as any,
      resolution: resolution as any,
      styleId: selectedStyle.id,
      styleName: selectedStyle.name,
      scriptText: scriptFile.text,
      scriptFileName: scriptFile.name,
      mode,
      createdAt: Date.now(),
      analysis: { step: 0, total: 4, label: DRAMART_ANALYSIS_STEPS[0], status: 'idle', percent: 0 },
      characters: [],
      scenes: [],
      props: [],
      storyboards: [],
    };
    await startAnalysis(projectBase, config);
  }, [scriptFile, selectedStyle, styleWord, ratio, resolution, mode, dramartDraft, pickAIConfig, startAnalysis, handleCreateDramaDraft, showToast]);

  // 剧创模式创建：用剧创草稿 + 用户参数，解析剧创结果填入（不重新生成）
  async function handleCreateDramaDraft() {
    if (!dramartDraft) { showToast('未接收到剧创数据', 'error'); return; }
    const base: DramartProject = {
      ...dramartDraft,
      id: 'dr_' + Date.now().toString(36),
      ratio: ratio as any,
      resolution: resolution as any,
      styleId: selectedStyle.id,
      styleName: selectedStyle.name,
    };
    setStage('analyze');
    setAnalyzing({ step: 0, total: DRAMART_ANALYSIS_STEPS.length, label: DRAMART_ANALYSIS_STEPS[0], percent: 2, msg: '' });
    try {
      const result = await runDramaDraftAnalysis({
        draft: base,
        styleWord,
        imageFetcher,
        onProgress: (step, label, percent, msg) => setAnalyzing({ step, total: DRAMART_ANALYSIS_STEPS.length, label, percent, msg: msg || '' }),
      });
      const cover = await imageFetcher('电影质感海报，' + base.name + '，' + base.styleName + '，大气唯美').catch(() => null);
      const p: DramartProject = { ...base, ...result,
        cover: cover || gradientDataUrl(base.name),
        outline: (base.scriptContent || base.scriptText || '').trim().slice(0, 400) || '（暂无大纲）',
        genres: ['现代','年代剧','家庭','治愈','喜剧','成长'],
        scriptType: 'AI短剧',
        storyboardStyle: '分镜解析 1.5',
        plotEpisodes: result.storyboards.map(sb => ({ index: sb.index, title: sb.label, content: sb.rawScript.slice(0, 200) })),
        analysis: { step: 4, total: 4, label: '完成', status: 'done', percent: 100 } };
      setProject(p);
      setStage('sets');
      setTab('character');
      clearDramartDraft();
      showToast('分析完成，已从剧创结果生成角色/场景/道具', 'success');
    } catch (e: any) {
      showToast('分析失败：' + (e?.message || String(e)), 'error');
      setStage('create');
    }
  }


  // 补充剧本：上传后自动进入补充部分的剧本分析/分镜/提示词流程
  // 资产提取时自动检测补充前已有资产库，同名资产直接引用不重复生成，只生成真正新增的；分镜从之前剧本之后接续
  const handleSupplement = useCallback(async (sup: { name: string; text: string; size: number } | null) => {
    setSupplementOpen(false);
    if (!sup || !project) return;
    if (!sup.text.trim()) {
      showToast('未能读取到剧本文本，请使用 txt、md 或 docx 格式上传', 'error');
      return;
    }
    const config = pickAIConfig();
    setStage('analyze');
    setAnalyzing({ step: 0, total: DRAMART_ANALYSIS_STEPS.length, label: DRAMART_ANALYSIS_STEPS[0], percent: 2, msg: '' });
    try {
      const result = await runSupplementAnalysis({
        scriptText: sup.text,
        scriptFileName: sup.name,
        styleName: project.styleName,
        styleWord,
        ratio: project.ratio,
        resolution: project.resolution,
        config,
        existing: { characters: project.characters, scenes: project.scenes, props: project.props },
        storyboardOffset: project.storyboards.length,
        imageFetcher,
        onProgress: (step, label, percent, msg) => setAnalyzing({ step, total: DRAMART_ANALYSIS_STEPS.length, label, percent, msg: msg || '' }),
      });
      const addedCount = result.added.characters.length + result.added.scenes.length + result.added.props.length;
      const reusedCount = result.reusedCount || 0;
      setProject(p => p ? ({
        ...p,
        characters: [...p.characters, ...result.added.characters],
        scenes: [...p.scenes, ...result.added.scenes],
        props: [...p.props, ...result.added.props],
        storyboards: [...p.storyboards, ...result.storyboards],
        scriptText: p.scriptText + '\n\n' + sup.text,
        scriptFileName: p.scriptFileName,
        plotEpisodes: [
          ...(p.plotEpisodes || []),
          ...result.storyboards.map(sb => ({ index: sb.index, title: sb.label, content: sb.rawScript.slice(0, 200) })),
        ],
      }) : p);
      setStage('sets');
      setTab('character');
      const reusedTip = reusedCount > 0 ? `，直接复用已有资产 ${reusedCount} 个` : '';
      showToast(`补充解析完成：新增 ${addedCount} 个资产生成${reusedTip}，分镜 ${result.storyboards.length} 集已接续`, 'success');
    } catch (e: any) {
      showToast('补充解析失败：' + (e?.message || String(e)), 'error');
      setStage('sets');
    }
  }, [project, pickAIConfig, imageFetcher, styleWord, showToast]);

  // 打开创作历史：载入保存的项目并跳到对应页面（记录与操作已自动保存，不会丢失）
  const openHistory = useCallback((p: DramartProject) => {
    setProject(p);
    setHistoryOpen(false);
    if (p.storyboards?.length) setStage('script');
    else if (p.analysis?.status === 'done') setStage('sets');
    else setStage('script');
    showToast('已打开创作历史：' + p.name, 'success');
  }, [showToast]);

  const handleReset = useCallback(() => {
    setStage('create');
    setProject(null);
    setScriptFile(null);
    setTab('character');
    setStoryboardIndex(0);
    setSbStatus({});
    setSbUrl({});
  }, []);

  // 顶部标签页跳转：剧本/设定/分镜/视频 均可点击查看（分镜、视频重置到第一个）
  const goTo = useCallback((s: Stage) => {
    if (s === 'storyboard') setStoryboardIndex(0);
    if (s === 'video') setVideoIndex(0);
    setStage(s);
  }, []);

  // 保存自定义风格：写入持久化风格库并立即选中
  const handleCustomStyleSave = useCallback((style: DramartStyle) => {
    saveDramartCustomStyle(style);
    setStyleId(style.id);
    setCustomStyleOpen(false);
    setStyleOpen(false);
    showToast('自定义风格已保存', 'success');
  }, [saveDramartCustomStyle, showToast]);

  // 删除自定义风格：若正被选中则回退到默认风格
  const handleCustomStyleDelete = useCallback((id: string) => {
    deleteDramartCustomStyle(id);
    if (styleId === id) setStyleId(DRAMART_STYLES[0].id);
    showToast('自定义风格已删除', 'info');
  }, [deleteDramartCustomStyle, styleId, showToast]);

  // 为分镜生成角色配音（异步，不阻塞视频生成）
  const generateVoiceover = useCallback(async (sb: DramartStoryboard): Promise<string | null> => {
    try {
      const voiceCfg = (voiceAPIConfigs || []).find((c: any) => c?.apiKey && c?.baseUrl) || voiceAPIConfigs?.[0];
      if (!voiceCfg?.apiKey || !voiceCfg?.baseUrl) return null;

      // 从分镜提示词中提取台词（匹配 {台词内容} 格式）
      const prompt = sb.videoPrompt || sb.rawScript || '';
      const lineMatches = prompt.match(/\{([^}]+)\}/g);
      const lines = lineMatches ? lineMatches.map(m => m.slice(1, -1)) : [];
      if (!lines.length) {
        // 没有明确台词标记，使用分镜原文的前100字作为配音文本
        lines.push((sb.rawScript || prompt).slice(0, 100));
      }

      // 找到分镜中第一个角色及其音色配置
      const charName = sb.characters?.[0] || '';
      const charAsset = charName ? project?.characters.find(c => c.name === charName || charName.includes(c.name) || c.name.includes(charName)) : null;
      const voiceConfig = charAsset ? parseVoiceConfig(charAsset.voice as any) : null;
      const voiceId = voiceConfig?.voiceId || voiceCfg.defaultModel || 'alloy';

      // 合并所有台词为一段文本
      const fullText = lines.join('。');
      if (!fullText.trim()) return null;

      const res = await toolService.generateVoice(fullText, voiceCfg, { voice: voiceId });
      return res?.url || null;
    } catch (e) {
      console.warn('配音生成失败:', e);
      return null;
    }
  }, [voiceAPIConfigs, project]);

  const handleGenerateVideo = useCallback(async (id: string, params?: { model?: string; duration?: number; count?: number; resolution?: string; format?: string }) => {
    if (!id) { showToast('请先选择分镜', 'error'); return; }
    const sb = project?.storyboards.find(s => s.id === id);
    if (!sb) { showToast('分镜不存在', 'error'); return; }
    setSbStatus(s => ({ ...s, [id]: 'generating' }));
    setSbUrl(u => ({ ...u, [id]: '' }));

    const vc = videoAPIConfigs?.[0];
    const count = [1, 2, 3, 4].includes(params?.count || 1) ? (params?.count || 1) : 1;

    // 异步生成角色配音（不阻塞视频生成）
    const voiceoverPromise = generateVoiceover(sb);

    if (vc?.apiKey && vc?.baseUrl) {
      try {
        const aspect = project?.ratio || '16:9';
        const urls: string[] = [];
        for (let i = 0; i < count; i++) {
          const res = await toolService.generateVideo(sb.videoPrompt, vc, {
            model: params?.model || vc.defaultModel,
            aspectRatio: aspect,
            resolution: params?.resolution || project?.resolution || '720p',
            duration: params?.duration || sb.duration,
            format: params?.format || 'mp4',
          });
          if (res?.url) urls.push(res.url);
        }
        if (urls.length) {
          // 等待配音生成完成（最多等5秒，不阻塞视频展示）
          const voiceoverUrl = await Promise.race([
            voiceoverPromise,
            new Promise<string | null>(resolve => setTimeout(() => resolve(null), 5000))
          ]);
          setProject(p => p ? ({ ...p, storyboards: p.storyboards.map(x => x.id === id ? { ...x, videoCandidates: urls, videoUrl: urls[0], voiceUrl: voiceoverUrl || undefined } : x) }) : p);
          setSbStatus(s => ({ ...s, [id]: 'done' }));
          showToast('已生成 ' + urls.length + ' 条视频' + (voiceoverUrl ? '（含角色配音）' : '') + '，可点击缩略图切换使用', 'success');
          return;
        }
        throw new Error('未返回视频地址');
      } catch (e: any) {
        setSbStatus(s => ({ ...s, [id]: 'error' }));
        showToast('视频生成失败：' + (e?.message || String(e)), 'error');
        return;
      }
    }
    // 未配置视频 API：模拟占位，保证界面可用
    setTimeout(() => {
      setSbStatus(s => ({ ...s, [id]: 'done' }));
      setSbUrl(u => ({ ...u, [id]: '' }));
      showToast('未配置视频 API，已生成占位预览', 'info');
    }, 1600);
  }, [project, videoAPIConfigs, setProject, showToast, generateVoiceover]);

  const editSbPrompt = useCallback((id: string, text: string) => {
    setProject(p => p ? ({ ...p, storyboards: p.storyboards.map(x => x.id === id ? { ...x, videoPrompt: text } : x) }) : p);
  }, []);
  const addSbAsset = useCallback((id: string, kind: 'character' | 'scene' | 'prop', name: string) => {
    setProject(p => p ? ({ ...p, storyboards: p.storyboards.map(x => x.id === id ? ({ ...x,
      characters: kind === 'character' ? (x.characters.includes(name) ? x.characters : [...x.characters, name]) : x.characters,
      scenes: kind === 'scene' ? (x.scenes.includes(name) ? x.scenes : [...x.scenes, name]) : x.scenes,
      props: kind === 'prop' ? (x.props.includes(name) ? x.props : [...x.props, name]) : x.props,
    }) : x) }) : p);
  }, []);
  const selectSbVideo = useCallback((id: string, url: string) => {
    setProject(p => p ? ({ ...p, storyboards: p.storyboards.map(x => x.id === id ? { ...x, videoUrl: url } : x) }) : p);
  }, []);

  const stats = useMemo(() => {
    if (!project) return { total: 0, generated: 0 };
    const list = TAB_STAT_KEY[tab](project);
    return { total: list.length, generated: list.length };
  }, [project, tab]);
  const assetById = useCallback((id: string): DramartAssetItem | null => {
    if (!project) return null;
    return [...project.characters, ...project.scenes, ...project.props].find(a => a.id === id) || null;
  }, [project]);

  const updateAssetImg = useCallback((id: string, img: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === id ? { ...a, img, variants: a.variants?.map(v => v.label === '主形象' ? { ...v, img } : v) } : a),
      scenes: p.scenes.map(a => a.id === id ? { ...a, img } : a),
      props: p.props.map(a => a.id === id ? { ...a, img } : a),
    }) : p);
  }, []);

  const removeAsset = useCallback((id: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.filter(a => a.id !== id),
      scenes: p.scenes.filter(a => a.id !== id),
      props: p.props.filter(a => a.id !== id),
    }) : p);
    setDetailAssetId(d => d === id ? null : d);
  }, []);

  const renameAsset = useCallback((id: string, name: string) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) { showToast('名称不能为空', 'error'); return; }
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === id ? { ...a, name: trimmed } : a),
      scenes: p.scenes.map(a => a.id === id ? { ...a, name: trimmed } : a),
      props: p.props.map(a => a.id === id ? { ...a, name: trimmed } : a),
    }) : p);
  }, [showToast]);

  const addVariant = useCallback((id: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === id ? { ...a, variants: [...(a.variants || []), { id: 'va_' + Date.now().toString(36), label: kindTerm(a.kind).variant + ((a.variants?.length || 0) + 1) }] } : a),
      scenes: p.scenes.map(a => a.id === id ? { ...a, variants: [...(a.variants || []), { id: 'va_' + Date.now().toString(36), label: kindTerm(a.kind).variant + ((a.variants?.length || 0) + 1) }] } : a),
      props: p.props.map(a => a.id === id ? { ...a, variants: [...(a.variants || []), { id: 'va_' + Date.now().toString(36), label: kindTerm(a.kind).variant + ((a.variants?.length || 0) + 1) }] } : a),
    }) : p);
  }, []);

  const updateVariantImg = useCallback((assetId: string, variantId: string, img: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
      scenes: p.scenes.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
      props: p.props.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
    }) : p);
  }, []);

  const setVariantCandidates = useCallback((assetId: string, variantId: string, candidates: string[], prompt: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, candidates, prompt } : v) } : a),
      scenes: p.scenes.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, candidates, prompt } : v) } : a),
      props: p.props.map(a => a.id === assetId ? { ...a, variants: a.variants?.map(v => v.id === variantId ? { ...v, candidates, prompt } : v) } : a),
    }) : p);
  }, []);

  const openGen = useCallback((variantId: string) => {
    if (!detailAssetId) return;
    setGenOpen({ assetId: detailAssetId, variantId });
  }, [detailAssetId]);
  const closeGen = useCallback(() => setGenOpen(null), []);

  const removeVariant = useCallback((assetId: string, variantId: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === assetId ? { ...a, variants: (a.variants || []).filter(v => v.id !== variantId) } : a),
      scenes: p.scenes.map(a => a.id === assetId ? { ...a, variants: (a.variants || []).filter(v => v.id !== variantId) } : a),
      props: p.props.map(a => a.id === assetId ? { ...a, variants: (a.variants || []).filter(v => v.id !== variantId) } : a),
    }) : p);
  }, []);

  const setVariantCurrent = useCallback((assetId: string, variantId: string, img: string) => {
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === assetId ? { ...a, img: a.variants?.find(v => v.id === variantId)?.label === '主形象' ? img : a.img, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
      scenes: p.scenes.map(a => a.id === assetId ? { ...a, img: a.variants?.find(v => v.id === variantId)?.label === '主形象' ? img : a.img, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
      props: p.props.map(a => a.id === assetId ? { ...a, img: a.variants?.find(v => v.id === variantId)?.label === '主形象' ? img : a.img, variants: a.variants?.map(v => v.id === variantId ? { ...v, img } : v) } : a),
    }) : p);
  }, []);

  const genVariant = useCallback(async (assetId: string, variantId: string, prompt: string, opts: { count?: number; model?: string; resolution?: string; ratio?: string } = {}) => {
    const a = assetById(assetId);
    if (!a) return;
    const n = [1, 2, 4, 9].includes(opts.count || 1) ? (opts.count || 1) : 1;
    const size = genSize(opts.ratio || '16:9', opts.resolution || '1k');
    showToast('变装生成中…', 'info');
    const base = prompt || (a.name + '，' + a.imageSummary);
    const urls: string[] = [];
    for (let i = 0; i < n; i++) {
      const url = await imageFetcher(base, { model: opts.model, size }).catch(() => null);
      if (url) urls.push(url);
    }
    if (urls.length) { setVariantCandidates(assetId, variantId, urls, base); showToast('已生成 ' + urls.length + ' 张变装图，请选择设为当前变装', 'success'); }
    else showToast('未配置图像 API，生成失败', 'error');
  }, [assetById, imageFetcher, setVariantCandidates, showToast]);

  const genAsset = useCallback(async (assetId: string, prompt: string, opts: { model?: string; size?: string } = {}): Promise<boolean> => {
    const a = assetById(assetId);
    if (!a) return false;
    const url = await imageFetcher(prompt || (a.name + '，' + a.imageSummary), opts).catch(() => null);
    if (url) { updateAssetImg(assetId, url); return true; }
    return false;
  }, [assetById, imageFetcher, updateAssetImg]);

  // 批量匹配：把当前生成的角色/场景/道具应用到分镜提示词中的引用参考图（替换更新，按剧本内容重新匹配当前资产）
  const matchStoryboards = useCallback(() => {
    if (!project) return;
    setProject(p => p ? ({ ...p, storyboards: p.storyboards.map(sb => {
      const charNames = p.characters.map(a => a.name).filter(n => sb.rawScript.includes(n)).slice(0, 2);
      const sceneNames = p.scenes.map(a => a.name).filter(n => sb.rawScript.includes(n)).slice(0, 1);
      const propNames = p.props.map(a => a.name).filter(n => sb.rawScript.includes(n)).slice(0, 1);
      const ch = charNames.length ? charNames : p.characters.slice(0, 2).map(a => a.name);
      const sc = sceneNames.length ? sceneNames : p.scenes.slice(0, 1).map(a => a.name);
      const pr = propNames.length ? propNames : p.props.slice(0, 1).map(a => a.name);
      const character = ch[0] || '主角';
      const scene = sc[0] || '场景';
      const prop = pr[0] || '道具';
      const vid = makeVideoPrompt(character, scene, prop, sb.rawScript.slice(0, 160), p.styleName, styleWord);
      return { ...sb, characters: ch, scenes: sc, props: pr, videoPrompt: vid };
    }) }) : p);
    showToast('已批量匹配，分镜引用已更新', 'success');
  }, [project, styleWord, showToast]);

  const handleBatchGen = useCallback(async (ids: string[], opts: { model: string; resolution: string; ratio: string }) => {
    if (!ids.length) return;
    showToast('批量生成中…', 'info');
    const size = genSize(opts.ratio || '16:9', opts.resolution || '1k');
    let ok = 0;
    for (const id of ids) {
      const a = assetById(id);
      if (a && await genAsset(id, a.name + '，' + a.imageSummary, { model: opts.model, size })) ok++;
    }
    showToast('批量生成完成：成功 ' + ok + ' 个', 'success');
  }, [assetById, genAsset, showToast]);

  const setAssetVoice = useCallback((id: string, voiceConfig: VoiceConfig | string) => {
    // 统一序列化为 JSON 字符串存储（兼容旧版字符串格式）
    const stored = typeof voiceConfig === 'string' ? voiceConfig : JSON.stringify(voiceConfig);
    setProject(p => p ? ({ ...p,
      characters: p.characters.map(a => a.id === id ? { ...a, voice: stored } : a),
      scenes: p.scenes.map(a => a.id === id ? { ...a, voice: stored } : a),
      props: p.props.map(a => a.id === id ? { ...a, voice: stored } : a),
    }) : p);
  }, []);

  const addNewAsset = useCallback((data: { name: string; kind: DramartAssetItem['kind']; imageSummary: string; prompt?: string; img?: string; voice?: string }) => {
    const trimmed = String(data.name || '').trim();
    if (!trimmed) { showToast('请填写名称', 'error'); return; }
    const item: DramartAssetItem = { id: 'as_' + Date.now().toString(36), name: trimmed, kind: data.kind, imageSummary: data.imageSummary || trimmed, hue: 210, img: data.img, prompt: data.prompt, count: 1, voice: data.voice, variants: [{ id: 'va_' + Date.now().toString(36), label: '主形象', img: data.img }] };
    setProject(p => p ? ({ ...p,
      characters: data.kind === 'character' ? [...p.characters, item] : p.characters,
      scenes: data.kind === 'scene' ? [...p.scenes, item] : p.scenes,
      props: data.kind === 'prop' ? [...p.props, item] : p.props,
    }) : p);
    showToast(trimmed + ' 已添加' + (data.voice ? '（含音色配置）' : ''), 'success');
  }, [showToast]);

  const collectAsset = useCallback((a: DramartAssetItem) => {
    if (!a.img) { showToast('该角色尚未生成图片，无法保存', 'error'); return; }
    try { addAsset({ name: a.name, type: 'image', path: a.img, thumbnail: a.img, size: 0, sourceType: 'drama' }); showToast('已保存到资产库', 'success'); }
    catch { showToast('保存到资产库失败', 'error'); }
  }, [addAsset, showToast]);

  // AI 生成主形象：直接打开统一的生成窗口（与变装生成一致，含参数栏与资产库选择）
  const openAiGen = useCallback((a: DramartAssetItem) => {
    const mainVariant = a.variants?.find(v => v.label === '主形象') || a.variants?.[0];
    setGenOpen({ assetId: a.id, variantId: mainVariant?.id || '' });
  }, []);

  const pickFromAssets = useCallback((assetId: string) => {
    if (!pickerAsset) return;
    const item = assets[assetId];
    const img = item?.thumbnail || item?.path || '';
    if (img) updateAssetImg(pickerAsset.id, img);
    setPickerAsset(null);
  }, [pickerAsset, assets, updateAssetImg]);

  const onUploadFile = useCallback((file: File | null) => {
    if (!file || !uploadAsset) return;
    const reader = new FileReader();
    reader.onload = () => { const url = String(reader.result || ''); if (url) updateAssetImg(uploadAsset.id, url); setUploadAsset(null); };
    reader.readAsDataURL(file);
  }, [uploadAsset, updateAssetImg]);

  const onExportAsset = useCallback((a: DramartAssetItem) => {
    showToast('导出资产：' + a.name, 'info');
  }, [showToast]);


  // ==================== 背景 ====================
  const bg = (
    <div className="dwc-glow" aria-hidden="true" />
  );

  return (
    <div className="drama-workshop-page">
      {bg}
      {stage === 'create' && (
        <div className="dwc-create">
          <button className="dwc-history-btn" onClick={() => setHistoryOpen(true)} title="创作历史">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            创作历史
          </button>
          <h1 className="dwc-title">翻开剧本，<span className="dwc-title-accent">创作精品短剧</span></h1>
          <div className="dwc-create-card">
          {mode === 'manual' && !dramartDraft && (
            <button className="dwc-jump-drama" onClick={() => setActiveSection('drama')}>
              <div className="dwc-upload-icon"><ClapperboardIcon size={34} /></div>
              <div className="dwc-upload-hint">点击跳转剧创进行剧本创作</div>
            </button>
          )}
          {mode === 'manual' && dramartDraft && (
            <div className="dwc-draft-banner">
              <div className="dwc-upload-icon"><ClapperboardIcon size={34} /></div>
              <div className="dwc-upload-hint">已经成功提交剧本，请选择参数立即创作</div>
            </div>
          )}
            <div
              className={`dwc-upload${dragging ? ' dragging' : ''}${scriptFile ? ' has-file' : ''}${mode === 'manual' ? ' hidden' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files?.[0] || null); }}
            >
              <input ref={fileRef} type="file" accept=".doc,.docx,.txt,.pdf,.md" hidden onChange={e => { handleFile(e.target.files?.[0] || null); e.target.value = ''; }} />
              <div className="dwc-upload-icon"><FileTextIcon size={32} /></div>
              {scriptFile ? (
                <div className="dwc-file-chip">
                  <FileTextIcon size={15} />
                  <span>{scriptFile.name}</span>
                  <span className="dwc-file-size">{(scriptFile.size / 1024).toFixed(1)} KB</span>
                  <button className="dwc-file-remove" onClick={e => { e.stopPropagation(); setScriptFile(null); }}><CloseIcon size={14} /></button>
                </div>
              ) : (
                <div className="dwc-upload-hint">点击或拖拽剧本至此处，支持 doc、docx、txt、pdf 和 md 格式，文件大小不超过 20M</div>
              )}
            </div>
            <div className="dwc-config-row">
              <div className="dwc-mode-switch">
                <button className={`dwc-mode-btn${mode === 'agent' ? ' active' : ''}`} onClick={() => setMode('agent')}>Agent模式</button>
                <button className={`dwc-mode-btn${mode === 'manual' ? ' active' : ''}`} onClick={() => setMode('manual')}>剧创模式</button>
              </div>
              <div className="dwc-config-right">
                <SimpleDropdown value={ratio} options={DRAMART_RATIOS.map(r => ({ id: r.id, label: r.label }))} onChange={setRatio} icon={<span className="dwc-ratio-icon" style={ratioIconStyle(ratio)} />} renderItemFrame={(id) => <span className="dwc-menu-item-ratio" style={ratioIconStyle(id)} />} title="比例" />
                <SimpleDropdown value={resolution} options={DRAMART_RESOLUTIONS.map(r => ({ id: r.id, label: r.label }))} onChange={setResolution} title="分辨率" />
                <div className="dwc-select" style={{ position: 'relative' }}>
                  <button className="dwc-select-trigger" onClick={() => setStyleOpen(o => !o)}>
                    <span className="dwc-select-avatar" style={thumbStyle(210, 'scene')}>{selectedStyle?.img ? <img src={selectedStyle.img} alt="" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}</span>
                    <span>{selectedStyle?.name}</span>
                    <span className="dwc-select-chev">▾</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <button className="dwc-create-btn" onClick={handleCreate} disabled={mode === 'manual' ? !dramartDraft : !scriptFile}>
            <ClapperboardIcon size={16} />
            创建短剧项目
          </button>
          <div className="dwc-footer">平台内容均由人工智能模型生成，不代表平台立场</div>
        </div>
      )}

      {stage === 'analyze' && (
        <div className="dwc-analyze">
          <div className="dwc-analyze-card">
            <h2 className="dwc-analyze-title">正在{analyzing.label}</h2>
            <p className="dwc-analyze-sub">{analyzeSub}</p>
            <div className="dwc-progress-track"><div className="dwc-progress-fill" style={{ width: `${analyzing.percent}%` }} /></div>
            <div className="dwc-steps">
              {DRAMART_ANALYSIS_STEPS.map((s, i) => {
                const isDone = analyzing.percent >= ((i + 1) / Math.max(analyzing.total, DRAMART_ANALYSIS_STEPS.length)) * 100;
                const isActive = analyzing.label === s;
                return (
                  <div key={s} className={`dwc-step${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}>
                    <div className="dwc-step-dot">{isDone ? <CheckIcon size={14} /> : <span>{i + 1}</span>}</div>
                    <div className="dwc-step-label">{s}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {stage === 'script' && project && (
        <ScriptDetailView project={project} onNext={() => setStage('sets')} onBack={handleReset} onRename={(name) => setProject(p => p ? ({ ...p, name }) : p)} onSupply={() => setSupplementOpen(true)} onGo={goTo} />
      )}

      {stage === 'sets' && project && (
        <div className="dwc-sets">
          <div className="dwc-top-bar">
            <button className="dwc-back" onClick={handleReset}><ChevronLeftIcon size={16} /> 返回</button>
            {editingName ? (
              <input className="dwc-name-input" value={nameInput} autoFocus onChange={e => setNameInput(e.target.value)}
                onBlur={() => { setProject(p => p ? ({ ...p, name: nameInput.trim() || p.name }) : p); setEditingName(false); }}
                onKeyDown={e => { if (e.key === 'Enter') { setProject(p => p ? ({ ...p, name: nameInput.trim() || p.name }) : p); setEditingName(false); } if (e.key === 'Escape') setEditingName(false); }}
              />
            ) : (
              <div className="dwc-project-name" style={{ cursor: 'pointer' }} onClick={() => { setNameInput(project.name); setEditingName(true); }}><span className="dwc-edit-icon"><EditIcon size={13} /></span>{project.name}</div>
            )}
            <div className="dwc-meta">
              <span className="dwc-meta-item ratio"><span className="dwc-ratio-icon" style={ratioIconStyle(project.ratio)} /> {project.ratio}</span>
              <span className="dwc-meta-item">{project.resolution}</span>
              <span className="dwc-meta-item">{project.styleName}</span>
            </div>
            <button className="dwc-view-script" onClick={() => setScriptOpen(true)}>查看剧本</button>
            <button className="dwc-supply-btn dwc-tip" data-tip="请仅上传新增剧本部分，剔除已解析完成的剧本内容以缩短解析时间" onClick={() => setSupplementOpen(true)}><PlusIcon size={13} /> 补充剧本</button>
          </div>
          <div className="dwc-step-ribbon">
            {[
              { key: 'script', label: '剧本', icon: <FileTextIcon size={15} />, done: true, target: 'script' as Stage },
              { key: 'sets', label: '设定', icon: <ImageIcon size={15} />, done: true, active: true },
              { key: 'storyboard', label: '分镜', icon: <VideoIcon size={15} />, done: false, target: 'storyboard' as Stage },
              { key: 'video', label: '视频', icon: <PlayIcon size={15} />, done: false, target: 'video' as Stage },
            ].map(r => (
              <div key={r.key} className={`dwc-ribbon-step${r.target ? ' clickable' : ''}${r.active ? ' active' : ''}${r.done ? ' done' : ''}`} onClick={r.target ? () => goTo(r.target) : undefined} style={{ cursor: r.target ? 'pointer' : 'default' }}>
                <span className="dwc-ribbon-icon">{r.icon}</span>
                <span>{r.label}</span>
              </div>
            ))}
          </div>
          <div className="dwc-sets-body">
            <div className="dwc-tabs-row">
              <div className="dwc-tabs">
                {(['character', 'scene', 'prop'] as Tab[]).map(t => (
                  <button key={t} className={`dwc-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>
                ))}
              </div>
              <div className="dwc-sets-right">
                <div className="dwc-stats">
                  <span className="dwc-stat"><b>{TAB_LABEL[tab]}总计</b> {stats.total}</span>
                  <span className="dwc-stat ok">已生成 <b>{stats.generated}</b></span>
                  <span className="dwc-stat">生成中 <b>0</b></span>
                  <span className="dwc-stat err">失败 <b>0</b></span>
                </div>
                <div className="dwc-actions">
                  <button className="dwc-action-btn" onClick={() => setAddOpen(true)}><PlusIcon size={14} /> 添加{TAB_LABEL[tab] === '道具' ? '道具' : TAB_LABEL[tab]}</button>
                  <button className="dwc-action-btn" onClick={() => setBatchOpen(true)}><BoltIcon size={14} /> 批量生成</button>
                  <button className="dwc-action-btn" onClick={matchStoryboards}><RefreshIcon size={14} /> 批量匹配</button>
                </div>
              </div>
            </div>
            <div className="dwc-sets-main">
              <div className="dwc-cards">
                {TAB_STAT_KEY[tab](project).map(a => {
                  const isSel = assetById(detailAssetId)?.id === a.id;
                  return (
                    <div key={a.id} className="dwc-card-item">
                      <div className={`dwc-card${isSel ? ' selected' : ''}`} onClick={() => { setDetailAssetId(a.id); setMenuAssetId(null); }}>
                        <div className="dwc-card-hover" onClick={e => e.stopPropagation()}>
                          <button className="dwc-card-hover-btn" title="AI生成主形象" onClick={() => openAiGen(a)}><ImageIcon size={15} /></button>
                          <button className="dwc-card-hover-btn" title="从资产库选择" onClick={() => setPickerAsset(a)}><AssetsIcon size={15} /></button>
                          <button className="dwc-card-hover-btn" title="本地上传" onClick={() => setUploadAsset(a)}><UploadIcon size={15} /></button>
                          <button className="dwc-card-hover-btn" title="更多" onClick={() => setMenuAssetId(m => m === a.id ? null : a.id)}>···</button>
                        </div>
                        {menuAssetId === a.id && (
                          <div className="dwc-card-menu" onClick={e => e.stopPropagation()}>
                            <button className="dwc-card-menu-item" onClick={() => { removeAsset(a.id); setMenuAssetId(null); }}><TrashIcon size={14} /> 删除{TAB_LABEL[tab] === '道具' ? '道具' : TAB_LABEL[tab]}</button>
                          </div>
                        )}
                        <div className="dwc-card-thumb" style={a.img ? undefined : thumbStyle(a.hue, a.kind)}>
                          {a.img ? <img src={a.img} alt={a.name} className="dwc-card-thumb-img" /> : <ImageIcon size={36} />}
                        </div>
                      </div>
                      <div className="dwc-card-caption">{a.name}</div>
                      <div className="dwc-card-count">{(a.variants?.length || a.count)}个形象</div>
                      <div className="dwc-card-desc" data-full={a.imageSummary}>{a.imageSummary}</div>
                      {a.kind === 'character' && <button className="dwc-card-voice" onClick={e => { e.stopPropagation(); setVoiceAsset(a); }}><MicrophoneIcon size={14} /> 配置音色</button>}
                    </div>
                  );
                })}
              </div>
              {assetById(detailAssetId) && (
                <div className="dwc-overlay" onClick={() => setDetailAssetId(null)}>
                  <div className="dwc-asset-modal" onClick={e => e.stopPropagation()}>
                    <AssetDetailPanel
                      asset={assetById(detailAssetId)!}
                      kindLabel={TAB_LABEL[tab]}
                      styleName={project?.styleName || selectedStyle?.name || ''}
                      episode={Math.max(1, project?.storyboards?.length || 1)}
                      onClose={() => setDetailAssetId(null)}
                      onRename={renameAsset}
                      onCollect={collectAsset}
                      onAddVariant={addVariant}
                      onGenVariant={genVariant}
                      onSetVariantCurrent={setVariantCurrent}
                      onRemoveVariant={removeVariant}
                      onPicker={() => setPickerAsset(assetById(detailAssetId)!)}
                      onUpload={() => setUploadAsset(assetById(detailAssetId)!)}
                      onOpenGen={openGen}
                    />
                  </div>
                </div>
              )}

              {genOpen && assetById(genOpen.assetId) && (
                <GenerationModal
                  asset={assetById(genOpen.assetId)!}
                  variantId={genOpen.variantId}
                  kindLabel={TAB_LABEL[tab]}
                  styleName={project?.styleName || selectedStyle?.name || ''}
                  onClose={closeGen}
                  onGen={genVariant}
                  onSetCurrent={setVariantCurrent}
                  onOpenPicker={() => setPickerAsset(assetById(genOpen.assetId)!)}
                />
              )}

              {batchOpen && (
                <BatchGenModal
                  items={TAB_STAT_KEY[tab](project)}
                  styleName={project?.styleName || selectedStyle?.name || ''}
                  modelOptions={genModelOptions}
                  onClose={() => setBatchOpen(false)}
                  onBatchGen={handleBatchGen}
                />
              )}

              {addOpen && (
                <AddAssetModal
                  kindLabel={TAB_LABEL[tab]}
                  styleName={project?.styleName || selectedStyle?.name || ''}
                  modelOptions={genModelOptions}
                  img={addImg}
                  onClose={() => setAddOpen(false)}
                  onAdd={addNewAsset}
                  onPicker={() => setAddPick(true)}
                />
              )}

              {addPick && (
                <AssetPickerModal assets={assets} onPick={(id) => { const a = assets[id]; if (a) setAddImg(a.thumbnail || a.path || ''); setAddPick(false); }} onClose={() => setAddPick(false)} />
              )}

              {voiceAsset && (
                <VoiceConfigModal asset={voiceAsset} onClose={() => setVoiceAsset(null)} onConfirm={(voiceConfig) => { setAssetVoice(voiceAsset.id, voiceConfig); showToast('音色已配置：' + voiceConfig.name, 'success'); }} />
              )}

              {historyOpen && (
                <div className="dwc-history-mask" onClick={() => setHistoryOpen(false)}>
                  <div className="dwc-history-panel" onClick={e => e.stopPropagation()}>
                    <div className="dwc-history-head"><span className="dwc-history-title">创作历史</span><button className="dwc-modal-close" onClick={() => setHistoryOpen(false)}><CloseIcon size={16} /></button></div>
                    <div className="dwc-history-list">
                      {(dramartProjects || []).length === 0 && <div className="dwc-history-empty">暂无创作历史</div>}
                      {(dramartProjects || []).map(p => (
                        <button key={p.id} className="dwc-history-item" onClick={() => openHistory(p)}>
                          <span className="dwc-history-cover" style={p.cover ? undefined : thumbStyle(210, 'scene')}>{p.cover ? <img src={p.cover} alt={p.name} /> : <ClapperboardIcon size={22} />}</span>
                          <span className="dwc-history-info">
                            <span className="dwc-history-name">{p.name}</span>
                            <span className="dwc-history-meta">{p.styleName || ''} · {p.ratio || ''} · {(p.storyboards?.length || 0)}集 · {new Date(p.createdAt || Date.now()).toLocaleDateString()}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="dwc-sets-footer">
            <div className="dwc-footer">平台内容均由人工智能模型生成，不代表平台立场</div>
            <button className="dwc-bottom-btn" onClick={() => { setStoryboardIndex(0); setStage('storyboard'); }}>
              <ClapperboardIcon size={15} /> 进入下一步
            </button>
          </div>
          {pickerAsset && (
            <AssetPickerModal assets={assets} onPick={pickFromAssets} onClose={() => setPickerAsset(null)} />
          )}
          {uploadAsset && (
            <UploadModal onPick={onUploadFile} onClose={() => setUploadAsset(null)} />
          )}
          {scriptOpen && project && (
            <ScriptModal script={project.scriptText} fileName={project.scriptFileName} onClose={() => setScriptOpen(false)} />
          )}
        </div>
      )}

      {stage === 'storyboard' && project && (
        <StoryboardView
          project={project}
          storyboards={project.storyboards}
          index={storyboardIndex}
          statusMap={sbStatus}
          urlMap={sbUrl}
          onSelectIndex={setStoryboardIndex}
          onBack={() => setStage('sets')}
          onGenerate={handleGenerateVideo}
          onNext={() => { setVideoIndex(0); setStage('video'); }}
          onGo={goTo}
          onEditPrompt={editSbPrompt}
          onSelectVideo={selectSbVideo}
          onAddAsset={addSbAsset}
        />
      )}

      {stage === 'video' && project && (
        <VideoView
          project={project}
          storyboards={project.storyboards}
          index={videoIndex}
          statusMap={sbStatus}
          urlMap={sbUrl}
          onSelectIndex={setVideoIndex}
          onBack={() => setStage('storyboard')}
          onGenerate={handleGenerateVideo}
          onGo={goTo}
        />
      )}

      {supplementOpen && project && (
        <SupplementScriptModal onConfirm={handleSupplement} onClose={() => setSupplementOpen(false)} />
      )}

      {customStyleOpen && (
        <CustomStyleModal onSave={handleCustomStyleSave} onClose={() => setCustomStyleOpen(false)} />
      )}

      {styleOpen && (
        <StyleLibrary selectedId={selectedStyle?.id || ''} onSelect={s => { setStyleId(s.id); setStyleOpen(false); }} onClose={() => setStyleOpen(false)} onCustomCreate={() => { setStyleOpen(false); setCustomStyleOpen(true); }} onCustomDelete={handleCustomStyleDelete} />
      )}
    </div>
  );
};

export default DramaWorkshopPage;
