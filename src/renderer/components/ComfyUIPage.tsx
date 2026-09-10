import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import './SettingsPage.css';
import './ComfyUIPage.css';

const Icon = ({ type = 'box', size = 18, className = '' }: {
  type?: 'box' | 'cpu' | 'close' | 'plus' | 'check' | 'x' | 'refresh' | 'info' | 'image' | 'video' | 'voice';
  size?: number;
  className?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {type === 'cpu'        ? <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></> :
     type === 'image'      ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 20" /></> :
     type === 'video'      ? <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l4-3v12l-4-3" /></> :
     type === 'voice'      ? <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></> :
     type === 'close'     ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
     type === 'check'     ? <polyline points="20,6 9,17 4,12" /> :
     type === 'plus'       ? <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></> :
     type === 'refresh'    ? <><polyline points="23,4 23,10 17,10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></> :
     type === 'info'       ? <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></> :
     <path d="M12 5v14M5 12h14" />}
  </svg>
);

const TYPE_LABEL: Record<string, { text: string; icon: 'image' | 'video' | 'voice' }> = {
  image: { text: '图像', icon: 'image' },
  video: { text: '视频', icon: 'video' },
  audio: { text: '音频', icon: 'voice' },
  chat: { text: '对话', icon: 'voice' },
};

interface ComfyConfigCardProps {
  config: any;
  s: any;
  expanded: boolean;
  onToggleExpand: () => void;
}

const ComfyConfigCard: React.FC<ComfyConfigCardProps> = React.memo(({ config, s, expanded, onToggleExpand }) => {
  const [serverUrl, setServerUrl] = useState(config.serverUrl || 'http://127.0.0.1:8188');
  const [name, setName] = useState(config.name || 'ComfyUI 工作流');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<null | { ok: boolean; workflows: any[]; count?: number; error?: string }>(null);
  const [selectedWfs, setSelectedWfs] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    (config.workflowFiles || []).forEach((w: any) => { m[String(w.path || w.name)] = true; });
    return m;
  });
  const [saving, setSaving] = useState(false);

  const wfCount = Array.isArray(config.workflowFiles) ? config.workflowFiles.length : 0;

  const handleTest = async () => {
    s.updateComfyUIConfig(config.id, { serverUrl });
    setTesting(true);
    setTestResult('idle');
    try {
      const ok = await s.testComfyUIConnection(config.id);
      setTestResult(ok ? 'ok' : 'err');
      s.showToast?.(ok ? '连接成功' : '连接失败，请检查服务地址', ok ? 'success' : 'error');
    } catch {
      setTestResult('err');
      s.showToast?.('连接失败', 'error');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult('idle'), 3000);
    }
  };

  const handleScan = async () => {
    if (!serverUrl.trim()) { s.showToast?.('请先填写服务器地址', 'error'); return; }
    setScanning(true);
    setScanResult(null);
    try {
      const win = window as any;
      const r = win?.yijingAPI?.comfyui?.listWorkflows
        ? await win.yijingAPI.comfyui.listWorkflows({ serverUrl })
        : null;
      if (!r) {
        // 渲染进程无 IPC 时的降级：直接请求 v2/userdata
        const base = String(serverUrl).replace(/\/+$/, '');
        const resp = await fetch(`${base}/v2/userdata?recursive=true`).catch(() => null);
        if (!resp || !resp.ok) { setScanResult({ ok: false, workflows: [], error: '无法访问服务器' }); return; }
        const data = await resp.json().catch(() => []);
        const list = Array.isArray(data) ? data : [];
        const wfNames = list.filter((e: any) => e.type === 'file' && /\.json$/i.test(String(e.name || '')));
        setScanResult({ ok: true, workflows: wfNames.map((e: any) => ({ name: String(e.name || '').replace(/\.json$/i, ''), path: e.path, type: 'image' })), count: wfNames.length });
        const sel: Record<string, boolean> = {};
        wfNames.forEach((e: any) => { sel[String(e.path)] = true; });
        setSelectedWfs(sel);
        return;
      }
      if (r.ok === false) {
        setScanResult({ ok: false, workflows: [], error: r.error || '扫描失败' });
        return;
      }
      const wfs = r.workflows || [];
      setScanResult({ ok: true, workflows: wfs, count: r.count ?? wfs.length });
      const sel: Record<string, boolean> = {};
      wfs.forEach((w: any) => { sel[String(w.path || w.name)] = true; });
      setSelectedWfs(sel);
    } catch (e: any) {
      setScanResult({ ok: false, workflows: [], error: e?.message || '扫描失败' });
    } finally {
      setScanning(false);
    }
  };

  const toggleWf = (path: string) => setSelectedWfs(prev => ({ ...prev, [path]: !prev[path] }));

  const handleSave = () => {
    const list = scanResult?.workflows || [];
    // 内置工作流：艺镜ai生图（如果用户勾选了，也保存到配置里）
    const BUILTIN_WF = { name: '艺镜ai生图', path: '__builtin_asset_image__', type: 'image', kind: 'builtin', workflow: null };
    const allList = selectedWfs['__builtin_asset_image__'] ? [BUILTIN_WF, ...list] : list;
    const selected = allList.filter((w: any) => selectedWfs[String(w.path || w.name)]);
    const wfFiles = selected.map((w: any) => ({
      name: String(w.name || ''),
      path: w.path,
      kind: w.kind || 'api',
      type: w.type || 'image',
      content: w.workflow || null,
    }));
    // 推断节点类型：取选中工作流中数量最多的类型（视频 > 音频 > 图像）
    const types = wfFiles.map((w: any) => w.type).filter(Boolean);
    const cnt = (t: string) => types.filter(x => x === t).length;
    let nodeType: 'image' | 'video' | 'audio' = 'image';
    if (cnt('video') >= cnt('image') && cnt('video') >= cnt('audio')) nodeType = 'video';
    else if (cnt('audio') >= cnt('video') && cnt('audio') > cnt('image')) nodeType = 'audio';
    // 自动按 对话/图片/视频/音频 分类预设：每类取第一个勾选的工作流作为该类默认生成源
    const byCat: Record<string, any[]> = { chat: [], image: [], video: [], audio: [] };
    wfFiles.forEach((w: any) => {
      const c = String(w.type || 'image');
      (byCat[c] || byCat.image).push(w);
    });
    const categoryPresets: Record<string, string> = {};
    (Object.keys(byCat) as Array<'chat'|'image'|'video'|'audio'>).forEach(k => {
      const first = byCat[k][0];
      if (first) categoryPresets[k] = String(first.name || first.path || '');
    });
    s.updateComfyUIConfig(config.id, {
      name: name.trim() || 'ComfyUI 工作流',
      serverUrl,
      workflowFiles: wfFiles,
      nodeType,
      categoryPresets,
      parsed: true,
      generated: true,
    });
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
    const parts: string[] = [];
    if (categoryPresets.image) parts.push(`图片→${categoryPresets.image}`);
    if (categoryPresets.video) parts.push(`视频→${categoryPresets.video}`);
    if (categoryPresets.audio) parts.push(`音频→${categoryPresets.audio}`);
    if (categoryPresets.chat) parts.push(`对话→${categoryPresets.chat}`);
    const presetTxt = parts.length ? `已自动分类预设：${parts.join('；')}` : '已保存';
    s.showToast?.(wfFiles.length > 0 ? `已保存 ${wfFiles.length} 个工作流。${presetTxt}。画布/剧创工场/配音将自动按分类使用对应工作流` : '已保存，生成时将自动搭建基础工作流', 'success');
  };

  const showScan = expanded && (scanning || scanResult);

  return (
    <div className={`sp-card comfy-workflow-card ${expanded ? 'expanded' : ''}`}>
      <div className="sp-card-head" onClick={onToggleExpand} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon type="cpu" size={16} />
          <span className="sp-title-text">{name || 'ComfyUI 工作流'}</span>
          {config.connected && <span className="sp-connected-dot" />}
          {!config.connected && (
            <span className="comfy-count-badge" style={{ opacity: 0.75 }} title="未连接：模型窗口不会显示此 ComfyUI 的工作流">
              未连接
            </span>
          )}
          {wfCount > 0 && <span className="comfy-count-badge">{wfCount} 个工作流</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="sp-icon-btn" onClick={e => { e.stopPropagation(); onToggleExpand(); }} title={expanded ? '收起' : '展开配置'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {expanded ? <polyline points="18,15 12,9 6,15" /> : <polyline points="6,9 12,15 18,9" />}
            </svg>
          </button>
          <button className="sp-icon-btn sp-del" onClick={e => { e.stopPropagation(); s.deleteComfyUIConfig(config.id); }} title="删除此配置">
            <Icon type="close" size={14} />
          </button>
        </div>
      </div>

      <div className="sp-card-basic">
        <div className="sp-f">
          <label className="sp-lb">服务器地址</label>
          <input
            className="sp-inp"
            type="text"
            value={serverUrl}
            onChange={e => {
              setServerUrl(e.target.value);
              // 地址一改，原有连接状态即失效：立即置 connected=false（脏值，不落库），
              // 使模型窗口立即隐藏该 ComfyUI 的工作流选项，直到重新测试连接成功。
              if (config.connected && e.target.value.trim() !== String(config.serverUrl || '').trim()) {
                s.updateComfyUIConfig(config.id, { connected: false });
              }
            }}
            placeholder="http://127.0.0.1:8188"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%' }}
          />
        </div>
        <div className="sp-card-actions">
          <button className="sp-btn sp-btn-test" onClick={e => { e.stopPropagation(); handleTest(); }} disabled={testing || !serverUrl.trim()}>
            {testing ? '连接中...' : '测试连接'}
          </button>
          <button className="sp-btn sp-btn-scan" onClick={e => { e.stopPropagation(); handleScan(); }} disabled={scanning || !serverUrl.trim()}>
            {scanning ? '扫描中...' : <><Icon type="refresh" size={12} /> 刷新工作流</>}
          </button>
          <button className="sp-btn sp-btn-save" onClick={e => { e.stopPropagation(); handleSave(); }} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </button>
          {testResult === 'ok'  && <span className="sp-test-ok">✓ 连接成功</span>}
          {testResult === 'err' && <span className="sp-test-err">✗ 连接失败</span>}
        </div>
        {!config.connected && (
          <div className="sp-hint" style={{ marginTop: 8 }}>
            未连接时，画布/剧创工场的模型窗口<b>不会显示</b>此 ComfyUI 的任何工作流；请填写服务器地址并点「测试连接」通过后才会出现。
          </div>
        )}
      </div>

      {showScan && (
        <div className="comfy-scan-block" onClick={e => e.stopPropagation()}>
          {scanning && <div className="comfy-scan-hint">正在读取 {serverUrl} 下的工作流…</div>}
          {!scanning && scanResult && scanResult.ok === false && (
            <div className="comfy-scan-empty">
              <Icon type="info" size={14} /> 扫描失败：{scanResult.error || '请确认服务器地址与网络'}
            </div>
          )}
          {!scanning && scanResult && scanResult.ok && scanResult.workflows.length === 0 && (
            <div className="comfy-scan-empty">
              <Icon type="info" size={14} />
              在该地址下未找到已保存的工作流。
              <div className="comfy-scan-hint">
                请先在 ComfyUI 网页中打开/搭建工作流并「保存」，再回来点刷新。
                也可以直接点保存——生成时会按所选功能自动搭建基础工作流。
              </div>
            </div>
          )}
          {!scanning && scanResult && scanResult.ok && scanResult.workflows.length > 0 && (
            <>
              <div className="comfy-scan-title">找到 {scanResult.count} 个工作流，已按 图片/视频/音频/对话 自动分组（每组第一个将作为该类默认生成源，无需手动指定）：</div>
              {(() => {
                const groups: Array<{ cat: string; label: string; icon: 'image' | 'video' | 'voice'; items: any[] }> = [
                  { cat: 'image', label: '图片', icon: 'image', items: [] },
                  { cat: 'video', label: '视频', icon: 'video', items: [] },
                  { cat: 'audio', label: '音频', icon: 'voice', items: [] },
                  { cat: 'chat', label: '对话', icon: 'voice', items: [] },
                ];
                (scanResult.workflows || []).forEach((w: any) => {
                  const g = groups.find(g => g.cat === String(w.type || 'image')) || groups[0];
                  g.items.push(w);
                });
                // 内置工作流：艺镜ai生图 + 两个视频工作流（永久性可选择，不需要用户手动导入JSON）
                const BUILTIN_WF = { name: '艺镜ai生图', path: '__builtin_asset_image__', type: 'image', kind: 'builtin', workflow: null };
                const BUILTIN_H3_WF = { name: '艺镜内置·MiniMax H3 全能参考视频', path: '__builtin_minimax_h3_video__', type: 'video', kind: 'builtin', workflow: null };
                const imgG = groups.find(g => g.cat === 'image')!;
                if (!imgG.items.some((w: any) => String(w.path || w.name) === '__builtin_asset_image__')) imgG.items.unshift(BUILTIN_WF);
                if (selectedWfs['__builtin_asset_image__'] === undefined) setSelectedWfs((prev: any) => ({ ...prev, '__builtin_asset_image__': true }));
                const vidG = groups.find(g => g.cat === 'video')!;
                if (!vidG.items.some((w: any) => String(w.path || w.name) === '__builtin_minimax_h3_video__')) vidG.items.unshift(BUILTIN_H3_WF);
                if (selectedWfs['__builtin_minimax_h3_video__'] === undefined) setSelectedWfs((prev: any) => ({ ...prev, '__builtin_minimax_h3_video__': true }));
                const visible = groups.filter(g => g.items.length > 0);
                return visible.map(g => (
                  <div key={g.cat} className="comfy-scan-group">
                    <div className="comfy-scan-group-head">
                      <Icon type={g.icon} size={13} />
                      <span>{g.label}</span>
                      <span className="comfy-scan-group-count">{g.items.length}</span>
                      {g.items.some((w: any) => selectedWfs[String(w.path || w.name)]) && <span className="comfy-default-tag">默认</span>}
                    </div>
                    <div className="comfy-scan-list">
                      {g.items.map((w: any) => {
                        const key = String(w.path || w.name);
                        const tl = TYPE_LABEL[String(w.type || 'image')] || TYPE_LABEL.image;
                        return (
                          <label key={key} className="comfy-scan-item">
                            <input type="checkbox" checked={!!selectedWfs[key]} onChange={() => toggleWf(key)} />
                            <Icon type={tl.icon} size={13} />
                            <span className="comfy-scan-name" title={w.path || w.name}>{w.name}</span>
                            <span className={`comfy-wf-type-badge comfy-wf-type-${String(w.type || 'image')}`}>{tl.text}</span>
                            <span className="comfy-wf-kind-badge">{String(w.kind || 'api') === 'ui' ? 'UI' : 'API'}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </>
          )}
        </div>
      )}

      {expanded && (
        <div className="comfy-simple-hint" onClick={e => e.stopPropagation()}>
          填写服务器地址 → 点「刷新工作流」自动读取该地址下所有已保存的工作流 → 勾选后保存即可在画布 / 剧创工场中直接调用。无需粘贴 JSON、无需手动配置节点。
        </div>
      )}
    </div>
  );
});

export const ComfyUIPage: React.FC = () => {
  const s = useAppStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="sp-page">
      <div className="sp-header">
        <h1 className="sp-page-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <rect x="9" y="9" width="6" height="6" />
            <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
          </svg>
          ComfyUI 工作流
        </h1>
        <p className="sp-page-desc">填入服务器地址，一键扫描调用该地址下的所有工作流，自动对接画布与剧创工场</p>
      </div>

      <div className="sp-section">
        <div className="sp-section-head">
          <h2 className="sp-section-title">服务器配置</h2>
          <button className="sp-add-btn" onClick={() => {
            const newId = s.addComfyUIConfig({
              name: 'ComfyUI 工作流',
              serverUrl: 'http://127.0.0.1:8188',
              connected: false,
              nodeType: 'image',
              workflowJSON: '',
              description: '',
              components: [],
            });
            setExpandedId(newId);
          }}>
            <Icon type="plus" size={14} />
            添加服务器
          </button>
        </div>
        <div className="sp-cards">
          {s.comfyuiConfigs.length === 0 && (
            <div className="sp-empty">
              暂无配置，点击"添加服务器"，填入 ComfyUI 地址后刷新即可
            </div>
          )}
          {s.comfyuiConfigs.map(c => (
            <ComfyConfigCard
              key={c.id}
              config={c}
              s={s}
              expanded={expandedId === c.id}
              onToggleExpand={() => setExpandedId(expandedId === c.id ? null : c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
