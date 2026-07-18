import React, { useState, useRef, useCallback } from 'react';
import { useAppStore, getCallableRecommendedConfigs } from '../store/appStore';
import { SafeMarkdown } from './SafeMarkdown';
import { normalizeFileSrc } from '../utils/pathUtils';
import {
  CopyIcon, EditIcon, RefreshIcon, ClipboardIcon, TrashIcon, UserIcon,
} from './Icons';
import logoUrl from '/logo.png';

// ChevronDownIcon 用于思考过程折叠
const ChevronDownIcon = ({ size = 16, style }: { size?: number; style?: React.CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <path d="M6 9l6 6 6-6"/>
  </svg>
);

export type MessageBubbleProps = {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    type: string;
    files?: string[];
    model?: string;
    provider?: string;
    meta?: Record<string, any>;
    timestamp: number;
  };
  sessionId: string;
  /** 当前正在编辑的消息 ID（由 HomePage 管理） */
  editingMessageId: string | null;
  onStartEdit: (id: string, content: string) => void;
  onCopy: (msg: { id: string; content: string; files?: string[] }) => void;
  onContextMenu: (e: React.MouseEvent, type: 'message' | 'file', data: any) => void;
  onMediaPreview: (p: { src: string; type: 'image' | 'video' }) => void;
  onSaveAs: (data: any) => void;
};

/**
 * 单条消息气泡 —— React.memo 隔离
 * 自定义 comparator 只比较 message.id + content + files + 编辑状态，
 * 忽略回调函数的引用变化，以此避免父组件 rerender 时的连锁重绘。
 */
