import React, { useState } from 'react';
import { useAppStore, PromptItem } from '../store/appStore';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ScriptIcon,
  ImageIcon,
  VideoIcon,
  BookIcon,
  ClipboardIcon,
  UploadIcon,
  CloseIcon,
} from './Icons';
import './PromptLibrary.css';
import { autoSaveFileToAssets } from '../utils/assetAutoSave';

type PromptType = 'all' | 'text' | 'image' | 'video';

export const PromptLibrary: React.FC = () => {
  const {
    promptLibrary,
    addPromptItem,
    updatePromptItem,
    deletePromptItem,
    showToast,
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<PromptType>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<PromptItem | null>(null);
  const [previewItem, setPreviewItem] = useState<PromptItem | null>(null);

  // 表单状态
  const [formType, setFormType] = useState<'text' | 'image' | 'video'>('text');
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formThumbnail, setFormThumbnail] = useState<string | null>(null);

  // 过滤提示词
  const filteredItems = promptLibrary.filter(item => {
    if (activeTab === 'all') return true;
    return item.type === activeTab;
  });

  // 处理文件选择（自动生成缩略图）
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormFile(file);
    autoSaveFileToAssets(file, 'tools');

    // 为图片生成缩略图
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormThumbnail(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    // 视频也尝试生成缩略图
    else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.onloadeddata = () => {
        video.currentTime = 1;
      };
      video.onseeked = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          setFormThumbnail(canvas.toDataURL('image/jpeg', 0.8));
        }
        URL.revokeObjectURL(video.src);
      };
    }
  };

  // 保存提示词
  const handleSave = () => {
    if (!formName.trim()) {
      showToast?.('请输入名称', 'error');
      return;
    }
    if (!formPrompt.trim()) {
      showToast?.('请输入提示词', 'error');
      return;
    }
    if ((formType === 'image' || formType === 'video') && !formFile && !editingItem) {
      showToast?.('请上传文件', 'error');
      return;
    }

    const filePath = formFile ? URL.createObjectURL(formFile) : undefined;

    if (editingItem) {
      updatePromptItem(editingItem.id, {
        name: formName,
        type: formType,
        prompt: formPrompt,
        ...(filePath ? { filePath } : {}),
        ...(formThumbnail ? { thumbnail: formThumbnail } : {}),
      });
      showToast?.('更新成功', 'success');
    } else {
      addPromptItem({
        name: formName,
        type: formType,
        prompt: formPrompt,
        filePath,
        thumbnail: formThumbnail || undefined,
      });
      showToast?.('添加成功', 'success');
    }

    resetForm();
  };

  const resetForm = () => {
    setFormType('text');
    setFormName('');
    setFormPrompt('');
    setFormFile(null);
    setFormThumbnail(null);
    setEditingItem(null);
    setShowAddDialog(false);
  };

  // 编辑
  const handleEdit = (item: PromptItem) => {
    setEditingItem(item);
    setFormType(item.type);
    setFormName(item.name);
    setFormPrompt(item.prompt);
    setFormThumbnail(item.thumbnail || null);
    setShowAddDialog(true);
  };

  // 删除
  const handleDelete = (id: string) => {
    if (confirm('确定要删除这个提示词吗？')) {
      deletePromptItem(id);
      showToast?.('删除成功', 'success');
    }
  };

  // 复制到剪贴板
  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast?.('已复制到剪贴板', 'success');
    } catch {
      showToast?.('复制失败', 'error');
    }
  };

  // 获取类型图标
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return <ScriptIcon size={48} />;
      case 'image': return <ImageIcon size={48} />;
      case 'video': return <VideoIcon size={48} />;
      default: return <ScriptIcon size={48} />;
    }
  };

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'text': return '文本';
      case 'image': return '图像';
      case 'video': return '视频';
      default: return type;
    }
  };

  return (
    <div className="prompt-library-page">
      {/* 头部 */}
      <div className="prompt-library-header">
        <h2>提示词库</h2>
        <div className="prompt-library-actions">
          <button
           className="add-prompt-btn"
             onClick={() => {
               resetForm();
               setShowAddDialog(true);
             }}
           >
             <PlusIcon size={16} />
             添加提示词
           </button>
        </div>
      </div>

      {/* 分类标签 */}
      <div className="prompt-filters">
        {[
          { key: 'all', label: '全部' },
          { key: 'text', label: '文本' },
          { key: 'image', label: '图像' },
          { key: 'video', label: '视频' },
        ].map(tab => (
          <button
            key={tab.key}
            className={`filter-tag ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key as PromptType)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 卡片网格 */}
      <div className="prompt-grid">
        {filteredItems.length === 0 ? (
           <div className="prompt-empty">
             <div className="prompt-empty-icon"><BookIcon size={48} /></div>
             <p>暂无提示词，点击"添加提示词"开始创建</p>
           </div>
        ) : (
          filteredItems.map(item => (
            <div key={item.id} className="prompt-card">
              <div
                className="prompt-card-thumb"
                onClick={() => setPreviewItem(item)}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.name} />
                ) : (
                  <span className="type-icon">{getTypeIcon(item.type)}</span>
                )}
                <div className="prompt-type-badge">{getTypeLabel(item.type)}</div>
              </div>
              <div className="prompt-card-content">
                <div className="prompt-card-name">{item.name}</div>
              </div>
              <div className="prompt-card-actions">
                <button
                   onClick={() => handleEdit(item)}
                   title="编辑"
                 >
                   <PencilIcon size={14} /> 编辑
                 </button>
                 <button
                   className="delete-btn"
                   onClick={() => handleDelete(item.id)}
                   title="删除"
                 >
                   <TrashIcon size={14} /> 删除
                 </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 添加/编辑对话框 */}
      {showAddDialog && (
        <div className="prompt-modal-overlay" onClick={(e) => e.target === e.currentTarget && resetForm()}>
          <div className="prompt-modal">
            <div className="modal-header">
              <h3>{editingItem ? '编辑提示词' : '添加提示词'}</h3>
               <button className="modal-close" onClick={resetForm}><CloseIcon size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>类型</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                >
                  <option value="text">文本</option>
                  <option value="image">图像</option>
                  <option value="video">视频</option>
                </select>
              </div>
              <div className="form-group">
                <label>名称</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="请输入名称"
                />
              </div>
              <div className="form-group">
                <label>提示词</label>
                <textarea
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  placeholder="请输入提示词内容"
                />
              </div>
              {(formType === 'image' || formType === 'video') && (
                <div className="form-group">
                  <label>上传文件</label>
                  {formThumbnail ? (
                    <div className="file-preview">
                      <img src={formThumbnail} alt="预览" />
                      <div className="file-preview-info">
                        <div className="file-preview-name">{formFile?.name || '已选择文件'}</div>
                      </div>
                      <button
                        className="file-preview-remove"
                        onClick={() => {
                          setFormFile(null);
                          setFormThumbnail(null);
                        }}
                      >
                        移除
                      </button>
                    </div>
                  ) : (
                    <label className="file-upload">
                      <input
                        type="file"
                        accept={formType === 'image' ? 'image/*' : 'video/*'}
                        onChange={handleFileChange}
                      />
                       <div className="file-upload-icon"><UploadIcon size={32} /></div>
                      <p>点击上传{formType === 'image' ? '图片' : '视频'}</p>
                    </label>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={resetForm}>取消</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editingItem ? '保存' : '添加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 预览对话框 */}
      {previewItem && (
        <div
          className="prompt-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setPreviewItem(null)}
        >
          <div className="prompt-modal">
            <div className="modal-header">
              <h3>{previewItem.name}</h3>
               <button className="modal-close" onClick={() => setPreviewItem(null)}><CloseIcon size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="preview-content">
                {previewItem.type !== 'text' && (
                  <div className="preview-thumbnail">
                    {previewItem.thumbnail ? (
                      <img src={previewItem.thumbnail} alt={previewItem.name} />
                    ) : (
                      <span className="type-icon">{getTypeIcon(previewItem.type)}</span>
                    )}
                  </div>
                )}
                <div className="preview-info">
                  <div className="preview-info-row">
                    <span className="preview-info-label">类型</span>
                    <span className="preview-info-value">{getTypeLabel(previewItem.type)}</span>
                  </div>
                  <div className="preview-info-row">
                    <span className="preview-info-label">创建时间</span>
                    <span className="preview-info-value">{new Date(previewItem.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="preview-info-row">
                    <span className="preview-info-label">提示词内容</span>
                    <div className="preview-prompt">{previewItem.prompt}</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
               <button
                 className="btn btn-primary"
                 onClick={() => handleCopy(previewItem.prompt)}
               >
                 <ClipboardIcon size={16} /> 一键复制
               </button>
              <button className="btn btn-secondary" onClick={() => setPreviewItem(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};