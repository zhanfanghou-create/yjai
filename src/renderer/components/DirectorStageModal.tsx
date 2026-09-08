import React, { useEffect, useRef, useState, useCallback } from 'react';
import { type Director3dTheme } from '../director3d/App';
const Director3dApp = React.lazy(() => import('../director3d/App'));
import { useAppStore } from '../store/appStore';

export interface DirectorStageExportView {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

export interface DirectorStageExportVideo {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  fileName: string;
}

export interface DirectorStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOutputView?: (dataUrl: string, meta: { width: number; height: number }) => void;
  onOutputViews?: (views: DirectorStageExportView[]) => void;
  /** 导演台录制的动画预览视频回传，用于在画布上创建视频节点 */
  onOutputVideo?: (video: DirectorStageExportVideo) => void;
  onToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  /** 连接全景图节点时传入：以该全景图作为导演台默认场景（equirectangular 天空球） */
  panoramaUrl?: string | null;
  /** 上游连接的参考图/视频：作为视口参考底图（描摹构图/机位），视频还用于默认录制时长 */
  referenceMedia?: { url?: string; kind?: 'image' | 'video'; durationSeconds?: number; text?: string } | null;
  /** 默认构图缩略图回调：导演台内默认摄影机构图渲染完成后回传，用于在画布节点上显示 */
  onDefaultThumbnail?: (dataUrl: string) => void;
}

const APP_THEME_CLASSES = [
  'theme-dark-gray',
  'theme-light',
  'theme-blue-dark',
  'theme-black',
  'theme-white',
];

/** 读取应用当前主题 class（作用于 body / documentElement） */
function getAppThemeClass(): string {
  for (const cls of APP_THEME_CLASSES) {
    if (
      document.body.classList.contains(cls) ||
      document.documentElement.classList.contains(cls)
    ) {
      return cls;
    }
  }
  return 'theme-dark-gray';
}

/** 应用主题 → 3D 导演台内部明暗模式 */
function mapAppThemeToDark(themeClass: string): Director3dTheme {
  return themeClass === 'theme-light' || themeClass === 'theme-white' ? 'light' : 'dark';
}

/** 从 dataURL 读取图片尺寸 */
function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth || 1280, height: img.naturalHeight || 720 });
    img.onerror = () => resolve({ width: 1280, height: 720 });
    img.src = dataUrl;
  });
}

type WindowMode = 'normal' | 'maximized';

interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getDefaultRect(): WindowRect {
  const width = Math.min(1280, Math.max(880, window.innerWidth - 160));
  const height = Math.min(800, Math.max(560, window.innerHeight - 120));
  return {
    width,
    height,
    left: Math.max(20, (window.innerWidth - width) / 2),
    top: Math.max(20, (window.innerHeight - height) / 2),
  };
}

