import React, { useState, useRef, useCallback, useMemo } from 'react';
import { useAppStore, getCallableRecommendedConfigs } from '../store/appStore';
import { PaperclipIcon, SendIcon } from './Icons';

/**
 * 聊天输入框组件 —— 拥有独立 state 边界
 * 打字时只 rerender 本组件，不会拖累消息列表
 *
 * 核心思路：通过 useAppStore.getState() 非响应式读取 store 数据，
 * 仅在执行 handleSend 时获取最新值，避免大量 store 订阅导致重渲染。
 */

const normalizeSavedModels = (models?: string[], defaultModel?: string) => {
  const set = new Set<string>();
  [...(models || []), defaultModel].forEach(m => {
    const v = String(m || '').trim();
    if (v) set.add(v);
  });
  return Array.from(set);
};

const hasCallable = (c: any) =>
  c.enabled !== false &&
  Boolean(String(c.name || '').trim()) &&
  Boolean(String(c.baseUrl || '').trim()) &&
  Boolean(String(c.apiKey || '').trim()) &&
  normalizeSavedModels(c.models, c.defaultModel).length > 0;

const getSavedModel = (config: any, selectedModel?: string) => {
  const models = normalizeSavedModels(config?.models, config?.defaultModel);
  if (selectedModel && models.includes(selectedModel)) return selectedModel;
  return models[0] || '';
};

