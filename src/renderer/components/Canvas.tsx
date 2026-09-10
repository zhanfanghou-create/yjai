import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import './AssetPicker.css';
import './CanvasSidebar.css';
import './Canvas.css';
import {
  ReactFlow,
  Handle,
  Position,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node as FlowNode,
  type Edge as FlowEdge,
  Connection,
  ReactFlowProvider,
  Controls,
  SelectionMode,
} from '@xyflow/react';
import { useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore, AINode, AINodeType, getCallableRecommendedConfigs } from '../store/appStore';
import { normalizeFileSrc } from '../utils/pathUtils';
import { autoSaveMediaToAssets } from '../utils/assetAutoSave';
import { logoBase64 } from './logoBase64';
const SaveToPromptLibraryModal = React.lazy(() => import('./SaveToPromptLibraryModal').then(m => ({ default: m.SaveToPromptLibraryModal })));
const DirectorStageModal = React.lazy(() => import('./DirectorStageModal').then(m => ({ default: m.DirectorStageModal })));
const PanoramaViewerModal = React.lazy(() => import('./PanoramaViewerModal').then(m => ({ default: m.PanoramaViewerModal })));
import { CAMERA_MOVEMENTS, VIDEO_RATIO_OPTIONS, VIDEO_CLARITY_OPTIONS } from '../data/cameraMovements';
import { CameraMovementGallery } from './CameraMovementGallery';
import { RichPromptEditor } from './RichPromptEditor';
import './VideoParamBar.css';

// ==================== 节点模板（LiblibTV 风格） ====================

type CanvasIconName = 'text' | 'image' | 'video' | 'cut' | 'stage' | 'audio' | 'script' | 'box' | 'upload' | 'history' | 'star' | 'swap' | 'mic' | 'file' | 'close' | 'play' | 'save' | 'grid' | 'spark' | 'copy' | 'trash' | 'chevron-left' | 'chevron-right' | 'loading' | 'canvas' | 'pin' | 'pen' | 'rect' | 'type' | 'undo' | 'redo' | 'cursor' | 'panorama';

const SvgIcon = ({ name, size = 18 }: { name: CanvasIconName; size?: number }) => (
  <svg className="canvas-svg-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'text' ? <><path d="M4 6h16" /><path d="M8 6v12" /><path d="M16 6v12" /><path d="M6 18h12" /></> :
      name === 'image' ? <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="M21 15l-5-5L5 20" /></> :
      name === 'video' ? <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l4-3v12l-4-3" /></> :
      name === 'cut' ? <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="M8.6 8.6L20 20" /><path d="M8.6 15.4L20 4" /></> :
      name === 'stage' ? <><path d="M4 6h16v12H4z" /><path d="M8 6v12M16 6v12" /><path d="M4 10h16M4 14h16" /></> :
      name === 'audio' ? <><path d="M4 14h4l5 5V5L8 10H4z" /><path d="M17 9a4 4 0 010 6" /><path d="M19.5 6.5a8 8 0 010 11" /></> :
      name === 'script' ? <><path d="M6 3h9l3 3v15H6z" /><path d="M14 3v4h4" /><path d="M9 11h6M9 15h6" /></> :
      name === 'box' ? <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></> :
      name === 'upload' ? <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 20h16" /></> :
      name === 'history' ? <><path d="M3 12a9 9 0 109-9" /><path d="M3 4v6h6" /><path d="M12 7v5l3 2" /></> :
      name === 'star' ? <path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3z" /> :
      name === 'swap' ? <><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /><path d="M18 7l-3 3" /><path d="M6 17l3-3" /></> :
      name === 'mic' ? <><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z" /><path d="M19 11a7 7 0 01-14 0" /><path d="M12 18v3" /></> :
      name === 'file' ? <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h4" /></> :
      name === 'close' ? <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></> :
      name === 'play' ? <path d="M8 5v14l11-7z" /> :
      name === 'save' ? <><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></> :
      name === 'grid' ? <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></> :
      name === 'spark' ? <><path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" /></> :
      name === 'copy' ? <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" /></> :
      name === 'trash' ? <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 15h10l1-15" /></> :
      name === 'chevron-left' ? <path d="M15 18l-6-6 6-6" /> :
      name === 'chevron-right' ? <path d="M9 18l6-6-6-6" /> :
      name === 'loading' ? <><path d="M21 12a9 9 0 11-3-6.7" /><path d="M21 3v6h-6" /></> :
      name === 'pin' ? <><path d="M12 21s6-5.2 6-11a6 6 0 10-12 0c0 5.8 6 11 6 11z" /><circle cx="12" cy="10" r="2" /></> :
      name === 'pen' ? <><path d="M4 20l4.5-1 10-10a2.2 2.2 0 00-3.1-3.1l-10 10L4 20z" /><path d="M13.5 7.5l3 3" /></> :
      name === 'rect' ? <><rect x="5" y="5" width="14" height="14" rx="2" strokeDasharray="3 3" /></> :
      name === 'type' ? <><path d="M4 6h16" /><path d="M12 6v12" /><path d="M8 18h8" /></> :
      name === 'undo' ? <><path d="M9 7H4v5" /><path d="M4 12a8 8 0 018-8 8 8 0 017.2 4.5" /></> :
      name === 'redo' ? <><path d="M15 7h5v5" /><path d="M20 12a8 8 0 00-8-8 8 8 0 00-7.2 4.5" /></> :
      name === 'cursor' ? <><path d="M3 3l7 18 3-7 7-3-17-8z" /><path d="M14 14l6 6" /></> :
      name === 'panorama' ? <><path d="M3 7.5c3-1.4 6-2.1 9-2.1s6 .7 9 2.1v9c-3 1.4-6 2.1-9 2.1s-6-.7-9-2.1v-9z" /><path d="M3 10.5c3 1 6 1.5 9 1.5s6-.5 9-1.5" /><path d="M9 5.6v12.8" /><path d="M15 5.6v12.8" /></> :
      <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 15l3-3 2 2 3-4" /></>}
  </svg>
);

// 将输入文本中的 @参考图名 转为高亮 HTML：只有匹配到「已知参考图名称」才加背景色
const renderMentionHTML = (text: string, knownNames: string[] = []): string => {
  if (!text) return '';
  const sortedNames = [...knownNames].filter(Boolean).sort((a, b) => b.length - a.length);
  let html = '';
  let i = 0;
  const escapeChar = (c: string) => {
    if (c === '<') return '&lt;';
    if (c === '>') return '&gt;';
    if (c === '&') return '&amp;';
    if (c === '\n') return '<br>';
    return c;
  };
  while (i < text.length) {
    if (text[i] === '@') {
      let matchedName: string | null = null;
      for (const name of sortedNames) {
        if (text.startsWith(`@${name}`, i)) { matchedName = name; break; }
      }
      if (matchedName) {
        const safeName = matchedName.replace(/"/g, '&quot;');
        html += `<span class="mention-chip" contenteditable="false" data-mention="${safeName}">@${matchedName}</span>`;
        i += matchedName.length + 1;
        continue;
      }
    }
    html += escapeChar(text[i]);
    i += 1;
  }
  return html;
};

// 安全地从 contenteditable DOM 提取纯文本
const safeExtractText = (root: HTMLElement): string => {
  try {
    let text = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName;
        if (tag === 'BR') {
          text += '\n';
        } else if (el.classList && el.classList.contains('mention-chip')) {
          text += el.textContent || '';
        } else if (tag === 'DIV' || tag === 'P') {
          if (text.length > 0 && !text.endsWith('\n')) text += '\n';
          el.childNodes.forEach(walk);
        } else {
          el.childNodes.forEach(walk);
        }
      }
    };
    root.childNodes.forEach(walk);
    return text;
  } catch (e) {
    return root.textContent || '';
  }
};

// 安全获取光标偏移
const safeGetCaret = (root: HTMLElement): number => {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.endContainer)) return 0;
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  } catch (e) {
    return 0;
  }
};

// 安全设置光标偏移
const safeSetCaret = (root: HTMLElement, target: number) => {
  try {
    const textLen = (root.textContent || '').length;
    const safeTarget = Math.max(0, Math.min(target, textLen));
    let found = false;
    let offset = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    let node = walker.nextNode();
    while (node) {
      const len = (node.textContent || '').length;
      if (offset + len >= safeTarget) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, safeTarget - offset));
        range.collapse(true);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        found = true;
        break;
      }
      offset += len;
      node = walker.nextNode();
    }
    if (!found) {
      const range = document.createRange();
      range.selectNodeContents(root);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }
  } catch (e) {
    // 静默失败
  }
};

// 带 @提及高亮的文本输入：基于 contenteditable div，光标与文字天然同层
// 关键：不使用 dangerouslySetInnerHTML，完全由 ref 手动管理 DOM 内容，
// 避免 React 渲染阶段重设 innerHTML 导致光标重置到开头（倒着输入）
const MentionTextarea = React.forwardRef<HTMLDivElement, {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  mentionNames?: string[];
}>((props, ref) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const caretRef = useRef(0);
  const isComposingRef = useRef(false);
  const initializedRef = useRef(false);
  // 记录上一次从 DOM 提取的文本
  const lastDomTextRef = useRef('');
  // 标记下一次 value 变化是否由用户输入导致（用户输入时不更新 DOM）
  const valueFromUserInputRef = useRef(false);

  const setRefs = (el: HTMLDivElement | null) => {
    editorRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  // 同步外部 value 到 DOM
  // 规则：1) 首次挂载时设置初始内容；2) 外部程序化变更时更新 DOM；
  //       3) 用户输入导致的 value 变化绝不更新 DOM（避免光标重置）
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const newValue = props.value || '';

    // 首次挂载：设置初始内容
    if (!initializedRef.current) {
      initializedRef.current = true;
      const html = renderMentionHTML(newValue, props.mentionNames);
      if (el.innerHTML !== html) el.innerHTML = html;
      lastDomTextRef.current = newValue;
      return;
    }

    // 用户输入导致的 value 变化：不更新 DOM，只更新记录
    if (valueFromUserInputRef.current) {
      valueFromUserInputRef.current = false;
      lastDomTextRef.current = newValue;
      return;
    }

    // 外部 value 与当前 DOM 文本相同：不更新
    if (newValue === lastDomTextRef.current) return;

    // 外部程序化变更：更新 DOM 并恢复光标和滚动位置
    lastDomTextRef.current = newValue;
    const html = renderMentionHTML(newValue, props.mentionNames);
    if (el.innerHTML !== html) {
      try {
        const sel = window.getSelection();
        const hasFocus = el.contains(document.activeElement) ||
          (sel && sel.rangeCount > 0 && sel.anchorNode && el.contains(sel.anchorNode));
        const caret = hasFocus ? safeGetCaret(el) : -1;
        // 保存滚动位置
        const scrollTop = el.scrollTop;
        const scrollLeft = el.scrollLeft;
        el.innerHTML = html;
        // 恢复滚动位置
        el.scrollTop = scrollTop;
        el.scrollLeft = scrollLeft;
        if (hasFocus && caret >= 0) {
          safeSetCaret(el, Math.min(caret, newValue.length));
        }
      } catch (e) {
        // 静默失败
      }
    }
  }, [props.value, props.mentionNames]);

  const handleInput = () => {
    // 输入法组合期间不提取文本（避免把拼音英文提取进去）
    if (isComposingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    try {
      const text = safeExtractText(el);
      const caret = safeGetCaret(el);
      caretRef.current = caret;
      lastDomTextRef.current = text;
      // 标记这次 value 变化由用户输入导致，useEffect 中不更新 DOM
      valueFromUserInputRef.current = true;
      props.onChange(text);
      // 检测 @ 唤起
      const atIdx = text.lastIndexOf('@', Math.max(0, caret - 1));
      if (atIdx >= 0 && !text.slice(atIdx, caret).includes(' ')) {
        setMentionQuery(text.slice(atIdx + 1, caret));
        setMentionOpen(true);
      } else {
        setMentionOpen(false);
      }
    } catch (e) {
      // 静默失败
    }
  };

  const pickMention = (name: string) => {
    const el = editorRef.current;
    if (!el) return;
    try {
      const v = lastDomTextRef.current;
      const pos = caretRef.current;
      const atIdx = v.lastIndexOf('@', Math.max(0, pos - 1));
      const start = atIdx >= 0 ? atIdx : pos;
      const next = v.slice(0, start) + '@' + name + v.slice(pos);
      // 这是程序化更新，需要更新 DOM
      valueFromUserInputRef.current = false;
      lastDomTextRef.current = next;
      props.onChange(next);
      setMentionOpen(false);
      const targetCaret = start + 1 + name.length;
      requestAnimationFrame(() => {
        if (editorRef.current) {
          try {
            const html = renderMentionHTML(next, props.mentionNames);
            // 保存滚动位置
            const scrollTop = editorRef.current.scrollTop;
            const scrollLeft = editorRef.current.scrollLeft;
            if (editorRef.current.innerHTML !== html) editorRef.current.innerHTML = html;
            // 恢复滚动位置
            editorRef.current.scrollTop = scrollTop;
            editorRef.current.scrollLeft = scrollLeft;
            safeSetCaret(editorRef.current, targetCaret);
            editorRef.current.focus();
          } catch (e) {
            // 静默失败
          }
        }
      });
    } catch (e) {
      // 静默失败
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    try {
      if (e.key === '@' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        requestAnimationFrame(() => {
          const el = editorRef.current;
          if (el) {
            caretRef.current = safeGetCaret(el);
            setMentionOpen(true);
            setMentionQuery('');
          }
        });
      }
      if (e.key === 'Escape') setMentionOpen(false);
      if ((e.key === 'Enter' || e.key === 'Tab') && mentionOpen) {
        e.preventDefault();
        const f = (props.mentionNames || []).find(n => !mentionQuery || n.toLowerCase().includes(mentionQuery.toLowerCase()));
        if (f) pickMention(f); else setMentionOpen(false);
        return;
      }
      props.onKeyDown?.(e);
    } catch (err) {
      // 静默失败
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    try {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    } catch (err) {
      // 静默失败
    }
  };

  // 输入法组合开始：标记为组合中，不提取文本
  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };
  // 输入法组合结束：组合完成后触发一次 input 处理
  const handleCompositionEnd = () => {
    isComposingRef.current = false;
    // 组合结束后手动触发一次文本提取
    handleInput();
  };

  const filtered = (props.mentionNames || []).filter(n => !mentionQuery || n.toLowerCase().includes(mentionQuery.toLowerCase()));
  const minHeight = props.rows ? `${props.rows * 19.5 + 16}px` : undefined;

  return (
    <div className="mention-textarea-wrap" style={minHeight ? { minHeight } : undefined}>
      <div
        ref={setRefs}
        className={`mention-textarea-input ${props.className || ''}`}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onPointerDown={props.onPointerDown}
        onMouseDown={props.onMouseDown}
        data-placeholder={props.placeholder || ''}
        spellCheck={false}
      />
      {mentionOpen && (
        <div className="mention-dropdown" onMouseDown={e => e.preventDefault()}>
          {filtered.length === 0 ? <div className="mention-empty">无匹配引用</div> : filtered.map(n => (<button key={n} className="mention-item" onClick={() => pickMention(n)}><span className="mention-item-icon">@</span><span className="mention-item-name">{n}</span></button>))}
        </div>
      )}
    </div>
  );
});




// 3D 导演台默认场景缩略图：透视网格地面 + 人物 + 摄影机，画布上一眼可辨识
const DirectorScenePreview = () => (
  <svg className="lib-node-scene-svg" viewBox="0 0 280 176" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="dsSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#132033" />
        <stop offset="1" stopColor="#0a1420" />
      </linearGradient>
      <linearGradient id="dsFloor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1c3a2e" />
        <stop offset="1" stopColor="#0f2119" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="280" height="176" fill="url(#dsSky)" />
    <rect x="0" y="104" width="280" height="72" fill="url(#dsFloor)" />
    <g stroke="#10b981" strokeOpacity="0.35" strokeWidth="1">
      <line x1="0" y1="120" x2="280" y2="120" />
      <line x1="0" y1="140" x2="280" y2="140" />
      <line x1="0" y1="162" x2="280" y2="162" />
      <line x1="40" y1="104" x2="-30" y2="176" />
      <line x1="100" y1="104" x2="70" y2="176" />
      <line x1="160" y1="104" x2="160" y2="176" />
      <line x1="220" y1="104" x2="250" y2="176" />
      <line x1="280" y1="104" x2="330" y2="176" />
    </g>
    <g fill="#e2e8f0" opacity="0.92">
      <circle cx="150" cy="70" r="11" />
      <rect x="140" y="82" width="20" height="34" rx="8" />
      <rect x="134" y="88" width="8" height="24" rx="4" />
      <rect x="158" y="88" width="8" height="24" rx="4" />
      <rect x="142" y="114" width="7" height="24" rx="3" />
      <rect x="151" y="114" width="7" height="24" rx="3" />
    </g>
    <g transform="translate(214,58)" fill="#fbbf24">
      <rect x="0" y="4" width="26" height="16" rx="3" />
      <path d="M26 8 L38 2 L38 22 L26 16 Z" />
      <circle cx="6" cy="0" r="4" fill="#0f2119" stroke="#fbbf24" strokeWidth="2" />
      <circle cx="18" cy="0" r="4" fill="#0f2119" stroke="#fbbf24" strokeWidth="2" />
    </g>
  </svg>
);

// 全景图默认场景缩略图：720° 球面经纬网格 + 中心热点
const PanoramaScenePreview = () => (
  <svg className="lib-node-scene-svg" viewBox="0 0 280 176" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="pnSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#3b2f10" />
        <stop offset="0.5" stopColor="#78551a" />
        <stop offset="1" stopColor="#2a1c08" />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="280" height="176" fill="url(#pnSky)" />
    <g stroke="#fcd34d" strokeOpacity="0.5" strokeWidth="1.2" fill="none">
      <path d="M40 8 C 20 60, 20 116, 40 168" />
      <path d="M90 6 C 78 60, 78 116, 90 170" />
      <path d="M140 4 L140 172" />
      <path d="M190 6 C 202 60, 202 116, 190 170" />
      <path d="M240 8 C 260 60, 260 116, 240 168" />
    </g>
    <g stroke="#fcd34d" strokeOpacity="0.5" strokeWidth="1.2" fill="none">
      <path d="M12 50 Q 140 34, 268 50" />
      <path d="M6 88 L274 88" />
      <path d="M12 126 Q 140 142, 268 126" />
    </g>
    <circle cx="140" cy="88" r="16" fill="#fde68a" fillOpacity="0.85" />
    <circle cx="140" cy="88" r="26" fill="none" stroke="#fde68a" strokeOpacity="0.45" strokeWidth="2" />
  </svg>
);

const iconForType = (type?: string): CanvasIconName => {
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'document') return 'file';
  return 'box';
};

// 从视频地址提取第一帧作为缩略图（用于参考图缩略图显示，避免读取不到缩略图）
const captureVideoFirstFrame = (videoUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = videoUrl;
      const cleanup = () => {
        video.removeAttribute('src');
        try { video.load(); } catch {}
      };
      const drawFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 320;
          canvas.height = video.videoHeight || 180;
          const ctx = canvas.getContext('2d');
          if (!ctx) { cleanup(); reject(new Error('no ctx')); return; }
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          cleanup();
          resolve(dataUrl);
        } catch (err) {
          cleanup();
          reject(err);
        }
      };
      video.onloadeddata = () => {
        // 跳到首帧稍后位置，确保有画面
        try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); } catch { drawFrame(); }
      };
      video.onseeked = drawFrame;
      video.onerror = () => { cleanup(); reject(new Error('video load error')); };
      // 兜底：超时后直接尝试绘制当前帧
      window.setTimeout(() => { if (video.readyState >= 2) drawFrame(); }, 2500);
    } catch (err) {
      reject(err);
    }
  });
};

const composePromptParts = (...parts: Array<string | undefined>) => {
  const seen = new Set<string>();
  return parts
    .map(part => (part || '').trim())
    .filter(part => {
      if (!part || seen.has(part)) return false;
      seen.add(part);
      return true;
    })
    .join('\n\n');
};

const NODE_TEMPLATES: { type: AINodeType | 'upload' | 'history-select' | 'panorama'; label: string; icon: CanvasIconName; color: string; desc: string }[] = [
  { type: 'story-script',    label: '文本',       icon: 'text', color: '#e0e0e0', desc: '剧本、广告词、品牌文案' },
  { type: 'text-to-image',   label: '图片',       icon: 'image', color: '#00D4FF', desc: '海报、分镜、角色设计' },
  { type: 'text-to-video',   label: '视频',       icon: 'video', color: '#8b5cf6', desc: '创意广告、动画、电影' },
  { type: 'director-stage',  label: '3D导演台',     icon: 'stage', color: '#10b981', desc: '搭建3D场景，截图作为构图参考' },
  { type: 'panorama',        label: '全景图',       icon: 'panorama', color: '#f59e0b', desc: '生成720°全景场景，点击进入全景漫游' },
  { type: 'audio2video',     label: '音频',       icon: 'audio', color: '#ec4899', desc: '音效、配音、音乐' },
];

// 节点分类
const NODE_BASE_NAMES: Partial<Record<AINodeType, string>> = {
  'story-script': '文本节点',
  'story-script-adv': '脚本节点',
  'text-to-image': '图片节点',
  'image-to-image': '图片节点',
  'image-upscale': '图片放大节点',
  'text-to-video': '视频节点',
  'image-to-video': '图生视频节点',
  'img2video': '图生视频节点',
  'frame-to-video': '图生视频节点',
  'video-composite': '视频合成节点',
  'video-extend': '视频延长节点',
  'video-remix': '视频重绘节点',
  'video-super-resolution': '视频超分节点',
  'video-to-music': '视频配乐节点',
  'video-interpolate': '视频插帧节点',
  'video-realtime': '实时视频节点',
  'audio2video': '音频节点',
  'tts': '语音节点',
  'audio-to-text': '转写节点',
  'lip-sync': '对口型节点',
  'live-portrait': '肖像动效节点',
  'subtitle': '字幕节点',
  'director-stage': '导演台节点',
  'material-lib': '素材节点',
  'result': '结果节点',
};

const getNodeBaseName = (type?: AINodeType) => {
  if (!type) return '节点';
  return NODE_BASE_NAMES[type] || `${NODE_TEMPLATES.find(t => t.type === type)?.label || '节点'}节点`;
};

const getNodeDisplayName = (node?: AINode) => {
  const name = node?.options?.displayName;
  return typeof name === 'string' && name.trim() ? name.trim() : getNodeBaseName(node?.type);
};

const createNodeDisplayName = (type: AINodeType, nodes: Record<string, AINode>) => {
  const baseName = getNodeBaseName(type);
  const sameTypeCount = Object.values(nodes || {}).filter(node => node.type === type).length;
  return sameTypeCount === 0 ? baseName : `${baseName}${sameTypeCount + 1}`;
};

const getCanvasFirstImageThumbnail = (nodes: Record<string, AINode>) => {
  const orderedNodes = Object.values(nodes || {}).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const imageNode = orderedNodes.find(node => {
    const refs = Array.isArray(node.options?.referenceImages) ? node.options.referenceImages : [];
    return (node.result?.type === 'image' && !!node.result.url) || !!node.thumbnail || !!node.options?.sourceImage || !!refs[0]?.url;
  });
  if (!imageNode) return undefined;
  const refs = Array.isArray(imageNode.options?.referenceImages) ? imageNode.options.referenceImages : [];
  return imageNode.result?.type === 'image' && imageNode.result.url
    ? imageNode.result.url
    : imageNode.thumbnail || imageNode.options?.sourceImage || refs[0]?.url;
};

const IMAGE_NODE_TYPES: AINodeType[] = ['text-to-image'];
const VIDEO_NODE_TYPES: AINodeType[] = ['text-to-video', 'img2video', 'audio2video', 'frame-to-video', 'video-composite'];
const TEXT_NODE_TYPES: AINodeType[] = ['story-script', 'story-script-adv'];
const VIDEO_INPUT_NODE_TYPES: AINodeType[] = [
  'text-to-video',
  'image-to-video',
  'img2video',
  'frame-to-video',
  'audio2video',
  'video-extend',
  'video-remix',
  'lip-sync',
  'video-super-resolution',
  'live-portrait',
  'image-to-image',
  'image-upscale',
  'video-to-music',
  'video-interpolate',
  'video-realtime',
  'video-composite',
  'subtitle',
];

const IMAGE_INPUT_NODE_TYPES: AINodeType[] = ['text-to-image', 'image-to-image', 'image-upscale'];

const VIDEO_INPUT_FEATURES: { id: string; label: string; icon: CanvasIconName; placeholder: string }[] = [
  { id: 'text-to-video', label: '文生视频', icon: 'video', placeholder: '根据文字描述生成视频。' },
  { id: 'reference', label: '全能参考', icon: 'spark', placeholder: '填写参考要求、风格、镜头或约束。' },
  { id: 'image-to-video', label: '图生视频', icon: 'image', placeholder: '上传或选择参考图，生成视频。' },
  { id: 'first-frame', label: '首尾帧', icon: 'cut', placeholder: '描述首帧、尾帧和过渡效果。' },
  { id: 'image-reference', label: '图片参考', icon: 'image', placeholder: '添加图片参考说明。' },
  { id: 'marker', label: '标记', icon: 'grid', placeholder: '标记需要强调或避免的内容。' },
  { id: 'reference-extra', label: '参考', icon: 'cursor', placeholder: '点击画布图片节点选择参考图。' },
  { id: 'asset', label: '资产', icon: 'box', placeholder: '从资产库选择参考图。' },
];

const IMAGE_INPUT_FEATURES: { id: string; label: string; icon: CanvasIconName; placeholder: string }[] = [
  { id: 'text-to-image', label: '文生图', icon: 'image', placeholder: '输入文字生成图片，或上传图片后编辑。' },
  { id: 'image-upscale', label: '图片高清', icon: 'spark', placeholder: '描述图片高清、放大、细节增强要求。' },
  { id: 'marker', label: '标记', icon: 'grid', placeholder: '在参考图上标数字，也可以画运镜线。' },
  { id: 'reference-extra', label: '参考', icon: 'cursor', placeholder: '点击画布图片节点选择参考图。' },
  { id: 'upload', label: '上传参考图', icon: 'upload', placeholder: '上传参考图。' },
  { id: 'asset', label: '资产', icon: 'box', placeholder: '从资产库选择参考图。' },
];

const IMAGE_QUALITY_OPTIONS = [
  { id: 'low', label: '低画质' },
  { id: 'standard', label: '标准画质' },
  { id: 'high', label: '高画质' },
];

const IMAGE_CLARITY_OPTIONS = ['1K', '2K', '4K'];

const IMAGE_RATIO_OPTIONS = [
  { id: 'auto', label: '自适应', wide: false },
  { id: '1:1', label: '1:1', wide: false },
  { id: '1:2', label: '1:2', wide: false },
  { id: '2:1', label: '2:1', wide: true },
  { id: '9:16', label: '9:16', wide: false },
  { id: '16:9', label: '16:9', wide: true },
  { id: '3:4', label: '3:4', wide: false },
  { id: '4:3', label: '4:3', wide: true },
  { id: '3:2', label: '3:2', wide: true },
  { id: '2:3', label: '2:3', wide: false },
  { id: '5:4', label: '5:4', wide: true },
  { id: '4:5', label: '4:5', wide: false },
  { id: '21:9', label: '21:9', wide: true },
  { id: '9:21', label: '9:21', wide: false },
];

const IMAGE_MEDIA_TOOL_FEATURES = [
  { id: 'reference', label: '全景', icon: 'spark' as CanvasIconName, prompt: '以当前图片为全景参考，保持画面主体和整体构图。', badge: 'NEW' },
  { id: 'multi-angle', label: '多角度', icon: 'swap' as CanvasIconName, prompt: '以当前图片为主体，生成多个不同视角和镜头角度。' },
  { id: 'lighting', label: '打光', icon: 'star' as CanvasIconName, prompt: '以当前图片为基础，优化光影、打光层次和氛围。' },
  { id: 'nine-grid', label: '九宫格', icon: 'grid' as CanvasIconName, prompt: '以当前图片为基础，生成九宫格构图或九宫格分镜。' },
  { id: 'upscale', label: '高清', icon: 'spark' as CanvasIconName, prompt: '以当前图片为基础，提升清晰度、细节和画质。' },
  { id: 'split', label: '宫格切分', icon: 'cut' as CanvasIconName, prompt: '将当前图片按宫格切分，保持每格内容完整可用。' },
] as const;

const TOOLBAR_SPLIT_OPTIONS = [
  { id: '2x2', label: '4宫格 (2×2)', grid: 4 },
  { id: '3x3', label: '9宫格 (3×3)', grid: 9 },
  { id: '4x4', label: '16宫格 (4×4)', grid: 16 },
  { id: '5x5', label: '25宫格 (5×5)', grid: 25 },
] as const;

const HD_FEATURES = [
  { id: 'upscale', label: '高清', icon: 'spark' as CanvasIconName, generationType: 'image-upscale', prompt: '以当前图片为基础进行高清增强，提升清晰度、细节、锐度和整体画质，保持原图内容不变。' },
  { id: 'outpaint', label: '扩图', icon: 'canvas' as CanvasIconName, generationType: 'image-to-image', prompt: '以当前图片为中心进行扩图，补齐画面外延内容，保持构图、光影、风格和主体一致。' },
  { id: 'redraw', label: '重绘', icon: 'swap' as CanvasIconName, generationType: 'image-to-image', prompt: '以当前图片为参考进行局部或整体重绘，优化瑕疵和细节，保持主体身份、布局和风格一致。' },
  { id: 'erase', label: '擦除', icon: 'close' as CanvasIconName, generationType: 'image-to-image', prompt: '以当前图片为参考执行擦除修复，移除指定瑕疵或不需要的元素，并自然补全背景。' },
  { id: 'cutout', label: '抠图', icon: 'cut' as CanvasIconName, generationType: 'image-to-image', prompt: '识别当前图片主体并进行精细抠图，保留主体完整边缘，输出可用于后续合成的干净结果。' },
  { id: 'crop', label: '裁剪', icon: 'box' as CanvasIconName, generationType: 'image-to-image', prompt: '根据当前图片进行智能裁剪，保留主体和关键构图，输出更合适的画面范围。' },
] as const;

