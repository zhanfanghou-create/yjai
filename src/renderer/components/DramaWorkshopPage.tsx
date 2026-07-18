import React, { useState, useMemo } from 'react';
import { useAppStore, type RecommendedConfig } from '../store/appStore';
import { SaveToPromptLibraryModal } from './SaveToPromptLibraryModal';
import toolService from '../services/toolService';
import {
  WriterIcon,
  ScriptIcon,
  StoryboardIcon,
  LightbulbIcon,
  SaveIcon,
  BookIcon,
  SendIcon,
  PlusIcon,
} from './Icons';
import './DramaWorkshopPage.css';

type DramaTool = 'script' | 'storyboard' | 'character' | 'idea';

interface DramaToolDef {
  id: DramaTool;
  name: string;
  desc: string;
  icon: React.FC<{ size?: number; className?: string }>;
  placeholder: string;
  defaultPrompt: string;
  resultType: 'text' | 'image';
  sourceType: 'text' | 'image' | 'video';
}

const TOOLS: DramaToolDef[] = [
  {
    id: 'script',
    name: '剧本生成',
    desc: '输入主题大纲，生成完整剧本与台词',
    icon: WriterIcon,
    placeholder: '输入主题、类型、时长、风格...',
    defaultPrompt: '请根据以下主题生成一段 3 分钟短视频剧本，包含场景、人物、台词和情绪节奏：\n\n主题：',
    resultType: 'text',
    sourceType: 'text',
  },
  {
    id: 'storyboard',
    name: '分镜脚本',
    desc: '把剧本拆解为镜头、景别、运镜与画面提示词',
    icon: StoryboardIcon,
    placeholder: '输入剧本或故事梗概...',
    defaultPrompt: '请将以下剧本拆解为分镜脚本，每行包含镜号、景别、机位、画面描述、台词和文生图提示词：\n\n',
    resultType: 'text',
    sourceType: 'text',
  },
  {
    id: 'character',
    name: '角色设计',
    desc: '生成角色外貌、性格、背景与台词风格',
    icon: ScriptIcon,
    placeholder: '描述角色特征...',
    defaultPrompt: '请为以下角色生成完整设定：外貌、年龄、性格、背景故事、口头禅、情绪表达方式。\n\n角色：',
    resultType: 'text',
    sourceType: 'text',
  },
  {
    id: 'idea',
    name: '创意灵感',
    desc: '把一句话创意扩展为完整故事方向',
    icon: LightbulbIcon,
    placeholder: '输入一个创意点子...',
    defaultPrompt: '请将以下创意点子扩展为完整故事方向，包含核心冲突、目标观众、情绪曲线和 3 个关键场景：\n\n创意：',
    resultType: 'text',
    sourceType: 'text',
  },
];

interface UnifiedConfig {
  id: string;
  name: string;
  apiType: 'openai-chat' | 'custom-chat' | string;
  baseUrl?: string;
  models: string[];
  defaultModel?: string;
  source: 'recommended' | 'chat';
}

