import React, { useState, useRef, useMemo } from 'react';
import { useAppStore, EDGE_TTS_MODELS } from '../store/appStore';
import { SaveToPromptLibraryModal } from './SaveToPromptLibraryModal';
import { ToolIcons } from './ToolIcons';
import { AlertTriangleIcon } from './Icons';
import toolService from '../services/toolService';
import './ToolsPage.css';
import { autoSaveMediaToAssets, mediaTypeFromMime } from '../utils/assetAutoSave';

// 工具分类数据
const TOOL_CATEGORIES = [
  {
    id: 'style',
    name: '风格类',
    tools: [
      { id: 'style-transfer', name: '风格迁移', desc: '上传参考图，按目标风格重新生成', tags: ['风格', '迁移'], needsFile: true, resultType: 'image' },
      { id: 'style-reference', name: '风格参考', desc: '用文字描述生成指定风格的图片', tags: ['风格', '参考'], needsFile: false, resultType: 'image' },
      { id: 'style-consistent', name: '风格一致性', desc: '基于角色或场景参考图，保持风格生成系列图', tags: ['风格', '一致'], needsFile: true, resultType: 'image' },
    ]
  },
  {
    id: 'color',
    name: '色彩类',
    tools: [
      { id: 'auto-color', name: '一键上色', desc: '黑白照片自动着色', tags: ['修复', '上色'], needsFile: true, resultType: 'image' },
    ]
  },
  {
    id: 'image',
    name: '图像类',
    tools: [
      { id: 'batch-cutout', name: '批量抠图', desc: '智能识别主体，批量一键抠图', tags: ['抠图', '批量'], needsFile: true, resultType: 'image' },
      { id: 'image-upgrade', name: '画质增强', desc: 'AI 高清放大，细节无损增强', tags: ['增强', '高清'], needsFile: true, resultType: 'image' },
      { id: 'photo-restore', name: '老照片修复', desc: '破损照片智能修复', tags: ['修复', '老照片'], needsFile: true, resultType: 'image' },
      { id: 'watermark-remove', name: '去水印', desc: '智能识别水印，无痕一键去除', tags: ['修复', '去水印'], needsFile: true, resultType: 'image' },
      { id: 'background-generator', name: '背景生成', desc: '输入文字描述，AI 生成背景', tags: ['生成', '背景'], needsFile: false, resultType: 'image' },
      { id: 'product-photo', name: '产品美图', desc: '专业级产品摄影效果一键生成', tags: ['电商', '产品'], needsFile: false, resultType: 'image' },
      { id: 'id-photo', name: '证件照', desc: '智能裁剪尺寸，自动换背景色', tags: ['证件', '裁剪'], needsFile: true, resultType: 'image' },
      { id: 'ai-face-swap', name: 'AI 换脸', desc: '上传照片，智能无缝换脸', tags: ['人脸', '换脸'], needsFile: true, resultType: 'image' },
      { id: 'ai-beauty', name: 'AI 美颜', desc: '智能磨皮美白，自然不失真', tags: ['美颜', '人脸'], needsFile: true, resultType: 'image' },
      { id: 'avatar-generator', name: '头像生成', desc: '描述人物特征，生成专属头像', tags: ['头像', '生成'], needsFile: false, resultType: 'image' },
      { id: 'ai-illustration', name: 'AI 插画', desc: '描述画面风格，AI 生成专属插画', tags: ['插画', '生成'], needsFile: false, resultType: 'image' },
      { id: 'pixel-art', name: '像素画', desc: '图片像素化，一键生成复古风格', tags: ['像素', '复古'], needsFile: true, resultType: 'image' },
      { id: 'logo-generator', name: 'LOGO 生成', desc: '输入品牌名称，AI 智能生成 LOGO', tags: ['LOGO', '品牌'], needsFile: false, resultType: 'image' },
      { id: 'poster-design', name: '海报设计', desc: '输入主题内容，AI 智能生成海报', tags: ['海报', '设计'], needsFile: false, resultType: 'image' },
    ]
  },
  {
    id: 'audio',
    name: '音频类',
    tools: [
      { id: 'ai-music', name: 'AI 音乐', desc: '描述曲风情绪，生成专属 BGM', tags: ['音乐', '生成'], needsFile: false, resultType: 'audio' },
      { id: 'text-to-voice', name: '文字配音', desc: '输入文字，AI 智能生成配音', tags: ['配音', 'TTS'], needsFile: false, resultType: 'audio' },
    ]
  },
  {
    id: 'drama',
    name: '剧本类',
    tools: [
      { id: 'screenplay', name: '分镜脚本', desc: '输入故事梗概，生成专业分镜脚本', tags: ['分镜', '脚本'], needsFile: false, resultType: 'text' },
      { id: 'role-design', name: '角色设计', desc: '描述人物特征，生成完整角色设定', tags: ['角色', '设定'], needsFile: false, resultType: 'text' },
      { id: 'script-generator', name: '脚本生成', desc: '输入主题大纲，AI 生成完整剧本', tags: ['剧本', '生成'], needsFile: false, resultType: 'text' },
    ]
  },
];