type PanoramaFeatureItem = {
  id: string;
  label: string;
  desc?: string;
  icon: CanvasIconName;
  column: 'storyboard' | 'style' | 'setting';
  prompt: string;
  generationType?: string;
};

const PANORAMA_FEATURE_COLUMNS: Array<{ id: PanoramaFeatureItem['column']; title: string }> = [
  { id: 'storyboard', title: '分镜叙事' },
  { id: 'style', title: '质感调节' },
  { id: 'setting', title: '设定图' },
];

const PANORAMA_FEATURES: PanoramaFeatureItem[] = [
  { id: 'speed-storyboard', column: 'storyboard', label: '调度故事板', icon: 'stage', prompt: '基于参考图生成调度故事板，保持场景空间关系和镜头动线。' },
  { id: 'storyboard', column: 'storyboard', label: '故事板', icon: 'stage', prompt: '基于参考图生成故事板分镜，补齐镜头说明、构图和转场。' },
  { id: 'continuity-25', column: 'storyboard', label: '25宫格连贯分镜', icon: 'grid', prompt: '基于参考图生成25宫格连贯分镜，保持角色、场景和动作连续。' },
  { id: 'drama-quad', column: 'storyboard', label: '剧情推演四宫格', icon: 'grid', prompt: '基于参考图生成四宫格剧情推演，展示前后情节变化。' },
  { id: 'after-3s', column: 'storyboard', label: '画面推演 - 3秒后', icon: 'history', prompt: '基于参考图推演3秒后的画面状态，保持逻辑连续。' },
  { id: 'before-5s', column: 'storyboard', label: '画面推演 - 5秒前', icon: 'history', prompt: '基于参考图反推5秒前的画面状态，保持叙事合理。' },
  { id: 'cinematic-light', column: 'style', label: '电影级光影校正', icon: 'spark', prompt: '对参考图进行电影级光影校正，增强层次、氛围和质感。' },
  { id: 'panorama-720', column: 'style', label: '720全景', desc: '生成全景场景图', icon: 'spark', prompt: '720°全景图：请以参考图为场景主体，生成可用于全景预览的 equirectangular panoramic image，左右边缘无缝衔接，2:1 横向比例，无黑边。', generationType: 'image-to-image' },
  { id: 'multi-camera-grid', column: 'style', label: '多机位九宫格', icon: 'grid', prompt: '基于参考图生成多机位九宫格，展示不同镜头距离、角度和构图。' },
  { id: 'character-face-3view', column: 'setting', label: '角色脸部三视图', icon: 'swap', prompt: '基于参考图生成角色脸部三视图，保持五官和风格一致。' },
  { id: 'character-setting', column: 'setting', label: '角色设定图', icon: 'mic', prompt: '基于参考图生成角色设定图，包含正面、侧面和关键特征说明。' },
  { id: 'character-3view', column: 'setting', label: '角色三视图', icon: 'box', prompt: '基于参考图生成角色三视图，保持服装、比例和造型一致。' },
  { id: 'scene-setting', column: 'setting', label: '场景设定图', icon: 'stage', prompt: '基于参考图生成场景设定图，补齐空间结构、材质和光照说明。' },
  { id: 'product-setting', column: 'setting', label: '产品设定图', icon: 'box', prompt: '基于参考图生成产品设定图，展示结构、材质和关键卖点。' },
];

const MULTI_ANGLE_FEATURES = [
  { id: 'front', label: '正面视角', prompt: '基于参考图生成主体正面视角，保持身份、风格和材质一致。' },
  { id: 'side', label: '侧面视角', prompt: '基于参考图生成主体侧面视角，保持比例和关键特征一致。' },
  { id: 'back', label: '背面视角', prompt: '基于参考图生成主体背面视角，补齐合理背面细节。' },
  { id: 'top', label: '俯视视角', prompt: '基于参考图生成俯视视角，保持空间关系和主体位置合理。' },
  { id: 'low', label: '低机位视角', prompt: '基于参考图生成低机位视角，增强透视和画面张力。' },
  { id: 'nine-grid', label: '多角度九宫格', prompt: '基于参考图生成九宫格多角度视图，包含正面、侧面、背面、俯视、低机位等视角。' },
];

const GRID_FEATURES = [
  { id: 'multi-camera-grid', label: '多机位九宫格', icon: 'grid' as CanvasIconName, prompt: '基于参考图生成多机位九宫格，展示远景、中景、近景、俯视、仰视、侧面等多种机位。' },
  { id: 'drama-quad', label: '剧情推演四宫格', icon: 'grid' as CanvasIconName, prompt: '基于参考图生成剧情推演四宫格，展示事件发生前、发生中、变化后和结果画面。' },
  { id: 'character-face-3view', label: '角色脸部三视图', icon: 'swap' as CanvasIconName, prompt: '基于参考图生成角色脸部三视图，包含正面、侧面、半侧面，保持五官一致。' },
  { id: 'character-setting', label: '角色设定图', icon: 'mic' as CanvasIconName, prompt: '基于参考图生成角色设定图，包含造型、服装、关键特征和风格说明。' },
  { id: 'scene-setting', label: '场景设定图', icon: 'stage' as CanvasIconName, prompt: '基于参考图生成场景设定图，补齐空间结构、材质、光照和关键物件。' },
  { id: 'product-setting', label: '产品设定图', icon: 'box' as CanvasIconName, prompt: '基于参考图生成产品设定图，展示正侧背结构、材质细节和卖点。' },
  { id: 'continuity-25', label: '25宫格连贯分镜', icon: 'grid' as CanvasIconName, prompt: '基于参考图生成25宫格连贯分镜，保持角色、动作、场景和时间线连续。' },
  { id: 'cinematic-light', label: '电影级光影校正', icon: 'spark' as CanvasIconName, prompt: '基于参考图进行电影级光影校正，增强层次、氛围、体积光和质感。' },
  { id: 'character-3view', label: '角色三视图', icon: 'box' as CanvasIconName, prompt: '基于参考图生成角色三视图，包含正面、侧面、背面，保持比例和服装一致。' },
  { id: 'after-3s', label: '画面推演 - 3秒后', icon: 'history' as CanvasIconName, prompt: '基于参考图推演3秒后的画面，保持镜头运动和故事逻辑连续。' },
  { id: 'before-5s', label: '画面推演 - 5秒前', icon: 'history' as CanvasIconName, prompt: '基于参考图反推5秒前的画面，保持角色位置和场景逻辑合理。' },
];

const LIGHT_DIRECTIONS = [
  { id: 'left', label: '左侧' },
  { id: 'top', label: '顶部' },
  { id: 'right', label: '右侧' },
  { id: 'front', label: '前方' },
  { id: 'bottom', label: '底部' },
  { id: 'back', label: '后方' },
] as const;

type LightingSettings = {
  view: 'perspective' | 'front';
  global: boolean;
  smart: boolean;
  brightness: number;
  color: string;
  direction: typeof LIGHT_DIRECTIONS[number]['id'];
  rim: boolean;
};

function LightingFeaturePanel({ initial, onApply, onClose }: { initial?: Partial<LightingSettings>; onApply: (settings: LightingSettings) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<LightingSettings['view']>(initial?.view || 'perspective');
  const [global, setGlobal] = useState(initial?.global ?? true);
  const [smart, setSmart] = useState(initial?.smart ?? false);
  const [brightness, setBrightness] = useState(initial?.brightness ?? 50);
  const [color, setColor] = useState(initial?.color || '#ffffff');
  const [direction, setDirection] = useState<LightingSettings['direction']>(initial?.direction || 'front');
  const [rim, setRim] = useState(initial?.rim ?? false);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('.lib-image-media-toolbar')) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);
  const directionLabel = LIGHT_DIRECTIONS.find(item => item.id === direction)?.label || '正面';
  const settings: LightingSettings = { view, global, smart, brightness, color, direction, rim };

  return (
    <div ref={panelRef} className="lighting-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="lighting-panel-head">
        <strong>打光效果</strong>
        <button onClick={onClose}><SvgIcon name="close" size={14} /></button>
      </div>
      <div className="lighting-panel-body">
        <div className="lighting-preview-card" data-view={view} data-direction={direction} data-global={global} data-smart={smart} data-rim={rim}>
          <div className="lighting-view-tabs">
            <button className={view === 'perspective' ? 'active' : ''} onClick={() => setView('perspective')}>透视</button>
            <button className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>正面</button>
          </div>
          <div className="lighting-orbit" style={{ '--lighting-color': color, '--lighting-strength': `${Math.max(20, brightness)}%` } as React.CSSProperties}>
            <div className="lighting-sphere" />
            <div className={`lighting-beam ${direction}`} />
            {rim && <div className="lighting-rim" />}
            <div className={`lighting-source-dot ${direction}`} />
            <div className="lighting-subject" />
          </div>
          <div className="lighting-preview-meta"><span>{view === 'perspective' ? '透视预览' : '正面预览'}</span><em>{directionLabel} ? {brightness}%</em></div>
        </div>
        <div className="lighting-controls">
          <div className="lighting-toggle-row">
            <label className="lighting-toggle-card"><span>全局</span><label className="lighting-switch"><input type="checkbox" checked={global} onChange={(event) => setGlobal(event.target.checked)} /><i /></label></label>
            <label className="lighting-toggle-card"><span>智能模式</span><label className="lighting-switch"><input type="checkbox" checked={smart} onChange={(event) => setSmart(event.target.checked)} /><i /></label></label>
          </div>
          <label className="lighting-row"><span>亮度</span><input type="range" min="0" max="100" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /><em>{brightness}%</em></label>
          <label className="lighting-row"><span>颜色</span><input className="lighting-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><em>{color.toUpperCase()}</em></label>
          <div className="lighting-label">主光源</div>
          <div className="lighting-direction-grid">
            {LIGHT_DIRECTIONS.map(item => <button key={item.id} className={direction === item.id ? 'active' : ''} onClick={() => setDirection(item.id)}>{item.label}</button>)}
          </div>
          <label className="lighting-toggle-card full"><span>轮廓光</span><label className="lighting-switch"><input type="checkbox" checked={rim} onChange={(event) => setRim(event.target.checked)} /><i /></label></label>
          <div className="lighting-summary">当前使用{global ? '全局' : '局部'}{smart ? '智能' : '手动'}打光，主光源来自{directionLabel}，亮度为{brightness}%。</div>
        </div>
      </div>
      <div className="lighting-panel-foot">
        <button className="lighting-reset" onClick={() => { setView('perspective'); setGlobal(true); setSmart(false); setBrightness(50); setColor('#ffffff'); setDirection('front'); setRim(false); }}>重置参数</button>
        <button className="lighting-apply" onClick={() => onApply(settings)}><SvgIcon name="play" size={14} />应用打光</button>
      </div>
    </div>
  );
}

function MultiAngleFeaturePanel({ onSelect, onClose }: { onSelect: (feature: typeof MULTI_ANGLE_FEATURES[number]) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('.lib-image-media-toolbar')) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div ref={panelRef} className="multi-angle-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="multi-angle-panel-title">多角度生成</div>
      <div className="multi-angle-panel-grid">
        {MULTI_ANGLE_FEATURES.map(feature => (
          <button key={feature.id} onClick={() => onSelect(feature)} title={feature.prompt}>
            <span className="multi-angle-icon"><SvgIcon name={feature.id === 'nine-grid' ? 'grid' : 'swap'} size={16} /></span>
            <span>{feature.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


type MarkerTool = 'pin' | 'pen' | 'rect' | 'text';

type MarkerEditorProps = {
  imageUrl: string;
  initialColor?: string;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
};

function NodeMarkerEditor({ imageUrl, initialColor = '#ff2b2b', onClose, onSave }: MarkerEditorProps) {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<MarkerTool>('pin');
  const [color, setColor] = useState(initialColor);
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const markerCountRef = useRef(1);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);

  const pushHistory = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas) return;
    const next = canvas.toDataURL('image/png');
    setHistory(prev => {
      const sliced = prev.slice(0, historyIndex + 1);
      const merged = [...sliced, next].slice(-40);
      setHistoryIndex(merged.length - 1);
      return merged;
    });
  }, [historyIndex]);

  useEffect(() => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const maxWidth = Math.min(window.innerWidth - 96, 1040);
      const maxHeight = Math.min(window.innerHeight - 156, 720);
      const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight, 1);
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      [imageCanvasRef.current, drawCanvasRef.current].forEach(canvas => {
        if (!canvas) return;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      });
      const imageCtx = imageCanvasRef.current?.getContext('2d');
      const drawCtx = drawCanvasRef.current?.getContext('2d');
      if (imageCtx) {
        imageCtx.clearRect(0, 0, width, height);
        imageCtx.drawImage(image, 0, 0, width, height);
      }
      if (drawCtx) {
        drawCtx.clearRect(0, 0, width, height);
        const empty = drawCanvasRef.current?.toDataURL('image/png');
        if (empty) {
          setHistory([empty]);
          setHistoryIndex(0);
        }
      }
    };
    image.src = imageUrl;
  }, [imageUrl]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const canvas = event.currentTarget;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const drawNumberMarker = (point: { x: number; y: number }) => {
    const ctx = drawCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const label = String(markerCountRef.current++);
    const radius = Math.max(12, brushSize * 3.5);
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(13, radius)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, point.x, point.y + 0.5);
    ctx.restore();
    pushHistory();
  };

  const drawText = (point: { x: number; y: number }) => {
    setTextInput(point);
  };

  const commitTextInput = useCallback(() => {
    const text = textInputRef.current?.value?.trim();
    if (text && textInput) {
      const ctx = drawCanvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = `${Math.max(14, brushSize * 5)}px sans-serif`;
        ctx.textBaseline = 'top';
        ctx.fillText(text, textInput.x, textInput.y);
        ctx.restore();
        pushHistory();
      }
    }
    setTextInput(null);
  }, [textInput, color, brushSize, pushHistory]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const point = getPoint(event);
    if (tool === 'pin') {
      drawNumberMarker(point);
      return;
    }
    if (tool === 'text') {
      drawText(point);
      return;
    }
    drawingRef.current = true;
    startRef.current = point;
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    canvas.setPointerCapture(event.pointerId);
    if (tool === 'pen') {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.restore();
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const start = startRef.current;
    if (!canvas || !ctx || !start) return;
    const point = getPoint(event);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'pen') {
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    } else if (tool === 'rect' && snapshotRef.current) {
      ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(start.x, start.y, point.x - start.x, point.y - start.y);
    }
    ctx.restore();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    pushHistory();
  };

  const restoreHistory = (index: number) => {
    const src = history[index];
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!src || !canvas || !ctx) return;
    const image = new Image();
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
      setHistoryIndex(index);
    };
    image.src = src;
  };

  const clearMarks = () => {
    const canvas = drawCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pushHistory();
  };

  const save = () => {
    const base = imageCanvasRef.current;
    const marks = drawCanvasRef.current;
    if (!base || !marks) return;
    const output = document.createElement('canvas');
    output.width = base.width;
    output.height = base.height;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(marks, 0, 0);
    onSave(output.toDataURL('image/png'));
  };

  return createPortal(
    <div className="node-marker-editor-modal" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="node-marker-editor-shell nodrag nowheel" onPointerDown={(event) => event.stopPropagation()}>
        <div className="node-marker-editor-toolbar">
          <button className="node-marker-editor-back" onClick={onClose}><SvgIcon name="chevron-left" size={15} /><strong>标注</strong></button>
          <span className="node-marker-editor-divider" />
          <button className={tool === 'pin' ? 'active' : ''} title="数字标记" onClick={() => setTool('pin')}><SvgIcon name="pin" size={17} /></button>
          <button className={tool === 'pen' ? 'active' : ''} title="自由绘画" onClick={() => setTool('pen')}><SvgIcon name="pen" size={17} /></button>
          <button className={tool === 'rect' ? 'active' : ''} title="框选" onClick={() => setTool('rect')}><SvgIcon name="rect" size={17} /></button>
          <button className={tool === 'text' ? 'active' : ''} title="文字" onClick={() => setTool('text')}><SvgIcon name="type" size={17} /></button>
          <span className="node-marker-editor-divider" />
          <label className="node-marker-color" title="颜色"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><i style={{ background: color }} /></label>
          <label className="node-marker-size" title="笔触粗细"><SvgIcon name="pen" size={15} /><input type="range" min="1" max="18" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
          <span className="node-marker-editor-divider" />
          <button title="撤销" disabled={historyIndex <= 0} onClick={() => restoreHistory(historyIndex - 1)}><SvgIcon name="undo" size={16} /></button>
          <button title="重做" disabled={historyIndex >= history.length - 1} onClick={() => restoreHistory(historyIndex + 1)}><SvgIcon name="redo" size={16} /></button>
          <button title="清空" onClick={clearMarks}><SvgIcon name="trash" size={16} /></button>
          <button className="node-marker-save" onClick={save}>保存</button>
        </div>
        <div className="node-marker-editor-board">
          <canvas ref={imageCanvasRef} className="node-marker-base-canvas" />
          <canvas ref={drawCanvasRef} className="node-marker-draw-canvas" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} />
          {textInput && (
            <input
              ref={textInputRef}
              type="text"
              className="node-marker-text-input"
              style={{
                position: 'absolute',
                left: textInput.x,
                top: textInput.y,
                zIndex: 10,
                color,
                fontSize: `${Math.max(16, brushSize * 4)}px`,
                fontWeight: 700,
                textShadow: '0 1px 3px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.5)',
                caretColor: color,
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTextInput();
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={commitTextInput}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function HdFeaturePanel({ onSelect, onClose }: { onSelect: (feature: typeof HD_FEATURES[number]) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('.lib-image-media-toolbar')) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div ref={panelRef} className="hd-feature-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {HD_FEATURES.map(feature => (
        <button key={feature.id} onClick={() => onSelect(feature)} title={feature.prompt}>
          <span className="hd-feature-icon"><SvgIcon name={feature.icon} size={16} /></span>
          <span>{feature.label}</span>
        </button>
      ))}
    </div>
  );
}

function SplitFeaturePanel({ onSelect, onCustom, onClose }: { onSelect: (option: typeof TOOLBAR_SPLIT_OPTIONS[number]) => void; onCustom: () => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('.lib-image-media-toolbar')) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div ref={panelRef} className="split-feature-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {TOOLBAR_SPLIT_OPTIONS.map(option => (
        <button key={option.id} onClick={() => onSelect(option)} title={`将图片切分为${option.label}`}>
          <span>{option.label}</span>
        </button>
      ))}
      <div className="split-feature-separator" />
      <button className="split-feature-custom" onClick={onCustom} title="自定义宫格切分">
        <span>自定义</span>
        <SvgIcon name="chevron-right" size={14} />
      </button>
    </div>
  );
}

function GridFeaturePanel({ onSelect, onClose }: { onSelect: (feature: typeof GRID_FEATURES[number]) => void; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('.lib-image-media-toolbar')) return;
      onClose();
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [onClose]);

  return (
    <div ref={panelRef} className="grid-feature-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {GRID_FEATURES.map(feature => (
        <button key={feature.id} onClick={() => onSelect(feature)} title={feature.prompt}>
          <span className="grid-feature-icon"><SvgIcon name={feature.icon} size={17} /></span>
          <span>{feature.label}</span>
        </button>
      ))}
    </div>
  );
}

function ImageMediaToolbar({
  node,
  mediaUrl,
  onClose,
  onApply,
  onMultiAngle,
  onLighting,
  onGridFeature,
  onHdFeature,
  onSplitFeature,
  onMark,
  onDownload,
  onFullscreen,
  onEditInputs,
}: {
  node: AINode;
  mediaUrl: string;
  onClose: () => void;
  onApply: (featureId: string, option?: string) => void;
  onMultiAngle: (feature: typeof MULTI_ANGLE_FEATURES[number]) => void;
  onLighting: (settings: LightingSettings) => void;
  onGridFeature: (feature: typeof GRID_FEATURES[number]) => void;
  onHdFeature: (feature: typeof HD_FEATURES[number]) => void;
  onSplitFeature: (option: typeof TOOLBAR_SPLIT_OPTIONS[number] | { id: string; label: string; grid?: number; custom?: boolean }) => void;
  onMark: () => void;
  onDownload: () => void;
  onFullscreen: () => void;
  onEditInputs: () => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [split, setSplit] = useState(String(node.options?.gridSplit || '3x3'));

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      if (toolbarRef.current?.contains(target)) return;

      onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [onClose]);

  const button = (feature: typeof IMAGE_MEDIA_TOOL_FEATURES[number]) => (
    <div key={feature.id} className="lib-image-toolbar-item">
      <button
        className="lib-image-toolbar-btn"
        title={feature.prompt}
        onClick={(event) => {
          event.stopPropagation();
          if (feature.id === 'upscale' || feature.id === 'split') {
            setOpenMenu(openMenu === feature.id ? null : feature.id);
            return;
          }
          if (feature.id === 'multi-angle') {
            setOpenMenu(openMenu === feature.id ? null : feature.id);
            return;
          }
          if (feature.id === 'lighting') {
            setOpenMenu(openMenu === feature.id ? null : feature.id);
            return;
          }
          if (feature.id === 'nine-grid') {
            setOpenMenu(openMenu === feature.id ? null : feature.id);
            return;
          }
          onApply(feature.id);
        }}
      >
        <SvgIcon name={feature.icon} size={15} />
        <span>{feature.label}</span>
        {'badge' in feature && feature.badge && <em>{feature.badge}</em>}
      </button>
      {openMenu === 'upscale' && feature.id === 'upscale' && (
        <HdFeaturePanel onSelect={(option) => { onHdFeature(option); setOpenMenu(null); }} onClose={() => setOpenMenu(null)} />
      )}
      {openMenu === 'split' && feature.id === 'split' && (
        <SplitFeaturePanel
          onSelect={(option) => { setSplit(option.id); onSplitFeature(option); setOpenMenu(null); }}
          onCustom={() => { const custom = window.prompt('请输入宫格切分数量，例如 6x6'); if (custom) { setSplit(custom); onSplitFeature({ id: custom, label: `自定义 ${custom}`, custom: true }); } setOpenMenu(null); }}
          onClose={() => setOpenMenu(null)}
        />
      )}
      {openMenu === 'multi-angle' && feature.id === 'multi-angle' && (
        <MultiAngleFeaturePanel onSelect={(option) => { onMultiAngle(option); setOpenMenu(null); }} onClose={() => setOpenMenu(null)} />
      )}
      {openMenu === 'lighting' && feature.id === 'lighting' && (
        <LightingFeaturePanel initial={node.options?.lightingSettings} onApply={(settings) => { onLighting(settings); setOpenMenu(null); }} onClose={() => setOpenMenu(null)} />
      )}
      {openMenu === 'nine-grid' && feature.id === 'nine-grid' && (
        <GridFeaturePanel onSelect={(option) => { onGridFeature(option); setOpenMenu(null); }} onClose={() => setOpenMenu(null)} />
      )}
    </div>
  );

  return (
    <div ref={toolbarRef} className="lib-image-media-toolbar nodrag nowheel" data-media-url={mediaUrl} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="lib-image-toolbar-group">
        {IMAGE_MEDIA_TOOL_FEATURES.map(button)}
      </div>
      <div className="lib-image-toolbar-actions">
        <button title="重新生成（打开输入框修改后再次提交）" onClick={onEditInputs}><SvgIcon name="canvas" size={15} /></button>
        <button title="标注 / 运镜线" onClick={onMark}><SvgIcon name="pin" size={15} /></button>
        <button title="作为参考" onClick={() => onApply('reference-extra')}><SvgIcon name="upload" size={15} /></button>
        <button title="下载" onClick={onDownload}><SvgIcon name="save" size={15} /></button>
        <button title="全屏查看" onClick={onFullscreen}><SvgIcon name="chevron-right" size={15} /></button>
      </div>
    </div>
  );
}