export const MessageBubble = React.memo(function MessageBubble({
  message,
  sessionId,
  editingMessageId,
  onStartEdit,
  onCopy,
  onContextMenu,
  onMediaPreview,
  onSaveAs,
}: MessageBubbleProps) {
  // ---- 内部编辑状态 ----
  const [editingContent, setEditingContent] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  // 当消息进入编辑模式时初始化编辑内容
  const isEditing = editingMessageId === message.id;
  if (isEditing && !editingContent && message.content) {
    setEditingContent(message.content);
  }

  // ---- 从 store 获取 action ----
  const updateMessage = useAppStore(s => s.updateMessage);
  const deleteMessage = useAppStore(s => s.deleteMessage);

  // ---- 时间格式化 ----
  const formatTime = (ts: number) =>
    new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  // ---- handlers ----
  const handleCopyMsg = useCallback(() => onCopy(message), [message, onCopy]);

  const handleStartEdit = useCallback(() => {
    setEditingContent(message.content);
    onStartEdit(message.id, message.content);
    setTimeout(() => editRef.current?.focus(), 0);
  }, [message, onStartEdit]);

  const handleEditSubmit = useCallback(async () => {
    if (!editingContent.trim() || !sessionId) return;

    // 更新消息内容
    updateMessage(sessionId, message.id, { content: editingContent });

    // 重新生成 AI 回复（如果编辑的是用户消息且有下一条助手消息）
    if (message.role === 'user') {
      const store = useAppStore.getState();
      const session = store.chatSessions.find((s: any) => s.id === sessionId);
      if (session) {
        const idx = session.messages.findIndex((m: any) => m.id === message.id);
        if (idx >= 0 && idx + 1 < session.messages.length) {
          const nextMsg = session.messages[idx + 1];
          if (nextMsg.role === 'assistant') {
            store.setGenerating(true);
            regenerateForMessage(sessionId, editingContent, nextMsg.id).finally(() => {
              useAppStore.getState().setGenerating(false);
            });
          }
        }
      }
    }
  }, [editingContent, sessionId, message, updateMessage]);

  const handleDelete = useCallback(() => {
    if (confirm('确定要删除这条消息吗？')) {
      deleteMessage(sessionId, message.id);
    }
  }, [sessionId, message.id, deleteMessage]);

  const handleQuote = useCallback(() => {
    const quote = `> ${message.content.split('\n').join('\n> ')}\n\n`;
    const ta = document.querySelector<HTMLTextAreaElement>('.chat-textarea');
    if (ta) {
      const start = ta.selectionStart;
      ta.value = ta.value.slice(0, start) + quote + ta.value.slice(start);
      ta.focus();
    }
  }, [message.content]);

  const handleRegenerate = useCallback(async () => {
    if (!sessionId) return;
    const store = useAppStore.getState();
    const session = store.chatSessions.find((s: any) => s.id === sessionId);
    if (!session) return;
    const msgIdx = session.messages.findIndex((m: any) => m.id === message.id);
    if (msgIdx <= 0) return;
    const userMsg = session.messages[msgIdx - 1];
    if (!userMsg || userMsg.role !== 'user') return;

    store.setGenerating(true);
    try {
      // 复用 ChatInput 中的生成逻辑（通过 store 非响应式读取配置）
      const newContent = await generateSingleResponse(userMsg.content, store);
      if (newContent !== null) {
        store.updateMessage(sessionId, message.id, { content: newContent });
      }
    } catch (error) {
      store.updateMessage(sessionId, message.id, { content: `抱歉，出错了：${(error as Error).message}` });
    } finally {
      store.setGenerating(false);
    }
  }, [sessionId, message.id]);

  // ---- file click ----
  const onFileClick = useCallback((src: string, isVideo: boolean) => {
    onMediaPreview({ src, type: isVideo ? 'video' : 'image' });
  }, [onMediaPreview]);

  // ---- 渲染 ----
  const contentArea = message.content ? (
    <SafeMarkdown content={String(message.content || '')} />
  ) : null;

  const msgFiles = message.files && message.files.length > 0 ? (
    <div className="message-files">
      {message.files.map((file, idx) => {
        const src = normalizeFileSrc(file);
        const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(String(file));
        const isAudio = /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(String(file));
        return (
          <div key={idx} className="message-file-preview" onClick={() => onFileClick(src, isVideo)} style={{ cursor: 'pointer' }}
            onContextMenu={(e) => onContextMenu(e, 'file', { fileUrl: file, fileName: `文件_${idx + 1}`, fileType: isVideo ? 'video' : (isAudio ? 'audio' : 'file') })}>
            {isVideo ? (
              <video src={src} controls preload="metadata" style={{ maxWidth: '100%' }} />
            ) : isAudio ? (
              <audio src={src} controls style={{ width: '100%' }} />
            ) : (
              <img src={src} alt="附件" />
            )}
          </div>
        );
      })}
    </div>
  ) : null;

  return (
    <div
      key={message.id}
      className={`message-bubble ${message.role}`}
      onContextMenu={(e) => onContextMenu(e, 'message', message)}
    >
      <div className="message-avatar">
        {message.role === 'user' ? <UserIcon size={18} /> : <img src={logoUrl} alt="艺镜AI" className="ai-avatar-logo" />}
      </div>
      <div className="message-content-wrapper">
        <div className="message-role">
          {message.role === 'user' ? '你' : '艺镜AI'}
          <span className="message-time">{formatTime(message.timestamp)}</span>
        </div>

        {/* 用户消息 */}
        {message.role === 'user' && (
          <div className="user-message-wrapper">
            {isEditing ? (
              <div className="message-edit-area">
                <textarea
                  ref={editRef}
                  value={editingContent}
                  onChange={e => setEditingContent(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditSubmit(); }
                    if (e.key === 'Escape') { onStartEdit('', ''); setEditingContent(''); }
                  }}
                  className="edit-textarea" autoFocus
                />
                <div className="edit-actions">
                  <button className="edit-btn cancel" onClick={() => { onStartEdit('', ''); setEditingContent(''); }}>取消</button>
                  <button className="edit-btn confirm" onClick={handleEditSubmit}>发送</button>
                </div>
              </div>
            ) : (
              <div className="user-message-content">
                <div className="message-content" onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target instanceof HTMLImageElement && target.src) onMediaPreview({ src: target.src, type: 'image' });
                }}>
                  {contentArea}
                </div>
                <div className="message-hover-actions">
                  <button className="hover-action-btn edit" onClick={handleStartEdit} title="编辑"><EditIcon size={14} /></button>
                  <button className="hover-action-btn copy" onClick={handleCopyMsg} title="复制"><CopyIcon size={14} /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI 消息 */}
        {message.role === 'assistant' && (
          <div className="assistant-message-wrapper">
            {message.meta?.generating ? (
              <div className="message-content generating">
                <span className="dot-flashing" />
                <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--text-muted)' }}>正在生成中...</span>
              </div>
            ) : (
              <>
                {/* 思考过程内容框 */}
                {message.meta?.thinking && (
                  <ThinkingBlock content={message.meta.thinking} />
                )}
                <div className="message-content" onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target instanceof HTMLImageElement && target.src) onMediaPreview({ src: target.src, type: 'image' });
                }}>
                  {contentArea}
                  {msgFiles}
                </div>
                <div className="assistant-message-actions">
                  <button className="assistant-action-btn" onClick={handleCopyMsg} title="复制"><CopyIcon size={14} /><span>复制</span></button>
                  <button className="assistant-action-btn" onClick={handleRegenerate} title="重新生成"><RefreshIcon size={14} /><span>重新生成</span></button>
                  <button className="assistant-action-btn" onClick={handleQuote} title="引用"><ClipboardIcon size={14} /><span>引用</span></button>
                  <button className="assistant-action-btn delete" onClick={handleDelete} title="删除"><TrashIcon size={14} /><span>删除</span></button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (
  prev: MessageBubbleProps,
  next: MessageBubbleProps
) => {
  // 自定义 comparator：只比较会影响渲染的数据字段，忽略回调引用
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.content !== next.message.content) return false;
  if (prev.message.type !== next.message.type) return false;
  if (prev.message.role !== next.message.role) return false;
  if ((prev.message.meta?.generating) !== (next.message.meta?.generating)) return false;
  if ((prev.editingMessageId === prev.message.id) !== (next.editingMessageId === next.message.id)) return false;
  const prevFiles = prev.message.files;
  const nextFiles = next.message.files;
  if (prevFiles?.length !== nextFiles?.length) return false;
  if (prevFiles && nextFiles) {
    for (let i = 0; i < prevFiles.length; i++) {
      if (prevFiles[i] !== nextFiles[i]) return false;
    }
  }
  return true;
});

