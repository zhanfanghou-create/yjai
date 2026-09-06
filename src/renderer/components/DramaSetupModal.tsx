import React, { useState } from 'react';
import type { AIConfigInput, AssetImageSource } from '../services/dramartWorkflow';
import './DramaWorkshopPage.css';

export interface SetupChatOption {
  id: string;
  label: string;
  config: AIConfigInput | null;
}
export interface SetupOption {
  id: string;
  label: string;
}
export interface SetupChoice {
  chatId: string;
  chatLabel: string;
  chatConfig: AIConfigInput | null;
  imageId: string;
  imageLabel: string;
  imageSource: AssetImageSource | null;
  videoId: string;
  videoLabel: string;
  videoConfigId?: string;
  videoModel?: string;
  shotDuration: number;
}

interface DramaSetupModalProps {
  chatOptions: SetupChatOption[];
  imageOptions: SetupOption[];
  videoOptions: SetupOption[];
  defaults: { chatId?: string; imageId?: string; videoId?: string; shotDuration?: number };
  onClose: () => void;
  onConfirm: (sel: SetupChoice) => void;
}

const SHOT_DURATION_OPTIONS = [5, 10, 15, 20, 25, 30];

const DramaSetupModal: React.FC<DramaSetupModalProps> = ({ chatOptions, imageOptions, videoOptions, defaults, onClose, onConfirm }) => {
  const [chatId, setChatId] = useState(defaults.chatId || chatOptions[0]?.id || '');
  const [imageId, setImageId] = useState(defaults.imageId || imageOptions[0]?.id || '');
  const [videoId, setVideoId] = useState(defaults.videoId || videoOptions[0]?.id || '');
  const [shotDuration, setShotDuration] = useState(defaults.shotDuration || 15);

  const chatSel = chatOptions.find(o => o.id === chatId) || chatOptions[0];
  const imageSel = imageOptions.find(o => o.id === imageId) || imageOptions[0];
  const videoSel = videoOptions.find(o => o.id === videoId) || videoOptions[0];

  const parseImage = (id: string): AssetImageSource | null => {
    if (!id || id === '__auto') return null;
    if (id.startsWith('api:')) return { kind: 'api', model: id.slice(4) };
    if (id.startsWith('comfyui:')) return { kind: 'comfyui', workflow: id.slice(8) };
    return null;
  };

  const handleConfirm = () => {
    const vId = videoSel?.id || '';
    const BUILTIN_WF_MAP: Record<string, string> = {
      'builtin:minimax_h3_video': '艺镜内置·MiniMax H3 全能参考视频',
    };
    const vModel = vId.startsWith('comfy:') ? vId.slice(6) : (vId.startsWith('vid:') ? vId.split('|')[1] || '' : (BUILTIN_WF_MAP[vId] || ''));
    const vCfgId = vId.startsWith('vid:') ? (vId.split('|')[0].slice(4) || undefined) : undefined;
    onConfirm({
      chatId: chatSel?.id || '',
      chatLabel: chatSel?.label || '',
      chatConfig: chatSel?.config || null,
      imageId: imageSel?.id || '',
      imageLabel: imageSel?.label || '',
      imageSource: parseImage(imageSel?.id || ''),
      videoId: vId,
      videoLabel: videoSel?.label || '',
      videoConfigId: vCfgId,
      videoModel: vModel,
      shotDuration,
    });
  };

  return (
    <div className="dwc-overlay" onClick={onClose}>
      <div className="dwc-modal dwc-setup-modal" onClick={e => e.stopPropagation()}>
        <div className="dwc-modal-head">
          <span className="dwc-modal-title">项目生成配置</span>
          <button className="dwc-modal-close" onClick={onClose} title="关闭">✕</button>
        </div>
        <div className="dwc-modal-body">
          <p className="dwc-setup-desc">选定本次项目使用的推理、图像、视频模型与分镜时长，将应用到后续全部生成流程</p>

          <div className="dwc-setup-field">
            <label className="dwc-setup-label">推理（对话）模型 <span className="dwc-setup-tag">剧本分析 · 用于进度推理</span></label>
            {chatOptions.length ? (
              <select className="dwc-setup-select" value={chatSel?.id || ''} onChange={e => setChatId(e.target.value)}>
                {chatOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <div className="dwc-setup-empty">未检测到可用的对话模型，将使用内置示例分析（可到设置页一键接入）</div>
            )}
          </div>

          <div className="dwc-setup-field">
            <label className="dwc-setup-label">图像生成 <span className="dwc-setup-tag">资产图 / 封面 · AI 模型或 ComfyUI</span></label>
            {imageOptions.length ? (
              <select className="dwc-setup-select" value={imageSel?.id || ''} onChange={e => setImageId(e.target.value)}>
                {imageOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <div className="dwc-setup-empty">未配置图像模型或 ComfyUI 工作流，资产图将跳过生成</div>
            )}
          </div>

          <div className="dwc-setup-field">
            <label className="dwc-setup-label">视频生成 <span className="dwc-setup-tag">分镜成片 · AI 模型或 ComfyUI</span></label>
            {videoOptions.length ? (
              <select className="dwc-setup-select" value={videoSel?.id || ''} onChange={e => setVideoId(e.target.value)}>
                {videoOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            ) : (
              <div className="dwc-setup-empty">未配置视频模型，分镜视频需后续在分镜页设置</div>
            )}
          </div>

          <div className="dwc-setup-field">
            <label className="dwc-setup-label">分镜时长 <span className="dwc-setup-tag">每个分镜最大秒数</span></label>
            <div className="dwc-shot-duration-grid">
              {SHOT_DURATION_OPTIONS.map(dur => (
                <button
                  key={dur}
                  className={`dwc-shot-duration-btn${shotDuration === dur ? ' active' : ''}`}
                  onClick={() => setShotDuration(dur)}
                >
                  <span className="dwc-shot-duration-num">{dur}</span>
                  <span className="dwc-shot-duration-unit">秒</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="dwc-modal-foot">
          <button className="dwc-modal-cancel" onClick={onClose}>取消</button>
          <button className="dwc-modal-ok" onClick={handleConfirm}>确认并开始分析</button>
        </div>
      </div>
    </div>
  );
};

export default DramaSetupModal;
