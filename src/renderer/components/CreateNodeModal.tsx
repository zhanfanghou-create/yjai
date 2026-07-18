import React, { useState } from 'react';
import { useAppStore, AINodeType, APIProvider } from '../store/appStore';

interface CreateNodeModalProps {
  onClose: () => void;
  onConfirm: (type: AINodeType, provider: APIProvider) => void;
}

const NODE_TYPE_OPTIONS = [
  { id: 'story-script',    label: '文本',       desc: '剧本、广告词、品牌文案',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="16" y2="18"/></svg>, color: '#e0e0e0' },
  { id: 'text-to-image',   label: '图片',       desc: '海报、分镜、角色设计',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, color: '#00D4FF' },
  { id: 'text-to-video',   label: '视频',       desc: '创意广告、动画、电影',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>, color: '#8b5cf6' },
  { id: 'video-composite', label: '视频合成',   desc: '多个视频片段合为一个',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>, color: '#f59e0b' },
  { id: 'director-stage',  label: '导演台',     desc: '搭建3D场景',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>, color: '#10b981' },
  { id: 'storyboard',      label: '故事板',     desc: '九宫格分镜设计',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, color: '#f472b6' },
  { id: 'audio2video',     label: '音频',       desc: '音效、配音、音乐',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>, color: '#ec4899' },
  { id: 'story-script-adv',label: '脚本',       desc: '创意脚本',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>, color: '#6366f1' },
  { id: 'material-lib',    label: '素材库',     desc: '海量素材内容',   icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>, color: '#06b6d4' },
  { id: 'comfyui',         label: 'ComfyUI',    desc: 'ComfyUI 自定义工作流节点', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>, color: '#a855f7' },
];

export const CreateNodeModal: React.FC<CreateNodeModalProps> = ({ onClose, onConfirm }) => {
  const [nodeType, setNodeType] = useState<AINodeType>('text-to-image');
  const [provider, setProvider] = useState<APIProvider>('openai');
  
  const providers = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'comfyui', label: 'ComfyUI (本地)' },
    { id: 'siliconflow', label: '硅基流动' },
    { id: 'zhipu', label: '智谱 AI' },
  ];
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content glass-modal" onClick={e => e.stopPropagation()} style={{ animation: 'slideInUp 0.25s ease-out' }}>
        <h2 style={{ marginBottom: 16, fontSize: 18 }}>创建 AI 节点</h2>
        
        <div className="modal-section">
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>节点类型</label>
          <div className="node-type-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {NODE_TYPE_OPTIONS.map(type => (
              <button
                key={type.id}
                className={`node-type-btn ${nodeType === type.id ? 'active' : ''}`}
                onClick={() => setNodeType(type.id as AINodeType)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: '10px 6px',
                  borderRadius: 10,
                  border: nodeType === type.id ? `2px solid ${type.color}` : '1px solid rgba(255,255,255,0.1)',
                  background: nodeType === type.id ? `${type.color}15` : 'rgba(255,255,255,0.04)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: 12,
                }}
              >
                <span style={{ width: 20, height: 20, color: type.color }}>{type.icon}</span>
                <span style={{ fontWeight: 500 }}>{type.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.2 }}>{type.desc}</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="modal-section" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>API 提供商</label>
          <select 
            value={provider} 
            onChange={e => setProvider(e.target.value as APIProvider)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.25)',
              color: 'var(--text-primary)',
              fontSize: 13,
              width: '100%',
            }}
          >
            {providers.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>
        
        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
          <button className="glass-btn glass-btn-secondary" onClick={onClose}>取消</button>
          <button className="glass-btn glass-btn-primary" onClick={() => {
            onConfirm(nodeType, provider);
            onClose();
          }}>创建</button>
        </div>
      </div>
    </div>
  );
};
