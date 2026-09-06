import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import './NodeInputModal.css';

export interface NodeInputModalProps {
  open: boolean;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  initialValue?: string;
  prefillFromSource?: string; // from connected source node result
  onClose: () => void;
  onSubmit: (value: string, options: { autoCreateResult: boolean; configId?: string; model?: string; files?: File[]; batchCount?: number }) => void;
}

export const NodeInputModal: React.FC<NodeInputModalProps> = ({
  open,
  nodeId,
  nodeType,
  nodeLabel,
  initialValue = '',
  prefillFromSource = '',
  onClose,
  onSubmit,
}) => {
  const [inputValue, setInputValue] = useState(initialValue || prefillFromSource);
  const [autoCreateResult, setAutoCreateResult] = useState(true);
  const [batchCount, setBatchCount] = useState(1); // 批量生成数量
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiConfigs = useAppStore(s => s.apiConfigs);
  const imageAPIConfigs = useAppStore(s => s.imageAPIConfigs);
  const videoAPIConfigs = useAppStore(s => s.videoAPIConfigs);
  const voiceAPIConfigs = useAppStore(s => s.voiceAPIConfigs);
  const musicAPIConfigs = useAppStore(s => s.musicAPIConfigs);
  const comfyuiConfigs = useAppStore(s => s.comfyuiConfigs);

  // Determine which API configs to show based on node type
  const relevantConfigs = (() => {
    if (['text-to-image', 'storyboard', 'image-to-image', 'image-upscale'].includes(nodeType)) return imageAPIConfigs.filter(c => c.baseUrl && c.defaultModel);
    if (['text-to-video', 'video-composite', 'image-to-video'].includes(nodeType)) return videoAPIConfigs.filter(c => c.baseUrl && c.defaultModel);
    if (['tts', 'audio2video'].includes(nodeType)) return voiceAPIConfigs.filter(c => c.baseUrl && c.defaultModel);
    if (['video-to-music'].includes(nodeType)) return musicAPIConfigs.filter(c => c.baseUrl && c.defaultModel);
    if (nodeType === 'comfyui') return comfyuiConfigs.filter(c => c.serverUrl).map(c => ({ id: c.id, name: c.name, models: c.workflowFiles || [], defaultModel: c.workflowFiles?.[0] || '', baseUrl: c.serverUrl } as any));
    return apiConfigs.filter(c => c.baseUrl && c.defaultModel);
  })();

  // 正式调用页：模型选择只显示用户配置好的默认模型（ComfyUI 工作流保持全部可选）
  const availableModels = (() => {
    if (!selectedConfigId) return [];
    const config = relevantConfigs.find(c => c.id === selectedConfigId);
    if (nodeType === 'comfyui') return config?.models || [];
    const def = String(config?.defaultModel || '').trim();
    const first = String((config?.models || [])[0] || '').trim();
    const value = def || first;
    return value ? [value] : [];
  })();

  useEffect(() => {
    const val = initialValue || prefillFromSource;
    setInputValue(val);
  }, [initialValue, prefillFromSource]);

  useEffect(() => {
    // Auto-select first config if none selected
    if (!selectedConfigId && relevantConfigs.length > 0) {
      const first = relevantConfigs[0];
      setSelectedConfigId(first.id);
      if (first.models && first.models.length > 0) {
        setSelectedModel(first.models[0]);
      }
    }
  }, [relevantConfigs, selectedConfigId]);

  const handleSubmit = useCallback(() => {
    if (inputValue.trim() || attachedFiles.length > 0) {
      onSubmit(inputValue, {
        autoCreateResult,
        configId: selectedConfigId || undefined,
        model: selectedModel || undefined,
        files: attachedFiles.length > 0 ? attachedFiles : undefined,
        batchCount,
      });
      setInputValue('');
      setAttachedFiles([]);
      onClose();
    }
  }, [inputValue, autoCreateResult, selectedConfigId, selectedModel, attachedFiles, onSubmit, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose();
    }
  }, [handleSubmit, onClose]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  if (!open) return null;

  const getPlaceholder = () => {
    switch (nodeType) {
      case 'text-to-image':
        return '请输入图片生成提示词，描述您想要的画面...';
      case 'text-to-video':
        return '请输入视频生成提示词，描述您想要的场景...';
      case 'story-script':
        return '请输入文本内容...';
      case 'story-script-adv':
        return '请输入剧本内容或创意描述...';
      case 'audio2video':
        return '请输入音频生成提示词或文本转语音内容...';
      case 'video-composite':
        return '请输入视频合成要求...';
      case 'storyboard':
        return '请输入故事板描述，分镜设计...';
      case 'director-stage':
        return '请输入3D场景描述...';
      case 'material-lib':
        return '搜索素材关键词...';
      default:
        return '请输入内容...';
    }
  };

  const getIcon = () => {
    switch (nodeType) {
      case 'text-to-image':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21,15 16,10 5,21" />
          </svg>
        );
      case 'text-to-video':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <polygon points="23 7 16 12 23 17" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
        );
      case 'story-script':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="6" y1="12" x2="21" y2="12" />
            <line x1="6" y1="18" x2="16" y2="18" />
          </svg>
        );
      case 'story-script-adv':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="14" y2="17" />
          </svg>
        );
      case 'audio2video':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
        );
      case 'video-composite':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        );
      case 'storyboard':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        );
      case 'director-stage':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        );
      case 'material-lib':
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  return (
    <div className="node-input-modal-overlay" onClick={onClose}>
      <div 
        className="glass-modal node-input-modal" 
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideInUp 0.25s ease-out' }}
      >
        <div className="node-input-modal-header">
          <div className="node-input-modal-icon">
            {getIcon()}
          </div>
          <div className="node-input-modal-title">
            <h3>{nodeLabel}</h3>
            <p>输入内容并生成结果</p>
          </div>
          <button className="node-input-modal-close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="node-input-modal-body">
          <textarea
            className="node-input-textarea"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={getPlaceholder()}
            autoFocus
            rows={6}
          />
          
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="node-input-files">
              {attachedFiles.map((f, idx) => (
                <span key={idx} className="node-input-file-tag">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 12, height: 12, flexShrink: 0 }}>
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                    <polyline points="13 2 13 9 20 9" />
                  </svg>
                  {f.name}
                  <span className="file-remove" onClick={() => removeFile(idx)}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 10, height: 10 }}>
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </span>
                </span>
              ))}
            </div>
          )}

          {/* Action buttons row: Upload + Asset Library */}
          <div className="node-input-action-row">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              id={`modal-file-${nodeId}`}
            />
            <button 
              className="node-input-action-btn" 
              onClick={() => fileInputRef.current?.click()}
              title="上传文件"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              上传文件
            </button>
            <button 
              className="node-input-action-btn"
              onClick={() => setShowAssetPicker(true)}
              title="从资产库选择"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              资产库
            </button>
          </div>

          {/* API Config / Model selector */}
          {relevantConfigs.length > 0 && (
            <div className="node-input-api-section">
              <div className="node-input-api-row">
                <div className="node-input-api-field">
                  <label>接口</label>
                  <select 
                    value={selectedConfigId} 
                    onChange={e => {
                      setSelectedConfigId(e.target.value);
                      const config = relevantConfigs.find(c => c.id === e.target.value);
                      if (config?.models && config.models.length > 0) {
                        setSelectedModel(config.models[0]);
                      } else {
                        setSelectedModel('');
                      }
                    }}
                    className="node-input-select"
                  >
                    <option value="">默认</option>
                    {relevantConfigs.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                {availableModels.length > 0 && (
                  <div className="node-input-api-field">
                    <label>模型</label>
                    <select 
                      value={selectedModel} 
                      onChange={e => setSelectedModel(e.target.value)}
                      className="node-input-select"
                    >
                      <option value="">默认</option>
                      {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 批量生成 + 模型信息 */}
          {['text-to-image', 'image-to-image', 'image-upscale', 'text-to-video', 'image-to-video'].includes(nodeType) && relevantConfigs.length > 0 && (
            <div className="node-input-batch-section">
              {/* 批量数量 */}
              <div className="node-input-batch-row">
                <div className="node-input-batch-label">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 13, height: 13 }}>
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                  批量生成
                </div>
                <div className="node-input-batch-count">
                  <button
                    className="batch-btn"
                    onClick={() => setBatchCount(Math.max(1, batchCount - 1))}
                    disabled={batchCount <= 1}
                  >−</button>
                  <span className="batch-num">{batchCount}</span>
                  <button
                    className="batch-btn"
                    onClick={() => setBatchCount(Math.min(8, batchCount + 1))}
                    disabled={batchCount >= 8}
                  >+</button>
                  {batchCount > 1 && <span className="batch-hint">将生成 {batchCount} 个结果</span>}
                </div>
              </div>

              {/* 模型能力提示 */}
              {selectedModel && (
                <div className="node-input-model-hint">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 12, height: 12, flexShrink: 0 }}>
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span>模型：<strong>{selectedModel}</strong>
                  {['image', 'video'].includes(nodeType.split('-')[0]) && (
                    <span className="model-cap-hint"> · 建议适当调整提示词以获得不同变体</span>
                  )}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="node-input-options">
            <label className="option-checkbox">
              <input
                type="checkbox"
                checked={autoCreateResult}
                onChange={e => setAutoCreateResult(e.target.checked)}
              />
              <span className="checkbox-custom"></span>
              <span className="option-label">生成后自动创建结果卡片</span>
            </label>
          </div>

          <div className="node-input-tips">
            <div className="tip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.6 }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>详细的描述能获得更好的生成效果</span>
            </div>
            <div className="tip-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.6 }}>
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="6" y1="8" x2="6" y2="8" />
                <line x1="10" y1="8" x2="18" y2="8" />
                <line x1="6" y1="12" x2="18" y2="12" />
              </svg>
              <span>Ctrl+Enter 提交，ESC 关闭</span>
            </div>
          </div>
        </div>

        <div className="node-input-modal-footer">
          <button className="glass-btn glass-btn-secondary" onClick={onClose}>
            取消
          </button>
          <button 
            className="glass-btn glass-btn-primary"
            onClick={handleSubmit}
            disabled={!inputValue.trim() && attachedFiles.length === 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            生成并执行
          </button>
        </div>
      </div>
    </div>
  );
};
