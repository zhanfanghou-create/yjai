import React from 'react';
import { useAppStore } from '../store/appStore';

const STATUS_LABELS: Record<string, string> = {
  'idle': '待执行',
  'loading': '生成中',
  'processing': '处理中',
  'success': '已完成',
  'error': '失败',
};

const TYPE_LABELS: Record<string, string> = {
  'text-to-image': '图像',
  'image-to-image': '图变换',
  'text-to-video': '视频',
  'image-to-video': '图生视频',
  'img2video': '图生视频',
  'comfyui': 'ComfyUI',
  'story-script': '剧本',
  'story-script-adv': '剧本',
  'video-composite': '视频合成',
  'audio2video': '音频视频',
  'default': '任务',
};

// 类型图标映射（使用 SVG 或文本符号）
const TYPE_ICONS: Record<string, string> = {
  'text-to-image': '🖼',
  'image-to-image': '🔄',
  'text-to-video': '🎬',
  'image-to-video': '🎥',
  'img2video': '🎥',
  'comfyui': '⚙️',
  'story-script': '📝',
  'story-script-adv': '📝',
  'video-composite': '🎞',
  'audio2video': '🎵',
  'default': '📋',
};

const getTypeIcon = (type?: string): string => {
  if (!type) return TYPE_ICONS['default'];
  return TYPE_ICONS[type] || TYPE_ICONS['default'];
};

const getTypeLabel = (type?: string): string => {
  if (!type) return TYPE_LABELS['default'];
  return TYPE_LABELS[type] || TYPE_LABELS['default'];
};

export const TaskQueuePanel: React.FC = () => {
  const {
    queuePanelOpen,
    taskQueue,
    nodes,
    setQueuePanelOpen,
    removeFromQueue,
    clearCompletedTasks,
    executeQueue,
  } = useAppStore();

  // 必须将所有 hooks 放在条件返回之前
  const [activeTab, setActiveTab] = React.useState<'active' | 'completed'>('active');

  if (!queuePanelOpen) return null;

  // 队列中的节点 + 进行中（即使不在队列里）的节点
  const activeNodeIds = new Set([
    ...taskQueue,
    ...Object.values(nodes)
      .filter(n => n.status === 'loading' || n.status === 'processing')
      .map(n => n.id),
  ]);

  const activeNodes = Array.from(activeNodeIds)
    .map(id => nodes[id])
    .filter(Boolean);

  const completedNodes = Object.values(nodes).filter(
    n => n.status === 'success' || n.status === 'error'
  );

  const getProgress = (node: typeof activeNodes[0]): number => {
    if (node.status === 'success') return 100;
    if (node.status === 'loading') return 60; // 估算值
    if (node.status === 'processing') return 80;
    return 0;
  };

  return (
    <div className="task-queue-panel">
      {/* 标题行 */}
      <div className="tq-header">
        <span className="tq-title">生成队列</span>
        <button
          className="tq-close"
          onClick={() => setQueuePanelOpen(false)}
        >
          ×
        </button>
      </div>

      {/* Tab 切换 */}
      <div className="tq-tabs">
        <button
          className={`tq-tab ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          进行中 ({activeNodes.length})
        </button>
        <button
          className={`tq-tab ${activeTab === 'completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          已完成 ({completedNodes.length})
        </button>
      </div>

      {/* 列表区域 */}
      <div className="tq-list">
        {/* 进行中 Tab */}
        {activeTab === 'active' && activeNodes.length === 0 && (
          <div className="tq-empty">队列空闲，无进行中任务</div>
        )}
        {activeTab === 'active' &&
          activeNodes.map(node => (
            <div key={node.id} className={`tq-card tq-card-${node.status}`}>
              <div className="tq-card-top">
                <span className="tq-icon">{getTypeIcon(node.type)}</span>
                <span className="tq-type">{node.type || '节点'}</span>
                <span className="tq-status">
                  {STATUS_LABELS[node.status] || node.status}
                </span>
                {node.status === 'loading' && (
                  <button
                    className="tq-action-btn tq-cancel"
                    onClick={() => removeFromQueue(node.id)}
                  >
                    取消
                  </button>
                )}
              </div>
              <div className="tq-progress-bar">
                <div
                  className="tq-progress-fill"
                  style={{ width: `${getProgress(node)}%` }}
                />
              </div>
              {node.prompt && (
                <div className="tq-prompt">
                  {node.prompt.slice(0, 60)}
                  {node.prompt.length > 60 ? '…' : ''}
                </div>
              )}
            </div>
          ))}

        {/* 已完成 Tab */}
        {activeTab === 'completed' && completedNodes.length === 0 && (
          <div className="tq-empty">暂无已完成任务</div>
        )}
        {activeTab === 'completed' &&
          completedNodes.map(node => (
            <div key={node.id} className={`tq-card tq-card-${node.status}`}>
              <div className="tq-card-top">
                <span className="tq-type">{getTypeLabel(node.type)}</span>
                <button
                  className="tq-action-btn"
                  onClick={() => removeFromQueue(node.id)}
                >
                  删除
                </button>
              </div>
              {node.error && (
                <div className="tq-error">{node.error}</div>
              )}
              {node.result?.url && (
                <button
                  className="tq-view-btn"
                  onClick={() => {
                    useAppStore
                      .getState()
                      .setMediaPreview({
                        src: node.result!.url!,
                        type: (node.result!.type as 'image' | 'video') || 'image',
                      });
                  }}
                >
                  查看结果
                </button>
              )}
            </div>
          ))}
      </div>

      {/* 底部操作栏 */}
      <div className="tq-footer">
        <button
          className="tq-footer-btn"
          onClick={clearCompletedTasks}
          disabled={completedNodes.length === 0}
        >
          清除已完成
        </button>
        <button
          className="tq-footer-btn tq-execute-btn"
          onClick={executeQueue}
          disabled={activeNodes.length === 0}
        >
          执行队列
        </button>
      </div>
    </div>
  );
};
