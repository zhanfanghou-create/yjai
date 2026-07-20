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
import './VideoParamBar.css';

// ==================== 鑺傜偣妯℃澘锛圠iblibTV 椋庢牸锛?====================

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

// 灏嗚緭鍏ユ枃鏈腑鐨?@鍙傝€冨浘鍚?楂樹寒锛氬彧鏈夊尮閰嶅埌銆屽凡鐭ュ弬鑰冨浘鍚嶇О銆嶆墠鍔犺儗鏅壊锛?// 鍙傝€冨浘鍚嶇О鍚庨潰鐢ㄦ埛杈撳叆鐨勬枃瀛椾細鑷姩鍒嗛殧寮€锛屼笉鍐嶆湁鑳屾櫙鑹层€?const renderMentionSegments = (text: string, knownNames: string[] = []): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  // 浠呴珮浜凡鐭ュ弬鑰冨浘鍚嶇О锛氭寜闀垮害闄嶅簭鍖归厤锛岄伩鍏嶇煭鍚嶆姠鍗犻暱鍚嶅墠缂€
  const sortedNames = [...knownNames].filter(Boolean).sort((a, b) => b.length - a.length);
  let i = 0;
  let buffer = '';
  const flushBuffer = () => {
    if (buffer) {
      nodes.push(<span key={`t${key++}`}>{buffer}</span>);
      buffer = '';
    }
  };
  while (i < text.length) {
    if (text[i] === '@') {
      let matchedName: string | null = null;
      for (const name of sortedNames) {
        if (text.startsWith(`@${name}`, i)) { matchedName = name; break; }
      }
      if (matchedName) {
        flushBuffer();
        // 楂樹寒灞傛枃鏈繀椤讳笌 textarea 鍐呭閫愬瓧涓€鑷达紝鍚﹀垯鍏夋爣浣嶇疆涓庡彲瑙佹枃瀛椾細閿欎綅锛涘洜姝や笉鎴柇鍚嶇О
        nodes.push(
          <span key={`m${key++}`} className="mention-chip" title={matchedName}>@{matchedName}</span>
        );
        i += matchedName.length + 1;
        continue;
      }
    }
    buffer += text[i];
    i += 1;
  }
  flushBuffer();
  // 鏈熬杩藉姞鎹㈣鍗犱綅锛屼繚璇?backdrop 楂樺害涓?textarea 涓€鑷?  nodes.push(<span key="tail">{'\u200b'}</span>);
  return nodes;
};

// 甯?@鎻愬強楂樹寒鐨勬枃鏈緭鍏ワ細閫忔槑鏂囨湰 textarea + 鑳屽悗 backdrop 娓叉煋楂樹寒
const MentionTextarea = React.forwardRef<HTMLTextAreaElement, {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPointerDown?: (event: React.PointerEvent<HTMLTextAreaElement>) => void;
  onMouseDown?: (event: React.MouseEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  mentionNames?: string[];
}>((props, ref) => {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const setRefs = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof ref === 'function') ref(el);
    else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
  };
  const syncScroll = () => {
    if (backdropRef.current && innerRef.current) {
      backdropRef.current.scrollTop = innerRef.current.scrollTop;
      backdropRef.current.scrollLeft = innerRef.current.scrollLeft;
    }
  };
  return (
    <div className="mention-textarea-wrap">
      <div ref={backdropRef} className="mention-textarea-backdrop" aria-hidden="true">
        {renderMentionSegments(props.value, props.mentionNames)}
      </div>
      <textarea
        ref={setRefs}
        className={`mention-textarea-input ${props.className || ''}`}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onScroll={syncScroll}
        onKeyDown={props.onKeyDown}
        onPointerDown={props.onPointerDown}
        onMouseDown={props.onMouseDown}
        placeholder={props.placeholder}
        rows={props.rows}
        spellCheck={false}
      />
    </div>
  );
});

// 3D 瀵兼紨鍙伴粯璁ゅ満鏅缉鐣ュ浘锛氶€忚缃戞牸鍦伴潰 + 浜虹墿 + 鎽勫奖鏈猴紝鐢诲竷涓婁竴鐪煎彲杈ㄨ瘑
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

// 鍏ㄦ櫙鍥鹃粯璁ゅ満鏅缉鐣ュ浘锛?20掳 鐞冮潰缁忕含缃戞牸 + 涓績鐑偣
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