/* ---- 辅助：单次 AI 生成（用于重新生成场景） ---- */

async function generateSingleResponse(
  userPrompt: string,
  store: ReturnType<typeof useAppStore.getState>
): Promise<string | null> {

  const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
    const set = new Set<string>();
    [...(models || []), defaultModel].forEach(m => { const v = String(m || '').trim(); if (v) set.add(v); });
    return Array.from(set);
  };
  const hasCallable = (c: any) =>
    c.enabled !== false && Boolean(String(c.name || '').trim()) && Boolean(String(c.baseUrl || '').trim()) &&
    Boolean(String(c.apiKey || '').trim()) && normalizeSavedModels(c.models, c.defaultModel).length > 0;

  const allConfigs = [
    ...getCallableRecommendedConfigs(store.recommendedConfigs).filter(hasCallable).map(c => ({ ...c, models: normalizeSavedModels(c.models), _source: 'recommended' as const })),
    ...store.apiConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-chat' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'chat' as const })),
    ...store.imageAPIConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-generations' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'image' as const })),
    ...store.videoAPIConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-completions' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'video' as const })),
  ];

  const configId = store.generationParams?.selectedConfigId;
  const config = configId ? allConfigs.find(c => c.id === configId) : null;
  const model = config ? normalizeSavedModels(config.models, (config as any).defaultModel)[0] : '';

  if (!config || !model) return null;

  const win = window as any;
  if (!win?.yijingAPI) return null;

  const apiType = config.apiType;
  const isGrsai = apiType === 'openai-chat' || apiType === 'openai-generations' || apiType === 'openai-completions';

  if (isGrsai && win.yijingAPI.grsai) {
    if (apiType === 'openai-chat') {
      const result = await win.yijingAPI.grsai.chat({ baseUrl: config.baseUrl, apiKey: config.apiKey, model, messages: [{ role: 'user', content: userPrompt }] });
      if (result.ok && result.data?.choices?.[0]) return result.data.choices[0].message?.content || JSON.stringify(result.data);
      return result.data?.error?.message || 'API 请求失败';
    } else {
      const genResult = await win.yijingAPI.grsai.generate({
        baseUrl: config.baseUrl, apiKey: config.apiKey, model, prompt: userPrompt,
        aspectRatio: store.generationParams?.aspectRatio || undefined, aspect_ratio: store.generationParams?.aspectRatio || undefined,
        imageSize: apiType === 'openai-generations' ? (store.generationParams?.imageSize || undefined) : undefined,
        resolution: apiType === 'openai-completions' ? (store.generationParams?.resolution || undefined) : undefined,
        apiType,
      });
      if (genResult?.accepted && genResult.id) return '';
      if (genResult?.filePaths?.length > 0) return '';
      if (genResult?.ok && genResult.data?.images?.length > 0) return `[图片已生成]\n${genResult.data.images.map((img: any, i: number) => `${i+1}. ${img.url || img.b64_json || JSON.stringify(img)}`).join('\n')}`;
      if (genResult?.ok && genResult.data?.results?.length > 0) return `[已生成]\n${genResult.data.results.map((r: any, i: number) => `${i+1}. ${r.url || JSON.stringify(r)}`).join('\n')}`;
      return genResult?.data?.error?.message || '生成失败';
    }
  } else if (win.yijingAPI.openai) {
    const result = await win.yijingAPI.openai.chat({ baseUrl: config.baseUrl, apiKey: config.apiKey, model, messages: [{ role: 'user', content: userPrompt }] });
    if (result.ok && result.data?.choices?.[0]) return result.data.choices[0].message?.content || JSON.stringify(result.data);
    return result.error || 'OpenAI 请求失败';
  }
  return null;
}

