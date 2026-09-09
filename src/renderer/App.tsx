import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppStore } from './store/appStore';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { HomePage } from './components/HomePage';
const AssetsPage = React.lazy(() => import('./components/AssetsPage').then(m => ({ default: m.AssetsPage })));
const CanvasPage = React.lazy(() => import('./components/CanvasPage').then(m => ({ default: m.CanvasPage })));
const SettingsPage = React.lazy(() => import('./components/SettingsPage').then(m => ({ default: m.SettingsPage })));
const PromptLibrary = React.lazy(() => import('./components/PromptLibrary').then(m => ({ default: m.PromptLibrary })));
const ToolsPage = React.lazy(() => import('./components/ToolsPage').then(m => ({ default: m.ToolsPage })));
const DramaPage = React.lazy(() => import('./components/DramaPage'));
const DramaWorkshopPage = React.lazy(() => import('./components/DramaWorkshopPage'));
const ShortVideoFactory = React.lazy(() => import('./components/ShortVideoFactory').then(m => ({ default: m.ShortVideoFactory })));
const Canvas = React.lazy(() => import('./components/Canvas').then(m => ({ default: m.Canvas })));
const ComfyUIPage = React.lazy(() => import('./components/ComfyUIPage').then(m => ({ default: m.ComfyUIPage })));
import { ContextMenu, ContextMenuItem } from './components/ContextMenu';
const MediaPreview = React.lazy(() => import('./components/MediaPreview').then(m => ({ default: m.MediaPreview })));
const SaveToPromptLibraryModal = React.lazy(() => import('./components/SaveToPromptLibraryModal').then(m => ({ default: m.SaveToPromptLibraryModal })));
import { GlobalMemoryPanel, HelpPanel } from './components/GlobalMemory';
import ErrorBoundary from './components/ErrorBoundary';
import { LicenseGuard } from './components/LicenseGuard';
import { detectLibraryContextTarget, LibraryContextTarget, saveMediaTargetToAssets } from './utils/librarySave';
import './styles.css';

// 全局记忆自动快照 - 页面级
import { usePageSnapshot } from './hooks/useMemorySystem';

const RefreshIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>;
const SaveIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
const BookIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>;
const DocumentIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></svg>;