// 浠庤棰戝湴鍧€鎻愬彇绗竴甯т綔涓虹缉鐣ュ浘锛堢敤浜庡弬鑰冨浘缂╃暐鍥炬樉绀猴紝閬垮厤璇诲彇涓嶅埌缂╃暐鍥撅級
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
        // 璺冲埌棣栧抚绋嶅悗浣嶇疆锛岀‘淇濇湁鐢婚潰
        try { video.currentTime = Math.min(0.1, (video.duration || 1) / 2); } catch { drawFrame(); }
      };
      video.onseeked = drawFrame;
      video.onerror = () => { cleanup(); reject(new Error('video load error')); };
      // 鍏滃簳锛氳秴鏃跺悗鐩存帴灏濊瘯缁樺埗褰撳墠甯?      window.setTimeout(() => { if (video.readyState >= 2) drawFrame(); }, 2500);
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
  { type: 'story-script',    label: '鏂囨湰',       icon: 'text', color: '#e0e0e0', desc: '鍓ф湰銆佸箍鍛婅瘝銆佸搧鐗屾枃妗? },
  { type: 'text-to-image',   label: '鍥剧墖',       icon: 'image', color: '#00D4FF', desc: '娴锋姤銆佸垎闀溿€佽鑹茶璁? },
  { type: 'text-to-video',   label: '瑙嗛',       icon: 'video', color: '#8b5cf6', desc: '鍒涙剰骞垮憡銆佸姩鐢汇€佺數褰? },
  { type: 'director-stage',  label: '3D瀵兼紨鍙?,     icon: 'stage', color: '#10b981', desc: '鎼缓3D鍦烘櫙锛屾埅鍥句綔涓烘瀯鍥惧弬鑰? },
  { type: 'panorama',        label: '鍏ㄦ櫙鍥?,       icon: 'panorama', color: '#f59e0b', desc: '鐢熸垚720掳鍏ㄦ櫙鍦烘櫙锛岀偣鍑昏繘鍏ュ叏鏅极娓? },
  { type: 'audio2video',     label: '闊抽',       icon: 'audio', color: '#ec4899', desc: '闊虫晥銆侀厤闊炽€侀煶涔? },
];

// 鑺傜偣鍒嗙被
const NODE_BASE_NAMES: Partial<Record<AINodeType, string>> = {
  'story-script': '鏂囨湰鑺傜偣',
  'story-script-adv': '鑴氭湰鑺傜偣',
  'text-to-image': '鍥剧墖鑺傜偣',
  'image-to-image': '鍥剧墖鑺傜偣',
  'image-upscale': '鍥剧墖鏀惧ぇ鑺傜偣',
  'text-to-video': '瑙嗛鑺傜偣',
  'image-to-video': '鍥剧敓瑙嗛鑺傜偣',
  'img2video': '鍥剧敓瑙嗛鑺傜偣',
  'frame-to-video': '鍥剧敓瑙嗛鑺傜偣',
  'video-composite': '瑙嗛鍚堟垚鑺傜偣',
  'video-extend': '瑙嗛寤堕暱鑺傜偣',
  'video-remix': '瑙嗛閲嶇粯鑺傜偣',
  'video-super-resolution': '瑙嗛瓒呭垎鑺傜偣',
  'video-to-music': '瑙嗛閰嶄箰鑺傜偣',
  'video-interpolate': '瑙嗛鎻掑抚鑺傜偣',
  'video-realtime': '瀹炴椂瑙嗛鑺傜偣',
  'audio2video': '闊抽鑺傜偣',
  'tts': '璇煶鑺傜偣',
  'audio-to-text': '杞啓鑺傜偣',
  'lip-sync': '瀵瑰彛鍨嬭妭鐐?,
  'live-portrait': '鑲栧儚鍔ㄦ晥鑺傜偣',
  'subtitle': '瀛楀箷鑺傜偣',
  'director-stage': '瀵兼紨鍙拌妭鐐?,
  'material-lib': '绱犳潗鑺傜偣',
  'result': '缁撴灉鑺傜偣',
};

const getNodeBaseName = (type?: AINodeType) => {
  if (!type) return '鑺傜偣';
  return NODE_BASE_NAMES[type] || `${NODE_TEMPLATES.find(t => t.type === type)?.label || '鑺傜偣'}鑺傜偣`;
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
  { id: 'text-to-video', label: '鏂囩敓瑙嗛', icon: 'video', placeholder: '鏍规嵁鏂囧瓧鎻忚堪鐢熸垚瑙嗛銆? },
  { id: 'reference', label: '鍏ㄨ兘鍙傝€?, icon: 'spark', placeholder: '濉啓鍙傝€冭姹傘€侀鏍笺€侀暅澶存垨绾︽潫銆? },
  { id: 'image-to-video', label: '鍥剧敓瑙嗛', icon: 'image', placeholder: '涓婁紶鎴栭€夋嫨鍙傝€冨浘锛岀敓鎴愯棰戙€? },
  { id: 'first-frame', label: '棣栧熬甯?, icon: 'cut', placeholder: '鎻忚堪棣栧抚銆佸熬甯у拰杩囨浮鏁堟灉銆? },
  { id: 'image-reference', label: '鍥剧墖鍙傝€?, icon: 'image', placeholder: '娣诲姞鍥剧墖鍙傝€冭鏄庛€? },
  { id: 'marker', label: '鏍囪', icon: 'grid', placeholder: '鏍囪闇€瑕佸己璋冩垨閬垮厤鐨勫唴瀹广€? },
  { id: 'reference-extra', label: '鍙傝€?, icon: 'cursor', placeholder: '鐐瑰嚮鐢诲竷鍥剧墖鑺傜偣閫夋嫨鍙傝€冨浘銆? },
  { id: 'asset', label: '璧勪骇', icon: 'box', placeholder: '浠庤祫浜у簱閫夋嫨鍙傝€冨浘銆? },
];

const IMAGE_INPUT_FEATURES: { id: string; label: string; icon: CanvasIconName; placeholder: string }[] = [
  { id: 'text-to-image', label: '鏂囩敓鍥?, icon: 'image', placeholder: '杈撳叆鏂囧瓧鐢熸垚鍥剧墖锛屾垨涓婁紶鍥剧墖鍚庣紪杈戙€? },
  { id: 'image-upscale', label: '鍥剧墖楂樻竻', icon: 'spark', placeholder: '鎻忚堪鍥剧墖楂樻竻銆佹斁澶с€佺粏鑺傚寮鸿姹傘€? },
  { id: 'marker', label: '鏍囪', icon: 'grid', placeholder: '鍦ㄥ弬鑰冨浘涓婃爣鏁板瓧锛屼篃鍙互鐢昏繍闀滅嚎銆? },
  { id: 'reference-extra', label: '鍙傝€?, icon: 'cursor', placeholder: '鐐瑰嚮鐢诲竷鍥剧墖鑺傜偣閫夋嫨鍙傝€冨浘銆? },
  { id: 'upload', label: '涓婁紶鍙傝€冨浘', icon: 'upload', placeholder: '涓婁紶鍙傝€冨浘銆? },
  { id: 'asset', label: '璧勪骇', icon: 'box', placeholder: '浠庤祫浜у簱閫夋嫨鍙傝€冨浘銆? },
];

const IMAGE_QUALITY_OPTIONS = [
  { id: 'low', label: '浣庣敾璐? },
  { id: 'standard', label: '鏍囧噯鐢昏川' },
  { id: 'high', label: '楂樼敾璐? },
];

const IMAGE_CLARITY_OPTIONS = ['1K', '2K', '4K'];

const IMAGE_RATIO_OPTIONS = [
  { id: 'auto', label: '鑷€傚簲', wide: false },
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
  { id: 'reference', label: '鍏ㄦ櫙', icon: 'spark' as CanvasIconName, prompt: '浠ュ綋鍓嶅浘鐗囦负鍏ㄦ櫙鍙傝€冿紝淇濇寔鐢婚潰涓讳綋鍜屾暣浣撴瀯鍥俱€?, badge: 'NEW' },
  { id: 'multi-angle', label: '澶氳搴?, icon: 'swap' as CanvasIconName, prompt: '浠ュ綋鍓嶅浘鐗囦负涓讳綋锛岀敓鎴愬涓笉鍚岃瑙掑拰闀滃ご瑙掑害銆? },
  { id: 'lighting', label: '鎵撳厜', icon: 'star' as CanvasIconName, prompt: '浠ュ綋鍓嶅浘鐗囦负鍩虹锛屼紭鍖栧厜褰便€佹墦鍏夊眰娆″拰姘涘洿銆? },
  { id: 'nine-grid', label: '涔濆鏍?, icon: 'grid' as CanvasIconName, prompt: '浠ュ綋鍓嶅浘鐗囦负鍩虹锛岀敓鎴愪節瀹牸鏋勫浘鎴栦節瀹牸鍒嗛暅銆? },
  { id: 'upscale', label: '楂樻竻', icon: 'spark' as CanvasIconName, prompt: '浠ュ綋鍓嶅浘鐗囦负鍩虹锛屾彁鍗囨竻鏅板害銆佺粏鑺傚拰鐢昏川銆? },
  { id: 'split', label: '瀹牸鍒囧垎', icon: 'cut' as CanvasIconName, prompt: '灏嗗綋鍓嶅浘鐗囨寜瀹牸鍒囧垎锛屼繚鎸佹瘡鏍煎唴瀹瑰畬鏁村彲鐢ㄣ€? },
] as const;

const TOOLBAR_SPLIT_OPTIONS = [
  { id: '2x2', label: '4瀹牸 (2脳2)', grid: 4 },
  { id: '3x3', label: '9瀹牸 (3脳3)', grid: 9 },
  { id: '4x4', label: '16瀹牸 (4脳4)', grid: 16 },
  { id: '5x5', label: '25瀹牸 (5脳5)', grid: 25 },
] as const;

const HD_FEATURES = [
  { id: 'upscale', label: '楂樻竻', icon: 'spark' as CanvasIconName, generationType: 'image-upscale', prompt: '浠ュ綋鍓嶅浘鐗囦负鍩虹杩涜楂樻竻澧炲己锛屾彁鍗囨竻鏅板害銆佺粏鑺傘€侀攼搴﹀拰鏁翠綋鐢昏川锛屼繚鎸佸師鍥惧唴瀹逛笉鍙樸€? },
  { id: 'outpaint', label: '鎵╁浘', icon: 'canvas' as CanvasIconName, generationType: 'image-to-image', prompt: '浠ュ綋鍓嶅浘鐗囦负涓績杩涜鎵╁浘锛岃ˉ榻愮敾闈㈠寤跺唴瀹癸紝淇濇寔鏋勫浘銆佸厜褰便€侀鏍煎拰涓讳綋涓€鑷淬€? },
  { id: 'redraw', label: '閲嶇粯', icon: 'swap' as CanvasIconName, generationType: 'image-to-image', prompt: '浠ュ綋鍓嶅浘鐗囦负鍙傝€冭繘琛屽眬閮ㄦ垨鏁翠綋閲嶇粯锛屼紭鍖栫憰鐤靛拰缁嗚妭锛屼繚鎸佷富浣撹韩浠姐€佸竷灞€鍜岄鏍间竴鑷淬€? },
  { id: 'erase', label: '鎿﹂櫎', icon: 'close' as CanvasIconName, generationType: 'image-to-image', prompt: '浠ュ綋鍓嶅浘鐗囦负鍙傝€冩墽琛屾摝闄や慨澶嶏紝绉婚櫎鎸囧畾鐟曠柕鎴栦笉闇€瑕佺殑鍏冪礌锛屽苟鑷劧琛ュ叏鑳屾櫙銆? },
  { id: 'cutout', label: '鎶犲浘', icon: 'cut' as CanvasIconName, generationType: 'image-to-image', prompt: '璇嗗埆褰撳墠鍥剧墖涓讳綋骞惰繘琛岀簿缁嗘姞鍥撅紝淇濈暀涓讳綋瀹屾暣杈圭紭锛岃緭鍑哄彲鐢ㄤ簬鍚庣画鍚堟垚鐨勫共鍑€缁撴灉銆? },
  { id: 'crop', label: '瑁佸壀', icon: 'box' as CanvasIconName, generationType: 'image-to-image', prompt: '鏍规嵁褰撳墠鍥剧墖杩涜鏅鸿兘瑁佸壀锛屼繚鐣欎富浣撳拰鍏抽敭鏋勫浘锛岃緭鍑烘洿鍚堥€傜殑鐢婚潰鑼冨洿銆? },
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
  { id: 'storyboard', title: '鍒嗛暅鍙欎簨' },
  { id: 'style', title: '璐ㄦ劅璋冭妭' },
  { id: 'setting', title: '璁惧畾鍥? },
];

const PANORAMA_FEATURES: PanoramaFeatureItem[] = [
  { id: 'speed-storyboard', column: 'storyboard', label: '璋冨害鏁呬簨鏉?, icon: 'stage', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚璋冨害鏁呬簨鏉匡紝淇濇寔鍦烘櫙绌洪棿鍏崇郴鍜岄暅澶村姩绾裤€? },
  { id: 'storyboard', column: 'storyboard', label: '鏁呬簨鏉?, icon: 'stage', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚鏁呬簨鏉垮垎闀滐紝琛ラ綈闀滃ご璇存槑銆佹瀯鍥惧拰杞満銆? },
  { id: 'continuity-25', column: 'storyboard', label: '25瀹牸杩炶疮鍒嗛暅', icon: 'grid', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚25瀹牸杩炶疮鍒嗛暅锛屼繚鎸佽鑹层€佸満鏅拰鍔ㄤ綔杩炵画銆? },
  { id: 'drama-quad', column: 'storyboard', label: '鍓ф儏鎺ㄦ紨鍥涘鏍?, icon: 'grid', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚鍥涘鏍煎墽鎯呮帹婕旓紝灞曠ず鍓嶅悗鎯呰妭鍙樺寲銆? },
  { id: 'after-3s', column: 'storyboard', label: '鐢婚潰鎺ㄦ紨 - 3绉掑悗', icon: 'history', prompt: '鍩轰簬鍙傝€冨浘鎺ㄦ紨3绉掑悗鐨勭敾闈㈢姸鎬侊紝淇濇寔閫昏緫杩炵画銆? },
  { id: 'before-5s', column: 'storyboard', label: '鐢婚潰鎺ㄦ紨 - 5绉掑墠', icon: 'history', prompt: '鍩轰簬鍙傝€冨浘鍙嶆帹5绉掑墠鐨勭敾闈㈢姸鎬侊紝淇濇寔鍙欎簨鍚堢悊銆? },
  { id: 'cinematic-light', column: 'style', label: '鐢靛奖绾у厜褰辨牎姝?, icon: 'spark', prompt: '瀵瑰弬鑰冨浘杩涜鐢靛奖绾у厜褰辨牎姝ｏ紝澧炲己灞傛銆佹皼鍥村拰璐ㄦ劅銆? },
  { id: 'panorama-720', column: 'style', label: '720鍏ㄦ櫙', desc: '鐢熸垚鍏ㄦ櫙鍦烘櫙鍥?, icon: 'spark', prompt: '720掳鍏ㄦ櫙鍥撅細璇蜂互鍙傝€冨浘涓哄満鏅富浣擄紝鐢熸垚鍙敤浜庡叏鏅瑙堢殑 equirectangular panoramic image锛屽乏鍙宠竟缂樻棤缂濊鎺ワ紝2:1 妯悜姣斾緥锛屾棤榛戣竟銆?, generationType: 'image-to-image' },
  { id: 'multi-camera-grid', column: 'style', label: '澶氭満浣嶄節瀹牸', icon: 'grid', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚澶氭満浣嶄節瀹牸锛屽睍绀轰笉鍚岄暅澶磋窛绂汇€佽搴﹀拰鏋勫浘銆? },
  { id: 'character-face-3view', column: 'setting', label: '瑙掕壊鑴搁儴涓夎鍥?, icon: 'swap', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊鑴搁儴涓夎鍥撅紝淇濇寔浜斿畼鍜岄鏍间竴鑷淬€? },
  { id: 'character-setting', column: 'setting', label: '瑙掕壊璁惧畾鍥?, icon: 'mic', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊璁惧畾鍥撅紝鍖呭惈姝ｉ潰銆佷晶闈㈠拰鍏抽敭鐗瑰緛璇存槑銆? },
  { id: 'character-3view', column: 'setting', label: '瑙掕壊涓夎鍥?, icon: 'box', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊涓夎鍥撅紝淇濇寔鏈嶈銆佹瘮渚嬪拰閫犲瀷涓€鑷淬€? },
  { id: 'scene-setting', column: 'setting', label: '鍦烘櫙璁惧畾鍥?, icon: 'stage', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚鍦烘櫙璁惧畾鍥撅紝琛ラ綈绌洪棿缁撴瀯銆佹潗璐ㄥ拰鍏夌収璇存槑銆? },
  { id: 'product-setting', column: 'setting', label: '浜у搧璁惧畾鍥?, icon: 'box', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚浜у搧璁惧畾鍥撅紝灞曠ず缁撴瀯銆佹潗璐ㄥ拰鍏抽敭鍗栫偣銆? },
];

const MULTI_ANGLE_FEATURES = [
  { id: 'front', label: '姝ｉ潰瑙嗚', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚涓讳綋姝ｉ潰瑙嗚锛屼繚鎸佽韩浠姐€侀鏍煎拰鏉愯川涓€鑷淬€? },
  { id: 'side', label: '渚ч潰瑙嗚', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚涓讳綋渚ч潰瑙嗚锛屼繚鎸佹瘮渚嬪拰鍏抽敭鐗瑰緛涓€鑷淬€? },
  { id: 'back', label: '鑳岄潰瑙嗚', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚涓讳綋鑳岄潰瑙嗚锛岃ˉ榻愬悎鐞嗚儗闈㈢粏鑺傘€? },
  { id: 'top', label: '淇瑙嗚', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚淇瑙嗚锛屼繚鎸佺┖闂村叧绯诲拰涓讳綋浣嶇疆鍚堢悊銆? },
  { id: 'low', label: '浣庢満浣嶈瑙?, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚浣庢満浣嶈瑙掞紝澧炲己閫忚鍜岀敾闈㈠紶鍔涖€? },
  { id: 'nine-grid', label: '澶氳搴︿節瀹牸', prompt: '鍩轰簬鍙傝€冨浘鐢熸垚涔濆鏍煎瑙掑害瑙嗗浘锛屽寘鍚闈€佷晶闈€佽儗闈€佷刊瑙嗐€佷綆鏈轰綅绛夎瑙掋€? },
];

const GRID_FEATURES = [
  { id: 'multi-camera-grid', label: '澶氭満浣嶄節瀹牸', icon: 'grid' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚澶氭満浣嶄節瀹牸锛屽睍绀鸿繙鏅€佷腑鏅€佽繎鏅€佷刊瑙嗐€佷话瑙嗐€佷晶闈㈢瓑澶氱鏈轰綅銆? },
  { id: 'drama-quad', label: '鍓ф儏鎺ㄦ紨鍥涘鏍?, icon: 'grid' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚鍓ф儏鎺ㄦ紨鍥涘鏍硷紝灞曠ず浜嬩欢鍙戠敓鍓嶃€佸彂鐢熶腑銆佸彉鍖栧悗鍜岀粨鏋滅敾闈€? },
  { id: 'character-face-3view', label: '瑙掕壊鑴搁儴涓夎鍥?, icon: 'swap' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊鑴搁儴涓夎鍥撅紝鍖呭惈姝ｉ潰銆佷晶闈€佸崐渚ч潰锛屼繚鎸佷簲瀹樹竴鑷淬€? },
  { id: 'character-setting', label: '瑙掕壊璁惧畾鍥?, icon: 'mic' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊璁惧畾鍥撅紝鍖呭惈閫犲瀷銆佹湇瑁呫€佸叧閿壒寰佸拰椋庢牸璇存槑銆? },
  { id: 'scene-setting', label: '鍦烘櫙璁惧畾鍥?, icon: 'stage' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚鍦烘櫙璁惧畾鍥撅紝琛ラ綈绌洪棿缁撴瀯銆佹潗璐ㄣ€佸厜鐓у拰鍏抽敭鐗╀欢銆? },
  { id: 'product-setting', label: '浜у搧璁惧畾鍥?, icon: 'box' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚浜у搧璁惧畾鍥撅紝灞曠ず姝ｄ晶鑳岀粨鏋勩€佹潗璐ㄧ粏鑺傚拰鍗栫偣銆? },
  { id: 'continuity-25', label: '25瀹牸杩炶疮鍒嗛暅', icon: 'grid' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚25瀹牸杩炶疮鍒嗛暅锛屼繚鎸佽鑹层€佸姩浣溿€佸満鏅拰鏃堕棿绾胯繛缁€? },
  { id: 'cinematic-light', label: '鐢靛奖绾у厜褰辨牎姝?, icon: 'spark' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘杩涜鐢靛奖绾у厜褰辨牎姝ｏ紝澧炲己灞傛銆佹皼鍥淬€佷綋绉厜鍜岃川鎰熴€? },
  { id: 'character-3view', label: '瑙掕壊涓夎鍥?, icon: 'box' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鐢熸垚瑙掕壊涓夎鍥撅紝鍖呭惈姝ｉ潰銆佷晶闈€佽儗闈紝淇濇寔姣斾緥鍜屾湇瑁呬竴鑷淬€? },
  { id: 'after-3s', label: '鐢婚潰鎺ㄦ紨 - 3绉掑悗', icon: 'history' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鎺ㄦ紨3绉掑悗鐨勭敾闈紝淇濇寔闀滃ご杩愬姩鍜屾晠浜嬮€昏緫杩炵画銆? },
  { id: 'before-5s', label: '鐢婚潰鎺ㄦ紨 - 5绉掑墠', icon: 'history' as CanvasIconName, prompt: '鍩轰簬鍙傝€冨浘鍙嶆帹5绉掑墠鐨勭敾闈紝淇濇寔瑙掕壊浣嶇疆鍜屽満鏅€昏緫鍚堢悊銆? },
];

const LIGHT_DIRECTIONS = [
  { id: 'left', label: '宸︿晶' },
  { id: 'top', label: '椤堕儴' },
  { id: 'right', label: '鍙充晶' },
  { id: 'front', label: '鍓嶆柟' },
  { id: 'bottom', label: '搴曢儴' },
  { id: 'back', label: '鍚庢柟' },
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
  const directionLabel = LIGHT_DIRECTIONS.find(item => item.id === direction)?.label || '姝ｉ潰';
  const settings: LightingSettings = { view, global, smart, brightness, color, direction, rim };

  return (
    <div ref={panelRef} className="lighting-panel nodrag nowheel" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div className="lighting-panel-head">
        <strong>鎵撳厜鏁堟灉</strong>
        <button onClick={onClose}><SvgIcon name="close" size={14} /></button>
      </div>
      <div className="lighting-panel-body">
        <div className="lighting-preview-card" data-view={view} data-direction={direction} data-global={global} data-smart={smart} data-rim={rim}>
          <div className="lighting-view-tabs">
            <button className={view === 'perspective' ? 'active' : ''} onClick={() => setView('perspective')}>閫忚</button>
            <button className={view === 'front' ? 'active' : ''} onClick={() => setView('front')}>姝ｉ潰</button>
          </div>
          <div className="lighting-orbit" style={{ '--lighting-color': color, '--lighting-strength': `${Math.max(20, brightness)}%` } as React.CSSProperties}>
            <div className="lighting-sphere" />
            <div className={`lighting-beam ${direction}`} />
            {rim && <div className="lighting-rim" />}
            <div className={`lighting-source-dot ${direction}`} />
            <div className="lighting-subject" />
          </div>
          <div className="lighting-preview-meta"><span>{view === 'perspective' ? '閫忚棰勮' : '姝ｉ潰棰勮'}</span><em>{directionLabel} ? {brightness}%</em></div>
        </div>
        <div className="lighting-controls">
          <div className="lighting-toggle-row">
            <label className="lighting-toggle-card"><span>鍏ㄥ眬</span><label className="lighting-switch"><input type="checkbox" checked={global} onChange={(event) => setGlobal(event.target.checked)} /><i /></label></label>
            <label className="lighting-toggle-card"><span>鏅鸿兘妯″紡</span><label className="lighting-switch"><input type="checkbox" checked={smart} onChange={(event) => setSmart(event.target.checked)} /><i /></label></label>
          </div>
          <label className="lighting-row"><span>浜害</span><input type="range" min="0" max="100" value={brightness} onChange={(event) => setBrightness(Number(event.target.value))} /><em>{brightness}%</em></label>
          <label className="lighting-row"><span>棰滆壊</span><input className="lighting-color" type="color" value={color} onChange={(event) => setColor(event.target.value)} /><em>{color.toUpperCase()}</em></label>
          <div className="lighting-label">涓诲厜婧?/div>
          <div className="lighting-direction-grid">
            {LIGHT_DIRECTIONS.map(item => <button key={item.id} className={direction === item.id ? 'active' : ''} onClick={() => setDirection(item.id)}>{item.label}</button>)}
          </div>
          <label className="lighting-toggle-card full"><span>杞粨鍏?/span><label className="lighting-switch"><input type="checkbox" checked={rim} onChange={(event) => setRim(event.target.checked)} /><i /></label></label>
          <div className="lighting-summary">褰撳墠浣跨敤{global ? '鍏ㄥ眬' : '灞€閮?}{smart ? '鏅鸿兘' : '鎵嬪姩'}鎵撳厜锛屼富鍏夋簮鏉ヨ嚜{directionLabel}锛屼寒搴︿负{brightness}%銆?/div>
        </div>
      </div>
      <div className="lighting-panel-foot">
        <button className="lighting-reset" onClick={() => { setView('perspective'); setGlobal(true); setSmart(false); setBrightness(50); setColor('#ffffff'); setDirection('front'); setRim(false); }}>閲嶇疆鍙傛暟</button>
        <button className="lighting-apply" onClick={() => onApply(settings)}><SvgIcon name="play" size={14} />搴旂敤鎵撳厜</button>
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
      <div className="multi-angle-panel-title">澶氳搴︾敓鎴?/div>
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
          <button className="node-marker-editor-back" onClick={onClose}><SvgIcon name="chevron-left" size={15} /><strong>鏍囨敞</strong></button>
          <span className="node-marker-editor-divider" />
          <button className={tool === 'pin' ? 'active' : ''} title="鏁板瓧鏍囪" onClick={() => setTool('pin')}><SvgIcon name="pin" size={17} /></button>
          <button className={tool === 'pen' ? 'active' : ''} title="鑷敱缁樼敾" onClick={() => setTool('pen')}><SvgIcon name="pen" size={17} /></button>
          <button className={tool === 'rect' ? 'active' : ''} title="妗嗛€? onClick={() => setTool('rect')}><SvgIcon name="rect" size={17} /></button>
          <button className={tool === 'text' ? 'active' : ''} title="鏂囧瓧" onClick={() => setTool('text')}><SvgIcon name="type" size={17} /></button>
          <span className="node-marker-editor-divider" />
          <label className="node-marker-color" title="棰滆壊"><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><i style={{ background: color }} /></label>
          <label className="node-marker-size" title="绗旇Е绮楃粏"><SvgIcon name="pen" size={15} /><input type="range" min="1" max="18" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
          <span className="node-marker-editor-divider" />
          <button title="鎾ら攢" disabled={historyIndex <= 0} onClick={() => restoreHistory(historyIndex - 1)}><SvgIcon name="undo" size={16} /></button>
          <button title="閲嶅仛" disabled={historyIndex >= history.length - 1} onClick={() => restoreHistory(historyIndex + 1)}><SvgIcon name="redo" size={16} /></button>
          <button title="娓呯┖" onClick={clearMarks}><SvgIcon name="trash" size={16} /></button>
          <button className="node-marker-save" onClick={save}>淇濆瓨</button>
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
        <button key={option.id} onClick={() => onSelect(option)} title={`灏嗗浘鐗囧垏鍒嗕负${option.label}`}>
          <span>{option.label}</span>
        </button>
      ))}
      <div className="split-feature-separator" />
      <button className="split-feature-custom" onClick={onCustom} title="鑷畾涔夊鏍煎垏鍒?>
        <span>鑷畾涔?/span>
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
          onCustom={() => { const custom = window.prompt('璇疯緭鍏ュ鏍煎垏鍒嗘暟閲忥紝渚嬪 6x6'); if (custom) { setSplit(custom); onSplitFeature({ id: custom, label: `鑷畾涔?${custom}`, custom: true }); } setOpenMenu(null); }}
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
        <button title="閲嶆柊鐢熸垚锛堟墦寮€杈撳叆妗嗕慨鏀瑰悗鍐嶆鎻愪氦锛? onClick={onEditInputs}><SvgIcon name="canvas" size={15} /></button>
        <button title="鏍囨敞 / 杩愰暅绾? onClick={onMark}><SvgIcon name="pin" size={15} /></button>
        <button title="浣滀负鍙傝€? onClick={() => onApply('reference-extra')}><SvgIcon name="upload" size={15} /></button>
        <button title="涓嬭浇" onClick={onDownload}><SvgIcon name="save" size={15} /></button>
        <button title="鍏ㄥ睆鏌ョ湅" onClick={onFullscreen}><SvgIcon name="chevron-right" size={15} /></button>
      </div>
    </div>
  );
}

// ==================== 鑺傜偣杈撳叆寮圭獥锛堢嫭绔嬪璇濇锛岃窡闅忚妭鐐癸級 ====================
function NodeInputPopover({ node, onClose, onSend, anchorRect, hasIncomingImageNode, forceOmniReference, incomingImageCount = 0 }: { node: AINode; onClose: () => void; onSend: (prompt: string, files?: File[], params?: any) => void; anchorRect?: DOMRect | null; hasIncomingImageNode?: boolean; forceOmniReference?: boolean; incomingImageCount?: number }) {
  const [prompt, setPrompt] = useState(node.prompt || '');
  const isImageInputNode = IMAGE_INPUT_NODE_TYPES.includes(node.type);
  // 鍥剧墖绫昏妭鐐癸紙鍚節瀹牸/鍥涘鏍肩瓑 image-to-image銆乮mage-upscale锛夎櫧鐒朵篃鍦?VIDEO_INPUT_NODE_TYPES 涓紝
  // 浣嗗畠浠殑杈撳嚭鏄浘鐗囷紝涓嶅簲鍑虹幇瑙嗛瑙勬牸鍙傛暟锛屽洜姝ゆ帓闄ゆ帀鍥剧墖杈撳叆鑺傜偣銆?  const isVideoInputNode = VIDEO_INPUT_NODE_TYPES.includes(node.type) && !isImageInputNode;
  const isMediaInputNode = isVideoInputNode || isImageInputNode;
  const isPanorama720Input = isImageInputNode && (node.options?.panoramaType === '720' || node.options?.mediaFeature === '720掳鍏ㄦ櫙鍥?);
  const mediaFeatures = isImageInputNode ? IMAGE_INPUT_FEATURES : VIDEO_INPUT_FEATURES;
  const defaultFeature = isImageInputNode ? 'text-to-image' : 'text-to-video';
  // 鍓嶉潰杩炵嚎瑙嗛涓鸿妭鐐规垨澶氭牸寮忕粍鍚堜綔涓哄弬鑰冩椂锛岃嚜鍔ㄥ己鍒跺彧鑳介€夋嫨鈥滃叏鑳藉弬鑰冣€濓紝鍏跺畠閫夐」鍙樼伆涓嶅彲閫?  const [activeFeature, setActiveFeature] = useState<string>(forceOmniReference ? 'reference' : (node.options?.generationType || (isMediaInputNode ? defaultFeature : '')));
  const [inputRows, setInputRows] = useState<Array<{ id: string; feature: string; text: string }>>(() => {
    const rows = node.options?.inputRows;
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return isMediaInputNode
      ? [{ id: `row-${Date.now()}`, feature: forceOmniReference ? 'reference' : (node.options?.generationType || defaultFeature), text: node.prompt || '' }]
      : [];
  });

  // 寮哄埗鍏ㄨ兘鍙傝€冿細杩涘叆寮圭獥锛堟垨涓婃父杩炵嚎鍙樺寲锛夋椂鑷姩鍒囨崲鍒?reference锛堝叏鑳藉弬鑰冿級
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

  // 瑙嗛鑺傜偣锛氫笂娓歌繛绾胯妭鐐归噷鏈夊浘鐗囨椂锛岃嚜鍔ㄥ垏鎹㈠埌銆屽浘鐢熻棰戙€嶏紱鏈変袱寮犲浘鐗囨椂鑷姩鍒囨崲鍒般€岄灏惧抚銆嶃€?  // 鍏ㄨ兘鍙傝€冪殑寮哄埗鏉′欢锛堣棰?澶氭牸寮忥級浼樺厛绾ф洿楂橈紝姝ゅ浠呭湪闈炲己鍒跺叏鑳藉弬鑰冩椂鐢熸晥銆?  useEffect(() => {
    // 鍙緷鎹笂娓搞€屽浘鐗囥€嶆暟閲忚嚜鍔ㄥ垏鎹細鏈夊浘鈫掑浘鐢熻棰戯紝涓ゅ紶鍥锯啋棣栧熬甯?    if (!isVideoInputNode || forceOmniReference || incomingImageCount < 1) return;
    const nextFeature = incomingImageCount >= 2 ? 'first-frame' : 'image-to-video';
    if (activeFeature === nextFeature) return;
    // 浠呭湪鍩虹瑙嗛鍔熻兘涔嬮棿鑷姩鍒囨崲锛堟枃鐢熻棰?鍥剧敓瑙嗛/棣栧熬甯э級锛屼笉瑕嗙洊鐢ㄦ埛宸查€夌殑楂樼骇鍔熻兘
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
    // 褰掍竴鍖?kind锛氬吋瀹逛粎鏈?type 瀛楁鐨勬棫鏁版嵁锛岀‘淇濊棰戝弬鑰冭蛋 video 鍒嗘敮鏄剧ず棣栧抚缂╃暐鍥?    return storedReferences.map((ref: any) => {
      const kind = ref.kind || (ref.type === 'video' ? 'video' : ref.type === 'audio' ? 'audio' : 'image');
      return { ...ref, kind };
    });
  });
  const [markerMode, setMarkerMode] = useState(false);
  // 瑙嗛鍙傝€冭嫢缂哄皯缂╃暐鍥撅紙渚嬪杩炵嚎鍚庢湭鍙婃椂鎶藉抚锛夛紝寮圭獥鎵撳紑鏃惰ˉ鎶介甯т綔涓虹缉鐣ュ浘
  useEffect(() => {
    referenceImages.forEach(ref => {
      if (ref.kind === 'video' && !ref.thumbnail && ref.url) {
        captureVideoFirstFrame(ref.url)
          .then(thumb => setReferenceImages(list => list.map(item => item.id === ref.id ? { ...item, thumbnail: thumb } : item)))
          .catch(() => { /* 鎶藉彇澶辫触淇濈暀 video 鍏滃簳 */ });
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
  // ===== 瑙嗛鍙傛暟鐘舵€?=====
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
          // 鍥剧墖锛氭坊鍔犱负鍙傝€冨浘 + 淇濆瓨鍒拌祫浜у簱
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            addReferenceImage(file.name, dataUrl, file);
            autoSaveMediaToAssets({ name: file.name, type: 'image', path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: node.id });
          };
          reader.readAsDataURL(file);
        } else if (isVideo) {
          // 瑙嗛锛氫繚瀛樺埌璧勪骇搴?          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = String(reader.result || '');
            autoSaveMediaToAssets({ name: file.name, type: 'video', path: dataUrl, size: file.size, sourceType: 'canvas', sourceId: node.id });
          };
          reader.readAsDataURL(file);
        } else if (isAudio) {
          // 闊抽锛氫繚瀛樺埌璧勪骇搴?          const reader = new FileReader();
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

  // 鍙傝€冨浘鍔犲叆杈撳叆妗嗘椂鑷姩 @鏂囦欢鍚嶏紙鑻ュ皻鏈彁鍙婏級
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
      // 瑙嗛鍙傝€冿細鍏堝姞鍏ュ垪琛紙缂╃暐鍥炬殏绌猴級锛岄殢鍚庡紓姝ユ姄鍙栭甯т綔涓虹缉鐣ュ浘锛岄伩鍏嶈鍙栦笉鍒扮缉鐣ュ浘
      if (kind === 'video') {
        captureVideoFirstFrame(url)
          .then(thumb => {
            setReferenceImages(list => list.map(item => item.id === refId ? { ...item, thumbnail: thumb } : item));
          })
          .catch(() => { /* 鎶撳彇澶辫触鏃朵繚鐣欒棰戞湰韬紝img 鏍囩鍏滃簳鏄剧ず */ });
      }
      return [...prev, { id: refId, name, url, file, kind, thumbnail: kind === 'image' ? url : undefined }];
    });
    // 娉ㄦ剰锛氫笉鍐嶈嚜鍔ㄥ悜杈撳叆妗嗘彃鍏?@鏂囦欢鍚嶃€?    // 鍙傝€冨浘鍚嶅瓧浠呭湪鐢ㄦ埛涓诲姩鐐瑰嚮鍙傝€冨浘缂╃暐鍥撅紝鎴栧湪杈撳叆妗嗘墜鍔ㄨ緭鍏?@ 鏃舵墠鍔犲叆銆?    void added;
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
      // 浠呮妸鍥剧墖鍔犲叆鍙傝€冨垪琛紝涓嶈嚜鍔ㄥ悜杈撳叆妗嗘彃鍏?@鏂囦欢鍚嶃€?      // 鐢ㄦ埛闇€瑕佸紩鐢ㄦ椂鍐嶇偣鍑诲弬鑰冨浘缂╃暐鍥撅紝鎴栧湪杈撳叆妗嗚緭鍏?@銆?      addReferenceImage(refName, detail.url, undefined, detail.kind || 'image');
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
    // 鏋勫缓鍩虹鎻愮ず璇?    let finalPrompt = isMediaInputNode
      ? composePromptParts(...inputRows.map(row => {
          const feature = mediaFeatures.find(item => item.id === row.feature);
          return row.text.trim() ? `${feature?.label || '杈撳叆'}锛?{row.text.trim()}` : undefined;
        }), referenceImages.length > 0 ? `鍙傝€冨浘锛?{referenceImages.map(img => `@${img.name}`).join(' ')}` : undefined, markers.length > 0 ? `鏍囪鐐癸細${markers.map(point => `${point.id}(${Math.round(point.x)}%,${Math.round(point.y)}%)`).join('锛?)}` : undefined, motionLines.length > 0 ? `杩愰暅绾匡細${motionLines.length} 鏉 : undefined)
      : prompt;

    // 瑙嗛鑺傜偣锛氳嚜鍔ㄨ拷鍔犺繍闀滄彁绀鸿瘝
    if (isVideoInputNode && selectedCameraMovement) {
      finalPrompt = finalPrompt.trim()
        ? `${finalPrompt}\n\n銆愯繍闀滆姹傘€?{selectedCameraMovement.promptZh}`
        : `銆愯繍闀滆姹傘€?{selectedCameraMovement.promptZh}`;
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
          // 瑙嗛鍙傛暟
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

    // 鏋勫缓鎻愪氦鍙傛暟锛堝寘鍚墍鏈夎棰戝弬鏁帮級
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

  // 妯″瀷閫夋嫨鍣?- 鏍规嵁鑺傜偣绫诲瀷閫夋嫨瀵瑰簲鐨?API 閰嶇疆
  const allAPIConfigs = useAppStore(state => state.apiConfigs || []);
  const imageAPIConfigs = useAppStore(state => state.imageAPIConfigs || []);
  const videoAPIConfigs = useAppStore(state => state.videoAPIConfigs || []);
  const voiceAPIConfigs = useAppStore(state => state.voiceAPIConfigs || []);
  const musicAPIConfigs = useAppStore(state => state.musicAPIConfigs || []);
  const comfyuiConfigs = useAppStore(state => state.comfyuiConfigs || []);
  const comfyWorkflowCache = useAppStore(state => state.comfyWorkflowCache || []);
  const recommendedConfigs = useAppStore(state => state.recommendedConfigs || []);
  const chatAPIConfigs = useAppStore(state => state.chatAPIConfigs || []);

  // 宸ュ叿鍑芥暟锛氳鑼冨寲妯″瀷鍒楄〃
  const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
    const modelSet = new Set<string>();
    [...(models || []), defaultModel].forEach(model => {
      const value = String(model || '').trim();
      if (value) modelSet.add(value);
    });
    return Array.from(modelSet);
  };

  // 宸ュ叿鍑芥暟锛氭鏌ラ厤缃槸鍚﹀畬鏁村彲璋冪敤
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

  // 鑾峰彇鎵€鏈夊彲鐢ㄧ殑閰嶇疆锛堢被浼?DramaPage 鐨勫疄鐜帮級
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

  // 鏍规嵁鑺傜偣绫诲瀷閫夋嫨瀵瑰簲鐨?API 閰嶇疆
  const comfyModelsFor = (c: any) => {
    const b = String(c.serverUrl || '').trim().replace(/\/+$/, '');
    const cached = (comfyWorkflowCache || [])
      .filter((w: any) => w.feature === node.type && (!b || w.serverUrl === b))
      .sort((a: any, b2: any) => b2.updatedAt - a.updatedAt)
      .map((w: any) => w.name);
    const files = (c.workflowFiles && c.workflowFiles.length) ? c.workflowFiles.map((w: any) => w.name || w) : [];
    const merged = Array.from(new Set([...cached, ...files]));
    return merged.length ? ['鑷姩鎼缓', ...merged] : ['鑷姩鎼缓'];
  };
  const apiConfigs = (() => {
    let configs: any[] = [];
    // 鍥剧墖绫昏妭鐐?    if (['text-to-image', 'image-to-image', 'image-upscale', 'image-blend', 'character-view'].includes(node.type)) {
      configs = [
        ...imageAPIConfigs.filter(config => hasSavedCallableApiConfig(config)),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
        // ComfyUI 涔熷彲浠ョ敤浜庡浘鐗囩敓鎴?        ...comfyuiConfigs.map(c => { const ms = comfyModelsFor(c); return ({ ...c, name: c.name || 'ComfyUI', models: ms, defaultModel: ms[0], _source: 'comfyui' as const }); }),
      ];
    }
    // 瑙嗛绫昏妭鐐?    else if (['text-to-video', 'video-composite', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'lip-sync', 'video-super-resolution', 'live-portrait', 'video-to-music', 'video-interpolate', 'video-realtime'].includes(node.type)) {
      configs = [
        ...videoAPIConfigs.filter(config => hasSavedCallableApiConfig(config)),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
        // ComfyUI 涔熷彲浠ョ敤浜庤棰戠敓鎴?        ...comfyuiConfigs.map(c => ({ ...c, name: c.name || 'ComfyUI', models: (c.workflowFiles && c.workflowFiles.length ? c.workflowFiles.map((w: any) => w.name || w) : [c.name || 'ComfyUI 宸ヤ綔娴?]), defaultModel: (c.workflowFiles?.[0]?.name) || c.name || 'ComfyUI 宸ヤ綔娴?, _source: 'comfyui' as const })),
      ];
    }
    // 璇煶绫昏妭鐐?    else if (['tts', 'audio2video', 'audio-to-text'].includes(node.type)) {
      configs = [
        ...voiceAPIConfigs.filter(config => hasSavedCallableApiConfig(config)),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
      ];
    }
    // 闊充箰绫昏妭鐐?    else if (['video-to-music'].includes(node.type)) {
      configs = [
        ...musicAPIConfigs.filter(config => hasSavedCallableApiConfig(config)),
        ...getCallableRecommendedConfigs(recommendedConfigs)
          .filter(config => hasSavedCallableApiConfig(config))
          .map(config => ({ ...config, models: normalizeSavedModels(config.models, config.defaultModel), _source: 'recommended' as const })),
      ];
    }
    // ComfyUI 鑺傜偣
    else if (node.type === 'comfyui') {
      configs = comfyuiConfigs.map(c => { const ms = comfyModelsFor(c); return ({ ...c, name: c.name || 'ComfyUI', models: ms, defaultModel: ms[0], _source: 'comfyui' as const }); });
    }
    // 榛樿杩斿洖鎵€鏈夊彲鐢ㄩ厤缃?    else {
      configs = allAvailableConfigs;
    }
    // 鍘婚噸锛氭牴鎹?id 鍘婚噸锛屼繚鐣欑涓€涓嚭鐜扮殑閰嶇疆
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
      // 浼樺厛鍥炴樉鑺傜偣宸蹭繚瀛樼殑鎺ュ彛/妯″瀷锛堜緥濡傚凡閫夋嫨鐨?ComfyUI 宸ヤ綔娴侊級
      const savedCfg = node.configId ? apiConfigs.find((c: any) => c.id === node.configId) : undefined;
      const defaultCfg = savedCfg || apiConfigs.find((c: any) => c.isDefault) || apiConfigs[0];
      setSelectedConfig(defaultCfg.id || '');
      const savedModel = savedCfg && node.model && (defaultCfg.models || []).includes(node.model) ? node.model : '';
      setSelectedModel(savedModel || defaultCfg.models?.[0] || defaultCfg.defaultModel || '');
    }
  }, [apiConfigs]);

  // 鑷畾涔変笅鎷夛細鑱氱劍涓庣偣鍑诲閮ㄥ叧闂?  const modelDropdownRef = React.useRef<HTMLDivElement>(null);
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

  // 寮圭獥浣跨敤 fixed 瀹氫綅骞跺熀浜?anchorRect锛堝睆骞曞潗鏍囷級璁＄畻浣嶇疆锛?  // 涓嶄緷璧栫敾甯冪缉鏀惧€硷紝鍥犳绉婚櫎浜嗘鍓?100ms 杞鐨?canvasZoom 閫昏緫锛堟寔缁Е鍙戦噸娓叉煋锛岃妭鐐瑰鏃舵槑鏄惧崱椤匡級銆?  const canvasRoot = typeof document === 'undefined' ? null : document.querySelector('.llib-full-canvas') as HTMLElement | null;
  const canvasRect = canvasRoot?.getBoundingClientRect() ?? null;
  const viewportWidth = canvasRect?.width ?? (typeof window === 'undefined' ? 1280 : window.innerWidth);
  
  // 寮圭獥浣嶇疆鍩轰簬 anchorRect锛堣妭鐐?DOM 浣嶇疆锛夛紝浣跨敤 fixed 瀹氫綅閬垮厤琚埗鍏冪礌鍙樻崲褰卞搷
  const anchorCenterX = anchorRect ? anchorRect.left + anchorRect.width / 2 : 0;
  const anchorBottom = anchorRect ? anchorRect.bottom : 0;
  const maxPopoverWidth = Math.min(640, viewportWidth - 24);
  // 寮圭獥瀹藉害锛氳窡闅忚妭鐐瑰搴﹀悓姣斾緥锛堣妭鐐圭敾甯冨潗鏍?* 缂╂斁 = 灞忓箷瀹藉害锛?  // 浣跨敤鑺傜偣瀹為檯鐨勫睆骞曞搴︿綔涓烘渶灏忓弬鑰冿紝鏈€澶т笉瓒呰繃 640px
  const nodeScreenWidth = anchorRect?.width ?? 360;
  const popoverWidth = Math.max(Math.min(maxPopoverWidth, 640), Math.min(nodeScreenWidth * 1.4, maxPopoverWidth));
  
  // 浣跨敤 fixed 瀹氫綅锛屽熀浜庡睆骞曞潗鏍?  const popoverLeft = anchorRect ? anchorCenterX - popoverWidth / 2 : 0;
  const popoverTop = anchorRect ? anchorBottom + 8 : 0;
  const portalTarget = canvasRoot || document.body;

  // 寮圭獥鏍峰紡锛氫娇鐢?fixed 瀹氫綅锛屼笉鍙楃敾甯冪缉鏀惧奖鍝?  const portalStyle: React.CSSProperties = {
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
        <span className="popover-title">{NODE_TEMPLATES.find(t => t.type === node.type)?.label || '鑺傜偣'} - 杈撳叆</span>
        {isMediaInputNode && (
          <div className="popover-video-tabs popover-video-tabs-header">
            {mediaFeatures.slice(0, isImageInputNode ? 2 : 5).map(feature => {
              const isTextToImage = feature.id === 'text-to-image';
              const isTextToVideo = feature.id === 'text-to-video';
              const hasReference = referenceImages.length > 0;
              // 寮哄埗鍏ㄨ兘鍙傝€冿細闄も€滃叏鑳藉弬鑰?reference)鈥濆锛屽叾浠栭€夐」鍏ㄩ儴鍙樼伆涓嶅彲閫?              const disabledByForce = forceOmniReference && feature.id !== 'reference';
              const shouldDisable = disabledByForce || ((isTextToImage || isTextToVideo) && (hasIncomingImageNode || hasReference));
              return (
                <button
                  key={feature.id}
                  className={`popover-video-tab ${activeFeature === feature.id ? 'active' : ''} ${shouldDisable ? 'disabled' : ''}`}
                  onClick={() => !shouldDisable && switchVideoFeature(feature.id)}
                  disabled={shouldDisable}
                  title={disabledByForce ? '宸叉娴嬪埌瑙嗛鎴栧绉嶆牸寮忚緭鍏ワ紝浠呭彲浣跨敤鍏ㄨ兘鍙傝€? : (shouldDisable ? '宸叉娴嬪埌鍥剧墖杈撳叆锛岃浣跨敤鍥剧墖鐩稿叧鍔熻兘' : '')}
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
                  <button className={`popover-video-tool square ${activeFeature === 'marker' ? 'active' : ''}`} onClick={() => applyMediaFeature('marker')} title="鏍囨敞"><SvgIcon name="grid" size={13} /><span>鏍囨敞</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'reference-extra' ? 'active' : ''}`} onClick={() => applyMediaFeature('reference-extra')} title="鐐瑰嚮鐢诲竷鍥剧墖鑺傜偣閫夋嫨鍙傝€冨浘"><SvgIcon name="cursor" size={13} /><span>鍙傝€?/span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'upload' ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()} title="涓婁紶鍙傝€冨浘"><SvgIcon name="upload" size={13} /><span>鍙傝€冨浘</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'asset' ? 'active' : ''}`} onClick={() => applyMediaFeature('asset')} title="浠庤祫浜у簱閫夋嫨"><SvgIcon name="box" size={13} /><span>璧勪骇</span></button>
                </>
              ) : (
                <>
                  <button className={`popover-video-tool square ${activeFeature === 'marker' ? 'active' : ''}`} onClick={() => applyMediaFeature('marker')} title="鏍囨敞"><SvgIcon name="grid" size={13} /><span>鏍囨敞</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'reference-extra' ? 'active' : ''}`} onClick={() => applyMediaFeature('reference-extra')} title="鐐瑰嚮鐢诲竷鍥剧墖鑺傜偣閫夋嫨鍙傝€冨浘"><SvgIcon name="cursor" size={13} /><span>鍙傝€?/span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'upload' ? 'active' : ''}`} onClick={() => fileInputRef.current?.click()} title="涓婁紶鍙傝€冨浘"><SvgIcon name="upload" size={13} /><span>鍙傝€冨浘</span></button>
                  <button className={`popover-video-tool square ${activeFeature === 'asset' ? 'active' : ''}`} onClick={() => applyMediaFeature('asset')} title="浠庤祫浜у簱閫夋嫨"><SvgIcon name="box" size={13} /><span>璧勪骇</span></button>
                </>
              )}
            </div>
            {referenceImages.length > 0 && (
              <div className="popover-reference-strip">
                <span className="popover-reference-label">鍙傝€?/span>
                {referenceImages.map(image => (
                  <button key={image.id} className={`popover-reference-thumb ${image.kind === 'video' ? 'is-video' : ''}`} title={`@${image.name}`} onClick={() => setInputRows(prev => (prev.length === 0 ? [{ id: `row-${Date.now()}`, feature: activeFeature || defaultFeature, text: `@${image.name} ` }] : prev).map((row, index) => index === 0 ? { ...row, text: row.text.includes(`@${image.name}`) ? row.text : `${row.text}${row.text ? ' ' : ''}@${image.name} ` } : row))}>
                    {image.kind === 'video' ? (
                      image.thumbnail
                        // 瑙嗛鍙傝€冿細浣跨敤鎶撳彇鍒扮殑绗竴甯х缉鐣ュ浘鏄剧ず锛涚缉鐣ュ浘鏈氨缁椂鐢?video 鏍囩鍏滃簳灞曠ず棣栧抚锛岄伩鍏嶈鍙栦笉鍒扮缉鐣ュ浘
                        ? <img src={image.thumbnail} alt={image.name} />
                        : <video src={image.url} muted playsInline preload="metadata" />
                    ) : (
                      <img src={image.thumbnail || image.url} alt={image.name} />
                    )}
                    {image.kind === 'video' && <span className="popover-reference-video-badge"><SvgIcon name="video" size={10} /></span>}
                    <span
                      className="popover-reference-remove"
                      title="鍒犻櫎鍙傝€?
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
                    <MentionTextarea
                      className="popover-textarea popover-video-textarea nodrag nowheel"
                      mentionNames={referenceImages.map(img => img.name)}
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
          <MentionTextarea
            className="popover-textarea nodrag nowheel"
            mentionNames={referenceImages.map(img => img.name)}
            onPointerDown={stopInputDrag}
            onMouseDown={stopInputDrag}
            value={prompt}
            onChange={(value) => setPrompt(value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="杈撳叆鎻愮ず璇?.."
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
              <label htmlFor={`pop-file-${node.id}`} className="popover-action-btn" title="涓婁紶闄勪欢"><SvgIcon name="upload" size={14} /></label>
            )}
            {/* 鑷畾涔変富棰樹笅鎷夛紙閬垮厤 Windows 鍘熺敓 select 閲囦环浣庤壊锛?*/}
            <div ref={modelDropdownRef} className={`popover-model-dropdown nodrag nowheel ${modelDropdownOpen ? 'open' : ''}`} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag}>
              <button
                type="button"
                className="popover-model-dropdown-trigger"
                onClick={(e) => { e.stopPropagation(); setModelDropdownOpen(open => !open); }}
                title="閫夋嫨 API 涓庢ā鍨?
              >
                <span className="popover-model-dropdown-label">{selectedModel || (apiConfigs.find(c => c.id === selectedConfig)?.name) || '閫夋嫨鎺ュ彛'}</span>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="popover-model-dropdown-arrow"><path d="M6 9l6 6 6-6" /></svg>
              </button>
              {modelDropdownOpen && (
                <div className="popover-model-dropdown-menu" onClick={(e) => e.stopPropagation()}>
                  {apiConfigs.length === 0 && <div className="popover-model-dropdown-empty">鏆傛湭閰嶇疆 API</div>}
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
                              // 鎶婃墍閫夋帴鍙?妯″瀷鎻愪氦鍒拌妭鐐癸紝纭繚 executeNode 璺敱鍒版纭殑 provider锛堝惈 ComfyUI锛?                              const isComfy = (cfg as any)._source === 'comfyui' || comfyuiConfigs.some(cc => cc.id === cfg.id);
                              // ComfyUI锛氭妸鎵€閫夆€滃伐浣滄祦鍚嶁€濇槧灏勫埌缂撳瓨 id锛涢€夆€滆嚜鍔ㄦ惌寤衡€濆垯娓呯┖浠ョ幇鎼?                              let nextOptions = node.options || {};
                              if (isComfy) {
                                const b = String((cfg as any).serverUrl || '').trim().replace(/\/+$/, '');
                                const hit = m === '鑷姩鎼缓' ? undefined : (comfyWorkflowCache || []).find((w: any) => w.name === m && w.feature === node.type && (!b || w.serverUrl === b));
                                nextOptions = { ...nextOptions, workflowCacheId: hit ? hit.id : undefined, workflowName: m === '鑷姩鎼缓' ? undefined : m };
                              }
                              useAppStore.getState().updateNode(node.id, {
                                provider: (isComfy ? 'comfyui' : ((cfg as any).provider || 'openai')) as any,
                                configId: cfg.id,
                                model: m,
                                options: nextOptions,
                              });
                            }}
                          >
                            {isActive && <span className="popover-model-dropdown-check">鉁?/span>}
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
                <button className="image-param-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setVideoParamOpen(open => !open); }} title="瑙嗛鐢熸垚鍙傛暟">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><line x1="3" y1="17" x2="8.59" y2="11.41" /><line x1="9" y1="9" x2="21" y2="21" /></svg>
                  <span>{videoRatio === 'auto' ? 'Auto' : videoRatio} 路 {videoClarity} 路 {videoDuration}s</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {videoParamOpen && (
                  <div className="image-param-panel video-param-panel" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => event.stopPropagation()}>
                    <div className="image-param-section">
                      <div className="image-param-title">姣斾緥</div>
                      <div className="image-param-segment">
                        {VIDEO_RATIO_OPTIONS.map(option => (
                          <button key={option.id} className={videoRatio === option.id ? 'active' : ''} onClick={() => setVideoRatio(option.id)}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">娓呮櫚搴?/div>
                      <div className="image-param-segment">
                        {VIDEO_CLARITY_OPTIONS.map(option => (
                          <button key={option} className={videoClarity === option ? 'active' : ''} onClick={() => setVideoClarity(option)}>{option}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">鏃堕暱 <span style={{color: 'var(--primary-color, #7dd3fc)'}}>{videoDuration}s</span></div>
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
                      <div className="image-param-title">闊抽</div>
                      <div className="image-param-segment">
                        <button className={`video-audio-btn ${generateAudio ? 'active' : ''}`} onClick={() => setGenerateAudio(!generateAudio)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 14h4l5 5V5L8 10H4z" /><path d="M17 9a4 4 0 010 6" /></svg>
                          <span>{generateAudio ? '宸插紑鍚? : '宸插叧闂?}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {isVideoInputNode && !isPanorama720Input && (
              <button className="popover-action-btn camera-btn" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={() => setShowCameraGallery(true)} title="閫夋嫨杩愰暅">
                <svg className="camera-btn-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="camera-btn-text">杩愰暅</span>
                {selectedCameraId && <span className="camera-badge">{selectedCameraMovement?.name}</span>}
              </button>
            )}
            {isImageInputNode && !isPanorama720Input && (
              <div className="image-param-wrap">
                <button className="image-param-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setImageParamOpen(open => !open); }} title="鐢昏川 / 娓呮櫚搴?/ 姣斾緥">
                  <SvgIcon name="image" size={13} />
                  <span>{IMAGE_RATIO_OPTIONS.find(item => item.id === imageRatio)?.label || '鑷€傚簲'} 路 {IMAGE_QUALITY_OPTIONS.find(item => item.id === imageQuality)?.label || '鏍囧噯鐢昏川'} 路 {imageClarity}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                {imageParamOpen && (
                  <div className={`image-param-panel ${isPanorama720Input ? 'panorama-param-panel' : ''}`} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => event.stopPropagation()}>
                    <div className="image-param-section">
                      <div className="image-param-title">鐢昏川</div>
                      <div className={`image-param-segment ${isPanorama720Input ? 'single' : ''}`}>
                        {(isPanorama720Input ? IMAGE_QUALITY_OPTIONS.filter(option => option.id === 'standard') : IMAGE_QUALITY_OPTIONS).map(option => (
                          <button key={option.id} className={imageQuality === option.id ? 'active' : ''} onClick={() => changeImageQuality(option.id)}>{option.label}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">娓呮櫚搴?/div>
                      <div className="image-param-segment">
                        {IMAGE_CLARITY_OPTIONS.map(option => (
                          <button key={option} className={imageClarity === option ? 'active' : ''} onClick={() => changeImageClarity(option)}>{option}</button>
                        ))}
                      </div>
                    </div>
                    <div className="image-param-section">
                      <div className="image-param-title">姣斾緥</div>
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
                <button className="panorama-feature-trigger" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(event) => { event.stopPropagation(); setFeaturePanelOpen(open => !open); }} title="閫夋嫨鐢熸垚绫诲瀷">
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
              <button className="popover-action-btn popover-prompt-library-btn" onPointerDown={stopInputDrag} onMouseDown={stopInputDrag} onClick={(e) => { e.stopPropagation(); setShowPromptLibraryPicker(v => !v); }} title="鎻愮ず璇嶅簱">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /><line x1="10" y1="9" x2="16" y2="9" /><line x1="10" y1="13" x2="16" y2="13" /><line x1="10" y1="17" x2="14" y2="17" /></svg>
                <span>鎻愮ず璇嶅簱</span>
              </button>
            )}
          {showPromptLibraryPicker && (
            <div className="popover-prompt-library-picker" onClick={(e) => e.stopPropagation()} onPointerDown={stopInputDrag} onMouseDown={stopInputDrag}>
              {promptLibrary.length === 0 ? (
                <div className="popover-prompt-library-empty">鎻愮ず璇嶅簱涓虹┖</div>
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
                    <span className={`popover-prompt-library-item-type type-${item.type}`}>{item.type === 'image' ? '鍥? : item.type === 'video' ? '瑙嗛' : '鏂?}</span>
                  </button>
                ))
              )}
            </div>
          )}
          </div>
          <button className="popover-send-btn" onClick={handleSend} disabled={!(isMediaInputNode ? inputRows.some(row => row.text.trim()) : prompt.trim()) && attachedFiles.length === 0}>
            <SvgIcon name="play" size={14} /> 鎵ц
          </button>
        </div>
      </div>
      {assetPickerOpen && (
        <div className="popover-asset-picker" onClick={() => setAssetPickerOpen(false)}>
          <div className="popover-asset-panel" onClick={(event) => event.stopPropagation()}>
            <div className="popover-asset-title">閫夋嫨鍙傝€冨浘</div>
            <div className="popover-asset-grid">
              {imageAssets.length === 0 ? <div className="popover-asset-empty">璧勪骇搴撴殏鏃犲浘鐗?/div> : imageAssets.map((asset: any) => (
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
// ==================== 鑺傜偣鍐呭祵瀵硅瘽妗?====================

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
      // 鑷姩淇濆瓨鍒拌祫浜у簱锛堝浘鐗?瑙嗛/闊抽锛?      files.forEach(file => {
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
      setHistory(prev => [...prev, { role: 'ai', text: '鐢熸垚瀹屾垚锛岀粨鏋滃凡鏄剧ず鍦ㄨ妭鐐逛腑銆? }]);
      setIsGenerating(false);
    }, 1500);
  };

  return (
    <div className="node-chat-dialog">
      <div className="node-chat-history">
        {history.length === 0 && (
          <div className="node-chat-placeholder">杈撳叆鎻愮ず璇嶆垨涓婁紶鏂囦欢寮€濮?/div>
        )}
        {history.map((h, i) => (
          <div key={i} className={`node-chat-msg ${h.role === 'user' ? 'user' : 'ai'}`}>
            {h.role === 'user' && h.files && h.files.length > 0 && (
              <div className="node-msg-files">{h.files.map(f => `闄勪欢 ${f}`).join(' ')}</div>
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
          placeholder="杈撳叆娑堟伅锛孲hift+Enter 鎹㈣..."
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
            <label htmlFor={`node-file-${node.id}`} className="node-upload-btn" title="涓婁紶鏂囦欢"><SvgIcon name="upload" size={15} /></label>
            <button className="node-asset-btn" title="浠庤祫浜у簱閫夋嫨"><SvgIcon name="box" size={15} /></button>
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

// ==================== 鑷畾涔夎妭鐐?====================

// 瀛愬姛鑳藉畾涔夛細姣忕鑺傜偣绫诲瀷瀵瑰簲鐨勫瓙鍔熻兘鍒楄〃
const NODE_SUB_FUNCTIONS: Record<string, { id: string; label: string; icon: CanvasIconName }[]> = {
  'story-script': [
    { id: 'custom-text', label: '鑷繁缂栧啓鍐呭', icon: 'text' },
    { id: 'text-to-video', label: '鏂囩敓瑙嗛', icon: 'video' },
    { id: 'image-prompt', label: '鍥剧墖鍙嶆帹鎻愮ず璇?, icon: 'image' },
    { id: 'text-to-music', label: '鏂囧瓧鐢熼煶涔?, icon: 'audio' },
  ],
  'text-to-image': [
    { id: 'text-to-image', label: '鏂囩敓鍥?, icon: 'image' },
    { id: 'image-upscale', label: '鍥剧墖楂樻竻', icon: 'spark' },
  ],
  'text-to-video': [
    { id: 'first-last-frame-video', label: '棣栧熬甯х敓鎴愯棰?, icon: 'box' },
    { id: 'first-frame-video', label: '棣栧抚鐢熸垚瑙嗛', icon: 'spark' },
  ],
  'video-composite': [
    { id: 'video-composite', label: '瑙嗛鍚堟垚', icon: 'cut' },
    { id: 'subtitle', label: '瀛楀箷鐢熸垚', icon: 'text' },
  ],
  'director-stage': [
    { id: 'director-stage', label: '3D鍦烘櫙', icon: 'stage' },
  ],
  'audio2video': [
    { id: 'audio2video', label: '闊抽椹卞姩', icon: 'audio' },
    { id: 'tts', label: '璇煶鍚堟垚', icon: 'mic' },
  ],
  'story-script-adv': [
    { id: 'script-gen', label: '鑴氭湰鐢熸垚', icon: 'script' },
    { id: 'storyboard', label: '鏁呬簨鏉?, icon: 'image' },
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
  // 鍏ㄦ櫙鍥捐妭鐐圭敤鐨勬槸 text-to-image 绫诲瀷锛屾ā鏉垮浘鏍囦細瑙ｆ瀽鎴?image锛岃繖閲屾敼鐢ㄦ洿璐村垏鐨?panorama 鍥炬爣
  const isPanoramaKind = node?.options?.outputType === 'panorama' || node?.options?.panoramaType === '720';
  const nodeIcon: CanvasIconName = isPanoramaKind ? 'panorama' : (template?.icon || 'canvas');
  const [showMenu, setShowMenu] = useState(false);
  const [inlineMode, setInlineMode] = useState(false);
  // 鏂囨湰鑺傜偣鍜岃嚜瀹氫箟鏂囨湰鑺傜偣鍦?inlineMode 缂栬緫鏃堕殣钘忓脊绐楄緭鍏ユ
  const isTextNodeType = TEXT_NODE_TYPES.includes(node?.type);
  const isCustomTextNode = node?.options?.isInlineText || node?.options?.generationType === 'custom-text';
  // 鍏ㄦ櫙鍥捐妭鐐癸細涓嶉渶瑕佽緭鍏ユ/瀛愬姛鑳斤紝鐩存帴杩炴帴鍥剧墖鑷姩鐢熸垚涓夌淮鍏ㄦ櫙棰勮
  const isPanoramaNode = node?.options?.outputType === 'panorama' || node?.options?.panoramaType === '720';
  // 鏂囨湰鑺傜偣锛氬崟鍑绘樉绀哄脊绐楋紝鍙屽嚮杩涘叆 inlineMode 鍚庨殣钘忓脊绐楋紱鍏ㄦ櫙鍥捐妭鐐逛笉鏄剧ず杈撳叆寮圭獥
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

  // 褰撳墠鑺傜偣绫诲瀷鐨勫瓙鍔熻兘鍒楄〃锛堝叏鏅浘鑺傜偣涓嶉渶瑕佷换浣曞瓙鍔熻兘锛?  const subFunctions = isPanoramaNode ? [] : (NODE_SUB_FUNCTIONS[node?.type] || []);

  // 鏂板缓鑺傜偣鏃惰嚜鍔ㄥ脊鍑鸿緭鍏ユ
  React.useEffect(() => {
    if (node?.options?._autoOpen) {
      setActiveInputNodeId?.(node.id);
      // 娓呴櫎鏍囪锛岄伩鍏嶆瘡娆℃覆鏌撻兘鎵撳紑
      updateNode(node.id, { options: { ...node.options, _autoOpen: undefined } });
    }
  }, [node?.id]);

  const handleChatSend = useCallback((prompt: string, files?: File[], generationType?: string, videoConfig?: any) => {
    // 璇诲彇 store 涓渶鏂扮殑鑺傜偣閫夐」锛歂odeInputPopover.handleSend 宸叉妸杈撳叆妗嗕笅鏂圭殑鎵€鏈夊弬鏁?    //锛堝浘鐗囨瘮渚?鐢昏川/娓呮櫚搴︺€佽棰戞瘮渚?娓呮櫚搴?鏃堕暱/闊抽/杩愰暅绛夛級鍐欏叆 store銆?    // 鑻ヨ繖閲岀敤闂寘閲岀殑鏃?node.options 灞曞紑锛屼細鎶婂垰淇濆瓨鐨勫弬鏁拌鐩栨帀锛屽鑷村弬鏁板鐢熸垚缁撴灉涓嶇敓鏁堛€?    const latestNode = useAppStore.getState().nodes[node.id];
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
    // 鍐呰仈缂栬緫瑕嗙洊浜?AI 缁撴灉鈥斺€旀竻鐞?node.result 浠ュ厤鏄剧ず鏃?AI 杩斿洖
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

  // 瑙ｆ瀽 3D 瀵兼紨鍙拌妭鐐圭殑涓婃父鍙傝€冨獟浣擄紙鍥剧墖/瑙嗛锛夛紝鐢ㄤ綔瑙嗗彛鍙傝€冨簳鍥句笌榛樿褰曞埗鏃堕暱
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
      // 鏀堕泦涓婃父鏂囨湰浣滀负棰勬紨鎻愮ず璇嶏紙鍓ф湰/鎻忚堪鑺傜偣锛?      if (source.result?.type === 'text' && source.result.text) refText = refText || source.result.text;
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
      // 绔嬪嵆鍏堣缃紙鏃犳椂闀匡級锛岃鍙栧厓鏁版嵁鍚庡啀琛ラ粯璁ゅ綍鍒舵椂闀?      setDirectorReferenceMedia({ url, kind: 'video', text });
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
    // 3D 瀵兼紨鍙拌妭鐐癸細鐐瑰嚮瀛愬姛鑳芥寜閽洿鎺ユ墦寮€ 3D 鍦烘櫙鎼缓寮圭獥
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
    // 鎵€鏈夊瓙鍔熻兘鐐瑰嚮鍚庨兘杞负 inline 鏂囨湰鏍峰紡
    updateNode(node.id, { options: { ...node.options, generationType: subId, isInlineText: true } });

    // 鏂囩敓瑙嗛锛氳嚜鍔ㄨ繛鎺ヨ棰戣妭鐐?    if (subId === 'text-to-video') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      // 鑷姩杩炴帴涓€涓棰戣妭鐐?      createLinkedNode?.(node.id, 'text-to-video');
      return;
    }

    // 鏂囧瓧鐢熼煶涔愶細鑷姩杩炴帴闊抽鑺傜偣锛堜互褰撳墠鏂囨湰浣滀负闊充箰鐢熸垚鎻愮ず璇嶏級
    if (subId === 'text-to-music') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      createLinkedNode?.(node.id, 'audio2video', {
        options: { displayName: '闊充箰鑺傜偣', generationType: 'text-to-music' },
      });
      return;
    }

    // 鏂囩敓鍥撅細鑷姩杩炴帴鍥剧墖鑺傜偣锛堜互褰撳墠鏂囨湰浣滀负鍥剧墖鐢熸垚鎻愮ず璇嶏級
    if (subId === 'text-to-image') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'text-to-image', {
        options: { displayName: '鍥剧墖鑺傜偣', generationType: 'text-to-image', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 鍥剧墖楂樻竻锛氳嚜鍔ㄨ繛鎺ュ浘鐗囬珮娓呰妭鐐?    if (subId === 'image-upscale') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'image-upscale', {
        options: {
          displayName: '鍥剧墖楂樻竻',
          generationType: 'image-upscale',
          mediaFeature: '鍥剧墖楂樻竻',
          sourceFeature: 'upscale',
          imageClarity: node.options?.imageClarity || '4K',
          autoOpenInput: true,
        },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 瑙嗛鍚堟垚锛氳嚜鍔ㄨ繛鎺ヨ棰戝悎鎴愯妭鐐?    if (subId === 'video-composite') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'video-composite', {
        options: { displayName: '瑙嗛鍚堟垚', generationType: 'video-composite', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 瀛楀箷鐢熸垚锛氳嚜鍔ㄨ繛鎺ュ瓧骞曡妭鐐?    if (subId === 'subtitle') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'subtitle', {
        options: { displayName: '瀛楀箷鐢熸垚', generationType: 'subtitle', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 闊抽椹卞姩锛氳嚜鍔ㄨ繛鎺ラ煶棰戦┍鍔ㄨ妭鐐?    if (subId === 'audio2video') {
      setActiveInputNodeId?.(null);
      const targetId = createLinkedNode?.(node.id, 'audio2video', {
        options: { displayName: '闊抽椹卞姩', generationType: 'audio2video', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 璇煶鍚堟垚锛氳嚜鍔ㄨ繛鎺?TTS 鑺傜偣锛堜互褰撳墠鏂囨湰浣滀负閰嶉煶鏂囨锛?    if (subId === 'tts') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'tts', {
        options: { displayName: '璇煶鍚堟垚', generationType: 'tts', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 鑴氭湰鐢熸垚锛氳嚜鍔ㄨ繛鎺ヨ剼鏈妭鐐?    if (subId === 'script-gen') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'story-script-adv', {
        options: { displayName: '鑴氭湰鐢熸垚', generationType: 'script-gen', autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 鏁呬簨鏉匡細鑷姩杩炴帴鍥剧墖鑺傜偣鐢熸垚鍒嗛暅
    if (subId === 'storyboard') {
      setActiveInputNodeId?.(null);
      setInlineText(node.prompt || '');
      const targetId = createLinkedNode?.(node.id, 'text-to-image', {
        options: { displayName: '鏁呬簨鏉?, generationType: 'storyboard', mediaFeature: '鏁呬簨鏉?, autoOpenInput: true },
      });
      if (targetId) setActiveInputNodeId?.(targetId);
      return;
    }

    // 鍥剧墖鍙嶆帹鎻愮ず璇嶏細鍒涘缓涓婁紶鍥剧墖鑺傜偣鍦ㄥ墠闈紝骞跺€掓帹鎻愮ず璇?    if (subId === 'image-prompt') {
      // 鍏堝垱寤轰笂浼犲浘鐗囪妭鐐瑰湪鏂囨湰鑺傜偣鍓嶉潰
      const uploadNodeId = createLinkedNode?.(node.id, 'upload-image' as AINodeType, {
        x: node.x - 410, // 鏀惧湪褰撳墠鑺傜偣宸︿晶
        y: node.y,
        options: {
          displayName: '涓婁紶鍥剧墖',
          generationType: 'upload-image',
          onImageUpload: (imageUrl: string) => {
            // 鍥剧墖涓婁紶鍚庯紝璋冪敤鍙嶆帹 API 灏嗘彁绀鸿瘝鍐欏叆褰撳墠鏂囨湰鑺傜偣
            updateNode(node.id, {
              prompt: `鏍规嵁鍥剧墖鍙嶆帹鐨勬彁绀鸿瘝锛?{imageUrl}`,
              result: { url: imageUrl, type: 'text', text: `鏍规嵁鍥剧墖鍙嶆帹鐨勬彁绀鸿瘝锛?{imageUrl}` },
            });
          },
        },
      });
      // 杩炴帴涓婁紶鍥剧墖鑺傜偣鍒板綋鍓嶆枃鏈妭鐐癸紙闇€瑕佸弽鍚戣繛鎺ワ級
      if (uploadNodeId) {
        // 閫氳繃 canvas:add-edge 浜嬩欢鍒涘缓浠庝笂浼犺妭鐐瑰埌褰撳墠鑺傜偣鐨勮繛鎺?        window.dispatchEvent(new CustomEvent('canvas:add-edge', {
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

  // 鐐瑰嚮鍗＄墖闈炲瓙鍔熻兘鍖哄煙锛屽脊鍑鸿緭鍏ユ
  const handleCardBodyClick = useCallback(() => {
    // 鎵€鏈夋枃鏈妭鐐癸紙鍖呮嫭 API 杩斿洖鐨勫拰鑷畾涔夌紪鍐欑殑锛夐兘杩涘叆 inlineMode 缂栬緫
    if (isTextNode || node.options?.isInlineText || node.options?.generationType === 'custom-text') {
      // 浼樺厛浣跨敤 AI 杩斿洖鐨勭粨鏋滀綔涓虹紪杈戝垵濮嬪€硷紙濡傛灉娌℃湁缁撴灉鍐嶇敤 prompt锛?      const initialText = node.result?.type === 'text' && node.result.text?.trim()
        ? node.result.text
        : (node.prompt || '');
      setInlineText(initialText);
      setInlineMode(true);
      // 鍏抽棴寮圭獥锛堝鏋滄墦寮€锛?      setActiveInputNodeId?.(null);
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

    // 3D 瀵兼紨鍙拌妭鐐癸細鐐瑰嚮鎵撳紑 3D 鍦烘櫙鎼缓寮圭獥
    if (node.type === 'director-stage') {
      e.preventDefault();
      e.stopPropagation();
      resolveDirectorReferenceMedia();
      setDirectorStageOpen(true);
      setActiveInputNodeId?.(null);
      return;
    }

    // 鏂囨湰鑺傜偣鍗曞嚮鏄剧ず寮圭獥杈撳叆妗嗭紝鍙屽嚮鎵嶈繘鍏?inlineMode 缂栬緫
    if (isTextNode || node.options?.isInlineText || node.options?.generationType === 'custom-text') {
      // 鍗曞嚮鏄剧ず寮圭獥
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
    // 鍏ㄦ櫙鍥捐妭鐐癸細鐐瑰嚮缁撴灉鍥剧墖鎵撳紑 720掳 鍏ㄦ櫙鏌ョ湅鍣?    const isPanoramaResult = hasImageMedia && (node.options?.outputType === 'panorama' || node.options?.panoramaType === '720');
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
  const promptLibraryTags = [template?.label || getNodeBaseName(node.type), node.result?.type === 'image' ? '鍥剧墖' : node.result?.type === 'video' ? '瑙嗛' : '鏂囨湰'].filter(Boolean);
  const applyImageMediaTool = useCallback((featureId: string, option?: string) => {
    if (!displayMedia?.url) return;
    const feature = IMAGE_MEDIA_TOOL_FEATURES.find(item => item.id === featureId);
    if (featureId === 'reference' || featureId === 'reference-extra') {
      const prompt = featureId === 'reference'
        ? '鍩轰簬褰撳墠鍙傝€冨浘鐢熸垚鏃犵紳720掳鍏ㄦ櫙鍥撅紝淇濇寔涓讳綋銆佸満鏅韩浠藉拰鏁翠綋鏋勫浘锛屽乏鍙冲欢灞曡嚜鐒讹紝杈撳嚭2:1姣斾緥锛屼笉瑕侀粦杈癸紝涓嶈鍒囦富浣撱€?
        : '灏嗗綋鍓嶅浘鐗囦綔涓哄弬鑰冨浘鍔犲叆杈撳叆妗嗭紝鐢ㄤ簬鍚庣画鍥剧墖鐢熸垚銆?;
      const targetId = createLinkedNode?.(node.id, 'image-to-image', {
        width: 280,
        height: 220,
        status: 'idle',
        prompt,
        thumbnail: undefined,
        result: undefined,
        options: {
          displayName: featureId === 'reference' ? '720掳鍏ㄦ櫙鍥? : '鍥剧墖鍙傝€?,
          generationType: 'image-to-image',
          mediaFeature: featureId === 'reference' ? '720掳鍏ㄦ櫙鍥? : '鍥剧墖鍙傝€?,
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
          upstreamPrompt: node.result?.type === 'text' && node.result.text?.trim() ? node.result.text : (node.prompt || ''),
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

    const optionLabel = option ? `锛?{option}锛塦 : '';
    const promptText = feature?.prompt || '浠ュ綋鍓嶅浘鐗囦负鍩虹缁х画鐢熸垚銆?;
    const targetType = featureId === 'upscale' ? 'image-upscale' : 'image-to-image';
    const targetId = createLinkedNode?.(node.id, targetType, {
      width: 280,
      height: 220,
      status: 'idle',
      prompt: `${feature?.label || '鍥剧墖澶勭悊'}${optionLabel}锛?{promptText}`,
      thumbnail: undefined,
      result: undefined,
      options: {
        displayName: feature?.label || '鍥剧墖澶勭悊',
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
        upstreamPrompt: node.result?.type === 'text' && node.result.text?.trim() ? node.result.text : (node.prompt || ''),
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
    const markedName = `鏍囨敞-${getNodeDisplayName(node)}`;
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
        upstreamPrompt: node.result?.type === 'text' && node.result.text?.trim() ? node.result.text : (node.prompt || ''),
        upstreamNodeIds: [node.id],
        ...options,
      },
    });
    if (targetId) setActiveInputNodeId?.(targetId);
    setImageToolbarOpen(false);
  }, [createLinkedNode, displayMedia?.url, node, setActiveInputNodeId]);

  const createMultiAngleGeneration = useCallback((feature: typeof MULTI_ANGLE_FEATURES[number]) => {
    const prompt = `澶氳搴︾敓鎴愶細${feature.label}銆?{feature.prompt}`;
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
    const directionLabel = LIGHT_DIRECTIONS.find(item => item.id === settings.direction)?.label || '姝ｉ潰';
    const viewLabel = settings.view === 'perspective' ? '閫忚' : '姝ｉ潰';
    const prompt = `鑷敱瑙掑害鎵撳厜锛氫娇鐢?{viewLabel}瑙嗚锛屼富鍏夋簮鏉ヨ嚜${directionLabel}锛屼寒搴?{settings.brightness}%锛屽厜鑹?{settings.color}銆備繚鎸佷富浣撶粨鏋勩€佹瀯鍥惧拰鍘熷浘椋庢牸涓€鑷达紝鍙皟鏁村厜鐓ф晥鏋溿€俙;
    createImageToolNode('鑷敱鎵撳厜', prompt, {
      sourceFeature: 'lighting',
      lightingSettings: settings,
      apiCapability: 'free-angle-relighting',
      githubProject: 'IC-Light / DPR',
      workflowProject: 'free-angle-relighting',
      outputType: 'relit-image',
    });
  }, [createImageToolNode]);

  const createHdFeatureGeneration = useCallback((feature: typeof HD_FEATURES[number]) => {
    const prompt = `${feature.label}锛?{feature.prompt}`;
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
    const prompt = `瀹牸鍒囧垎锛氬皢褰撳墠鍥剧墖鍒囧垎涓?{option.label}锛屾瘡涓鏍间繚鎸佺敾闈㈠唴瀹瑰畬鏁淬€佽竟缂樻竻鏅帮紝閫傚悎浣滀负鐙珛绱犳潗浣跨敤銆俙;
    createImageToolNode(option.label, prompt, {
      sourceFeature: 'split',
      mediaFeature: '瀹牸鍒囧垎',
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
    const prompt = `${feature.label}锛?{feature.prompt}`;
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
      // 浠呭湪浣嶇疆/灏哄鐪熸鍙樺寲鏃舵墠 setState锛岄伩鍏嶆瘡甯ф棤璋撻噸娓叉煋瀵艰嚧鑺傜偣澶氭椂鍗￠】
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
              title="鍙屽嚮閲嶅懡鍚?
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => { e.stopPropagation(); setDraftName(getNodeDisplayName(node)); setRenaming(true); }}
            >
              {getNodeDisplayName(node)}
            </span>
          )}
        </div>
        <button className="lib-node-close" onClick={(e) => { e.stopPropagation(); (deleteCanvasNode || deleteNode)(node.id); }}><SvgIcon name="close" size={14} /></button>
      </div>

      {/* 瀛愬姛鑳芥寜閽喛顢?*/}
      {isDirectorStageNode && !displayMedia ? (
        <div className="lib-node-scene-preview director" aria-hidden="true">
          <DirectorScenePreview />
          <span className="lib-node-scene-tag"><SvgIcon name="stage" size={12} /> 3D 瀵兼紨鍙?/span>
        </div>
      ) : isPanoramaNode && !displayMedia ? (
        <div className="lib-node-scene-preview panorama" aria-hidden="true">
          <PanoramaScenePreview />
          <span className="lib-node-scene-tag"><SvgIcon name="panorama" size={12} /> 720掳 鍏ㄦ櫙</span>
        </div>
      ) : (
        <div className="lib-node-center-icon" aria-hidden="true">
          <SvgIcon name={nodeIcon} size={44} />
        </div>
      )}

      {hasTextContent && !inlineMode && !isInlineTextNode && (
        <div className="lib-node-connected-text" title={textSummary || ''}>
          {textSummary.trim() || '鏂囨湰鍐呭'}
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
                alt="鐢熸垚缁撴灉"
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
            placeholder="杈撳叆鍐呭..."
            autoFocus
          />
        </div>
      ) : subFunctions.length > 0 && !node.result?.text && !node.prompt?.trim() ? (
        // 鏈夊瓙鍔熻兘涓旀病鏈夊唴瀹规椂锛屾樉绀哄瓙鍔熻兘鍒楄〃
        <div className="lib-node-subfuncs">
          <div className="lib-node-subfuncs-title">灏濊瘯锛?/div>
          {subFunctions.map((sf) => (
            <button key={sf.id} className="lib-subfunc-btn" onClick={() => handleSubFunctionClick(sf.id)} title={sf.label}>
              <SvgIcon name={sf.icon} size={12} />
              <span>{sf.label}</span>
            </button>
          ))}
        </div>
      ) : isInlineTextNode || isTextNode ? (
        <div className="lib-node-inline-preview" onDoubleClick={handleCardBodyClick} title="鍙屽嚮淇敼鍐呭">
          {node.status === 'loading' ? (
            <div className="lib-node-empty-writing">
              <div className="lib-node-empty-title">AI 姝ｅ湪鐢熸垚涓€?/div>
              <div className="lib-node-empty-icon"><SvgIcon name={template?.icon || 'text'} size={46} /></div>
            </div>
          ) : node.result?.type === 'text' && node.result.text?.trim() ? (
            <div className="lib-node-inline-text">{node.result.text}</div>
          ) : node.prompt?.trim() ? (
            <div className="lib-node-inline-text">{node.prompt}</div>
          ) : (
            <div className="lib-node-empty-writing">
              <div className="lib-node-empty-title">璇风紪鍐欏唴瀹癸紝寮€濮嬩綘鐨勫垱浣溿€?/div>
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
        data-symbol={isInputConnected ? '鈭? : '+'}
        onClick={isInputConnected ? handleDisconnect('input') : undefined}
        title={isInputConnected ? '鏂紑杩炴帴' : '杩炴帴鑺傜偣'}
      />

      {(node?.status === 'success' && node.result) || node?.status === 'error' ? (
        <div className="lib-node-body lib-node-result-body" onClick={handleCardBodyClick}>
          {node?.status === 'success' && node.result && (
            <div className="lib-node-result">
              {node.result.type === 'image'
                ? <img src={normalizeFileSrc(node.result.url)} alt="鐢熸垚缁撴灉" data-media-url={node.result.url} data-media-type="image" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" />
                : node.result.type === 'audio'
                  ? <div className="lib-node-audio-player"><SvgIcon name="audio" size={26} /><audio src={normalizeFileSrc(node.result.url)} controls data-media-url={node.result.url} data-media-type="audio" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" onClick={(event) => event.stopPropagation()} /></div>
                  : <video src={normalizeFileSrc(node.result.url)} controls data-media-url={node.result.url} data-media-type="video" data-prompt={node.prompt || node.options?.prompt || ''} data-name={getNodeDisplayName(node)} data-source-id={node.id} data-source-type="canvas" />}
              {/* 缁撴灉鑺傜偣涓婄殑銆岄噸鏂扮敓鎴愩€嶅皬鎸夐挳锛氭棤璁哄浘鐗?瑙嗛/闊抽锛岄兘鍙啀娆℃墦寮€杈撳叆妗嗐€佹敼鍙傛暟鍚庡啀娆℃彁浜?*/}
              <button
                type="button"
                className="lib-node-regen-btn"
                title="鎵撳紑杈撳叆妗嗕慨鏀瑰悗閲嶆柊鐢熸垚"
                onClick={(event) => { event.stopPropagation(); setImageToolbarOpen(false); setActiveInputNodeId?.(node.id); }}
              >
                <SvgIcon name="canvas" size={13} />
                <span>閲嶆柊鐢熸垚</span>
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
        data-symbol={isOutputConnected ? '鈭? : '+'}
        onClick={isOutputConnected ? handleDisconnect('output') : undefined}
        title={isOutputConnected ? '鏂紑杩炴帴' : '杩炴帴鑺傜偣'}
      />

      {/* 杈撳叆寮圭獥 */}
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
            <button title="瀛樺叆鎻愮ず璇嶅簱" aria-label="瀛樺叆鎻愮ず璇嶅簱" onClick={() => { setSavePromptOpen(true); setShowMenu(false); }}><SvgIcon name="save" size={15} /></button>
            <button title="澶嶅埗鑺傜偣" aria-label="澶嶅埗鑺傜偣" onClick={() => { navigator.clipboard.writeText(JSON.stringify(node)); setShowMenu(false); }}><SvgIcon name="copy" size={15} /></button>
            <button title="鍒犻櫎鑺傜偣" aria-label="鍒犻櫎鑺傜偣" onClick={() => { (deleteCanvasNode || deleteNode)(node.id); setShowMenu(false); }}><SvgIcon name="trash" size={15} /></button>
            <button title="鍏抽棴" aria-label="鍏抽棴" onClick={() => setShowMenu(false)}><SvgIcon name="close" size={15} /></button>
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
      {/* AI 鐢熸垚涓細瑕嗙洊寮忚繘搴﹂伄缃?+ 杩涘害鏉?*/}
      {(node.status === 'loading' || node.status === 'processing') && (
        <div className="lib-node-progress-overlay" data-status={node.status}>
          <div className="lib-node-progress-text">
            {node.status === 'loading' ? '鍑嗗鐢熸垚鈥? : 'AI 鐢熸垚涓€?}
          </div>
          <div className="lib-node-progress-track">
            <div className="lib-node-progress-bar" />
          </div>
          <div className="lib-node-progress-sub">璇风◢鍊?/div>
        </div>
      )}
      {savePromptOpen && createPortal(
        <React.Suspense fallback={null}><SaveToPromptLibraryModal
          isOpen={savePromptOpen}
          onClose={() => setSavePromptOpen(false)}
          defaultPrompt={promptLibraryPrompt}
          defaultName={`${getNodeDisplayName(node)} 鎻愮ず璇峘}
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
            // 3D 瀵兼紨鍙拌妭鐐归粯璁や互瀵兼紨鍙板唴榛樿鏋勫浘涓虹缉鐣ュ浘锛岀敾甯冧笂涓€鐪煎彲鍒嗚鲸
            updateNode?.(node.id, { thumbnail: dataUrl });
          }}
          onOutputView={(dataUrl, meta) => {
            const targetId = createLinkedNode?.(node.id, 'text-to-image', {
              width: 280,
              height: 220,
              status: 'idle',
              prompt: '鍩轰簬瀵兼紨鍙?3D 鏋勫浘鍙傝€冪敓鎴愮敾闈紝淇濇寔鎽勫奖鏈鸿瑙掋€佷富浣撲綅缃拰绌洪棿鍏崇郴銆?,
              options: {
                displayName: '鏋勫浘鍙傝€?,
                generationType: 'image-to-image',
                mediaFeature: '鏋勫浘鍙傝€?,
                sourceFeature: 'director-stage',
                sourceImage: dataUrl,
                referenceImages: [{ id: `ref-stage-${Date.now()}`, name: '瀵兼紨鍙版瀯鍥?, url: dataUrl }],
                inputRows: [{ id: `row-stage-${Date.now()}`, feature: 'image-to-image', text: '@瀵兼紨鍙版瀯鍥?鍩轰簬 3D 鏋勫浘鍙傝€冪敓鎴愮敾闈€? }],
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
              // 姣忓彴鎽勫奖鏈哄鍑虹殑鐢婚潰閮芥槸鐙珛鑺傜偣锛岀旱鍚戞帓鍒楅伩鍏嶉噸鍙?              const targetId = createLinkedNode?.(node.id, 'text-to-image', {
                x: baseX,
                y: baseY + index * (nodeHeight + gap),
                width: nodeWidth,
                height: nodeHeight,
                // 瀵煎嚭鏈轰綅鎴浘鐩存帴鏄剧ず鍦ㄧ敾甯冭妭鐐逛笂锛堜笌涓婁紶鑺傜偣涓€鑷达級
                status: 'success',
                prompt: view.name || `鎽勫奖鏈?{index + 1}`,
                thumbnail: view.dataUrl,
                result: { url: view.dataUrl, type: 'image' },
                options: {
                  displayName: view.name || `鎽勫奖鏈?{index + 1}`,
                  generationType: 'image-to-image',
                  mediaFeature: '鏋勫浘鍙傝€?,
                  sourceFeature: 'director-stage',
                  sourceImage: view.dataUrl,
                  referenceImages: [{ id: `ref-stage-${baseStamp}-${index}`, name: view.name || '瀵兼紨鍙版瀯鍥?, url: view.dataUrl }],
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
              prompt: '鍩轰簬瀵兼紨鍙板姩鐢婚瑙堢殑鍙傝€冭棰戯紝淇濇寔闀滃ご杩愬姩銆佷富浣撹繍鍔ㄨ建杩瑰拰绌洪棿鍏崇郴銆?,
              thumbnail: undefined,
              result: { url: video.dataUrl, type: 'video' },
              options: {
                displayName: '鍔ㄧ敾棰勮鍙傝€?,
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
              prompt: '鍏ㄦ櫙瑙嗗浘鎴彇',
              thumbnail: dataUrl,
              result: { url: dataUrl, type: 'image' },
              options: {
                displayName: '鍏ㄦ櫙瑙嗗浘',
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

// 娴呮瘮杈冧袱涓瓧绗︿覆鏁扮粍鏄惁鐩哥瓑锛堢敤浜?incomingImageNodeIds 绛夋瘡娆″悓姝ラ兘鏂板缓鐨勬暟缁勶級
function shallowArrayEqual(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return (a?.length || 0) === (b?.length || 0);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// 鑷畾涔夋瘮杈冨嚱鏁帮細syncFlowNodes 姣忔閮戒細閲嶅缓鎵€鏈夎妭鐐圭殑 data 瀵硅薄锛?// 榛樿娴呮瘮杈冧細瀵艰嚧鎵€鏈夎妭鐐瑰湪浠绘剰涓€涓妭鐐瑰彉鍖?閫変腑鏃跺叏閮ㄩ噸娓叉煋锛岃妭鐐瑰鏃朵弗閲嶅崱椤裤€?// 杩欓噷鍙湪鐪熸褰卞搷璇ヨ妭鐐规覆鏌撶殑瀛楁鍙樺寲鏃舵墠閲嶆覆鏌撱€?function areWorkflowNodePropsEqual(prev: any, next: any): boolean {
  if (prev.id !== next.id) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.dragging !== next.dragging) return false;
  const a = prev.data || {};
  const b = next.data || {};
  if (a === b) return true;
  // 鑺傜偣鏁版嵁寮曠敤锛坰tore 瀵规湭鍙樻洿鑺傜偣淇濇寔鍚屼竴寮曠敤锛?  if (a.node !== b.node) return false;
  if (a.isInputConnected !== b.isInputConnected) return false;
  if (a.isOutputConnected !== b.isOutputConnected) return false;
  // activeInputNodeId 鏄叏灞€鍊硷紝浣嗗彧鏈夌瓑浜?鏇剧瓑浜庢湰鑺傜偣 id 鏃舵墠褰卞搷娓叉煋
  const prevActive = a.activeInputNodeId === prev.id;
  const nextActive = b.activeInputNodeId === next.id;
  if (prevActive !== nextActive) return false;
  if (a.referencePickActive !== b.referencePickActive) return false;
  if (a.referencePicked !== b.referencePicked) return false;
  // 鍏变韩鍥炶皟锛堝潎涓?useCallback 绋冲畾寮曠敤锛屽彉鍖栨椂闇€瑕佹洿鏂帮級
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
  // 鏋勫缓姣忎釜鑺傜偣鐨勮緭鍏ユ簮鑺傜偣鏄犲皠
  const incomingImageNodes: Record<string, string[]> = {};
  // 璁板綍姣忎釜鑺傜偣涓婃父杩炵嚎涓€屽浘鐗囥€嶆潵婧愮殑鏁伴噺锛堢敤浜庤棰戣妭鐐癸細1 寮犫啋鍥剧敓瑙嗛锛? 寮犫啋棣栧熬甯э級
  const incomingImageCounts: Record<string, number> = {};
  // 璁板綍姣忎釜鑺傜偣涓婃父杩炵嚎鑺傜偣鐨勫獟浣撶被鍨嬶紙image/video/audio锛夛紝
  // 鐢ㄤ簬鍒ゆ柇鈥滃墠闈㈣繛绾胯棰戜负鑺傜偣鈥濇垨鈥滃鏍煎紡缁勫悎浣滀负鍙傝€冣€濇椂寮哄埗鍙兘浣跨敤鍏ㄨ兘鍙傝€?  const incomingMediaKinds: Record<string, string[]> = {};
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
      // 缁熻涓婃父杩炵嚎涓€屽浘鐗囥€嶆潵婧愭暟閲忥紙鍥剧墖鑺傜偣 / 鍥剧墖缁撴灉 / 鍙傝€冨浘 / 缂╃暐鍥撅紝涓旈潪瑙嗛/闊抽锛?      const isPureImageSource = (isImageNode || hasImageResult || hasReferenceImage || hasThumbnail) && !hasVideoResult && !hasAudioResult;
      if (isPureImageSource) {
        incomingImageCounts[edge.target] = (incomingImageCounts[edge.target] || 0) + 1;
      }
      // 鍒ゅ畾涓婃父鑺傜偣濯掍綋绫诲瀷锛堣棰戜紭鍏堬紝鍏舵闊抽锛屽叾娆″浘鐗囷級
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
  return Object.values(nodes).map((n) => {
    const incomingKinds = incomingMediaKinds[n.id] || [];
    // 寮哄埗鍏ㄨ兘鍙傝€冪殑鏉′欢锛?    // 1. 涓婃父杩炵嚎涓寘鍚棰戣妭鐐癸紙鍓嶉潰杩炵嚎瑙嗛涓鸿妭鐐癸級
    // 2. 涓婃父杩炵嚎涓哄绉嶅獟浣撴牸寮忕粍鍚堬紙瑙嗛/鍥剧墖/闊抽娣峰悎锛屽鏍煎紡缁勫悎浣滀负鍙傝€冿級
    const forceOmniReference = incomingKinds.includes('video') || incomingKinds.length > 1;
    const connected = inputConnected.has(n.id) || outputConnected.has(n.id);
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
      id: n.id,
      type: 'workflowNode',
      position: { x: n.x, y: n.y },
      width: hasDisplayContent ? 280 : n.width,
      height: hasDisplayContent ? mediaHeight : n.height,
      style: hasDisplayContent ? { width: 280, height: mediaHeight } : { width: n.width, height: n.height },
      data: { node: n, isInputConnected: inputConnected.has(n.id), isOutputConnected: outputConnected.has(n.id), incomingImageNodeIds: incomingImageNodes[n.id] || [], incomingImageCount: incomingImageCounts[n.id] || 0, incomingMediaKinds: incomingKinds, forceOmniReference, activeInputNodeId: null, setActiveInputNodeId: undefined },
    };
  });
}

// ==================== 宸ュ叿鏍忓瓙鑿滃崟缁勪欢 ====================

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

// ==================== 璧勪骇閫夋嫨闈㈡澘锛堝脊绐楀紡锛屽甫鍥剧墖/瑙嗛/闊抽鍒嗙被 tab锛?====================

interface AssetPickerPanelProps {
  open: boolean;
  onClose: () => void;
  onSelectAsset: (asset: { id: string; name: string; type: string; path: string; thumbnail?: string }) => void;
}

const ASSET_TABS = [
  { id: 'all', label: '鍏ㄩ儴', icon: 'box' },
    { id: 'image', label: '鍥剧墖', icon: 'image', desc: '娴锋姤銆佸垎闀溿€佽鑹茶璁? },
    { id: 'video', label: '瑙嗛', icon: 'video', desc: '鍒涙剰骞垮憡銆佸姩鐢汇€佺數褰? },
    { id: 'audio', label: '闊抽', icon: 'audio', desc: '闊虫晥銆侀厤闊炽€侀煶涔? },
] as const;
type AssetTabId = typeof ASSET_TABS[number]['id'];

const AssetPickerPanel: React.FC<AssetPickerPanelProps> = ({ open, onClose, onSelectAsset }) => {
  // 鎬ц兘浼樺寲锛氫粎璁㈤槄 assets 鍒囩墖锛岄伩鍏嶉潰鏉垮父椹绘寕杞藉鑷寸殑鏁翠粨璁㈤槄
  const assets = useAppStore(state => state.assets);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<AssetTabId>('all');

  // 鍙彇鏂囦欢璧勪骇锛屼笉鏄剧ず鏂囦欢澶?  const allFileAssets = useMemo(() => Object.values(assets).filter(a => !String(a.type).startsWith('__folder') && String(a.type) !== 'folder'), [assets]);

  // 鎸?tab 鍜屾悳绱㈠唴瀹硅繃婊?  const filteredItems = useMemo(() => {
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
          <span className="asset-picker-title">璧勪骇搴?/span>
          <button className="asset-picker-close" onClick={onClose}><SvgIcon name="close" size={16} /></button>
        </div>

        {/* 鍒嗙被 tab + 鎼滅储妗嗗悓涓€琛?*/}
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
              placeholder="鎼滅储璧勪骇..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="asset-picker-grid">
          {filteredItems.length === 0 && (
            <div className="asset-picker-empty">鏆傛棤璧勪骇</div>
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

// ==================== 娣诲姞鑺傜偣闈㈡澘 ====================

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
        <div className="add-node-panel-title">娣诲姞鑺傜偣</div>
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
        <div className="add-node-section-title">娣诲姞璧勬簮</div>
        <div className="add-node-list add-node-resource-list">
          <button className="add-node-item" onClick={() => onSelect('upload')}>
            <span className="add-node-item-icon"><SvgIcon name="upload" size={20} /></span>
            <div className="add-node-item-info">
              <span className="add-node-item-label">涓婁紶</span>
              <span className="add-node-item-desc">鍙笂浼犲浘鐗囥€佽棰戙€侀煶棰戞枃浠?/span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 鍏抽棴纭寮圭獥 ====================

function CloseConfirmDialog({ open, onCancel, onConfirm }: { open: boolean; onCancel: () => void; onConfirm: () => void }) {
  if (!open) return null;
  return (
    <div className="close-confirm-overlay" onClick={onCancel}>
      <div className="close-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="close-confirm-title">纭鍏抽棴鐢诲竷锛?/div>
        <div className="close-confirm-desc">鏈繚瀛樼殑鏇存敼灏嗕細涓㈠け锛屽缓璁厛淇濆瓨銆?/div>
        <div className="close-confirm-actions">
          <button className="close-confirm-btn close-confirm-cancel" onClick={onCancel}>鍙栨秷</button>
          <button className="close-confirm-btn close-confirm-ok" onClick={onConfirm}>纭鍏抽棴</button>
        </div>
      </div>
    </div>
  );
}

// ==================== 鍙充笂瑙掓搷浣滄爮 ====================

function CanvasTopBar() {
  // 鎬ц兘浼樺寲锛氫粎璁㈤槄鎵€闇€鍒囩墖锛岄伩鍏嶉《鏍忓湪浠绘剰鐘舵€佸彉鍖栨椂閲嶆覆鏌?  const setActiveCanvas = useAppStore(state => state.setActiveCanvas);
  const activeCanvasId = useAppStore(state => state.activeCanvasId);
  const canvasHistory = useAppStore(state => state.canvasHistory);
  const canvas = canvasHistory.find(c => c.id === activeCanvasId);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('淇濆瓨鎴愬姛');
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
    flashToast('淇濆瓨鎴愬姛');
  }, [activeCanvasId, flashToast]);

  const handleExport = useCallback(() => {
    const state = useAppStore.getState();
    const current = state.canvasHistory.find((c: any) => c.id === activeCanvasId);
    const exportData = {
      type: 'yijing-canvas',
      version: 1,
      exportedAt: Date.now(),
      name: current?.name || canvas?.name || '鏈懡鍚嶇敾甯?,
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
    flashToast('瀵煎嚭鎴愬姛');
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
          flashToast('鏂囦欢鏍煎紡閿欒');
          return;
        }
        const state = useAppStore.getState();
        const importName = `${parsed?.name || '瀵煎叆鐢诲竷'} (瀵煎叆)`;
        const newCanvasId = state.saveCanvas(importName, {
          nodes: importedNodes,
          edges: importedEdges,
          canvasGridVisible: parsed?.canvasGridVisible ?? state.canvasGridVisible,
        }, getCanvasFirstImageThumbnail(importedNodes));
        state.setActiveCanvas(newCanvasId);
        state.loadCanvas(newCanvasId);
        flashToast('瀵煎叆鎴愬姛');
      } catch (err) {
        flashToast('瀵煎叆澶辫触');
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
    setEditName(canvas?.name || '鏈懡鍚嶇敾甯?);
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
          <span className="canvas-top-title" onClick={startRename} title="鐐瑰嚮閲嶅懡鍚?><SvgIcon name="canvas" size={15} /> {canvas?.name || '鏈懡鍚嶇敾甯?}</span>
        )}
        <div className="canvas-top-actions">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
          <button className="canvas-top-btn export-btn" onClick={handleExport} title="瀵煎嚭鐢诲竷锛堝惈鑺傜偣涓庢彁绀鸿瘝锛?><SvgIcon name="save" size={14} /> 瀵煎嚭</button>
          <button className="canvas-top-btn import-btn" onClick={handleImportClick} title="瀵煎叆鐢诲竷"><SvgIcon name="upload" size={14} /> 瀵煎叆</button>
          <button className="canvas-top-btn save-btn" onClick={handleSave} title="淇濆瓨鐢诲竷"><SvgIcon name="save" size={14} /> 淇濆瓨</button>
          <button className="canvas-top-btn close-btn" onClick={() => setShowCloseConfirm(true)} title="鍏抽棴鐢诲竷"><SvgIcon name="close" size={14} /> 鍏抽棴</button>
        </div>
      </div>
      {showToast && (
        <div className="canvas-toast"><SvgIcon name="save" size={14} /> {toastMsg}</div>
      )}
      <CloseConfirmDialog open={showCloseConfirm} onCancel={() => setShowCloseConfirm(false)} onConfirm={confirmClose} />
    </>
  );
}

// ==================== 搴曢儴鎮诞宸ュ叿鏍?====================

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
      <span className="zoom-label" onClick={() => setShowMenu(!showMenu)} title="鐐瑰嚮閫夋嫨缂╂斁姣斾緥">{zoom}%</span>
      {showMenu && (
        <div className="zoom-dropdown">
          <div className="zoom-dropdown-item" onClick={() => handleSetZoom(50)}>缂╂斁鑷?50%</div>
          <div className={`zoom-dropdown-item ${zoom === 100 ? 'active' : ''}`} onClick={() => handleSetZoom(100)}>缂╂斁鑷?100%</div>
          <div className={`zoom-dropdown-item ${zoom === 125 ? 'active' : ''}`} onClick={() => handleSetZoom(125)}>缂╂斁鑷?125%</div>
          <div className={`zoom-dropdown-item ${zoom === 200 ? 'active' : ''}`} onClick={() => handleSetZoom(200)}>缂╂斁鑷?200%</div>
          <div className={`zoom-dropdown-item ${zoom === 800 ? 'active' : ''}`} onClick={() => handleSetZoom(800)}>缂╂斁鑷?800%</div>
          <div className="zoom-divider" />
          <div className="zoom-dropdown-item" onClick={handleZoomIn}>鏀惧ぇ</div>
          <div className="zoom-dropdown-item" onClick={handleZoomOut}>缂╁皬</div>
          <div className="zoom-dropdown-item" onClick={handleFitView}>閫傚簲灞忓箷</div>
        </div>
      )}
      <button onClick={handleZoomIn} title="鏀惧ぇ">+</button>
      <button onClick={handleZoomOut} title="缂╁皬">鈭?/button>
      <button onClick={handleFitView} title="閫傚簲灞忓箷">猡?/button>
      <button
        className={canvasGridVisible ? 'active' : ''}
        onClick={onToggleGrid}
        title="缃戞牸鍒囨崲"
      >
        <SvgIcon name="grid" size={15} />
      </button>
    </div>
  );
}

// ==================== 搴曢儴宸ュ叿鏍忥紙FloatingToolbar锛?====================

const TOOLBAR_MENUS: Record<string, MenuItem[]> = {
  'add-node': [
    { id: 'text', label: '鏂囨湰', icon: 'text', desc: '鍓ф湰銆佸箍鍛婅瘝銆佸搧鐗屾枃妗? },
    { id: 'image', label: '鍥剧墖', icon: 'image', desc: '娴锋姤銆佸垎闀溿€佽鑹茶璁? },
    { id: 'video', label: '瑙嗛', icon: 'video', desc: '鍒涙剰骞垮憡銆佸姩鐢汇€佺數褰? },
    { id: 'panorama', label: '鍏ㄦ櫙鍥?, icon: 'panorama', desc: '鐢熸垚720掳鍏ㄦ櫙鍦烘櫙锛岀偣鍑昏繘鍏ュ叏鏅极娓? },
    { id: 'director-stage', label: '3D瀵兼紨鍙?, icon: 'stage', desc: '3D鍦烘櫙鎼缓銆侀暅澶磋皟搴︿笌杩愰暅' },
    { id: 'audio', label: '闊抽', icon: 'audio', desc: '闊虫晥銆侀厤闊炽€侀煶涔? },
    { id: 'divider', label: '', desc: '' },
    { id: 'upload', label: '涓婁紶', icon: 'upload', desc: '涓婁紶鍥剧墖銆佽棰戙€侀煶棰戞枃浠? }
  ],
  'history': [
    { id: 'history-recent', label: '鏈€杩戜娇鐢?, icon: 'history', desc: '鏈€杩戠敓鎴愮殑鑺傜偣' },
    { id: 'history-favorite', label: '鏀惰棌', icon: 'star', desc: '鏀惰棌鐨勮妭鐐规ā鏉? }
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
          <span>娣诲姞鑺傜偣</span>
        </button>
        <button
          className="float-tool-btn"
          onClick={onOpenAssetPicker}
          title="璧勪骇"
        >
          <span className="float-tool-icon"><SvgIcon name="box" size={16} /></span>
          <span>璧勪骇</span>
        </button>
        <button
          ref={buttonRefs['history']}
          className={`float-tool-btn ${activeMenu === 'history' ? 'active' : ''}`}
          onClick={() => handleButtonClick('history')}
          title="鍘嗗彶璁板綍"
        >
          <span className="float-tool-icon"><SvgIcon name="history" size={16} /></span>
          <span>鍘嗗彶璁板綍</span>
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

// ==================== 涓荤粍浠?====================

type CanvasProps = { canvasId?: string; onBack?: () => void };

function CanvasInner(_props: CanvasProps = {}) {
  // 鎬ц兘浼樺寲锛氫粎璁㈤槄 nodes 鍒囩墖锛宎ctions 涓虹ǔ瀹氬紩鐢紝閬垮厤鏁翠粨璁㈤槄瀵艰嚧鐨勫叏閲忛噸娓叉煋
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

  // 鏄惁瀛樺湪澶氶€夛紙浠呭湪澶氶€夋椂闇€瑕佽窡闅忚鍙ｆ洿鏂版壒閲忛€夋锛岄伩鍏嶆瘡甯у钩绉婚兘瑙﹀彂閲嶆覆鏌擄級
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
    // 瑙嗛缁撴灉锛氫紭鍏堜娇鐢ㄨ棰戝湴鍧€锛岀缉鐣ュ浘浜ょ敱鍓嶇浠庤棰戦甯х敓鎴?    if (sourceNode.result?.type === 'video' && sourceNode.result.url) {
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
      const cid = state.saveCanvas('鑷姩淇濆瓨鐢诲竷', {
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
      // 鏂囨湰/涓婃父鎻愮ず璇嶄笉鍐嶇洿鎺ュ啓杩涜緭鍏ユ锛屽彧鍦ㄧ敓鎴愭彁浜ゆ椂缁?upstreamPrompt 璧蜂綔鐢紱浠呭綋鏄惧紡鎸囧畾 overrides.prompt 鏃舵墠鍥炲～杈撳叆妗?      prompt: overrides.prompt ?? '',
      thumbnail: overrides.thumbnail,
      // 閫忎紶 result / meta锛岀‘淇濆婕斿彴瀵煎嚭鐨勮棰戙€佹埅鍥捐兘鍍忎笂浼犺妭鐐逛竴鏍风洿鎺ュ睍绀哄獟浣?      ...(overrides.result ? { result: overrides.result } : {}),
      ...(overrides.meta ? { meta: overrides.meta } : {}),
      aspectRatio: overrides.aspectRatio,
      resolution: overrides.resolution,
      size: overrides.size,
      workflow: overrides.workflow,
      options: {
        displayName: createNodeDisplayName(targetType, state.nodes),
        generationType: targetType,
        upstreamPrompt: (sourceNode.result?.url || sourceNode.thumbnail) && sourceNode.result?.type !== 'text' ? undefined : (sourceNode.result?.type === 'text' && sourceNode.result.text?.trim() ? sourceNode.result.text : (sourceNode.prompt || '')),
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
            // 璇ヨ妭鐐规棤浠讳綍鍙樺寲锛屽鐢ㄦ棫瀵硅薄寮曠敤锛堜繚鐣?selected / measured 绛?React Flow 鍐呴儴鐘舵€侊級
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
      // 瀹屽叏娌℃湁鍙樺寲鏃惰繑鍥炴棫鏁扮粍寮曠敤锛岄伩鍏嶈Е鍙?React Flow 鐨勯噸鏂版覆鏌?      return changed ? next : current;
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

  // 璁＄畻姣忎釜缁勭殑灞忓箷杈圭晫锛堢敤浜庢覆鏌撳渾瑙掔伆鑹茬粍閫夋锛夛紝璺熼殢瑙嗗彛绉诲姩鏇存柊
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

  // 灏嗛€変腑鑺傜偣鎵撶粍锛欰lt+G
  const groupSelectedNodes = useCallback(() => {
    const selectedIds = nodes.filter(node => node.selected).map(node => node.id);
    if (selectedIds.length < 2) return;
    const state = useAppStore.getState();
    const groupId = `group-${Date.now()}`;
    const groupIndex = nodeGroups.length + 1;
    const label = `缁勫悎${groupIndex}`;
    // 缁勫悎鍐呰妭鐐规爣璁颁负鍙傝€冨唴瀹癸紙鍙傝€冨浘/鍙傝€冭棰?鍙傝€冮煶棰?鎻愮ず璇嶏級锛屼緵涓嬩釜鑺傜偣寮曠敤
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

  // 鏀堕泦鏌愪釜缁勫唴鎵€鏈夎妭鐐圭殑鍙傝€冨唴瀹癸紙鍥剧墖/瑙嗛/闊抽/鎻愮ず璇嶏級
  const collectGroupReferences = useCallback((nodeIds: string[]) => {
    const state = useAppStore.getState();
    const referenceImages: Array<{ id: string; name: string; url: string; type?: string; nodeId?: string }> = [];
    const promptParts: string[] = [];
    const upstreamNodeIds: string[] = [];
    nodeIds.forEach(id => {
      const node = state.nodes[id];
      if (!node) return;
      upstreamNodeIds.push(id);
      const url = node.result?.url || node.thumbnail || (Array.isArray(node.options?.referenceImages) ? node.options.referenceImages[0]?.url : undefined);
      const mediaType = node.result?.type || 'image';
      if (url) {
        referenceImages.push({ id: `group-ref-${id}-${Date.now()}`, name: getNodeDisplayName(node), url, type: mediaType, nodeId: id });
      }
      const text = node.result?.type === 'text' && node.result.text?.trim() ? node.result.text : (node.prompt || '');
      if (text.trim()) promptParts.push(text.trim());
    });
    return { referenceImages, prompt: composePromptParts(...promptParts), upstreamNodeIds };
  }, []);

  const createBatchLinkedNode = useCallback((sourceIds: string[], targetType: AINodeType, flowPosition?: { x: number; y: number }, side: 'left' | 'right' = 'right') => {
    if (sourceIds.length === 0) return;
    if (!flowPosition && !selectedBounds) return;
    const targetX = flowPosition?.x ?? (side === 'right' ? selectedBounds!.left + selectedBounds!.width + 140 : Math.max(20, selectedBounds!.left - 300));
    const targetY = flowPosition?.y ?? (selectedBounds!.top + selectedBounds!.height / 2 - 110);
    // 鏀堕泦鎵€鏈夋潵婧愯妭鐐圭殑鍙傝€冨唴瀹癸紙鍙傝€冨浘/鍙傝€冭棰?鍙傝€冮煶棰?鎻愮ず璇嶏級锛屼綔涓轰笅涓妭鐐圭殑鐢熸垚鍙傝€?    const { referenceImages, prompt: referencePrompt } = collectGroupReferences(sourceIds);
    const newId = addNode({
      type: targetType,
      provider: 'openai',
      x: targetX,
      y: targetY,
      width: 280,
      height: 220,
      status: 'idle',
      prompt: referencePrompt || '',
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

    // 1. 鏂囨湰鍐呭浼犻€掞細鎶婃簮鑺傜偣鐨勭粨鏋滄枃鏈?prompt 鎷兼帴鍒扮洰鏍囪妭鐐?    // 鍚屾椂鎶婃簮鑺傜偣鑷韩鐨勪笂娓告彁绀鸿瘝锛坲pstreamPrompt锛変竴骞跺悜涓嬩紶閫掞紝瀹炵幇璺ㄨ妭鐐圭殑閾惧紡寮曠敤
    // 渚嬪锛氭枃鏈妭鐐?鈫?鍥剧墖鑺傜偣 鈫?瑙嗛鑺傜偣锛岃棰戣妭鐐逛篃鑳借幏寰楁渶鍒濇枃鏈妭鐐圭殑鍐呭
    const sourceOwnText = sourceNode.result?.type === 'text' && sourceNode.result.text?.trim() ? sourceNode.result.text : (sourceNode.prompt || '');
    const sourceUpstreamText = typeof sourceNode.options?.upstreamPrompt === 'string' ? sourceNode.options.upstreamPrompt.trim() : '';
    const sourceText = composePromptParts(sourceUpstreamText || undefined, sourceOwnText || undefined);
    const targetGenType = String(targetNode.options?.generationType || targetNode.type || '');
    const sourceGenType = String(sourceNode.options?.generationType || sourceNode.type || '');
    const isVideoTarget = ['text-to-video', 'image-to-video', 'img2video', 'frame-to-video', 'video-extend', 'video-remix', 'live-portrait', 'video-super-resolution', 'video-interpolate'].includes(targetGenType);
    const isImageRefTarget = ['image-upscale', 'image-to-image', 'image-blend', 'text-to-image'].includes(targetGenType);
    const sourceHasResult = Boolean(sourceNode.result?.url || sourceNode.thumbnail);
    const sourceResultUrl = sourceNode.result?.url || sourceNode.thumbnail || '';
    const sourceResultType = sourceNode.result?.type || 'image';
    const sourceIsImage = sourceResultType === 'image' && sourceHasResult;
    // 婧愯妭鐐硅嫢宸茬敓鎴愬獟浣撶粨鏋滐紙鍥剧墖/瑙嗛/闊抽锛夛紝杩炵嚎鍙綔涓哄弬鑰冨浘/鍙傝€冪礌鏉愪紶閫掞紝涓嶅啀鎶婁笂娓告彁绀鸿瘝鑷姩鐏屽叆涓嬫父鑺傜偣
    const sourceProducedMedia = sourceHasResult && (sourceResultType === 'image' || sourceResultType === 'video' || sourceResultType === 'audio');
    const targetIsPanorama = targetNode.options?.panoramaType === '720' || targetNode.options?.outputType === 'panorama';
    const sourceIsPanorama = sourceNode.options?.panoramaType === '720' || sourceNode.options?.outputType === 'panorama';
    const targetIsDirectorStage = targetNode.type === 'director-stage';

    // 鏋勫缓 update 鐨?options 閮ㄥ垎
    const newOptions: Record<string, any> = {
      ...targetNode.options,
      upstreamNodeIds: Array.from(new Set([...(targetNode.options?.upstreamNodeIds || []), sourceId])),
    };

    // 鍏ㄦ櫙鍥捐妭鐐癸細鐩存帴杩炴帴鍥剧墖鍚庤嚜鍔ㄤ互璇ュ浘鐗囦负婧愮敓鎴?720掳 鍏ㄦ櫙棰勮
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

    // 3D 瀵兼紨鍙帮細杩炴帴鍏ㄦ櫙鍥炬椂锛岄粯璁や互鍏ㄦ櫙鍥句綔涓哄婕斿彴榛樿鍦烘櫙
    if (targetIsDirectorStage && sourceIsPanorama && sourceIsImage) {
      newOptions.defaultSceneType = 'panorama';
      newOptions.panoramaSceneUrl = sourceResultUrl;
      newOptions.panoramaSceneNodeId = sourceId;
    }

    // 2. 鏅鸿兘鍙傝€冨浘浼犻€掞細鍥剧墖鑺傜偣 鈫?瑙嗛鑺傜偣锛岃嚜鍔ㄨ缃甯у弬鑰冨浘
    if (sourceHasResult && (isVideoTarget || isImageRefTarget)) {
      const existingRefs = Array.isArray(targetNode.options?.referenceImages) ? targetNode.options.referenceImages : [];
      // 閬垮厤閲嶅娣诲姞鍚屼竴涓簮
      if (!existingRefs.some((r: any) => r.nodeId === sourceId)) {
        const refKind: 'image' | 'video' | 'audio' = sourceResultType === 'video' ? 'video' : sourceResultType === 'audio' ? 'audio' : 'image';
        const newRefId = `ref-${sourceId}-${Date.now()}`;
        newOptions.referenceImages = [
          ...existingRefs,
          { id: newRefId, name: sourceNode.options?.displayName || sourceGenType, url: sourceResultUrl, type: sourceResultType, kind: refKind, thumbnail: refKind === 'image' ? sourceResultUrl : undefined, nodeId: sourceId },
        ];
        // 瑙嗛鍙傝€冿細寮傛鎶藉彇棣栧抚浣滀负缂╃暐鍥撅紝鍥炲啓鍒扮洰鏍囪妭鐐圭殑 referenceImages
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
            .catch(() => { /* 鎶藉彇澶辫触鏃朵繚鐣欒棰戞湰韬紝video 鏍囩鍏滃簳鏄剧ず */ });
        }
      }
    }

    if (sourceText && !sourceProducedMedia) {
      newOptions.upstreamPrompt = composePromptParts(targetNode.options?.upstreamPrompt, sourceText);
    }

    const updatePayload: Parameters<ReturnType<typeof useAppStore['getState']>['updateNode']>[1] = {
      options: newOptions,
    };
    // 涓婃父鏂囨湰浠呯粡 upstreamPrompt 鍦ㄧ敓鎴愭彁浜ゆ椂鐢熸晥锛屼笉鍐嶅啓鍏ヤ笅娓歌妭鐐圭殑鍙杈撳叆妗?
    // 鍏ㄦ櫙鍥捐妭鐐癸細杩炴帴鍥剧墖鍚庣洿鎺ョ敓鎴?720掳 鍏ㄦ櫙棰勮锛堟棤闇€杈撳叆妗嗭級
    if (targetIsPanorama && sourceIsImage) {
      updatePayload.status = 'loading';
      updatePayload.prompt = '720掳鍏ㄦ櫙鍥撅細浠ヨ繛鎺ョ殑鍥剧墖涓哄満鏅富浣擄紝鐢熸垚鍙敤浜庡叏鏅瑙堢殑 equirectangular 鍏ㄦ櫙鍥撅紝宸﹀彸杈圭紭鏃犵紳琛旀帴锛?:1 妯悜姣斾緥锛屾棤榛戣竟銆?;
      state.updateNode(targetId, updatePayload);
      try { state.executeNode(targetId); } catch {}
      return;
    }

    state.updateNode(targetId, updatePayload);
  }, [setEdges, syncFlowNodes]);

  // 鍔╂墜锛堢尗澶撮拱锛夐€氳繃浜嬩欢璇锋眰杩炴帴涓や釜鑺傜偣锛屽鐢?handleConnect 鐨勫弬鑰冨浘/鏂囨湰浼犻€掗€昏緫
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

  // 杩炵嚎鍦ㄥ厛銆佷笂娓稿悗鐢熸垚鐨勫満鏅細褰撲笂娓歌妭鐐逛骇鍑虹粨鏋滃悗锛岃嚜鍔ㄦ妸鍏剁粨鏋滀綔涓轰笅娓歌妭鐐圭殑鍙傝€冨浘/婧愬浘琛ヨ繘鍘汇€?  // handleConnect 鍙湪鈥滆繛绾挎椂涓婃父宸叉湁缁撴灉鈥濇墠娉ㄥ叆鍙傝€冨浘锛涙澶勭敤鍝嶅簲寮忓壇浣滅敤鍏滃簳鍚庣敓鎴愮殑鎯呭喌銆?  useEffect(() => {
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
      // 鍏ㄦ櫙鍥捐妭鐐规棤杈撳叆妗嗭紝鍙兘闈犺繛绾胯嚜鍔ㄧ敓鎴愶紱鑻ヨ繛绾垮湪鍏堛€佷笂娓稿悗鍑哄浘锛岃繖閲屽厹搴曡Е鍙戠敓鎴愩€?      if (targetIsPanorama && sourceType === 'image') {
        const panoAlready = targetNode.options?.sourceImage === sourceUrl && (targetNode.status === 'loading' || targetNode.status === 'processing' || !!targetNode.result?.url);
        if (panoAlready) return;
        if (targetNode.result?.url || targetNode.status === 'loading' || targetNode.status === 'processing') return;
        state.updateNode(edge.target as string, {
          status: 'loading',
          prompt: '720掳鍏ㄦ櫙鍥撅細浠ヨ繛鎺ョ殑鍥剧墖涓哄満鏅富浣擄紝鐢熸垚鍙敤浜庡叏鏅瑙堢殑 equirectangular 鍏ㄦ櫙鍥撅紝宸﹀彸杈圭紭鏃犵紳琛旀帴锛?:1 妯悜姣斾緥锛屾棤榛戣竟銆?,
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
      // 瑙嗛鍙傝€冿細寮傛鎶藉彇棣栧抚浣滀负缂╃暐鍥撅紝鍥炲啓鍒扮洰鏍囪妭鐐圭殑 referenceImages
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
          .catch(() => { /* 鎶藉彇澶辫触鏃朵繚鐣欒棰戞湰韬紝video 鏍囩鍏滃簳鏄剧ず */ });
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
        const targetNode = state.nodes[edge.target];
        if (!targetNode) return;
        // 涓婃父鏂囨湰鑺傜偣瀹炴椂缂栬緫鏃讹紝鍙洿鏂颁笅娓哥殑 upstreamPrompt锛堟彁浜ゆ椂鐢熸晥锛夛紝涓嶈鐩栦笅娓稿彲瑙佽緭鍏ユ
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

  // 璧勪骇閫夋嫨鍥炶皟锛氬湪鐢诲竷涓績鍒涘缓瀵瑰簲绫诲瀷鑺傜偣
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
    // 浣跨敤璧勪骇璺緞浣滀负鍒濆缁撴灉锛岃妭鐐圭洿鎺ユ樉绀鸿璧勪骇
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

  // 閫夋嫨鑺傜偣绫诲瀷澶勭悊锛堝畾涔夊湪handleMenuSelect涔嬪墠閬垮厤TDZ锛?  const handleSelectNodeType = useCallback((type: AINodeType | 'upload' | 'panorama') => {
    const pendingBatch = addPanelState.batchSourceIds?.length ? {
      sourceIds: addPanelState.batchSourceIds,
      flowPosition: addPanelState.flowPosition,
    } : null;
    setAddPanelState({ open: false, position: null, attached: false });
    // 鍏ㄦ櫙鍥捐妭鐐癸細鍒涘缓閰嶇疆涓?720掳 鍏ㄦ櫙鐨勫浘鐗囪妭鐐?    if (type === 'panorama') {
      const panoramaOptions = {
        displayName: createNodeDisplayName('text-to-image', useAppStore.getState().nodes).replace('鍥剧墖鑺傜偣', '鍏ㄦ櫙鍥捐妭鐐?),
        generationType: 'image-to-image',
        mediaFeature: '720掳鍏ㄦ櫙鍥?,
        panoramaFeature: 'panorama-720',
        panoramaType: '720',
        outputType: 'panorama',
        imageRatio: '2:1',
        aspectRatio: '2:1',
        imageQuality: 'standard',
        imageClarity: '2K',
        apiCapability: 'image-to-720-panorama',
        workflowProject: 'image-to-720-panorama',
        // 鍏ㄦ櫙鍥捐妭鐐规棤闇€杈撳叆妗?瀛愬姛鑳斤紝鐩存帴杩炴帴鍥剧墖鍗冲彲鑷姩鐢熸垚涓夌淮鍏ㄦ櫙棰勮
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

  // 下拉菜单选择节点类型（保证和双击面板行为完全一致）
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
    const nodeType = typeMap[itemId];
    if (!nodeType) return;

    // 全景图节点：特殊处理
    if (nodeType === 'panorama') {
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
        _autoOpen: false,
      };
      const b = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
      const pos = { x: (b?.width || 800) / 2, y: (b?.height || 600) / 2 };
      addNode({
        type: 'text-to-image',
        provider: 'openai',
        x: pos.x - 140,
        y: pos.y - 80,
        width: 280,
        height: 220,
        status: 'idle',
        prompt: '',
        aspectRatio: '2:1',
        options: panoramaOptions,
      });
      setViewport100();
      return;
    }

    // 上传节点：特殊处理
    if (nodeType === 'upload') {
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
          const actualType = isImage ? 'text-to-image' : isVideo ? 'text-to-video' : 'audio2video';
          addNode({
            type: actualType,
            provider: 'openai',
            x, y,
            width: 280,
            height: 220,
            status: 'success',
            prompt: file.name,
            options: { displayName: createNodeDisplayName(actualType, useAppStore.getState().nodes) },
            result: { url: dataUrl, type: mediaType },
          });
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }

    // 普通节点类型
    const b = document.querySelector('.llib-canvas-area')?.getBoundingClientRect();
    const pos = { x: (b?.width || 800) / 2, y: (b?.height || 600) / 2 };
    addNode({
      type: nodeType as AINodeType,
      provider: 'openai',
      x: pos.x - 140,
      y: pos.y - 80,
      width: 280,
      height: 220,
      status: 'idle',
      prompt: '',
      options: { _autoOpen: true, displayName: createNodeDisplayName(nodeType as AINodeType, useAppStore.getState().nodes) },
    });
    setViewport100();
  }, [addNode, setViewport100]);

  // ==================== 閿洏蹇嵎閿?====================
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

  // Alt+G锛氬皢閫変腑鐨勫涓妭鐐规墦缁?  useEffect(() => {
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

  // 瑙ｆ暎鏌愪釜缁?  const ungroupNodes = useCallback((groupId: string) => {
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
              <SvgIcon name="chevron-left" size={15} /> 杩斿洖
            </button>
            <span>鐐瑰嚮鐢诲竷宸叉湁鍥剧墖浣滀负鍙傝€冿紝鍙閫?/span>
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
            <span>鍙屽嚮鐢诲竷鍒涘缓鑺傜偣</span>
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
            <span className="canvas-node-group-count">{group.nodeIds.length} 涓弬鑰?/span>
            <div className="canvas-node-group-actions">
              <button
                className="canvas-node-group-btn"
                title="浠ョ粍鍚堝唴瀹逛綔涓哄弬鑰冪敓鎴愪笅涓€涓妭鐐?
                onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); createBatchLinkedNode(group.nodeIds, 'text-to-image'); }}
              >
                <SvgIcon name="spark" size={13} />
              </button>
              <button
                className="canvas-node-group-btn"
                title="瑙ｆ暎缁勫悎"
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
          <button className="canvas-batch-plus left" onMouseDown={(event) => openBatchAddPanel(event, 'left')} title="鎷栨嫿鍒扮┖鐧藉娣诲姞骞舵壒閲忚繛绾? />
          <button className="canvas-batch-plus right" onMouseDown={(event) => openBatchAddPanel(event, 'right')} title="鎷栨嫿鍒扮┖鐧藉娣诲姞骞舵壒閲忚繛绾? />
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

// ==================== 鍙充晶鍙姌鍙犱晶杈规爮 ====================

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
  // 鎬ц兘浼樺寲锛氫粎璁㈤槄鎵€闇€鍒囩墖锛岄伩鍏嶆暣浠撹闃呭鑷翠晶杈规爮鍦ㄤ换鎰忕姸鎬佸彉鍖栨椂閲嶆覆鏌?  const canvasHistory = useAppStore(state => state.canvasHistory);
  const activeCanvasId = useAppStore(state => state.activeCanvasId);
  const updateCanvasName = useAppStore(state => state.updateCanvasName);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const currentCanvas = canvasHistory.find((c: any) => c.id === activeCanvasId);
  const canvasName = currentCanvas?.name || '鏈懡鍚嶇敾甯?;

  // 璧勪骇鍒楄〃锛氬彧鏄剧ず褰撳墠鐢诲竷鑺傜偣鐢熸垚鐨勮祫浜?  const assetList = useMemo(() => {
    const canvasAssets: any[] = [];
    nodes.forEach((node) => {
      const n = (node.data as any)?.node as AINode | undefined;
      if (!n) return;
      // 浠庤妭鐐圭殑 result/thumbnail 鎻愬彇璧勪骇
      if (n.result?.url) {
        canvasAssets.push({
          id: n.id + '-result',
          name: n.prompt?.slice(0, 30) || n.type || '鐢熸垚缁撴灉',
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
      {/* 鍒囨崲鎸夐挳锛氱嫭绔嬩簬渚ц竟鏍忓鍣紝濮嬬粓鍙 */}
      <button className={`sidebar-toggle ${collapsed ? 'collapsed' : ''}`} onClick={onToggle} title={collapsed ? '灞曞紑渚ц竟鏍? : '鏀惰捣渚ц竟鏍?}>
        {collapsed ? (
          <span className="toggle-arrow"><SvgIcon name="chevron-left" size={16} /></span>
        ) : (
          <span className="toggle-arrow"><SvgIcon name="chevron-right" size={16} /></span>
        )}
      </button>
      {/* 渚ц竟鏍忛潰鏉?*/}
      <div className={`canvas-sidebar ${collapsed ? 'collapsed' : ''}`}>

      {/* 鐢诲竷鍚嶇О */}
      <div className="sidebar-header">
        <img src={logoBase64} alt="鑹洪暅AI" className="sidebar-logo" />
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
            title="鐐瑰嚮閲嶅懡鍚?
          >{canvasName}</span>
        )}
      </div>

      {/* Tab 鍒囨崲锛氳妭鐐?/ 璧勪骇 */}
      <div className="sidebar-tabs">
        <button className={`sidebar-tab ${activeTab === 'nodes' ? 'active' : ''}`} onClick={() => onTabChange('nodes')}>鑺傜偣</button>
        <button className={`sidebar-tab ${activeTab === 'assets' ? 'active' : ''}`} onClick={() => onTabChange('assets')}>璧勪骇</button>
      </div>

      {/* 閸愬懎顔愰崠?*/}
      <div className="sidebar-body">
        {activeTab === 'nodes' && (
          nodes.length === 0 ? (
            <div className="sidebar-empty">褰撳墠鐢诲竷娌℃湁鍐呭</div>
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
                  <button className="node-list-locate" onClick={(event) => { event.stopPropagation(); onNodeClick(node.id); }} title="瀹氫綅鍒拌妭鐐?>
                    <SvgIcon name="chevron-right" size={14} />
                  </button>
                </div>
              );
            })
          )
        )}

        {activeTab === 'assets' && (
          assetList.length === 0 ? (
            <div className="sidebar-empty">褰撳墠娌℃湁璧勪骇</div>
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

      {/* 搴曢儴缁熻 */}
      <div className="sidebar-footer">
        <span>{canvasName}</span>
        <span>鍏?{activeTab === 'nodes' ? nodes.length : assetList.length} {activeTab === 'nodes' ? '鑺傜偣' : '椤?}</span>
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




