/**
 * BottomPromptComposer - 底部固定悬浮编辑器
 * LiblibTV 风格：点击节点后，画布底部出现固定的 Prompt 编辑面板
 * 不随画布缩放/平移，使用 Portal 挂载到 body
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore, AINode, AINodeType } from '../store/appStore';
import './BottomPromptComposer.css';

interface BottomPromptComposerProps {
  /** 当前选中的节点 ID，无选中时传 null */
  selectedNodeId: string | null;
  /** 节点数据 */
  node: AINode | null;
  /** 提交回调 */
  onSubmit: (nodeId: string, prompt: string, options?: Record<string, any>) => void;
  /** 关闭（取消选中） */
  onClose: () => void;
}

/** 接口/模型选项 */
const PROVIDER_OPTIONS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'replicate', label: 'Replicate' },
  { value: 'stability', label: 'Stability AI' },
  { value: 'runway', label: 'Runway' },
  { value: 'kling', label: 'Kling' },
  { value: 'minimax', label: 'MiniMax' },
];

const MODEL_MAP: Record<string, { value: string; label: string }[]> = {};

export const BottomPromptComposer: React.FC<BottomPromptComposerProps> = ({
  selectedNodeId,
  node,
  onSubmit,
  onClose,
}) => {
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<string>('openai');
  const [model, setModel] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // 同步节点数据
  useEffect(() => {
    if (node) {
      setPrompt(node.prompt || '');
      setProvider(node.provider || 'openai');
      setModel(node.model || '');
    }
  }, [node]);

  // 选中节点时自动聚焦 textarea
  useEffect(() => {
    if (selectedNodeId && !isCollapsed) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [selectedNodeId, isCollapsed]);

  const handleSubmit = useCallback(() => {
    if (!selectedNodeId || !prompt.trim()) return;
    onSubmit(selectedNodeId, prompt, { provider, model });
  }, [selectedNodeId, prompt, provider, model, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSubmit, onClose]);

  // 实时同步 prompt 回节点
  const updateNode = useAppStore(s => s.updateNode);
  const handlePromptChange = useCallback((val: string) => {
    setPrompt(val);
    if (selectedNodeId) {
      updateNode(selectedNodeId, { prompt: val });
    }
  }, [selectedNodeId, updateNode]);

  const handleProviderChange = useCallback((val: string) => {
    setProvider(val);
    if (selectedNodeId) {
      updateNode(selectedNodeId, { provider: val as any });
    }
  }, [selectedNodeId, updateNode]);

  const handleModelChange = useCallback((val: string) => {
    setModel(val);
    if (selectedNodeId) {
      updateNode(selectedNodeId, { model: val });
    }
  }, [selectedNodeId, updateNode]);

  const models = (node?.type && MODEL_MAP[node.type]) || [];

  if (!selectedNodeId || !node) return null;

  const typeLabel = node.type?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Node';

  return (
    <div className={`bpc-overlay ${isCollapsed ? 'bpc-collapsed' : ''}`}>
      {/* 顶部拖拽条 + 折叠 */}
      <div className="bpc-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <div className="bpc-drag-bar" />
        <div className="bpc-header-info">
          <span className="bpc-node-type-badge" style={{ '--badge-color': 'var(--accent-color)' } as React.CSSProperties}>
            {typeLabel}
          </span>
          <span className="bpc-node-id">#{selectedNodeId.slice(0, 6)}</span>
        </div>
        <div className="bpc-header-actions">
          <button className="bpc-header-btn" onClick={(e) => { e.stopPropagation(); onClose(); }} title="关闭">
            ✕
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* 快捷按钮栏 */}
          <div className="bpc-quick-bar">
            <button className="bpc-quick-btn" title="风格预设">
              <span className="bpc-line-icon" /> 风格
            </button>
            <button className="bpc-quick-btn" title="标记/收藏">
              <span>⭐</span> 标记
            </button>
            <button className="bpc-quick-btn" title="聚焦此节点">
              <span className="bpc-line-icon search" /> 聚焦
            </button>
          </div>

          {/* 主编辑区 */}
          <div className="bpc-editor">
            <textarea
              ref={textareaRef}
              className="bpc-textarea"
              value={prompt}
              onChange={e => handlePromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入提示词... (Ctrl+Enter 提交)"
              rows={3}
            />
          </div>

          {/* 底部参数栏 */}
          <div className="bpc-param-bar">
            <div className="bpc-param-left">
              <select
                className="bpc-select"
                value={provider}
                onChange={e => handleProviderChange(e.target.value)}
              >
                {PROVIDER_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              {models.length > 0 && (
                <select
                  className="bpc-select"
                  value={model}
                  onChange={e => handleModelChange(e.target.value)}
                >
                  <option value="">选择模型</option>
                  {models.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="bpc-param-right">
              <span className="bpc-char-count">{prompt.length}</span>
              <button
                className="bpc-submit-btn"
                onClick={handleSubmit}
                disabled={!prompt.trim()}
              >
                <span>▶</span> 生成
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