export const ChatInput = React.memo(function ChatInput() {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);

  // 只订阅 isGenerating（用于禁用发送按钮）
  const isGenerating = useAppStore(s => s.isGenerating);

  // 使用 getState 非响应式读取，避免频繁重渲染
  const getStore = useCallback(() => useAppStore.getState(), []);
  
  // 仅在需要时获取相关状态
  const generationParams = useAppStore(s => s.generationParams);
  const setGenerationParams = useAppStore(s => s.setGenerationParams);
  const setSelectedModel = useAppStore(s => s.setSelectedModel);

  // 当前可用的所有接口配置（使用 useMemo 缓存）
  const allConfigs = useMemo(() => {
    const store = useAppStore.getState();
    return [
      ...getCallableRecommendedConfigs(store.recommendedConfigs)
        .filter((c: any) => hasCallable(c))
        .map((c: any) => ({
          ...c,
          models: normalizeSavedModels(c.models, c.defaultModel),
          _source: 'recommended' as const,
        })),
      ...store.apiConfigs
        .filter((c: any) => hasCallable(c))
        .map((c: any) => ({
          ...c,
          apiType: 'openai-chat' as const,
          models: normalizeSavedModels(c.models, c.defaultModel),
          _source: 'chat' as const,
        })),
      ...store.imageAPIConfigs
        .filter((c: any) => hasCallable(c))
        .map((c: any) => ({
          ...c,
          apiType: 'openai-generations' as const,
          models: normalizeSavedModels(c.models, c.defaultModel),
          _source: 'image' as const,
        })),
      ...store.videoAPIConfigs
        .filter((c: any) => hasCallable(c))
        .map((c: any) => ({
          ...c,
          apiType: 'openai-completions' as const,
          models: normalizeSavedModels(c.models, c.defaultModel),
          _source: 'video' as const,
        })),
    ];
  }, [generationParams?.selectedConfigId])

  const handleUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
      e.target.value = '';
    }
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSend = useCallback(async () => {
    if (isGenerating) return;
    const raw = text.trim();
    if (!raw && files.length === 0) return;

    // 响应式读取 store 最新状态（非订阅，不触发 rerender）
    const store = useAppStore.getState();
    let sessionId = store.activeSessionId;
    if (!sessionId) {
      sessionId = store.createChatSession();
      store.setActiveSession(sessionId);
    }

    const p = store.generationParams || {};
    const paramsParts: string[] = [];
    if (p.aspectRatio) paramsParts.push(`--aspectRatio ${p.aspectRatio}`);
    if (p.imageSize) paramsParts.push(`--imageSize ${p.imageSize}`);
    if (p.resolution) paramsParts.push(`--resolution ${p.resolution}`);
    const fullContent = paramsParts.length > 0 ? `${raw} ${paramsParts.join(' ')}` : raw;

    // 保存附件到素材库
    const savedFiles = files.length > 0
      ? await Promise.all(files.map(file => {
          const reader = new FileReader();
          return new Promise<string>((resolve) => {
            reader.onload = () => {
              const dataUrl = reader.result as string;
              try {
                const type = /video/i.test(file.type) ? 'video' : 'image';
                store.addAsset({ name: file.name, type: type as any, path: dataUrl, size: file.size, sourceType: 'chat' });
              } catch (err) { console.warn('addAsset failed', err); }
              resolve(dataUrl);
            };
            reader.readAsDataURL(file);
          });
        }))
      : undefined;

    const msgModel = (store.selectedModel || "") || store.defaultModel;
    store.addMessage(sessionId, {
      role: 'user', content: fullContent, type: 'text',
      files: savedFiles, model: msgModel, provider: store.defaultProvider,
    });

    // 自动生成会话标题
    const sessions = store.chatSessions;
    const session = sessions.find((s: any) => s.id === sessionId);
    if (session && !session.title) {
      store.updateChatSession(sessionId, { title: raw.slice(0, 20) + (raw.length > 20 ? '...' : '') });
    }

    setText('');
    setFiles([]);

    // 触发 AI 回复生成
    store.setGenerating(true);
    generateAIResponse(sessionId, raw, store).finally(() => {
      useAppStore.getState().setGenerating(false);
    });
  }, [text, files, isGenerating]);

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="chat-input-area">
      <div className="input-wrapper">
        <textarea
          ref={ref}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onInput={e => {
            const t = e.target as HTMLTextAreaElement;
            t.style.height = 'auto';
            t.style.height = Math.min(t.scrollHeight, 300) + 'px';
          }}
          placeholder="输入消息，Shift+Enter 换行..."
          className="chat-textarea"
          rows={3}
        />
        {files.length > 0 && (
          <div className="attached-files">
            {files.map((file, idx) => (
              <span key={idx} className="file-tag">
                <PaperclipIcon size={14} />
                <span className="file-name">{file.name}</span>
                <span onClick={() => removeFile(idx)} style={{ cursor: 'pointer', marginLeft: 4 }}>&#x2715;</span>
              </span>
            ))}
          </div>
        )}
        <div className="input-actions">
          <label className="file-upload-btn" title="上传文件">
            <PaperclipIcon size={18} />
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onChange={handleUpload} style={{ display: 'none' }} />
          </label>
          <select
            className="control-select inline-select"
            value={allConfigs.find(c => c.id === (generationParams?.selectedConfigId || ""))?.id || ''}
            onChange={(e) => {
              const id = e.target.value;
              setGenerationParams({ selectedConfigId: id });
              const c = allConfigs.find(x => x.id === id);
              const firstModel = c?.models?.[0];
              if (firstModel) {
                setSelectedModel(firstModel);
                setGenerationParams({ selectedModel: firstModel });
              }
            }}
            title={allConfigs.find(c => c.id === (generationParams?.selectedConfigId || ""))?.name || '选择接口'}
            style={{ maxWidth: '150px' }}
          >
            <option value="">选择接口</option>
            {allConfigs.map(config => (
              <option key={config.id} value={config.id} title={config.name}>
                {config.name.length > 15 ? config.name.substring(0, 15) + '...' : config.name}
              </option>
            ))}
          </select>
          <select
            className="control-select inline-select"
            value={generationParams?.selectedModel || ''}
            onChange={(e) => {
              const m = e.target.value;
              setSelectedModel(m);
              setGenerationParams({ selectedModel: m });
            }}
            title={generationParams?.selectedModel || '选择模型'}
            style={{ maxWidth: '150px' }}
          >
            <option value="">选择模型</option>
            {(allConfigs.find(c => c.id === (generationParams?.selectedConfigId || ""))?.models || []).map(model => (
              <option key={model} value={model} title={model}>
                {model.length > 20 ? model.substring(0, 20) + '...' : model}
              </option>
            ))}
          </select>
          <button className="send-btn" onClick={handleSend} disabled={(!text.trim() && files.length === 0) || isGenerating} title="发送 (Enter)">
            <SendIcon size={18} />
          </button>
        </div>
      </div>
    </div>
  );
});

/* ---- 独立 API 调用逻辑 ---- */