export const App: React.FC = () => {
  const {
    activeSection,
    activeCanvasId,
    setActiveCanvas,
    mediaPreview,
    setMediaPreview,
    toast,
    addAsset,
    showToast,
  } = useAppStore();

  // 页面级自动快照（简易版：记录页面切换）
  usePageSnapshot(
    activeSection as any, // MemorySource（已扩展为包含所有 tab）
    `页面访问: ${activeSection}`,
    { page: activeSection },
    { enabled: true, tags: ['page-visit', activeSection] }
  );

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);
  const [savePromptTarget, setSavePromptTarget] = useState<LibraryContextTarget | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [updateModalData, setUpdateModalData] = useState<any>(null);
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateDownloadProgress, setUpdateDownloadProgress] = useState(0);
  const [updateDownloadedPath, setUpdateDownloadedPath] = useState<string | null>(null);
  const [updateDownloadError, setUpdateDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const handleGlobalContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.main-content')) return;
      if (target.closest('input') || target.closest('textarea') || target.closest('[contenteditable]')) return;

      event.preventDefault();
      const detected = detectLibraryContextTarget(target);
      const items: ContextMenuItem[] = [];

      if (detected?.kind === 'media') {
        items.push(
          {
            label: '保存多媒体到资产库',
            icon: SaveIcon,
            onClick: async () => {
              const assetId = await saveMediaTargetToAssets(detected);
              showToast(assetId ? '已保存到资产库' : '未识别到可保存的媒体', assetId ? 'success' : 'error');
            },
          },
          {
            label: '存入提示词库',
            icon: BookIcon,
            onClick: () => setSavePromptTarget(detected),
          }
        );
      } else if (detected?.kind === 'text') {
        items.push(
          {
            label: '保存文本到提示词库',
            icon: BookIcon,
            onClick: () => setSavePromptTarget(detected),
          },
          {
            label: '添加为文本素材',
            icon: DocumentIcon,
            onClick: () => {
              addAsset({
                name: detected.name || '文本素材',
                type: 'document',
                path: detected.prompt,
                size: detected.prompt.length,
                sourceType: 'tools',
              });
              showToast('已添加到资产库', 'success');
            },
          }
        );
      }

      if (items.length) items.push({ label: '---' });
      items.push({ label: '刷新页面', icon: RefreshIcon, onClick: () => window.location.reload() });
      setContextMenu({ x: event.clientX, y: event.clientY, items });
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu);
    return () => document.removeEventListener('contextmenu', handleGlobalContextMenu);
  }, [addAsset, showToast]);

  // 监听主进程推送的新版本通知，自动弹窗提醒更新
  useEffect(() => {
    const api = (window as any)?.yijingAPI?.system;
    if (typeof api?.onUpdateAvailable !== 'function') return;
    const unsub = api.onUpdateAvailable((data: any) => {
      if (data?.hasUpdate) {
        console.log('[App] 收到新版本通知 v' + data.latestVersion + '，显示更新弹窗');
        setUpdateModalData(data);
        // 重置下载状态
        setUpdateDownloading(false);
        setUpdateDownloadProgress(0);
        setUpdateDownloadedPath(null);
        setUpdateDownloadError(null);
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // 监听下载进度
  useEffect(() => {
    const api = (window as any)?.yijingAPI?.system;
    if (typeof api?.onUpdateProgress !== 'function') return;
    const unsub = api.onUpdateProgress((data: any) => {
      if (data?.progress !== undefined) {
        setUpdateDownloadProgress(data.progress);
        console.log('[App] 更新下载进度:', data.progress + '%');
      }
    });
    return () => { if (typeof unsub === 'function') unsub(); };
  }, []);

  // 开始下载更新
  const startUpdateDownload = async () => {
    const api = (window as any)?.yijingAPI?.system;
    if (typeof api?.downloadUpdate !== 'function') {
      setUpdateDownloadError('不支持自动下载，请手动下载');
      return;
    }
    setUpdateDownloading(true);
    setUpdateDownloadProgress(0);
    setUpdateDownloadError(null);
    try {
      const result = await api.downloadUpdate();
      if (result?.ok && result?.path) {
        console.log('[App] 更新下载完成:', result.path);
        setUpdateDownloadedPath(result.path);
        setUpdateDownloadProgress(100);
      } else {
        setUpdateDownloadError(result?.error || '下载失败');
      }
    } catch (e: any) {
      setUpdateDownloadError(e?.message || '下载异常');
    } finally {
      setUpdateDownloading(false);
    }
  };

  // 安装更新
  const installUpdate = async () => {
    if (!updateDownloadedPath) return;
    const api = (window as any)?.yijingAPI?.system;
    if (typeof api?.installUpdate !== 'function') {
      // 降级：打开文件所在目录
      window.location.hash = '#/settings';
      return;
    }
    try {
      await api.installUpdate(updateDownloadedPath);
    } catch (e: any) {
      console.error('[App] 安装更新失败:', e);
    }
  };

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const renderPage = (): React.ReactNode => {
    if (activeCanvasId) {
      return (
        <ErrorBoundary componentName="Canvas" overlay><React.Suspense fallback={<div className="lazy-loading">加载画布…</div>}><Canvas canvasId={activeCanvasId} onBack={() => setActiveCanvas(null)} /></React.Suspense></ErrorBoundary>
      );
    }

    switch (activeSection) {
      case 'home':
        return <HomePage />;
      case 'assets':
        return <AssetsPage />;
      case 'prompt-library':
        return <PromptLibrary />;
      case 'canvas':
        return <CanvasPage />;
      case 'drama':
        return (
          <ErrorBoundary componentName="DramaPage">
            <DramaPage />
          </ErrorBoundary>
        );
      case 'drama-workshop':
        return (
          <ErrorBoundary componentName="DramaWorkshopPage">
            <DramaWorkshopPage />
          </ErrorBoundary>
        );
      case 'money-printer':
        return (
          <ErrorBoundary componentName="ShortVideoFactory"><React.Suspense fallback={<div className="lazy-loading">加载中…</div>}><ShortVideoFactory /></React.Suspense></ErrorBoundary>
        );
      case 'tools':
        return (
          <ErrorBoundary componentName="ToolsPage">
            <ToolsPage />
          </ErrorBoundary>
        );
      case 'comfyui':
        return (
          <ErrorBoundary componentName="ComfyUIPage">
            <ComfyUIPage />
          </ErrorBoundary>
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return <HomePage />;
    }
  };

  const promptSourceType = savePromptTarget?.mediaType === 'video' ? 'video' : savePromptTarget?.mediaType === 'image' ? 'image' : 'text';

  return (
    <LicenseGuard>
    <div className="app" onContextMenu={(event) => event.preventDefault()}>
      <TitleBar />
      <div className={`app-body${activeCanvasId ? ' canvas-mode' : ''}`}>
        <Sidebar />
        <main className="main-content">
          <React.Suspense fallback={<div className="lazy-loading">加载中…</div>}>
            {renderPage()}
          </React.Suspense>
        </main>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}

      {savePromptTarget && (
        <React.Suspense fallback={null}>
          <SaveToPromptLibraryModal
            isOpen={!!savePromptTarget}
            onClose={() => setSavePromptTarget(null)}
            defaultPrompt={savePromptTarget?.prompt || ''}
            defaultName={savePromptTarget?.name || ''}
            thumbnail={savePromptTarget?.thumbnail}
            sourceType={promptSourceType}
            filePath={savePromptTarget?.url}
            defaultTags={savePromptTarget?.tags || []}
          />
        </React.Suspense>
      )}

      {mediaPreview && (
        createPortal(
          <React.Suspense fallback={null}>
            <MediaPreview
              src={mediaPreview.src}
              type={mediaPreview.type}
              onClose={() => setMediaPreview(null)}
            />
          </React.Suspense>,
          document.body
        )
      )}

      {toast && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 99999,
            padding: '10px 20px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            color: '#fff',
            backgroundColor: toast.type === 'success'
              ? 'var(--success-color, #10b981)'
              : toast.type === 'error'
                ? 'var(--danger-color, #e74c3c)'
                : 'var(--accent-color, #3b82f6)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            animation: 'fadeInUp 0.2s ease-out',
          }}
        >
          {toast.message}
        </div>,
        document.body
      )}

      {/* 全局记忆面板 */}
      <GlobalMemoryPanel
        currentSource={
          activeSection === 'drama' ? 'drama' :
          activeSection === 'canvas' || activeCanvasId ? 'canvas' :
          activeSection === 'prompt-library' ? 'prompt' :
          activeSection === 'settings' ? 'settings' : 'other'
        }
        onHelpClick={() => setIsHelpOpen(true)}
        isCanvasMode={activeSection === 'canvas'}
      />
      <HelpPanel isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      {/* 全局更新提醒弹窗 */}
      {updateModalData && createPortal(
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 100000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setUpdateModalData(null)}>
          <div style={{
            width: 420, background: '#1e1e2e', borderRadius: 16,
            padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              🎉 发现新版本
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
              当前版本 v{updateModalData.currentVersion} → 最新版本 <span style={{ color: '#8b5cf6', fontWeight: 600 }}>v{updateModalData.latestVersion}</span>
            </div>
            {updateModalData.releaseNotes && (
              <div style={{
                background: 'rgba(255,255,255,0.05)', borderRadius: 8,
                padding: '12px 14px', marginBottom: 20, maxHeight: 160, overflowY: 'auto',
              }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>更新内容</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {updateModalData.releaseNotes}
                </div>
              </div>
            )}
            {/* 下载进度条区域 */}
            {(updateDownloading || updateDownloadedPath || updateDownloadError) && (
              <div style={{ marginBottom: 20 }}>
                {updateDownloading && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>正在下载更新包...</span>
                      <span style={{ fontSize: 13, color: '#8b5cf6', fontWeight: 600 }}>{Math.round(updateDownloadProgress)}%</span>
                    </div>
                    <div style={{
                      width: '100%', height: 8, borderRadius: 4,
                      background: 'rgba(255,255,255,0.1)', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: updateDownloadProgress + '%', height: '100%',
                        background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                        borderRadius: 4, transition: 'width 0.3s ease',
                      }} />
                    </div>
                  </div>
                )}
                {updateDownloadedPath && !updateDownloading && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
                  }}>
                    <div style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>✓ 下载完成</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4, wordBreak: 'break-all' }}>{updateDownloadedPath}</div>
                  </div>
                )}
                {updateDownloadError && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 8,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  }}>
                    <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>✗ 下载失败</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{updateDownloadError}</div>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                style={{
                  flex: 1, height: 40, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)',
                  background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer',
                }}
                onClick={() => {
                  if (!updateDownloading) setUpdateModalData(null);
                }}
                disabled={updateDownloading}
              >{updateDownloading ? '下载中...' : '稍后再说'}</button>
              {!updateDownloadedPath && !updateDownloading && (
                <button
                  style={{
                    flex: 1, height: 40, borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                  onClick={startUpdateDownload}
                >立即更新</button>
              )}
              {updateDownloading && (
                <button
                  style={{
                    flex: 1, height: 40, borderRadius: 8, border: 'none',
                    background: 'rgba(139,92,246,0.5)', color: '#fff',
                    fontSize: 14, fontWeight: 600, cursor: 'not-allowed',
                  }}
                  disabled
                >下载中...</button>
              )}
              {updateDownloadedPath && !updateDownloading && (
                <button
                  style={{
                    flex: 1, height: 40, borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                  onClick={installUpdate}
                >立即安装</button>
              )}
              {updateDownloadError && !updateDownloading && (
                <button
                  style={{
                    flex: 1, height: 40, borderRadius: 8, border: 'none',
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                  onClick={startUpdateDownload}
                >重试下载</button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
    </LicenseGuard>
  );
};