// 扁平化工表（供详情页使用）
const ALL_TOOLS = TOOL_CATEGORIES.flatMap(cat => cat.tools);

// 预设颜色

export const ToolsPage: React.FC = () => {
  const { showToast, addAsset, recommendedConfigs, apiConfigs, imageAPIConfigs, videoAPIConfigs, voiceAPIConfigs, musicAPIConfigs, comfyuiConfigs } = useAppStore();
  
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<{ url: string; type: 'image' | 'video' | 'audio' }[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [saveToPromptModal, setSaveToPromptModal] = useState<{
    isOpen: boolean;
    prompt: string;
    name: string;
    thumbnail?: string;
    sourceType: 'text' | 'image' | 'video';
  }>({
    isOpen: false,
    prompt: '',
    name: '',
    sourceType: 'text',
  });
  
  const [prompt, setPrompt] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  
  // 色彩匹配专用
  
  // 证件照专用
  const [idPhotoSize, setIdPhotoSize] = useState('1-inch');
  const [idPhotoBgColor, setIdPhotoBgColor] = useState('#FFFFFF');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentTool = ALL_TOOLS.find(t => t.id === activeTool);
  
  // 获取所有可用的API配置
  const allConfigs = useMemo(() => {
    const configs: any[] = [];
    const addConfig = (c: any, forcedType?: string) => {
      if (c && c.apiKey && c.baseUrl && !configs.find(ex => ex.id === c.id)) {
        configs.push({ ...c, _apiType: forcedType || c.apiType });
      }
    };
    // chat APIs (dialog) - used for text generation tools
    (apiConfigs || []).forEach((c: any) => addConfig(c, 'openai-chat'));
    // image generation APIs
    (imageAPIConfigs || []).forEach((c: any) => addConfig(c, 'openai-generations'));
    // video APIs
    (videoAPIConfigs || []).forEach((c: any) => addConfig(c, 'openai-completions'));
    // voice APIs (TTS)
    (voiceAPIConfigs || []).forEach((c: any) => addConfig(c, 'openai-voice'));
    // music APIs
    (musicAPIConfigs || []).forEach((c: any) => addConfig(c, 'openai-music'));
    // recommended configs keep their own apiType
    (recommendedConfigs || []).forEach((c: any) => addConfig(c));
    // ComfyUI 工作流配置（用于配音等步骤，通过 serverUrl 判断是否可用）
    (comfyuiConfigs || []).forEach((c: any) => {
      if (c && (c.serverUrl || '').trim() && c?.connected === true && !configs.find(ex => ex.id === c.id)) {
        configs.push({
          ...c,
          _apiType: 'comfyui',
          provider: 'comfyui',
          source: 'comfyui',
          models: (c.workflowFiles || []).map((w: any) => w.name).filter(Boolean),
          defaultModel: c.workflowFiles?.[0]?.name || '',
        });
      }
    });
    return configs;
  }, [recommendedConfigs, apiConfigs, imageAPIConfigs, videoAPIConfigs, voiceAPIConfigs, musicAPIConfigs, comfyuiConfigs]);
  
  // 根据工具类型过滤可用的配置
  const getAvailableConfigs = (toolId: string) => {
    const apiTypeMap: Record<string, string[]> = {
      'style-transfer': ['openai-generations'],
      'style-reference': ['openai-generations'],
      'style-consistent': ['openai-generations'],
      'auto-color': ['openai-generations'],
      'batch-cutout': ['openai-generations'],
      'image-upgrade': ['openai-generations'],
      'photo-restore': ['openai-generations'],
      'watermark-remove': ['openai-generations'],
      'background-generator': ['openai-generations'],
      'product-photo': ['openai-generations'],
      'id-photo': ['openai-generations'],
      'ai-face-swap': ['openai-generations'],
      'ai-beauty': ['openai-generations'],
      'avatar-generator': ['openai-generations'],
      'ai-illustration': ['openai-generations'],
      'pixel-art': ['openai-generations'],
      'logo-generator': ['openai-generations'],
      'poster-design': ['openai-generations'],
      'ai-music': ['openai-music', 'comfyui'],
      'text-to-voice': ['openai-voice', 'edge-tts', 'comfyui'],
      'screenplay': ['openai-chat'],
      'role-design': ['openai-chat'],
      'script-generator': ['openai-chat'],
    };
    
    const types = apiTypeMap[toolId] || ['openai-generations'];
    const configs = allConfigs.filter(c => types.includes(c._apiType || c.apiType || c.type || ''));
    
    // 文字配音工具：Edge TTS 本地配音始终作为默认选项置顶，
    // 同时保留用户自定义的语音 API 与 ComfyUI 工作流配置。
    if (toolId === 'text-to-voice') {
      const hasEdgeDefault = configs.find(c => c.id === 'edge-tts-default');
      if (!hasEdgeDefault) {
        configs.unshift({
          id: 'edge-tts-default',
          name: 'Edge TTS 本地配音（默认）',
          provider: 'edge-tts',
          baseUrl: 'edge-tts://local',
          apiKey: '',
          models: EDGE_TTS_MODELS,
          defaultModel: EDGE_TTS_MODELS[0],
          _apiType: 'edge-tts',
        });
      }
    }
    
    return configs;
  };
  
  const availableConfigs = activeTool ? getAvailableConfigs(activeTool) : [];
  const selectedConfig = availableConfigs.find(c => c.id === selectedConfigId);
  const effectiveModel = selectedModel || selectedConfig?.defaultModel || selectedConfig?.models?.[0] || '';
  const selectedConfigForCall = selectedConfig ? { ...selectedConfig, defaultModel: effectiveModel } : selectedConfig;
  
  // 文件上传处理
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    setUploadedFiles(prev => [...prev, ...files]);
    
    files.forEach(file => {
      const mediaType = mediaTypeFromMime(file.type);
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          setFilePreviews(prev => [...prev, dataUrl]);
          autoSaveMediaToAssets({ name: file.name, type: 'image', path: dataUrl, size: file.size, sourceType: 'tools' });
        };
        reader.readAsDataURL(file);
      } else if (mediaType) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          autoSaveMediaToAssets({ name: file.name, type: mediaType, path: ev.target?.result as string, size: file.size, sourceType: 'tools' });
        };
        reader.readAsDataURL(file);
      }
    });
  };
  
  // 移除文件
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setFilePreviews(prev => prev.filter((_, i) => i !== index));
  };
  
  // 生成处理（真实API调用）
  const handleGenerate = async () => {
    if (!activeTool) return;
    
    const tool = ALL_TOOLS.find(t => t.id === activeTool);
    if (tool?.needsFile && uploadedFiles.length === 0) {
      showToast?.('请先上传文件', 'error');
      return;
    }
    
    if (!selectedConfigId) {
      showToast?.('请先选择API配置', 'error');
      return;
    }
    
    setIsGenerating(true);
    
    try {
      let results: { url: string; type: 'image' | 'video' | 'audio' }[] = [];
      
      // 根据工具类型调用不同的API
      switch (activeTool) {
        case 'style-transfer':
        case 'style-reference':
        case 'style-consistent':
        case 'auto-color':
        case 'batch-cutout':
        case 'image-upgrade':
        case 'photo-restore':
        case 'watermark-remove':
        case 'background-generator':
        case 'product-photo':
        case 'id-photo':
        case 'ai-face-swap':
        case 'ai-beauty':
        case 'avatar-generator':
        case 'ai-illustration':
        case 'pixel-art':
        case 'logo-generator':
        case 'poster-design': {
          // 图像生成类工具
          const toolDef: any = Object.values(TOOL_CATEGORIES).flatMap((cat: any) => cat.tools).find((t: any) => t.id === activeTool);
          const promptPrefix = toolDef?.promptPrefix || '';
          const fullPrompt = promptPrefix ? (promptPrefix + ' ' + prompt.trim()) : (prompt || `生成${tool?.name || '图片'}`);
          if (!tool?.needsFile) {
            // 文生图
            const result = await toolService.generateImage(
              fullPrompt,
              selectedConfigForCall,
              { aspectRatio: '1:1', model: effectiveModel }
            );
            results = [result];
          } else {
            // 图生图（需要上传图片）
            for (const file of uploadedFiles) {
              try {
                const result = await toolService.generateImageToImage(
                  file,
                  fullPrompt,
                  selectedConfigForCall
                );
                results.push(result);
              } catch (error: any) {
                showToast?.(`处理第${results.length + 1}张图片失败：${error.message}`, 'error');
              }
            }
          }
          break;
        }
          
        case 'ai-music': {
          // 音乐生成（通过视频/音频API fallback）
          const result = await toolService.generateVideo(
            prompt || '生成背景音乐，柔和舒缓，适合短视频',
            selectedConfigForCall,
            { duration: 30 }
          );
          results = [result];
          break;
        }
          
        case 'text-to-voice': {
          // 配音：优先使用用户配置的语音API，否则使用 Edge TTS
          const voiceConfig = selectedConfigForCall || availableConfigs[0];
          const isEdgeTTS = voiceConfig?.provider === 'edge-tts' || voiceConfig?.baseUrl?.startsWith('edge-tts://');
          const result = await toolService.generateVoice(
            prompt || '这是一个测试配音',
            voiceConfig,
            { voice: isEdgeTTS ? (voiceConfig.defaultModel || 'zh-CN-XiaoxiaoNeural') : 'alloy' }
          );
          results = [result];
          break;
        }
          
        case 'screenplay':
        case 'role-design':
        case 'script-generator': {
          // 文本生成类
          const textToolDef: any = Object.values(TOOL_CATEGORIES).flatMap((cat: any) => cat.tools).find((t: any) => t.id === activeTool);
          const textPrefix = textToolDef?.promptPrefix || '';
          const textPrompt = textPrefix ? (textPrefix + ' ' + prompt.trim()) : (prompt || `生成${tool?.name || '文本'}`);
          const result = await toolService.generateText(
            textPrompt,
            selectedConfigForCall
          );
          // 文本结果特殊处理：保存到资产库
          addAsset({
            name: `${tool?.name || '工具'}_生成结果`,
            type: 'document',
            path: `data:text/plain;base64,${btoa(unescape(encodeURIComponent(result.content)))}`,
            size: 0,
            sourceType: 'tools',
          });
          showToast?.('文本生成完成，已保存到资产库', 'success');
          setIsGenerating(false);
          return;
        }
          
        default:
          throw new Error('未知的工具类型');
      }
      
      setResults(results);
      
      // 保存到资产库
      results.forEach(result => {
        addAsset({
          name: `${tool?.name || '工具'}_生成结果`,
          type: result.type,
          path: result.url,
          size: 0,
          sourceType: 'tools',
        });
      });
      
      showToast?.('生成成功！', 'success');
    } catch (error: any) {
      showToast?.(`生成失败：${error.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };
  
  // 下载结果
  const handleDownload = (url: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `result_${Date.now()}.png`;
    a.click();
    showToast?.('已开始下载', 'success');
  };
  
  // 返回工具列表
  const handleBack = () => {
    setActiveTool(null);
    setResults([]);
    setUploadedFiles([]);
    setFilePreviews([]);
    setPrompt('');
    setSelectedConfigId('');
    setSelectedModel('');
  };
  
  // 工具列表视图
  if (!activeTool) {
    return (
      <div className="tools-page">
        <div className="tools-header">
          <h2>工具箱</h2>
          <p>34+ 专业 AI 工具，助力创作效率提升</p>
        </div>
        <div className="tools-categories">
          {TOOL_CATEGORIES.map(category => (
            <div key={category.id} className="tool-category">
              <h3 className="category-title">{category.name}</h3>
              <div className="tools-grid">
                {category.tools.map(tool => (
                  <div
                    key={tool.id}
                    className="tool-card"
                    onClick={() => setActiveTool(tool.id)}
                  >
                    <div className="tool-card-icon">{React.createElement(ToolIcons[tool.id], { className: 'tool-icon' })}</div>
                    <h4>{tool.name}</h4>
                    <p>{tool.desc}</p>
                    <div className="tool-card-tags">
                      {tool.tags.map((tag: string) => (
                        <span key={tag} className="tool-tag">{tag}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  // 工具详情视图
  return (
    <div className="tools-page tool-detail">
      <div className="tool-detail-header">
        <button className="back-btn" onClick={handleBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          返回
        </button>
        <span className="tool-detail-icon">{currentTool && React.createElement(ToolIcons[currentTool.id], { className: 'tool-detail-icon-svg' })}</span>
        <h2>{currentTool?.name}</h2>
      </div>
      
      <div className="tool-content">
        {/* 左侧控制面板 */}
        <div className="tool-panel">
          
          {/* API配置选择 */}
          <div className="panel-section">
            <h4>选择API配置</h4>
            {availableConfigs.length === 0 ? (
              <div className="config-warning">
                <AlertTriangleIcon size={16} />
                暂无可用配置，请先到设置页配置API
              </div>
            ) : (
              <div className="select-wrapper">
                <select
                  value={selectedConfigId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setSelectedConfigId(nextId);
                    const nextConfig = availableConfigs.find(c => c.id === nextId);
                    setSelectedModel(nextConfig?.defaultModel || nextConfig?.models?.[0] || '');
                  }}
                >
                  <option value="">请选择API配置</option>
                  {availableConfigs.map(config => (
                    <option key={config.id} value={config.id}>
                      {config.name} ({config.apiType || config.type || 'custom'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedConfig && (
              <div className="config-info">
                <small>已选择：{selectedConfig.name}</small><br />
                <small>模型：{effectiveModel || '未设置模型'}</small>
                {selectedConfig.models && selectedConfig.models.length > 0 && (
                  <select className="model-select" value={effectiveModel} onChange={e => setSelectedModel(e.target.value)}>
                    {selectedConfig.models.map((m: string) => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
          
          {/* 文件上传（通用） */}
          {currentTool?.needsFile && (
            <div className="panel-section">
              <h4>上传文件</h4>
              <div
                className="file-upload-area"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files);
                  if (files.length > 0) {
                    files.forEach(file => {
                      setUploadedFiles(prev => [...prev, file]);
                      const mediaType = mediaTypeFromMime(file.type);
                      if (file.type.startsWith('image/')) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const dataUrl = ev.target?.result as string;
                          setFilePreviews(prev => [...prev, dataUrl]);
                          autoSaveMediaToAssets({ name: file.name, type: 'image', path: dataUrl, size: file.size, sourceType: 'tools' });
                        };
                        reader.readAsDataURL(file);
                      } else if (mediaType) {
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          autoSaveMediaToAssets({ name: file.name, type: mediaType, path: ev.target?.result as string, size: file.size, sourceType: 'tools' });
                        };
                        reader.readAsDataURL(file);
                      }
                    });
                  }
                }}
              >
                <div className="file-upload-icon">{React.createElement(ToolIcons['upload'], { className: 'upload-icon' })}</div>
                <div className="file-upload-text">点击或拖拽上传</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {filePreviews.length > 0 && (
                <div className="batch-files-list">
                  {filePreviews.map((preview, i) => (
                    <div key={i} className="batch-file-item">
                      <img src={preview} alt="" />
                      <span className="batch-file-name">{uploadedFiles[i]?.name}</span>
                      <button className="batch-file-remove" onClick={() => removeFile(i)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* 证件照专用面板 */}
          {activeTool === 'id-photo' && (
            <>
              <div className="panel-section">
                <h4>尺寸选择</h4>
                <div className="select-wrapper">
                  <select
                    value={idPhotoSize}
                    onChange={(e) => setIdPhotoSize(e.target.value)}
                  >
                    <option value="1-inch">1 寸 (25×35mm)</option>
                    <option value="2-inch">2 寸 (35×49mm)</option>
                    <option value="small-2-inch">小 2 寸 (35×45mm)</option>
                    <option value="5-inch">5 寸 (89×127mm)</option>
                  </select>
                </div>
              </div>
              <div className="panel-section">
                <h4>背景颜色</h4>
                <div className="color-picker-container">
                  <div className="color-picker-item">
                    <label>背景色</label>
                    <input
                      type="color"
                      value={idPhotoBgColor}
                      onChange={(e) => setIdPhotoBgColor(e.target.value)}
                      className="color-picker-input"
                    />
                  </div>
                </div>
                <div className="color-presets">
                  {['#FFFFFF', '#438EDB', '#E60012', '#8B0000', '#000000'].map(color => (
                    <div
                      key={color}
                      className="color-preset"
                      style={{ backgroundColor: color, border: '2px solid #ccc' }}
                      onClick={() => setIdPhotoBgColor(color)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
          
          {/* 描述输入（通用文本生成类工具） */}
          {!currentTool?.needsFile && (
            <div className="panel-section">
              <h4>描述</h4>
              <div className="input-wrapper">
                <textarea
                  placeholder="请描述您想要的效果..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                />
              </div>
            </div>
          )}
          
          {/* 生成按钮 */}
          <button
            className={`generate-btn ${isGenerating ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={isGenerating || availableConfigs.length === 0}
          >
            {isGenerating ? (
              <>
                <svg className="spinner-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round" />
                </svg>
                生成中...
              </>
            ) : (
              '开始生成'
            )}
          </button>
        </div>
        
        {/* 右侧预览区域 */}
        <div className="tool-preview">
          {results.length === 0 ? (
            <div className="preview-empty">
              <div className="preview-empty-icon">{currentTool && React.createElement(ToolIcons[currentTool.id], { className: 'preview-icon-svg' })}</div>
              <div className="preview-empty-text">
                完成设置后点击"开始生成"<br />
                结果将显示在这里
              </div>
            </div>
          ) : (
            <div className="results-grid">
              {results.map((result, i) => (
                <div key={i} className="result-item">
                  {result.type === 'video' ? (
                    <video src={result.url} controls className="result-media" data-media-url={result.url} data-media-type="video" data-prompt={prompt} data-name={`${currentTool?.name || '工具'} 生成结果`} data-source-type="tools" />
                  ) : result.type === 'audio' ? (
                    <audio src={result.url} controls className="result-media" data-media-url={result.url} data-media-type="audio" data-prompt={prompt} data-name={`${currentTool?.name || '工具'} 生成结果`} data-source-type="tools" />
                  ) : (
                    <img src={result.url} alt={`结果 ${i + 1}`} className="result-media" data-media-url={result.url} data-media-type="image" data-prompt={prompt} data-name={`${currentTool?.name || '工具'} 生成结果`} data-source-type="tools" />
                  )}
                  <div className="result-info">
                    <div className="result-actions">
                      <button className="result-action-btn" onClick={() => handleDownload(result.url)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                        </svg>
                        下载
                      </button>
                      <button className="result-action-btn" onClick={() => {
                        const sourceType = result.type === 'video' ? 'video' : result.type === 'audio' ? 'text' : 'image';
                        setSaveToPromptModal({
                          isOpen: true,
                          prompt: prompt,
                          name: (currentTool?.name || '工具') + ' 提示词',
                          thumbnail: result.url,
                          sourceType,
                        });
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                        </svg>
                        存入提示词库
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 存入提示词库弹窗 */}
      <SaveToPromptLibraryModal
        isOpen={saveToPromptModal.isOpen}
        onClose={() => setSaveToPromptModal(prev => ({ ...prev, isOpen: false }))}
        defaultPrompt={saveToPromptModal.prompt}
        defaultName={saveToPromptModal.name}
        thumbnail={saveToPromptModal.thumbnail}
        sourceType={saveToPromptModal.sourceType}
      />
    </div>
  );
};