// 从用户提示词中解析参数（如 -aspectRatio 9:16 -imageSize 1K）
function parsePromptParams(prompt: string): { text: string; aspectRatio?: string; imageSize?: string; resolution?: string } {
  const result: { text: string; aspectRatio?: string; imageSize?: string; resolution?: string } = { text: prompt };
  
  // 解析 -aspectRatio 参数
  const aspectMatch = prompt.match(/-aspectRatio\s+(\S+)/i);
  if (aspectMatch) {
    result.aspectRatio = aspectMatch[1];
    result.text = result.text.replace(aspectMatch[0], '').trim();
  }
  
  // 解析 -imageSize 参数
  const sizeMatch = prompt.match(/-imageSize\s+(\S+)/i);
  if (sizeMatch) {
    result.imageSize = sizeMatch[1];
    result.text = result.text.replace(sizeMatch[0], '').trim();
  }
  
  // 解析 -resolution 参数
  const resMatch = prompt.match(/-resolution\s+(\S+)/i);
  if (resMatch) {
    result.resolution = resMatch[1];
    result.text = result.text.replace(resMatch[0], '').trim();
  }
  
  return result;
}

async function generateAIResponse(sessionId: string, userPrompt: string, store: ReturnType<typeof useAppStore.getState>) {
  try {
    // 解析用户输入中的参数
    const parsed = parsePromptParams(userPrompt);
    
    const allConfigs = buildAllConfigs(store);
    const selectedConfigId = (store.generationParams?.selectedConfigId || "");
    const selectedModel = (store.selectedModel || "");
    
    // 优先使用用户输入中的参数，其次使用 store 中的参数
    const aspectRatio = parsed.aspectRatio || store.generationParams?.aspectRatio;
    const imageSize = parsed.imageSize || store.generationParams?.imageSize;
    const resolution = parsed.resolution || store.generationParams?.resolution;

    const config = selectedConfigId ? allConfigs.find(c => c.id === selectedConfigId) : null;
    const model = getSavedModel(config, selectedModel);

    if (!config) { addResp(sessionId, '请先在"调用设置"页保存可用的接口配置后再发送。', store); return; }
    if (!model) { addResp(sessionId, '请先在"调用设置"页为当前接口保存至少一个模型后再发送。', store); return; }

    const win = window as any;
    if (!win?.yijingAPI) { addResp(sessionId, '当前运行环境无法调用 API，请在桌面客户端中重试。', store); return; }

    const apiType = config.apiType;
    const isGrsai = apiType === 'openai-chat' || apiType === 'openai-generations' || apiType === 'openai-completions';

    // ComfyUI 工作流作为对话生成源：用选中工作流生成对应媒体，结果作为消息回传
    if (config._source === 'comfyui' && win.yijingAPI.comfyui) {
      const wf = ((config.workflowFiles || []) as any[]).find((w: any) => String(w.name || '') === model) || (config.workflowFiles || [])[0];
      const workflowJson = config.workflowJSON || wf?.content || '';
      if (!workflowJson) { addResp(sessionId, '该 ComfyUI 工作流缺少内容，请在设置页刷新保存后重试。', store); return; }
      const res = await win.yijingAPI.comfyui.generate({
        serverUrl: config.serverUrl,
        workflowJson,
        prompt: parsed.text || userPrompt,
        options: {},
        model,
        params: { components: config.components || [] },
        referenceMedia: [],
      });
      if (res?.ok) {
        const files: string[] = [...(res.files || []), ...(res.videoFiles || []), ...(res.audioFiles || [])];
        if (files.length) {
          const isVid = (res.videoFiles || []).length > 0;
          const isAud = !isVid && (res.audioFiles || []).length > 0;
          store.addMessage(sessionId, { role: 'assistant', content: '', type: isVid ? 'video' : isAud ? 'audio' : 'image', model, provider: 'comfyui', files });
        } else {
          addResp(sessionId, `ComfyUI 生成完成（${model}）`, store);
        }
      } else {
        addResp(sessionId, `ComfyUI 生成失败：${res?.error || '未知错误'}`, store);
      }
      return;
    }

    if (isGrsai && win.yijingAPI.grsai) {
      if (apiType === 'openai-chat') {
        const result = await win.yijingAPI.grsai.chat({ baseUrl: config.baseUrl, apiKey: config.apiKey, model, messages: [{ role: 'user', content: userPrompt }] });
        if (result.ok && result.data?.choices?.[0]) {
          addResp(sessionId, result.data.choices[0].message?.content || JSON.stringify(result.data), store);
        } else if (result.ok && result.data) {
          // 某些“对话”接口其实返回的是图片/视频生成结构（如 { data: [{ url }] }），
          // 尝试从原始响应中提取可视化媒体，避免把 JSON 当作文本展示
          const media = extractMediaFiles({ data: result.data });
          if (media.files.length > 0) {
            store.addMessage(sessionId, {
              role: 'assistant', content: '', type: media.isVideo ? 'video' : 'image',
              model, provider: 'grsai', files: media.files,
            });
          } else if (result.data?.error) {
            addResp(sessionId, `API 错误：${result.data.error.message || JSON.stringify(result.data.error)}`, store);
          } else {
            addResp(sessionId, JSON.stringify(result.data), store);
          }
        } else if (result.data?.error) {
          addResp(sessionId, `API 错误：${result.data.error.message || JSON.stringify(result.data.error)}`, store);
        } else {
          addResp(sessionId, `请求失败（状态码：${result.status}）：未知错误`, store);
        }
      } else {
        // 使用清理后的提示词（已移除参数部分）
        const cleanPrompt = parsed.text;
        
        const genResult = await win.yijingAPI.grsai.generate({
          baseUrl: config.baseUrl, apiKey: config.apiKey, model, prompt: cleanPrompt,
          aspectRatio: aspectRatio || undefined, aspect_ratio: aspectRatio || undefined,
          imageSize: apiType === 'openai-generations' ? (imageSize || undefined) : undefined,
          resolution: apiType === 'openai-completions' ? (resolution || undefined) : undefined,
          apiType,
        });

        if (genResult?.accepted && genResult.id) {
          store.addMessage(sessionId, { role: 'assistant', content: '', type: 'text', model, provider: 'grsai', meta: { jobId: genResult.id, generating: true } });
        } else if (genResult?.data?.error) {
          addResp(sessionId, `生成错误：${genResult.data.error.message || JSON.stringify(genResult.data.error)}`, store);
        } else {
          // 统一提取媒体文件：优先本地下载路径，其次远程 URL / base64
          const media = extractMediaFiles(genResult);
          if (media.files.length > 0) {
            store.addMessage(sessionId, {
              role: 'assistant',
              content: '',
              type: media.isVideo ? 'video' : 'image',
              model,
              provider: 'grsai',
              files: media.files,
            });
          } else if (genResult?.ok) {
            addResp(sessionId, '[已生成] 但无法解析媒体数据', store);
          } else {
            addResp(sessionId, `生成请求失败：${genResult?.error || '未知错误'}`, store);
          }
        }
      }
    } else if (win.yijingAPI.openai) {
      const result = await win.yijingAPI.openai.chat({ baseUrl: config.baseUrl, apiKey: config.apiKey, model, messages: [{ role: 'user', content: userPrompt }] });
      if (result.ok && result.data?.choices?.[0]) {
        addResp(sessionId, result.data.choices[0].message?.content || JSON.stringify(result.data), store);
      } else {
        addResp(sessionId, `请求失败：${result.error || '未知错误'}`, store);
      }
    } else {
      addResp(sessionId, '当前运行环境无法调用 API，请在桌面客户端中重试。', store);
    }
  } catch (error) {
    addResp(sessionId, `抱歉，出错了：${(error as Error).message}`, store);
  }
}

