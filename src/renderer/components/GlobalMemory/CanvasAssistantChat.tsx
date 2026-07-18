/**
 * 画布助手对话面板（猫头鹰在无限画布页点击后弹出）
 * - 复用用户已配置的对话模型，把自然语言翻译成画布操作指令并执行
 * - 支持语音输入（Web Speech API，可用时）
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { askCanvasAssistant, runAssistantActions, speakAssistantReply, EDGE_TTS_VOICES, ChatTurn } from '../../services/canvasAssistant';
import { useAppStore } from '../../store/appStore';

interface Msg { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean; }

interface Props {
  onClose: () => void;
  anchor: { top: number; left: number };
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const CanvasAssistantChat: React.FC<Props> = ({ onClose, anchor }) => {
  const [messages, setMessages] = useState<Msg[]>([
    { id: uid(), role: 'assistant', content: '你好，我是艺镜AI助手🦉。告诉我你想在画布上做什么，例如"画一张赛博朋克城市夜景"或"把刚才的图生成视频"，我来帮你搭建节点。' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const assistantSettings = useAppStore(s => s.assistantSettings);
  const updateAssistantSettings = useAppStore(s => s.updateAssistantSettings);
  const voiceAPIConfigs = useAppStore(s => s.voiceAPIConfigs || []);
  const listRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const history = useCallback((): ChatTurn[] => messages
    .filter(m => !m.pending)
    .map(m => ({ role: m.role, content: m.content })), [messages]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Msg = { id: uid(), role: 'user', content: trimmed };
    const pendingMsg: Msg = { id: uid(), role: 'assistant', content: '思考中…', pending: true };
    const priorHistory = history();
    setMessages(prev => [...prev, userMsg, pendingMsg]);
    setInput('');
    setBusy(true);
    try {
      const res = await askCanvasAssistant(trimmed, priorHistory);
      let reply = res.reply;
      if (res.actions && res.actions.length) {
        const summary = await runAssistantActions(res.actions);
        if (summary.length) reply += '\n\n· ' + summary.join('\n· ');
      }
      setMessages(prev => prev.map(m => m.id === pendingMsg.id ? { ...m, content: reply, pending: false } : m));
      if (useAppStore.getState().assistantSettings?.speakReplies) void speakAssistantReply(res.reply);
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === pendingMsg.id ? { ...m, content: '出错了：' + (e?.message || String(e)), pending: false } : m));
    } finally {
      setBusy(false);
    }
  }, [busy, history]);

  // 语音输入：优先使用浏览器/Electron 内置的 Web Speech API
  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setMessages(prev => [...prev, { id: uid(), role: 'assistant', content: '当前环境不支持内置语音识别。你可以直接打字，或在设置中接入语音转文字 API。' }]);
      return;
    }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = 'zh-CN';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev: any) => {
      const transcript = ev.results?.[0]?.[0]?.transcript || '';
      if (transcript) setInput(prev => (prev ? prev + ' ' : '') + transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, [listening]);

  const selStyle: React.CSSProperties = { background: 'var(--bg-secondary, #1e1e26)', color: 'var(--text-primary, #fff)', border: '1px solid var(--border-color, #2a2a30)', borderRadius: 6, fontSize: 12, padding: '3px 6px', maxWidth: 180 };
  const PANEL_W = 340;
  const PANEL_H = 460;
  let top = anchor.top - PANEL_H - 12;
  if (top < 12) top = 12;
  let left = anchor.left + 72 - PANEL_W;
  if (left < 12) left = 12;
  if (left + PANEL_W > window.innerWidth - 12) left = window.innerWidth - PANEL_W - 12;

  return (
    <div
      className="owl-chat-panel"
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'fixed', top, left, width: PANEL_W, height: PANEL_H,
        background: 'var(--bg-primary, #14141a)', border: '1px solid var(--border-color, #2a2a30)',
        borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', zIndex: 10000,
        display: 'flex', flexDirection: 'column', overflow: 'hidden', color: 'var(--text-primary, #fff)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border-color, #2a2a30)' }}>
        <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>🦉 艺镜AI 助手</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span onClick={() => setSettingsOpen(v => !v)} style={{ cursor: 'pointer', color: settingsOpen ? 'var(--accent-color, #6366f1)' : 'var(--text-secondary, #a0a0aa)', fontSize: 14, lineHeight: 1 }} title="助手设置">⚙</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-secondary, #a0a0aa)', fontSize: 16, lineHeight: 1 }} title="关闭">×</span>
        </span>
      </div>

      {settingsOpen && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-color, #2a2a30)', fontSize: 12, color: 'var(--text-secondary, #a0a0aa)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>朗读回复</span>
            <input type="checkbox" checked={!!assistantSettings?.speakReplies} onChange={e => updateAssistantSettings({ speakReplies: e.target.checked })} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>语音来源</span>
            <select value={assistantSettings?.voiceSource || 'edge-tts'} onChange={e => updateAssistantSettings({ voiceSource: e.target.value as any })} style={selStyle}>
              <option value="edge-tts">内置 Edge-TTS</option>
              <option value="api">语音 API 配置</option>
            </select>
          </label>
          {assistantSettings?.voiceSource === 'api' ? (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span>语音接口</span>
              <select value={assistantSettings?.voiceConfigId || ''} onChange={e => updateAssistantSettings({ voiceConfigId: e.target.value, voiceModel: undefined })} style={selStyle}>
                <option value="">选择接口</option>
                {voiceAPIConfigs.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </label>
          ) : null}
          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>音色/模型</span>
            <select value={assistantSettings?.voiceModel || ''} onChange={e => updateAssistantSettings({ voiceModel: e.target.value })} style={selStyle}>
              <option value="">默认</option>
              {(assistantSettings?.voiceSource === 'api'
                ? (voiceAPIConfigs.find(c => c.id === assistantSettings?.voiceConfigId)?.models || [])
                : EDGE_TTS_VOICES).map(m => (<option key={m} value={m}>{m}</option>))}
            </select>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => { void speakAssistantReply('你好，我是艺镜AI助手，这是一次朗读测试。'); }}
                        style={{ padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border-color, #2a2a30)', background: 'transparent', color: 'var(--text-secondary, #a0a0aa)', fontSize: 12 }}
                        title="发起一次测试朗读，验证 TTS 是否可用"
                      >测试朗读</button>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>新建节点后端</span>
            <select value={assistantSettings?.nodeBackend || 'ask'} onChange={e => updateAssistantSettings({ nodeBackend: e.target.value as any })} style={selStyle}>
              <option value="ask">每次询问</option>
              <option value="comfyui">优先 ComfyUI</option>
              <option value="api">优先 API 模型</option>
            </select>
          </label>
        </div>
      )}

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(m => (
          <div key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
            <div style={{
              padding: '8px 11px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: m.role === 'user' ? 'var(--accent-color, #6366f1)' : 'var(--bg-secondary, #1e1e26)',
              color: m.role === 'user' ? '#fff' : 'var(--text-primary, #fff)',
              opacity: m.pending ? 0.6 : 1,
            }}>{m.content}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-color, #2a2a30)', display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <button
          onClick={toggleVoice}
          title={listening ? '停止录音' : '语音输入'}
          style={{
            flex: '0 0 auto', width: 34, height: 34, borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--border-color, #2a2a30)',
            background: listening ? 'var(--accent-color, #6366f1)' : 'transparent',
            color: listening ? '#fff' : 'var(--text-secondary, #a0a0aa)', fontSize: 15,
          }}
        >{listening ? '■' : '🎤'}</button>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder={busy ? '正在处理…' : '描述你想生成的内容，回车发送'}
          rows={1}
          disabled={busy}
          style={{
            flex: 1, resize: 'none', maxHeight: 96, minHeight: 34, padding: '8px 10px', borderRadius: 8,
            border: '1px solid var(--border-color, #2a2a30)', background: 'var(--bg-secondary, #1e1e26)',
            color: 'var(--text-primary, #fff)', fontSize: 12.5, lineHeight: 1.5, outline: 'none',
          }}
        />
        <button
          onClick={() => send(input)}
          disabled={busy || !input.trim()}
          style={{
            flex: '0 0 auto', height: 34, padding: '0 14px', borderRadius: 8, border: 'none', cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
            background: 'var(--accent-color, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 600, opacity: busy || !input.trim() ? 0.5 : 1,
          }}
        >发送</button>
      </div>
    </div>
  );
};

export default CanvasAssistantChat;