/** 用于 handleEditSubmit 重新生成（直接在 store 上更新消息） */
async function regenerateForMessage(sessionId: string, prompt: string, assistantMsgId: string) {
  const store = useAppStore.getState();
  try {
    const content = await generateSingleResponse(prompt, store);
    if (content !== null) {
      store.updateMessage(sessionId, assistantMsgId, { content });
    }
  } catch (e) {
    store.updateMessage(sessionId, assistantMsgId, { content: `重新生成出错：${(e as Error).message}` });
  }
}

// ==================== 思考过程内容框组件 ====================

function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  
  // 截取前 100 个字符作为摘要
  const summary = content.length > 100 ? content.slice(0, 100) + '...' : content;
  
  return (
    <div className="thinking-block">
      <div 
        className="thinking-header" 
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px 8px 0 0', borderBottom: expanded ? '1px solid var(--border-color)' : 'none' }}
      >
        <span style={{ fontSize: 14, opacity: 0.8 }}>💭</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>思考过程</span>
        <ChevronDownIcon 
          size={14} 
          style={{ marginLeft: 'auto', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} 
        />
      </div>
      {expanded && (
        <div 
          className="thinking-content" 
          style={{ padding: '10px 12px', fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)', maxHeight: 300, overflowY: 'auto', background: 'var(--bg-tertiary)', borderRadius: '0 0 8px 8px' }}
        >
          <SafeMarkdown content={content} />
        </div>
      )}
      {!expanded && (
        <div 
          className="thinking-summary" 
          style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-tertiary)', borderRadius: '0 0 8px 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {summary}
        </div>
      )}
    </div>
  );
}