// 统一从生成结果中提取可视化媒体文件（图片/视频）
// 优先级：本地已下载文件路径 > data.results > data.images > data.data(OpenAI 格式)
function extractMediaFiles(genResult: any): { files: string[]; isVideo: boolean } {
  const files: string[] = [];
  let isVideo = false;

  const pickUrl = (r: any): string | null => {
    if (!r) return null;
    if (typeof r === 'string') return r;
    if (r.url) return r.url;
    if (r.uri) return r.uri;
    if (r.image_url) return typeof r.image_url === 'string' ? r.image_url : r.image_url?.url || null;
    if (r.video_url) return r.video_url;
    if (r.b64_json) return `data:image/png;base64,${r.b64_json}`;
    return null;
  };

  const looksLikeVideo = (u: string) => /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(u);

  // 1) 主进程已下载的本地文件路径
  if (Array.isArray(genResult?.filePaths) && genResult.filePaths.length > 0) {
    for (const p of genResult.filePaths) {
      const s = String(p || '');
      if (!s) continue;
      files.push(s);
      if (looksLikeVideo(s)) isVideo = true;
    }
  }

  const data = genResult?.data;
  if (files.length === 0 && data) {
    // 2) results（视频/音频常见格式）
    if (Array.isArray(data.results) && data.results.length > 0) {
      if ((data.results[0]?.type || '').includes('video')) isVideo = true;
      data.results.forEach((r: any) => { const u = pickUrl(r); if (u) { files.push(u); if (looksLikeVideo(u)) isVideo = true; } });
    }
    // 3) images
    if (files.length === 0 && Array.isArray(data.images) && data.images.length > 0) {
      data.images.forEach((r: any) => { const u = pickUrl(r); if (u) { files.push(u); if (looksLikeVideo(u)) isVideo = true; } });
    }
    // 4) OpenAI images/generations 格式：{ data: [ { url | b64_json } ] }
    if (files.length === 0 && Array.isArray(data.data) && data.data.length > 0) {
      data.data.forEach((r: any) => { const u = pickUrl(r); if (u) { files.push(u); if (looksLikeVideo(u)) isVideo = true; } });
    }
  }

  return { files, isVideo };
}