export function DirectorStageModal({
  isOpen,
  onClose,
  onOutputView,
  onOutputViews,
  onOutputVideo,
  onToast,
  panoramaUrl,
  referenceMedia,
}: DirectorStageModalProps) {
  const [themeClass, setThemeClass] = useState<string>(() => getAppThemeClass());
  const innerTheme = mapAppThemeToDark(themeClass);
  const hostOrigin = typeof window !== 'undefined' ? window.location.origin : '*';
  const sessionSentRef = useRef(false);

  // 窗口化状态：normal（默认尺寸/可拖拽/可缩放）/ maximized（全屏）；minimized（隐藏到任务栏）
  const [windowMode, setWindowMode] = useState<WindowMode>('normal');
  const [minimized, setMinimized] = useState(false);
  const [rect, setRect] = useState<WindowRect>(() => getDefaultRect());
  const dragStateRef = useRef<{
    kind: 'move' | 'resize';
    startX: number;
    startY: number;
    origin: WindowRect;
  } | null>(null);

  // 打开时重置窗口状态
  useEffect(() => {
    if (isOpen) {
      setWindowMode('normal');
      setMinimized(false);
      setRect(getDefaultRect());
    }
  }, [isOpen]);

  // 观察应用主题变化，实时同步到 3D 导演台
  useEffect(() => {
    if (!isOpen) return;
    const update = () => setThemeClass(getAppThemeClass());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [isOpen]);

  // 预演生成状态：根据参考图/文本推断角色站位/姿势/朝向与机位/焦距，一键搭建 3D 预演画面
  const [previzLoading, setPrevizLoading] = useState(false);
  const previzDoneRef = useRef(false);

  const resolveChatApi = useCallback(() => {
    const st = useAppStore.getState();
    const pick = (list: any[]) => (list || []).find(
      (c: any) => c && c.baseUrl && c.apiKey && (c.defaultModel || (c.models && c.models.length))
    );
    const cfg = pick(st.chatAPIConfigs) || pick(st.apiConfigs);
    if (!cfg) return null;
    let base = String(cfg.baseUrl || '').trim().replace(/\/+$/, '');
    if (!/\/v\d+$/.test(base)) base = base + '/v1';
    base = base.replace(/^(https?:\/\/)api\.agnes-ai\.com(\/|$)/i, '$1apihub.agnes-ai.cn$2');
    return { base, key: cfg.apiKey as string, model: (cfg.defaultModel || cfg.models?.[0]) as string };
  }, []);

  const generateAndSendPreviz = useCallback(async () => {
    if (previzDoneRef.current) return;
    const media = referenceMedia;
    if (!media || (!media.url && !media.text)) return;
    const api = resolveChatApi();
    if (!api) {
      onToast?.('未配置文本模型，无法自动预演。可在设置页添加文本 API 后重试。', 'warning');
      return;
    }
    previzDoneRef.current = true;
    setPrevizLoading(true);
    try {
      const sys = [
        '你是3D分镜预演助手。根据参考图或文本，推断画面中每个角色的站位、姿势、朝向，以及摄影机位置/朝向/焦距，输出一个JSON预演布局。仅输出JSON，禁止多余文字或解释。',
        '坐标系：Y轴向上，角色双脚站在Y=0地面，+Z方向为镜头默认观察方向。单位为米，人物身高约1.7米。',
        'JSON结构：{"characters":[{"name":"角色名","bodyType":"mannequin|female|male|muscular|slim|teen|child","position":[x,y,z],"facingDeg":0,"posePresetId":"stand"}],"camera":{"fov":40,"position":[x,y,z],"target":[x,y,z]}}',
        'posePresetId 只能从以下列表选择：stand,t-pose,walk,run,sit,crouch,kneel-one,kneel-two,hands-on-hips,lean,bow,think,fight,kick,throw,push,wave,reach,cross-arms,phone。',
        'facingDeg 为角色绕Y轴朝向角度，0表示正面朝向镜头，90表示朝向镜头右侧。',
        'camera.fov 越小越长焦（特写），越大越广角。根据参考图的构图与景别合理设置 position/target/fov。',
        '若参考中人物不明确，则用1个 stand 姿势角色代表主体，并给出合理的中景机位。',
      ].join('\n');
      const userContent: any[] = [];
      const promptText = media.text
        ? `参考文本描述：${media.text}\n请据此推断3D预演布局，输出JSON。`
        : '参考这张图，推断人物站位/姿势/朝向与机位/焦距，输出预演JSON。';
      userContent.push({ type: 'text', text: promptText });
      if (media.url && media.kind === 'image') {
        userContent.push({ type: 'image_url', image_url: { url: media.url } });
      }
      const resp = await fetch(`${api.base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.key}` },
        body: JSON.stringify({ model: api.model, messages: [
          { role: 'system', content: sys },
          { role: 'user', content: userContent },
        ] }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(data?.error?.message || data?.error || `HTTP ${resp.status}`);
      let content = data?.choices?.[0]?.message?.content || '';
      if (Array.isArray(content)) content = content.map((p: any) => p?.text || '').join('');
      const jsonMatch = String(content).match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('模型未返回有效的预演JSON');
      const plan = JSON.parse(jsonMatch[0]);
      window.postMessage(
        {
          type: 'storyai:director-desk-previz',
          payload: { plan, durationSeconds: media.durationSeconds },
        },
        hostOrigin
      );
      onToast?.('已根据参考自动预演角色站位与机位，可在导演台内继续调整。', 'success');
    } catch (error) {
      previzDoneRef.current = false;
      onToast?.('自动预演失败：' + ((error as Error).message || '未知错误'), 'error');
    } finally {
      setPrevizLoading(false);
    }
  }, [referenceMedia, resolveChatApi, onToast, hostOrigin]);

  // 打开导演台后，若存在上游参考（图/视频/文本），自动生成一次预演布局
  useEffect(() => {
    if (!isOpen) { previzDoneRef.current = false; return; }
    if (!referenceMedia || (!referenceMedia.url && !referenceMedia.text)) return;
    const timer = window.setTimeout(() => { void generateAndSendPreviz(); }, 400);
    return () => window.clearTimeout(timer);
  }, [isOpen, referenceMedia, generateAndSendPreviz]);

  // 打开时向内部导演台发送 session（初始化场景 + 主题）与全景图
  useEffect(() => {
    if (!isOpen) {
      sessionSentRef.current = false;
      return;
    }
    if (sessionSentRef.current) return;
    sessionSentRef.current = true;

    // 稍等内部 hostBridge 初始化完成再发送
    const timer = window.setTimeout(() => {
      window.postMessage(
        {
          type: 'storyai:director-desk-session',
          payload: { instanceId: null, theme: innerTheme },
        },
        hostOrigin
      );
      if (panoramaUrl) {
        window.postMessage(
          {
            type: 'storyai:director-desk-panorama',
            payload: { imageUrl: panoramaUrl, fileName: '画布全景图.png' },
          },
          hostOrigin
        );
      }
      if (referenceMedia?.url) {
        window.postMessage(
          {
            type: 'storyai:director-desk-reference',
            payload: {
              url: referenceMedia.url,
              kind: referenceMedia.kind,
              durationSeconds: referenceMedia.durationSeconds,
            },
          },
          hostOrigin
        );
      }
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isOpen, panoramaUrl, referenceMedia?.url, referenceMedia?.kind, referenceMedia?.durationSeconds, innerTheme, hostOrigin]);

  // 监听内部导演台发出的消息（关闭 / 截图输出）
  useEffect(() => {
    if (!isOpen) return;

    const handler = async (event: MessageEvent) => {
      if (event.origin !== hostOrigin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'storyai:director-desk-close') {
        onClose();
        return;
      }

      if (data.type === 'storyai:director-desk-captures-sent') {
        const rawCaptures = Array.isArray(data.payload?.captures)
          ? data.payload.captures
          : [];
        const captures = rawCaptures.filter(
          (item: any) => item && typeof item.dataUrl === 'string' && item.dataUrl
        );
        if (captures.length === 0) return;

        const views: DirectorStageExportView[] = [];
        for (let i = 0; i < captures.length; i += 1) {
          const capture = captures[i];
          const size = await loadImageSize(capture.dataUrl);
          views.push({
            dataUrl: capture.dataUrl,
            width: size.width,
            height: size.height,
            name: capture.fileName || `导演台机位-${i + 1}.png`,
          });
        }

        if (onOutputViews) {
          onOutputViews(views);
        } else if (onOutputView) {
          const first = views[0];
          onOutputView(first.dataUrl, { width: first.width, height: first.height });
        }

        onToast?.(
          views.length > 1
            ? `已输出 ${views.length} 个机位到画布`
            : '已输出机位到画布',
          'success'
        );
        return;
      }

      if (data.type === 'storyai:director-desk-submit-video') {
        const payload = data.payload || {};
        const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
        if (!dataUrl) return;
        const video: DirectorStageExportVideo = {
          dataUrl,
          mimeType: typeof payload.mimeType === 'string' ? payload.mimeType : 'video/webm',
          width: Number(payload.width) || 854,
          height: Number(payload.height) || 480,
          fps: Number(payload.fps) || 12,
          durationSeconds: Number(payload.durationSeconds) || 0,
          fileName: typeof payload.fileName === 'string' ? payload.fileName : 'director-desk-preview.webm',
        };
        onOutputVideo?.(video);
        onToast?.('已录制动画并输出到画布视频节点', 'success');
        return;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [isOpen, hostOrigin, onOutputViews, onOutputView, onOutputVideo, onToast, onClose]);

  // 拖拽移动 / 缩放
  const handlePointerMove = useCallback((event: PointerEvent) => {
    const state = dragStateRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (state.kind === 'move') {
      setRect((prev) => ({
        ...prev,
        left: Math.min(
          Math.max(-prev.width + 120, state.origin.left + dx),
          window.innerWidth - 120
        ),
        top: Math.min(Math.max(0, state.origin.top + dy), window.innerHeight - 44),
      }));
    } else {
      setRect((prev) => ({
        ...prev,
        width: Math.max(640, state.origin.width + dx),
        height: Math.max(420, state.origin.height + dy),
      }));
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerMove]);

  const startDrag = useCallback(
    (kind: 'move' | 'resize') => (event: React.PointerEvent) => {
      if (windowMode === 'maximized') return;
      event.preventDefault();
      dragStateRef.current = {
        kind,
        startX: event.clientX,
        startY: event.clientY,
        origin: rect,
      };
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    },
    [windowMode, rect, handlePointerMove, handlePointerUp]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const toggleMaximize = useCallback(() => {
    setWindowMode((prev) => (prev === 'maximized' ? 'normal' : 'maximized'));
  }, []);

  if (!isOpen) return null;

  const isMaximized = windowMode === 'maximized';

  // 窗口容器样式：全屏 or 浮动窗口
  const windowStyle: React.CSSProperties = isMaximized
    ? { left: 0, top: 0, width: '100vw', height: '100vh', borderRadius: 0 }
    : {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };

  return (
    <>
      {/* 半透明遮罩仅用于聚焦，但不阻断主界面（pointerEvents 关闭时可点击穿透）；
          这里保持窗口化：不铺满遮罩，主界面依然可见可操作 */}
      <div
        className={`dsm-window${minimized ? ' is-minimized' : ''}${
          isMaximized ? ' is-maximized' : ''
        }`}
        style={minimized ? undefined : windowStyle}
        role="dialog"
        aria-label="3D 导演台窗口"
        aria-hidden={minimized}
      >
        <div
          className="dsm-window-titlebar"
          onPointerDown={startDrag('move')}
          onDoubleClick={toggleMaximize}
        >
          <span className="dsm-window-title">3D 导演台</span>
          <div className="dsm-window-controls">
            <button
              type="button"
              className="dsm-window-btn dsm-window-min"
              title="最小化到任务栏"
              aria-label="最小化"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMinimized(true)}
            >
              <span className="dsm-icon-min" />
            </button>
            <button
              type="button"
              className="dsm-window-btn dsm-window-max"
              title={isMaximized ? '还原默认尺寸' : '全屏'}
              aria-label={isMaximized ? '还原' : '全屏'}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleMaximize}
            >
              <span className={isMaximized ? 'dsm-icon-restore' : 'dsm-icon-max'} />
            </button>
            <button
              type="button"
              className="dsm-window-btn dsm-window-close"
              title="关闭窗口"
              aria-label="关闭"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={onClose}
            >
              <span className="dsm-icon-close" />
            </button>
          </div>
        </div>

        <div className="dsm-window-body">
          <React.Suspense fallback={<div className="dsm-previz-loading">加载 3D 导演台…</div>}>
            <Director3dApp
              theme={innerTheme}
              themeClassName={themeClass}
              onRequestClose={onClose}
            />
          </React.Suspense>
          {previzLoading ? (
            <div className="dsm-previz-loading">正在根据参考预演角色站位与机位…</div>
          ) : null}
        </div>

        {!isMaximized ? (
          <div
            className="dsm-window-resize-handle"
            onPointerDown={startDrag('resize')}
            aria-hidden
          />
        ) : null}
      </div>

      {/* 任务栏（最小化后显示的还原入口） */}
      {minimized ? (
        <button
          type="button"
          className="dsm-taskbar-chip"
          onClick={() => setMinimized(false)}
          title="点击还原 3D 导演台"
        >
          <span className="dsm-taskbar-dot" />
          3D 导演台
        </button>
      ) : null}
    </>
  );
}

export default DirectorStageModal;
