import React, { useEffect, useRef, useState } from 'react';
import { EDGE_TTS_MODELS, useAppStore, StockMediaProvider } from '../store/appStore';
import './SettingsPage.css';

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
//  快速配置预设 — 一键填入主流 AI 服务
// ─────────────────────────────────────────────
const QUICK_PRESETS: Array<{
  label: string; desc: string; icon: string; color: string;
  section: 'image' | 'video' | 'chat';
  baseUrl: string; defaultModel: string; helpUrl?: string; helpLabel?: string;
}> = [
  {
    label: '火山方舟', desc: 'doubao-vision / Seedance 视频生成',
    icon: '◆', color: '#ff6b35',
    section: 'video',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-vision',
    helpUrl: 'https://www.volcengine.com/product/ark', helpLabel: '申请 API Key',
  },
  {
    label: 'agnes AI', desc: '2K/4K 图像 + 视频生成',
    icon: '◇', color: '#a78bfa',
    section: 'image',
    baseUrl: 'https://api.agnes-ai.com/v1', defaultModel: 'agnes-pro',
    helpUrl: 'https://agnes-ai.com/docs', helpLabel: '申请 agnes Key',
  },
  {
    label: 'SiliconFlow', desc: '多模型聚合平台',
    icon: '○', color: '#38bdf8',
    section: 'image',
    baseUrl: 'https://api.siliconflow.cn/v1', defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    helpUrl: 'https://www.siliconflow.cn', helpLabel: '申请 SiliconFlow',
  },
  {
    label: '智谱 GLM', desc: 'GLM-4 图像 / 对话模型',
    icon: '●', color: '#34d399',
    section: 'chat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', defaultModel: 'glm-4',
    helpUrl: 'https://open.bigmodel.cn', helpLabel: '申请智谱 Key',
  },
  {
    label: 'ModelScope', desc: '通义千问 / Wan2.1 视频',
    icon: '▲', color: '#fb923c',
    section: 'video',
    baseUrl: 'https://api.modelscope.cn/v1', defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    helpUrl: 'https://modelscope.cn', helpLabel: '申请 ModelScope',
  },
];