// 从任意文本/JSON 内容中提取图片或视频 URL；无法提取时返回 null
function extractMediaFromContent(content: string): { files: string[]; isVideo: boolean } | null {
  const raw = String(content || '').trim();
  if (!raw) return null;

  // 1) 内容本身可能是一段 JSON（图片/视频生成响应）
  if (/^[\[{]/.test(raw)) {
    try {
      const parsed = JSON.parse(raw);
      const media = extractMediaFiles({ data: parsed });
      if (media.files.length > 0) return media;
    } catch { /* 非合法 JSON，继续走 URL 正则 */ }
  }

  // 2) 从纯文本中扫描图片/视频直链
  const urlRegex = /https?:\/\/[^\s"'<>()]+\.(png|jpe?g|gif|webp|bmp|svg|mp4|mov|webm|m4v|avi|mkv)(\?[^\s"'<>()]*)?/gi;
  const matches = raw.match(urlRegex);
  if (matches && matches.length > 0) {
    const isVideo = matches.some(u => /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(u));
    return { files: Array.from(new Set(matches)), isVideo };
  }

  return null;
}

function addResp(sessionId: string, content: string, store: ReturnType<typeof useAppStore.getState>) {
  // 若文本内容中包含可视化媒体（图片/视频 URL 或生成 JSON），则渲染为媒体消息
  const media = extractMediaFromContent(content);
  if (media && media.files.length > 0) {
    store.addMessage(sessionId, {
      role: 'assistant', content: '', type: media.isVideo ? 'video' : 'image',
      model: (store.selectedModel || "") || store.defaultModel, provider: store.defaultProvider,
      files: media.files,
    });
    return;
  }
  store.addMessage(sessionId, { role: 'assistant', content, type: 'text', model: (store.selectedModel || "") || store.defaultModel, provider: store.defaultProvider });
}

function buildAllConfigs(store: ReturnType<typeof useAppStore.getState>) {
  return [
    ...getCallableRecommendedConfigs(store.recommendedConfigs).filter(hasCallable).map(c => ({ ...c, models: normalizeSavedModels(c.models), _source: 'recommended' as const })),
    ...store.apiConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-chat' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'chat' as const })),
    ...store.imageAPIConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-generations' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'image' as const })),
    ...store.videoAPIConfigs.filter(hasCallable).map(c => ({ ...c, apiType: 'openai-completions' as const, models: normalizeSavedModels(c.models, c.defaultModel), _source: 'video' as const })),
    // ComfyUI 工作流也作为对话生成源：默认选中「对话」分类预设工作流
    // 门槛：必须已填服务器地址且连接成功（connected===true），否则不展示任何工作流
    ...(store.comfyuiConfigs || []).filter((c: any) => String(c?.serverUrl || '').trim() && c?.connected === true && Array.isArray(c.workflowFiles) && c.workflowFiles.length).map((c: any) => {
      const wfs = (c.workflowFiles || []).map((w: any) => w.name || w);
      const pre = c?.categoryPresets?.chat;
      const defM = wfs.find((m: string) => m === pre) || wfs[0] || c.name || 'ComfyUI';
      return ({ ...c, apiType: 'openai-chat' as const, models: (wfs.length ? wfs : [defM]), defaultModel: defM, _source: 'comfyui' as const });
    }),
  ];
}
