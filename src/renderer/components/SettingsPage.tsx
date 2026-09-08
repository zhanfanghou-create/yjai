import React, { useEffect, useRef, useState } from 'react';
import { EDGE_TTS_MODELS, useAppStore, StockMediaProvider } from '../store/appStore';
import { PROVIDER_PRESETS, classifyModel, findPresetByBase, featuredOf } from '../data/providerPresets';
import { ProviderSetupModal } from './ProviderSetupModal';
import './SettingsPage.css';

// 用系统默认浏览器打开外部网址（申请 API 等链接），避免在应用内窗口打开；无 IPC 时回退到 window.open
const openExternalUrl = (url: string) => {
  if (!url) return;
  const api = (window as any)?.yijingAPI?.system?.openExternal;
  if (typeof api === 'function') { void api(url); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
};

// ─────────────────────────────────────────────
//  SVG Icon 组件
// ─────────────────────────────────────────────
const Icon = ({ type = 'box', size = 18, className = '' }: {
  type?: 'box' | 'chat' | 'image' | 'video' | 'voice' | 'cpu' | 'file' | 'close' | 'plus' | 'upload' | 'check' | 'x';
  size?: number;
  className?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {type === 'chat'      ? <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /> :
     type === 'image'     ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></> :
     type === 'video'     ? <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l4-3v12l-4-3" /></> :
     type === 'voice'     ? <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></> :
     type === 'cpu'       ? <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></> :
     type === 'file'      ? <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></> :
     type === 'close'    ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
     type === 'x'        ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
     type === 'check'    ? <polyline points="20,6 9,17 4,12" /> :
     type === 'upload'   ? <><polyline points="16,16 12,12 8,16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></> :
     type === 'plus'     ? <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></> :
     <path d="M12 5v14M5 12h14" />}
  </svg>
);

// ─────────────────────────────────────────────
//  Section 包装组件
// ─────────────────────────────────────────────
const Section = ({ title, sub, icon, onAdd, addLabel, children }: any) => (
  <section className="sp-sec">
    <div className="sp-sec-head">
      <div className="sp-sec-ic">{icon}</div>
      <div>
        <h2 className="sp-sec-t">{title}</h2>
        <p className="sp-sec-s">{sub}</p>
      </div>
      {onAdd && (
        <button className="sp-add" onClick={onAdd}>
          <Icon size={14} type="plus" />
          {addLabel}
        </button>
      )}
    </div>
    <div className="sp-cards">{children}</div>
  </section>
);

// ─────────────────────────────────────────────
//  模型服务一键接入 — 预设火山引擎 / 千问 / 通用 OpenAI 等平台
//  点击自动填入官方接口地址，填好 API Key 后自动拉取可用模型；
//  语音接口独立配置，自动填入官方音色清单。
// ─────────────────────────────────────────────
const scrollToSection = (sec: string) => {
  setTimeout(() => {
    document.querySelector(`[data-section="${sec}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
};

const ProviderSetupSection: React.FC<{ s: any }> = ({ s }) => {
  const [done, setDone] = React.useState<string[]>([]);
  const mark = (key: string) => {
    setDone(prev => [...prev, key]);
    setTimeout(() => setDone(prev => prev.filter(x => x !== key)), 2500);
  };

  const [wizard, setWizard] = React.useState<null | { preset: typeof PROVIDER_PRESETS[0]; capability: 'chat' | 'image' | 'video' | 'voice' }>(null);
  const openWizard = (p: typeof PROVIDER_PRESETS[0], capability: 'chat' | 'image' | 'video' | 'voice') => setWizard({ preset: p, capability });
  const onWizardDone = (key: string) => {
    mark(key);
    if (key.startsWith('chat-')) scrollToSection('chat-api');
    else if (key.startsWith('image-')) scrollToSection('image-api');
    else if (key.startsWith('video-')) scrollToSection('video-api');
    else if (key.startsWith('voice-')) scrollToSection('voice-api');
  };





  return (
    <div className="sp-quick">
      <div className="sp-quick-head">
        <span className="sp-quick-title">模型服务一键接入</span>
        <span className="sp-quick-sub">弹窗引导 · 填 Key → 选精选模型 → 测试通过即保存</span>
      </div>
      <div className="sp-quick-grid">
        {PROVIDER_PRESETS.map(p => {
          const doneChat = done.includes('chat-' + p.key);
          const doneSpeech = done.includes('voice-' + p.key);
          const doneImage = done.includes('image-' + p.key);
          const doneVideo = done.includes('video-' + p.key);
          // 固定 2x2 能力位：不支持的能力保留空位，保证所有卡片等高校对齐
          const capCells: { cap: 'chat' | 'image' | 'video' | 'voice'; label: string; ok: boolean; done: boolean }[] = [
            { cap: 'chat',  label: '对话模型', ok: true,             done: doneChat },
            { cap: 'image', label: '图片模型', ok: !!p.imageBaseUrl, done: doneImage },
            { cap: 'video', label: '视频模型', ok: !!p.videoBaseUrl, done: doneVideo },
            { cap: 'voice', label: '语音音色', ok: !!p.speech,       done: doneSpeech },
          ];
          return (
            <div
              key={p.key}
              className={`sp-provider-card${doneChat || doneSpeech || doneImage || doneVideo ? ' sp-provider-added' : ''}`}
              style={{ '--preset-color': p.color } as any}
            >
              <div className="sp-provider-top">
                <span className="sp-provider-icon">{p.icon}</span>
                <span className="sp-provider-label">{p.label}</span>
                <a className="sp-provider-apply" href={p.chatApplyUrl} target="_blank" rel="noreferrer"
                   onClick={e => { e.preventDefault(); openExternalUrl(p.chatApplyUrl); }}>申请 API Key ↗</a>
                {p.modelPlazaUrl && (
                  <a className="sp-provider-apply" href={p.modelPlazaUrl} target="_blank" rel="noreferrer"
                     onClick={e => { e.preventDefault(); openExternalUrl(p.modelPlazaUrl!); }}>精选模型 ↗</a>
                )}
              </div>
              <div className="sp-provider-desc" title={p.desc}>{p.desc}</div>
              <div className="sp-provider-actions">
                {capCells.map(c => c.ok ? (
                  <button key={c.cap} className={`sp-provider-btn${c.cap === 'voice' ? ' sp-provider-voice' : ''}`}
                          onClick={() => openWizard(p, c.cap)} disabled={c.done}>
                    {c.done ? '✓ 已接入' : `接入${c.label}`}
                  </button>
                ) : (
                  <span key={c.cap} className="sp-provider-slot" />
                ))}
              </div>
              <div className="sp-provider-foot">
                {p.speech && <span className="sp-provider-note" title={p.speech.baseUrl}>语音接口独立：{p.speech.baseUrl}</span>}
                {p.needsAccessKey && (
                  <a className="sp-provider-ak" href={p.akskApplyUrl || p.chatApplyUrl} target="_blank" rel="noreferrer"
                     onClick={e => { e.preventDefault(); openExternalUrl(p.akskApplyUrl || p.chatApplyUrl || ''); }}>
                    {p.akskApplyLabel || '创建 AK/SK'} ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {wizard && (
        <ProviderSetupModal
          preset={wizard.preset}
          capability={wizard.capability}
          s={s}
          onClose={() => setWizard(null)}
          onDone={onWizardDone}
        />
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
//  Plus 图标（新增进 Section icon 列表）
// ─────────────────────────────────────────────
const PlusIcon = ({ size = 14 }: { size?: number }) => (
  <Icon type="box" size={size} />
);

// ─────────────────────────────────────────────
//  ConfigCard — 标准 API 配置卡片（草稿模式）
//  所有编辑都在本地 ref，保存时才落 store
// ─────────────────────────────────────────────
interface ConfigCardProps {
  config: any;
  onUpdate: (id: string, u: any) => void;
  onDelete: (id: string) => void;
  onTest:  (id: string) => Promise<boolean>;
  defaultName: string;
  showAccessKey?: boolean;
  kind?: 'chat' | 'image' | 'video' | 'voice' | 'music';
  onFetchModels?: (id: string, overrides?: { baseUrl?: string; apiKey?: string }, kind?: string) => Promise<{ ok: boolean; models?: string[]; error?: string }>;
}

export const ConfigCard = React.memo(({ config, onUpdate, onDelete, onTest, defaultName, showAccessKey, kind = 'chat', onFetchModels }: ConfigCardProps) => {
  // ── 草稿值（ref 存原始值，state 驱动 UI）─────────────
  const draftRef = useRef({ name: config.name, baseUrl: config.baseUrl, apiKey: config.apiKey, defaultModel: config.defaultModel, accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret });

  const [draft, setDraft] = useState({
    name:        draftRef.current.name,
    baseUrl:     draftRef.current.baseUrl,
    apiKey:      draftRef.current.apiKey,
    defaultModel:draftRef.current.defaultModel,
    accessKeyId: draftRef.current.accessKeyId,
    accessKeySecret: draftRef.current.accessKeySecret,
  });

  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const [saving,   setSaving]   = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const preset = findPresetByBase(draft.baseUrl);
  const voicePreset = kind === 'voice' ? (preset?.speech || null) : null;
  // 模型数组为空时回退到该类型的精选清单（对话/图像/视频分别显示对应精选），保证首次接入即有模型可选
  const fallbackKind = kind === 'image' ? 'image' : kind === 'video' ? 'video' : (kind === 'chat' ? 'chat' : '');
  const featuredFallback = (fallbackKind && preset) ? featuredOf(preset, fallbackKind) : [];
  const modelOptionsRaw = Array.from(new Set([
    ...(config.models || []),
    ...((config.models?.length || 0) === 0 ? featuredFallback : []),
    draft.defaultModel,
  ].filter(Boolean))) as string[];
  // 对话/图像/视频区块只显示对应类型的模型；语音/音乐走音色清单不过滤；当前默认值始终保留可见
  const modelOptions = modelOptionsRaw.filter(m => {
    if (kind === 'voice' || kind === 'music') return true;
    const want: 'chat' | 'image' | 'video' = kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'chat';
    return classifyModel(String(m), preset) === want;
  });

  // ── config 从外部变化时（save 后 / 加载时）同步到草稿 ──
  useEffect(() => {
    draftRef.current = {
      name:        config.name,
      baseUrl:     config.baseUrl,
      apiKey:      config.apiKey,
      defaultModel:config.defaultModel,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
    };
    setDraft({
      name:        config.name,
      baseUrl:     config.baseUrl,
      apiKey:      config.apiKey,
      defaultModel:config.defaultModel,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
    });
    setTestResult('idle');
  }, [config.id]); // 仅在 id 变化时重置（新增配置走此路径）

  const handleFetchModels = async () => {
    if (!draft.baseUrl.trim()) return;
    setFetchingModels(true);
    try {
      const r = await onFetchModels?.(config.id, { baseUrl: draft.baseUrl, apiKey: draft.apiKey }, kind);
      if (r?.ok && Array.isArray(r.models) && r.models.length) {
        onUpdate(config.id, { models: r.models.map(String) });
        if (!draft.defaultModel.trim() && r.models[0]) set('defaultModel', String(r.models[0]));
      }
    } catch { /* 静默失败，允许手动输入 */ }
    finally { setFetchingModels(false); }
  };

  // 填写 API Key 且尚未拉取到模型时，自动拉取该平台的可用模型（防抖）；
  // 语音/音乐用官方音色清单，不走 /models
  const isVoiceLike = kind === 'voice' || kind === 'music';
  const autoFetchKey = `${draft.baseUrl}|${draft.apiKey}`;
  useEffect(() => {
    if (isVoiceLike) return;
    if (!draft.apiKey.trim() || !draft.baseUrl.trim()) return;
    if ((config.models?.length || 0) > 0) return;
    const t = setTimeout(() => { void handleFetchModels(); }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchKey]);

  // ── 是否与 store 中原始值有差异 ─────────────────────
  const isDirty = draft.name !== draftRef.current.name
    || draft.baseUrl !== draftRef.current.baseUrl
    || draft.apiKey !== draftRef.current.apiKey
    || draft.defaultModel !== draftRef.current.defaultModel
    || (draft.accessKeyId || '') !== (draftRef.current.accessKeyId || '')
    || (draft.accessKeySecret || '') !== (draftRef.current.accessKeySecret || '');

  // ── 字段更新（只更新本地 state）───────────────────────
  const set = (key: keyof typeof draft, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  // ── 保存：草稿 → store ───────────────────────────────
  const handleSave = () => {
    const models = config.models || [];
    const dm = draft.defaultModel.trim();
    if (dm && !models.includes(dm)) models.push(dm);
    onUpdate(config.id, { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm, models, accessKeyId: draft.accessKeyId, accessKeySecret: draft.accessKeySecret });
    draftRef.current = { ...draft, defaultModel: dm };
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
  };

  // ── 取消：草稿 → 回退到 store 原始值 ─────────────────
  const handleCancel = () => {
    const original = draftRef.current;
    setDraft({ name: original.name, baseUrl: original.baseUrl, apiKey: original.apiKey, defaultModel: original.defaultModel, accessKeyId: original.accessKeyId, accessKeySecret: original.accessKeySecret });
    setTestResult('idle');
  };

  // ── 测试：临时应用草稿，测完恢复 ─────────────────────
  const handleTest = async () => {
    const models = config.models || [];
    const dm = draft.defaultModel.trim();
    if (dm && !models.includes(dm)) models.push(dm);
    // 临时写入 store 以便 testAPIConnection 读到最新值
    onUpdate(config.id, { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm, models, accessKeyId: draft.accessKeyId, accessKeySecret: draft.accessKeySecret });
    setTesting(true);
    setTestResult('idle');
    let ok = false;
    try {
      ok = await onTest(config.id);
      setTestResult(ok ? 'ok' : 'err');
    } catch {
      setTestResult('err');
    } finally {
      setTesting(false);
      if (testResult === 'ok' || ok) {
        // 测试通过 → 同步草稿到 store 状态（实现「测试成功即保存」）
        const savedDraft = { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm, accessKeyId: draft.accessKeyId, accessKeySecret: draft.accessKeySecret };
        draftRef.current = savedDraft;
        setDraft(savedDraft);
        setSaving(true);
        setTimeout(() => { setSaving(false); setTestResult('idle'); }, 2000);
      } else {
        setTimeout(() => setTestResult('idle'), 3000);
      }
    }
  };

  return (
    <div className={`sp-card${isDirty ? ' sp-dirty' : ''}`}>
      {/* 标题行 */}
      <div className="sp-card-head">
        <input
          className="sp-title-inp"
          value={draft.name}
          onChange={e => set('name', e.target.value)}
          placeholder={defaultName}
        />
        <button className="sp-icon-btn sp-del" onClick={() => onDelete(config.id)} title="删除此配置">
          <Icon type="close" size={14} />
        </button>
      </div>

      {/* API 地址 */}
      <div className="sp-f">
        <label className="sp-lb">API 地址</label>
        <input
          className="sp-inp"
          type="text"
          value={draft.baseUrl}
          onChange={e => set('baseUrl', e.target.value)}
          placeholder="https://api.example.com/v1"
          spellCheck={false}
        />
      </div>

      {/* API Key */}
      <div className="sp-f">
        <label className="sp-lb">API Key</label>
        <input
          className="sp-inp"
          type="password"
          value={draft.apiKey}
          onChange={e => set('apiKey', e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
      </div>

      {/* API Key 申请链接（由平台预设提供） */}
      {preset && (
        <div className="sp-f">
          <a className="sp-apply-link" href={preset.chatApplyUrl} target="_blank" rel="noreferrer"
             onClick={e => { e.preventDefault(); openExternalUrl(preset.chatApplyUrl); }}>
            {preset.chatApplyLabel} ↗
          </a>
        </div>
      )}

      {/* 火山方舟 AK/SK（素材资产库鉴权，用于视频参考图 asset:// 引用）——仅需要的平台引导 */}
      {showAccessKey && preset?.needsAccessKey && (<>
        <div className="sp-f">
          <label className="sp-lb">方舟 Access Key ID（AK）</label>
          <input
            className="sp-inp"
            type="password"
            value={draft.accessKeyId || ''}
            onChange={e => set('accessKeyId', e.target.value)}
            placeholder="AKLT…"
            autoComplete="off"
          />
        </div>
        <div className="sp-f">
          <label className="sp-lb">方舟 Secret Access Key（SK）</label>
          <input
            className="sp-inp"
            type="password"
            value={draft.accessKeySecret || ''}
            onChange={e => set('accessKeySecret', e.target.value)}
            placeholder="…"
            autoComplete="off"
          />
          <a
            className="sp-apply-link"
            href={preset?.akskApplyUrl || 'https://console.volcengine.com/iam/keymanage/'}
            target="_blank"
            rel="noreferrer"
            onClick={e => { e.preventDefault(); openExternalUrl(preset?.akskApplyUrl || 'https://console.volcengine.com/iam/keymanage/'); }}
          >{preset?.akskApplyLabel || '创建 AK/SK（火山引擎访问控制）'} ↗</a>
        </div>
      </>)}

      {/* 默认模型（下拉框选择）+ 获取可用模型；语音展示全部官方音色，无需选择默认 */}
      <div className="sp-f">
        <div className="sp-f-row">
          <label className="sp-lb">{voicePreset ? '官方音色' : '默认模型'}</label>
          {!isVoiceLike && (
            <button className="sp-mini-btn" onClick={() => void handleFetchModels()} disabled={fetchingModels || !draft.baseUrl.trim()}>
              {fetchingModels ? '获取中…' : '↻ 获取可用模型'}
            </button>
          )}
        </div>
        {voicePreset ? (
          <>
            <div className="sp-voices-grid">
              {voicePreset.voices.map(v => (
                <span key={v.id} className="sp-voice-chip" title={`${v.id} — ${v.name}`}>{v.name}</span>
              ))}
            </div>
            <div className="sp-hint" style={{ marginTop: 8 }}>已展示全部官方音色（{voicePreset.voices.length} 个），无需选择默认音色，生成时在配音处选择使用</div>
            {voicePreset.note && <div className="sp-hint" style={{ marginTop: 6 }}>{voicePreset.note}</div>}
          </>
        ) : (
          <>
            <input
              className="sp-inp sp-sel"
              list={`sp-models-${config.id}`}
              value={draft.defaultModel || ''}
              onChange={e => set('defaultModel', e.target.value)}
              placeholder={modelOptions.length ? '选择或输入模型名' : '输入模型名（未拉取到模型）'}
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id={`sp-models-${config.id}`}>
              {modelOptions.map(m => <option key={m} value={m} />)}
            </datalist>
            {modelOptions.length === 0 && (
              <div className="sp-hint">未拉取到模型，可直接在上方输入模型名；或点「获取可用模型」重试</div>
            )}
          </>
        )}
      </div>

      {/* 按钮行 */}
      <div className="sp-actions">
        <button
          className={`sp-btn sp-test${testResult === 'ok' || saving ? ' sp-test-ok' : testResult === 'err' ? ' sp-test-err' : ''}`}
          onClick={handleTest}
          disabled={testing}
        >
          {testing ? '测试中…' : saving ? '已保存' : testResult === 'ok' ? '连接成功' : testResult === 'err' ? '连接失败' : '测试连接'}
        </button>

        {isDirty && (
          <button
            className="sp-btn sp-cancel"
            onClick={handleCancel}
          >
            取消
          </button>
        )}

        <button
          className="sp-btn sp-save"
          onClick={handleSave}
          disabled={!isDirty}
        >
          {saving ? '已保存' : '保存配置'}
        </button>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
//  主页面
// ─────────────────────────────────────────────
export const SettingsPage: React.FC = () => {
  const s = useAppStore();

  const upd = (fn: any) => (id: string, u: any) => fn(id, u);
  const addConfig = (addFn: any, defaults: any) => () => addFn(defaults);
  const del = (fn: any) => (id: string) => { if (confirm('确定删除此配置？')) fn(id); };


  // ========== 自动更新：版本显示 + 检查更新 + 一键下载安装 ==========
  // 阿里云 OSS 优先，CNB 与 GitHub 公开下载仓库兜底
  const [appVersion, setAppVersion] = useState<string>('1.2.0');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [releaseName, setReleaseName] = useState<string>('');
  const [releaseNotes, setReleaseNotes] = useState<string>('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [downloadedPath, setDownloadedPath] = useState<string>('');
  const [updateError, setUpdateError] = useState<string>('');

  const checkUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateAvailable(false);
    setUpdateError('');
    try {
      const api = (window as any)?.yijingAPI?.system?.checkUpdate;
      if (typeof api !== 'function') {
        // 回退到前端直接检查（公开仓库）
        const manifestUrls = [
          'https://yjai-releases-cn-20260818.oss-cn-hangzhou.aliyuncs.com/yijing/latest.json',
          'https://cnb.cool/yijingshijue-2026/yijing-ai-downloads/-/releases/latest/download/latest.json',
          'https://github.com/zhanfanghou-create/yijing-ai-downloads/releases/latest/download/latest.json',
        ];
        for (const manifestUrl of manifestUrls) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const r = await fetch(manifestUrl, { signal: ctrl.signal });
            clearTimeout(t);
            if (!r.ok) continue;
            const d = await r.json();
            const tag = (d.version || '').replace(/^v/, '').trim();
            const cur = appVersion.replace(/^v/, '').trim();
            setLatestVersion(tag);
            setReleaseName('艺镜 AI 无限画布');
            setReleaseNotes(d.notes || '');
            if (tag && cur && tag !== cur && tag.localeCompare(cur, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
              setUpdateAvailable(true);
            }
            break;
          } catch { continue; }
        }
        return;
      }

      // 使用后端 API（支持私有仓库 + 国内镜像）
      const result = await api();
      if (result?.ok) {
        setLatestVersion(result.latestVersion || '');
        setReleaseName(result.releaseName || '');
        setReleaseNotes(result.releaseNotes || '');
        setUpdateAvailable(result.hasUpdate || false);
      } else {
        setUpdateError(result?.error || '检查更新失败');
      }
    } catch (e: any) {
      setUpdateError(e?.message || '检查更新失败');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const startDownload = async () => {
    const api = (window as any)?.yijingAPI?.system?.downloadUpdate;
    const onProgress = (window as any)?.yijingAPI?.system?.onUpdateProgress;

    if (typeof api !== 'function') {
      window.open('https://github.com/zhanfanghou-create/yijing-ai-downloads/releases/latest', '_blank');
      return;
    }

    setDownloadingUpdate(true);
    setDownloadProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setUpdateError('');

    // 监听下载进度
    let cleanupProgress: (() => void) | null = null;
    if (typeof onProgress === 'function') {
      cleanupProgress = onProgress((data: { progress: number; downloaded: number; total: number }) => {
        setDownloadProgress(data.progress);
        setDownloadedBytes(data.downloaded);
        setTotalBytes(data.total);
      });
    }

    try {
      const r = await api();
      if (r?.ok && r?.path) {
        setDownloadedPath(r.path);
        // 下载成功后会自动启动安装程序
      } else {
        setUpdateError(r?.error || '下载失败');
      }
    } catch (e: any) {
      setUpdateError(e?.message || '下载失败');
    } finally {
      setDownloadingUpdate(false);
      if (cleanupProgress) cleanupProgress();
    }
  };

  const installNow = () => {
    const api = (window as any)?.yijingAPI?.system?.installUpdate;
    if (downloadedPath && typeof api === 'function') void api(downloadedPath);
  };

  // 格式化文件大小
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  useEffect(() => {
    const v = (window as any)?.yijingAPI?.system?.version;
    if (typeof v === 'string' && v.trim()) setAppVersion(v.trim());
    // 进入设置页面时自动检查更新
    void checkUpdate();
  }, []);

  const apiDefaults = {
    provider: 'openai', baseUrl: 'https://api.example.com/v1',
    apiKey: '', defaultModel: '', models: [], enabled: true, connected: false,
  };

  return (
    <div className="sp-page">
      <header>
        <h1 className="sp-title">设置</h1>
        <p className="sp-subtitle">外部 API 模型均手动输入；Edge TTS 为内置本地配音。</p>
      </header>

      {/* 快速配置预设 */}
      <ProviderSetupSection s={s} />

      {/* Edge TTS — 只读 */}
      <Section title="Edge TTS 本地配音" sub="软件集成的本地语音服务，配置固定且不可编辑" icon={<Icon type="voice" />}>
        <div className="sp-card sp-readonly">
          <div className="sp-card-head">
            <input className="sp-title-inp" value="Edge TTS 本地配音" readOnly />
          </div>
          <div className="sp-f">
            <label className="sp-lb">接口</label>
            <input className="sp-inp" value="edge-tts://local" readOnly />
          </div>
          <div className="sp-models">
            {EDGE_TTS_MODELS.map(m => <span className="sp-tag" key={m}>{m}</span>)}
          </div>
        </div>
      </Section>

      {/* 对话 API */}
      <Section
        title="对话 API 接口" sub="支持 OpenAI 兼容格式"
        icon={<Icon type="chat" />}
        onAdd={addConfig(s.addAPIConfig, { ...apiDefaults, name: '对话 API' })}
        addLabel="添加 API 配置"
      >
        {s.apiConfigs.map(c => (
          <ConfigCard
            key={c.id}
            config={c}
            onUpdate={upd(s.updateAPIConfig)}
            onDelete={del(s.deleteAPIConfig)}
            onTest={s.testAPIConnection}
            defaultName="对话 API" kind="chat" onFetchModels={s.fetchModelsForConfig}
          />
        ))}
      </Section>

      {/* 图片 API */}
      <Section
        title="图片 API 接口" sub="图片生成接口"
        icon={<Icon type="image" />}
        onAdd={addConfig(s.addImageAPIConfig, { ...apiDefaults, name: '图片 API' })}
        addLabel="添加图片 API 配置"
      >
        {s.imageAPIConfigs.map(c => (
          <ConfigCard
            key={c.id}
            config={c}
            onUpdate={upd(s.updateImageAPIConfig)}
            onDelete={del(s.deleteImageAPIConfig)}
            onTest={s.testImageAPIConnection}
            defaultName="图片 API" kind="image" showAccessKey onFetchModels={s.fetchModelsForConfig}
          />
        ))}
      </Section>

      {/* 视频 API */}
      <Section
        title="视频 API 接口" sub="视频生成接口"
        icon={<Icon type="video" />}
        onAdd={addConfig(s.addVideoAPIConfig, { ...apiDefaults, name: '视频 API' })}
        addLabel="添加视频 API 配置"
      >
        {s.videoAPIConfigs.map(c => (
          <ConfigCard
            key={c.id}
            config={c}
            onUpdate={upd(s.updateVideoAPIConfig)}
            onDelete={del(s.deleteVideoAPIConfig)}
            onTest={s.testVideoAPIConnection}
            defaultName="视频 API" kind="video" showAccessKey onFetchModels={s.fetchModelsForConfig}
          />
        ))}
      </Section>

      {/* 语音 API */}
      <Section
        title="语音 API 接口" sub="第三方语音生成接口"
        icon={<Icon type="voice" />}
        onAdd={addConfig(s.addVoiceAPIConfig, { ...apiDefaults, name: '语音 API' })}
        addLabel="添加语音 API 配置"
      >
        {s.voiceAPIConfigs.map(c => (
          <ConfigCard
            key={c.id}
            config={c}
            onUpdate={upd(s.updateVoiceAPIConfig)}
            onDelete={del(s.deleteVoiceAPIConfig)}
            onTest={s.testVoiceAPIConnection}
            defaultName="语音 API" kind="voice" onFetchModels={s.fetchModelsForConfig}
          />
        ))}
      </Section>

      {/* 音乐 API */}
      <Section
        title="音乐 API 接口" sub="音乐生成接口"
        icon={<Icon type="voice" />}
        onAdd={addConfig(s.addMusicAPIConfig, { ...apiDefaults, name: '音乐 API' })}
        addLabel="添加音乐 API 配置"
      >
        {s.musicAPIConfigs.map(c => (
          <ConfigCard
            key={c.id}
            config={c}
            onUpdate={upd(s.updateMusicAPIConfig)}
            onDelete={del(s.deleteMusicAPIConfig)}
            onTest={s.testMusicAPIConnection}
            defaultName="音乐 API" kind="music" onFetchModels={s.fetchModelsForConfig}
          />
        ))}
      </Section>

      {/* ═══════════════════════════════════════════════════════════════
          分镜预设管理（Phase 4）
      ═══════════════════════════════════════════════════════════════ */}
      <Section
        title="分镜预设管理" sub="保存/管理分镜脚本模板，支持导入导出 JSON，可直接应用到画布生成节点"
        icon={<Icon type="video" />}
        onAdd={() => {
          const name = prompt('预设名称？（如：广告短片/纪录片开场）');
          if (!name?.trim()) return;
          s.addStoryboardPreset({
            name: name.trim(),
            description: '',
            steps: [
              { scene: '01', shot: '01', shotType: '全景', cameraMove: '固定', description: '', dialogue: '', duration: '5s', text2imgPrompt: '', img2videoPrompt: '' },
            ],
          });
        }}
        addLabel="新建预设"
      >
        {(!s.storyboardPresets || s.storyboardPresets.length === 0) ? (
          <div className="settings-empty">暂无分镜预设，点击右上角「新建预设」创建一个，方便批量导入到画布。</div>
        ) : (
          <div className="sp-preset-list">
            {s.storyboardPresets.map(preset => {
              const [expanded, setExpanded] = useState(false);
              const [editingName, setEditingName] = useState(false);
              const [draftName, setDraftName] = useState(preset.name);
              const [draftDesc, setDraftDesc] = useState(preset.description);

              const handleSaveName = () => {
                if (draftName.trim()) s.updateStoryboardPreset(preset.id, { name: draftName.trim(), description: draftDesc });
                setEditingName(false);
              };

              return (
                <div key={preset.id} className="sp-preset-card">
                  <div className="sp-preset-header">
                    <div className="sp-preset-info">
                      {editingName ? (
                        <div className="sp-preset-name-edit">
                          <input className="sp-inp" value={draftName} onChange={e => setDraftName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveName()} autoFocus />
                          <input className="sp-inp" value={draftDesc} onChange={e => setDraftDesc(e.target.value)} placeholder="描述（可选）" style={{ flex: 1 }} />
                          <button className="sp-icon-btn sp-save" onClick={handleSaveName} title="保存"><Icon type="check" size={12} /></button>
                        </div>
                      ) : (
                        <div className="sp-preset-meta" onClick={() => setExpanded(!expanded)}>
                          <span className="sp-preset-name">{preset.name}</span>
                          {preset.description && <span className="sp-preset-desc">{preset.description}</span>}
                          <span className="sp-preset-count">{preset.steps.length} 镜头</span>
                        </div>
                      )}
                    </div>
                    <div className="sp-preset-actions">
                      <button className="sp-icon-btn" onClick={() => { setExpanded(!expanded); setEditingName(false); }} title={expanded ? '收起' : '展开/编辑'}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: expanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>
                          <polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                      <button className="sp-icon-btn" onClick={() => { setEditingName(true); setDraftName(preset.name); setDraftDesc(preset.description); }} title="重命名">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button className="sp-icon-btn" onClick={() => {
                        const json = s.exportStoryboardPreset(preset.id);
                        const blob = new Blob([json], { type: 'application/json' });
                        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${preset.name}.json`; a.click();
                      }} title="导出 JSON">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </button>
                      <button className="sp-icon-btn sp-del" onClick={() => { if (confirm(`确定删除预设「${preset.name}」？`)) s.deleteStoryboardPreset(preset.id); }} title="删除">
                        <Icon type="close" size={12} />
                      </button>
                    </div>
                  </div>

                  {/* 展开：镜头列表 */}
                  {expanded && (
                    <div className="sp-preset-steps">
                      <div className="sp-preset-steps-toolbar">
                        <button className="sp-btn sp-add-step-btn"
                          onClick={() => s.updateStoryboardPreset(preset.id, {
                            steps: [...preset.steps, { scene: String(preset.steps.length + 1).padStart(2, '0'), shot: '01', shotType: '中景', cameraMove: '固定', description: '', dialogue: '', duration: '5s', text2imgPrompt: '', img2videoPrompt: '' }]
                          })}
                        >+ 添加镜头</button>
                        <label className="sp-import-btn">
                          导入 JSON
                          <input type="file" accept=".json" style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = ev => {
                                const result = s.importStoryboardPreset(ev.target?.result as string);
                                if (!result.ok) alert('导入失败：' + result.error);
                              };
                              reader.readAsText(file);
                              e.target.value = '';
                            }}
                          />
                        </label>
                      </div>
                      <table className="sp-steps-table">
                        <thead>
                          <tr>
                            <th>场</th><th>镜</th><th>类型</th><th>运镜</th><th>画面描述</th><th>对白</th><th>时长</th><th>图生图提示词</th><th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preset.steps.map((step, idx) => (
                            <tr key={idx} className="sp-step-row">
                              <td><input className="sp-step-inp" value={step.scene} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], scene: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td><input className="sp-step-inp" value={step.shot} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], shot: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td>
                                <select className="sp-step-inp sp-step-sel" value={step.shotType} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], shotType: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }}>
                                  {['远景','全景','中景','近景','特写','双人中景','双人特写','空镜','航拍',' POV'].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td>
                                <select className="sp-step-inp sp-step-sel" value={step.cameraMove} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], cameraMove: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }}>
                                  {['固定','推','拉','摇','移','跟','升降','环绕','航拍','手持','POV'].map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                              </td>
                              <td><textarea className="sp-step-inp sp-step-textarea" value={step.description} rows={2} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], description: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td><textarea className="sp-step-inp sp-step-textarea" value={step.dialogue} rows={2} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], dialogue: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td><input className="sp-step-inp" value={step.duration} onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], duration: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td><textarea className="sp-step-inp sp-step-textarea" value={step.text2imgPrompt} rows={2} placeholder="用于文生图节点…" onChange={e => { const s2 = [...preset.steps]; s2[idx] = { ...s2[idx], text2imgPrompt: e.target.value }; s.updateStoryboardPreset(preset.id, { steps: s2 }); }} /></td>
                              <td>
                                <button className="sp-icon-btn sp-del" onClick={() => { const s2 = preset.steps.filter((_: any, i: number) => i !== idx); s.updateStoryboardPreset(preset.id, { steps: s2 }); }} title="删除此镜头">
                                  <Icon type="close" size={11} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* 素材源配置（Pexels / Pixabay / 本地文件夹） */}
      <Section
        title="素材源配置"
        sub="配置 Pexels、Pixabay API Key 或本地素材文件夹路径，用于短视频生产的视频素材来源"
        icon={<Icon type="video" />}
        onAdd={() => {
          const name = prompt('素材源名称（如：Pexels 账号）');
          if (!name) return;
          const provider = prompt('类型：pexels / pixabay / local', 'pexels') as StockMediaProvider;
          if (!provider) return;
          const apiKey = provider !== 'local' ? prompt(`${provider === 'pexels' ? 'Pexels' : 'Pixabay'} API Key？`) || '' : '';
          const folderPath = provider === 'local' ? prompt('本地文件夹路径？') || '' : '';
          s.addStockMediaSource({ name, provider, apiKey, folderPath, enabled: true });
        }}
        addLabel="添加素材源"
      >
        {s.stockMediaSources.map(src => (
          <div key={src.id} className="settings-config-card">
            <div className="settings-config-card-top">
              <div>
                <h3>{src.name}</h3>
                <p>类型: {src.provider} {!src.enabled && '（已禁用）'}</p>
                {src.provider === 'local' ? (
                  <small>本地路径: {src.folderPath || '未设置'}</small>
                ) : (
                  <small>API Key: {src.apiKey ? '********' + src.apiKey.slice(-4) : '未设置'}</small>
                )}
              </div>
              <div className="settings-config-card-actions">
                <button className="settings-secondary-btn" onClick={() => {
                  const newKey = src.provider !== 'local' ? prompt('新的 API Key？', src.apiKey) || src.apiKey : src.apiKey;
                  const newPath = src.provider === 'local' ? prompt('新的文件夹路径？', src.folderPath) || src.folderPath : src.folderPath;
                  s.updateStockMediaSource(src.id, { apiKey: newKey, folderPath: newPath });
                }}>编辑</button>
                <button className="settings-danger-btn" onClick={() => { if (confirm('确定删除此素材源？')) s.deleteStockMediaSource(src.id); }}>删除</button>
              </div>
            </div>
          </div>
        ))}
        {!s.stockMediaSources.length && (
          <div className="settings-empty">暂无素材源配置，点击"添加素材源"配置 Pexels / Pixabay API Key 或本地文件夹。</div>
        )}
      </Section>