const QuickSetupSection: React.FC<{ s: any }> = ({ s }) => {
  const [added, setAdded] = React.useState<string[]>([]);

  const handleAddPreset = (preset: typeof QUICK_PRESETS[0]) => {
    const id = s.addAPIConfig({
      name: preset.label, provider: 'openai',
      baseUrl: preset.baseUrl, apiKey: '', defaultModel: preset.defaultModel,
      models: [preset.defaultModel], enabled: true, connected: false,
    });
    setAdded(prev => [...prev, id]);
    setTimeout(() => setAdded(prev => prev.filter(x => x !== id)), 2000);
    // 跳转到对应 section
    document.querySelector(`[data-section="${preset.section}-api"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="sp-quick">
      <div className="sp-quick-head">
        <span className="sp-quick-title">快速配置</span>
        <span className="sp-quick-sub">点击一键添加，无需手动填写地址</span>
      </div>
      <div className="sp-quick-grid">
        {QUICK_PRESETS.map(preset => {
          const isAdded = added.includes(preset.label);
          return (
            <button
              key={preset.label}
              className={`sp-preset-btn${isAdded ? ' sp-preset-added' : ''}`}
              style={{ '--preset-color': preset.color } as any}
              onClick={() => !isAdded && handleAddPreset(preset)}
              disabled={isAdded}
              title={preset.helpUrl ? `${preset.helpLabel} → ${preset.helpUrl}` : preset.desc}
            >
              <span className="sp-preset-icon">{preset.icon}</span>
              <span className="sp-preset-label">{preset.label}</span>
              <span className="sp-preset-desc">{preset.desc}</span>
              {isAdded && <span className="sp-preset-check">✓</span>}
            </button>
          );
        })}
      </div>
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
}

export const ConfigCard = React.memo(({ config, onUpdate, onDelete, onTest, defaultName }: ConfigCardProps) => {
  // ── 草稿值（ref 存原始值，state 驱动 UI）─────────────
  const draftRef = useRef({ name: config.name, baseUrl: config.baseUrl, apiKey: config.apiKey, defaultModel: config.defaultModel });

  const [draft, setDraft] = useState({
    name:        draftRef.current.name,
    baseUrl:     draftRef.current.baseUrl,
    apiKey:      draftRef.current.apiKey,
    defaultModel:draftRef.current.defaultModel,
  });

  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const [saving,   setSaving]   = useState(false);

  // ── config 从外部变化时（save 后 / 加载时）同步到草稿 ──
  useEffect(() => {
    draftRef.current = {
      name:        config.name,
      baseUrl:     config.baseUrl,
      apiKey:      config.apiKey,
      defaultModel:config.defaultModel,
    };
    setDraft({
      name:        config.name,
      baseUrl:     config.baseUrl,
      apiKey:      config.apiKey,
      defaultModel:config.defaultModel,
    });
    setTestResult('idle');
  }, [config.id]); // 仅在 id 变化时重置（新增配置走此路径）

  // ── 是否与 store 中原始值有差异 ─────────────────────
  const isDirty = draft.name !== draftRef.current.name
    || draft.baseUrl !== draftRef.current.baseUrl
    || draft.apiKey !== draftRef.current.apiKey
    || draft.defaultModel !== draftRef.current.defaultModel;

  // ── 字段更新（只更新本地 state）───────────────────────
  const set = (key: keyof typeof draft, value: string) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  // ── 保存：草稿 → store ───────────────────────────────
  const handleSave = () => {
    const models = config.models || [];
    const dm = draft.defaultModel.trim();
    if (dm && !models.includes(dm)) models.push(dm);
    onUpdate(config.id, { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm, models });
    draftRef.current = { ...draft, defaultModel: dm };
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
  };

  // ── 取消：草稿 → 回退到 store 原始值 ─────────────────
  const handleCancel = () => {
    const original = draftRef.current;
    setDraft({ name: original.name, baseUrl: original.baseUrl, apiKey: original.apiKey, defaultModel: original.defaultModel });
    setTestResult('idle');
  };

  // ── 测试：临时应用草稿，测完恢复 ─────────────────────
  const handleTest = async () => {
    const models = config.models || [];
    const dm = draft.defaultModel.trim();
    if (dm && !models.includes(dm)) models.push(dm);
    // 临时写入 store 以便 testAPIConnection 读到最新值
    onUpdate(config.id, { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm, models });
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
        const savedDraft = { name: draft.name, baseUrl: draft.baseUrl, apiKey: draft.apiKey, defaultModel: dm };
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

      {/* 默认模型 */}
      <div className="sp-f">
        <label className="sp-lb">默认模型</label>
        <input
          className="sp-inp"
          type="text"
          value={draft.defaultModel}
          onChange={e => set('defaultModel', e.target.value)}
          placeholder="手动输入模型名称"
        />
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
          {saving ? '已保存 ✓' : '保存配置'}
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
  const del = (fn: any) => (id: string) => { if (confirm('确定删除此配置？')) fn(id); };

  const addConfig = (addFn: any, defaults: any) => () => addFn(defaults);

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
      <QuickSetupSection s={s} />

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
            defaultName="对话 API"
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
            defaultName="图片 API"
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
            defaultName="视频 API"
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
            defaultName="语音 API"
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
            defaultName="音乐 API"
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

      {/* API 申请攻略 */}
      <div className="sp-help">
        <div className="sp-help-title">API 申请攻略</div>
        <div className="sp-help-grid">
          {[
            { name: '火山方舟 Ark', url: 'https://www.volcengine.com/product/ark', desc: 'doubao / Seedance 视频' },
            { name: 'agnes AI', url: 'https://agnes-ai.com', desc: '2K/4K 图像/视频生成' },
            { name: 'SiliconFlow', url: 'https://www.siliconflow.cn', desc: '多模型聚合平台' },
            { name: '智谱 GLM', url: 'https://open.bigmodel.cn', desc: 'GLM-4 对话/图像模型' },
            { name: 'ModelScope', url: 'https://modelscope.cn', desc: '通义千问 / Wan2.1 视频' },
            { name: '硅基流动', url: 'https://siliconflow.cn', desc: '低价 OpenAI 兼容 API' },
          ].map(item => (
            <a key={item.name} className="sp-help-link" href={item.url} target="_blank" rel="noopener noreferrer">
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

