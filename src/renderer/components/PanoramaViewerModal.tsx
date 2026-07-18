import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls as ThreeOrbitControls } from 'three-stdlib';
import './PanoramaViewerModal.css';

/**
 * 全景图节点弹窗 —— 720° equirectangular 全景查看器
 * 三主题色通过 CSS 变量自适应。
 */

export interface PanoramaViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string | null;
  onOutputView?: (dataUrl: string, meta: { width: number; height: number }) => void;
  onToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type ViewMode = 'center' | 'free';

const OUTPUT_PRESETS: Array<{ id: string; label: string; ratio: number | null }> = [
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: 'custom', label: '自定义', ratio: null },
];

export const PanoramaViewerModal: React.FC<PanoramaViewerModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  onOutputView,
  onToast,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<ThreeOrbitControls | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const rafRef = useRef<number | null>(null);

  const [paramOpen, setParamOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('center');
  const [fullscreen, setFullscreen] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [outputPreset, setOutputPreset] = useState('16:9');
  const [customWidth, setCustomWidth] = useState(1280);
  const [customHeight, setCustomHeight] = useState(720);

  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(1);
  const [fov, setFov] = useState(75);

  const currentOutputSize = useMemo(() => {
    const preset = OUTPUT_PRESETS.find(p => p.id === outputPreset);
    if (!preset || preset.ratio === null) {
      return { width: Math.max(1, Math.round(customWidth)), height: Math.max(1, Math.round(customHeight)) };
    }
    const base = 1280;
    return { width: base, height: Math.round(base / preset.ratio) };
  }, [outputPreset, customWidth, customHeight]);

  // ---- three 初始化 ----
  useEffect(() => {
    if (!isOpen || !mountRef.current) return;
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(0, 0, 0.1);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new ThreeOrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = -0.35;
    controls.enableZoom = true;
    controls.enablePan = false;
    controls.minDistance = 0.01;
    controls.maxDistance = 0.1;
    controlsRef.current = controls;

    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0x808080 });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    const animate = () => {
      rafRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    return () => {
      window.removeEventListener('resize', handleResize);
      ro.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      textureRef.current?.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      sphereRef.current = null;
      textureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---- 加载纹理 ----
  useEffect(() => {
    if (!isOpen || !sphereRef.current) return;
    setReady(false);
    setLoadError(false);
    const mat = sphereRef.current.material as THREE.MeshBasicMaterial;
    if (!imageUrl) {
      mat.map = null;
      mat.color.set(0x808080);
      mat.needsUpdate = true;
      return;
    }
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      imageUrl,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        textureRef.current?.dispose();
        textureRef.current = texture;
        mat.map = texture;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
        setReady(true);
      },
      undefined,
      () => {
        setLoadError(true);
        onToast?.('全景图加载失败', 'error');
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, imageUrl]);

  // ---- 视角模式 ----
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    if (viewMode === 'center') {
      controls.enablePan = false;
      camera.position.set(0, 0, 0.1);
      controls.target.set(0, 0, 0);
    } else {
      controls.enablePan = true;
    }
    controls.update();
  }, [viewMode]);

  // ---- 整体旋转 ----
  useEffect(() => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y = (rotation * Math.PI) / 180;
    }
  }, [rotation]);

  // ---- 亮度 ----
  useEffect(() => {
    const mat = sphereRef.current?.material as THREE.MeshBasicMaterial | undefined;
    if (mat) {
      const v = Math.max(0, Math.min(2, brightness));
      mat.color.setScalar(imageUrl ? v : 0.5);
      mat.needsUpdate = true;
    }
  }, [brightness, imageUrl]);

  // ---- 视野 (FOV) ----
  useEffect(() => {
    const camera = cameraRef.current;
    if (camera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }, [fov]);

  const handleOutputView = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    const { width, height } = currentOutputSize;

    const prevAspect = camera.aspect;
    const prevSize = new THREE.Vector2();
    renderer.getSize(prevSize);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');

    // 还原
    camera.aspect = prevAspect;
    camera.updateProjectionMatrix();
    renderer.setSize(prevSize.x, prevSize.y, false);

    onOutputView?.(dataUrl, { width, height });
    onToast?.('已输出当前视角', 'success');
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setFullscreen(false)).catch(() => {});
    }
  };

  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="pano-modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`pano-modal ${fullscreen ? 'is-fullscreen' : ''}`} ref={containerRef}>
        <header className="pano-modal-header">
          <div className="pano-modal-title">
            <span className="pano-modal-title-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <ellipse cx="12" cy="12" rx="10" ry="4" />
                <path d="M2 12h20" />
              </svg>
            </span>
            <span>720° 全景查看器</span>
          </div>
          <div className="pano-modal-header-actions">
            <button className="pano-icon-btn" onClick={() => setParamOpen(v => !v)} title={paramOpen ? '收起参数栏' : '展开参数栏'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M15 3v18" />
              </svg>
            </button>
            <button className="pano-icon-btn" onClick={toggleFullscreen} title={fullscreen ? '退出全屏' : '全屏'}>
              {fullscreen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
            <button className="pano-icon-btn pano-close-btn" onClick={onClose} title="关闭">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div className="pano-modal-body">
          <div className="pano-stage">
            <div className="pano-canvas-mount" ref={mountRef} />
            {!ready && (
              <div className="pano-stage-overlay">
                {loadError ? (
                  <div className="pano-stage-hint pano-stage-error">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4M12 16h.01" />
                    </svg>
                    <p>全景图加载失败</p>
                  </div>
                ) : imageUrl ? (
                  <div className="pano-stage-hint">
                    <span className="pano-spinner" />
                    <p>正在加载全景图…</p>
                  </div>
                ) : (
                  <div className="pano-stage-hint">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <ellipse cx="12" cy="12" rx="10" ry="4" />
                    </svg>
                    <p>请在右侧参数栏加载 720° 全景图</p>
                  </div>
                )}
              </div>
            )}
            <div className="pano-stage-tip">拖拽旋转视角 · 滚轮缩放视野{viewMode === 'free' ? ' · 右键平移' : ''}</div>
          </div>

          {paramOpen && (
            <aside className="pano-param-panel">
              <div className="pano-param-section">
                <div className="pano-param-label">视角模式</div>
                <div className="pano-segmented">
                  <button className={viewMode === 'center' ? 'active' : ''} onClick={() => setViewMode('center')}>中心观察</button>
                  <button className={viewMode === 'free' ? 'active' : ''} onClick={() => setViewMode('free')}>自由视角</button>
                </div>
              </div>

              <div className="pano-param-section">
                <div className="pano-param-label">输出尺寸</div>
                <div className="pano-chip-row">
                  {OUTPUT_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      className={`pano-chip ${outputPreset === preset.id ? 'active' : ''}`}
                      onClick={() => setOutputPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {outputPreset === 'custom' && (
                  <div className="pano-size-inputs">
                    <label>
                      <span>宽</span>
                      <input
                        type="number"
                        min={16}
                        max={8192}
                        value={customWidth}
                        onChange={(e) => setCustomWidth(Number(e.target.value) || 0)}
                      />
                    </label>
                    <span className="pano-size-x">×</span>
                    <label>
                      <span>高</span>
                      <input
                        type="number"
                        min={16}
                        max={8192}
                        value={customHeight}
                        onChange={(e) => setCustomHeight(Number(e.target.value) || 0)}
                      />
                    </label>
                  </div>
                )}
                <div className="pano-size-readout">
                  当前输出：{currentOutputSize.width} × {currentOutputSize.height}
                </div>
              </div>

              <div className="pano-param-section">
                <div className="pano-param-label">
                  <span>视野 (FOV)</span>
                  <span className="pano-param-value">{fov}°</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={110}
                  value={fov}
                  onChange={(e) => setFov(Number(e.target.value))}
                  className="pano-range"
                />
              </div>

              <div className="pano-param-section">
                <div className="pano-param-label">
                  <span>整体旋转</span>
                  <span className="pano-param-value">{rotation}°</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={360}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="pano-range"
                />
              </div>

              <div className="pano-param-section">
                <div className="pano-param-label">
                  <span>亮度</span>
                  <span className="pano-param-value">{brightness.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={2}
                  step={0.05}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="pano-range"
                />
              </div>

              <div className="pano-param-actions">
                <button className="pano-primary-btn" disabled={!ready} onClick={handleOutputView}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
                    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
                    <path d="M12 12v6M9 15l3 3 3-3" />
                  </svg>
                  输出当前视角
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default PanoramaViewerModal;
