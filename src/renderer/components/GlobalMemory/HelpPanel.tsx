/**
 * 帮助对话面板 (Help Panel)
 * - AI 自动回答用户关于软件功能、操作的问题
 * - 顶部建议问题，底部输入框
 * - 基于 grsai.chat API
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { BotIcon, UserIcon, SparklesIcon } from './Icons';

interface HelpMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const HELP_SYSTEM_PROMPT = `你是"艺镜AI"影视创作软件的内置助手。你的职责是回答用户关于软件功能、操作流程、问题排查的疑问。

## 软件核心功能

1. **首页（Home）**：仪表盘，项目总览，记忆库入口
2. **画布（Canvas）**：可视化节点编辑器，支持视频/图片/文本节点的连线、运镜配置、AI 生成
3. **剧创（Drama）**：5-6 步 AI 协同创作流程
   - 导演阐述：填写创作意图和情绪目标
   - 故事创作：AI 生成故事大纲
   - 剧本写作：AI 撰写分集剧本
   - 分镜设计：AI 设计镜头脚本
   - 视觉资产：AI 生成视觉素材
   - 提示词生成：AI 输出文生视频/文生图提示词
4. **提示词库（Prompt Library）**：管理和复用提示词模板
5. **资产（Assets）**：管理生成的图片、视频、音频
6. **工具（Tools）**：单点 AI 工具（文生图、文生视频、图生视频等）
7. **设置（Settings）**：API 配置、模型选择、主题切换

## 关键技术细节

- **多步续传**：AI 回答被 token 限制截断时会自动续传最多 5 次
- **记忆库**：全局自动记录页面访问、内容创作、对话历史
- **API 配置**：在"设置 → API 配置"中管理多个 provider（OpenAI、火山方舟等）
- **导演审核**：剧创每步完成后可点击"提交导演审核"让 AI 复审并提出修改意见
- **Ctrl+M 唤起记忆库**（已改为悬浮胶囊入口）

## 回答规范

- 用中文回答，简明扼要，分步骤说明操作时用数字列表
- 不要假装你知道未知功能；不确定时引导用户去"设置"或查看具体模块
- 涉及具体按钮/菜单时用引号标出（如"提交导演审核"按钮）
- 如果问题超出软件范畴，礼貌引导回软件功能`;

const SUGGESTED_QUESTIONS = [
  '剧创的 5 步流程分别是什么？',
  '如何在画布中添加视频节点？',
  'AI 回复被截断怎么办？',
  '怎么配置 API Key？',
  '记忆库怎么用？',
  '导演审核是什么功能？',
];

interface HelpPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpPanel: React.FC<HelpPanelProps> = ({ isOpen, onClose }) => {
  const apiConfigs = useAppStore(s => s.apiConfigs);
  const dramaApiConfigId = useAppStore(s => s.dramaApiConfigId);
  const dramaModel = useAppStore(s => s.dramaModel);

  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 滚到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 打开时聚焦 + 显示欢迎语
  useEffect(() => {
    if (isOpen && !hasGreeted) {
      const greeting: HelpMessage = {
        id: `greet-${Date.now()}`,
        role: 'assistant',
        content: '你好！我是艺镜AI 的内置助手 🤖\n\n我可以帮你解答软件功能、操作流程、问题排查等问题。\n\n你可以点击下方"建议问题"快速了解，也可以直接输入你的问题。',
        timestamp: Date.now(),
      };
      setMessages([greeting]);
      setHasGreeted(true);
    }
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [isOpen, hasGreeted]);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const callAI = useCallback(async (userText: string) => {
    const config = apiConfigs.find(c => c.id === dramaApiConfigId) || apiConfigs[0];
    if (!config?.baseUrl) {
      const errMsg: HelpMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ 未配置 API。\n\n请先到「设置 → API 配置」中添加 API Key（推荐火山方舟 ark-code-latest）。',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
      return;
    }

    const win = window as any;
    if (!win?.yijingAPI?.grsai?.chat) {
      const errMsg: HelpMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: '⚠️ 聊天 API 不可用，请重启应用。',
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
      return;
    }

    // 构造消息历史（只发 user/assistant role）
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-10)  // 限制最近 10 轮避免超 token
      .map(m => ({ role: m.role, content: m.content }));

    const apiMessages = [
      { role: 'system', content: HELP_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: userText },
    ];

    // 5 次续传循环（与剧创模块相同）
    const MAX_RETRIES = 5;
    let allContent = '';
    let attempt = 0;
    let finishReason = '';
    let lastError = '';

    while (attempt < MAX_RETRIES) {
      attempt++;
      try {
        const result = await win.yijingAPI.grsai.chat({
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
          model: dramaModel || 'ark-code-latest',
          messages: apiMessages,
          stream: false,
        });

        if (!result?.ok) {
          lastError = result?.error || 'API 返回失败';
          break;
        }

        const msg = result.data?.choices?.[0]?.message;
        const content = msg?.content || msg?.reasoning_content || result.data?.content || '';
        finishReason = result.data?.choices?.[0]?.finish_reason || '';

        if (content) {
          allContent += content;
        }

        // 不再截断就退出
        if (finishReason !== 'length') break;

        // 截断：把已获取内容作为 assistant 消息追加，引导续传
        apiMessages.push({ role: 'assistant', content });
        apiMessages.push({ role: 'user', content: '请继续完成上面的回答，不要重复已说过的内容。' });
      } catch (e: any) {
        lastError = e?.message || '请求失败';
        break;
      }
    }

    if (allContent) {
      const aiMsg: HelpMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: allContent,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } else {
      const errMsg: HelpMessage = {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: `❌ AI 暂无回应${lastError ? `（${lastError}）` : ''}。\n\n可能原因：\n• API Key 失效或余额不足\n• 网络问题\n• 模型繁忙，请稍后重试`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    }
  }, [apiConfigs, dramaApiConfigId, dramaModel, messages]);

  // 发送
  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg: HelpMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    callAI(text).finally(() => setIsLoading(false));
  }, [input, isLoading, callAI]);

  // 点击建议问题
  const handleSuggested = useCallback((q: string) => {
    if (isLoading) return;
    const userMsg: HelpMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    callAI(q).finally(() => setIsLoading(false));
  }, [isLoading, callAI]);

  // 文本框回车发送（Shift+Enter 换行）
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 560,
          maxWidth: '92vw',
          height: 680,
          maxHeight: '85vh',
          background: 'var(--bg-primary, #14141a)',
          border: '1px solid var(--border-color, #2a2a30)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部标题栏 */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color, #2a2a30)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary, #1f1f23)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                color: '#fff',
              }}
            >
              <BotIcon size={18} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #fff)' }}>
                艺镜AI 助手
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #6a6a72)' }}>
                解答软件功能 · 操作问题
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #a0a0aa)',
              cursor: 'pointer',
              fontSize: 18,
              borderRadius: 6,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--bg-tertiary, #2a2a30)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* 消息区 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {messages.map(msg => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                gap: 10,
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  color: '#fff',
                }}
              >
                {msg.role === 'user' ? <UserIcon size={14} /> : <BotIcon size={16} />}
              </div>
              <div
                style={{
                  maxWidth: '78%',
                  padding: '10px 14px',
                  background: msg.role === 'user'
                    ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'
                    : 'var(--bg-secondary, #1f1f23)',
                  color: 'var(--text-primary, #fff)',
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* 加载中 */}
          {isLoading && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  flexShrink: 0,
                  color: '#fff',
                }}
              >
                <SparklesIcon size={14} />
              </div>
              <div
                style={{
                  padding: '12px 18px',
                  background: 'var(--bg-secondary, #1f1f23)',
                  borderRadius: 10,
                  fontSize: 13,
                  color: 'var(--text-muted, #6a6a72)',
                  display: 'flex',
                  gap: 4,
                }}
              >
                <span style={{ animation: 'dot-flashing 1.4s infinite linear', animationDelay: '0s' }}>·</span>
                <span style={{ animation: 'dot-flashing 1.4s infinite linear', animationDelay: '0.2s' }}>·</span>
                <span style={{ animation: 'dot-flashing 1.4s infinite linear', animationDelay: '0.4s' }}>·</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* 建议问题（仅在没消息或只有欢迎语时显示） */}
        {messages.length <= 1 && !isLoading && (
          <div
            style={{
              padding: '0 16px 12px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            {SUGGESTED_QUESTIONS.map((q, i) => (
              <button
                key={i}
                onClick={() => handleSuggested(q)}
                style={{
                  padding: '6px 12px',
                  background: 'var(--bg-secondary, #1f1f23)',
                  border: '1px solid var(--border-color, #2a2a30)',
                  borderRadius: 14,
                  fontSize: 12,
                  color: 'var(--text-secondary, #a0a0aa)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-color, #6366f1)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--accent-color, #6366f1)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-color, #2a2a30)';
                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary, #a0a0aa)';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div
          style={{
            padding: 12,
            borderTop: '1px solid var(--border-color, #2a2a30)',
            background: 'var(--bg-secondary, #1f1f23)',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
            rows={1}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'var(--bg-primary, #14141a)',
              border: '1px solid var(--border-color, #2a2a30)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text-primary, #fff)',
              outline: 'none',
              resize: 'none',
              minHeight: 38,
              maxHeight: 120,
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent-color, #6366f1)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border-color, #2a2a30)'; }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            style={{
              padding: '10px 18px',
              background: !input.trim() || isLoading
                ? 'var(--bg-tertiary, #2a2a30)'
                : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: !input.trim() || isLoading
                ? 'var(--text-muted, #6a6a72)'
                : '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: !input.trim() || isLoading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            发送
          </button>
        </div>
      </div>

      {/* 加载动画 CSS */}
      <style>{`
        @keyframes dot-flashing {
          0%, 60%, 100% { opacity: 0.2; }
          30% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default HelpPanel;
