import React, { useState, useMemo } from 'react';
import './TaskList.css';
import { useAppStore } from '../store/appStore';

// 状态图标映射
const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'loading':
    case 'processing':
      return (
        <svg className="task-icon task-icon-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
      );
    case 'success':
      return (
        <svg className="task-icon task-icon-success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case 'error':
      return (
        <svg className="task-icon task-icon-error" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    default:
      return (
        <svg className="task-icon task-icon-idle" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
  }
};

// 类型中文映射
const typeLabels: Record<string, string> = {
  'text-to-image': '图像生成',
  'text-to-video': '视频生成',
  'image-to-video': '图生视频',
  'img2video': '图生视频',
  'storyboard': '故事板',
  'story-script': '剧本创作',
  'story-script-adv': '剧本创作',
  'tts': '语音合成',
  'comfyui': 'ComfyUI',
  'video-to-music': '视频配乐',
  'image-to-image': '图像变换',
  'image-upscale': '图像超分',
  'audio2video': '音频生视频',
  'video-composite': '视频合成',
  'result': '结果节点',
};

const getTypeLabel = (type: string) => typeLabels[type] || type;

export default function TaskList() {
  const nodes = useAppStore(s => s.nodes);
  const taskQueue = useAppStore(s => s.taskQueue);
  const setActiveNode = useAppStore(s => s.setActiveNode);
  const retryNode = useAppStore(s => s.retryNode);
  const cancelNode = useAppStore(s => s.cancelNode);
  const clearCompletedTasks = useAppStore(s => s.clearCompletedTasks);
  const executeQueue = useAppStore(s => s.executeQueue);
  const removeFromQueue = useAppStore(s => s.removeFromQueue);
  const queuePanelOpen = useAppStore(s => s.queuePanelOpen);
  const setQueuePanelOpen = useAppStore(s => s.setQueuePanelOpen);
  const showToast = useAppStore(s => s.showToast);

  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('active');

  // 获取所有节点转为任务列表
  const allTasks = useMemo(() =>
    Object.values(nodes || {})
      .map(n => ({ ...n, id: (n as any).id }))
      .sort((a, b) => {
        // 队列中的节点优先
        const aQ = taskQueue.indexOf(a.id);
        const bQ = taskQueue.indexOf(b.id);
        if (aQ !== -1 && bQ === -1) return -1;
        if (bQ !== -1 && aQ === -1) return 1;
        if (aQ !== -1 && bQ !== -1) return aQ - bQ;
        // 其他按时间/状态排序
        if (a.status === 'processing' && b.status !== 'processing') return -1;
        if (b.status === 'processing' && a.status !== 'processing') return 1;
        return 0;
      }),
    [nodes, taskQueue]
  );

  const filteredTasks = useMemo(() => {
    switch (filter) {
      case 'active': return allTasks.filter(t => t.status === 'loading' || t.status === 'processing' || t.status === 'idle');
      case 'done': return allTasks.filter(t => t.status === 'success' || t.status === 'error');
      default: return allTasks;
    }
  }, [allTasks, filter]);

  // 统计
  const stats = useMemo(() => {
    const active = allTasks.filter(t => t.status === 'loading' || t.status === 'processing').length;
    const success = allTasks.filter(t => t.status === 'success').length;
    const error = allTasks.filter(t => t.status === 'error').length;
    const queued = taskQueue.length;
    return { active, success, error, queued, total: allTasks.length };
  }, [allTasks, taskQueue]);

  // 进度百分比
  const progressPct = stats.total > 0 ? Math.round(((stats.success + stats.error) / stats.total) * 100) : 0;

  const handleClearCompleted = () => {
    clearCompletedTasks();
    showToast?.('已完成任务已从队列移除', 'info');
  };

  const handleRunQueue = async () => {
    showToast?.('开始执行队列...', 'info');
    await executeQueue();
  };

  const handleOpenFile = async (url: string) => {
    const win = window as any;
    if (win?.yijingAPI?.system?.openPath) {
      try { await win.yijingAPI.system.openPath(url); } catch (e) { console.error(e); }
    }
  };

  const handleRetryAll = async () => {
    const failed = allTasks.filter(t => t.status === 'error');
    for (const t of failed) {
      await retryNode?.(t.id);
    }
  };

  const openCount = stats.active + stats.queued;

  return (
    <div className="task-list">
      {/* 头部 */}
      <div className="task-header">
        <div className="task-header-top">
          <h3 className="task-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            任务队列
          </h3>
          {openCount > 0 && (
            <span className="task-badge">{openCount}</span>
          )}
        </div>

        {/* 统计条 */}
        {stats.total > 0 && (
          <div className="task-stats">
            <div className="task-progress-bar">
              <div
                className="task-progress-fill"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="task-stats-row">
              {stats.active > 0 && <span className="task-stat task-stat-active"><StatusIcon status="loading" /> {stats.active} 进行中</span>}
              {stats.queued > 0 && <span className="task-stat task-stat-queued">{stats.queued} 排队</span>}
              {stats.success > 0 && <span className="task-stat task-stat-success"><StatusIcon status="success" /> {stats.success} 成功</span>}
              {stats.error > 0 && <span className="task-stat task-stat-error"><StatusIcon status="error" /> {stats.error} 失败</span>}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        {stats.total > 0 && (
          <div className="task-actions">
            {taskQueue.length > 0 && stats.active === 0 && (
              <button className="task-btn task-btn-primary" onClick={handleRunQueue}>
                执行队列 ({taskQueue.length})
              </button>
            )}
            {stats.error > 0 && (
              <button className="task-btn" onClick={handleRetryAll}>
                ↻ 重试失败 ({stats.error})
              </button>
            )}
            {(stats.success + stats.error) > 0 && (
              <button className="task-btn task-btn-ghost" onClick={handleClearCompleted}>
                清理已完成
              </button>
            )}
          </div>
        )}
      </div>

      {/* 过滤器 */}
      <div className="task-filters">
        {(['active', 'done', 'all'] as const).map(f => (
          <button
            key={f}
            className={`task-filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'active' ? '进行中' : f === 'done' ? '已完成' : '全部'}
          </button>
        ))}
      </div>

      {/* 任务列表 */}
      <div className="task-items-container">
        {filteredTasks.length === 0 && (
          <div className="task-empty">
            {filter === 'active' ? '没有进行中的任务' : filter === 'done' ? '没有已完成的任务' : '点击节点上的生成按钮开始创作'}
          </div>
        )}

        <ul className="task-items">
          {filteredTasks.map((t: any) => {
            const queuePos = taskQueue.indexOf(t.id);
            const isInQueue = queuePos !== -1;
            const isProcessing = t.status === 'loading' || t.status === 'processing';

            return (
              <li
                key={t.id}
                className={`task-item task-item-${t.status}${isInQueue ? ' task-item-queued' : ''}`}
              >
                {/* 队列位置标记 */}
                {isInQueue && !isProcessing && (
                  <div className="task-queue-pos">#{queuePos + 1}</div>
                )}

                {/* 状态图标 */}
                <div className="task-icon-wrap">
                  <StatusIcon status={t.status} />
                </div>

                {/* 主要内容 */}
                <div className="task-main">
                  <div className="task-meta-row">
                    <span className="task-type">{getTypeLabel(t.type)}</span>
                    {t.model && <span className="task-model">{t.model}</span>}
                    {t.configId && (
                      <span className="task-status-text">
                        {t.status === 'loading' ? '启动中...' :
                         t.status === 'processing' ? `job: ${t.meta?.jobId || ''}` :
                         t.status === 'success' ? '完成' :
                         t.status === 'error' ? '失败' : '等待'}
                      </span>
                    )}
                  </div>
                  <div className="task-prompt">
                    {t.prompt?.slice(0, 60) || <span className="task-no-prompt">未输入内容</span>}
                    {(t.prompt?.length || 0) > 60 && '…'}
                  </div>
                  {t.error && (
                    <div className="task-error-msg">{t.error.slice(0, 80)}</div>
                  )}
                  {t.result?.url && (
                    <div className="task-result-preview">
                      {t.result.type === 'image' && (
                        <img
                          src={t.result.url}
                          alt="result"
                          className="task-result-thumb"
                          onError={e => (e.target as HTMLElement).style.display = 'none'}
                        />
                      )}
                      {t.result.type === 'video' && (
                        <span className="task-result-tag">视频结果</span>
                      )}
                      {t.result.type === 'text' && (
                        <span className="task-result-tag task-result-text">
                          {String(t.result.text || '').slice(0, 40)}…
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="task-actions-row">
                  <button
                    className="task-action-btn"
                    onClick={() => setActiveNode?.(t.id)}
                    title="在画布中定位"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
                    </svg>
                  </button>

                  {t.result?.url && (
                    <button
                      className="task-action-btn"
                      onClick={() => handleOpenFile(t.result.url)}
                      title="打开文件"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                        <polyline points="15,3 21,3 21,9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </button>
                  )}

                  {t.status === 'error' && (
                    <button
                      className="task-action-btn task-action-retry"
                      onClick={() => retryNode?.(t.id)}
                      title="重试"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 11-2.64-6.36" />
                        <path d="M21 3v6h-6" />
                      </svg>
                    </button>
                  )}

                  {(t.status === 'loading' || t.status === 'processing') && (
                    <button
                      className="task-action-btn task-action-cancel"
                      onClick={() => cancelNode?.(t.id)}
                      title="取消"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}

                  {isInQueue && !isProcessing && (
                    <button
                      className="task-action-btn task-action-remove"
                      onClick={() => removeFromQueue?.(t.id)}
                      title="移出队列"
                    >
                      ×
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ComfyUI 快捷入口 */}
      {(nodes as any) && Object.values(nodes).some((n: any) => n.provider === 'comfyui') && (
        <div className="task-comfyui-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
          </svg>
          检测到 ComfyUI 节点，可在设置页管理工作流
        </div>
      )}
    </div>
  );
}
