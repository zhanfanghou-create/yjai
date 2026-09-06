import React, { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react';
import { normalizeFileSrc } from '../utils/pathUtils';
import { SafeMarkdown } from './SafeMarkdown';
import { useAppStore, IMAGE_ASPECT_RATIOS, VIDEO_ASPECT_RATIOS, VIDEO_RESOLUTIONS, getCallableRecommendedConfigs } from '../store/appStore';
import type { APIProvider } from '../store/appStore';
import logoUrl from '/logo.png';
import { ContextMenu, ContextMenuItem } from './ContextMenu';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  EditIcon,
  FileIcon,
  PaperclipIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SendIcon,
  TrashIcon,
  UserIcon,
} from './Icons';
import './HomePage.css';

// 消息类型定义
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  type?: string;
  files?: string[];
  timestamp?: Date | string | number;
  meta?: { generating?: boolean; jobId?: string; mediaType?: 'image' | 'video' | 'audio' };
}

// 独立的消息气泡组件 - 使用 memo 优化渲染性能
interface MessageBubbleProps {
  message: Message;
  isUser: boolean;
  editingMessageId: string | null;
  editingContent: string;
  onStartEdit: (message: Message) => void;
  onCopy: (message: Message) => void;
  onDelete: (messageId: string) => void;
  onRegenerate: (message: Message) => void;
  onQuote: (message: Message) => void;
  onEditSubmit: (messageId: string) => void;
  onEditCancel: () => void;
  onEditChange: (content: string) => void;
  onMediaPreview: (src: string, type: 'image' | 'video') => void;
  onContextMenu: (e: React.MouseEvent, type: 'message' | 'file', data: any) => void;
  formatTime: (date: Date | string | number) => string;
}