// ==================== 节点输入弹窗（独立对话框，跟随节点） ====================
function NodeInputPopover({ node, onClose, onSend, anchorRect, hasIncomingImageNode, forceOmniReference, incomingImageCount = 0 }: { node: AINode; onClose: () => void; onSend: (prompt: string, files?: File[], params?: any) => void; anchorRect?: DOMRect | null; hasIncomingImageNode?: boolean; forceOmniReference?: boolean; incomingImageCount?: number }) {
  const [prompt, setPrompt] = useState(node.prompt || '');
  const isImageInputNode = IMAGE_INPUT_NODE_TYPES.includes(node.type);
  // 图片类节点（含九宫格/四宫格等 image-to-image、image-upscale）虽然也在 VIDEO_INPUT_NODE_TYPES 中，
  // 但它们的输出是图片，不应出现视频规格参数，因此排除掉图片输入节点。
  const isVideoInputNode = VIDEO_INPUT_NODE_TYPES.includes(node.type) && !isImageInputNode;
  const isMediaInputNode = isVideoInputNode || isImageInputNode;
  const isPanorama720Input = isImageInputNode && (node.options?.panoramaType === '720' || node.options?.mediaFeature === '720°全景图');
  const mediaFeatures = isImageInputNode ? IMAGE_INPUT_FEATURES : VIDEO_INPUT_FEATURES;
  const defaultFeature = isImageInputNode ? 'text-to-image' : 'text-to-video';
  // 前面连线视频为节点或多格式组合作为参考时，自动强制只能选择“全能参考”，其它选项变灰不可选
  const [activeFeature, setActiveFeature] = useState<string>(forceOmniReference ? 'reference' : (node.options?.generationType || (isMediaInputNode ? defaultFeature : '')));
  const [inputRows, setInputRows] = useState<Array<{ id: string; feature: string; text: string }>>(() => {
    const rows = node.options?.inputRows;
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return isMediaInputNode
      ? [{ id: `row-${Date.now()}`, feature: forceOmniReference ? 'reference' : (node.options?.generationType || defaultFeature), text: node.prompt || '' }]
      : [];
  });

  // 自动保存：输入文字实时写回节点对象，关闭弹窗再打开不丢失
  const updateNode = useAppStore(s => s.updateNode);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const effectivePrompt = isMediaInputNode ? (inputRows[0]?.text || '') : prompt;
      const update: Partial<AINode> = { prompt: effectivePrompt };
      if (isMediaInputNode) {
        update.options = { ...(node.options || {}), inputRows, generationType: activeFeature };
      }
      updateNode(node.id, update);
    }, 300);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, inputRows, activeFeature]);

  // 强制全能参考：进入弹窗（或上游连线变化）时自动切换到 reference（全能参考）
  useEffect(() => {
    if (forceOmniReference && activeFeature !== 'reference') {
      setActiveFeature('reference');
      setInputRows(prev => {
        if (prev.length === 0) return [{ id: `row-${Date.now()}`, feature: 'reference', text: '' }];
        return prev.map((row, index) => index === 0 ? { ...row, feature: 'reference' } : row);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOmniReference]);

  // 视频节点：上游连线节点里有图片时，自动切换到「图生视频」；有两张图片时自动切换到「首尾帧」。
  // 全能参考的强制条件（视频/多格式）优先级更高，此处仅在非强制全能参考时生效。
  useEffect(() => {
    // 只依据上游「图片」数量自动切换：有图→图生视频，两张图→首尾帧
    if (!isVideoInputNode || forceOmniReference || incomingImageCount < 1) return;
    const nextFeature = incomingImageCount >= 2 ? 'first-frame' : 'image-to-video';
    if (activeFeature === nextFeature) return;
    // 仅在基础视频功能之间自动切换（文生视频/图生视频/首尾帧），不覆盖用户已选的高级功能
    const switchable = ['text-to-video', 'image-to-video', 'first-frame'];
    if (!switchable.includes(activeFeature)) return;
    setActiveFeature(nextFeature);
    setInputRows(prev => {
      if (prev.length === 0) return [{ id: `row-${Date.now()}`, feature: nextFeature, text: '' }];
      return prev.map((row, index) => index === 0 ? { ...row, feature: nextFeature } : row);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideoInputNode, forceOmniReference, hasIncomingImageNode, incomingImageCount]);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [referenceImages, setReferenceImages] = useState<Array<{ id: string; name: string; url: string; file?: File; kind?: 'image' | 'video' | 'audio'; thumbnail?: string }>>(() => {
    const storedReferences = node.options?.referenceImages;
    if (!Array.isArray(storedReferences)) return [];
    // 归一化 kind：兼容仅有 type 字段的旧数据，确保视频参考走 video 分支显示首帧缩略图
    return storedReferences.map((ref: any) => {
      const kind = ref.kind || (ref.type === 'video' ? 'video' : ref.type === 'audio' ? 'audio' : 'image');
      return { ...ref, kind };
    });
  });
  const [markerMode, setMarkerMode] = useState(false);
  // 视频参考若缺少缩略图（例如连线后未及时抽帧），弹窗打开时补抽首帧作为缩略图
  useEffect(() => {
    referenceImages.forEach(ref => {
      if (ref.kind === 'video' && !ref.thumbnail && ref.url) {
        captureVideoFirstFrame(ref.url)
          .then(thumb => setReferenceImages(list => list.map(item => item.id === ref.id ? { ...item, thumbnail: thumb } : item)))
          .catch(() => { /* 抽取失败保留 video 兜底 */ });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceImages.length]);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);
  const [imageParamOpen, setImageParamOpen] = useState(false);
  const [featurePanelOpen, setFeaturePanelOpen] = useState(false);
  const [showPromptLibraryPicker, setShowPromptLibraryPicker] = useState(false);
  const promptLibrary = useAppStore(state => state.promptLibrary || []);
  const [showReferencePicker, setShowReferencePicker] = useState(false);
  const [imageQuality, setImageQuality] = useState(node.options?.imageQuality || 'standard');
  const [imageClarity, setImageClarity] = useState(node.options?.imageClarity || '2K');
  const [imageRatio, setImageRatio] = useState(node.options?.imageRatio || (isPanorama720Input ? '2:1' : 'auto'));
  const [markers, setMarkers] = useState<Array<{ id: number; x: number; y: number }>>(() => Array.isArray(node.options?.markers) ? node.options.markers : []);
  const [motionLines, setMotionLines] = useState<Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>>(() => Array.isArray(node.options?.motionLines) ? node.options.motionLines : []);
  // ===== 视频参数状态 =====
  const [videoRatio, setVideoRatio] = useState(node.options?.videoRatio || 'auto');
  const [videoClarity, setVideoClarity] = useState(node.options?.videoClarity || '720P');
  const [videoDuration, setVideoDuration] = useState(node.options?.videoDuration || 5);
  const [generateAudio, setGenerateAudio] = useState(node.options?.generateAudio !== false);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(node.options?.cameraMovementId || null);
  const [showCameraGallery, setShowCameraGallery] = useState(false);
  const [videoParamOpen, setVideoParamOpen] = useState(false);
  const selectedCameraMovement = selectedCameraId ? CAMERA_MOVEMENTS.find(m => m.id === selectedCameraId) || null : null;
  const [lineStart, setLineStart] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assets = useAppStore(state => state.assets || {});
  const imageAssets = Object.values(assets).filter((asset: any) => asset.type === 'image');
  const stopInputDrag = (event: React.PointerEvent | React.MouseEvent) => event.stopPropagation();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files!);
      setAttachedFiles(prev => [...prev, ...files]);

      files.forEach(file => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');

        if (isImage) {
          // 图片：添加为参考图 + 保存到资产库
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            addReferenceImage(file.name, dataUrl, file);
            autoSaveMediaToAssets({ name: file.name, type: 'image', path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: node.id });
          };
          reader.readAsDataURL(file);
        } else if (isVideo) {
          // 视频：保存到资产库
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            autoSaveMediaToAssets({ name: file.name, type: 'video', path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: node.id });
          };
          reader.readAsDataURL(file);
        } else if (isAudio) {
          // 音频：保存到资产库
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            autoSaveMediaToAssets({ name: file.name, type: 'audio', path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: node.id });
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 参考图加入输入框时自动 @文件名（若尚未提及）
  function appendReferenceMention(name: string) {
    if (!name) return;
    setInputRows(prev => {
      const nextRows = prev.length > 0 ? prev : [{ id: `row-${Date.now()}`, feature: activeFeature || defaultFeature, text: '' }];
      return nextRows.map((row, index) => {
        if (index !== 0 || row.text.includes(`@${name}`)) return row;
        return { ...row, text: `${row.text}${row.text ? ' ' : ''}@${name}` };
      });
    });
  }

  function addReferenceImage(name: string, url: string, file?: File, kind: 'image' | 'video' | 'audio' = 'image') {
    let added = false;
    setReferenceImages(prev => {
      if (prev.some(item => item.url === url)) return prev;
      added = true;
      const refId = `ref-${Date.now()}-${prev.length}`;
      // 视频参考：先加入列表（缩略图暂空），随后异步抓取首帧作为缩略图，避免读取不到缩略图
      if (kind === 'video') {
        captureVideoFirstFrame(url)
          .then(thumb => {
            setReferenceImages(list => list.map(item => item.id === refId ? { ...item, thumbnail: thumb } : item));
          })
          .catch(() => { /* 抓取失败时保留视频本身，img 标签兜底显示 */ });
      }
      return [...prev, { id: refId, name, url, file, kind, thumbnail: kind === 'image' ? url : undefined }];
    });
    // 注意：不再自动向输入框插入 @文件名。
    // 参考图名字仅在用户主动点击参考图缩略图，或在输入框手动输入 @ 时才加入。
    void added;
  }

  function removeReferenceImage(imageId: string) {
    setReferenceImages(prev => {
      const removed = prev.find(image => image.id === imageId);
      if (removed?.name) {
        const escapedName = removed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const mentionPattern = new RegExp(`(^|\\s)@${escapedName}(?=\\s|$)`, 'g');
        setInputRows(rows => rows.map(row => ({
          ...row,
          text: row.text.replace(mentionPattern, ' ').replace(/\s{2,}/g, ' ').trim(),
        })));
      }
      return prev.filter(image => image.id !== imageId);
    });
  }

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ targetNodeId?: string; sourceNodeId?: string; name?: string; url?: string; kind?: 'image' | 'video' | 'audio' }>).detail;
      if (!detail?.url || detail.targetNodeId !== node.id) return;
      const refName = detail.name || detail.sourceNodeId || 'reference';
      // 仅把图片加入参考列表，不自动向输入框插入 @文件名。
      // 用户需要引用时再点击参考图缩略图，或在输入框输入 @。
      addReferenceImage(refName, detail.url, undefined, detail.kind || 'image');
    };
    window.addEventListener('canvas:reference-picked', handler);
    return () => window.removeEventListener('canvas:reference-picked', handler);
  }, [activeFeature, defaultFeature, node.id]);

  const saveMarkedReference = (markedUrl: string) => {
    const source = referenceImages[0];
    if (!source) return;
    const nextName = `??-${source.name}`;
    setReferenceImages(prev => [{ ...source, id: `ref-marked-${Date.now()}`, name: nextName, url: markedUrl }, ...prev.slice(1)]);
    autoSaveMediaToAssets({ name: nextName, type: 'image', path: markedUrl, sourceType: 'canvas', sourceId: node.id });
    setInputRows(prev => prev.map((row, index) => {
      if (index !== 0) return row;
      const sourceMention = `@${source.name}`;
      const nextMention = `@${nextName}`;
      if (row.text.includes(sourceMention)) return { ...row, text: row.text.split(sourceMention).join(nextMention) };
      if (row.text.includes(nextMention)) return row;
      return { ...row, text: `${row.text}${row.text ? ' ' : ''}${nextMention}` };
    }));
    setMarkers([]);
    setMotionLines([]);
    setLineStart(null);
    setMarkerMode(false);
  };

  const handleSend = () => {
    // 构建基础提示词
    let finalPrompt = isMediaInputNode
      ? composePromptParts(...inputRows.map(row => {
          const feature = mediaFeatures.find(item => item.id === row.feature);
          return row.text.trim() ? `${feature?.label || '输入'}：${row.text.trim()}` : undefined;
        }), referenceImages.length > 0 ? `参考图：${referenceImages.map(img => `@${img.name}`).join(' ')}` : undefined, markers.length > 0 ? `标记点：${markers.map(point => `${point.id}(${Math.round(point.x)}%,${Math.round(point.y)}%)`).join('；')}` : undefined, motionLines.length > 0 ? `运镜线：${motionLines.length} 条` : undefined)
      : prompt;

    // 视频节点：自动追加运镜提示词
    if (isVideoInputNode && selectedCameraMovement) {
      finalPrompt = finalPrompt.trim()
        ? `${finalPrompt}\n\n【运镜要求】${selectedCameraMovement.promptZh}`
        : `【运镜要求】${selectedCameraMovement.promptZh}`;
    }

    if (!finalPrompt.trim() && attachedFiles.length === 0) return;

    if (isMediaInputNode) {
      useAppStore.getState().updateNode(node.id, {
        prompt: finalPrompt,
        options: {
          ...node.options,
          generationType: activeFeature,
          inputRows,
          referenceImages,
          markers,
          motionLines,
          mediaFeature: mediaFeatures.find(item => item.id === activeFeature)?.label,
          imageQuality,
          imageClarity,
          imageRatio,
          // 视频参数
          videoRatio,
          videoClarity,
          videoDuration,
          generateAudio,
          cameraMovementId: selectedCameraId,
          cameraMovementName: selectedCameraMovement?.name,
          cameraMovementPrompt: selectedCameraMovement?.promptZh,
        },
        aspectRatio: isVideoInputNode ? videoRatio : imageRatio === 'auto' ? undefined : imageRatio,
        resolution: isVideoInputNode ? videoClarity : imageClarity,
        size: isVideoInputNode ? videoClarity : imageClarity,
      });
    }

    // 构建提交参数（包含所有视频参数）
    const submitParams: any = {};
    if (isVideoInputNode) {
      submitParams.videoConfig = {
        ratio: videoRatio,
        clarity: videoClarity,
        duration: videoDuration,
        generateAudio: generateAudio,
        cameraMovement: selectedCameraMovement ? {
          id: selectedCameraMovement.id,
          name: selectedCameraMovement.name,
          prompt: selectedCameraMovement.promptZh,
        } : null,
      };
    }

    onSend(finalPrompt, attachedFiles.length > 0 ? [...attachedFiles] : undefined, submitParams);
    setPrompt('');
    setAttachedFiles([]);
  };

  const addInputRow = (featureId = activeFeature || defaultFeature) => {
    setInputRows(prev => [...prev, { id: `row-${Date.now()}-${prev.length}`, feature: featureId, text: '' }]);
    setActiveFeature(featureId);
  };

  const updateInputRow = (rowId: string, text: string) => {
    setInputRows(prev => prev.map(row => row.id === rowId ? { ...row, text } : row));
  };

  const updateInputRowFeature = (rowId: string, feature: string) => {
    setInputRows(prev => prev.map(row => row.id === rowId ? { ...row, feature } : row));
    setActiveFeature(feature);
  };

  const switchVideoFeature = (featureId: string) => {
    setActiveFeature(featureId);
    setInputRows(prev => {
      if (prev.length === 0) return [{ id: `row-${Date.now()}`, feature: featureId, text: '' }];
      return prev.map((row, index) => index === 0 ? { ...row, feature: featureId } : row);
    });
  };

  const applyMediaFeature = (featureId: string) => {
    switchVideoFeature(featureId);
    if (featureId === 'marker') setMarkerMode(true);
    if (featureId === 'reference-extra') {
      window.dispatchEvent(new CustomEvent('canvas:start-reference-pick', { detail: { targetNodeId: node.id } }));
    }
    if (featureId === 'asset') setAssetPickerOpen(true);
  };

  const updateImageParams = (updates: Record<string, any>) => {
    useAppStore.getState().updateNode(node.id, {
      options: { ...node.options, ...updates },
      aspectRatio: updates.imageRatio || updates.aspectRatio || node.aspectRatio,
      resolution: updates.imageClarity || updates.resolution || node.resolution,
      size: updates.imageClarity || updates.size || node.size,
    });
  };

  const changeImageQuality = (quality: string) => {
    setImageQuality(quality);
    updateImageParams({ imageQuality: quality });
  };

  const changeImageClarity = (clarity: string) => {
    setImageClarity(clarity);
    updateImageParams({ imageClarity: clarity, resolution: clarity, size: clarity });
  };

  const changeImageRatio = (ratio: string) => {
    setImageRatio(ratio);
    updateImageParams({ imageRatio: ratio, aspectRatio: ratio === 'auto' ? undefined : ratio });
  };

  const selectedPanoramaFeature = PANORAMA_FEATURES.find(item => item.id === (node.options?.panoramaFeature || activeFeature)) || PANORAMA_FEATURES.find(item => item.id === 'panorama-720')!;

  const applyPanoramaFeature = (feature: PanoramaFeatureItem) => {
    setFeaturePanelOpen(false);
    setActiveFeature(feature.id);
    setInputRows(prev => {
      const nextRows = prev.length > 0 ? prev : [{ id: `row-${Date.now()}`, feature: feature.id, text: '' }];
      return nextRows.map((row, index) => index === 0 ? { ...row, feature: feature.id, text: row.text || feature.prompt } : row);
    });
    useAppStore.getState().updateNode(node.id, {
      prompt: composePromptParts(node.prompt, feature.prompt),
      options: {
        ...node.options,
        panoramaFeature: feature.id,
        mediaFeature: feature.label,
        generationType: feature.generationType || 'image-to-image',
        imageRatio: feature.id === 'panorama-720' ? '2:1' : node.options?.imageRatio,
        aspectRatio: feature.id === 'panorama-720' ? '2:1' : node.options?.aspectRatio,
        panoramaType: feature.id === 'panorama-720' ? '720' : node.options?.panoramaType,
        outputType: feature.id === 'panorama-720' ? 'panorama' : node.options?.outputType,
      },
      aspectRatio: feature.id === 'panorama-720' ? '2:1' : node.aspectRatio,
    });
    if (feature.id === 'panorama-720') setImageRatio('2:1');
  };

  const removeInputRow = (rowId: string) => {
    setInputRows(prev => prev.length <= 1 ? prev : prev.filter(row => row.id !== rowId));
  };

  // 模型选择器 - 根据节点类型选择对应的 API 配置
  const allAPIConfigs = useAppStore(state => state.apiConfigs || []);
  const imageAPIConfigs = useAppStore(state => state.imageAPIConfigs || []);
  const videoAPIConfigs = useAppStore(state => state.videoAPIConfigs || []);
  const voiceAPIConfigs = useAppStore(state => state.voiceAPIConfigs || []);
  const musicAPIConfigs = useAppStore(state => state.musicAPIConfigs || []);
  const comfyuiConfigs = useAppStore(state => state.comfyuiConfigs || []);
  const comfyWorkflowCache = useAppStore(state => state.comfyWorkflowCache || []);
  const recommendedConfigs = useAppStore(state => state.recommendedConfigs || []);
  const chatAPIConfigs = useAppStore(state => state.chatAPIConfigs || []);

  // 工具函数：规范化模型列表
  const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
    // 正式调用页：模型选择只显示用户配置好的默认模型（不展示 /models 拉取的全量列表）；旧配置无默认时回退首个
    const def = String(defaultModel || '').trim();
    const first = String((models || [])[0] || '').trim();
    const value = def || first;
    return value ? [value] : [];
  };

  // 工具函数：检查配置是否完整可调用
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

  // 获取所有可用的配置（类似 DramaPage 的实现）
  const allAvailableConfigs = useMemo(() => [
    ...getCallableRecommendedConfigs(recommendedConfigs)
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'recommended' as const,
      })),
    ...allAPIConfigs
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        apiType: 'openai-chat' as const,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'chat' as const,
      })),
    ...chatAPIConfigs
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        apiType: 'openai-chat' as const,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'chat' as const,
      })),
  ], [recommendedConfigs, allAPIConfigs, chatAPIConfigs]);

  // 根据节点类型选择对应的 API 配置
  // ComfyUI 可用性门槛：必须已填写服务器地址、且连接测试通过（connected=true）。
  // 未配置地址 / 地址连接失败时，不在模型窗口展示任何 ComfyUI 工作流选项。
  const isComfyReady = (c: any) => !!String(c?.serverUrl || '').trim() && c?.connected === true;
  const readyComfyConfigs = (comfyuiConfigs || []).filter(isComfyReady);
  const comfyModelsFor = (c: any) => {
    const b = String(c.serverUrl || '').trim().replace(/\/+$/, '');
    const cached = (comfyWorkflowCache || [])
      .filter((w: any) => w.feature === node.type && (!b || w.serverUrl === b))
      .sort((a: any, b2: any) => b2.updatedAt - a.updatedAt)
      .map((w: any) => w.name);
    const files = (c.workflowFiles && c.workflowFiles.length) ? c.workflowFiles.map((w: any) => w.name || w) : [];
    const merged = Array.from(new Set([...cached, ...files]));
    return merged.length ? ['自动搭建', ...merged] : ['自动搭建'];
  };
  const apiConfigs = (() => {
    let configs: any[] = [];
    // 图片类节点
    if (['text-to-image', 'image-to-image', 'image-upscale', 'image-blend', 'character-view'].includes(node.type)) {
      configs = [
        ...imageAPIConfigs.filter(config => hasSavedCallableApiConfig(config)).map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'image' as const })),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
        // ComfyUI 也可以用于图片生成（仅显示已连接成功的配置）
        ...readyComfyConfigs.map(c => { const ms = comfyModelsFor(c); const pre = c?.categoryPresets?.image; const defM = ms.find((m: string) => m === pre) || ms[0]; return ({ ...c, name: c.name || 'ComfyUI', models: ms, defaultModel: defM, _source: 'comfyui' as const }); }),
      ];
    }
    // 视频类节点
    else if (['text-to-video', 'video-composite', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'lip-sync', 'video-super-resolution', 'live-portrait', 'video-to-music', 'video-interpolate', 'video-realtime'].includes(node.type)) {
      configs = [
        ...videoAPIConfigs.filter(config => hasSavedCallableApiConfig(config)).map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'video' as const })),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
        // ComfyUI 也可以用于视频生成（仅显示已连接成功的配置）
        ...readyComfyConfigs.map(c => { const wfs = (c.workflowFiles && c.workflowFiles.length ? c.workflowFiles.map((w: any) => w.name || w) : []); const pre = c?.categoryPresets?.video; const defM = wfs.find((m: string) => m === pre) || wfs[0] || c.name || 'ComfyUI 工作流'; return ({ ...c, name: c.name || 'ComfyUI', models: (wfs.length ? wfs : [c.name || 'ComfyUI 工作流']), defaultModel: defM, _source: 'comfyui' as const }); }),
      ];
    }
    // 语音类节点
    else if (['tts', 'audio2video', 'audio-to-text'].includes(node.type)) {
      configs = [
        ...voiceAPIConfigs.filter(config => hasSavedCallableApiConfig(config)).map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'voice' as const })),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
        // ComfyUI 音频工作流（配音设计/声音克隆）：默认选中音频分类预设（仅显示已连接成功的配置）
        ...readyComfyConfigs.map(c => { const wfs = ((c.workflowFiles || []) as any[]).map((w: any) => w.name || w); const pre = c?.categoryPresets?.audio; const defM = wfs.find((m: string) => m === pre) || wfs[0] || c.name || 'ComfyUI 工作流'; return ({ ...c, name: c.name || 'ComfyUI', models: (wfs.length ? wfs : [c.name || 'ComfyUI 工作流']), defaultModel: defM, _source: 'comfyui' as const }); }),
      ];
    }
    // 音乐类节点
    else if (['video-to-music'].includes(node.type)) {
      configs = [
        ...musicAPIConfigs.filter(config => hasSavedCallableApiConfig(config)).map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'music' as const })),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
      ];
    }
    // ComfyUI 节点
    else if (node.type === 'comfyui') {
      configs = readyComfyConfigs.map(c => { const ms = comfyModelsFor(c); return ({ ...c, name: c.name || 'ComfyUI', models: ms, defaultModel: ms[0], _source: 'comfyui' as const }); });
    }
    // 默认返回所有可用配置
    else {
      configs = allAvailableConfigs;
    }
    // 去重：根据 id 去重，保留第一个出现的配置
    const seen = new Set<string>();
    return configs.filter(cfg => {
      if (seen.has(cfg.id)) return false;
      seen.add(cfg.id);
      return true;
    });
  })();
  
  const [selectedConfig, setSelectedConfig] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  React.useEffect(() => {
    if (apiConfigs.length > 0 && !selectedConfig) {
      // 优先回显节点已保存的接口/模型（例如已选择的 ComfyUI 工作流）
      const savedCfg = node.configId ? apiConfigs.find((c: any) => c.id === node.configId) : undefined;
      const defaultCfg = savedCfg || apiConfigs.find((c: any) => c.isDefault) || apiConfigs[0];
      setSelectedConfig(defaultCfg.id || '');
      const savedModel = savedCfg && node.model && (defaultCfg.models || []).includes(node.model) ? node.model : '';
      setSelectedModel(savedModel || defaultCfg.models?.[0] || defaultCfg.defaultModel || '');
    }
  }, [apiConfigs]);

  // 自定义下拉：聚焦与点击外部关闭
  const modelDropdownRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!modelDropdownOpen) return;
    const close = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setModelDropdownOpen(false); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [modelDropdownOpen]);

  const currentConfig = apiConfigs.find(c => c.id === selectedConfig);
  const modelList = currentConfig?.models || (currentConfig as any)?.workflowFiles || [];

  // 弹窗使用 fixed 定位并基于 anchorRect（屏幕坐标）计算位置，
  // 不依赖画布缩放值，因此移除了此前 100ms 轮询的 canvasZoom 逻辑（持续触发重渲染，节点多时明显卡顿）。
  const canvasRoot = typeof document === 'undefined' ? null : document.querySelector('.llib-full-canvas') as HTMLElement | null;
  const canvasRect = canvasRoot?.getBoundingClientRect() ?? null;
  const viewportWidth = canvasRect?.width ?? (typeof window === 'undefined' ? 1280 : window.innerWidth);
  
  // 弹窗位置基于 anchorRect（节点 DOM 位置），使用 fixed 定位避免被父元素变换影响
  const anchorCenterX = anchorRect ? anchorRect.left + anchorRect.width / 2 : 0;
  const anchorBottom = anchorRect ? anchorRect.bottom : 0;
  const maxPopoverWidth = Math.min(640, viewportWidth - 24);
  // 弹窗宽度：跟随节点宽度同比例（节点画布坐标 * 缩放 = 屏幕宽度）
  // 使用节点实际的屏幕宽度作为最小参考，最大不超过 640px
  const nodeScreenWidth = anchorRect?.width ?? 360;
  const popoverWidth = Math.max(Math.min(maxPopoverWidth, 640), Math.min(nodeScreenWidth * 1.4, maxPopoverWidth));
  
  // 使用 fixed 定位，基于屏幕坐标
  const popoverLeft = anchorRect ? anchorCenterX - popoverWidth / 2 : 0;
  const popoverTop = anchorRect ? anchorBottom + 8 : 0;
  const portalTarget = canvasRoot || document.body;

  // 弹窗样式：使用 fixed 定位，不受画布缩放影响
  const portalStyle: React.CSSProperties = {
    position: 'fixed',
    left: popoverLeft,
    top: popoverTop,
    width: popoverWidth,
    zIndex: 50,
  };

  const popover = (
    <div 
      className="node-input-popover nodrag nowheel" 
      style={anchorRect ? {
        position: 'fixed',
        left: popoverLeft,
        top: popoverTop,
        width: popoverWidth,
        zIndex: 50,
        '--popover-left': `${popoverLeft}px`,
        '--popover-top': `${popoverTop}px`,
        '--popover-width': `${popoverWidth}px`,
        '--popover-z-index': '50',
      } as React.CSSProperties : undefined}
      onPointerDown={(e) => e.stopPropagation()} 
      onMouseDown={(e) => e.stopPropagation()} 
      onClick={(e) => e.stopPropagation()}
    >
      <div className="popover-header">
        <span className="popover-title">{NODE_TEMPLATES.find(t => t.type === node.type)?.label || '节点'} - 输入</span>
        {isMediaInputNode && (
          <div className="popover-video-tabs popover-video-tabs-header">
            {mediaFeatures.slice(0, isImageInputNode ? 2 : 5).map(feature => {
              const isTextToImage = feature.id === 'text-to-image';
              const isTextToVideo = feature.id === 'text-to-video';
              const hasReference = referenceImages.length > 0;
              // 强制全能参考：除“全能参考(reference)”外，其他选项全部变灰不可选
              const disabledByForce = forceOmniReference && feature.id !== 'reference';
              const shouldDisable = disabledByForce || ((isTextToImage || isTextToVideo) && (hasIncomingImageNode || hasReference));
              return (
                <button
                  key={feature.id}
                  className={`popover-video-tab ${activeFeature === feature.id ? 'active' : ''} ${shouldDisable ? 'disabled' : ''}`}
                  onClick={() => !shouldDisable && switchVideoFeature(feature.id)}
                  disabled={shouldDisable}
                  title={disabledByForce ? '已检测到视频或多种格式输入，仅可使用全能参考' : (shouldDisable ? '已检测到图片输入，请使用图片相关功能' : '')}
                >
                  {feature.label}
                </button>
              );
            })}
          </div>
        )}
        <button className="popover-close" onClick={onClose}><SvgIcon name="close" size={14} /></button>
      </div>
      <div className="popover-body">
        {isMediaInputNode ? (
          <div className="popover-video-inputs">
            <div className="popover-video-tools">
              {isImageInputNode ? (
                <>
                  <button className={`popover-video-tool square ${activeFeature === 'marker' ? 'active' : ''}`} onClick={() => applyMediaFeature('marker')} title="标注"><SvgIcon name="grid" size={13} /><span>标注</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'reference-extra' ? 'active' : ''}`} onClick={() => applyMediaFeature('reference-extra')} title="点击画布图片节点选择参考图"><SvgIcon name="cursor" size={13} /><span>参考</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'upload' ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()} title="上传参考图"><SvgIcon name="upload" size={13} /><span>参考图</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'asset' ? 'active' : ''}`} onClick={() => applyMediaFeature('asset')} title="从资产库选择"><SvgIcon name="box" size={13} /><span>资产</span></button>
                </>
              ) : (
                <>
                  <button className={`popover-video-tool square ${activeFeature === 'marker' ? 'active' : ''}`} onClick={() => applyMediaFeature('marker')} title="标注"><SvgIcon name="grid" size={13} /><span>标注</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'reference-extra' ? 'active' : ''}`} onClick={() => applyMediaFeature('reference-extra')} title="点击画布图片节点选择参考图"><SvgIcon name="cursor" size={13} /><span>参考</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'upload' ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()} title="上传参考图"><SvgIcon name="upload" size={13} /><span>参考图</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'asset' ? 'active' : ''}`} onClick={() => applyMediaFeature('asset')} title="从资产库选择"><SvgIcon name="box" size={13} /><span>资产</span></button>
                </>
              )}
            </div>
            {referenceImages.length > 0 && (
              <div className="popover-reference-strip">
                <span className="popover-reference-label">参考</span>
                {referenceImages.map(image => (
                  <button key={image.id} className={`popover-reference-thumb ${image.kind === 'video' ? 'is-video' : ''}`} title={`@${image.name}`} onClick={() => setInputRows(prev => (prev.length === 0 ? [{ id: `row-${Date.now()}`, feature: activeFeature || defaultFeature, text: `@${image.name} ` }] : prev).map((row, index) => index === 0 ? { ...row, text: row.text.includes(`@${image.name}`) ? row.text : `${row.text}${row.text ? ' ' : ''}@${image.name} ` } : row))}>
                    {image.kind === 'video' ? (
                      image.thumbnail
                        // 视频参考：使用抓取到的第一帧缩略图显示；缩略图未就绪时用 video 标签兜底展示首帧，避免读取不到缩略图
                        ? <img src={image.thumbnail} alt={image.name} />
                        : <video src={image.url} muted playsInline preload="metadata" />
                    ) : (
                      <img src={image.thumbnail || image.url} alt={image.name} />
                    )}
                    {image.kind === 'video' && <span className="popover-reference-video-badge"><SvgIcon name="video" size={10} /></span>}
                    <span
                      className="popover-reference-remove"
                      title="删除参考"
                      onClick={(event) => { event.preventDefault(); event.stopPropagation(); removeReferenceImage(image.id); }}
                    >
                      <SvgIcon name="close" size={10} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="popover-video-row-list">
              {(() => {
                const row = inputRows[0] || { id: 'row-main', feature: activeFeature || defaultFeature, text: '' };
                const feature = mediaFeatures.find(item => item.id === row.feature) || mediaFeatures[0];
                return (
                  <div className="popover-video-row single">
                    <RichPromptEditor
                      className="popover-textarea popover-video-textarea nodrag nowheel"
                      referenceNames={referenceImages.map(img => img.name)}
                      references={referenceImages.map(img => ({ name: img.name, url: img.url, thumbnail: (img as any).thumbnail || img.url, kind: (img as any).type || 'image' }))}
                      onPointerDown={stopInputDrag}
                      onMouseDown={stopInputDrag}
                      value={row.text}
                      onChange={(value) => {
                        setInputRows(prev => prev.length === 0 ? [{ id: 'row-main', feature: activeFeature || defaultFeature, text: value }] : prev.map((item, index) => index === 0 ? { ...item, text: value } : item));
                      }}
                      onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } }}
                      placeholder={feature.placeholder}
                      rows={3}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        ) : (
          <RichPromptEditor
            className="popover-textarea nodrag nowheel"
            referenceNames={referenceImages.map(img => img.name)}
            references={referenceImages.map(img => ({ name: img.name, url: img.url, thumbnail: (img as any).thumbnail || img.url, kind: (img as any).type || 'image' }))}
            onPointerDown={stopInputDrag}
            onMouseDown={stopInputDrag}
            value={prompt}
            onChange={(value) => setPrompt(value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="输入提示词..."
            rows={3}
          />
        )}
        {attachedFiles.length > 0 && (
          <div className="popover-files">
            {attachedFiles.map((f, idx) => (
              <span key={idx} className="popover-file-tag">
                <SvgIcon name="file" size={12} /> {f.name.slice(0, 15)}
                <span onClick={() => removeFile(idx)}><SvgIcon name="close" size={10} /></span>
              </span>
            ))}
          </div>
        )}
        <div className="popover-actions">
          <div className="popover-left-actions">
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*" onChange={handleFileUpload} style={{ display: 'none' }} id={`pop-file-${node.id}`} />
            {!isPanorama720Input && (
              <label htmlFor={`pop-file-${node.id}`} className="popover-action-btn" title="上传附件"><SvgIcon name="upload" size={14} /></label>
            )}
            {/* 自定义主题下拉（避免 Windows 原生 select 采价低色） */}
            <div ref={modelDropdownRef} className={`popover-model-dropdown nodrag nowheel ${modelDropdownOpen ? 'open' : ''}`} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag}>
              <button
                type="button"
                className="popover-model-dropdown-trigger"
                onClick={(e) => { e.stopPropagation(); setModelDropdownOpen(open => !open); }}
                title="选择 API 与模型"
              >
                <span className="popover-model-dropdown-label">{selectedModel || (apiConfigs.find(c => c.id === selectedConfig)?.name) || '选择接口'}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="popover-model-dropdown-arrow"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {modelDropdownOpen && (
                <div className="popover-model-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                  {apiConfigs.length === 0 && <div className="popover-model-dropdown-empty">暂未配置 API</div>}
                  {apiConfigs.map(cfg => (
                    <div key={cfg.id} className="popover-model-dropdown-group">
                      <div className="popover-model-dropdown-group-label">{cfg.name || cfg.provider}</div>
                      {(cfg.models || []).map(m => {
                        const valueKey = `${cfg.id}::${m}`;
                        const isActive = selectedConfig === cfg.id && selectedModel === m;
                        return (
                          <button
                            key={valueKey}
                            type="button"
                            className={`popover-model-dropdown-item ${isActive ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedConfig(cfg.id);
                              setSelectedModel(m);
                              setModelDropdownOpen(false);
                              // 把所选接口/模型提交到节点，确保 executeNode 路由到正确的 provider（含 ComfyUI）
                              const isComfy = (cfg as any)._source === 'comfyui' || readyComfyConfigs.some(cc => cc.id === cfg.id);
                              // ComfyUI：把所选“工作流名”映射到缓存 id；选“自动搭建”则清空以现搭
                              let nextOptions = node.options || {};
                              if (isComfy) {
                                const b = String((cfg as any).serverUrl || '').trim().replace(/\/+$/, '');
                                const hit = m === '自动搭建' ? undefined : (comfyWorkflowCache || []).find((w: any) => w.name === m && w.feature === node.type && (!b || w.serverUrl === b));
                                nextOptions = { ...nextOptions, workflowCacheId: hit ? hit.id : undefined, workflowName: m === '自动搭建' ? undefined : m };
                              }
                              useAppStore.getState().updateNode(node.id, {
                                provider: (isComfy ? 'comfyui' : ((cfg as any).provider || 'openai')) as any,
                                configId: cfg.id,
                                model: m,
                                options: nextOptions,
                              });
                            }}
                          >
                            {isActive && <span className="popover-model-dropdown-check">✓</span>}
                            <span>{m}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isVideoInputNode && !isPanorama720Input && (
              <div className="image-param-wrap">
                <button className="image-param-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setVideoParamOpen(open => !open); }} title="视频生成参数">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><line x1="3" y1="17" x2="8.59" y2="11.41" /><line x1="9" y1="9" x2="21" y2="21" /></svg>
                  <span>{videoRatio === 'auto' ? 'Auto' : videoRatio} · {videoClarity} · {videoDuration}s</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {videoParamOpen && (
                  <div className="image-param-panel video-param-panel" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => event.stopPropagation()}>
                    <div className="image-param-section">
                      <div className="image-param-title">比例</div>
                      <div className="image-param-segment">
                        {VIDEO_RATIO_OPTIONS.map(option => (
                          <button key={option.id} className={videoRatio === option.id ? 'active' : ''} onClick={() => setVideoRatio(option.id)}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">清晰度</div>
                      <div className="image-param-segment">
                        {VIDEO_CLARITY_OPTIONS.map(option => (
                          <button key={option} className={videoClarity === option ? 'active' : ''} onClick={() => setVideoClarity(option)}>{option}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">时长 <span style={{color: 'var(--primary-color, #7dd3fc)'}}>{videoDuration}s</span></div>
                      <div className="video-param-duration-row">
                        <input
                          type="range"
                          className="video-param-slider"
                          min={5} max={30} step={5}
                          value={videoDuration}
                          onChange={e => setVideoDuration(Number(e.target.value))}
                        />
                      </div>
                      <div className="video-param-ticks">
                        <span>5s</span>
                        <span>10s</span>
                        <span>15s</span>
                        <span>20s</span>
                        <span>25s</span>
                        <span>30s</span>
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">音频</div>
                      <div className="image-param-segment">
                        <button className={`video-audio-btn ${generateAudio ? 'active' : ''}`} onClick={() => setGenerateAudio(!generateAudio)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h4l5 5V5L8 10H4z" /><path d="M17 9a4 4 0 010 6" /></svg>
                          <span>{generateAudio ? '已开启' : '已关闭'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isVideoInputNode && !isPanorama720Input && (
              <button className="popover-action-btn camera-btn" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={() => setShowCameraGallery(true)} title="选择运镜">
                <svg className="camera-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="camera-btn-text">运镜</span>
                {selectedCameraId && <span className="camera-badge">{selectedCameraMovement?.name}</span>}
              </button>
            )}
            {isImageInputNode && !isPanorama720Input && (
              <div className="image-param-wrap">
                <button className="image-param-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setImageParamOpen(open => !open); }} title="画质 / 清晰度 / 比例">
                  <SvgIcon name="image" size={13} />
                  <span>{IMAGE_RATIO_OPTIONS.find(item => item.id === imageRatio)?.label || '自适应'} · {IMAGE_QUALITY_OPTIONS.find(item => item.id === imageQuality)?.label || '标准画质'} · {imageClarity}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {imageParamOpen && (
                  <div className={`image-param-panel ${isPanorama720Input ? 'panorama-param-panel' : ''}`} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => event.stopPropagation()}>
                    <div className="image-param-section">
                      <div className="image-param-title">画质</div>
                      <div className={`image-param-segment ${isPanorama720Input ? 'single' : ''}`}>
                        {(isPanorama720Input ? IMAGE_QUALITY_OPTIONS.filter(option => option.id === 'standard') : IMAGE_QUALITY_OPTIONS).map(option => (
                          <button key={option.id} className={imageQuality === option.id ? 'active' : ''} onClick={() => changeImageQuality(option.id)}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">清晰度</div>
                      <div className="image-param-segment">
                        {IMAGE_CLARITY_OPTIONS.map(option => (
                          <button key={option} className={imageClarity === option ? 'active' : ''} onClick={() => changeImageClarity(option)}>{option}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">比例</div>
                      <div className={`image-ratio-grid ${isPanorama720Input ? 'single' : ''}`}>
                        {(isPanorama720Input ? IMAGE_RATIO_OPTIONS.filter(option => option.id === '2:1') : IMAGE_RATIO_OPTIONS).map(option => (
                          <button key={option.id} className={imageRatio === option.id ? 'active' : ''} onClick={() => changeImageRatio(option.id)}>
                            <span className={`ratio-icon ${option.wide ? 'wide' : ''}`} />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isPanorama720Input && (
              <div className="panorama-feature-wrap">
                <button className="panorama-feature-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setFeaturePanelOpen(open => !open); }} title="选择生成类型">
                  <SvgIcon name={selectedPanoramaFeature.icon} size={13} />
                  <span>{selectedPanoramaFeature.label}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {featurePanelOpen && (
                  <div className="panorama-feature-panel" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => event.stopPropagation()}>
                    {PANORAMA_FEATURE_COLUMNS.map(column => (
                      <div key={column.id} className="panorama-feature-column">
                        <div className="panorama-feature-title">{column.title}</div>
                        <div className="panorama-feature-list">
                          {PANORAMA_FEATURES.filter(feature => feature.column === column.id).map(feature => (
                            <button key={feature.id} className={`panorama-feature-option ${selectedPanoramaFeature.id === feature.id ? 'active' : ''}`} onClick={() => applyPanoramaFeature(feature)} title={feature.prompt}>
                              <span className="panorama-feature-icon"><SvgIcon name={feature.icon} size={16} /></span>
                              <span className="panorama-feature-copy">
                                <strong>{feature.label}</strong>
                                {feature.desc && <small>{feature.desc}</small>}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!isPanorama720Input && (
              <button className="popover-action-btn popover-prompt-library-btn" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(e) => { e.stopPropagation(); setShowPromptLibraryPicker(v => !v); }} title="提示词库">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /><line x1="10" y1="9" x2="16" y2="9" /><line x1="10" y1="13" x2="16" y2="13" /><line x1="10" y1="17" x2="14" y2="17" /></svg>
                <span>提示词库</span>
              </button>
            )}
          {showPromptLibraryPicker && (
            <div className="popover-prompt-library-picker" onClick={(e) => e.stopPropagation()} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag}>
              {promptLibrary.length === 0 ? (
                <div className="popover-prompt-library-empty">提示词库为空</div>
              ) : (
                promptLibrary.map(item => (
                  <button
                    key={item.id}
                    className="popover-prompt-library-item"
                    onClick={() => {
                      const textToInsert = item.prompt;
                      if (isMediaInputNode && inputRows.length > 0) {
                        setInputRows(rows => rows.map((row, i) => i === 0 ? { ...row, text: row.text + (row.text ? ' ' : '') + textToInsert } : row));
                      } else {
                        setPrompt(p => p + (p ? ' ' : '') + textToInsert);
                      }
                      setShowPromptLibraryPicker(false);
                    }}
                    title={item.prompt}
                  >
                    <span className="popover-prompt-library-item-name">{item.name}</span>
                    <span className={`popover-prompt-library-item-type type-${item.type}`}>{item.type === 'image' ? '图' : item.type === 'video' ? '视频' : '文'}</span>
                  </button>
                ))
              )}
            </div>
          )}
          </div>
          <button className="popover-send-btn" onClick={handleSend} disabled={!(isMediaInputNode ? inputRows.some(row => row.text.trim()) : prompt.trim()) && attachedFiles.length === 0}>
            <SvgIcon name="play" size={14} /> 执行
          </button>
        </div>
      </div>
      {assetPickerOpen && (
        <div className="popover-asset-picker" onClick={() => setAssetPickerOpen(false)}>
          <div className="popover-asset-panel" onClick={(event) => event.stopPropagation()}>
            <div className="popover-asset-title">选择参考图</div>
            <div className="popover-asset-grid">
              {imageAssets.length === 0 ? <div className="popover-asset-empty">资产库暂无图片</div> : imageAssets.map((asset: any) => (
                <button key={asset.id} className="popover-asset-item" onClick={() => { addReferenceImage(asset.name, asset.thumbnail || normalizeFileSrc(asset.path)); setAssetPickerOpen(false); }}>
                  <img src={asset.thumbnail || normalizeFileSrc(asset.path)} alt={asset.name} />
                  <span>{asset.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {markerMode && referenceImages[0] && (
        <NodeMarkerEditor
          imageUrl={referenceImages[0].url}
          onClose={() => setMarkerMode(false)}
          onSave={saveMarkedReference}
        />
      )}
      {showCameraGallery && (
        <CameraMovementGallery
          selectedId={selectedCameraId}
          onSelect={(movement) => {
            setSelectedCameraId(movement.id);
          }}
          onClose={() => setShowCameraGallery(false)}
        />
      )}
    </div>
  );

  if (!anchorRect || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="node-input-popover-portal">{popover}</div>,
    portalTarget
  );
}
// ==================== 节点内嵌对话框 ====================

function NodeChatDialog({ node, onSend }: { node: AINode; onSend: (prompt: string, files?: File[]) => void }) {
  const [prompt, setPrompt] = useState(node.prompt || '');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<{ role: 'user' | 'ai'; text: string; files?: string[] }[]>([]);
  useEffect(() => { historyEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files!);
      setAttachedFiles(prev => [...prev, ...files]);
      // 自动保存到资产库（图片/视频/音频）
      files.forEach(file => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        const isAudio = file.type.startsWith('audio/');
        if (!isImage && !isVideo && !isAudio) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          autoSaveMediaToAssets({ name: file.name, type: isImage ? 'image' : isVideo ? 'video' : 'audio', path: dataUrl, size: file.size, sourceType: 'canvas' });
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSend = () => {
    if (!prompt.trim() && attachedFiles.length === 0) return;
    setIsGenerating(true);
    const fileNames = attachedFiles.map(f => f.name);
    setHistory(prev => [...prev, { role: 'user', text: prompt, files: fileNames }]);
    onSend(prompt, attachedFiles.length > 0 ? [...attachedFiles] : undefined);
    setPrompt('');
    setAttachedFiles([]);
    setTimeout(() => {
      setHistory(prev => [...prev, { role: 'ai', text: '生成完成，结果已显示在节点中。' }]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="node-chat-dialog">
      <div className="node-chat-history">
        {history.length === 0 && (
          <div className="node-chat-placeholder">输入提示词或上传文件开始</div>
        )}
        {history.map((h, i) => (
          <div key={i} className={`node-chat-msg ${h.role === 'user' ? 'user' : 'ai'}`}>
            {h.role === 'user' && h.files && h.files.length > 0 && (
              <div className="node-msg-files">{h.files.map(f => `附件 ${f}`).join(' ')}</div>
            )}
            <span className="node-msg-text">{h.text}</span>
          </div>
        ))}
        <div ref={historyEndRef} />
      </div>
      <div className="node-input-area">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="输入消息，Shift+Enter 换行..."
          rows={1}
          className="node-textarea"
        />
        {attachedFiles.length > 0 && (
          <div className="node-attached-files">
            {attachedFiles.map((f, idx) => (
              <span key={idx} className="node-file-tag">
                <SvgIcon name="file" size={13} /> {f.name}
                <span onClick={() => removeFile(idx)}><SvgIcon name="close" size={12} /></span>
              </span>
            ))}
          </div>
        )}
        <div className="node-input-actions">
          <div className="node-left-controls">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id={`node-file-${node.id}`}
            />
            <label htmlFor={`node-file-${node.id}`} className="node-upload-btn" title="上传文件"><SvgIcon name="upload" size={15} /></label>
            <button className="node-asset-btn" title="从资产库选择"><SvgIcon name="box" size={15} /></button>
          </div>
          <button
            className="node-send-btn"
            onClick={handleSend}
            disabled={isGenerating || (!prompt.trim() && attachedFiles.length === 0)}
          >
            <SvgIcon name={isGenerating ? 'loading' : 'play'} size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 自定义节点 ====================

// 子功能定义：每种节点类型对应的子功能列表
const NODE_SUB_FUNCTIONS: Record<string, { id: string; label: string; icon: CanvasIconName }[]> = {
  'story-script': [
    { id: 'custom-text', label: '自己编写内容', icon: 'text' },
    { id: 'text-to-video', label: '文生视频', icon: 'video' },
    { id: 'image-prompt', label: '图片反推提示词', icon: 'image' },
    { id: 'text-to-music', label: '文字生音乐', icon: 'audio' },
  ],
  'text-to-image': [
    { id: 'text-to-image', label: '文生图', icon: 'image' },
    { id: 'image-upscale', label: '图片高清', icon: 'spark' },
  ],
  'text-to-video': [
    { id: 'first-last-frame-video', label: '首尾帧生成视频', icon: 'box' },
    { id: 'first-frame-video', label: '首帧生成视频', icon: 'spark' },
  ],
  'video-composite': [
    { id: 'video-composite', label: '视频合成', icon: 'cut' },
    { id: 'subtitle', label: '字幕生成', icon: 'text' },
  ],
  'director-stage': [
    { id: 'director-stage', label: '3D场景', icon: 'stage' },
  ],
  'audio2video': [
    { id: 'audio2video', label: '音频驱动', icon: 'audio' },
    { id: 'tts', label: '语音合成', icon: 'mic' },
  ],
  'story-script-adv': [
    { id: 'script-gen', label: '脚本生成', icon: 'script' },
    { id: 'storyboard', label: '故事板', icon: 'image' },
  ],
};

function WorkflowNode({ id, data, selected }: any) {
  const node = data.node as AINode;
  const isInputConnected = !!data.isInputConnected;
  const isOutputConnected = !!data.isOutputConnected;
  const incomingImageNodeIds = (data.incomingImageNodeIds as string[]) || [];
  const hasIncomingImageNode = incomingImageNodeIds.length > 0;
  const incomingImageCount = (data.incomingImageCount as number) || 0;
  const forceOmniReference = !!data.forceOmniReference;
  const activeInputNodeId = data.activeInputNodeId as string | null;
  const setActiveInputNodeId = data.setActiveInputNodeId as ((id: string | null) => void) | undefined;
  const disconnectNode = data.disconnectNode as ((nodeId: string, side: 'input' | 'output') => void) | undefined;
  const createLinkedNode = data.createLinkedNode as ((sourceId: string, targetType: AINodeType, overrides?: Partial<Omit<AINode, 'id'>>) => string | undefined) | undefined;
  const deleteCanvasNode = data.deleteCanvasNode as ((nodeId: string) => void) | undefined;
  const setMediaPreview = data.setMediaPreview as ((preview: { src: string; type: 'image' | 'video' | 'audio' } | null) => void) | undefined;
  const referencePickActive = !!data.referencePickActive;
  const referencePicked = !!data.referencePicked;
  const onPickReferenceNode = data.onPickReferenceNode as ((nodeId: string) => void) | undefined;
  const { updateNode, deleteNode } = useAppStore.getState();
  const template = NODE_TEMPLATES.find(t => t.type === node?.type);
  const color = template?.color || '#00D4FF';
  const isDirectorStageNode = node?.type === 'director-stage';
  // 全景图节点用的是 text-to-image 类型，模板图标会解析成 image，这里改用更贴切的 panorama 图标
  const isPanoramaKind = node?.options?.outputType === 'panorama' || node?.options?.panoramaType === '720';
  const nodeIcon: CanvasIconName = isPanoramaKind ? 'panorama' : (template?.icon || 'canvas');
  const [showMenu, setShowMenu] = useState(false);
  const [inlineMode, setInlineMode] = useState(false);
  // 文本节点和自定义文本节点在 inlineMode 编辑时隐藏弹窗输入框
  const isTextNodeType = TEXT_NODE_TYPES.includes(node?.type);
  const isCustomTextNode = node?.options?.isInlineText || node?.options?.generationType === 'custom-text';
  // 全景图节点：不需要输入框/子功能，直接连接图片自动生成三维全景预览
  const isPanoramaNode = node?.options?.outputType === 'panorama' || node?.options?.panoramaType === '720';
  // 文本节点：单击显示弹窗，双击进入 inlineMode 后隐藏弹窗；全景图节点不显示输入弹窗
  const showInputPopover = activeInputNodeId === node.id && !isPanoramaNode && !(inlineMode && (isTextNodeType || isCustomTextNode));
  const nodeVisuallySelected = !!selected || showInputPopover;
  const [inlineText, setInlineText] = useState(
    node?.result?.type === 'text' && node.result.text?.trim()
      ? node.result.text
      : (node?.prompt || '')
  );
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(getNodeDisplayName(node));
  const [mediaAspectRatio, setMediaAspectRatio] = useState<number | null>(null);
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [imageToolbarOpen, setImageToolbarOpen] = useState(false);
  const [nodeMarkerOpen, setNodeMarkerOpen] = useState(false);
  const [directorStageOpen, setDirectorStageOpen] = useState(false);
  const [directorReferenceMedia, setDirectorReferenceMedia] = useState<{ url?: string; kind?: 'image' | 'video'; durationSeconds?: number; text?: string } | null>(null);
  const [panoramaViewerOpen, setPanoramaViewerOpen] = useState(false);
  useEffect(() => {
    const closeToolbar = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId?: string }>).detail;
      if (!detail?.nodeId || detail.nodeId !== node.id) setImageToolbarOpen(false);
    };
    window.addEventListener('canvas:close-image-toolbar', closeToolbar as EventListener);
    return () => window.removeEventListener('canvas:close-image-toolbar', closeToolbar as EventListener);
  }, [node.id]);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [inputAnchorRect, setInputAnchorRect] = useState<DOMRect | null>(null);
  const isConnectedNode = isInputConnected || isOutputConnected;
  const isTextNode = TEXT_NODE_TYPES.includes(node?.type);
  const displayMedia = node?.result && (node.result.type === 'image' || node.result.type === 'video' || node.result.type === 'audio')
    ? { url: node.result.url, type: node.result.type as 'image' | 'video' | 'audio' }
    : node?.thumbnail
        ? { url: node.thumbnail, type: 'image' as const }
        : undefined;
  const textSummary = node?.result?.type === 'text'
    ? (node.result.text || node.result.url || '')
    : (isTextNode ? (node?.prompt || '') : '');
  const isInlineTextNode = !!node?.options?.isInlineText || node?.options?.generationType === 'custom-text';
  const hasTextContent = !!textSummary.trim() || !!node?.options?.isInlineText;
  const hasDisplayContent = isConnectedNode || hasTextContent || !!displayMedia;
  const hasImageMedia = !!displayMedia?.url && displayMedia.type === 'image';
  const storedNodeAspectRatio = Number(node?.options?.previewAspectRatio || node?.meta?.previewAspectRatio || 0);
  const previewAspectRatio = mediaAspectRatio || (Number.isFinite(storedNodeAspectRatio) && storedNodeAspectRatio > 0 ? storedNodeAspectRatio : null);
  const previewHeight = displayMedia?.type === 'audio'
    ? 118
    : displayMedia && previewAspectRatio
      ? Math.max(96, Math.round(280 / previewAspectRatio))
      : undefined;

  // 当前节点类型的子功能列表（全景图节点不需要任何子功能）
  const subFunctions = isPanoramaNode ? [] : (NODE_SUB_FUNCTIONS[node?.type] || []);

  // 新建节点时自动弹出输入框
  React.useEffect(() => {
    if (node?.options?._autoOpen) {
      setActiveInputNodeId?.(node.id);
      // 清除标记，避免每次渲染都打开
      updateNode(node.id, { options: { ...node.options, _autoOpen: undefined } });
    }
  }, [node?.id]);

  const handleChatSend = useCallback((prompt: string, files?: File[], generationType?: string, videoConfig?: any) => {
    // 读取 store 中最新的节点选项：NodeInputPopover.handleSend 已把输入框下方的所有参数
    //（图片比例/画质/清晰度、视频比例/清晰度/时长/音频/运镜等）写入 store。
    // 若这里用闭包里的旧 node.options 展开，会把刚保存的参数覆盖掉，导致参数对生成结果不生效。
    const latestNode = useAppStore.getState().nodes[node.id];
    const updatedOptions: any = { ...(latestNode?.options || node.options) };
    if (generationType) {
      updatedOptions.generationType = generationType;
    }
    if (videoConfig) {
      updatedOptions.videoConfig = videoConfig;
    }
    updateNode(node.id, { prompt, status: 'loading', options: updatedOptions });
    useAppStore.getState().executeNode(node.id, videoConfig);
  }, [node.id]);

  const saveInlineText = useCallback((value: string) => {
    // 内联编辑覆盖了 AI 结果——清理 node.result 以免显示旧 AI 返回
    updateNode(node.id, {
      prompt: value,
      result: undefined,
      thumbnail: undefined,
      options: { ...node.options, generationType: node.options?.generationType || 'custom-text', isInlineText: true },
    });
    window.dispatchEvent(new CustomEvent('canvas:inline-prompt-change', {
      detail: { nodeId: node.id, prompt: value },
    }));
  }, [node.id, node.options]);

  // 解析 3D 导演台节点的上游参考媒体（图片/视频），用作视口参考底图与默认录制时长
  const resolveDirectorReferenceMedia = useCallback(() => {
    const state = useAppStore.getState();
    const upstreamIds: string[] = [
      ...((data.incomingImageNodeIds as string[]) || []),
      ...((node.options?.upstreamNodeIds as string[]) || []),
    ];
    const seen = new Set<string>();
    let picked: { url: string; kind: 'image' | 'video' } | null = null;
    let refText = '';
    for (const upstreamId of upstreamIds) {
      if (!upstreamId || seen.has(upstreamId)) continue;
      seen.add(upstreamId);
      const source = state.nodes[upstreamId];
      if (!source) continue;
      // 收集上游文本作为预演提示词（剧本/描述节点）
      if (source.result?.type === 'text' && source.result.text) refText = refText || source.result.text;
      else if (source.prompt && (source.options?.isInlineText || source.type === 'story-script' || source.type === 'story-script-adv')) refText = refText || source.prompt;
      if (source.result?.type === 'video' && source.result.url) { picked = { url: source.result.url, kind: 'video' }; continue; }
      if (source.result?.type === 'image' && source.result.url) { picked = picked || { url: source.result.url, kind: 'image' }; continue; }
      if (source.thumbnail) { picked = picked || { url: source.thumbnail, kind: 'image' }; }
    }
    const selfText = (node.prompt || '').trim();
    const text = (refText || selfText || '').trim() || undefined;
    if (!picked && !text) { setDirectorReferenceMedia(null); return; }
    if (picked && picked.kind === 'video') {
      const url = picked.url;
      // 立即先设置（无时长），读取元数据后再补默认录制时长
      setDirectorReferenceMedia({ url, kind: 'video', text });
      const videoEl = document.createElement('video');
      videoEl.preload = 'metadata';
      videoEl.muted = true;
      videoEl.src = url;
      videoEl.onloadedmetadata = () => {
        const dur = Number.isFinite(videoEl.duration) && videoEl.duration > 0 ? videoEl.duration : undefined;
        setDirectorReferenceMedia({ url, kind: 'video', durationSeconds: dur, text });
        try { videoEl.removeAttribute('src'); videoEl.load(); } catch {}
      };
      videoEl.onerror = () => setDirectorReferenceMedia({ url, kind: 'video', text });
    } else if (picked) {
      setDirectorReferenceMedia({ url: picked.url, kind: 'image', text });
    } else {
      setDirectorReferenceMedia({ text });
    }
  }, [data.incomingImageNodeIds, node.options?.upstreamNodeIds, node.prompt]);

  const handleSubFunctionClick = useCallback((subId: string) => {
    // 3D 导演台节点：点击子功能按钮直接打开 3D 场景搭建弹窗
    if (node.type === 'director-stage') {
      resolveDirectorReferenceMedia();
      setDirectorStageOpen(true);
      setActiveInputNodeId?.(null);
      return;
    }
    const videoFeatureMap: Record<string, string> = {
      'first-last-frame-video': 'first-frame',
      'first-frame-video': 'image-to-video',
    };
    if (node.type === 'text-to-video' && videoFeatureMap[subId]) {
      updateNode(node.id, { options: { ...node.options, generationType: videoFeatureMap[subId] } });
      setInlineMode(false);
      setActiveInputNodeId?.(node.id);
      return;
    }
    // 所有子功能点击后都转为 inline 文本样式
    updateNode(node.id, { options: { ...node.options, generationType: subId, isInlineText: true } });

    // 文生视频：自动连接视频节点
    if (subId === 'text-to-video') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      // 自动连接一个视频节点
      createLinkedNode?.(node.id, 'text-to-video');
      return;
    }

    // 文字生音乐：自动连接音频节点（以当前文本作为音乐生成提示词）
    if (subId === 'text-to-music') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      createLinkedNode?.(node.id, 'audio2video', {
        options: { displayName: '音乐节点', generationType: 'text-to-music' },
      });
      return;
    }

    // 文生图：自动连接图片节点（以当前文本作为图片生成提示词）
    if (subId === 'text-to-image') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'text-to-image', {
        options: { displayName: '图片节点', generationType: 'text-to-image', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 图片高清：自动连接图片高清节点
    if (subId === 'image-upscale') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'image-upscale', {
        options: {
          displayName: '图片高清',
          generationType: 'image-upscale',
          mediaFeature: '图片高清',
          sourceFeature: 'upscale',
          imageClarity: node.options?.imageClarity || '4K',
          autoOpenInput: true,
        },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 视频合成：自动连接视频合成节点
    if (subId === 'video-composite') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'video-composite', {
        options: { displayName: '视频合成', generationType: 'video-composite', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 字幕生成：自动连接字幕节点
    if (subId === 'subtitle') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'subtitle', {
        options: { displayName: '字幕生成', generationType: 'subtitle', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 音频驱动：自动连接音频驱动节点
    if (subId === 'audio2video') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'audio2video', {
        options: { displayName: '音频驱动', generationType: 'audio2video', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 语音合成：自动连接 TTS 节点（以当前文本作为配音文案）
    if (subId === 'tts') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'tts', {
        options: { displayName: '语音合成', generationType: 'tts', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 脚本生成：自动连接脚本节点
    if (subId === 'script-gen') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'story-script-adv', {
        options: { displayName: '脚本生成', generationType: 'script-gen', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 故事板：自动连接图片节点生成分镜
    if (subId === 'storyboard') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'text-to-image', {
        options: { displayName: '故事板', generationType: 'storyboard', mediaFeature: '故事板', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 图片反推提示词：创建上传图片节点在前面，并倒推提示词
    if (subId === 'image-prompt') {
      // 先创建上传图片节点在文本节点前面
      const uploadNodeId = createLinkedNode?.(node.id, 'upload-image' as AINodeType, {
        x: node.x - 410, // 放在当前节点左侧
        y: node.y,
        options: {
          displayName: '上传图片',
          generationType: 'upload-image',
          onImageUpload: (imageUrl: string) => {
            // 图片上传后，调用反推 API 将提示词写入当前文本节点
            updateNode(node.id, {
              prompt: `根据图片反推的提示词：${imageUrl}`,
              result: { url: imageUrl, type: 'text', text: `根据图片反推的提示词：${imageUrl}` },
            });
          },
        },
      });
      // 连接上传图片节点到当前文本节点（需要反向连接）
      if (uploadNodeId) {
        // 通过 canvas:add-edge 事件创建从上传节点到当前节点的连接
        window.dispatchEvent(new CustomEvent('canvas:add-edge', {
          detail: { source: uploadNodeId, target: node.id },
        }));
      }
      setActiveInputNodeId?.(null);
      return;
    }

    if (subId === 'custom-text') {
      setActiveInputNodeId?.(null);
      setInlineMode(true);
      return;
    }
    setInlineMode(false);
    setActiveInputNodeId?.(node.id);
  }, [createLinkedNode, node.id, node.options, node.prompt, node.type, setActiveInputNodeId, updateNode]);

  // 点击卡片非子功能区域，弹出输入框
  const handleCardBodyClick = useCallback(() => {
    // 所有文本节点（包括 API 返回的和自定义编写的）都进入 inlineMode 编辑
    if (isTextNode || node.options?.isInlineText || node.options?.generationType === 'custom-text') {
      // 优先使用 AI 返回的结果作为编辑初始值（如果没有结果再用 prompt）
      const initialText = node.result?.type === 'text' && node.result.text?.trim()
        ? node.result.text
        : (node.prompt || '');
      setInlineText(initialText);
      setInlineMode(true);
      // 关闭弹窗（如果打开）
      setActiveInputNodeId?.(null);
      return;
    }
    setActiveInputNodeId?.(node.id);
  }, [node.id, node.options, node.prompt, node.result, setActiveInputNodeId, isTextNode]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowMenu(true);
  }, []);

  const handleNodeClick = useCallback((e: React.MouseEvent) => {
    window.dispatchEvent(new CustomEvent('canvas:close-image-toolbar', { detail: { nodeId: node.id } }));
    const target = e.target as HTMLElement;
    if (target.closest('.lib-subfunc-btn, .lib-node-close, .lib-handle, .lib-node-name-editor, textarea, input, select, button')) return;

    // 3D 导演台节点：点击打开 3D 场景搭建弹窗
    if (node.type === 'director-stage') {
      e.preventDefault();
      e.stopPropagation();
      resolveDirectorReferenceMedia();
      setDirectorStageOpen(true);
      setActiveInputNodeId?.(null);
      return;
    }

    // 文本节点单击显示弹窗输入框，双击才进入 inlineMode 编辑
    if (isTextNode || node.options?.isInlineText || node.options?.generationType === 'custom-text') {
      // 单击显示弹窗
      setActiveInputNodeId?.(node.id);
      return;
    }

    setActiveInputNodeId?.(node.id);
    if (referencePickActive) {
      e.preventDefault();
      e.stopPropagation();
      if (displayMedia?.url) onPickReferenceNode?.(node.id);
      return;
    }
    // 全景图节点：点击结果图片打开 720° 全景查看器
    const isPanoramaResult = hasImageMedia && (node.options?.outputType === 'panorama' || node.options?.panoramaType === '720');
    if (isPanoramaResult && target.closest('.lib-node-connected-media, .lib-node-result, img')) {
      e.preventDefault();
      e.stopPropagation();
      setPanoramaViewerOpen(true);
      setActiveInputNodeId?.(null);
      return;
    }
    if (hasImageMedia && target.closest('.lib-node-connected-media, .lib-node-result, img')) {
      setImageToolbarOpen(true);
      setActiveInputNodeId?.(null);
      return;
    }
    handleCardBodyClick();
  }, [displayMedia?.url, handleCardBodyClick, hasImageMedia, node.id, node.type, onPickReferenceNode, referencePickActive, setActiveInputNodeId, isTextNode, node.options]);

  const saveNodeName = useCallback(() => {
    const nextName = draftName.trim() || getNodeBaseName(node.type);
    setDraftName(nextName);
    setRenaming(false);
    updateNode(node.id, { options: { ...node.options, displayName: nextName } });
  }, [draftName, node.id, node.options, node.type, updateNode]);

  const cancelRename = useCallback(() => {
    setDraftName(getNodeDisplayName(node));
    setRenaming(false);
  }, [node]);

  const handleDisconnect = useCallback((side: 'input' | 'output') => (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    disconnectNode?.(node.id, side);
  }, [disconnectNode, node.id]);

  const promptLibrarySourceType = node.result?.type === 'video' ? 'video' : node.result?.type === 'image' ? 'image' : 'text';
  const promptLibraryPrompt = node.prompt || node.options?.prompt || node.result?.text || '';
  const promptLibraryTags = [template?.label || getNodeBaseName(node.type), node.result?.type === 'image' ? '图片' : node.result?.type === 'video' ? '视频' : '文本'].filter(Boolean);
  const applyImageMediaTool = useCallback((featureId: string, option?: string) => {
    if (!displayMedia?.url) return;
    const feature = IMAGE_MEDIA_TOOL_FEATURES.find(item => item.id === featureId);
    if (featureId === 'reference' || featureId === 'reference-extra') {
      const prompt = featureId === 'reference'
        ? '基于当前参考图生成无缝720°全景图，保持主体、场景身份和整体构图，左右延展自然，输出2:1比例，不要黑边，不裁切主体。'
        : '将当前图片作为参考图加入输入框，用于后续图片生成。';
      const targetId = createLinkedNode?.(node.id, 'image-to-image', {
        width: 280,
        height: 220,
        status: 'idle',
        prompt,
        thumbnail: undefined,
        result: undefined,
        options: {
          displayName: featureId === 'reference' ? '720°全景图' : '图片参考',
          generationType: 'image-to-image',
          mediaFeature: featureId === 'reference' ? '720°全景图' : '图片参考',
          sourceFeature: featureId === 'reference' ? 'panorama720' : 'reference-extra',
          sourceImage: displayMedia.url,
          referenceImages: [{ id: `ref-tool-${Date.now()}-${node.id}`, name: getNodeDisplayName(node), url: displayMedia.url }],
          inputRows: [{ id: `row-tool-${Date.now()}`, feature: featureId, text: `@${getNodeDisplayName(node)} ${prompt}` }],
          imageQuality: 'standard',
          imageClarity: '2K',
          imageRatio: featureId === 'reference' ? '2:1' : node.options?.imageRatio || 'auto',
          aspectRatio: featureId === 'reference' ? '2:1' : undefined,
          resolution: featureId === 'reference' ? '2K' : undefined,
          size: featureId === 'reference' ? '2048x1024' : undefined,
          panoramaType: featureId === 'reference' ? '720' : undefined,
          outputType: featureId === 'reference' ? 'panorama' : undefined,
          apiCapability: featureId === 'reference' ? 'image-to-720-panorama' : 'image-to-image-reference',
          githubProject: featureId === 'reference' ? 'PanFusion / SD-T2I-360PanoImage' : undefined,
          workflowProject: featureId === 'reference' ? 'image-to-720-panorama' : 'image-reference',
          autoOpenInput: true,
          upstreamPrompt: undefined,
          upstreamNodeIds: [node.id],
        },
        aspectRatio: featureId === 'reference' ? '2:1' : undefined,
        resolution: featureId === 'reference' ? '2K' : undefined,
        size: featureId === 'reference' ? '2048x1024' : undefined,
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      setImageToolbarOpen(false);
      return;
    }

    const optionLabel = option ? `（${option}）` : '';
    const promptText = feature?.prompt || '以当前图片为基础继续生成。';
    const targetType = featureId === 'upscale' ? 'image-upscale' : 'image-to-image';
    const targetId = createLinkedNode?.(node.id, targetType, {
      width: 280,
      height: 220,
      status: 'idle',
      prompt: `${feature?.label || '图片处理'}${optionLabel}：${promptText}`,
      thumbnail: undefined,
      result: undefined,
      options: {
        displayName: feature?.label || '图片处理',
        generationType: targetType,
        mediaFeature: feature?.label || featureId,
        sourceFeature: featureId,
        sourceImage: displayMedia.url,
        referenceImages: [{ id: `ref-tool-${Date.now()}-${node.id}`, name: getNodeDisplayName(node), url: displayMedia.url }],
        inputRows: [{ id: `row-tool-${Date.now()}`, feature: featureId, text: `@${getNodeDisplayName(node)} ${promptText}` }],
        imageClarity: featureId === 'upscale' ? option || node.options?.imageClarity || '2K' : node.options?.imageClarity,
        gridSplit: featureId === 'split' ? option || node.options?.gridSplit || '3x3' : node.options?.gridSplit,
        imageRatio: featureId === 'split' ? 'auto' : node.options?.imageRatio || 'auto',
        autoOpenInput: true,
        upstreamPrompt: undefined,
        upstreamNodeIds: [node.id],
      },
    });
    if (targetId) setActiveInputNodeId?.(targetId);
    setImageToolbarOpen(false);
  }, [createLinkedNode, displayMedia?.url, node, setActiveInputNodeId]);

  const downloadImageMedia = useCallback(() => {
    if (!displayMedia?.url) return;
    const link = document.createElement('a');
    link.href = displayMedia.url;
    link.download = `${getNodeDisplayName(node)}.png`;
    link.click();
    setImageToolbarOpen(false);
  }, [displayMedia?.url, node]);

  const saveNodeMarkedImage = useCallback((markedUrl: string) => {
    if (!displayMedia?.url) return;
    const markedName = `标注-${getNodeDisplayName(node)}`;
    autoSaveMediaToAssets({ name: markedName, type: 'image', path: markedUrl, sourceType: 'canvas', sourceId: node.id });
    updateNode(node.id, {
      result: node.result?.type === 'image' ? { ...node.result, url: markedUrl } : node.result,
      thumbnail: markedUrl,
      options: {
        ...node.options,
        sourceImage: markedUrl,
        originalImage: node.options?.originalImage || displayMedia.url,
        referenceImages: [{ id: `marked-${Date.now()}`, name: markedName, url: markedUrl }],
        generationType: 'image-to-image',
        markerEdited: true,
      },
    });
    setNodeMarkerOpen(false);
    setImageToolbarOpen(false);
  }, [displayMedia?.url, node, updateNode]);

  const createImageToolNode = useCallback((displayName: string, prompt: string, options: Record<string, any>, targetType: AINodeType = 'image-to-image') => {
    if (!displayMedia?.url) return;
    const targetId = createLinkedNode?.(node.id, targetType, {
      x: node.x + Math.max(node.width || 280, 280) + 130,
      y: node.y,
      width: 280,
      height: 220,
      status: 'idle',
      prompt,
      thumbnail: undefined,
      options: {
        displayName,
        generationType: targetType,
        mediaFeature: displayName,
        sourceImage: displayMedia.url,
        referenceImages: [{ id: `ref-tool-${Date.now()}-${node.id}`, name: getNodeDisplayName(node), url: displayMedia.url }],
        inputRows: [{ id: `row-tool-${Date.now()}`, feature: options.sourceFeature || targetType, text: `@${getNodeDisplayName(node)} ${prompt}` }],
        imageQuality: node.options?.imageQuality || 'standard',
        imageClarity: node.options?.imageClarity || '2K',
        imageRatio: node.options?.imageRatio || 'auto',
        autoOpenInput: true,
        upstreamPrompt: undefined,
        upstreamNodeIds: [node.id],
        ...options,
      },
    });
    if (targetId) setActiveInputNodeId?.(targetId);
    setImageToolbarOpen(false);
  }, [createLinkedNode, displayMedia?.url, node, setActiveInputNodeId]);

  const createMultiAngleGeneration = useCallback((feature: typeof MULTI_ANGLE_FEATURES[number]) => {
    const prompt = `多角度生成：${feature.label}。${feature.prompt}`;
    createImageToolNode(feature.label, prompt, {
      sourceFeature: 'multi-angle',
      apiCapability: 'image-to-multiview',
      githubProject: 'Wonder3D / Zero123',
      workflowProject: 'image-to-multiview',
      outputType: 'multi-view-image',
      viewMode: feature.id,
      multiView: true,
    });
  }, [createImageToolNode]);

  const applyLightingGeneration = useCallback((settings: LightingSettings) => {
    const directionLabel = LIGHT_DIRECTIONS.find(item => item.id === settings.direction)?.label || '正面';
    const viewLabel = settings.view === 'perspective' ? '透视' : '正面';
    const prompt = `自由角度打光：使用${viewLabel}视角，主光源来自${directionLabel}，亮度${settings.brightness}%，光色${settings.color}。保持主体结构、构图和原图风格一致，只调整光照效果。`;
    createImageToolNode('自由打光', prompt, {
      sourceFeature: 'lighting',
      lightingSettings: settings,
      apiCapability: 'free-angle-relighting',
      githubProject: 'IC-Light / DPR',
      workflowProject: 'free-angle-relighting',
      outputType: 'relit-image',
    });
  }, [createImageToolNode]);

  const createHdFeatureGeneration = useCallback((feature: typeof HD_FEATURES[number]) => {
    const prompt = `${feature.label}：${feature.prompt}`;
    createImageToolNode(feature.label, prompt, {
      sourceFeature: feature.id,
      imageQuality: feature.id === 'upscale' ? 'hd' : node.options?.imageQuality || 'standard',
      imageClarity: feature.id === 'upscale' ? node.options?.imageClarity || '4K' : node.options?.imageClarity || '2K',
      imageRatio: feature.id === 'outpaint' ? node.options?.imageRatio || 'auto' : node.options?.imageRatio || 'auto',
      apiCapability: feature.id === 'upscale' ? 'image-super-resolution' : feature.id === 'outpaint' ? 'image-outpainting' : feature.id === 'cutout' ? 'background-removal' : feature.id === 'erase' ? 'object-removal-inpaint' : feature.id === 'redraw' ? 'image-redraw' : 'smart-crop',
      githubProject: feature.id === 'upscale' ? 'Real-ESRGAN / SwinIR' : feature.id === 'outpaint' ? 'Stable Diffusion Outpainting / LaMa' : feature.id === 'cutout' ? 'rembg / BiRefNet' : feature.id === 'erase' ? 'LaMa / MAT' : feature.id === 'redraw' ? 'Stable Diffusion Inpaint / LaMa' : 'smart-crop-api',
      workflowProject: feature.id,
      transparentBackground: feature.id === 'cutout' ? true : undefined,
    }, feature.generationType as AINodeType);
  }, [createImageToolNode, node.options?.imageClarity, node.options?.imageQuality, node.options?.imageRatio]);

  const createSplitFeatureGeneration = useCallback((option: typeof TOOLBAR_SPLIT_OPTIONS[number] | { id: string; label: string; grid?: number; custom?: boolean }) => {
    const prompt = `宫格切分：将当前图片切分为${option.label}，每个宫格保持画面内容完整、边缘清晰，适合作为独立素材使用。`;
    createImageToolNode(option.label, prompt, {
      sourceFeature: 'split',
      mediaFeature: '宫格切分',
      imageRatio: 'auto',
      gridSplit: option.id,
      gridCount: option.grid,
      apiCapability: 'grid-split',
      githubProject: 'grid-split-api',
      workflowProject: 'grid-split',
      outputType: 'grid-split-image',
    });
  }, [createImageToolNode]);

  const createGridFeatureGeneration = useCallback((feature: typeof GRID_FEATURES[number]) => {
    const prompt = `${feature.label}：${feature.prompt}`;
    createImageToolNode(feature.label, prompt, {
      sourceFeature: feature.id,
      imageRatio: feature.id.includes('25') || feature.id.includes('grid') || feature.id.includes('quad') ? '1:1' : node.options?.imageRatio || 'auto',
      apiCapability: feature.id.includes('light') ? 'free-angle-relighting' : feature.id.includes('view') || feature.id.includes('character') ? 'image-to-multiview' : 'grid-split',
      githubProject: feature.id.includes('light') ? 'IC-Light / DPR' : feature.id.includes('view') || feature.id.includes('character') ? 'Wonder3D / Zero123' : 'grid-split-api',
      workflowProject: feature.id,
    });
  }, [createImageToolNode, node.options?.imageRatio]);

  useEffect(() => {
    if (!showInputPopover) {
      setInputAnchorRect(null);
      return;
    }

    let frameId = 0;
    let lastLeft = NaN;
    let lastTop = NaN;
    let lastWidth = NaN;
    let lastHeight = NaN;
    const updateAnchor = () => {
      const rect = nodeRef.current?.getBoundingClientRect() ?? null;
      // 仅在位置/尺寸真正变化时才 setState，避免每帧无谓重渲染导致节点多时卡顿
      if (rect) {
        if (rect.left !== lastLeft || rect.top !== lastTop || rect.width !== lastWidth || rect.height !== lastHeight) {
          lastLeft = rect.left; lastTop = rect.top; lastWidth = rect.width; lastHeight = rect.height;
          setInputAnchorRect(rect);
        }
      } else if (!Number.isNaN(lastLeft)) {
        lastLeft = NaN;
        setInputAnchorRect(null);
      }
      frameId = window.requestAnimationFrame(updateAnchor);
    };

    updateAnchor();
    return () => window.cancelAnimationFrame(frameId);
  }, [showInputPopover]);

  return (
    <div ref={nodeRef} className={`lib-node ${isTextNode ? 'lib-node-text-kind' : ''}`} data-node-type={node?.type} data-title={getNodeDisplayName(node)} data-title-icon={template?.icon || 'canvas'} data-text-node={isTextNode} data-selected={nodeVisuallySelected} data-connected={isInputConnected || isOutputConnected} data-has-content={hasDisplayContent} data-media-content={!!displayMedia} data-reference-pickable={referencePickActive && !!displayMedia} data-reference-picked={referencePicked} style={{ '--node-accent': color, ...(previewHeight ? { '--media-preview-height': `${previewHeight}px`, height: previewHeight, minHeight: previewHeight } : {}) } as React.CSSProperties} onContextMenu={handleContextMenu} onClick={handleNodeClick}>
      {(
        <div className="lib-node-floating-title" onDoubleClick={(e) => { e.stopPropagation(); setDraftName(getNodeDisplayName(node)); setRenaming(true); }}>
          <span className="lib-node-floating-icon"><SvgIcon name={nodeIcon} size={13} /></span>
          {renaming ? (
            <input
              className="lib-node-floating-name-editor nodrag nowheel"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={saveNodeName}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNodeName();
                if (e.key === 'Escape') cancelRename();
              }}
            />
          ) : (
            <span className="lib-node-floating-label">{getNodeDisplayName(node)}</span>
          )}
        </div>
      )}
      <div className="lib-node-header">
        <div className="lib-node-header-left">
          <span className="lib-node-icon"><SvgIcon name={nodeIcon} size={16} /></span>
          {renaming ? (
            <input
              className="lib-node-name-editor nodrag nowheel"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={saveNodeName}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveNodeName();
                if (e.key === 'Escape') cancelRename();
              }}
            />
          ) : (
            <span
              className="lib-node-label"
              title="双击重命名"
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); setDraftName(getNodeDisplayName(node)); setRenaming(true); }}
            >
              {getNodeDisplayName(node)}
            </span>
          )}
        </div>
        <button className="lib-node-close" onClick={(e) => { e.stopPropagation(); (deleteCanvasNode || deleteNode)(node.id); }}><SvgIcon name="close" size={14} /></button>
      </div>

      {/* 子功能按钮 */}
      {isDirectorStageNode && !displayMedia ? (
        <div className="lib-node-scene-preview director" aria-hidden="true">
          <DirectorScenePreview />
          <span className="lib-node-scene-tag"><SvgIcon name="stage" size={12} /> 3D 导演台</span>
        </div>
      ) : isPanoramaNode && !displayMedia ? (
        <div className="lib-node-scene-preview panorama" aria-hidden="true">
          <PanoramaScenePreview />
          <span className="lib-node-scene-tag"><SvgIcon name="panorama" size={12} /> 720° 全景</span>
        </div>
      ) : (
        <div className="lib-node-center-icon" aria-hidden="true">
          <SvgIcon name={nodeIcon} size={44} />
        </div>
      )}

      {hasTextContent && !inlineMode && !isInlineTextNode && (
        <div className="lib-node-connected-text" title={textSummary || ''}>
          {textSummary.trim() || '文本内容'}
        </div>
      )}

      {displayMedia && (
        <div className="lib-node-media-card">
          <div
            className="lib-node-connected-media"
            onClick={(event) => { if (displayMedia.type === 'audio' || displayMedia.type === 'video') event.stopPropagation(); }}
          >
            {displayMedia.type === 'image' ? (
              <img
                src={normalizeFileSrc(displayMedia.url)}
                alt="生成结果"
                data-media-url={displayMedia.url}
                data-media-type="image"
                data-prompt={node.prompt || node.options?.prompt || ''}
                data-name={getNodeDisplayName(node)}
                data-source-id={node.id}
                data-source-type="canvas"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  if (!image.naturalWidth || !image.naturalHeight) return;
                  const ratio = image.naturalWidth / image.naturalHeight;
                  setMediaAspectRatio(ratio);
                  if (Math.abs(Number(node.options?.previewAspectRatio || 0) - ratio) > 0.01) {
                    updateNode(node.id, { options: { ...node.options, previewAspectRatio: ratio } });
                  }
                }}
              />
            ) : displayMedia.type === 'video' ? (
              <video
                src={normalizeFileSrc(displayMedia.url)}
                controls
                data-media-url={displayMedia.url}
                data-media-type="video"
                data-prompt={node.prompt || node.options?.prompt || ''}
                data-name={getNodeDisplayName(node)}
                data-source-id={node.id}
                data-source-type="canvas"
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  if (!video.videoWidth || !video.videoHeight) return;
                  const ratio = video.videoWidth / video.videoHeight;
                  setMediaAspectRatio(ratio);
                  if (Math.abs(Number(node.options?.previewAspectRatio || 0) - ratio) > 0.01) {
                    updateNode(node.id, { options: { ...node.options, previewAspectRatio: ratio } });
                  }
                }}
              />
            ) : (
              <div className="lib-node-audio-player">
                <SvgIcon name="audio" size={26} />
                <audio
                  src={normalizeFileSrc(displayMedia.url)}
                  controls
                  data-media-url={displayMedia.url}
                  data-media-type="audio"
                  data-prompt={node.prompt || node.options?.prompt || ''}
                  data-name={getNodeDisplayName(node)}
                  data-source-id={node.id}
                  data-source-type="canvas"
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {inlineMode ? (
        <div className="lib-node-inline-editor">
          <textarea
            className="nodrag nowheel"
            value={inlineText}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => { setInlineText(e.target.value); saveInlineText(e.target.value); }}
            onBlur={() => { saveInlineText(inlineText); setInlineMode(false); }}
            placeholder="输入内容..."
            autoFocus
          />
        </div>
      ) : subFunctions.length > 0 && !node.result?.text && !node.prompt?.trim() ? (
        // 有子功能且没有内容时，显示子功能列表
        <div className="lib-node-subfuncs">
          <div className="lib-node-subfuncs-title">尝试：</div>
          {subFunctions.map((sf) => (
            <button key={sf.id} className="lib-subfunc-btn" onClick={() => handleSubFunctionClick(sf.id)} title={sf.label}>
              <SvgIcon name={sf.icon} size={12} />
              <span>{sf.label}</span>
            </button>
          ))}
        </div>
      ) : isInlineTextNode || isTextNode ? (
        <div className="lib-node-inline-preview" onDoubleClick={handleCardBodyClick} title="双击修改内容">
          {node.status === 'loading' ? (
            <div className="lib-node-empty-writing">
              <div className="lib-node-empty-title">AI 正在生成中…</div>
              <div className="lib-node-empty-icon"><SvgIcon name={template?.icon || 'text'} size={46} /></div>
            </div>
          ) : node.result?.type === 'text' && node.result.text?.trim() ? (
            <div className="lib-node-inline-text">{node.result.text}</div>
          ) : node.prompt?.trim() ? (
            <div className="lib-node-inline-text">{node.prompt}</div>
          ) : (
            <div className="lib-node-empty-writing">
              <div className="lib-node-empty-title">请编写内容，开始你的创作。</div>
              <div className="lib-node-empty-icon"><SvgIcon name={template?.icon || 'text'} size={46} /></div>
            </div>
          )}
        </div>
      ) : null}

      <Handle
        type="target"
        position={Position.Left}
        className={`lib-handle lib-handle-in ${isInputConnected ? 'side-connected' : 'side-open'}`}
        data-side-connected={isInputConnected}
        data-symbol={isInputConnected ? '−' : '+'}
        onClick={isInputConnected ? handleDisconnect('input') : undefined}
        title={isInputConnected ? '断开连接' : '连接节点'}
      />

      {(node?.status === 'success' && node.result) || node?.status === 'error' ? (
        <div className="lib-node-body lib-node-result-body" onClick={handleCardBodyClick}>
          {node?.status === 'success' && node.result && (
            <div className="lib-node-result">
              {node.result.type === 'image'
                ? <img src={normalizeFileSrc(node.result.url)} alt="生成结果" data-media-url={node.result.url} data-media-type="image" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" />
                : node.result.type === 'audio'
                  ? <div className="lib-node-audio-player"><SvgIcon name="audio" size={26} /><audio src={normalizeFileSrc(node.result.url)} controls data-media-url={node.result.url} data-media-type="audio" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" onClick={(event) => event.stopPropagation()} /></div>
                  : <video src={normalizeFileSrc(node.result.url)} controls data-media-url={node.result.url} data-media-type="video" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" />}
              {/* 结果节点上的小按钮：打开输入框改参数后再次提交；另提供一键重试（沿用原参数直接重跑） */}
              <button
                type="button"
                className="lib-node-regen-btn"
                title="打开输入框，修改提示词或参数后再次生成"
                onClick={(event) => { event.stopPropagation(); setImageToolbarOpen(false); setActiveInputNodeId?.(node.id); }}
              >
                <SvgIcon name="canvas" size={13} />
                <span>改参数</span>
              </button>
              <button
                type="button"
                className="lib-node-regen-btn"
                title="沿用当前参数直接重新生成"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageToolbarOpen(false);
                  try { useAppStore.getState().retryNode?.(node.id); } catch { /* ignore */ }
                }}
              >
                <SvgIcon name="loading" size={13} />
                <span>重试</span>
              </button>
            </div>
          )}
          {node?.status === 'error' && (<div className="lib-node-error">{node.error}</div>)}
        </div>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        className={`lib-handle lib-handle-out ${isOutputConnected ? 'side-connected' : 'side-open'}`}
        data-side-connected={isOutputConnected}
        data-symbol={isOutputConnected ? '−' : '+'}
        onClick={isOutputConnected ? handleDisconnect('output') : undefined}
        title={isOutputConnected ? '断开连接' : '连接节点'}
      />

      {/* 输入弹窗 */}
      {showInputPopover && (
        <NodeInputPopover
          node={node}
          anchorRect={inputAnchorRect}
          hasIncomingImageNode={hasIncomingImageNode}
          incomingImageCount={incomingImageCount}
          forceOmniReference={forceOmniReference}
          onClose={() => setActiveInputNodeId?.(null)}
          onSend={(prompt, files, params) => { handleChatSend(prompt, files, node.options?.generationType, params?.videoConfig); setActiveInputNodeId?.(null); }}
        />
      )}

      {showMenu && (
        <>
          <div className="lib-node-context-menu" onClick={(e) => e.stopPropagation()}>
            <button title="存入提示词库" aria-label="存入提示词库" onClick={() => { setSavePromptOpen(true); setShowMenu(false); }}><SvgIcon name="save" size={15} /></button>
            <button title="复制节点" aria-label="复制节点" onClick={() => { navigator.clipboard.writeText(JSON.stringify(node)); setShowMenu(false); }}><SvgIcon name="copy" size={15} /></button>
            <button title="删除节点" aria-label="删除节点" onClick={() => { (deleteCanvasNode || deleteNode)(node.id); setShowMenu(false); }}><SvgIcon name="trash" size={15} /></button>
            <button title="关闭" aria-label="关闭" onClick={() => setShowMenu(false)}><SvgIcon name="close" size={15} /></button>
          </div>
          <div className="lib-node-menu-backdrop" onPointerDown={() => setShowMenu(false)} onContextMenu={(event) => { event.preventDefault(); setShowMenu(false); }} />
        </>
      )}
      {imageToolbarOpen && hasImageMedia && displayMedia?.url && (
        <ImageMediaToolbar
          node={node}
          mediaUrl={displayMedia.url}
          onClose={() => setImageToolbarOpen(false)}
          onApply={applyImageMediaTool}
          onMultiAngle={createMultiAngleGeneration}
          onLighting={applyLightingGeneration}
          onGridFeature={createGridFeatureGeneration}
          onHdFeature={createHdFeatureGeneration}
          onSplitFeature={createSplitFeatureGeneration}
          onMark={() => { setNodeMarkerOpen(true); setImageToolbarOpen(false); }}
          onDownload={downloadImageMedia}
          onFullscreen={() => { setMediaPreview?.({ src: displayMedia.url, type: 'image' }); setImageToolbarOpen(false); }}
          onEditInputs={() => { setImageToolbarOpen(false); setActiveInputNodeId?.(node.id); }}
        />
      )}
      {nodeMarkerOpen && displayMedia?.url && (
        <NodeMarkerEditor
          imageUrl={displayMedia.url}
          onClose={() => setNodeMarkerOpen(false)}
          onSave={saveNodeMarkedImage}
        />
      )}
      {/* AI 生成中：覆盖式进度遮罩 + 进度条 */}
      {(node.status === 'loading' || node.status === 'processing') && (
        <div className="lib-node-progress-overlay" data-status={node.status}>
          <div className="lib-node-progress-text">
            {node.status === 'loading' ? '准备生成…' : 'AI 生成中…'}
          </div>
          <div className="lib-node-progress-track">
            <div className="lib-node-progress-bar" />
          </div>
          <div className="lib-node-progress-sub">请稍候</div>
        </div>
      )}
      {savePromptOpen && createPortal(
        <React.Suspense fallback={null}><SaveToPromptLibraryModal
          isOpen={savePromptOpen}
          onClose={() => setSavePromptOpen(false)}
          defaultPrompt={promptLibraryPrompt}
          defaultName={`${getNodeDisplayName(node)} 提示词`}
          thumbnail={node.result?.type === 'image' ? node.result.url : node.thumbnail}
          sourceType={promptLibrarySourceType}
          filePath={node.result?.url}
          defaultTags={promptLibraryTags}
        /></React.Suspense>,
        document.body
      )}
      {directorStageOpen && createPortal(
        <React.Suspense fallback={null}><DirectorStageModal
          isOpen={directorStageOpen}
          onClose={() => setDirectorStageOpen(false)}
          panoramaUrl={node.options?.panoramaSceneUrl || null}
          referenceMedia={directorReferenceMedia}
          onDefaultThumbnail={(dataUrl) => {
            // 3D 导演台节点默认以导演台内默认构图为缩略图，画布上一眼可分辨
            updateNode?.(node.id, { thumbnail: dataUrl });
          }}
          onOutputView={(dataUrl, meta) => {
            const targetId = createLinkedNode?.(node.id, 'text-to-image', {
              width: 280,
              height: 220,
              status: 'idle',
              prompt: '基于导演台 3D 构图参考生成画面，保持摄影机视角、主体位置和空间关系。',
              options: {
                displayName: '构图参考',
                generationType: 'image-to-image',
                mediaFeature: '构图参考',
                sourceFeature: 'director-stage',
                sourceImage: dataUrl,
                referenceImages: [{ id: `ref-stage-${Date.now()}`, name: '导演台构图', url: dataUrl }],
                inputRows: [{ id: `row-stage-${Date.now()}`, feature: 'image-to-image', text: '@导演台构图 基于 3D 构图参考生成画面。' }],
                previewAspectRatio: meta.height ? meta.width / meta.height : undefined,
                autoOpenInput: true,
              },
            });
            if (targetId) setActiveInputNodeId?.(targetId);
            setDirectorStageOpen(false);
          }}
          onOutputViews={(views) => {
            if (!views || views.length === 0) return;
            const baseStamp = Date.now();
            const baseX = node.x + Math.max(node.width || 280, 280) + 130;
            const baseY = node.y;
            const gap = 24;
            let firstId: string | undefined;
            views.forEach((view, index) => {
              const aspect = view.height ? view.width / view.height : 16 / 9;
              const nodeWidth = 280;
              const nodeHeight = Math.round(nodeWidth / aspect) + 40;
              // 每台摄影机导出的画面都是独立节点，纵向排列避免重叠
              const targetId = createLinkedNode?.(node.id, 'text-to-image', {
                x: baseX,
                y: baseY + index * (nodeHeight + gap),
                width: nodeWidth,
                height: nodeHeight,
                // 导出机位截图直接显示在画布节点上（与上传节点一致）
                status: 'success',
                prompt: view.name || `摄影机${index + 1}`,
                thumbnail: view.dataUrl,
                result: { url: view.dataUrl, type: 'image' },
                options: {
                  displayName: view.name || `摄影机${index + 1}`,
                  generationType: 'image-to-image',
                  mediaFeature: '构图参考',
                  sourceFeature: 'director-stage',
                  sourceImage: view.dataUrl,
                  referenceImages: [{ id: `ref-stage-${baseStamp}-${index}`, name: view.name || '导演台构图', url: view.dataUrl }],
                  previewAspectRatio: aspect,
                },
              });
              if (index === 0) firstId = targetId;
            });
            if (firstId) setActiveInputNodeId?.(firstId);
            setDirectorStageOpen(false);
          }}
          onOutputVideo={(video) => {
            const aspect = video.height ? video.width / video.height : 16 / 9;
            const nodeWidth = 300;
            const nodeHeight = Math.round(nodeWidth / aspect) + 40;
            const targetId = createLinkedNode?.(node.id, 'text-to-video', {
              x: node.x + Math.max(node.width || 280, 280) + 130,
              y: node.y,
              width: nodeWidth,
              height: nodeHeight,
              status: 'success',
              prompt: '基于导演台动画预览的参考视频，保持镜头运动、主体运动轨迹和空间关系。',
              thumbnail: undefined,
              result: { url: video.dataUrl, type: 'video' },
              options: {
                displayName: '动画预览参考',
                generationType: 'image-to-video',
                sourceFeature: 'director-stage-video',
                previewAspectRatio: aspect,
              },
            });
            if (targetId) setActiveInputNodeId?.(targetId);
            setDirectorStageOpen(false);
          }}
        /></React.Suspense>,
        document.body
      )}
      {panoramaViewerOpen && displayMedia?.url && createPortal(
        <React.Suspense fallback={null}><PanoramaViewerModal
          isOpen={panoramaViewerOpen}
          onClose={() => setPanoramaViewerOpen(false)}
          imageUrl={displayMedia.url}
          onOutputView={(dataUrl, meta) => {
            const targetId = createLinkedNode?.(node.id, 'text-to-image', {
              width: 280,
              height: 220,
              status: 'success',
              prompt: '全景视图截取',
              thumbnail: dataUrl,
              result: { url: dataUrl, type: 'image' },
              options: {
                displayName: '全景视图',
                generationType: 'image-to-image',
                sourceFeature: 'panorama-view',
                sourceImage: dataUrl,
                previewAspectRatio: meta.height ? meta.width / meta.height : undefined,
              },
            });
            if (targetId) setActiveInputNodeId?.(targetId);
            setPanoramaViewerOpen(false);
          }}
        /></React.Suspense>,
        document.body
      )}
    </div>
  );
}

// 浅比较两个字符串数组是否相等（用于 incomingImageNodeIds 等每次同步都新建的数组）
function shallowArrayEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length || 0) === (b?.length || 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// 自定义比较函数：syncFlowNodes 每次都会重建所有节点的 data 对象，
// 默认浅比较会导致所有节点在任意一个节点变化/选中时全部重渲染，节点多时严重卡顿。
// 这里只在真正影响该节点渲染的字段变化时才重渲染。
function areWorkflowNodePropsEqual(prev: any, next: any): boolean {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.dragging !== next.dragging) return false;
  const a = prev.data || {};
  const b = next.data || {};
  if (a === b) return true;
  // 节点数据引用（store 对未变更节点保持同一引用）
  if (a.node !== b.node) return false;
  if (a.isInputConnected !== b.isInputConnected) return false;
  if (a.isOutputConnected !== b.isOutputConnected) return false;
  // activeInputNodeId 是全局值，但只有等于/曾等于本节点 id 时才影响渲染
  const prevActive = a.activeInputNodeId === prev.id;
  const nextActive = b.activeInputNodeId === next.id;
  if (prevActive !== nextActive) return false;
  if (a.referencePickActive !== b.referencePickActive) return false;
  if (a.referencePicked !== b.referencePicked) return false;
  // 共享回调（均为 useCallback 稳定引用，变化时需要更新）
  if (a.setActiveInputNodeId !== b.setActiveInputNodeId) return false;
  if (a.disconnectNode !== b.disconnectNode) return false;
  if (a.createLinkedNode !== b.createLinkedNode) return false;
  if (a.deleteCanvasNode !== b.deleteCanvasNode) return false;
  if (a.setMediaPreview !== b.setMediaPreview) return false;
  if (a.onPickReferenceNode !== b.onPickReferenceNode) return false;
  if (a.forceOmniReference !== b.forceOmniReference) return false;
  if (!shallowArrayEqual(a.incomingImageNodeIds, b.incomingImageNodeIds)) return false;
  if (!shallowArrayEqual(a.incomingMediaKinds, b.incomingMediaKinds)) return false;
  return true;
}

const MemoWorkflowNode = React.memo(WorkflowNode, areWorkflowNodePropsEqual);
const nodeTypes = { workflowNode: MemoWorkflowNode };

function storeNodesToFlowNodes(nodes: Record<string, AINode>, edges: FlowEdge[] = []): FlowNode[] {
  if (!nodes) return [];
  const inputConnected = new Set(edges.map(edge => edge.target).filter(Boolean) as string[]);
  const outputConnected = new Set(edges.map(edge => edge.source).filter(Boolean) as string[]);
  // 构建每个节点的输入源节点映射
  const incomingImageNodes: Record<string, string[]> = {};
  // 记录每个节点上游连线中「图片」来源的数量（用于视频节点：1 张→图生视频，2 张→首尾帧）
  const incomingImageCounts: Record<string, number> = {};
  // 记录每个节点上游连线节点的媒体类型（image/video/audio），
  // 用于判断“前面连线视频为节点”或“多格式组合作为参考”时强制只能使用全能参考
  const incomingMediaKinds: Record<string, string[]> = {};
  const imageNodeTypes = ['text-to-image', 'image-to-image', 'image-upscale', 'image-blend', 'character-view'];
  const videoNodeTypes = ['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-composite', 'video-extend', 'video-remix', 'video-super-resolution', 'video-interpolate', 'video-realtime', 'live-portrait'];
  const audioNodeTypes = ['audio2video', 'tts', 'video-to-music'];
  edges.forEach(edge => {
    if (edge.target && nodes[edge.source]) {
      const sourceNode = nodes[edge.source];
      const isImageNode = imageNodeTypes.includes(sourceNode.type);
      const hasImageResult = sourceNode.result?.type === 'image' && sourceNode.result?.url;
      const hasVideoResult = sourceNode.result?.type === 'video' && sourceNode.result?.url;
      const hasAudioResult = sourceNode.result?.type === 'audio' && sourceNode.result?.url;
      const hasReferenceImage = Array.isArray(sourceNode.options?.referenceImages) && sourceNode.options.referenceImages.length > 0;
      const hasThumbnail = !!sourceNode.thumbnail;
      if (isImageNode || hasImageResult || hasReferenceImage || hasThumbnail || hasVideoResult || hasAudioResult) {
        if (!incomingImageNodes[edge.target]) incomingImageNodes[edge.target] = [];
        incomingImageNodes[edge.target].push(edge.source);
      }
      // 统计上游连线中「图片」来源数量（图片节点 / 图片结果 / 参考图 / 缩略图，且非视频/音频）
      const isPureImageSource = (isImageNode || hasImageResult || hasReferenceImage || hasThumbnail) && !hasVideoResult && !hasAudioResult;
      if (isPureImageSource) {
        incomingImageCounts[edge.target] = (incomingImageCounts[edge.target] || 0) + 1;
      }
      // 判定上游节点媒体类型（视频优先，其次音频，其次图片）
      let mediaKind = '';
      if (hasVideoResult || videoNodeTypes.includes(sourceNode.type)) mediaKind = 'video';
      else if (hasAudioResult || audioNodeTypes.includes(sourceNode.type)) mediaKind = 'audio';
      else if (hasImageResult || isImageNode || hasReferenceImage || hasThumbnail) mediaKind = 'image';
      if (mediaKind) {
        if (!incomingMediaKinds[edge.target]) incomingMediaKinds[edge.target] = [];
        if (!incomingMediaKinds[edge.target].includes(mediaKind)) incomingMediaKinds[edge.target].push(mediaKind);
      }
    }
  });
  return Object.entries(nodes).map(([entryKey, n]) => {
    const nid = (n && n.id) || entryKey;
    const incomingKinds = incomingMediaKinds[nid] || [];
    // 强制全能参考的条件：
    // 1. 上游连线中包含视频节点（前面连线视频为节点）
    // 2. 上游连线为多种媒体格式组合（视频/图片/音频混合，多格式组合作为参考）
    const forceOmniReference = incomingKinds.includes('video') || incomingKinds.length > 1;
    const connected = inputConnected.has(nid) || outputConnected.has(nid);
    const hasMediaContent = !!n.result?.url || !!n.thumbnail;
    const storedAspectRatio = Number(n.options?.previewAspectRatio || n.meta?.previewAspectRatio || 0);
    const isAudioContent = n.result?.type === 'audio';
    const mediaHeight = isAudioContent
      ? 118
      : hasMediaContent && Number.isFinite(storedAspectRatio) && storedAspectRatio > 0
        ? Math.max(96, Math.round(280 / storedAspectRatio))
        : 210;
    const hasDisplayContent = connected
      || !!n.prompt?.trim()
      || !!n.options?.isInlineText
      || !!n.result?.url
      || !!n.result?.text
      || !!n.thumbnail;
    return {
      id: nid,
      type: 'workflowNode',
      position: { x: n.x, y: n.y },
      width: hasDisplayContent ? 280 : n.width,
      height: hasDisplayContent ? mediaHeight : n.height,
      style: hasDisplayContent ? { width: 280, height: mediaHeight } : { width: n.width, height: n.height },
      data: { node: n, isInputConnected: inputConnected.has(nid), isOutputConnected: outputConnected.has(nid), incomingImageNodeIds: incomingImageNodes[nid] || [], incomingImageCount: incomingImageCounts[nid] || 0, incomingMediaKinds: incomingKinds, forceOmniReference, activeInputNodeId: null, setActiveInputNodeId: undefined },
    };
  });
}

// ==================== 工具栏子菜单组件 ====================

interface MenuItem {
  id: string;
  label: string;
  icon?: CanvasIconName;
  desc?: string;
  action?: () => void;
  children?: MenuItem[];
}

function ToolbarSubMenu({
  open,
  onClose,
  anchorEl,
  items,
  onSelect
}: {
  open: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  items: MenuItem[];
  onSelect?: (id: string) => void;
}) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [activeSubMenu, setActiveSubMenu] = React.useState<string | null>(null);
  const [subMenuPosition, setSubMenuPosition] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) {
        if (!e.target || !(e.target as HTMLElement).closest('.sub-menu-panel')) {
          onClose();
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose]);

  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});
  React.useEffect(() => {
    if (!open || !anchorEl) return;
    const btnRect = anchorEl.getBoundingClientRect();
    const menuW = 240;
    let left = btnRect.left + (btnRect.width - menuW) / 2;
    const bottom = window.innerHeight - btnRect.top + 8;
    if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
    if (left < 8) left = 8;
    setMenuStyle({
      position: 'fixed',
      left: left,
      bottom: bottom,
      zIndex: 9997,
      maxHeight: btnRect.top - 16,
      overflowY: 'auto'
    });
  }, [open, anchorEl]);

  const handleItemHover = (e: React.MouseEvent, item: MenuItem) => {
    if (!item.children || item.children.length === 0) {
      setActiveSubMenu(null);
      return;
    }
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    setSubMenuPosition({
      top: rect.top,
      left: rect.right + 4
    });
    setActiveSubMenu(item.id);
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.children && item.children.length > 0) return;
    if (item.action) item.action();
    if (onSelect) onSelect(item.id);
    onClose();
  };

  if (!open || !anchorEl) return null;

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10002, pointerEvents: 'none' }} onClick={onClose} />
      <div ref={menuRef} className="toolbar-submenu" style={menuStyle}>
        {items.map((item, idx) => (
          <React.Fragment key={item.id}>
            {item.id === 'divider' ? (
              <div className="submenu-divider" />
            ) : (
              <div
                className="submenu-item"
                onClick={() => handleItemClick(item)}
                onMouseEnter={(e) => handleItemHover(e, item)}
              >
                <span className="submenu-item-icon"><SvgIcon name={item.icon || 'box'} size={16} /></span>
                <span className="submenu-item-label">{item.label}</span>
                {item.desc && <span className="submenu-item-desc">{item.desc}</span>}
                {item.children && item.children.length > 0 && (
                  <span className="submenu-item-arrow"><SvgIcon name="chevron-right" size={14} /></span>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      {activeSubMenu && (
        <div
          className="submenu-panel"
          style={{
            position: 'fixed',
            top: subMenuPosition.top,
            left: subMenuPosition.left,
            zIndex: 10004
          }}
        >
          {items.find(i => i.id === activeSubMenu)?.children?.map(child => (
            <div
              key={child.id}
              className="submenu-item"
              onClick={() => {
                if (child.action) child.action();
                if (onSelect) onSelect(child.id);
                onClose();
              }}
            >
              <span className="submenu-item-icon"><SvgIcon name={child.icon || 'box'} size={16} /></span>
              <span className="submenu-item-label">{child.label}</span>
              {child.desc && <span className="submenu-item-desc">{child.desc}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ==================== 资产选择面板（弹窗式，带图片/视频/音频分类 tab） ====================

interface AssetPickerPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectAsset: (asset: { id: string; name: string; type: string; path: string; thumbnail?: string }) => void;
}

const ASSET_TABS = [
  { id: 'all', label: '全部', icon: 'box' },
    { id: 'image', label: '图片', icon: 'image', desc: '海报、分镜、角色设计' },
    { id: 'video', label: '视频', icon: 'video', desc: '创意广告、动画、电影' },
    { id: 'audio', label: '音频', icon: 'audio', desc: '音效、配音、音乐' },
] as const;
type AssetTabId = typeof ASSET_TABS[number]['id'];

const AssetPickerPanel: React.FC<AssetPickerPanelProps> = ({ open, onClose, onSelectAsset }) => {
  // 性能优化：仅订阅 assets 切片，避免面板常驻挂载导致的整仓订阅
  const assets = useAppStore(state => state.assets);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AssetTabId>('all');

  // 只取文件资产，不显示文件夹
  const allFileAssets = useMemo(() => Object.values(assets).filter(a => !String(a.type).startsWith('__folder') && String(a.type) !== 'folder'), [assets]);

  // 按 tab 和搜索内容过滤
  const filteredItems = useMemo(() => {
    let items = allFileAssets;
    if (activeTab !== 'all') {
      items = items.filter(a => a.type === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(a => a.name?.toLowerCase().includes(q));
    }
    return items;
  }, [allFileAssets, activeTab, search]);

  if (!open) return null;

  return (
    <div className="asset-picker-overlay" onClick={onClose}>
      <div className="asset-picker-panel" onClick={e => e.stopPropagation()}>
        <div className="asset-picker-header">
          <span className="asset-picker-title">资产库</span>
          <button className="asset-picker-close" onClick={onClose}><SvgIcon name="close" size={16} /></button>
        </div>

        {/* 分类 tab + 搜索框同一行 */}
        <div className="asset-picker-toolbar">
          <div className="asset-picker-tabs">
            {ASSET_TABS.map(tab => (
              <button
                key={tab.id}
                className={`asset-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
              <span className="asset-tab-icon"><SvgIcon name={tab.icon} size={15} /></span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <div className="asset-picker-search">
            <input
              type="text"
              placeholder="搜索资产..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="asset-picker-grid">
          {filteredItems.length === 0 && (
            <div className="asset-picker-empty">暂无资产</div>
          )}
          {filteredItems.map(a => {
            const thumb = a.thumbnail || (a.type === 'image' ? normalizeFileSrc(a.path) : undefined);
            return (
              <div
                key={a.id}
                className={`asset-picker-card ${a.type}`}
                onClick={() => onSelectAsset({ id: a.id, name: a.name, type: a.type, path: a.path, thumbnail: a.thumbnail })}
                title={a.name}
              >
                {thumb ? (
                  <img src={thumb} alt={a.name} className="asset-picker-card-thumb" />
                ) : (
                  <div className="asset-picker-card-icon">
                    <SvgIcon name={iconForType(a.type)} size={34} />
                  </div>
                )}
                <div className="asset-picker-card-name">{a.name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ==================== 添加节点面板 ====================

function AddNodePanel({ open, onClose, onSelect, position }: { open: boolean; onClose: () => void; onSelect: (type: AINodeType | 'upload' | 'panorama') => void; position?: { x: number; y: number } | null }) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [adjStyle, setAdjStyle] = React.useState<React.CSSProperties | null>(null);

  React.useEffect(() => {
    if (!open || !position) { setAdjStyle(null); return; }
    const el = panelRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      let { x, y } = position;
      const panelW = rect.width || 260;
      const panelH = rect.height || 400;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (x + panelW > vw - 8) x = Math.max(8, vw - panelW - 8);
      if (x < 8) x = 8;
      if (y + panelH > vh - 8) y = Math.max(8, vh - panelH - 8);
      if (y < 8) y = 8;
      setAdjStyle({ position: 'fixed', left: x, top: y, zIndex: 9997 });
    });
    return () => cancelAnimationFrame(raf);
  }, [open, position]);

  const finalStyle = adjStyle || (position
    ? { position: 'fixed', left: position.x, top: position.y, zIndex: 9997 }
    : { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });

  if (!open) return null;

  return (
    <div className="add-node-overlay" onClick={onClose}>
      <div ref={panelRef} className="add-node-panel" style={finalStyle} onClick={e => e.stopPropagation()}>
        <div className="add-node-panel-title">添加节点</div>
        <div className="add-node-list">
          {NODE_TEMPLATES.map(t => (
            <button key={t.type} className="add-node-item" onClick={() => onSelect(t.type as AINodeType | 'panorama')}>
              <span className="add-node-item-icon"><SvgIcon name={t.icon} size={20} /></span>
              <div className="add-node-item-info">
                <span className="add-node-item-label">{t.label}</span>
                <span className="add-node-item-desc">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="add-node-section-title">添加资源</div>
        <div className="add-node-list add-node-resource-list">
          <button className="add-node-item" onClick={() => onSelect('upload')}>
            <span className="add-node-item-icon"><SvgIcon name="upload" size={20} /></span>
            <div className="add-node-item-info">
              <span className="add-node-item-label">上传</span>
              <span className="add-node-item-desc">可上传图片、视频、音频文件</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 关闭确认弹窗 ====================

function CloseConfirmDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return (
    <div className="close-confirm-overlay" onClick={onCancel}>
      <div className="close-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="close-confirm-title">确认关闭画布？</div>
        <div className="close-confirm-desc">未保存的更改将会丢失，建议先保存。</div>
        <div className="close-confirm-actions">
          <button className="close-confirm-btn close-confirm-cancel" onClick={onCancel}>取消</button>
          <button className="close-confirm-btn close-confirm-ok" onClick={onConfirm}>确认关闭</button>
        </div>
      </div>
    </div>
  );
}

// ==================== 右上角操作栏 ====================

function CanvasTopBar() {
  // 性能优化：仅订阅所需切片，避免顶栏在任意状态变化时重渲染
  const setActiveCanvas = useAppStore(state => state.setActiveCanvas);
  const activeCanvasId = useAppStore(state => state.activeCanvasId);
  const canvasHistory = useAppStore(state => state.canvasHistory);
  const canvas = canvasHistory.find(c => c.id === activeCanvasId);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('保存成功');
  const importInputRef = useRef<HTMLInputElement>(null);

  const flashToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  }, []);

  const handleSave = useCallback(() => {
    if (!activeCanvasId) return;
    const state = useAppStore.getState();
    const current = state.canvasHistory.find((c: any) => c.id === activeCanvasId);
    state.updateCanvasData(activeCanvasId, { nodes: state.nodes, edges: current?.data?.edges || [], canvasGridVisible: state.canvasGridVisible }, getCanvasFirstImageThumbnail(state.nodes));
    flashToast('保存成功');
  }, [activeCanvasId, flashToast]);

  const handleExport = useCallback(() => {
    const state = useAppStore.getState();
    const current = state.canvasHistory.find((c: any) => c.id === activeCanvasId);
    const exportData = {
      type: 'yijing-canvas',
      version: 1,
      exportedAt: Date.now(),
      name: current?.name || canvas?.name || '未命名画布',
      nodes: state.nodes,
      edges: current?.data?.edges || [],
      canvasGridVisible: state.canvasGridVisible,
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = (exportData.name || 'canvas').replace(/[\\/:*?"<>|]/g, '_');
    a.href = url;
    a.download = `${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    flashToast('导出成功');
  }, [activeCanvasId, canvas?.name, flashToast]);

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const importedNodes = parsed?.nodes;
        const importedEdges = Array.isArray(parsed?.edges) ? parsed.edges : [];
        if (!importedNodes || typeof importedNodes !== 'object') {
          flashToast('文件格式错误');
          return;
        }
        const state = useAppStore.getState();
        const importName = `${parsed?.name || '导入画布'} (导入)`;
        const newCanvasId = state.saveCanvas(importName, {
          nodes: importedNodes,
          edges: importedEdges,
          canvasGridVisible: parsed?.canvasGridVisible ?? state.canvasGridVisible,
        }, getCanvasFirstImageThumbnail(importedNodes));
        state.setActiveCanvas(newCanvasId);
        state.loadCanvas(newCanvasId);
        flashToast('导入成功');
      } catch (err) {
        flashToast('导入失败');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [flashToast]);

  const confirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    setActiveCanvas(null);
  }, []);

  const startRename = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditName(canvas?.name || '未命名画布');
    setEditing(true);
  }, [canvas?.name]);

  const confirmRename = useCallback(() => {
    if (!activeCanvasId || !editName.trim()) return;
    const newHistory = useAppStore.getState().canvasHistory.map((c: any) =>
      c.id === activeCanvasId ? { ...c, name: editName.trim() } : c
    );
    useAppStore.setState({ canvasHistory: newHistory });
    setEditing(false);
  }, [activeCanvasId, editName]);

  return (
    <>
      <div className="canvas-top-bar">
        {editing ? (
          <input
            className="canvas-title-input"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditing(false); }}
            autoFocus
          />
        ) : (
          <span className="canvas-top-title" onClick={startRename} title="点击重命名"><SvgIcon name="canvas" size={15} /> {canvas?.name || '未命名画布'}</span>
        )}
        <div className="canvas-top-actions">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
          <button className="canvas-top-btn export-btn" onClick={handleExport} title="导出画布（含节点与提示词）"><SvgIcon name="save" size={14} /> 导出</button>
          <button className="canvas-top-btn import-btn" onClick={handleImportClick} title="导入画布"><SvgIcon name="upload" size={14} /> 导入</button>
          <button className="canvas-top-btn save-btn" onClick={handleSave} title="保存画布"><SvgIcon name="save" size={14} /> 保存</button>
          <button className="canvas-top-btn close-btn" onClick={() => setShowCloseConfirm(true)} title="关闭画布"><SvgIcon name="close" size={14} /> 关闭</button>
        </div>
      </div>
      {showToast && (
        <div className="canvas-toast"><SvgIcon name="save" size={14} /> {toastMsg}</div>
      )}
      <CloseConfirmDialog open={showCloseConfirm} onCancel={() => setShowCloseConfirm(false)} onConfirm={confirmClose} />
    </>
  );
}

// ==================== 底部悬浮工具栏 ====================

function ZoomControls({ canvasGridVisible, onToggleGrid }: { canvasGridVisible?: boolean; onToggleGrid?: () => void }) {
  const { getViewport, setViewport, fitView } = useReactFlow();
  const [zoom, setZoom] = React.useState(100);
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as globalThis.Node)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  React.useEffect(() => {
    const el = document.querySelector('.react-flow__viewport');
    if (!el) return;
    const observer = new MutationObserver(() => {
      try {
        const vp = getViewport();
        setZoom(Math.round(vp.zoom * 100));
      } catch {}
    });
    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, [getViewport]);

  const handleZoomIn = () => {
    const vp = getViewport();
    setViewport({ ...vp, zoom: Math.min(vp.zoom + 0.1, 100) });
  };
  const handleZoomOut = () => {
    const vp = getViewport();
    setViewport({ ...vp, zoom: Math.max(vp.zoom - 0.1, 0.1) });
  };
  const handleFitView = () => {
    setShowMenu(false);
    try { setViewport({ x: 0, y: 0, zoom: 1.25 }); } catch {}
  };
  const handleSetZoom = (pct: number) => {
    setShowMenu(false);
    try { setViewport({ x: 0, y: 0, zoom: pct / 100 }); } catch {}
  };

  return (
    <div className="zoom-controls" ref={menuRef}>
      <span className="zoom-label" onClick={() => setShowMenu(!showMenu)} title="点击选择缩放比例">{zoom}%</span>
      {showMenu && (
        <div className="zoom-dropdown">
          <div className="zoom-dropdown-item" onClick={() => handleSetZoom(50)}>缩放至 50%</div>
          <div className={`zoom-dropdown-item ${zoom === 100 ? 'active' : ''}`} onClick={() => handleSetZoom(100)}>缩放至 100%</div>
          <div className={`zoom-dropdown-item ${zoom === 125 ? 'active' : ''}`} onClick={() => handleSetZoom(125)}>缩放至 125%</div>
          <div className={`zoom-dropdown-item ${zoom === 200 ? 'active' : ''}`} onClick={() => handleSetZoom(200)}>缩放至 200%</div>
          <div className={`zoom-dropdown-item ${zoom === 800 ? 'active' : ''}`} onClick={() => handleSetZoom(800)}>缩放至 800%</div>
          <div className="zoom-divider" />
          <div className="zoom-dropdown-item" onClick={handleZoomIn}>放大</div>
          <div className="zoom-dropdown-item" onClick={handleZoomOut}>缩小</div>
          <div className="zoom-dropdown-item" onClick={handleFitView}>适应屏幕</div>
        </div>
      )}
      <button onClick={handleZoomIn} title="放大">+</button>
      <button onClick={handleZoomOut} title="缩小">−</button>
      <button onClick={handleFitView} title="适应屏幕">⤢</button>
      <button
        className={canvasGridVisible ? 'active' : ''}
        onClick={onToggleGrid}
        title="网格切换"
      >
        <SvgIcon name="grid" size={15} />
      </button>
    </div>
  );
}

// ==================== 底部工具栏（FloatingToolbar） ====================

const TOOLBAR_MENUS: Record<string, MenuItem[]> = {
  'add-node': [
    { id: 'text', label: '文本', icon: 'text', desc: '剧本、广告词、品牌文案' },
    { id: 'image', label: '图片', icon: 'image', desc: '海报、分镜、角色设计' },
    { id: 'video', label: '视频', icon: 'video', desc: '创意广告、动画、电影' },
    { id: 'panorama', label: '全景图', icon: 'panorama', desc: '生成720°全景场景，点击进入全景漫游' },
    { id: 'director-stage', label: '3D导演台', icon: 'stage', desc: '3D场景搭建、镜头调度与运镜' },
    { id: 'audio', label: '音频', icon: 'audio', desc: '音效、配音、音乐' },
    { id: 'divider', label: '', desc: '' },
    { id: 'upload', label: '上传', icon: 'upload', desc: '上传图片、视频、音频文件' }
  ],
  'history': [
    { id: 'history-recent', label: '最近使用', icon: 'history', desc: '最近生成的节点' },
    { id: 'history-favorite', label: '收藏', icon: 'star', desc: '收藏的节点模板' }
  ]
};

function FloatingToolbar({
  onAddNodeSelect,
  onOpenAssetPicker,
}: {
  onAddNodeSelect?: (type: string) => void;
  onOpenAssetPicker?: () => void;
}) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const buttonRefs = {
    'add-node': useRef<HTMLButtonElement>(null),
    'history': useRef<HTMLButtonElement>(null)
  };

  const handleButtonClick = (menuId: string) => {
    if (activeMenu === menuId) {
      setActiveMenu(null);
      setMenuAnchor(null);
    } else {
      setActiveMenu(menuId);
      setMenuAnchor(buttonRefs[menuId as keyof typeof buttonRefs]?.current);
    }
  };

  const handleMenuSelect = (itemId: string) => {
    if (onAddNodeSelect) onAddNodeSelect(itemId);
    setActiveMenu(null);
    setMenuAnchor(null);
  };

  const closeAllMenus = () => {
    setActiveMenu(null);
    setMenuAnchor(null);
  };

  return (
    <>
      <div className="float-toolbar">
        <button
          ref={buttonRefs['add-node']}
          className={`float-tool-btn primary ${activeMenu === 'add-node' ? 'active' : ''}`}
          onClick={() => handleButtonClick('add-node')}
        >
          <span className="float-tool-icon"><SvgIcon name="spark" size={16} /></span>
          <span>添加节点</span>
        </button>
        <button
          className="float-tool-btn"
          onClick={onOpenAssetPicker}
          title="资产"
        >
          <span className="float-tool-icon"><SvgIcon name="box" size={16} /></span>
          <span>资产</span>
        </button>
        <button
          ref={buttonRefs['history']}
          className={`float-tool-btn ${activeMenu === 'history' ? 'active' : ''}`}
          onClick={() => handleButtonClick('history')}
          title="历史记录"
        >
          <span className="float-tool-icon"><SvgIcon name="history" size={16} /></span>
          <span>历史记录</span>
        </button>
      </div>
      {activeMenu && TOOLBAR_MENUS[activeMenu] && (
        <ToolbarSubMenu
          open={true}
          onClose={closeAllMenus}
          anchorEl={menuAnchor}
          items={TOOLBAR_MENUS[activeMenu]}
          onSelect={handleMenuSelect}
        />
      )}
    </>
  );
}

// ==================== 主组件 ====================

type CanvasProps = { canvasId?: string; onBack?: () => void };

function CanvasInner(_props: CanvasProps = {}) {
  // 性能优化：仅订阅 nodes 切片，actions 为稳定引用，避免整仓订阅导致的全量重渲染
  const storeNodes = useAppStore(state => state.nodes);
  const addNode = useAppStore(state => state.addNode);
  const setCanvasGridVisible = useAppStore(state => state.setCanvasGridVisible);
  const setMediaPreview = useAppStore(state => state.setMediaPreview);
  const { screenToFlowPosition } = useReactFlow();
  const reactFlowInstanceRef = useRef<any>(null);
  const connectStartRef = useRef<{ nodeId: string; side: 'left' | 'right'; x: number; y: number } | null>(null);
  const connectSucceededRef = useRef(false);
  const activeCanvasId = useAppStore(state => state.activeCanvasId);
  const currentCanvasData = useAppStore(state => state.canvasHistory.find(c => c.id === state.activeCanvasId)?.data);

  const [nodes, setNodes, onNodesChange] = useNodesState(storeNodesToFlowNodes(storeNodes));
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(Array.isArray(currentCanvasData?.edges) ? currentCanvasData.edges : []);
  const [panOnDrag, setPanOnDrag] = useState<boolean>(false);
  const [spacePanning, setSpacePanning] = useState(false);
  const [addPanelState, setAddPanelState] = useState<{
    open: boolean;
    position: { x: number; y: number } | null;
    attached?: boolean;
    batchSourceIds?: string[];
    flowPosition?: { x: number; y: number };
  }>({ open: false, position: null, attached: false });
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'nodes' | 'assets'>('nodes');
  const [activeInputNodeId, setActiveInputNodeId] = useState<string | null>(null);
  const [referencePickTargetNodeId, setReferencePickTargetNodeId] = useState<string | null>(null);
  const [referencePickedNodeIds, setReferencePickedNodeIds] = useState<string[]>([]);
  const [viewportTick, setViewportTick] = useState(0);
  const [nodeGroups, setNodeGroups] = useState<Array<{ id: string; nodeIds: string[]; label: string }>>(Array.isArray(currentCanvasData?.groups) ? currentCanvasData.groups : []);

  const canvasGridVisible = useAppStore(state => state.canvasGridVisible);

  // 是否存在多选（仅在多选时需要跟随视口更新批量选框，避免每帧平移都触发重渲染）
  const hasMultiSelectionRef = useRef(false);
  const hasGroupsRef = useRef(false);
  const viewportRafRef = useRef<number>(0);
  const handleViewportMove = useCallback(() => {
    if (!hasMultiSelectionRef.current && !hasGroupsRef.current) return;
    if (viewportRafRef.current) return;
    viewportRafRef.current = window.requestAnimationFrame(() => {
      viewportRafRef.current = 0;
      setViewportTick(tick => tick + 1);
    });
  }, []);

  useEffect(() => {
    hasGroupsRef.current = nodeGroups.length > 0;
  }, [nodeGroups]);

  const setViewport100 = useCallback(() => {
    try {
      const viewport = reactFlowInstanceRef.current?.getViewport?.();
      reactFlowInstanceRef.current?.setViewport?.({ x: viewport?.x || 0, y: viewport?.y || 0, zoom: 1 }, { duration: 0 });
    } catch {}
  }, []);
  const persistCanvasSnapshot = useCallback((nextNodes: Record<string, AINode> = useAppStore.getState().nodes, nextEdges: FlowEdge[] = edges) => {
    if (!activeCanvasId) return;
    const state = useAppStore.getState();
    state.updateCanvasData(activeCanvasId, {
      nodes: nextNodes,
      edges: nextEdges,
      groups: nodeGroups,
      canvasGridVisible: state.canvasGridVisible,
    }, getCanvasFirstImageThumbnail(nextNodes));
  }, [activeCanvasId, edges, nodeGroups]);


  useEffect(() => {
    setEdges(Array.isArray(currentCanvasData?.edges) ? currentCanvasData.edges : []);
  }, [activeCanvasId, currentCanvasData?.edges, setEdges]);

  useEffect(() => {
    setNodeGroups(Array.isArray(currentCanvasData?.groups) ? currentCanvasData.groups : []);
  }, [activeCanvasId, currentCanvasData?.groups]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ targetNodeId?: string }>).detail;
      if (!detail?.targetNodeId) return;
      setReferencePickTargetNodeId(detail.targetNodeId);
      setReferencePickedNodeIds([]);
      setActiveInputNodeId(detail.targetNodeId);
    };
    window.addEventListener('canvas:start-reference-pick', handler);
    return () => window.removeEventListener('canvas:start-reference-pick', handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; target?: string }>).detail;
      if (!detail?.source || !detail?.target) return;
      const nextEdge = { id: `auto-${detail.source}-${detail.target}-${Date.now()}`, source: detail.source, target: detail.target } as FlowEdge;
      setEdges(currentEdges => currentEdges.some(edge => edge.source === detail.source && edge.target === detail.target) ? currentEdges : [...currentEdges, nextEdge]);
    };
    window.addEventListener('canvas:add-edge', handler);
    return () => window.removeEventListener('canvas:add-edge', handler);
  }, [setEdges]);

  const getNodeReferenceMedia = useCallback((sourceNode?: AINode): { url: string; kind: 'image' | 'video' | 'audio' } => {
    if (!sourceNode) return { url: '', kind: 'image' };
    // 视频结果：优先使用视频地址，缩略图交由前端从视频首帧生成
    if (sourceNode.result?.type === 'video' && sourceNode.result.url) {
      return { url: sourceNode.result.url, kind: 'video' };
    }
    if (sourceNode.result?.type === 'audio' && sourceNode.result.url) {
      return { url: sourceNode.result.url, kind: 'audio' };
    }
    if (sourceNode.result?.type === 'image' && sourceNode.result.url) {
      return { url: sourceNode.result.url, kind: 'image' };
    }
    const firstReference = Array.isArray(sourceNode.options?.referenceImages) ? sourceNode.options.referenceImages[0] : undefined;
    if (firstReference?.url) return { url: firstReference.url, kind: (firstReference as any).kind || 'image' };
    if (sourceNode.thumbnail) return { url: sourceNode.thumbnail, kind: 'image' };
    return { url: '', kind: 'image' };
  }, []);

  const pickReferenceNode = useCallback((sourceNodeId: string) => {
    if (!referencePickTargetNodeId || sourceNodeId === referencePickTargetNodeId) return;
    const sourceNode = useAppStore.getState().nodes[sourceNodeId];
    const { url, kind } = getNodeReferenceMedia(sourceNode);
    if (!url) return;
    const name = getNodeDisplayName(sourceNode) || sourceNodeId;
    setReferencePickedNodeIds(prev => prev.includes(sourceNodeId) ? prev : [...prev, sourceNodeId]);
    window.dispatchEvent(new CustomEvent('canvas:reference-picked', {
      detail: { targetNodeId: referencePickTargetNodeId, sourceNodeId, name, url, kind },
    }));
  }, [getNodeReferenceMedia, referencePickTargetNodeId]);

  useEffect(() => {
    if (!activeCanvasId) {
      if (Object.keys(storeNodes || {}).length === 0 && edges.length === 0) return;
      const state = useAppStore.getState();
      const cid = state.saveCanvas('自动保存画布', {
        nodes: state.nodes,
        edges,
        canvasGridVisible: state.canvasGridVisible,
      });
      state.setActiveCanvas(cid);
      return;
    }
    const timer = window.setTimeout(() => {
      const latestState = useAppStore.getState();
      latestState.updateCanvasData(activeCanvasId, {
        nodes: latestState.nodes,
        edges,
        groups: nodeGroups,
        canvasGridVisible: latestState.canvasGridVisible,
      }, getCanvasFirstImageThumbnail(latestState.nodes));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeCanvasId, storeNodes, edges, canvasGridVisible, nodeGroups]);

  const disconnectNode = useCallback((nodeId: string, side: 'input' | 'output') => {
    setEdges(currentEdges => {
      return currentEdges.filter(edge => side === 'input' ? edge.target !== nodeId : edge.source !== nodeId);
    });
  }, [setEdges]);

  const deleteCanvasNode = useCallback((nodeId: string) => {
    const state = useAppStore.getState();
    const nextNodes = Object.fromEntries(Object.entries(state.nodes).filter(([id]) => id !== nodeId));
    const nextEdges = edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
    useAppStore.setState({ nodes: nextNodes });
    setEdges(nextEdges);
    setNodes(currentNodes => currentNodes.filter(node => node.id !== nodeId));
    setActiveInputNodeId(current => current === nodeId ? null : current);
    if (activeCanvasId) {
      state.updateCanvasData(activeCanvasId, {
        nodes: nextNodes,
        edges: nextEdges,
        canvasGridVisible: state.canvasGridVisible,
      }, getCanvasFirstImageThumbnail(nextNodes));
    }
  }, [activeCanvasId, edges, setEdges, setNodes]);

  const createLinkedNode = useCallback((sourceId: string, targetType: AINodeType, overrides: Partial<Omit<AINode, 'id'>> = {}) => {
    const state = useAppStore.getState();
    const sourceNode = state.nodes[sourceId];
    if (!sourceNode) return undefined;
    const allowMultiple = !!overrides.options?.displayName;
    const hasLinkedTarget = edges.some(edge => edge.source === sourceId && edge.target && state.nodes[edge.target]?.type === targetType && (!allowMultiple || state.nodes[edge.target]?.options?.displayName === overrides.options?.displayName));
    if (hasLinkedTarget) return undefined;
    const targetId = addNode({
      type: targetType,
      provider: overrides.provider || sourceNode.provider || 'openai',
      configId: overrides.configId || sourceNode.configId,
      model: overrides.model || sourceNode.model,
      x: overrides.x ?? sourceNode.x + Math.max(sourceNode.width || 280, 280) + 130,
      y: overrides.y ?? sourceNode.y,
      width: overrides.width || 280,
      height: overrides.height || 220,
      status: overrides.status || 'idle',
      // 文本/上游提示词不再直接写进输入框，只在生成提交时经 upstreamPrompt 起作用；仅当显式指定 overrides.prompt 时才回填输入框
      prompt: overrides.prompt ?? '',
      thumbnail: overrides.thumbnail,
      // 透传 result / meta，确保导演台导出的视频、截图能像上传节点一样直接展示媒体
      ...(overrides.result ? { result: overrides.result } : {}),
      ...(overrides.meta ? { meta: overrides.meta } : {}),
      aspectRatio: overrides.aspectRatio,
      resolution: overrides.resolution,
      size: overrides.size,
      workflow: overrides.workflow,
      options: {
        displayName: createNodeDisplayName(targetType, state.nodes),
        generationType: targetType,
        upstreamPrompt: TEXT_NODE_TYPES.includes(sourceNode.type)
          ? (sourceNode.result?.type === 'text' && sourceNode.result.text?.trim() ? sourceNode.result.text : (sourceNode.prompt || ''))
          : undefined,
        upstreamNodeIds: [sourceId],
        ...overrides.options,
      },
    });
    const nextEdge = { id: `auto-${sourceId}-${targetId}-${Date.now()}`, source: sourceId, target: targetId } as FlowEdge;
    const nextEdges = (() => {
      let computedEdges = edges;
      setEdges(currentEdges => {
        computedEdges = currentEdges.some(edge => edge.source === sourceId && edge.target === targetId) ? currentEdges : [...currentEdges, nextEdge];
        return computedEdges;
      });
      return computedEdges.some(edge => edge.source === sourceId && edge.target === targetId) ? computedEdges : [...computedEdges, nextEdge];
    })();
    if (activeCanvasId) {
      const nextState = useAppStore.getState();
      nextState.updateCanvasData(activeCanvasId, { nodes: nextState.nodes, edges: nextEdges, canvasGridVisible: nextState.canvasGridVisible }, getCanvasFirstImageThumbnail(nextState.nodes));
    }
    return targetId;
  }, [activeCanvasId, addNode, edges, setEdges]);

  const syncFlowNodes = useCallback((nextEdges: FlowEdge[] = edges) => {
    const built = storeNodesToFlowNodes(useAppStore.getState().nodes, nextEdges);
    const referencePickActive = !!referencePickTargetNodeId;
    setNodes(current => {
      const currentById = new Map(current.map(node => [node.id, node]));
      let changed = built.length !== current.length;
      const next = built.map(flowNode => {
        const referencePicked = referencePickedNodeIds.includes(flowNode.id);
        const builtData: any = flowNode.data;
        const prev = currentById.get(flowNode.id);
        if (prev) {
          const prevData: any = prev.data || {};
          const samePosition = prev.position?.x === flowNode.position.x && prev.position?.y === flowNode.position.y;
          const sameSize = prev.width === flowNode.width && prev.height === flowNode.height;
          const sameNode = prevData.node === builtData.node;
          const sameConnection = prevData.isInputConnected === builtData.isInputConnected
            && prevData.isOutputConnected === builtData.isOutputConnected;
          const sameIncoming = shallowArrayEqual(prevData.incomingImageNodeIds, builtData.incomingImageNodeIds)
            && shallowArrayEqual(prevData.incomingMediaKinds, builtData.incomingMediaKinds)
            && prevData.forceOmniReference === builtData.forceOmniReference;
          const sameActive = prevData.activeInputNodeId === activeInputNodeId;
          const sameReference = prevData.referencePickActive === referencePickActive
            && prevData.referencePicked === referencePicked;
          const sameCallbacks = prevData.setActiveInputNodeId === setActiveInputNodeId
            && prevData.disconnectNode === disconnectNode
            && prevData.createLinkedNode === createLinkedNode
            && prevData.deleteCanvasNode === deleteCanvasNode
            && prevData.onPickReferenceNode === pickReferenceNode
            && prevData.setMediaPreview === setMediaPreview;
          if (samePosition && sameSize && sameNode && sameConnection && sameIncoming && sameActive && sameReference && sameCallbacks) {
            // 该节点无任何变化，复用旧对象引用（保留 selected / measured 等 React Flow 内部状态）
            return prev;
          }
          changed = true;
          return {
            ...prev,
            type: flowNode.type,
            position: samePosition ? prev.position : flowNode.position,
            width: flowNode.width,
            height: flowNode.height,
            style: flowNode.style,
            data: {
              ...builtData,
              activeInputNodeId,
              setActiveInputNodeId,
              disconnectNode,
              createLinkedNode,
              deleteCanvasNode,
              referencePickActive,
              referencePicked,
              onPickReferenceNode: pickReferenceNode,
              setMediaPreview,
            },
          };
        }
        changed = true;
        return {
          ...flowNode,
          data: {
            ...builtData,
            activeInputNodeId,
            setActiveInputNodeId,
            disconnectNode,
            createLinkedNode,
            deleteCanvasNode,
            referencePickActive,
            referencePicked,
            onPickReferenceNode: pickReferenceNode,
            setMediaPreview,
          },
        };
      });
      // 完全没有变化时返回旧数组引用，避免触发 React Flow 的重新渲染
      return changed ? next : current;
    });
  }, [edges, activeInputNodeId, setNodes, disconnectNode, createLinkedNode, deleteCanvasNode, pickReferenceNode, referencePickTargetNodeId, referencePickedNodeIds, setMediaPreview]);

  const selectedBounds = useMemo(() => {
    const selectedNodes = nodes.filter(node => node.selected);
    hasMultiSelectionRef.current = selectedNodes.length > 1;
    if (selectedNodes.length <= 1) return null;
    const canvasRect = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
    const selectedRects = selectedNodes
      .map(node => document.querySelector(`[data-id="${node.id}"]`)?.getBoundingClientRect())
      .filter(Boolean) as DOMRect[];
    if (canvasRect && selectedRects.length > 0) {
      const left = Math.min(...selectedRects.map(rect => rect.left - canvasRect.left));
      const top = Math.min(...selectedRects.map(rect => rect.top - canvasRect.top));
      const right = Math.max(...selectedRects.map(rect => rect.right - canvasRect.left));
      const bottom = Math.max(...selectedRects.map(rect => rect.bottom - canvasRect.top));
      return { left: left - 3, top: top - 3, width: right - left + 6, height: bottom - top + 6, ids: selectedNodes.map(node => node.id) };
    }
    const left = Math.min(...selectedNodes.map(node => node.position.x));
    const top = Math.min(...selectedNodes.map(node => node.position.y));
    const right = Math.max(...selectedNodes.map(node => node.position.x + ((node.measured as any)?.width || (node.data as any)?.node?.width || 320)));
    const bottom = Math.max(...selectedNodes.map(node => node.position.y + ((node.measured as any)?.height || (node.data as any)?.node?.height || 260)));
    return { left: left - 3, top: top - 3, width: right - left + 6, height: bottom - top + 6, ids: selectedNodes.map(node => node.id) };
  }, [nodes, viewportTick]);

  // 计算每个组的屏幕边界（用于渲染圆角灰色组选框），跟随视口移动更新
  const groupBoundsList = useMemo(() => {
    if (nodeGroups.length === 0) return [] as Array<{ id: string; label: string; left: number; top: number; width: number; height: number; nodeIds: string[] }>;
    const canvasRect = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
    if (!canvasRect) return [];
    return nodeGroups.map(group => {
      const rects = group.nodeIds
        .map(id => document.querySelector(`[data-id="${id}"]`)?.getBoundingClientRect())
        .filter(Boolean) as DOMRect[];
      if (rects.length === 0) return null;
      const pad = 18;
      const left = Math.min(...rects.map(rect => rect.left - canvasRect.left)) - pad;
      const top = Math.min(...rects.map(rect => rect.top - canvasRect.top)) - pad - 20;
      const right = Math.max(...rects.map(rect => rect.right - canvasRect.left)) + pad;
      const bottom = Math.max(...rects.map(rect => rect.bottom - canvasRect.top)) + pad;
      return { id: group.id, label: group.label, left, top, width: right - left, height: bottom - top, nodeIds: group.nodeIds };
    }).filter(Boolean) as Array<{ id: string; label: string; left: number; top: number; width: number; height: number; nodeIds: string[] }>;
  }, [nodeGroups, nodes, viewportTick]);

  // 将选中节点打组：Alt+G
  const groupSelectedNodes = useCallback(() => {
    const selectedIds = nodes.filter(node => node.selected).map(node => node.id);
    if (selectedIds.length < 2) return;
    const state = useAppStore.getState();
    const groupId = `group-${Date.now()}`;
    const groupIndex = nodeGroups.length + 1;
    const label = `组合${groupIndex}`;
    // 组合内节点标记为参考内容（参考图/参考视频/参考音频/提示词），供下个节点引用
    selectedIds.forEach(id => {
      const node = state.nodes[id];
      if (!node) return;
      state.updateNode(id, {
        options: {
          ...node.options,
          groupId,
          isGroupReference: true,
        },
      });
    });
    setNodeGroups(prev => [...prev, { id: groupId, nodeIds: selectedIds, label }]);
  }, [nodes, nodeGroups]);

  // 收集某个组内所有节点的参考内容（图片/视频/音频/提示词）
  const collectGroupReferences = useCallback((nodeIds: string[]) => {
    const state = useAppStore.getState();
    const referenceImages: Array<{ id: string; name: string; url: string; type?: string; nodeId?: string }> = [];
    const promptParts: string[] = [];
    const upstreamNodeIds: string[] = [];
    nodeIds.forEach(id => {
      const node = state.nodes[id];
      if (!node) return;
      upstreamNodeIds.push(id);
      // 优先使用生成节点保存的方舟 TOS URL（同账号产物受信任、视频参考不卡真人），回退本地路径
      const url = node.result?.remoteUrl || node.result?.url || node.thumbnail || (Array.isArray(node.options?.referenceImages) ? node.options.referenceImages[0]?.url : undefined);
      const mediaType = node.result?.type || 'image';
      if (url) {
        referenceImages.push({ id: `group-ref-${id}-${Date.now()}`, name: getNodeDisplayName(node), url, type: mediaType, nodeId: id });
      }
      const text = TEXT_NODE_TYPES.includes(node.type)
        ? node.result?.type === 'text' && node.result.text?.trim()
          ? node.result.text
          : (node.prompt || '')
        : '';
      if (text.trim()) promptParts.push(text.trim());
    });
    return { referenceImages, prompt: composePromptParts(...promptParts), upstreamNodeIds };
  }, []);

  const createBatchLinkedNode = useCallback((sourceIds: string[], targetType: AINodeType, flowPosition?: { x: number; y: number }, side: 'left' | 'right' = 'right') => {
    if (sourceIds.length === 0) return;
    if (!flowPosition && !selectedBounds) return;
    const targetX = flowPosition?.x ?? (side === 'right' ? selectedBounds!.left + selectedBounds!.width + 140 : Math.max(20, selectedBounds!.left - 300));
    const targetY = flowPosition?.y ?? (selectedBounds!.top + selectedBounds!.height / 2 - 110);
    // 收集所有来源节点的参考内容（参考图/参考视频/参考音频/提示词），作为下个节点的生成参考
    const { referenceImages, prompt: referencePrompt } = collectGroupReferences(sourceIds);
    const newId = addNode({
      type: targetType,
      provider: 'openai',
      x: targetX,
      y: targetY,
      width: 280,
      height: 220,
      status: 'idle',
      prompt: '',
      options: {
        displayName: createNodeDisplayName(targetType, useAppStore.getState().nodes),
        generationType: targetType,
        referenceImages,
        upstreamPrompt: referencePrompt || undefined,
        upstreamNodeIds: [...sourceIds],
      },
    });
    const newEdges = sourceIds.map(source => ({ id: `batch-${source}-${newId}-${Date.now()}`, source, target: newId } as FlowEdge));
    setEdges(currentEdges => [...currentEdges, ...newEdges]);
    setViewport100();
    setTimeout(() => syncFlowNodes([...edges, ...newEdges]), 0);
  }, [addNode, edges, selectedBounds, setEdges, syncFlowNodes, setViewport100]);

  const handleBatchConnect = useCallback((side: 'left' | 'right') => {
    if (!selectedBounds || selectedBounds.ids.length === 0) return;
    createBatchLinkedNode(selectedBounds.ids, 'result', undefined, side);
  }, [createBatchLinkedNode, selectedBounds]);

  const openBatchAddPanel = useCallback((event: React.MouseEvent, side: 'left' | 'right') => {
    if (!selectedBounds || selectedBounds.ids.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const handleMove = (moveEvent: MouseEvent) => {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8) moved = true;
    };
    const handleUp = (upEvent: MouseEvent) => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      if (!moved) {
        handleBatchConnect(side);
        return;
      }
      const flowPoint = screenToFlowPosition({ x: upEvent.clientX, y: upEvent.clientY });
      setAddPanelState({
        open: true,
        position: { x: upEvent.clientX, y: upEvent.clientY },
        attached: false,
        batchSourceIds: selectedBounds.ids,
        flowPosition: { x: flowPoint.x - 140, y: flowPoint.y - 80 },
      });
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  }, [handleBatchConnect, screenToFlowPosition, selectedBounds]);

  useEffect(() => { syncFlowNodes(edges); }, [storeNodes, edges, activeInputNodeId, referencePickTargetNodeId, referencePickedNodeIds, syncFlowNodes]);

  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    const state = useAppStore.getState();
    let changedPosition = false;
    changes.forEach((change: any) => {
      if (change.type === 'remove') {
        deleteCanvasNode(change.id);
        return;
      }
      if (change.type === 'position' && change.position && change.dragging === false) {
        state.updateNode(change.id, { x: change.position.x, y: change.position.y });
        changedPosition = true;
      }
    });
    if (changedPosition && activeCanvasId) {
      window.setTimeout(() => {
        const latestState = useAppStore.getState();
        latestState.updateCanvasData(activeCanvasId, {
          nodes: latestState.nodes,
          edges,
          canvasGridVisible: latestState.canvasGridVisible,
        }, getCanvasFirstImageThumbnail(latestState.nodes));
      }, 0);
    }
  }, [activeCanvasId, deleteCanvasNode, edges, onNodesChange]);

  const handleConnect = useCallback((connection: Connection) => {
    connectSucceededRef.current = true;
    setEdges((eds) => {
      const nextEdges = addEdge(connection, eds);
      setTimeout(() => syncFlowNodes(nextEdges), 0);
      return nextEdges;
    });
    const sourceId = connection.source;
    const targetId = connection.target;
    if (!sourceId || !targetId) return;
    const state = useAppStore.getState();
    const sourceNode = state.nodes[sourceId];
    const targetNode = state.nodes[targetId];
    if (!sourceNode || !targetNode) return;

    // 只有文本节点可以把内容传给下游；图片、视频、音频等节点只传递其结果素材。
    const sourceIsTextNode = TEXT_NODE_TYPES.includes(sourceNode.type);
    const sourceOwnText = sourceIsTextNode
      ? (sourceNode.result?.type === 'text' && sourceNode.result.text?.trim() ? sourceNode.result.text : (sourceNode.prompt || ''))
      : '';
    const sourceUpstreamText = sourceIsTextNode && typeof sourceNode.options?.upstreamPrompt === 'string'
      ? sourceNode.options.upstreamPrompt.trim()
      : '';
    const sourceText = sourceIsTextNode ? composePromptParts(sourceUpstreamText || undefined, sourceOwnText || undefined) : '';
    const targetGenType = String(targetNode.options?.generationType || targetNode.type || '');
    const sourceGenType = String(sourceNode.options?.generationType || sourceNode.type || '');
    const isVideoTarget = ['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'live-portrait', 'video-super-resolution', 'video-interpolate'].includes(targetGenType);
    const isImageRefTarget = ['image-upscale', 'image-to-image', 'image-blend', 'text-to-image'].includes(targetGenType);
    const sourceHasResult = Boolean(sourceNode.result?.url || sourceNode.thumbnail);
    const sourceResultUrl = sourceNode.result?.url || sourceNode.thumbnail || '';
    const sourceResultType = sourceNode.result?.type || 'image';
    const sourceIsImage = sourceResultType === 'image' && sourceHasResult;
    // 源节点若已生成媒体结果（图片/视频/音频），连线只作为参考图/参考素材传递，不再把上游提示词自动灌入下游节点
    const sourceProducedMedia = sourceHasResult && (sourceResultType === 'image' || sourceResultType === 'video' || sourceResultType === 'audio');
    const targetIsPanorama = targetNode.options?.panoramaType === '720' || targetNode.options?.outputType === 'panorama';
    const sourceIsPanorama = sourceNode.options?.panoramaType === '720' || sourceNode.options?.outputType === 'panorama';
    const targetIsDirectorStage = targetNode.type === 'director-stage';

    // 构建 update 的 options 部分
    const newOptions: Record<string, any> = {
      ...targetNode.options,
      upstreamNodeIds: Array.from(new Set([...(targetNode.options?.upstreamNodeIds || []), sourceId])),
    };

    // 全景图节点：直接连接图片后自动以该图片为源生成 720° 全景预览
    if (targetIsPanorama && sourceIsImage) {
      newOptions.sourceImage = sourceResultUrl;
      newOptions.panoramaType = '720';
      newOptions.outputType = 'panorama';
      newOptions.aspectRatio = '2:1';
      newOptions.imageRatio = '2:1';
      newOptions.size = '2048x1024';
      newOptions.resolution = newOptions.resolution || '2K';
      newOptions.apiCapability = 'image-to-720-panorama';
    }

    // 3D 导演台：连接全景图时，默认以全景图作为导演台默认场景
    if (targetIsDirectorStage && sourceIsPanorama && sourceIsImage) {
      newOptions.defaultSceneType = 'panorama';
      newOptions.panoramaSceneUrl = sourceResultUrl;
      newOptions.panoramaSceneNodeId = sourceId;
    }

    // 2. 智能参考图传递：图片节点 → 视频节点，自动设置首帧参考图
    if (sourceHasResult && (isVideoTarget || isImageRefTarget)) {
      const existingRefs = Array.isArray(targetNode.options?.referenceImages) ? targetNode.options.referenceImages : [];
      // 避免重复添加同一个源
      if (!existingRefs.some((r: any) => r.nodeId === sourceId)) {
        const refKind: 'image' | 'video' | 'audio' = sourceResultType === 'video' ? 'video' : sourceResultType === 'audio' ? 'audio' : 'image';
        const newRefId = `ref-${sourceId}-${Date.now()}`;
        newOptions.referenceImages = [
          ...existingRefs,
          { id: newRefId, name: sourceNode.options?.displayName || sourceGenType, url: sourceResultUrl, type: sourceResultType, kind: refKind, thumbnail: refKind === 'image' ? sourceResultUrl : undefined, nodeId: sourceId },
        ];
        // 视频参考：异步抽取首帧作为缩略图，回写到目标节点的 referenceImages
        if (refKind === 'video' && sourceResultUrl) {
          captureVideoFirstFrame(sourceResultUrl)
            .then(thumb => {
              const st = useAppStore.getState();
              const latest = st.nodes[targetId];
              if (!latest) return;
              const refs = Array.isArray(latest.options?.referenceImages) ? latest.options.referenceImages : [];
              st.updateNode(targetId, {
                options: {
                  ...latest.options,
                  referenceImages: refs.map((r: any) => r.id === newRefId ? { ...r, thumbnail: thumb } : r),
                },
              });
            })
            .catch(() => { /* 抽取失败时保留视频本身，video 标签兜底显示 */ });
        }
      }
    }

    if (sourceIsTextNode && sourceText) {
      newOptions.upstreamPrompt = composePromptParts(targetNode.options?.upstreamPrompt, sourceText);
    }

    const updatePayload: Parameters<ReturnType<typeof useAppStore['getState']>['updateNode']>[1] = {
      options: newOptions,
    };
    // 上游文本仅经 upstreamPrompt 在生成提交时生效，不再写入下游节点的可见输入框

    // 全景图节点：连接图片后直接生成 720° 全景预览（无需输入框）
    if (targetIsPanorama && sourceIsImage) {
      updatePayload.status = 'loading';
      updatePayload.prompt = '720°全景图：以连接的图片为场景主体，生成可用于全景预览的 equirectangular 全景图，左右边缘无缝衔接，2:1 横向比例，无黑边。';
      state.updateNode(targetId, updatePayload);
      try { state.executeNode(targetId); } catch {}
      return;
    }

    state.updateNode(targetId, updatePayload);
  }, [setEdges, syncFlowNodes]);

  // 助手（猫头鹰）通过事件请求连接两个节点，复用 handleConnect 的参考图/文本传递逻辑
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; target?: string }>).detail;
      if (!detail?.source || !detail?.target || detail.source === detail.target) return;
      const state = useAppStore.getState();
      if (!state.nodes[detail.source] || !state.nodes[detail.target]) return;
      handleConnect({ source: detail.source, target: detail.target, sourceHandle: null, targetHandle: null } as Connection);
    };
    window.addEventListener('canvas:assistant-connect', handler);
    return () => window.removeEventListener('canvas:assistant-connect', handler);
  }, [handleConnect]);

  // 连线在先、上游后生成的场景：当上游节点产出结果后，自动把其结果作为下游节点的参考图/源图补进去。
  // handleConnect 只在“连线时上游已有结果”才注入参考图；此处用响应式副作用兜底后生成的情况。
  useEffect(() => {
    if (!edges.length) return;
    const state = useAppStore.getState();
    const videoTargets = ['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'live-portrait', 'video-super-resolution', 'video-interpolate'];
    const imageRefTargets = ['image-upscale', 'image-to-image', 'image-blend', 'text-to-image'];
    edges.forEach(edge => {
      const sourceNode = edge.source ? state.nodes[edge.source] : undefined;
      const targetNode = edge.target ? state.nodes[edge.target] : undefined;
      if (!sourceNode || !targetNode) return;
      const sourceUrl = sourceNode.result?.url || sourceNode.thumbnail || '';
      if (!sourceUrl) return;
      const sourceType = sourceNode.result?.type || 'image';
      if (sourceType !== 'image' && sourceType !== 'video') return;
      const sourceGenType = String(sourceNode.options?.generationType || sourceNode.type || '');
      const targetGenType = String(targetNode.options?.generationType || targetNode.type || '');
      const targetIsPanorama = targetNode.options?.panoramaType === '720' || targetNode.options?.outputType === 'panorama';
      // 全景图节点无输入框，只能靠连线自动生成；若连线在先、上游后出图，这里兜底触发生成。
      if (targetIsPanorama && sourceType === 'image') {
        const panoAlready = targetNode.options?.sourceImage === sourceUrl && (targetNode.status === 'loading' || targetNode.status === 'processing' || !!targetNode.result?.url);
        if (panoAlready) return;
        if (targetNode.result?.url || targetNode.status === 'loading' || targetNode.status === 'processing') return;
        state.updateNode(edge.target as string, {
          status: 'loading',
          prompt: '720°全景图：以连接的图片为场景主体，生成可用于全景预览的 equirectangular 全景图，左右边缘无缝衔接，2:1 横向比例，无黑边。',
          options: {
            ...targetNode.options,
            sourceImage: sourceUrl,
            panoramaType: '720',
            outputType: 'panorama',
            aspectRatio: '2:1',
            imageRatio: '2:1',
            size: '2048x1024',
            resolution: targetNode.options?.resolution || '2K',
            apiCapability: 'image-to-720-panorama',
            upstreamNodeIds: Array.from(new Set([...(targetNode.options?.upstreamNodeIds || []), edge.source])),
          },
        });
        try { state.executeNode(edge.target as string); } catch { /* noop */ }
        return;
      }
      if (!videoTargets.includes(targetGenType) && !imageRefTargets.includes(targetGenType)) return;
      const existingRefs = Array.isArray(targetNode.options?.referenceImages) ? targetNode.options.referenceImages : [];
      const already = existingRefs.some((r: any) => r.nodeId === edge.source);
      if (already) return;
      const autoRefKind: 'image' | 'video' | 'audio' = sourceType === 'video' ? 'video' : 'image';
      const autoRefId = `ref-${edge.source}-${Date.now()}`;
      const autoRefTargetId = edge.target as string;
      state.updateNode(autoRefTargetId, {
        options: {
          ...targetNode.options,
          referenceImages: [
            ...existingRefs,
            { id: autoRefId, name: getNodeDisplayName(sourceNode) || sourceGenType, url: sourceUrl, type: sourceType, kind: autoRefKind, thumbnail: autoRefKind === 'image' ? sourceUrl : undefined, nodeId: edge.source },
          ],
          upstreamNodeIds: Array.from(new Set([...(targetNode.options?.upstreamNodeIds || []), edge.source])),
        },
      });
      // 视频参考：异步抽取首帧作为缩略图，回写到目标节点的 referenceImages
      if (autoRefKind === 'video' && sourceUrl) {
        captureVideoFirstFrame(sourceUrl)
          .then(thumb => {
            const st = useAppStore.getState();
            const latest = st.nodes[autoRefTargetId];
            if (!latest) return;
            const refs = Array.isArray(latest.options?.referenceImages) ? latest.options.referenceImages : [];
            st.updateNode(autoRefTargetId, {
              options: {
                ...latest.options,
                referenceImages: refs.map((r: any) => r.id === autoRefId ? { ...r, thumbnail: thumb } : r),
              },
            });
          })
          .catch(() => { /* 抽取失败时保留视频本身，video 标签兜底显示 */ });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeNodes, edges]);

  const handleConnectStart = useCallback((event: any, params: any) => {
    const nodeId = params?.nodeId;
    if (!nodeId) return;
    connectSucceededRef.current = false;
    connectStartRef.current = {
      nodeId,
      side: params?.handleType === 'target' ? 'left' : 'right',
      x: event?.clientX || 0,
      y: event?.clientY || 0,
    };
  }, []);

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const start = connectStartRef.current;
    const connectedToExistingNode = connectSucceededRef.current;
    connectStartRef.current = null;
    connectSucceededRef.current = false;
    if (!start || connectedToExistingNode) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.react-flow__handle, .lib-node, .add-node-panel, .canvas-sidebar')) return;
    const point = 'changedTouches' in event && event.changedTouches?.[0]
      ? { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }
      : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
    if (Math.hypot(point.x - start.x, point.y - start.y) < 12) return;
    const releaseElement = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
    if (releaseElement?.closest('.react-flow__handle, .lib-node, .add-node-panel, .canvas-sidebar')) return;
    const flowPoint = screenToFlowPosition(point);
    setAddPanelState({
      open: true,
      position: point,
      attached: false,
      batchSourceIds: [start.nodeId],
      flowPosition: { x: flowPoint.x - 140, y: flowPoint.y - 80 },
    });
  }, [screenToFlowPosition]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ nodeId: string; prompt: string }>).detail;
      if (!detail?.nodeId) return;
      const state = useAppStore.getState();
      edges.forEach(edge => {
        if (edge.source !== detail.nodeId || !edge.target || !detail.prompt?.trim()) return;
        const sourceNode = state.nodes[detail.nodeId];
        const targetNode = state.nodes[edge.target];
        if (!sourceNode || !targetNode || !TEXT_NODE_TYPES.includes(sourceNode.type)) return;
        // 上游文本节点实时编辑时，只更新下游的 upstreamPrompt（提交时生效），不覆盖下游可见输入框
        state.updateNode(edge.target, {
          options: {
            ...targetNode.options,
            upstreamPrompt: composePromptParts(targetNode.options?.upstreamPrompt, detail.prompt),
            upstreamNodeIds: Array.from(new Set([...(targetNode.options?.upstreamNodeIds || []), detail.nodeId])),
          },
        });
      });
    };
    window.addEventListener('canvas:inline-prompt-change', handler);
    return () => window.removeEventListener('canvas:inline-prompt-change', handler);
  }, [edges]);

  const isCanvasBlankTarget = useCallback((target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    if (!element) return false;
    if (element.closest('.lib-node, .node-input-popover, .canvas-sidebar, .float-toolbar, .zoom-controls, .canvas-top-bar, .add-node-panel, button, input, textarea, select')) return false;
    return !!element.closest('.react-flow__pane, .llib-canvas-area');
  }, []);

  const handlePaneDoubleClick = useCallback((event: React.MouseEvent) => {
    if (referencePickTargetNodeId) return;
    if (!isCanvasBlankTarget(event.target)) return;
    setViewport100();
    setAddPanelState({ open: true, position: { x: event.clientX, y: event.clientY }, attached: false });
  }, [isCanvasBlankTarget, referencePickTargetNodeId, setViewport100]);

  React.useEffect(() => {
    const el = document.querySelector('.llib-canvas-area');
    if (!el) return;
    let lastDblClick = 0;
    const handler = (ev: MouseEvent) => {
      if (referencePickTargetNodeId) return;
      if (!isCanvasBlankTarget(ev.target)) return;
      const now = Date.now();
      if (now - lastDblClick < 300) return;
      lastDblClick = now;
      setViewport100();
      setAddPanelState({ open: true, position: { x: ev.clientX, y: ev.clientY }, attached: false });
    };
    const timer = setTimeout(() => {
      el.addEventListener('dblclick', handler, true);
    }, 500);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('dblclick', handler, true);
    };
  }, [isCanvasBlankTarget, referencePickTargetNodeId, setViewport100]);

  const handlePaneClick = useCallback(() => {
    window.dispatchEvent(new CustomEvent('canvas:close-image-toolbar', { detail: {} }));
    if (referencePickTargetNodeId) {
      setReferencePickTargetNodeId(null);
      setReferencePickedNodeIds([]);
      return;
    }
    setActiveInputNodeId(null);
  }, [referencePickTargetNodeId]);

  const onDragOver = useCallback((event: React.DragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const bounds = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
    if (!bounds) return;
    addNode({ type: type as AINodeType, provider: 'openai', x: event.clientX - bounds.left - 140, y: event.clientY - bounds.top - 80, width: 280, height: 220, status: 'idle', prompt: '', options: { _autoOpen: true, displayName: createNodeDisplayName(type as AINodeType, useAppStore.getState().nodes) } });
    setViewport100();
  }, [addNode, setViewport100]);

  const isEmpty = !storeNodes || Object.keys(storeNodes).length === 0;

  // 资产选择回调：在画布中心创建对应类型节点
  const handleAssetSelect = useCallback((asset: { id: string; name: string; type: string; path: string; thumbnail?: string }) => {
    setShowAssetPicker(false);
    const bounds = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
    const x = (bounds?.width || 800) / 2 - 140;
    const y = (bounds?.height || 600) / 2 - 80;
    const nodeTypeMap: Record<string, AINodeType> = {
      'image': 'text-to-image',
      'video': 'text-to-video',
      'audio': 'audio2video',
    };
    const nodeType = nodeTypeMap[asset.type] || 'text-to-image';
    // 使用资产路径作为初始结果，节点直接显示该资产
    const dataUrl = asset.path.startsWith('http') ? asset.path : normalizeFileSrc(asset.path);
    addNode({
      type: nodeType,
      provider: 'openai',
      x, y,
      width: 280, height: 220,
      status: 'success',
      prompt: asset.name,
      options: { displayName: createNodeDisplayName(nodeType, useAppStore.getState().nodes) },
      result: { url: dataUrl, type: asset.type as 'image' | 'video' | 'audio' },
    });
  }, [addNode]);

  // 选择节点类型处理（定义在handleMenuSelect之前避免TDZ）
  const handleSelectNodeType = useCallback((type: AINodeType | 'upload' | 'panorama') => {
    const pendingBatch = addPanelState.batchSourceIds?.length ? {
      sourceIds: addPanelState.batchSourceIds,
      flowPosition: addPanelState.flowPosition,
    } : null;
    setAddPanelState({ open: false, position: null, attached: false });
    // 全景图节点：创建配置为 720° 全景的图片节点
    if (type === 'panorama') {
      const panoramaOptions = {
        displayName: createNodeDisplayName('text-to-image', useAppStore.getState().nodes).replace('图片节点', '全景图节点'),
        generationType: 'image-to-image',
        mediaFeature: '720°全景图',
        panoramaFeature: 'panorama-720',
        panoramaType: '720',
        outputType: 'panorama',
        imageRatio: '2:1',
        aspectRatio: '2:1',
        imageQuality: 'standard',
        imageClarity: '2K',
        apiCapability: 'image-to-720-panorama',
        workflowProject: 'image-to-720-panorama',
        // 全景图节点无需输入框/子功能，直接连接图片即可自动生成三维全景预览
        _autoOpen: false,
      };
      if (pendingBatch) {
        createBatchLinkedNode(pendingBatch.sourceIds, 'text-to-image', pendingBatch.flowPosition);
        return;
      }
      const panoramaPos = (addPanelState.position) || (() => {
        const b = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
        return { x: (b?.width || 800) / 2, y: (b?.height || 600) / 2 };
      })();
      addNode({
        type: 'text-to-image',
        provider: 'openai',
        x: panoramaPos.x - 140,
        y: panoramaPos.y - 80,
        width: 280, height: 220, status: 'idle', prompt: '',
        aspectRatio: '2:1',
        options: panoramaOptions,
      });
      setViewport100();
      return;
    }
    if (pendingBatch && type !== 'upload') {
      createBatchLinkedNode(pendingBatch.sourceIds, type, pendingBatch.flowPosition);
      return;
    }
    if (type === 'upload') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*,audio/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const bounds = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
          const x = (bounds?.width || 800) / 2 - 140;
          const y = (bounds?.height || 600) / 2 - 80;
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';
          const createdNodeId = addNode({
            type: isImage ? 'text-to-image' : isVideo ? 'text-to-video' : 'audio2video',
            provider: 'openai',
            x, y,
            width: 280, height: 220,
            status: 'success',
            prompt: file.name,
            options: { displayName: createNodeDisplayName(isImage ? 'text-to-image' : isVideo ? 'text-to-video' : 'audio2video', useAppStore.getState().nodes) },
            result: { url: dataUrl, type: mediaType },
          });
          autoSaveMediaToAssets({ name: file.name, type: mediaType, path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: createdNodeId });
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }
    const pos = (addPanelState.position) || (() => {
      const b = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
      return { x: (b?.width || 800) / 2, y: (b?.height || 600) / 2 };
    })();
    addNode({
      type,
      provider: 'openai',
      x: pos.x - 140,
      y: pos.y - 80,
      width: 280, height: 220, status: 'idle', prompt: '', options: { _autoOpen: true, displayName: createNodeDisplayName(type, useAppStore.getState().nodes) },
    });
    setViewport100();
  }, [addNode, addPanelState.batchSourceIds, addPanelState.flowPosition, createBatchLinkedNode, setViewport100]);

  // 下拉菜单选择节点类型（定义在handleSelectNodeType之后，避免TDZ）
  const handleMenuSelect = useCallback((itemId: string) => {
    const typeMap: Record<string, AINodeType | 'upload' | 'panorama'> = {
      'text': 'story-script',
      'image': 'text-to-image',
      'video': 'text-to-video',
      'panorama': 'panorama',
      'director-stage': 'director-stage',
      'audio': 'audio2video',
      'upload': 'upload'
    };
    const nodeType = typeMap[itemId] || itemId as AINodeType;
    handleSelectNodeType(nodeType as AINodeType | 'upload' | 'panorama');
  }, [handleSelectNodeType]);

  // ==================== 键盘快捷键 ====================
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePanning(true);
        document.body.classList.add('canvas-middle-panning');
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        setSpacePanning(false);
        document.body.classList.remove('canvas-middle-panning');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.body.classList.remove('canvas-middle-panning');
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (!(e.ctrlKey || e.metaKey)) return;

      const key = e.key.toLowerCase();
      const store = useAppStore.getState();
      const selectedIds = nodes.filter(node => node.selected).map(node => node.id);
      const writeClipboardText = (ids: string[], cut: boolean) => {
        const payload = { type: 'yijing-canvas-nodes', cut, nodes: ids.map(id => store.nodes[id]).filter(Boolean) };
        navigator.clipboard?.writeText(JSON.stringify(payload)).catch(() => undefined);
      };

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        store.undo();
        window.setTimeout(() => {
          const nextNodes = useAppStore.getState().nodes;
          setNodes(storeNodesToFlowNodes(nextNodes, edges));
          persistCanvasSnapshot(nextNodes, edges);
        }, 0);
        return;
      }

      if (key === 'z' && e.shiftKey) {
        e.preventDefault();
        store.redo();
        window.setTimeout(() => {
          const nextNodes = useAppStore.getState().nodes;
          setNodes(storeNodesToFlowNodes(nextNodes, edges));
          persistCanvasSnapshot(nextNodes, edges);
        }, 0);
        return;
      }

      if (key === 'c') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          store.copyNodes(selectedIds);
          writeClipboardText(selectedIds, false);
        }
        return;
      }

      if (key === 'x') {
        e.preventDefault();
        if (selectedIds.length > 0) {
          store.pushUndo();
          store.cutNodes(selectedIds);
          writeClipboardText(selectedIds, true);
          const nextNodes = Object.fromEntries(Object.entries(store.nodes).filter(([id]) => !selectedIds.includes(id)));
          const nextEdges = edges.filter(edge => !selectedIds.includes(edge.source) && !selectedIds.includes(edge.target));
          useAppStore.setState({ nodes: nextNodes });
          setEdges(nextEdges);
          setNodes(current => current.filter(node => !selectedIds.includes(node.id)));
          persistCanvasSnapshot(nextNodes, nextEdges);
        }
        return;
      }

      if (key === 'v') {
        e.preventDefault();
        store.pushUndo();
        const newIds = store.pasteNodes();
        window.setTimeout(() => {
          const nextNodes = useAppStore.getState().nodes;
          setNodes(storeNodesToFlowNodes(nextNodes, edges).map(node => ({ ...node, selected: (newIds as string[]).includes(node.id) })));
          persistCanvasSnapshot(nextNodes, edges);
        }, 0);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nodes, edges, setEdges, setNodes, persistCanvasSnapshot]);

  // Alt+G：将选中的多个节点打组
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        groupSelectedNodes();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [groupSelectedNodes]);

  // 解散某个组
  const ungroupNodes = useCallback((groupId: string) => {
    const state = useAppStore.getState();
    const group = nodeGroups.find(item => item.id === groupId);
    if (group) {
      group.nodeIds.forEach(id => {
        const node = state.nodes[id];
        if (!node) return;
        const nextOptions = { ...node.options };
        delete nextOptions.groupId;
        delete nextOptions.isGroupReference;
        state.updateNode(id, { options: nextOptions });
      });
    }
    setNodeGroups(prev => prev.filter(item => item.id !== groupId));
  }, [nodeGroups]);

  return (
    <div className={`llib-full-canvas ${referencePickTargetNodeId ? 'reference-picking' : ''}`}>
      <CanvasTopBar />
      <div className={`llib-canvas-area ${canvasGridVisible ? '' : 'no-grid'}`} onDragOver={onDragOver} onDrop={onDrop}>
        <div className="llib-bg-fixed" />
        {referencePickTargetNodeId && <div className="canvas-reference-pick-dim" />}
        {referencePickTargetNodeId && (
          <div className="canvas-reference-pick-bar">
            <button type="button" onClick={() => { setReferencePickTargetNodeId(null); setReferencePickedNodeIds([]); }}>
              <SvgIcon name="chevron-left" size={15} /> 返回
            </button>
            <span>点击画布已有图片作为参考，可多选</span>
          </div>
        )}
        <div style={{ position: 'relative', zIndex: referencePickTargetNodeId ? 3 : 1, width: '100%', height: '100%' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onConnectStart={handleConnectStart}
            onConnectEnd={handleConnectEnd}
            nodeTypes={nodeTypes}
            onPaneClick={handlePaneClick}
            onMove={handleViewportMove}
            onInit={(instance) => { reactFlowInstanceRef.current = instance; try { instance.setViewport({ x: 0, y: 0, zoom: 1 }); } catch {} }}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.02}
            maxZoom={100}
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
            onlyRenderVisibleElements={false}
            nodeDragThreshold={1}
            elevateNodesOnSelect={false}
            elevateEdgesOnSelect={false}
            zoomOnScroll={false}
            zoomOnDoubleClick={false}
            panOnDrag={spacePanning ? true : [1]}
            panOnScroll={true}
            selectionOnDrag={!spacePanning}
            selectionMode={SelectionMode.Partial}
            selectNodesOnDrag={true}
            multiSelectionKeyCode={null}
            selectionKeyCode={null}
          >
          </ReactFlow>
        </div>
        {isEmpty && (
          <div className="llib-empty-hint">
            <span className="llib-empty-hint-icon"><SvgIcon name="spark" size={26} /></span>
            <span>双击画布创建节点</span>
          </div>
        )}
      </div>

      <FloatingToolbar
        onAddNodeSelect={handleMenuSelect}
        onOpenAssetPicker={() => setShowAssetPicker(true)}
      />
      <ZoomControls
        canvasGridVisible={canvasGridVisible}
        onToggleGrid={() => setCanvasGridVisible(!canvasGridVisible)}
      />
      {groupBoundsList.map(group => (
        <div
          key={group.id}
          className="canvas-node-group"
          style={{ left: group.left, top: group.top, width: group.width, height: group.height }}
        >
          <div className="canvas-node-group-header">
            <span className="canvas-node-group-title">{group.label}</span>
            <span className="canvas-node-group-count">{group.nodeIds.length} 个参考</span>
            <div className="canvas-node-group-actions">
              <button
                className="canvas-node-group-btn"
                title="以组合内容作为参考生成下一个节点"
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); createBatchLinkedNode(group.nodeIds, 'text-to-image'); }}
              >
                <SvgIcon name="spark" size={13} />
              </button>
              <button
                className="canvas-node-group-btn"
                title="解散组合"
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); ungroupNodes(group.id); }}
              >
                <SvgIcon name="close" size={13} />
              </button>
            </div>
          </div>
        </div>
      ))}
      {selectedBounds && selectedBounds.ids.length > 0 && (
        <div
          className="canvas-batch-selection"
          style={{ left: selectedBounds.left, top: selectedBounds.top, width: selectedBounds.width, height: selectedBounds.height }}
        >
          <button className="canvas-batch-plus left" onMouseDown={(event) => openBatchAddPanel(event, 'left')} title="拖拽到空白处添加并批量连线" />
          <button className="canvas-batch-plus right" onMouseDown={(event) => openBatchAddPanel(event, 'right')} title="拖拽到空白处添加并批量连线" />
        </div>
      )}
      <AddNodePanel open={addPanelState.open} onClose={() => setAddPanelState({ open: false, position: null })} onSelect={handleSelectNodeType} position={addPanelState.position} />
      {createPortal(
        <AssetPickerPanel open={showAssetPicker} onClose={() => setShowAssetPicker(false)} onSelectAsset={handleAssetSelect} />,
        document.body
      )}

      {/* Sidebar / node stats */}
      <div className="canvas-sidebar-wrapper">
        <CanvasSidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          nodes={nodes}
          onNodeClick={(nodeId) => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
              try {
                const sourceNode = (node.data as any)?.node as AINode | undefined;
                const width = sourceNode?.width || (node.measured as any)?.width || 280;
                const height = sourceNode?.height || (node.measured as any)?.height || 220;
                reactFlowInstanceRef.current?.setCenter?.(node.position.x + width / 2, node.position.y + height / 2, { zoom: 1, duration: 300 });
              } catch {}
            }
          }}
          onAssetSelect={handleAssetSelect}
        />
      </div>
    </div>
  );
}

// ==================== 右侧可折叠侧边栏 ====================

function CanvasSidebar({
  collapsed,
  onToggle,
  activeTab,
  onTabChange,
  nodes,
  onNodeClick,
  onAssetSelect,
}: {
  collapsed: boolean;
  onToggle: () => void;
  activeTab: 'nodes' | 'assets';
  onTabChange: (tab: 'nodes' | 'assets') => void;
  nodes: FlowNode[];
  onNodeClick: (nodeId: string) => void;
  onAssetSelect: (asset: { id: string; name: string; type: string; path: string }) => void;
}) {
  // 性能优化：仅订阅所需切片，避免整仓订阅导致侧边栏在任意状态变化时重渲染
  const canvasHistory = useAppStore(state => state.canvasHistory);
  const activeCanvasId = useAppStore(state => state.activeCanvasId);
  const updateCanvasName = useAppStore(state => state.updateCanvasName);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const currentCanvas = canvasHistory.find((c: any) => c.id === activeCanvasId);
  const canvasName = currentCanvas?.name || '未命名画布';

  // 资产列表：只显示当前画布节点生成的资产
  const assetList = useMemo(() => {
    const canvasAssets: any[] = [];
    nodes.forEach((node) => {
      const n = (node.data as any)?.node as AINode | undefined;
      if (!n) return;
      // 从节点的 result/thumbnail 提取资产
      if (n.result?.url) {
        canvasAssets.push({
          id: n.id + '-result',
          name: n.prompt?.slice(0, 30) || n.type || '生成结果',
          type: n.result?.type || 'image',
          path: n.result.url,
          thumbnail: n.thumbnail || n.result.url,
        });
      }
    });
    return canvasAssets;
  }, [nodes]);

  const handleNameBlur = () => {
    if (nameValue.trim() && activeCanvasId) {
      updateCanvasName(activeCanvasId, nameValue.trim());
    }
    setEditingName(false);
  };

  return (
    <>
      {/* 切换按钮：独立于侧边栏容器，始终可见 */}
      <button className={`sidebar-toggle ${collapsed ? 'collapsed' : ''}`} onClick={onToggle} title={collapsed ? '展开侧边栏' : '收起侧边栏'}>
        {collapsed ? (
          <span className="toggle-arrow"><SvgIcon name="chevron-left" size={16} /></span>
        ) : (
          <span className="toggle-arrow"><SvgIcon name="chevron-right" size={16} /></span>
        )}
      </button>
      {/* 侧边栏面板 */}
      <div className={`canvas-sidebar ${collapsed ? 'collapsed' : ''}`}>

      {/* 画布名称 */}
      <div className="sidebar-header">
        <img src={logoBase64} alt="艺镜AI" className="sidebar-logo" />
        {editingName ? (
          <input
            className="sidebar-canvas-name"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={handleNameBlur}
            onKeyDown={e => { if (e.key === 'Enter') handleNameBlur(); if (e.key === 'Escape') setEditingName(false); }}
            autoFocus
          />
        ) : (
          <span
            className="sidebar-canvas-name"
            onClick={() => { setNameValue(canvasName); setEditingName(true); }}
            title="点击重命名"
          >{canvasName}</span>
        )}
      </div>

      {/* Tab 切换：节点 / 资产 */}
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => onTabChange('nodes')}>节点</button>
        <button className={`sidebar-tab ${activeTab === 'assets' ? 'active' : ''}`} onClick={() => onTabChange('assets')}>资产</button>
      </div>

      {/* 鍐呭鍖?*/}
      <div className="sidebar-body">
        {activeTab === 'nodes' && (
          nodes.length === 0 ? (
            <div className="sidebar-empty">当前画布没有内容</div>
          ) : (
            nodes.map(node => {
              const sourceNode = (node.data as any)?.node as AINode | undefined;
              const nodeKind = sourceNode?.type || (node.type as string);
              const tpl = NODE_TEMPLATES.find(t => t.type === nodeKind);
              return (
                <div key={node.id} className="node-list-item" onClick={() => onNodeClick(node.id)}>
                  <div className="node-list-icon"><SvgIcon name={tpl?.icon || 'box'} size={18} /></div>
                  <div className="node-list-info">
                    <div className="node-list-name">{getNodeDisplayName(sourceNode)}</div>
                  </div>
                  <button className="node-list-locate" onClick={(event) => { event.stopPropagation(); onNodeClick(node.id); }} title="定位到节点">
                    <SvgIcon name="chevron-right" size={14} />
                  </button>
                </div>
              );
            })
          )
        )}

        {activeTab === 'assets' && (
          assetList.length === 0 ? (
            <div className="sidebar-empty">当前没有资产</div>
          ) : (
            <div className="asset-grid">
              {assetList.map((asset: any) => (
                <div key={asset.id} className="asset-card" onClick={() => onAssetSelect({ id: asset.id, name: asset.name, type: asset.type, path: asset.path || '' })}>
                  <div className="asset-card-thumb">
                    {(asset as any).thumbnail || (asset as any).path ? (
                      <img src={(asset as any).thumbnail || (asset as any).path} alt={asset.name} />
                    ) : (
                      <span className="asset-card-icon"><SvgIcon name={iconForType(asset.type)} size={28} /></span>
                    )}
                  </div>
                  <div className="asset-card-name">{asset.name}</div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 底部统计 */}
      <div className="sidebar-footer">
        <span>{canvasName}</span>
        <span>共 {activeTab === 'nodes' ? nodes.length : assetList.length} {activeTab === 'nodes' ? '节点' : '项'}</span>
      </div>
    </div>
    </>
  );
}

export const Canvas: React.FC<CanvasProps> = props => (
  <ReactFlowProvider>
    <CanvasInner {...props} />
  </ReactFlowProvider>
);


