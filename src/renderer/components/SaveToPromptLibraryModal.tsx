import React, { useState } from 'react';
import { useAppStore } from '../store/appStore';
import './PromptLibrary.css';

interface SaveToPromptLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultPrompt: string;
  defaultName?: string;
  thumbnail?: string;
  sourceType?: 'text' | 'image' | 'video';
  filePath?: string;
  defaultTags?: string[];
}

export const SaveToPromptLibraryModal: React.FC<SaveToPromptLibraryModalProps> = ({
  isOpen,
  onClose,
  defaultPrompt,
  defaultName = '',
  thumbnail,
  sourceType = 'text',
  filePath,
  defaultTags = [],
}) => {
  const { addPromptItem, showToast } = useAppStore();

  const [name, setName] = useState(defaultName);
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [type, setType] = useState<'text' | 'image' | 'video'>(sourceType);
  const [tags, setTags] = useState(defaultTags.join('，'));

  React.useEffect(() => {
    setPrompt(defaultPrompt);
  }, [defaultPrompt]);

  React.useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  React.useEffect(() => {
    setType(sourceType);
  }, [sourceType]);

  React.useEffect(() => {
    setTags(defaultTags.join('，'));
  }, [defaultTags.join('|')]);

  const handleSave = () => {
    if (!name.trim()) {
      showToast?.('请输入名称', 'error');
      return;
    }
    if (!prompt.trim()) {
      showToast?.('请输入提示词', 'error');
      return;
    }

    addPromptItem({
      name: name.trim(),
      type,
      prompt: prompt.trim(),
      thumbnail: type !== 'text' ? thumbnail : undefined,
      filePath,
      tags: tags.split(/[，,\s]+/).map(tag => tag.trim()).filter(Boolean),
    });

    showToast?.('已存入提示词库', 'success');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-header">
          <h3 className="modal-title">存入提示词库</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="input-wrapper">
            <label className="input-label">类型</label>
            <select className="select-field" value={type} onChange={(event) => setType(event.target.value as any)}>
              <option value="text">文本</option>
              <option value="image">图像</option>
              <option value="video">视频</option>
            </select>
          </div>
          <div className="input-wrapper" style={{ marginTop: 16 }}>
            <label className="input-label">名称</label>
            <input
              type="text"
              className="input-field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入提示词名称"
              autoFocus
            />
          </div>
          <div className="input-wrapper" style={{ marginTop: 16 }}>
            <label className="input-label">分类标签</label>
            <input
              type="text"
              className="input-field"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="多个标签用逗号或空格分隔"
            />
          </div>
          <div className="input-wrapper" style={{ marginTop: 16 }}>
            <label className="input-label">提示词内容</label>
            <textarea
              className="textarea-field"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="请输入提示词内容"
              rows={6}
            />
          </div>
          {thumbnail && type !== 'text' && (
            <div className="input-wrapper" style={{ marginTop: 16 }}>
              <label className="input-label">关联缩略图</label>
              <img src={thumbnail} alt="关联缩略图" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8 }} />
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="modal-btn cancel" onClick={onClose}>取消</button>
          <button className="modal-btn confirm" onClick={handleSave}>存入词库</button>
        </div>
      </div>
    </div>
  );
};
