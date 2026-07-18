import React, { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';
import './SettingsPage.css';
import './ComfyUIPage.css';

const Icon = ({ type = 'box', size = 18, className = '' }: {
  type?: 'box' | 'chat' | 'image' | 'video' | 'voice' | 'cpu' | 'file' | 'close' | 'plus' | 'upload' | 'check' | 'x' | 'arrow-left' | 'info';
  size?: number;
  className?: string;
}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {type === 'chat'       ? <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /> :
     type === 'image'      ? <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 20" /></> :
     type === 'video'      ? <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M17 9l4-3v12l-4-3" /></> :
     type === 'voice'      ? <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></> :
     type === 'cpu'        ? <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></> :
     type === 'file'       ? <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14,2 14,8 20,8" /></> :
     type === 'close'     ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
     type === 'x'          ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></> :
     type === 'check'     ? <polyline points="20,6 9,17 4,12" /> :
     type === 'upload'     ? <><polyline points="16,16 12,12 8,16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></> :
     type === 'plus'       ? <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></> :
     type === 'arrow-left' ? <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12,19 5,12 12,5" /></> :
     type === 'info'       ? <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></> :
     <path d="M12 5v14M5 12h14" />}
  </svg>
);

const NODE_TYPE_TABS = [
  { key: 'image', label: '图像', icon: 'image' as const },
  { key: 'video', label: '视频', icon: 'video' as const },
  { key: 'audio', label: '音频', icon: 'voice' as const },
] as const;

interface ComfyWorkflowCardProps {
  config: any;
  s: any;
  expanded: boolean;
  onToggleExpand: () => void;
}

const ComfyWorkflowCard: React.FC<ComfyWorkflowCardProps> = React.memo(({ config, s, expanded, onToggleExpand }) => {
  const draftRef = useRef({
    name: config.name || '未命名AI应用',
    serverUrl: config.serverUrl || 'http://127.0.0.1:8188',
    description: config.description || '',
    workflowJSON: config.workflowJSON || '',
    nodeType: config.nodeType || 'image',
    runtime: config.runtime || 'cloud',
    components: config.components || [],
  });
  const [draft, setDraft] = useState({ ...draftRef.current });
  const [saving, setSaving] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'ok' | 'err'>('idle');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 添加组件选择面板：解析出的工作流节点列表 + 已选择的 targetNodeId:inputKey 集合
  const [componentPicker, setComponentPicker] = useState<{
    open: boolean;
    nodes: Array<{ nodeId: string; title: string; classType: string; inputs: Array<{ key: string; type: string; defaultValue: string }> }>;
    selected: Record<string, boolean>;
  }>({ open: false, nodes: [], selected: {} });

  const isDirty =
    draft.name !== draftRef.current.name ||
    draft.serverUrl !== draftRef.current.serverUrl ||
    draft.description !== draftRef.current.description ||
    draft.workflowJSON !== draftRef.current.workflowJSON ||
    draft.nodeType !== draftRef.current.nodeType ||
    draft.runtime !== draftRef.current.runtime;

  const set = (key: string, value: any) =>
    setDraft(prev => ({ ...prev, [key]: value }));

  // 根据节点类型/输入名，自动推断该输入应承担的角色，实现「任何 JSON 都能完美匹配」：
  // - prompt：接收画布输入框文字（或上一节点文本）作为正向提示词
  // - negative：负向提示词（保留默认值，不被输入框覆盖）
  // - reference-image / reference-video：接收上游参考图/参考视频（自动上传到该加载节点）
  // - param：普通参数（宽/高/步数/CFG/种子等，使用配置页填写的默认值）
  const detectComponentRole = (classType: string, inputKey: string, title = ''): string => {
    const ct = String(classType || '').toLowerCase();
    const key = String(inputKey || '').toLowerCase();
    const tt = String(title || '').toLowerCase();
    if (/loadvideo|vhs_loadvideo/.test(ct) && (key === 'video' || key === 'file')) return 'reference-video';
    if (/loadimage/.test(ct) && key === 'image') return 'reference-image';
    if (/cliptextencode|cliptext/.test(ct) && key === 'text') {
      if (/negative|负向|neg/.test(tt) || /negative|负向/.test(key)) return 'negative';
      return 'prompt';
    }
    if (key === 'text' && /prompt|正向|提示/.test(tt)) return 'prompt';
    return 'param';
  };

  const handleSave = () => {
    s.updateComfyUIConfig(config.id, {
      name: draft.name,
      serverUrl: draft.serverUrl,
      description: draft.description,
      workflowJSON: draft.workflowJSON,
      nodeType: draft.nodeType,
      runtime: draft.runtime,
      components: draft.components,
    });
    draftRef.current = { ...draft };
    setSaving(true);
    setTimeout(() => setSaving(false), 600);
    s.showToast?.('配置已保存', 'success');
  };

  const handleCancel = () => {
    setDraft({ ...draftRef.current });
    setParseError('');
  };

  const handleParse = async () => {
    setParsing(true);
    setParseError('');
    try {
      const parsed = JSON.parse(draft.workflowJSON);
      if (!parsed || typeof parsed !== 'object') throw new Error('无效的JSON对象');
      const inputs: any[] = [];
      if (parsed.inputs && Array.isArray(parsed.inputs)) {
        parsed.inputs.forEach((inp: any) => {
          inputs.push({
            name: inp.name || inp.key || 'input',
            type: inp.type || 'string',
            description: inp.description || '',
            defaultValue: inp.default || '',
          });
        });
      }
      if (parsed.nodes && Array.isArray(parsed.nodes)) {
        parsed.nodes.forEach((node: any) => {
          if (node.inputs) {
            Object.keys(node.inputs).forEach(key => {
              const val = node.inputs[key];
              if (Array.isArray(val)) return; // 跳过连接引用 [nodeId, slot]
              inputs.push({
                name: `${node.title || node.type}_${key}`,
                type: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'string',
                description: `${node.title || node.type} 的输入 ${key}`,
                defaultValue: val === undefined || val === null ? '' : String(val),
                targetNodeId: String(node.id),
                inputKey: key,
                role: detectComponentRole(node.type || node.class_type, key, node.title),
              });
            });
          }
        });
      } else {
        // API 格式：对象 key 为节点 ID，value 含 inputs/class_type
        Object.keys(parsed).forEach(nid => {
          const node = parsed[nid];
          if (!node || typeof node !== 'object' || !node.inputs) return;
          Object.keys(node.inputs).forEach(key => {
            const val = node.inputs[key];
            if (Array.isArray(val)) return;
            inputs.push({
              name: `${node?._meta?.title || node?.class_type || nid}_${key}`,
              type: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'string',
              description: `${node?._meta?.title || node?.class_type || nid} 的输入 ${key}`,
              defaultValue: val === undefined || val === null ? '' : String(val),
              targetNodeId: nid,
              inputKey: key,
              role: detectComponentRole(node?.class_type, key, node?._meta?.title),
            });
          });
        });
      }
      setDraft(prev => ({ ...prev, components: inputs.length ? inputs : prev.components }));
      s.showToast?.('解析成功，已提取输入组件', 'success');
    } catch (e: any) {
      setParseError(e.message || 'JSON 解析失败');
      s.showToast?.('JSON 解析失败', 'error');
    } finally {
      setParsing(false);
    }
  };

  const handleGenerateNode = () => {
    setGenerating(true);
    try {
      s.updateComfyUIConfig(config.id, {
        name: draft.name,
        serverUrl: draft.serverUrl,
        description: draft.description,
        workflowJSON: draft.workflowJSON,
        nodeType: draft.nodeType,
        runtime: draft.runtime,
        components: draft.components,
        parsed: true,
        generated: true,
      });
      draftRef.current = { ...draft };
      s.showToast?.('节点已生成，可在画布中添加 ComfyUI 节点使用', 'success');
    } finally {
      setGenerating(false);
    }
  };

  const handleTest = async () => {
    s.updateComfyUIConfig(config.id, { serverUrl: draft.serverUrl });
    setTesting(true);
    setTestResult('idle');
    try {
      const ok = await s.testComfyUIConnection(config.id);
      setTestResult(ok ? 'ok' : 'err');
      if (ok) s.showToast?.('连接成功', 'success');
      else     s.showToast?.('连接失败，请检查服务地址', 'error');
    } catch {
      s.showToast?.('连接失败', 'error');
      setTestResult('err');
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult('idle'), 3000);
    }
  };

  const handleJsonFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const file = files[0];
    try {
      const text = await file.text();
      JSON.parse(text);
      setDraft(prev => ({ ...prev, workflowJSON: text }));
      s.showToast?.(`已添加 ${file.name}`, 'success');
    } catch {
      s.showToast?.(`文件 ${file.name} 不是有效的 JSON`, 'error');
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 解析工作流 JSON，提取所有节点及其可暴露的输入参数（跳过 [nodeId, slot] 连接引用）
  const parseWorkflowNodes = (): Array<{ nodeId: string; title: string; classType: string; inputs: Array<{ key: string; type: string; defaultValue: string }> }> | null => {
    const trimmed = (draft.workflowJSON || '').trim();
    if (!trimmed || !trimmed.startsWith('{')) {
      s.showToast?.('请先粘贴 ComfyUI API workflow JSON', 'error');
      return null;
    }
    let parsed: any;
    try { parsed = JSON.parse(trimmed); } catch (e: any) {
      s.showToast?.('JSON 解析失败：' + (e?.message || ''), 'error');
      return null;
    }
    const readInputs = (node: any): Array<{ key: string; type: string; defaultValue: string }> => {
      const inputs = node?.inputs || {};
      return Object.keys(inputs)
        .filter(key => !Array.isArray(inputs[key]))
        .map(key => {
          const val = inputs[key];
          return {
            key,
            type: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'string',
            defaultValue: val === undefined || val === null ? '' : String(val),
          };
        });
    };
    const nodes: Array<{ nodeId: string; title: string; classType: string; inputs: Array<{ key: string; type: string; defaultValue: string }> }> = [];
    if (Array.isArray(parsed.nodes)) {
      parsed.nodes.forEach((n: any) => {
        nodes.push({
          nodeId: String(n.id),
          title: String(n.title || n.type || n.id),
          classType: String(n.type || ''),
          inputs: readInputs(n),
        });
      });
    } else if (parsed && typeof parsed === 'object') {
      Object.keys(parsed).forEach(nid => {
        const node = parsed[nid];
        if (!node || typeof node !== 'object') return;
        nodes.push({
          nodeId: nid,
          title: String(node?._meta?.title || node?.class_type || nid),
          classType: String(node?.class_type || ''),
          inputs: readInputs(node),
        });
      });
    }
    return nodes;
  };

  // 打开「添加组件」选择面板：列出所有节点及输入，供勾选
  const addComponent = () => {
    const nodes = parseWorkflowNodes();
    if (!nodes) return;
    const withInputs = nodes.filter(n => n.inputs.length > 0);
    if (withInputs.length === 0) {
      s.showToast?.('工作流中未找到可暴露的输入参数', 'error');
      return;
    }
    // 默认勾选尚未加入 components 的输入
    const existingKeys = new Set(draft.components.map((c: any) => `${c.targetNodeId}:${c.inputKey}`));
    const selected: Record<string, boolean> = {};
    withInputs.forEach(n => n.inputs.forEach(inp => {
      const k = `${n.nodeId}:${inp.key}`;
      if (!existingKeys.has(k)) selected[k] = false;
    }));
    setComponentPicker({ open: true, nodes: withInputs, selected });
  };

  const toggleComponentPick = (key: string) => {
    setComponentPicker(prev => ({ ...prev, selected: { ...prev.selected, [key]: !prev.selected[key] } }));
  };

  const toggleComponentPickNode = (nodeId: string, checked: boolean) => {
    setComponentPicker(prev => {
      const node = prev.nodes.find(n => n.nodeId === nodeId);
      if (!node) return prev;
      const selected = { ...prev.selected };
      node.inputs.forEach(inp => { selected[`${nodeId}:${inp.key}`] = checked; });
      return { ...prev, selected };
    });
  };

  const confirmComponentPick = () => {
    const chosen: Array<{ nodeId: string; title: string; classType: string; input: { key: string; type: string; defaultValue: string } }> = [];
    componentPicker.nodes.forEach(n => n.inputs.forEach(inp => {
      if (componentPicker.selected[`${n.nodeId}:${inp.key}`]) chosen.push({ nodeId: n.nodeId, title: n.title, classType: n.classType, input: inp });
    }));
    if (chosen.length === 0) {
      s.showToast?.('请至少勾选一个输入参数', 'error');
      return;
    }
    setDraft(prev => {
      const existingKeys = new Set(prev.components.map((c: any) => `${c.targetNodeId}:${c.inputKey}`));
      const merged = [...prev.components];
      let added = 0;
      chosen.forEach(c => {
        const k = `${c.nodeId}:${c.input.key}`;
        if (existingKeys.has(k)) return;
        const role = detectComponentRole(c.classType, c.input.key, c.title);
        merged.push({
          name: `${c.title || c.classType || c.nodeId}_${c.input.key}`,
          type: c.input.type,
          defaultValue: c.input.defaultValue,
          description: `${c.title || c.classType || c.nodeId} 的输入 ${c.input.key}`,
          targetNodeId: c.nodeId,
          inputKey: c.input.key,
          role,
        });
        added += 1;
      });
      s.showToast?.(added > 0 ? `已添加 ${added} 个组件` : '所选组件已存在', added > 0 ? 'success' : 'info');
      return { ...prev, components: merged };
    });
    setComponentPicker({ open: false, nodes: [], selected: {} });
  };

  const updateComponent = (idx: number, field: string, value: string) => {
    setDraft(prev => {
      const next = [...prev.components];
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, components: next };
    });
  };

  const removeComponent = (idx: number) => {
    setDraft(prev => ({
      ...prev,
      components: prev.components.filter((_: any, i: number) => i !== idx),
    }));
  };

  const [describeText, setDescribeText] = useState(''); // 占位以保持其他引用不报错，UI 中不再使用

  return (
    <div className={`sp-card comfy-workflow-card ${expanded ? 'expanded' : ''} ${isDirty ? 'dirty' : ''}`}>

      <div className="sp-card-head" onClick={onToggleExpand} style={{ cursor: 'pointer', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <Icon type="cpu" size={16} />
          <span className="sp-title-text">{draft.name}</span>
          {config.connected && <span className="sp-connected-dot" />}
          {config.generated && <span className="sp-generated-badge">节点已生成</span>}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
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
            value={draft.serverUrl}
            onChange={e => set('serverUrl', e.target.value)}
            placeholder="http://127.0.0.1:8188"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%' }}
          />
        </div>
        <div className="sp-card-actions">
          <button className="sp-btn sp-btn-test" onClick={e => { e.stopPropagation(); handleTest(); }} disabled={testing || !draft.serverUrl.trim()}>
            {testing ? '连接中...' : '测试连接'}
          </button>
          {isDirty && (
            <>
              <button className="sp-btn sp-btn-save" onClick={e => { e.stopPropagation(); handleSave(); }} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button className="sp-btn sp-btn-cancel" onClick={e => { e.stopPropagation(); handleCancel(); }}>
                取消
              </button>
            </>
          )}
          {testResult === 'ok'  && <span className="sp-test-ok">✓ 连接成功</span>}
          {testResult === 'err' && <span className="sp-test-err">✗ 连接失败</span>}
        </div>
      </div>

      {expanded && (
        <div className="comfy-workflow-editor" onClick={e => e.stopPropagation()}>

          <div className="comfy-editor-title">
            <h3>ComfyUI 工作流编辑器</h3>
            <p className="comfy-editor-subtitle">粘贴 ComfyUI API workflow JSON，记得开启运行环境</p>
          </div>

          <div className="comfy-section">
            <div className="comfy-section-label">节点类型</div>
            <div className="comfy-tabs">
              {NODE_TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  className={`comfy-tab ${draft.nodeType === tab.key ? 'active' : ''}`}
                  onClick={() => set('nodeType', tab.key)}
                >
                  <Icon type={tab.icon} size={14} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="comfy-section">
            <div className="comfy-section-label-row">
              <span>ComfyUI API workflow JSON</span>
              <div className="comfy-runtime-tabs">
                <button
                  className={`comfy-runtime-tab ${draft.runtime === 'local' ? 'active' : ''}`}
                  onClick={() => set('runtime', 'local')}
                >
                  本地工作流
                </button>
                <button
                  className={`comfy-runtime-tab ${draft.runtime === 'cloud' ? 'active' : ''}`}
                  onClick={() => set('runtime', 'cloud')}
                >
                  云端工作流
                </button>
              </div>
            </div>
            <textarea
              className="comfy-json-input"
              value={draft.workflowJSON}
              onChange={e => set('workflowJSON', e.target.value)}
              placeholder="粘贴 ComfyUI API format workflow JSON"
              rows={8}
            />
            <div style={{ marginTop: 8, display:'flex', alignItems:'center', gap:8 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleJsonFileUpload}
                style={{ display: 'none' }}
                id={`comfy-json-upload-${config.id}`}
              />
              <label htmlFor={`comfy-json-upload-${config.id}`} className="sp-btn sp-btn-upload" style={{ fontSize:12, padding:'4px 10px' }}>
                <Icon type="upload" size={12} /> 从文件加载JSON
              </label>
              {uploading && <span style={{ color:'var(--text-muted)', fontSize:12 }}>读取中...</span>}
            </div>
            {parseError && <div className="comfy-parse-error">✗ {parseError}</div>}
          </div>

          <div className="comfy-section comfy-app-info">
            <div className="comfy-app-info-row">
            <div className="comfy-app-field">
              <label className="comfy-section-label">AI 应用名称</label>
              <input
                className="sp-inp comfy-app-name-input"
                value={draft.name}
                onChange={e => set('name', e.target.value)}
                placeholder="未命名AI应用"
              />
            </div>
            <div className="comfy-app-field">
              <label className="comfy-section-label">简介</label>
              <input
                className="sp-inp comfy-app-desc-input"
                value={draft.description}
                onChange={e => set('description', e.target.value)}
                placeholder="填写应用简介"
              />
            </div>
          </div>
          </div>

          <div className="comfy-section">
            <div className="comfy-section-label">节点组件编辑（供画布节点输入使用）</div>
            <button className="comfy-add-component-btn" onClick={addComponent}>
              <Icon type="plus" size={13} /> 添加组件（选择节点参数）
            </button>
            <div className="comfy-component-hint">
              点击「添加组件」，从已粘贴的 ComfyUI 工作流中列出所有节点及其输入参数，勾选需要暴露的参数即可（可整节点全选）。勾选后的参数可重命名，生成的参数会直接被 API 调用。
            </div>
            {componentPicker.open && (
              <div className="comfy-picker-overlay" onClick={() => setComponentPicker({ open: false, nodes: [], selected: {} })}>
                <div className="comfy-picker-panel" onClick={e => e.stopPropagation()}>
                  <div className="comfy-picker-head">
                    <span className="comfy-picker-title">选择要暴露的节点参数</span>
                    <button className="sp-icon-btn" onClick={() => setComponentPicker({ open: false, nodes: [], selected: {} })} title="关闭">
                      <Icon type="close" size={14} />
                    </button>
                  </div>
                  <div className="comfy-picker-body">
                    {componentPicker.nodes.map(node => {
                      const allChecked = node.inputs.every(inp => componentPicker.selected[`${node.nodeId}:${inp.key}`]);
                      return (
                        <div key={node.nodeId} className="comfy-picker-node">
                          <label className="comfy-picker-node-head">
                            <input
                              type="checkbox"
                              checked={allChecked}
                              onChange={e => toggleComponentPickNode(node.nodeId, e.target.checked)}
                            />
                            <span className="comfy-picker-node-id">#{node.nodeId}</span>
                            <span className="comfy-picker-node-title">{node.title}</span>
                            {node.classType && <span className="comfy-picker-node-class">{node.classType}</span>}
                          </label>
                          <div className="comfy-picker-inputs">
                            {node.inputs.map(inp => {
                              const k = `${node.nodeId}:${inp.key}`;
                              return (
                                <label key={k} className="comfy-picker-input">
                                  <input
                                    type="checkbox"
                                    checked={!!componentPicker.selected[k]}
                                    onChange={() => toggleComponentPick(k)}
                                  />
                                  <span className="comfy-picker-input-key">{inp.key}</span>
                                  <span className="comfy-picker-input-type">{inp.type}</span>
                                  {inp.defaultValue !== '' && <span className="comfy-picker-input-val" title={inp.defaultValue}>= {inp.defaultValue}</span>}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="comfy-picker-actions">
                    <button className="sp-btn sp-btn-cancel" onClick={() => setComponentPicker({ open: false, nodes: [], selected: {} })}>取消</button>
                    <button className="sp-btn sp-btn-save" onClick={confirmComponentPick}>添加所选</button>
                  </div>
                </div>
              </div>
            )}
            {draft.components.length > 0 && (
              <div className="comfy-components-list">
                {draft.components.map((comp: any, idx: number) => (
                  <div key={idx} className="comfy-component-row">
                    <span className="comfy-comp-node-tag" title={`节点 ${comp.targetNodeId} 的 ${comp.inputKey} 输入`}>
                      {comp.targetNodeId || '?'}·{comp.inputKey || '?'}
                    </span>
                    <input
                      className="sp-inp comfy-comp-input"
                      value={comp.name}
                      onChange={e => updateComponent(idx, 'name', e.target.value)}
                      placeholder="组件名称（API 调用 key）"
                      style={{ width: 160 }}
                    />
                    <select
                      className="sp-inp comfy-comp-select"
                      value={comp.type}
                      onChange={e => updateComponent(idx, 'type', e.target.value)}
                      style={{ width: 100 }}
                    >
                      <option value="string">文字</option>
                      <option value="number">数字</option>
                      <option value="boolean">开关</option>
                      <option value="image">图像</option>
                      <option value="video">视频</option>
                      <option value="audio">音频</option>
                    </select>
                    <select
                      className="sp-inp comfy-comp-select"
                      value={comp.role || 'param'}
                      onChange={e => updateComponent(idx, 'role', e.target.value)}
                      style={{ width: 120 }}
                      title="该输入的角色：决定画布输入框内容、上游文本/图片/视频如何提交到工作流"
                    >
                      <option value="param">普通参数</option>
                      <option value="prompt">正向提示词</option>
                      <option value="negative">负向提示词</option>
                      <option value="reference-image">参考图输入</option>
                      <option value="reference-video">参考视频输入</option>
                    </select>
                    <input
                      className="sp-inp comfy-comp-input"
                      value={comp.value !== undefined && comp.value !== null ? String(comp.value) : (comp.defaultValue || '')}
                      onChange={e => updateComponent(idx, 'value', e.target.value)}
                      placeholder="默认值"
                      style={{ width: 140 }}
                      title="默认调用值"
                    />
                    <input
                      className="sp-inp comfy-comp-input"
                      value={comp.description || ''}
                      onChange={e => updateComponent(idx, 'description', e.target.value)}
                      placeholder="描述"
                      style={{ flex:1 }}
                    />
                    <button className="sp-icon-btn sp-del" onClick={() => removeComponent(idx)} title="删除组件">
                      <Icon type="close" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="comfy-tip">
            粘贴 ComfyUI API workflow JSON 后，点击「添加组件」输入节点 ID（可填「全部」一次提取），会调出该节点的所有输入参数，勾选后自定义名称即可被 API 调用。
          </div>

          <div className="comfy-bottom-actions">
            <button className="sp-btn sp-btn-parse" onClick={handleParse} disabled={parsing || !draft.workflowJSON.trim()}>
              {parsing ? '解析中...' : '解析'}
            </button>
            <button className="sp-btn sp-btn-save-config" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存配置'}
            </button>
            <button className="sp-btn sp-btn-generate-node" onClick={handleGenerateNode} disabled={generating || !draft.workflowJSON.trim()}>
              {generating ? '生成中...' : '生成节点'}
            </button>
          </div>

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
          ComfyUI应用
        </h1>
        <p className="sp-page-desc">配置 ComfyUI 工作流，生成可在画布中使用的自定义 AI 节点</p>
      </div>

      <div className="sp-section">
        <div className="sp-section-head">
          <h2 className="sp-section-title">工作流配置列表</h2>
          <button className="sp-add-btn" onClick={() => {
            const newId = s.addComfyUIConfig({
              name: '未命名AI应用',
              serverUrl: 'http://127.0.0.1:8188',
              connected: false,
              nodeType: 'image',
              runtime: 'cloud',
              workflowJSON: '',
              description: '',
              components: [],
            });
            setExpandedId(newId);
          }}>
            <Icon type="plus" size={14} />
            添加应用
          </button>
        </div>
        <div className="sp-cards">
          {s.comfyuiConfigs.length === 0 && (
            <div className="sp-empty">
              暂无工作流配置，点击"添加应用"开始
            </div>
          )}
          {s.comfyuiConfigs.map(c => (
            <ComfyWorkflowCard
              key={c.id}
              config={c}
              s={s}
              expanded={expandedId === c.id}
              onToggleExpand={() =>
                setExpandedId(expandedId === c.id ? null : c.id)
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
};