{/* 版本/更新检查 */}
      <div className="sp-help">
        <div className="sp-help-title">关于 · 版本</div>
        <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>当前版本: v{appVersion}</div>
          <button
            className="sp-btn-ghost"
            style={{ height: 28, fontSize: 12, padding: '0 16px' }}
            onClick={checkUpdate}
            disabled={checkingUpdate || downloadingUpdate}
          >
            {checkingUpdate ? '检查中…' : updateAvailable ? `发现新版本 v${latestVersion}` : '已是最新'}
          </button>
        </div>
        {downloadingUpdate && (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
              正在下载更新: {downloadProgress}%
            </div>
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <div style={{ width: Math.max(2, downloadProgress) + '%', height: 4, background: '#8b5cf6', borderRadius: 2, transition: 'width 0.2s' }} />
            </div>
          </div>
        )}
        {downloadedPath && !downloadingUpdate && (
          <div style={{ padding: '0 16px 12px' }}>
            <button className="sp-btn-primary" style={{ width: '100%', height: 34, fontSize: 13 }} onClick={installNow}>
              下载完成 → 立即安装
            </button>
          </div>
        )}
        {!downloadingUpdate && !downloadedPath && updateAvailable && (
          <div style={{ padding: '0 16px 12px' }}>
            <button className="sp-btn-primary" style={{ width: '100%', height: 34, fontSize: 13 }} onClick={startDownload}>
              下载 v{latestVersion} 安装包
            </button>
          </div>
        )}
      </div>
      {/* API 申请攻略 */}
      <div className="sp-help">
        <div className="sp-help-title">API 申请攻略</div>
        <div className="sp-help-grid">
          {[
            { name: '火山方舟 Ark', url: 'https://www.volcengine.com/product/ark', desc: 'doubao / Seedance 视频' },
            { name: 'agnes AI', url: 'https://agnes-ai.cn', desc: '2K/4K 图像/视频生成' },
            { name: 'SiliconFlow', url: 'https://www.siliconflow.cn', desc: '多模型聚合平台' },
            { name: '智谱 GLM', url: 'https://open.bigmodel.cn', desc: 'GLM-4 对话/图像模型' },
            { name: 'ModelScope', url: 'https://modelscope.cn', desc: '通义千问 / Wan2.1 视频' },
            { name: '硅基流动', url: 'https://siliconflow.cn', desc: '低价 OpenAI 兼容 API' },
          ].map(item => (
            <a
              key={item.name}
              className="sp-help-link"
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.preventDefault(); openExternalUrl(item.url); }}
            >
              <span className="sp-help-name">{item.name}</span>
              <span className="sp-help-desc">{item.desc}</span>
              <span className="sp-help-arrow">→</span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};