export const DramaWorkshopPage: React.FC = () => {
  const {
    recommendedConfigs,
    apiConfigs,
    chatAPIConfigs,
    showToast,
    addAsset,
    addPromptItem,
  } = useAppStore();

  const [activeTool, setActiveTool] = useState<DramaTool | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [saveModal, setSaveModal] = useState<{
    isOpen: boolean;
    prompt: string;
    name: string;
    sourceType: 'text' | 'image' | 'video';
  }>({ isOpen: false, prompt: '', name: '', sourceType: 'text' });

  const allConfigs = useMemo<UnifiedConfig[]>(() => {
    const configs: UnifiedConfig[] = [];
    const addIfChat = (config: RecommendedConfig | any, source: 'recommended' | 'chat') => {
      // RecommendedConfig 有 apiType 字段，APIConfig 没有 apiType 但有 provider 字段
      const apiType = config.apiType || (config.provider ? 'openai-chat' : '');
      if (source === 'recommended' && !['openai-chat', 'custom-chat'].includes(apiType)) return;
      // APIConfig 检查关键字段
      if (!config.baseUrl || !config.name) return;
      if (source === 'recommended' && !config.apiKey) return;
      if (source === 'chat' && !config.apiKey) return;
      if (configs.find(c => c.id === config.id)) return;
      configs.push({
        id: config.id,
        name: config.name.trim(),
        apiType: apiType || 'openai-chat',
        baseUrl: config.baseUrl,
        models: config.models || [],
        defaultModel: config.defaultModel || config.models?.[0] || '',
        source,
      });
    };

    recommendedConfigs.forEach(c => addIfChat(c, 'recommended'));
    apiConfigs.forEach(c => addIfChat(c, 'chat'));
    chatAPIConfigs.forEach(c => addIfChat(c, 'chat'));
    return configs;
  }, [recommendedConfigs, apiConfigs, chatAPIConfigs]);

  const selectedConfig = useMemo(
    () => allConfigs.find(c => c.id === selectedConfigId) || allConfigs[0],
    [allConfigs, selectedConfigId]
  );

  const currentModelOptions = useMemo(() => {
    if (!selectedConfig) return [];
    return selectedConfig.models || [];
  }, [selectedConfig]);

  const currentTool = TOOLS.find(t => t.id === activeTool);

  const handleGenerate = async () => {
    if (!activeTool) return;
    if (!selectedConfig) {
      showToast('请先配置可用的对话 API', 'error');
      return;
    }
    if (!prompt.trim()) {
      showToast('请输入创意描述', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const fullPrompt = currentTool?.defaultPrompt
        ? `${currentTool.defaultPrompt}${prompt.trim()}`
        : prompt.trim();
      const res = await toolService.generateText(fullPrompt, selectedConfig);
      setResult(res.content);

      // 自动保存到资产库
      addAsset({
        name: `${currentTool?.name || '剧创'}_生成结果`,
        type: 'document',
        path: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(res.content)))}`,
        size: 0,
        sourceType: 'drama',
      });

      showToast('生成完成，已保存到资产库', 'success');
    } catch (error: any) {
      showToast(`生成失败：${error.message || '未知错误'}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBack = () => {
    setActiveTool(null);
    setPrompt('');
    setResult('');
    setSelectedConfigId('');
  };

  const handleSaveToPrompt = () => {
    if (!result) return;
    setSaveModal({
      isOpen: true,
      prompt: result,
      name: currentTool?.name || '剧创结果',
      sourceType: 'text',
    });
  };

  if (!activeTool) {
    return (
      <div className="drama-workshop-page">
        <div className="drama-workshop-header">
          <h2>剧创工场</h2>
          <p>剧本、分镜、角色设计一站式生成</p>
        </div>
        <div className="drama-workshop-grid">
          {TOOLS.map(tool => (
            <div
              key={tool.id}
              className="drama-workshop-card"
              onClick={() => {
                setActiveTool(tool.id);
                setPrompt('');
                setResult('');
              }}
            >
              <div className="drama-workshop-card-icon">
                <tool.icon size={32} />
              </div>
              <h4>{tool.name}</h4>
              <p>{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const Icon = currentTool?.icon || WriterIcon;

  return (
    <div className="drama-workshop-page detail">
      <div className="drama-workshop-detail-header">
        <button className="drama-workshop-back-btn" onClick={handleBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          返回
        </button>
        <span className="drama-workshop-detail-icon">
          <Icon size={24} />
        </span>
        <h2>{currentTool?.name}</h2>
      </div>

      <div className="drama-workshop-content">
        <div className="drama-workshop-panel">
          <div className="drama-workshop-section">
            <h4>选择 API 配置</h4>
            {allConfigs.length === 0 ? (
              <div className="drama-workshop-warning">暂无可用对话 API，请先到设置页配置</div>
            ) : (
              <select
                value={selectedConfig?.id || ''}
                onChange={e => { setSelectedConfigId(e.target.value); setSelectedModel(''); }}
              >
                {allConfigs.map(config => (
                  <option key={config.id} value={config.id}>
                    {config.name} · {config.apiType}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="drama-workshop-section">
            <h4>选择模型</h4>
            {!selectedConfig ? (
              <div className="drama-workshop-warning">请先选择 API 配置</div>
            ) : currentModelOptions.length === 0 ? (
              <div className="drama-workshop-warning">当前配置无可用模型</div>
            ) : (
              <select
                value={selectedModel || ''}
                onChange={e => setSelectedModel(e.target.value)}
              >
                <option value="">请选择模型</option>
                {currentModelOptions.map(model => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            )}
          </div>

          <div className="drama-workshop-section">
            <h4>输入创意</h4>
            <textarea
              placeholder={currentTool?.placeholder}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              rows={6}
            />
          </div>

          <button
            className={`drama-workshop-generate-btn ${isGenerating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating || allConfigs.length === 0}
          >
            {isGenerating ? (
              <>
                <svg className="spinner-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
                </svg>
                生成中...
              </>
            ) : (
              <>
                <SendIcon size={16} />
                开始生成
              </>
            )}
          </button>
        </div>

        <div className="drama-workshop-result">
          {!result ? (
            <div className="drama-workshop-empty">
              <Icon size={48} />
              <div>完成设置后点击“开始生成”<br />结果将显示在这里</div>
            </div>
          ) : (
            <div className="drama-workshop-result-box">
              <div className="drama-workshop-result-actions">
                <button className="drama-workshop-action-btn" onClick={handleSaveToPrompt}>
                  <BookIcon size={14} />
                  存入提示词库
                </button>
                <button
                  className="drama-workshop-action-btn"
                  onClick={() => {
                    addPromptItem({
                      name: currentTool?.name || '剧创结果',
                      type: 'text',
                      prompt: result,
                    });
                    showToast('已存入提示词库', 'success');
                  }}
                >
                  <SaveIcon size={14} />
                  快速保存
                </button>
              </div>
              <pre>{result}</pre>
            </div>
          )}
        </div>
      </div>

      <SaveToPromptLibraryModal
        isOpen={saveModal.isOpen}
        onClose={() => setSaveModal(prev => ({ ...prev, isOpen: false }))}
        defaultPrompt={saveModal.prompt}
        defaultName={saveModal.name}
        sourceType={saveModal.sourceType}
      />
    </div>
  );
};

export default DramaWorkshopPage;