const MessageBubble = memo<MessageBubbleProps>(({
  message,
  isUser,
  editingMessageId,
  editingContent,
  onStartEdit,
  onCopy,
  onDelete,
  onRegenerate,
  onQuote,
  onEditSubmit,
  onEditCancel,
  onEditChange,
  onMediaPreview,
  onContextMenu,
  formatTime,
}) => {
  const isEditing = editingMessageId === message.id;
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      editTextareaRef.current?.focus();
    }
  }, [isEditing]);

  return (
    <div
      className={`message-bubble ${message.role}`}
      onContextMenu={(e) => onContextMenu(e, 'message', message)}
    >
      <div className="message-avatar">
        {message.role === 'user' ? (
          <UserIcon size={18} />
        ) : (
          <img src={logoUrl} alt="艺镜AI" className="ai-avatar-logo" />
        )}
      </div>
      <div className="message-content-wrapper">
        <div className="message-role">
          {message.role === 'user' ? '你' : '艺镜AI'}
          <span className="message-time">{formatTime(message.timestamp || new Date())}</span>
        </div>

        {isUser ? (
          <div className="user-message-wrapper">
            {isEditing ? (
              <div className="message-edit-area">
                <textarea
                  ref={editTextareaRef}
                  value={editingContent}
                  onChange={(e) => onEditChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      onEditSubmit(message.id);
                    }
                    if (e.key === 'Escape') {
                      onEditCancel();
                    }
                  }}
                  className="edit-textarea"
                  autoFocus
                />
                <div className="edit-actions">
                  <button className="edit-btn cancel" onClick={onEditCancel}>取消</button>
                  <button className="edit-btn confirm" onClick={() => onEditSubmit(message.id)}>发送</button>
                </div>
              </div>
            ) : (
              <div className="user-message-content">
                <div
                  className="message-content"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target instanceof HTMLImageElement && target.src) {
                      onMediaPreview(target.src, 'image');
                    }
                  }}
                >
                  <SafeMarkdown content={String(message.content || '')} />
                </div>
                <div className="message-hover-actions">
                  <button
                    className="hover-action-btn edit"
                    onClick={() => onStartEdit(message)}
                    title="编辑"
                  >
                    <EditIcon size={14} />
                  </button>
                  <button
                    className="hover-action-btn copy"
                    onClick={() => onCopy(message)}
                    title="复制"
                  >
                    <CopyIcon size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="assistant-message-wrapper">
            {message.meta?.generating ? (
              <div className="message-content generating">
                <span className="dot-flashing"></span>
                <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                  正在生成中...
                </span>
              </div>
            ) : (
              <>
                <div
                  className="message-content"
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target instanceof HTMLImageElement && target.src) {
                      onMediaPreview(target.src, 'image');
                    }
                  }}
                >
                  <SafeMarkdown content={String(message.content || '')} />

                  {message.files && message.files.length > 0 && (
                    <div className="message-files">
                      {message.files.map((file, idx) => {
                        const src = normalizeFileSrc(file);
                        const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(String(file));
                        const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(String(file));
                        return (
                          <div
                            key={idx}
                            className="message-file-preview"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isAudio) onMediaPreview(src, isVideo ? 'video' : 'image');
                            }}
                            style={{ cursor: isAudio ? 'default' : 'pointer' }}
                            onContextMenu={(e) =>
                              onContextMenu(e, 'file', {
                                fileUrl: file,
                                fileName: `文件_${idx + 1}`,
                                fileType: isVideo ? 'video' : (isAudio ? 'audio' : 'file'),
                              })
                            }
                          >
                            {isVideo ? (
                              <video src={src} controls preload="metadata" style={{ maxWidth: '100%' }} onClick={(e) => e.stopPropagation()} />
                            ) : isAudio ? (
                              <audio src={src} controls style={{ width: '100%' }} onClick={(e) => e.stopPropagation()} />
                            ) : (
                              <img src={src} alt="附件" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="assistant-message-actions">
                  <button className="assistant-action-btn" onClick={() => onCopy(message)} title="复制">
                    <CopyIcon size={14} />
                    <span>复制</span>
                  </button>
                  <button className="assistant-action-btn" onClick={() => onRegenerate(message)} title="重新生成">
                    <RefreshIcon size={14} />
                    <span>重新生成</span>
                  </button>
                  <button className="assistant-action-btn" onClick={() => onQuote(message)} title="引用">
                    <ClipboardIcon size={14} />
                    <span>引用</span>
                  </button>
                  <button className="assistant-action-btn delete" onClick={() => onDelete(message.id)} title="删除">
                    <TrashIcon size={14} />
                    <span>删除</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较函数：只在必要时重新渲染
  if (prevProps.message.id !== nextProps.message.id) return false;
  if (prevProps.message.content !== nextProps.message.content) return false;
  if (prevProps.message.meta?.generating !== nextProps.message.meta?.generating) return false;
  if (prevProps.editingMessageId === nextProps.message.id || nextProps.editingMessageId === nextProps.message.id) {
    // 如果这条消息正在编辑或停止编辑，需要重新渲染
    if (prevProps.editingMessageId !== nextProps.editingMessageId) return false;
  }
  if (prevProps.editingContent !== nextProps.editingContent && nextProps.editingMessageId === nextProps.message.id) {
    return false;
  }
  return true;
});

MessageBubble.displayName = 'MessageBubble';

const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
  const modelSet = new Set<string>();
  [...(models || []), defaultModel].forEach(model => {
    const value = String(model || '').trim();
    if (value && value !== 'undefined') modelSet.add(value);
  });
  return Array.from(modelSet);
};

const hasSavedCallableApiConfig = (config: {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string[];
  defaultModel?: string;
  enabled?: boolean;
}) => (
  config.enabled !== false &&
  Boolean(String(config.name || '').trim()) &&
  Boolean(String(config.baseUrl || '').trim()) &&
  Boolean(String(config.apiKey || '').trim()) &&
  (normalizeSavedModels(config.models, config.defaultModel).length > 0 || Boolean(String(config.defaultModel || '').trim()))
);

const getSelectedSavedModel = (config: any, selectedModel?: string) => {
  const models = normalizeSavedModels(config?.models, config?.defaultModel);
  const selected = String(selectedModel || '').trim();
  if (selected && models.includes(selected)) return selected;
  return models[0] || '';
};

const getRequestProvider = (config: any, fallback: APIProvider): APIProvider => {
  const supportedProviders: APIProvider[] = ['comfyui', 'openai', 'grsai', 'siliconflow', 'zhipu', 'custom'];
  if (config?._source === 'recommended' && supportedProviders.includes(config.provider)) {
    return config.provider;
  }
  if (config?._source === 'chat' || config?._source === 'image' || config?._source === 'video') {
    return 'grsai';
  }
  return supportedProviders.includes(fallback) ? fallback : 'custom';
};

export const HomePage: React.FC = () => {
  const {
    chatSessions,
    activeSessionId,
    createChatSession,
    deleteChatSession,
    setActiveSession,
    addMessage,
    updateMessage,
    deleteMessage,
    isGenerating,
    setGenerating,
    defaultProvider,
    defaultModel,
    apiConfigs,
    imageAPIConfigs,
    videoAPIConfigs,
    comfyuiConfigs,
    recommendedConfigs,
    generationParams,
    setGenerationParams,
    updateChatSession,
    addAsset,
    selectedModel: selectedModelStore,
    setSelectedModel: setStoreSelectedModel,
    setMediaPreview,
  } = useAppStore();

  const [inputText, setInputText] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [sessionsPanelCollapsed, setSessionsPanelCollapsed] = useState(false);
  const [confirmEndId, setConfirmEndId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
  } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // 媒体预览 - 已提升至 App 层(全局 store)

  // 生成参数控制
  const [selectedConfigId, setSelectedConfigId] = useState<string>(generationParams?.selectedConfigId || '');
  const [selectedModel, setSelectedModel] = useState<string>(selectedModelStore || '');
  const [aspectRatio, setAspectRatio] = useState<string>('');
  const [imageSize, setImageSize] = useState<string>('');
  const [resolution, setResolution] = useState<string>('');
  const [duration, setDuration] = useState<string>('');

  const activeSession = chatSessions.find(s => s.id === activeSessionId);

  // 判断当前是否应该显示对话界面(有激活的会话 或 刚刚发送了消息)
  const showChatInterface = !!activeSessionId;

  // 获取当前选中的配置(只使用设置页已保存完整的接口和模型)
  const allAvailableConfigs = useMemo(() => [
    ...getCallableRecommendedConfigs(recommendedConfigs)
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'recommended' as const,
      })),
    ...apiConfigs
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        apiType: 'openai-chat' as const,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'chat' as const,
      })),
    ...imageAPIConfigs
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        apiType: 'openai-generations' as const,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'image' as const,
      })),
    ...videoAPIConfigs
      .filter(config => hasSavedCallableApiConfig(config))
      .map(config => ({
        ...config,
        apiType: 'openai-completions' as const,
        models: normalizeSavedModels(config.models, config.defaultModel),
        _source: 'video' as const,
      })),
    // ComfyUI 工作流作为对话/创作生成源：默认选中「对话」分类预设工作流
    ...(comfyuiConfigs || [])
      .filter((c: any) => c?.serverUrl && Array.isArray(c.workflowFiles) && c.workflowFiles.length)
      .map((c: any) => {
        const wfs = (c.workflowFiles || []).map((w: any) => w.name || w);
        const pre = c?.categoryPresets?.chat;
        const defM = wfs.find((m: string) => m === pre) || wfs[0] || c.name || 'ComfyUI';
        return ({
          ...c,
          apiType: 'openai-chat' as const,
          models: (wfs.length ? wfs : [defM]),
          defaultModel: defM,
          _source: 'comfyui' as const,
        });
      }),
  ], [recommendedConfigs, apiConfigs, imageAPIConfigs, videoAPIConfigs, comfyuiConfigs]);

  const selectedConfig = allAvailableConfigs.find(c => c.id === selectedConfigId);

  // 判断当前模型是否为图片/视频模型:优先参考所选配置的 apiType,其次根据模型名称作简单推断
  const isImageModel = Boolean(
    (selectedConfig && selectedConfig.apiType === 'openai-generations') ||
    (selectedModel && /image|dall|gpt-image|sd-|stable|img|draw|render/i.test(selectedModel))
  );

  const isVideoModel = Boolean(
    (selectedConfig && selectedConfig.apiType === 'openai-completions') ||
    (selectedModel && /video|mp4|webm|gen-2|render-video|movie/i.test(selectedModel))
  );

  const activeMessageCount = activeSession?.messages.length || 0;

  // 自动滚动到底部:使用防抖优化,避免频繁滚动导致卡顿
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!showChatInterface) return;

    // 清除之前的定时器
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // 延迟执行滚动,避免频繁触发
    scrollTimeoutRef.current = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
    }, 50);

    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [activeMessageCount, isGenerating, showChatInterface]);

  // 当保存的配置列表变化时,默认选择第一个可调用配置,且清理已失效的旧选择
  useEffect(() => {
    if (allAvailableConfigs.length === 0) {
      if (selectedConfigId || selectedModel) {
        setSelectedConfigId('');
        setSelectedModel('');
        setStoreSelectedModel('');
        setGenerationParams({ selectedConfigId: '', selectedModel: '' });
      }
      return;
    }

    if (!selectedConfigId || !allAvailableConfigs.some(config => config.id === selectedConfigId)) {
      const nextConfigId = allAvailableConfigs[0].id;
      setSelectedConfigId(nextConfigId);
      setGenerationParams({ selectedConfigId: nextConfigId });
    }
  }, [allAvailableConfigs, selectedConfigId, selectedModel, setGenerationParams, setStoreSelectedModel]);

  // 当选择配置改变时,默认选中该配置保存的第一个模型,并重置生成参数
  useEffect(() => {
    if (!selectedConfig) return;

    const nextModel = getSelectedSavedModel(selectedConfig, selectedModel);
    if (nextModel !== selectedModel) {
      setSelectedModel(nextModel);
      setStoreSelectedModel(nextModel);
      setGenerationParams({ selectedModel: nextModel });
    }

    setAspectRatio('');
    setImageSize('');
    setResolution('');
    setDuration('');
  }, [selectedConfigId]);

  // 构建生成参数字符串
  const buildGenerationParamsText = () => {
    const params: string[] = [];

    if (aspectRatio) {
      params.push(`--aspectRatio ${aspectRatio}`);
    }

    if (isImageModel && imageSize) {
      params.push(`--imageSize ${imageSize}`);
    }

    if (isVideoModel && resolution) {
      params.push(`--resolution ${resolution}`);
    }

    if (isVideoModel && duration) {
      params.push(`--duration ${duration}`);
    }

    return params.join(' ');
  };

  // 复制消息内容或附件路径(可用于按钮)- 使用 useCallback 缓存
  const handleCopy = useCallback(async (message: any) => {
    try {
      if (message.files && message.files.length > 0) {
        await navigator.clipboard.writeText(message.files.join('\n'));
      } else if (message.content) {
        await navigator.clipboard.writeText(message.content);
      }
      setCopyToast('已复制到剪贴板');
      setTimeout(() => setCopyToast(null), 1500);
    } catch (e) {
      console.warn('copy failed', e);
    }
  }, []);

  // 使用工具函数规范化本地文件路径为浏览器可识别的 URL(见 src/renderer/utils/pathUtils.ts)

  // 发送消息 - 从首页发送后自动切换到对话界面
  const handleSend = async () => {
    if (!inputText.trim() && attachedFiles.length === 0) return;

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createChatSession();
      setActiveSession(sessionId); // 自动切换到对话界面
    }

    // 构建完整的消息内容(包含生成参数)
    let fullContent = inputText;
    const paramsText = buildGenerationParamsText();
    if (paramsText) {
      fullContent = `${inputText} ${paramsText}`;
    }

    const requestConfig = selectedConfig;
    const requestModel = getSelectedSavedModel(requestConfig, selectedModel);
    const requestProvider = getRequestProvider(requestConfig, defaultProvider as APIProvider);

    // 添加用户消息
    addMessage(sessionId, {
      role: 'user',
      content: fullContent,
      type: 'text',
      files: attachedFiles.length > 0 ? await Promise.all(attachedFiles.map(f => saveFileTemporarily(f))) : undefined,
      model: requestModel,
      provider: requestProvider,
    });

    // 自动生成会话标题(取前20个字符)
    const session = chatSessions.find(s => s.id === sessionId);
    if (session && !session.title) {
      updateChatSession(sessionId, { title: inputText.slice(0, 20) + (inputText.length > 20 ? '...' : '') });
    }

    setInputText('');
    setAttachedFiles([]);
    setGenerating(true);

    try {
      // 根据当前选择的配置类型调用真实 API
      const win = window as any;
      let response = '';

      // 只允许调用设置页中已保存完整的接口和模型
      const currentConfig = requestConfig;
      const currentModel = requestModel;

      if (!currentConfig) {
        response = '请先在"调用设置"页保存可用的接口配置后再发送。';
      } else if (!currentModel) {
        response = '请先在"调用设置"页为当前接口保存至少一个模型后再发送。';
      } else if (win?.yijingAPI) {
        const configApiType = currentConfig.apiType;
        const isGrsai = configApiType === 'openai-chat' || configApiType === 'openai-generations' || configApiType === 'openai-completions';

        if (isGrsai && win.yijingAPI.grsai) {
          // Grsai 专用通道
          if (configApiType === 'openai-chat') {
            // 对话接口
            const result = await win.yijingAPI.grsai.chat({
              baseUrl: currentConfig.baseUrl,
              apiKey: currentConfig.apiKey,
              model: currentModel,
              messages: [{ role: 'user', content: inputText }],
            });
            if (result.ok && result.data) {
              if (result.data.choices && result.data.choices[0]) {
                response = result.data.choices[0].message?.content || JSON.stringify(result.data);
              } else if (result.data.error) {
                const errMsg = result.data.error.message || JSON.stringify(result.data.error);
                // 针对 “No available channel” 这类错误加友好提示
                if (/no available channel/i.test(errMsg)) {
                  response = `API 错误：${errMsg}\n\n💡 提示：当前接口没有 “${currentModel}” 这个模型，请到“设置 → 调用设置”里换一个已有可用的模型，或联系接口提供商确认该模型是否在你的账户中。`;
                } else {
                  response = `API 错误：${errMsg}`;
                }
              } else {
                response = JSON.stringify(result.data);
              }
            } else {
              // 网络异常或非预期返回：result.error 为主进程捕获的真实错误信息
              const errMsg = result?.data?.error?.message
                || (typeof result?.data?.error === 'string' ? result.data.error : '')
                || result?.error
                || (result?.data ? JSON.stringify(result.data) : '')
                || '未知错误';
              const statusPart = result?.status ? `（状态码：${result.status}）` : '';
              response = `请求失败${statusPart}：${errMsg}`;
            }
          } else {
            // 图片/视频生成接口
            const genResult = await win.yijingAPI.grsai.generate({
              baseUrl: currentConfig.baseUrl,
              apiKey: currentConfig.apiKey,
              model: currentModel,
              prompt: inputText,
              aspectRatio: aspectRatio || undefined,
              aspect_ratio: aspectRatio || undefined,
              imageSize: isImageModel ? (imageSize || undefined) : undefined,
              resolution: isVideoModel ? (resolution || undefined) : undefined,
              duration: isVideoModel && duration ? Number(duration) : undefined,
              apiType: configApiType,
            });
            // 支持异步 accepted 模式:若 API 返回 accepted (有 job id),则显示"正在生成中"并提醒用户耐心等待
            if (genResult && genResult.accepted && genResult.id) {
              // 创建带 meta.jobId 的助手消息,稍后主进程推送完成时会更新该消息
              addMessage(sessionId, {
                role: 'assistant',
                content: '',
                type: 'text',
                  model: currentModel,
                  provider: requestProvider,
                meta: { jobId: genResult.id, generating: true, mediaType: isVideoModel ? 'video' : 'image' },
              });
              response = null as any; // 占位消息已创建
            } else if (genResult && genResult.ok && genResult.data) {
              // 如果主进程已经把生成结果下载并返回了本地路径(filePaths),把它们作为消息文件插入
              if (genResult.filePaths && Array.isArray(genResult.filePaths) && genResult.filePaths.length > 0) {
                const isVideoFile = /\.(mp4|webm|ogg|mov)$/i.test(String(genResult.filePaths[0] || ''));
                addMessage(sessionId, {
                  role: 'assistant',
                  content: '',
                  type: (isVideoModel || isVideoFile) ? 'video' : 'image',
                  model: currentModel,
                  provider: requestProvider,
                  files: genResult.filePaths,
                });
                response = null as any;
              } else {
                // 从多种返回结构中提取媒体 URL,直接渲染为图片/视频而非纯文本
                const pickMediaUrl = (r: any): string | undefined => {
                  if (!r) return undefined;
                  if (typeof r === 'string') return /^https?:\/\//i.test(r) ? r : undefined;
                  if (typeof r.url === 'string') return r.url;
                  if (typeof r.uri === 'string') return r.uri;
                  if (typeof r.image_url === 'string') return r.image_url;
                  if (typeof r.video_url === 'string') return r.video_url;
                  if (r.b64_json) return `data:image/png;base64,${r.b64_json}`;
                  return undefined;
                };
                const mediaUrls: string[] = [];
                if (Array.isArray(genResult.data.data)) genResult.data.data.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
                if (mediaUrls.length === 0 && Array.isArray(genResult.data.images)) genResult.data.images.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
                if (mediaUrls.length === 0 && Array.isArray(genResult.data.results)) genResult.data.results.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
                if (mediaUrls.length === 0) { const u = pickMediaUrl(genResult.data); if (u) mediaUrls.push(u); }

                if (mediaUrls.length > 0) {
                  const isVideoUrl = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(String(mediaUrls[0] || ''));
                  addMessage(sessionId, {
                    role: 'assistant',
                    content: '',
                    type: (isVideoModel || isVideoUrl) ? 'video' : 'image',
                    model: currentModel,
                    provider: requestProvider,
                    files: mediaUrls,
                  });
                  response = null as any;
                } else if (genResult.data.error) {
                  response = `生成错误:${genResult.data.error.message || JSON.stringify(genResult.data.error)}`;
                } else {
                  response = JSON.stringify(genResult.data);
                }
              }
            } else if (genResult && genResult.status) {
              // 服务器返回但未包含 data 的情况
              response = `生成请求已发出(HTTP ${genResult.status}),请在任务完成后查看结果。`;
            } else {
              response = `生成请求失败:${genResult?.error || '未知错误'}`;
            }
          }
        } else if (win.yijingAPI.openai) {
          // 通用 OpenAI 兼容通道(DeepSeek、OpenAI 等)
          const oaiResult = await win.yijingAPI.openai.chat({
            baseUrl: currentConfig.baseUrl,
            apiKey: currentConfig.apiKey,
            model: currentModel,
            messages: [{ role: 'user', content: inputText }],
          });
          if (oaiResult.ok && oaiResult.data) {
            if (oaiResult.data.choices && oaiResult.data.choices[0]) {
              response = oaiResult.data.choices[0].message?.content || JSON.stringify(oaiResult.data);
            } else if (oaiResult.data.error) {
              const errMsg = oaiResult.data.error.message || JSON.stringify(oaiResult.data.error);
              if (/no available channel/i.test(errMsg)) {
                response = `API 错误：${errMsg}\n\n💡 提示：当前接口没有 “${currentModel}” 这个模型，请到“设置 → 调用设置”里换一个已有可用的模型。`;
              } else {
                response = `API 错误：${errMsg}`;
              }
            } else {
              response = JSON.stringify(oaiResult.data);
            }
          } else {
            response = `请求失败：${oaiResult.error || '未知错误'}`;
          }
        }
      } else {
        response = '当前运行环境无法调用 API,请在桌面客户端中重试。';
      }

      // 添加助手消息(只有 response 有内容时才添加;其它情况已在分支中直接创建消息)
      if (response !== null && response !== undefined) {
        addMessage(sessionId, {
          role: 'assistant',
          content: response,
          type: 'text',
          model: currentModel,
          provider: requestProvider,
        });
      }

    } catch (error) {
      addMessage(sessionId, {
        role: 'assistant',
        content: `抱歉,出错了:${(error as Error).message}`,
        type: 'text',
        model: requestModel,
        provider: requestProvider,
      });
    } finally {
      setGenerating(false);
    }
  };

  // 模拟 AI 回复
  const simulateAIResponse = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`收到你的消息:"${prompt}"。\n\n我是艺镜AI助手,已收到你的创作需求。当前使用模型:${defaultProvider}/${selectedModel || defaultModel}。\n\n(这是模拟回复,实际应调用配置的大模型 API)`);
      }, 1000 + Math.random() * 1000);
    });
  };

  // 临时保存上传的文件
  const saveFileTemporarily = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        try {
          const type = /video/i.test(file.type) ? 'video' : 'image';
          addAsset({ name: file.name, type: type as any, path: dataUrl, size: file.size, sourceType: 'chat' });
        } catch (err) {
          console.warn('addAsset failed', err);
        }
        resolve(dataUrl);
      };
      reader.readAsDataURL(file);
    });
  };

  // 处理文件上传(追加模式,支持多附件)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles(prev => {
        const updated = [...prev, ...newFiles];
        return updated;
      });
    }
  };

  // 格式化时间
  const formatTime = (date: Date | string | number) => {
    const d = new Date(date);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  // 格式化日期(用于会话分组)
  const formatDateGroup = (date: Date | string | number) => {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) return '今天';
    if (d.toDateString() === yesterday.toDateString()) return '昨天';
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 缓存会话排序/分组,避免消息渲染时反复 sort 并改写 store 数组造成卡顿
  const groupedChatSessions = useMemo(() => {
    return Object.entries(
      [...chatSessions]
        .map(s => ({ ...s, title: (s.title && !/[\uFFFD锘\u0000-\u001F]/.test(s.title)) ? s.title : '新对话' }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .reduce((groups, session) => {
          const group = formatDateGroup(session.createdAt);
          if (!groups[group]) groups[group] = [];
          groups[group].push(session);
          return groups;
        }, {} as Record<string, typeof chatSessions>)
    );
  }, [chatSessions]);

  const recentChatSessions = useMemo(() => {
    return [...chatSessions]
      .map(s => ({ ...s, title: (s.title && !/[\uFFFD锘\u0000-\u001F]/.test(s.title)) ? s.title : '新对话' }))
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
      .slice(0, 5);
  }, [chatSessions]);

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, type: 'session' | 'message' | 'file', data: any) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [];

    // 复制功能
    items.push({
      label: '复制',
      icon: <CopyIcon size={15} />,
      onClick: async () => {
        try {
          if (type === 'message' && data.content) {
            await navigator.clipboard.writeText(data.content);
          } else if (type === 'session' && data.title) {
            await navigator.clipboard.writeText(data.title);
          } else if (type === 'file' && data.fileUrl) {
            await navigator.clipboard.writeText(data.fileUrl);
          }
          setCopyToast('已复制到剪贴板');
          setTimeout(() => setCopyToast(null), 1500);
        } catch (err) {
          console.error('复制失败', err);
        }
      }
    });

    // 粘贴功能(仅在输入框区域)
    if (type === 'message' && textareaRef.current) {
      items.push({
        label: '粘贴',
        icon: <ClipboardIcon size={15} />,
        onClick: async () => {
          try {
            const text = await navigator.clipboard.readText();
            setInputText(prev => prev + text);
          } catch (err) {
            console.error('Failed to read clipboard:', err);
          }
        },
        disabled: false
      });
    }

    items.push({ label: '---' });

    // 删除功能(根据类型自适应)
    if (type === 'session') {
      items.push({
        label: '删除对话',
        icon: <TrashIcon size={15} />,
        onClick: () => setConfirmEndId(data.id),
        danger: true
      });
    } else if (type === 'message') {
      items.push({
        label: '删除消息',
        icon: <TrashIcon size={15} />,
        onClick: () => {
          // 删除单条消息(使用已有确认逻辑)
          try {
            if (data && data.id) {
              handleDeleteMessage(data.id);
            }
          } catch (err) {
            console.error('删除消息失败', err);
          }
        },
        danger: true
      });
    } else if (type === 'file') {
      items.push({
        label: `删除${data.fileType || '文件'}`,
        icon: <TrashIcon size={15} />,
        onClick: () => {
          // 删除文件(仅从剪贴/预览上下文中移除,若需彻底删除请到素材页操作)
          // 文件删除仅用于上下文菜单占位,实际素材删除请在素材页执行。
        },
        danger: true
      });
    }

    // 另存为功能(仅文件和图片)
    if (type === 'file' || (type === 'message' && data.files && data.files.length > 0)) {
      items.push({ label: '---' });
      items.push({
        label: '另存为...',
        icon: <SaveIcon size={15} />,
        onClick: () => {
          handleSaveAs(data);
        }
      });
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items,
      onClose: () => setContextMenu(null)
    });
  };

  // 处理另存为
  const handleSaveAs = (data: any) => {
    if (data.files && data.files.length > 0) {
      // 保存消息中的文件
      data.files.forEach((fileUrl: string, idx: number) => {
        const link = document.createElement('a');
        link.href = fileUrl;
        link.download = `文件_${idx + 1}`;
        link.click();
      });
    } else if (data.fileUrl) {
      // 保存单个文件
      const link = document.createElement('a');
      link.href = data.fileUrl;
      link.download = data.fileName || 'download';
      link.click();
    }
  };

  // 开始编辑消息 - 使用 useCallback 缓存
  const handleStartEdit = useCallback((message: any) => {
    setEditingMessage({
      id: message.id,
      content: message.content,
    });
    // 自动聚焦到编辑框
    setTimeout(() => {
      editTextareaRef.current?.focus();
    }, 0);
  }, []);

  // 提交编辑后的消息 - 使用 useCallback 缓存
  const handleEditSubmit = useCallback(async (messageId: string) => {
    if (!editingMessage || !activeSessionId) return;
    if (!editingMessage.content.trim()) return;

    const requestConfig = selectedConfig;
    const requestModel = getSelectedSavedModel(requestConfig, selectedModel);
    const requestProvider = getRequestProvider(requestConfig, defaultProvider as APIProvider);
    const editedContent = editingMessage.content;

    // 更新消息内容
    updateMessage(activeSessionId, messageId, { content: editedContent });
    setEditingMessage(null);

    // 重新生成 AI 回复:只允许调用设置页中已保存完整的接口和模型
    setGenerating(true);
    try {
      const win = window as any;
      let response = '';

      if (!requestConfig) {
        response = '请先在"调用设置"页保存可用的接口配置后再发送。';
      } else if (!requestModel) {
        response = '请先在"调用设置"页为当前接口保存至少一个模型后再发送。';
      } else if (!win?.yijingAPI) {
        response = '当前运行环境无法调用 API,请在桌面客户端中重试。';
      } else {
        const configApiType = requestConfig.apiType;
        const isGrsai = configApiType === 'openai-chat' || configApiType === 'openai-generations' || configApiType === 'openai-completions';

        if (isGrsai && win.yijingAPI.grsai) {
          if (configApiType === 'openai-chat') {
            const result = await win.yijingAPI.grsai.chat({
              baseUrl: requestConfig.baseUrl,
              apiKey: requestConfig.apiKey,
              model: requestModel,
              messages: [{ role: 'user', content: editedContent }],
            });
            response = result.ok && result.data?.choices?.[0]
              ? (result.data.choices[0].message?.content || JSON.stringify(result.data))
              : `请求失败:${result?.status || ''} ${JSON.stringify(result?.data || result?.error || '')}`;
          } else {
            const genResult = await win.yijingAPI.grsai.generate({
              baseUrl: requestConfig.baseUrl,
              apiKey: requestConfig.apiKey,
              model: requestModel,
              prompt: editedContent,
              aspectRatio: aspectRatio || undefined,
              aspect_ratio: aspectRatio || undefined,
              imageSize: isImageModel ? (imageSize || undefined) : undefined,
              resolution: isVideoModel ? (resolution || undefined) : undefined,
              duration: isVideoModel && duration ? Number(duration) : undefined,
              apiType: configApiType,
            });

            if (genResult?.accepted && genResult.id) {
              response = '';
            } else if (genResult?.filePaths?.length > 0) {
              // 直接把本地文件作为图片/视频消息插入
              const isVideoFile = /\.(mp4|webm|ogg|mov)$/i.test(String(genResult.filePaths[0] || ''));
              addMessage(activeSessionId, {
                role: 'assistant',
                content: '',
                type: (isVideoModel || isVideoFile) ? 'video' : 'image',
                model: requestModel,
                provider: requestProvider,
                files: genResult.filePaths,
              });
              setGenerating(false);
              return;
            } else if (genResult?.ok && genResult.data) {
              // 从多种返回结构中提取媒体 URL,直接渲染为图片/视频而非纯文本
              const pickMediaUrl = (r: any): string | undefined => {
                if (!r) return undefined;
                if (typeof r === 'string') return /^https?:\/\//i.test(r) ? r : undefined;
                if (typeof r.url === 'string') return r.url;
                if (typeof r.uri === 'string') return r.uri;
                if (typeof r.image_url === 'string') return r.image_url;
                if (typeof r.video_url === 'string') return r.video_url;
                if (r.b64_json) return `data:image/png;base64,${r.b64_json}`;
                return undefined;
              };
              const mediaUrls: string[] = [];
              if (Array.isArray(genResult.data.data)) genResult.data.data.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0 && Array.isArray(genResult.data.images)) genResult.data.images.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0 && Array.isArray(genResult.data.results)) genResult.data.results.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0) { const u = pickMediaUrl(genResult.data); if (u) mediaUrls.push(u); }

              if (mediaUrls.length > 0) {
                const isVideoUrl = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(String(mediaUrls[0] || ''));
                addMessage(activeSessionId, {
                  role: 'assistant',
                  content: '',
                  type: (isVideoModel || isVideoUrl) ? 'video' : 'image',
                  model: requestModel,
                  provider: requestProvider,
                  files: mediaUrls,
                });
                setGenerating(false);
                return;
              }
              response = JSON.stringify(genResult.data);
            } else {
              response = `生成请求失败:${genResult?.error || '未知错误'}`;
            }
          }
        } else if (win.yijingAPI.openai) {
          const oaiResult = await win.yijingAPI.openai.chat({
            baseUrl: requestConfig.baseUrl,
            apiKey: requestConfig.apiKey,
            model: requestModel,
            messages: [{ role: 'user', content: editedContent }],
          });
          response = oaiResult.ok && oaiResult.data?.choices?.[0]
            ? (oaiResult.data.choices[0].message?.content || JSON.stringify(oaiResult.data))
            : `请求失败:${oaiResult?.error || JSON.stringify(oaiResult?.data || {})}`;
        }
      }

      // 找到原 AI 回复并更新,或添加新回复
      const messageIndex = activeSession?.messages.findIndex(m => m.id === messageId);
      if (messageIndex !== undefined && messageIndex >= 0) {
        const nextMessage = activeSession?.messages[messageIndex + 1];
        if (nextMessage && nextMessage.role === 'assistant') {
          updateMessage(activeSessionId, nextMessage.id, { content: response });
        } else {
          addMessage(activeSessionId, {
            role: 'assistant',
            content: response,
            type: 'text',
            model: requestModel,
            provider: requestProvider,
          });
        }
      }
    } catch (error) {
      addMessage(activeSessionId, {
        role: 'assistant',
        content: `抱歉,出错了:${(error as Error).message}`,
        type: 'text',
        model: requestModel,
        provider: requestProvider,
      });
    } finally {
      setGenerating(false);
    }
  }, [editingMessage, activeSessionId, activeSession, selectedConfig, selectedModel, defaultProvider, aspectRatio, imageSize, isImageModel, isVideoModel, resolution, duration, updateMessage, addMessage, setGenerating]);

  // 重新生成 AI 回复 - 使用 useCallback 缓存
  const handleRegenerate = useCallback(async (message: any) => {
    if (!activeSessionId) return;

    // 找到这条 AI 消息对应的用户消息
    const messageIndex = activeSession?.messages.findIndex(m => m.id === message.id);
    if (messageIndex === undefined || messageIndex <= 0) return;

    const userMessage = activeSession?.messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== 'user') return;

    setGenerating(true);
    try {
      const win = window as any;
      let newContent: any = null;

      // 使用当前选择的已保存配置去重新提交请求
      const currentConfig = selectedConfig || null;
      const currentModel = getSelectedSavedModel(currentConfig, selectedModel);

      if (!currentConfig) {
        newContent = '请先在"调用设置"页保存可用的接口配置后再重新生成。';
      } else if (!currentModel) {
        newContent = '请先在"调用设置"页为当前接口保存至少一个模型后再重新生成。';
      } else if (win?.yijingAPI) {
        const configApiType = currentConfig.apiType;
        const isGrsai = configApiType === 'openai-chat' || configApiType === 'openai-generations' || configApiType === 'openai-completions';

        if (isGrsai && win.yijingAPI.grsai) {
          if (configApiType === 'openai-chat') {
            const result = await win.yijingAPI.grsai.chat({
              baseUrl: currentConfig.baseUrl,
              apiKey: currentConfig.apiKey,
              model: currentModel,
              messages: [{ role: 'user', content: userMessage.content }],
            });
            if (result.ok && result.data && result.data.choices && result.data.choices[0]) {
              newContent = result.data.choices[0].message?.content || JSON.stringify(result.data);
            } else {
              newContent = `请求失败：${result?.status || ''} ${JSON.stringify(result?.data || result?.error || '')}`;
            }
          } else {
            const genResult = await win.yijingAPI.grsai.generate({
              baseUrl: currentConfig.baseUrl,
              apiKey: currentConfig.apiKey,
              model: currentModel,
              prompt: userMessage.content,
              aspectRatio: aspectRatio || undefined,
              aspect_ratio: aspectRatio || undefined,
              imageSize: isImageModel ? (imageSize || undefined) : undefined,
              resolution: isVideoModel ? (resolution || undefined) : undefined,
              duration: isVideoModel && duration ? Number(duration) : undefined,
              apiType: configApiType,
            });

            if (genResult && genResult.accepted && genResult.id) {
              // 将 assistant 消息设置为占位（保留 jobId），等待后台更新为图片
              updateMessage(activeSessionId, message.id, { content: '', meta: { jobId: genResult.id, generating: true, mediaType: isVideoModel ? 'video' : 'image' } });
              setGenerating(false);
              return;
            } else if (genResult && genResult.filePaths && genResult.filePaths.length > 0) {
              // 立即替换为包含生成文件的消息（不显示成功文本），按扩展名/视频模型推断类型
              const isVideoFile = /\.(mp4|webm|ogg|mov)$/i.test(String(genResult.filePaths[0] || ''));
              updateMessage(activeSessionId, message.id, { content: '', type: (isVideoModel || isVideoFile) ? 'video' : 'image', files: genResult.filePaths, meta: { jobId: genResult.id || null } });
              setGenerating(false);
              return;
            } else if (genResult && genResult.ok && genResult.data) {
              // 从多种返回结构中提取媒体 URL,直接渲染为图片/视频而非纯文本
              const pickMediaUrl = (r: any): string | undefined => {
                if (!r) return undefined;
                if (typeof r === 'string') return /^https?:\/\//i.test(r) ? r : undefined;
                if (typeof r.url === 'string') return r.url;
                if (typeof r.uri === 'string') return r.uri;
                if (typeof r.image_url === 'string') return r.image_url;
                if (typeof r.video_url === 'string') return r.video_url;
                if (r.b64_json) return `data:image/png;base64,${r.b64_json}`;
                return undefined;
              };
              const mediaUrls: string[] = [];
              if (Array.isArray(genResult.data.data)) genResult.data.data.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0 && Array.isArray(genResult.data.images)) genResult.data.images.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0 && Array.isArray(genResult.data.results)) genResult.data.results.forEach((r: any) => { const u = pickMediaUrl(r); if (u) mediaUrls.push(u); });
              if (mediaUrls.length === 0) { const u = pickMediaUrl(genResult.data); if (u) mediaUrls.push(u); }

              if (mediaUrls.length > 0) {
                const isVideoUrl = /\.(mp4|webm|ogg|mov)(\?|$)/i.test(String(mediaUrls[0] || ''));
                updateMessage(activeSessionId, message.id, { content: '', type: (isVideoModel || isVideoUrl) ? 'video' : 'image', files: mediaUrls, meta: { jobId: genResult.id || null } });
                setGenerating(false);
                return;
              }
              newContent = JSON.stringify(genResult.data);
            } else {
              newContent = `生成请求失败：${genResult?.error || '未知错误'}`;
            }
          }
        } else if (win.yijingAPI.openai) {
          const oaiResult = await win.yijingAPI.openai.chat({
            baseUrl: currentConfig.baseUrl,
            apiKey: currentConfig.apiKey,
            model: currentModel,
            messages: [{ role: 'user', content: userMessage.content }],
          });
          if (oaiResult.ok && oaiResult.data && oaiResult.data.choices && oaiResult.data.choices[0]) {
            newContent = oaiResult.data.choices[0].message?.content || JSON.stringify(oaiResult.data);
          } else {
            newContent = `请求失败：${oaiResult?.error || JSON.stringify(oaiResult?.data || {})}`;
          }
        }
      } else {
        newContent = '当前运行环境无法调用 API，请在桌面客户端中重试。';
      }

      // 更新原有助手消息内容
      updateMessage(activeSessionId, message.id, { content: newContent });
    } catch (error) {
      updateMessage(activeSessionId, message.id, {
        content: `抱歉，出错了：${(error as Error).message}`,
      });
    } finally {
      setGenerating(false);
    }
  }, [activeSession, activeSessionId, aspectRatio, imageSize, isImageModel, isVideoModel, resolution, duration, selectedConfig, selectedModel, setGenerating, updateMessage]);

  // 引用消息 - 使用 useCallback 缓存
  const handleQuote = useCallback((message: any) => {
    const quoteText = `> ${message.content.split('\n').join('\n> ')}\n\n`;
    setInputText(prev => quoteText + prev);
    textareaRef.current?.focus();
  }, []);

  // 删除单条消息 - 使用 useCallback 缓存
  const handleDeleteMessage = useCallback((messageId: string) => {
    if (!activeSessionId) return;
    if (confirm('确定要删除这条消息吗?')) {
      deleteMessage(activeSessionId, messageId);
    }
  }, [activeSessionId, deleteMessage]);

  // 渲染生成控制栏 - 内联版本(在操作栏内,替换原来的gpt-4o标签)
  const renderGenerationControlsInline = () => {
    // 只展示调用设置页已保存完整的接口和模型
    const allConfigs = allAvailableConfigs;
    const activeConfig = selectedConfig;

    return (
      <React.Fragment>
        {/* 统一接口选择器 */}
        <div className="control-group">
          <select
            value={selectedConfigId}
            onChange={(e) => {
              setSelectedConfigId(e.target.value);
              setGenerationParams({ selectedConfigId: e.target.value });
            }}
            className="control-select"
          >
            <option value="">选择接口</option>
            {allConfigs.map(config => (
              <option key={`${config._source}-${config.id}`} value={config.id}>
                {config.name || '未命名'}{config._source !== 'recommended' ? ` (${config._source})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* 模型选择器 */}
        {activeConfig && activeConfig.models.length > 0 && (
          <div className="control-group">
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setGenerationParams({ selectedModel: e.target.value });
                // persist selected model to store so selection is remembered
                try { setStoreSelectedModel && setStoreSelectedModel(e.target.value); } catch {}
              }}
              className="control-select"
            >
              <option value="">选择模型</option>
              {activeConfig.models.map((model, idx) => (
                <option key={idx} value={model}>{model}</option>
              ))}
            </select>
          </div>
        )}

        {/* 比例选择器 - 图片/视频模型 */}
        {(isImageModel || isVideoModel) && (
          <div className="control-group">
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="control-select"
            >
              <option value="">比例</option>
              {(isImageModel ? IMAGE_ASPECT_RATIOS : VIDEO_ASPECT_RATIOS).map((ratio, idx) => (
                <option key={idx} value={typeof ratio === 'string' ? ratio : ratio.value}>{typeof ratio === 'string' ? ratio : ratio.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* 分辨率选择 */}
        {isImageModel && (
          <div className="control-group">
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              className="control-select"
            >
              <option value="">分辨率</option>
              <option value="1K">1K</option>
              <option value="2K">2K</option>
              <option value="4K">4K</option>
            </select>
          </div>
        )}

        {/* 像素选择 - 视频模型 */}
        {isVideoModel && (
          <div className="control-group">
            <select
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="control-select"
            >
              <option value="">像素</option>
              {VIDEO_RESOLUTIONS.map((res, idx) => (
                <option key={idx} value={res}>{res}</option>
              ))}
            </select>
          </div>
        )}

        {/* 时长选择 - 视频模型 */}
        {isVideoModel && (
          <div className="control-group">
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="control-select"
            >
              <option value="">时长</option>
              {['5', '10', '15', '20', '25', '30'].map((sec) => (
                <option key={sec} value={sec}>{sec}秒</option>
              ))}
            </select>
          </div>
        )}
      </React.Fragment>
    );
  };

  // 如果应该显示对话界面,渲染对话布局
  if (showChatInterface && activeSession) {
    return (
      <div className="home-page-jimeng" onContextMenu={(e) => e.preventDefault()}>

        {/* 对话界面布局:左右分栏 */}
        <div className="chat-layout">
          {/* 左侧:对话历史树形导航 */}
          <div className={`chat-sessions-panel ${sessionsPanelCollapsed ? 'collapsed' : ''}`}>
            <div className="sessions-header">
              <h3>对话历史</h3>
              <button
                className="new-session-btn"
                onClick={() => {
                  createChatSession();
                  setActiveSession(null);
                }}
                title="新建对话"
              >
                <PlusIcon size={16} />
              </button>
            </div>

            <div className="sessions-list">
              {chatSessions.length === 0 && (
                <div className="no-sessions">暂无对话历史</div>
              )}

              {/* 按日期分组显示会话 */}
              {groupedChatSessions.map(([dateGroup, sessions]) => (
                <div key={dateGroup} className="session-group">
                  <div className="session-group-label">{dateGroup}</div>
                  {sessions.map(session => (
                    <div
                      key={session.id}
                      className={`session-item ${session.id === activeSessionId ? 'active' : ''}`}
                      title={session.title || '新对话'}
                      onContextMenu={(e) => handleContextMenu(e, 'session', session)}
                    >
                      <div className="session-item-main" onClick={() => setActiveSession(session.id)}>
                        <span className="session-icon"><FileIcon size={16} /></span>
                        <span className="session-title">{session.title || '新对话'}</span>
                      </div>
                      <button
                        className="session-close-btn"
                        onClick={(e) => { e.stopPropagation(); setConfirmEndId(session.id); }}
                        title="删除对话"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* 折叠按钮 - 底部 */}
            <button
              className="sessions-collapse-btn"
              onClick={() => setSessionsPanelCollapsed(true)}
              title="收起对话历史"
            >
              <ChevronLeftIcon size={15} />
              <span>收起</span>
            </button>
          </div>

          {/* 右侧:对话消息面板 */}
          <div className="chat-messages-panel">
            {/* 折叠后的展开按钮 - 悬浮在对话框界面左边缘 */}
            {sessionsPanelCollapsed && (
              <button
                className="sessions-expand-btn"
                onClick={() => setSessionsPanelCollapsed(false)}
                title="展开对话历史"
              >
                <ChevronRightIcon size={16} />
              </button>
            )}
            {/* 消息列表 */}
            <div className="messages-container">
              {activeSession.messages.length === 0 && (
                <div className="welcome-message">
                  <h2>艺镜AI</h2>
                  <p>让一切灵感更加简单</p>
                  <p className="welcome-hint">发送消息开始对话</p>
                </div>
              )}

              {activeSession.messages.map(message => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isUser={message.role === 'user'}
                  editingMessageId={editingMessage?.id || null}
                  editingContent={editingMessage?.content || ''}
                  onStartEdit={handleStartEdit}
                  onCopy={handleCopy}
                  onDelete={handleDeleteMessage}
                  onRegenerate={handleRegenerate}
                  onQuote={handleQuote}
                  onEditSubmit={handleEditSubmit}
                  onEditCancel={() => setEditingMessage(null)}
                  onEditChange={(content) => setEditingMessage(prev => prev ? { ...prev, content } : prev)}
                  onMediaPreview={(src, type) => setMediaPreview({ src, type })}
                  onContextMenu={(e, type, data) => handleContextMenu(e, type, data)}
                  formatTime={formatTime}
                />
              ))}

              {isGenerating && (
                <div className="message-bubble assistant">
                  <div className="message-avatar"><img src={logoUrl} alt="艺镜AI" className="ai-avatar-logo" /></div>
                  <div className="message-content-wrapper">
                    <div className="message-role">艺镜AI</div>
                    <div className="message-content generating">
                      <span className="dot-flashing"></span>
                      <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>正在生成中...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* 输入区域 */}
            <div className="chat-input-area">
              <div className="input-wrapper">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="输入消息,Shift+Enter 换行..."
                  className="chat-textarea"
                  rows={3}
                  onInput={(e) => {
                    // 自动调整高度,增大上限以防文字被遮挡
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = Math.min(target.scrollHeight, 300) + 'px';
                  }}
                />

                {/* 已上传文件显示 */}
                {attachedFiles.length > 0 && (
                  <div className="attached-files">
                    {attachedFiles.map((file, idx) => (
                      <span key={idx} className="file-tag">
                        <PaperclipIcon size={14} />
                        <span className="file-name">{file.name}</span>
                        <span onClick={() => setAttachedFiles(files => files.filter((_, i) => i !== idx))}>✕</span>
                      </span>
                    ))}
                  </div>
                )}

                {/* 底部操作栏 */}
                <div className="input-actions">
                  {/* 左侧:上传按钮 + 接口/模型选择器 */}
                  <div className="left-controls">
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                      onChange={handleFileUpload}
                      id="chat-file-upload"
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="chat-file-upload" className="upload-btn">
                      <PaperclipIcon size={16} />
                    </label>

                    {/* 接口/模型/比例选择器 - 替换原来的gpt-4o标签 */}
                    {renderGenerationControlsInline()}
                  </div>
                  <button
                    className="send-button"
                    onClick={handleSend}
                    disabled={isGenerating || (!inputText.trim() && attachedFiles.length === 0)}
                  >
                    {isGenerating ? (
                      '发送中...'
                    ) : (
                      <>
                        <span>发送</span>
                        <SendIcon size={15} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* 右键菜单 */}
          {contextMenu && (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={contextMenu.items}
              onClose={contextMenu.onClose}
            />
          )}

          {/* 删除对话确认弹窗 */}
          {confirmEndId && (
            <div className="modal-overlay" onClick={() => setConfirmEndId(null)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h3>删除对话</h3>
                <p>确认删除该对话?删除后不可恢复。</p>
                <div className="modal-actions">
                  <button className="modal-btn cancel" onClick={() => setConfirmEndId(null)}>取消</button>
                  <button className="modal-btn confirm" onClick={() => {
                    deleteChatSession(confirmEndId);
                    if (confirmEndId === activeSessionId) setActiveSession(null);
                    setConfirmEndId(null);
                  }}>确认删除</button>
                </div>
              </div>
            </div>
          )}

            {/* 复制提示 */}
            {copyToast && (
              <div className="copy-toast">{copyToast}</div>
            )}
        </div>
      </div>
    );
  }

  // 默认显示:首页(即梦风格)
  return (
    <div className="home-page-jimeng">

      {/* 主内容区域:首页样式 */}
      <div className="jimeng-main">
        {/* 大标题文字 */}
        <div className="hero-title">
          <img src={logoUrl} alt="艺镜AI" className="hero-logo" style={{ width: 90, height: 90 }} />
          <div className="hero-text">
            <h1>艺镜AI</h1>
            <p className="hero-subtitle">让一切灵感更加简单</p>
          </div>
          <div style={{ position: 'absolute', right: 16, top: 16 }}>
            {/* 已移除的任务入口 */}
          </div>
        </div>

        {/* 超大输入框(即梦风格) */}
        <div className="jimeng-input-container">
          <div className="input-wrapper">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="描述你的创意想法..."
              className="jimeng-textarea"
              rows={3}
            />

            {/* 已上传文件显示 */}
            {attachedFiles.length > 0 && (
              <div className="attached-files">
                {attachedFiles.map((file, idx) => (
                  <span key={idx} className="file-tag">
                    <PaperclipIcon size={14} />
                    <span className="file-name">{file.name}</span>
                    <span onClick={() => setAttachedFiles(files => files.filter((_, i) => i !== idx))}>✕</span>
                  </span>
                ))}
              </div>
            )}

            {/* 底部操作栏 - 上传按钮 + 接口/模型选择器 + 生成按钮 在同一排 */}
            <div className="input-actions">
              {/* 左侧:上传按钮 + 接口/模型选择器 */}
              <div className="left-controls">
                {/* 上传参考文件按钮 */}
                <input
                  type="file"
                  multiple
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileUpload}
                  id="jimeng-file-upload"
                  style={{ display: 'none' }}
                />
                <label htmlFor="jimeng-file-upload" className="upload-btn">
                  <PaperclipIcon size={16} />
                  <span>上传参考文件</span>
                </label>

                {/* 接口/模型/比例选择器 - 替换原来的gpt-4o标签 */}
                {renderGenerationControlsInline()}
              </div>

              {/* 右侧:生成按钮 */}
              <button
                className="send-button"
                onClick={handleSend}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <span className="loading-dots">发送中...</span>
                ) : (
                  <>
                    <span>发送</span>
                    <SendIcon size={15} className="send-icon" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 历史对话入口(如果有历史对话,显示快捷入口) */}
        {chatSessions.length > 0 && (
          <div className="history-quick-access">
            <h3>最近对话</h3>
            <div className="history-list">
              {recentChatSessions.map(session => (
                  <div
                    key={session.id}
                    className="history-item"
                    onClick={() => setActiveSession(session.id)}
                  >
                    <span className="history-icon"><FileIcon size={18} /></span>
                    <span className="history-title">{session.title || '新对话'}</span>
                    <span className="history-time">
                      {formatDateGroup(session.updatedAt || session.createdAt)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* 复制提示 */}
      {copyToast && (
        <div className="copy-toast">{copyToast}</div>
      )}
    </div>
  );
};
