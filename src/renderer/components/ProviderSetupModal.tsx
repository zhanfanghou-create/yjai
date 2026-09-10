import React, { useEffect, useState } from 'react';
import { ProviderPreset, findPresetByBase, classifyModel, featuredOf } from '../data/providerPresets';

// ─────────────────────────────────────────────
//  ProviderSetupModal — 弹窗引导式（傻瓜式）接入向导
//  步骤：① 填密钥 → ② 选精选模型/音色 → ③ 真实对话测试(仅对话) → 保存
//  所有申请地址一律用系统默认浏览器打开
// ─────────────────────────────────────────────

const openExternalUrl = (url: string) => {
  if (!url) return;
  const api = (window as any)?.yijingAPI?.system?.openExternal;
  if (typeof api === 'function') { void api(url); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
};

const CAP_LABEL: Record<string, string> = {
  chat: '对话模型', image: '图片', video: '视频', voice: '语音音色',
};
const CAP_SUB: Record<string, string> = {
  chat: '用于剧本分析、对话等文本推理，剧创工场分析走此接口',
  image: '用于生成角色/场景/道具等图片素材',
  video: '用于生成分镜/成片等视频素材',
  voice: '用于配音、音色合成',
};

interface ProviderSetupModalProps {
  preset: ProviderPreset;
  capability: 'chat' | 'image' | 'video' | 'voice';
  onClose: () => void;
  onDone: (key: string) => void;
  s: any;
}

export const ProviderSetupModal: React.FC<ProviderSetupModalProps> = ({ preset, capability, onClose, onDone, s }) => {
  const isChat = capability === 'chat';
  const isVoice = capability === 'voice';
  const voiceList = preset.speech?.voices || [];

  const baseUrl = isVoice
    ? (preset.speech?.baseUrl || preset.chatBaseUrl)
    : capability === 'image'
      ? (preset.imageBaseUrl || preset.chatBaseUrl)
      : capability === 'video'
        ? (preset.videoBaseUrl || preset.chatBaseUrl)
        : preset.chatBaseUrl;
  const applyUrl = isVoice ? (preset.speech?.applyUrl || preset.chatApplyUrl) : preset.chatApplyUrl;
  const applyLabel = isVoice ? (preset.speech?.applyLabel || preset.chatApplyLabel) : preset.chatApplyLabel;

  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [selected, setSelected] = useState(
    capability === 'chat' ? (preset.defaultModel || '')
      : capability === 'image' ? (preset.imageDefaultModel || '')
        : capability === 'video' ? (preset.videoDefaultModel || '')
          : (preset.speech?.defaultModel || (voiceList[0]?.id || ''))
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const voiceName = (id: string) => voiceList.find(v => v.id === id)?.name || '';

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 进入「选择模型」步自动拉取（语音用官方音色清单，不拉取）
  useEffect(() => {
    if (step !== 2 || isVoice || models.length) return;
    void fetchModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const fetchModels = async () => {
    if (!apiKey.trim()) return;
    setFetching(true);
    setFetchError('');
    try {
      const win = window as any;
      let list: string[] = [];
      if (win?.yijingAPI?.grsai?.refreshModels) {
        const res = await win.yijingAPI.grsai.refreshModels({ baseUrl, apiKey, apiType: 'openai-chat' });
        if (Array.isArray(res?.models)) list = res.models.map(String);
      }
      if (!list.length) {
        const resp = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
        const data = await resp.json();
        list = Array.isArray(data?.data) ? data.data.map((m: any) => m.id || m.name).filter(Boolean) : [];
      }
      const preset2 = findPresetByBase(baseUrl);
      // 按类型过滤：只保留本能力对应的模型
      const want: 'chat' | 'image' | 'video' = capability === 'image' ? 'image' : capability === 'video' ? 'video' : 'chat';
      list = list.filter(m => classifyModel(String(m), preset2) === want);
      // 精选模型：只显示「精选 ∩ 账号可用」，拉不到就回退精选清单
      const feat = featuredOf(preset2, want);
      if (feat.length) {
        const avail = list.filter(m => feat.includes(String(m)));
        list = avail.length ? avail : feat;
      }
      setModels(Array.from(new Set(list)));
      if (list.length && !list.includes(selected)) setSelected(String(list[0]));
      if (!list.length && !fetchError) setFetchError('未能获取到可用模型，可先手动选择上方精选模型');
    } catch (e: any) {
      setFetchError(e?.message || String(e));
    } finally {
      setFetching(false);
    }
  };

  // 真实对话测试：验证 Key + 地址 + 模型三者可用（防「配置了却分析不出剧本」）
  const handleTest = async () => {
    setTesting(true);
    setTestResult('idle');
    setTestMsg('');
    try {
      const win = window as any;
      const r = await win.yijingAPI.grsai.chat({
        baseUrl,
        apiKey,
        model: selected,
        messages: [{ role: 'user', content: '你好，请只回复“OK”两个字。' }],
      });
      const content = r?.data?.choices?.[0]?.message?.content;
      if (r?.ok && content) {
        setTestResult('ok');
        setTestMsg(`连接成功，模型可用（回复：${String(content).slice(0, 40)}）`);
      } else {
        setTestResult('err');
        setTestMsg(r?.data?.error?.message || r?.error || r?.msg || JSON.stringify(r?.data || {}).slice(0, 300));
      }
    } catch (e: any) {
      setTestResult('err');
      setTestMsg(e?.message || String(e));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const common = { baseUrl, apiKey, enabled: true, connected: false };
      if (isVoice) {
        const cid = s.addVoiceAPIConfig({
          ...common, name: `${preset.label} 语音`, provider: 'openai',
          defaultModel: selected, models: voiceList.map(v => v.id),
        });
        s.updateVoiceAPIConfig(cid, { models: voiceList.map(v => v.id) });
      } else if (capability === 'image') {
        const cid = s.addImageAPIConfig({
          ...common, name: `${preset.label} 图片`, provider: 'openai',
          defaultModel: selected, models,
        });
        s.updateImageAPIConfig(cid, { models });
      } else if (capability === 'video') {
        const cid = s.addVideoAPIConfig({
          ...common, name: `${preset.label} 视频`, provider: 'openai',
          defaultModel: selected, models,
        });
        s.updateVideoAPIConfig(cid, { models });
      } else {
        const cid = s.addAPIConfig({
          ...common, name: `${preset.label} 对话`, provider: 'openai',
          defaultModel: selected, models,
        });
        s.updateAPIConfig(cid, { models });
      }
      onDone(`${capability}-${preset.key}`);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canNext = apiKey.trim().length > 0;
  const canFinish = !!selected;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sp-wizard" onClick={e => e.stopPropagation()} style={{ animation: 'slideInUp 0.25s ease-out' }}>
        {/* 头部 */}
        <div className="sp-wizard-head">
          <div className="sp-wizard-title">
            <span className="sp-provider-icon" style={{ background: preset.color }}>{preset.icon}</span>
            <div>
              <div className="sp-wizard-name">接入 {preset.label} · {CAP_LABEL[capability]}</div>
              <div className="sp-wizard-sub">{CAP_SUB[capability]}</div>
            </div>
          </div>
          <button className="sp-wizard-close" onClick={onClose} title="关闭">✕</button>
        </div>

        {/* 步骤条 */}
        <div className="sp-wizard-steps">
          {(['密钥', '选择模型', '测试'] as const).slice(0, isChat ? 3 : 2).map((t, i) => (
            <div key={t} className={`sp-wizard-step${step === i + 1 ? ' active' : ''}${step > i + 1 ? ' done' : ''}`}>
              <span className="sp-wizard-step-no">{step > i + 1 ? '✓' : i + 1}</span>
              <span className="sp-wizard-step-txt">{t}</span>
            </div>
          ))}
        </div>

        {/* ── 第 1 步：密钥 ── */}
        {step === 1 && (
          <div className="sp-wizard-body">
            <div className="sp-f">
              <label className="sp-lb">官方接口地址（已自动填入）</label>
              <div className="sp-wizard-base">
                <span>{baseUrl}</span>
                <button className="sp-mini-btn" onClick={() => { void navigator.clipboard?.writeText(baseUrl); }}>复制</button>
              </div>
            </div>
            <div className="sp-f">
              <label className="sp-lb">API Key</label>
              <div className="sp-wizard-key">
                <input
                  className="sp-inp"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="粘贴你的 API Key"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button className="sp-mini-btn" onClick={() => setShowKey(v => !v)}>{showKey ? '隐藏' : '显示'}</button>
              </div>
              <a className="sp-apply-link" href={applyUrl} target="_blank" rel="noreferrer"
                 onClick={e => { e.preventDefault(); openExternalUrl(applyUrl); }}>
                {applyLabel} ↗
              </a>
            </div>
            {!canNext && <div className="sp-hint">填写 API Key 后可继续；没有 Key 请先点击上方申请链接免费创建</div>}
          </div>
        )}

        {/* ── 第 2 步：选择模型 / 音色 ── */}
        {step === 2 && (
          <div className="sp-wizard-body">
            {isVoice ? (
              <>
                <div className="sp-hint" style={{ marginBottom: 10 }}>已加载官方音色清单（{voiceList.length} 个），无需选择默认音色，生成时在配音处选择使用：</div>
                <div className="sp-wizard-voices">
                  {voiceList.map(v => (
                    <span key={v.id} className="sp-voice-chip" title={`${v.id} — ${v.name}`}>{v.name}（{v.id}）</span>
                  ))}
                </div>
                {preset.speech?.note && <div className="sp-hint" style={{ marginTop: 8 }}>{preset.speech.note}</div>}
              </>
            ) : (
              <>
                {fetching && <div className="sp-hint">正在拉取该账号可用的精选模型…</div>}
                {fetchError && models.length === 0 && <div className="sp-wizard-err">{fetchError}</div>}
                {models.length > 0 && (
                  <>
                    <div className="sp-hint" style={{ marginBottom: 10 }}>以下为该平台精选模型，点击选中：</div>
                    <div className="sp-wizard-models">
                      {models.map(m => (
                        <button
                          key={m}
                          className={`sp-tag${selected === m ? ' sp-tag-active' : ''}`}
                          onClick={() => setSelected(m)}
                        >{m}</button>
                      ))}
                    </div>
                  </>
                )}
                {models.length === 0 && !fetching && (
                  <div className="sp-hint">拉取失败，可返回第 1 步检查 API Key，或点「重试」：</div>
                )}
                <div className="sp-wizard-actions2">
                  <button className="sp-mini-btn" onClick={() => void fetchModels()} disabled={fetching}>
                    {fetching ? '拉取中…' : '↻ 重新拉取模型'}
                  </button>
                  {preset.modelPlazaUrl && (
                    <a className="sp-apply-link" style={{ marginLeft: 10 }} href={preset.modelPlazaUrl} target="_blank" rel="noreferrer"
                       onClick={e => { e.preventDefault(); openExternalUrl(preset.modelPlazaUrl!); }}>
                      {preset.modelPlazaLabel || '查看该平台精选模型'} ↗
                    </a>
                  )}
                </div>
                <div className="sp-f" style={{ marginTop: 12 }}>
                  <label className="sp-lb">或自定义输入模型名（OpenAI 兼容接口拉取不到时使用）</label>
                  <input
                    className="sp-inp"
                    value={selected}
                    onChange={e => setSelected(e.target.value)}
                    placeholder="手动输入模型 ID，如 deepseek-chat"
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 第 3 步：测试（仅对话） ── */}
        {step === 3 && (
          <div className="sp-wizard-body">
            <div className="sp-wizard-summary">
              <div><span>平台</span><b>{preset.label}</b></div>
              <div><span>接口</span><b>{baseUrl}</b></div>
              <div><span>模型</span><b>{selected}</b></div>
            </div>
            <div className="sp-f" style={{ marginTop: 12 }}>
              <button className="sp-btn sp-test" onClick={() => void handleTest()} disabled={testing}>
                {testing ? '测试中…' : testResult === 'ok' ? '✓ 连接成功' : testResult === 'err' ? '✗ 连接失败' : '测试连接'}
              </button>
            </div>
            {testMsg && (
              <div className={`sp-wizard-msg ${testResult === 'ok' ? 'ok' : 'err'}`}>{testMsg}</div>
            )}
            <div className="sp-hint" style={{ marginTop: 8 }}>测试通过 = 该模型可正常推理，剧创工场剧本分析即可完整跑通</div>
          </div>
        )}

        {/* 底部按钮 */}
        <div className="sp-wizard-foot">
          {step > 1 && <button className="sp-btn sp-cancel" onClick={() => setStep(step - 1)}>上一步</button>}
          <div style={{ flex: 1 }} />
          {step < (isChat ? 3 : 2) && (
            <button className="sp-btn sp-save" disabled={!canNext} onClick={() => { setStep(step + 1); }}>
              下一步
            </button>
          )}
          {step === (isChat ? 3 : 2) && (
            <button className="sp-btn sp-save" disabled={!canFinish || (isChat && testResult !== 'ok')} onClick={() => void handleSave()}>
              {saving ? '保存中…' : '保存配置'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
