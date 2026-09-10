import { openaiService } from './api';

// 文件转base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export const toolService = {
  // 文生图
  async generateImage(prompt: string, config: any, options: any = {}) {
    if (!config) {
      throw new Error('请先在设置页配置API');
    }

    try {
      const model = options.model || config.defaultModel || config.models?.[0] || '';
      const win = window as any;
      let result: any;

      if (win?.yijingAPI?.grsai?.generate) {
        result = await win.yijingAPI.grsai.generate({
          baseUrl: config.baseUrl || options.baseUrl,
          apiKey: config.apiKey,
          model,
          prompt,
          apiType: 'openai-generations',
          size: options.size || '1024x1024',
          ...options,
        });
        if (result?.ok && result?.data) result = result.data;
        if (result?.error) throw new Error(result.error?.message || result.error || 'API请求失败');
      } else {
        result = await openaiService.generateImage(
          config.apiKey,
          prompt,
          {
            baseUrl: config.baseUrl || options.baseUrl,
            model,
            size: options.size || '1024x1024',
            ...options,
          }
        );
      }

      // 优先使用主进程下载保存的本地文件路径（方舟返回URL仅24小时有效期，主进程已自动落盘）
      const localPath = result?.filePaths?.[0] || result?.savedPaths?.[0];
      const url = localPath || result?.url || result?.data?.[0]?.url || result?.data?.[0]?.b64_json || result?.images?.[0]?.url || result?.results?.[0]?.url;
      if (!url) {
        throw new Error(result?.error?.message || 'API返回结果为空');
      }

      // 远程原始地址（方舟 TOS URL 等）。方舟同账号产物受信任，视频参考图优先用它，避免真人拦截
      const remoteUrl =
        result?.data?.[0]?.url ||
        result?.url ||
        result?.images?.[0]?.url ||
        result?.results?.[0]?.url ||
        (typeof result?.data?.[0] === 'string' ? result?.data?.[0] : undefined);

      return {
        url,
        remoteUrl: typeof remoteUrl === 'string' && remoteUrl.startsWith('http') ? remoteUrl : undefined,
        type: 'image' as const,
        local: !!localPath,
      };
    } catch (error: any) {
      throw new Error(`文生图失败：${error.message}`);
    }
  },

  // 图生图
  async generateImageToImage(imageFile: File, prompt: string, config: any, options: any = {}) {
    if (!config) {
      throw new Error('请先在设置页配置API');
    }

    try {
      const win = window as any;
      const baseUrl = String(config.baseUrl || options.baseUrl || '');
      // Agnes 官方 /images/edits 端点实测不可用（带 model 也返回 404 upstream），
      // 图生图/多图合成必须走 /images/generations + extra_body.image（官方文档规范）。
      const isAgnesHost = /:\/\/(?:api|apihub)\.agnes-ai\.(?:com|cn)(?:\/|$)/i.test(baseUrl);
      let result: any;
      if (isAgnesHost && win?.yijingAPI?.grsai?.generate) {
        const dataUrl = await fileToBase64(imageFile);
        result = await win.yijingAPI.grsai.generate({
          baseUrl,
          apiKey: config.apiKey,
          model: options.model || config.defaultModel,
          prompt,
          apiType: 'openai-generations',
          size: options.size || '1024x1024',
          images: [dataUrl],
          ratio: options.ratio,
          n: options.n || 1,
        });
        if (result?.ok && result?.data) result = result.data;
        if (result?.error) throw new Error(result.error?.message || result.error || 'API请求失败');
      } else {
        result = await openaiService.editImage(
          config.apiKey,
          imageFile,
          prompt,
          {
            baseUrl: config.baseUrl || options.baseUrl,
            model: config.defaultModel || options.model,
            ...options,
          }
        );
      }

      // 优先使用主进程下载保存的本地文件路径
      const localPath = result?.filePaths?.[0] || result?.savedPaths?.[0];
      const url = localPath || result?.url || result?.data?.[0]?.url || result?.data?.[0]?.b64_json;
      if (!url) {
        throw new Error(result?.error?.message || 'API返回结果为空');
      }

      const remoteUrl = result?.data?.[0]?.url || result?.url || (typeof result?.data?.[0] === 'string' ? result?.data?.[0] : undefined);

      return {
        url,
        remoteUrl: typeof remoteUrl === 'string' && remoteUrl.startsWith('http') ? remoteUrl : undefined,
        type: 'image' as const,
        local: !!localPath,
      };
    } catch (error: any) {
      throw new Error(`图生图失败：${error.message}`);
    }
  },

  // 文生视频（使用OpenAI Video API或通用fallback）
  async generateVideo(prompt: string, config: any, options: any = {}) {
    if (!config) {
      throw new Error('请先在设置页配置API');
    }

    const win = window as any;
    const model = options.model || config.defaultModel || config.models?.[0] || '';
    const baseUrl = config.baseUrl || options.baseUrl;

    const pickUrl = (r: any): string | undefined => {
      if (!r) return undefined;
      if (typeof r === 'string') return /^https?:|^file:/i.test(r) ? r : undefined;
      const direct = r.url || r.uri || r.video_url || r.image_url || r.output_url || r.videoUrl;
      if (direct) return direct;
      const nested = r.metadata?.url || r.data?.metadata?.url
        || r.video?.url || r.video?.video_url
        || r.output?.url || r.output?.video_url
        || r.content?.url || r.content?.video_url
        || (Array.isArray(r.output) ? (r.output[0]?.url || r.output[0]?.video_url) : undefined)
        || (Array.isArray(r.content) ? (r.content[0]?.url || r.content[0]?.video_url) : undefined);
      if (nested) return nested;
      const arr = r.results || r.data || r.images || r.videos || r.urls || r.filePaths;
      if (Array.isArray(arr)) {
        for (const item of arr) { const u = pickUrl(item); if (u) return u; }
      }
      if (Array.isArray(r.choices) && r.choices[0]?.message?.content) {
        const c = r.choices[0].message.content;
        if (Array.isArray(c)) { const x = c.find((i: any) => i && (i.url || i.video_url || i.image_url)); if (x) return x.url || x.video_url || x.image_url; }
      }
      return undefined;
    };

    try {
      // 优先走主进程 IPC（统一规范化 baseUrl + /v1，绕过 CORS，并支持异步任务）
      if (win?.yijingAPI?.grsai?.generate) {
        const res = await win.yijingAPI.grsai.generate({
          baseUrl,
          apiKey: config.apiKey,
          model,
          prompt,
          apiType: 'openai-completions',
          aspectRatio: options.aspectRatio || options.ratio,
          resolution: options.resolution,
          duration: options.duration,
          ...options,
        });

        // 主进程明确失败：透出真实错误（例如 API 4xx/5xx、参数错误等）
        if (res?.ok === false) throw new Error(res?.error?.message || res?.error || '视频生成API返回错误');
        // 上游出错时主进程仍返回 ok:true（status 为 HTTP 码），这里主动识别并透出真实原因
        if (typeof res?.status === 'number' && res.status >= 400) {
          const apiErr = res?.data?.error?.message || res?.data?.error || res?.error?.message || res?.error || res?.message;
          throw new Error('视频生成API返回HTTP ' + res.status + (apiErr ? '：' + apiErr : ''));
        }

        // 同步直接返回结果
        const directUrl = pickUrl(res) || pickUrl(res?.data);
        if (directUrl) return { url: directUrl, type: 'video' as const };

        // 异步任务：轮询 checkResult 直到完成（仅当确实存在异步任务）
        const jobId = res?.id || res?.data?.id;
        // res.status 是 HTTP 状态码（数字），任务状态在 res.data.status 中
        const jobStatus = res?.data?.status || (typeof res?.status === 'string' ? res.status : undefined);
        const isAsyncJob = res?.accepted === true || (jobId && typeof jobStatus === 'string' && !['succeeded', 'success', 'completed'].includes(jobStatus));
        if (isAsyncJob && jobId && win?.yijingAPI?.grsai?.checkResult) {
          const maxAttempts = 120;
          const intervalMs = 3000;
          for (let i = 0; i < maxAttempts; i++) {
            await new Promise((r) => setTimeout(r, intervalMs));
            const poll = await win.yijingAPI.grsai.checkResult({ baseUrl, apiKey: config.apiKey, id: jobId });
            const pdata = poll?.data || poll;
            // DashScope 原生任务：状态在 output.task_status（SUCCEEDED / FAILED）
            const dsStatus = pdata?.output?.task_status || pdata?.output?.status;
            const status = dsStatus === 'SUCCEEDED' ? 'succeeded' : (dsStatus ? String(dsStatus).toLowerCase() : pdata?.status);
            if (status === 'completed' || status === 'succeeded' || status === 'success') {
              const u = pickUrl(pdata);
              if (u) return { url: u, type: 'video' as const };
              throw new Error('视频生成完成但未返回可用地址');
            }
            if (status === 'failed' || status === 'error') {
              // 透出 DashScope/上游真实失败原因（output.message / output.code / message / error）
              const dsErr = pdata?.output?.message || pdata?.output?.code || pdata?.message || pdata?.error?.message || pdata?.error;
              const detail = dsErr ? String(dsErr) : (pdata ? JSON.stringify(pdata).slice(0, 400) : '');
              throw new Error(detail ? ('视频生成失败：' + detail) : '视频生成失败');
            }
          }
          throw new Error('视频生成超时，请稍后在素材库或重试查看结果');
        }

        // 上游在 JSON 里返回了错误对象
        const apiErr2 = res?.data?.error?.message || res?.data?.error || res?.error?.message || res?.error;
        if (apiErr2) throw new Error(typeof apiErr2 === 'string' ? apiErr2 : (apiErr2.message || '视频生成API返回错误'));
        throw new Error('视频生成API返回为空' + (model ? '（模型：' + model + '，接口：' + (baseUrl || '未配置') + '）' : ''));
      }

      // Fallback: 无 IPC 时直连 Agnes /videos 端点
      const response = await fetch(`${baseUrl}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          aspectRatio: options.aspectRatio || options.ratio || '16:9',
          resolution: options.resolution,
          duration: options.duration,
          format: options.format,
          ...options,
        }),
      });
      const result = await response.json();
      const url = pickUrl(result);
      if (!url) {
        throw new Error(result?.error?.message || '视频生成API返回为空');
      }
      return { url, type: 'video' as const };
    } catch (error: any) {
      throw new Error(`文生视频失败：${error.message}`);
    }
  },

  // 配音（文本转语音）
  // 默认使用软件内置的 Edge TTS 本地配音；同时支持自定义 API 接口与 ComfyUI 工作流。
  async generateVoice(text: string, config: any, options: any = {}) {
    const win = window as any;

    // 判断配置来源：edge-tts / comfyui / 自定义 API
    const source = config?.source || '';
    const isEdgeTts =
      !config ||
      source === 'edge-tts' ||
      config.provider === 'edge-tts' ||
      config._apiType === 'edge-tts' ||
      config.apiType === 'edge-tts' ||
      String(config.baseUrl || '').startsWith('edge-tts://');
    const isComfyUI =
      source === 'comfyui' ||
      config?.provider === 'comfyui' ||
      Boolean((config?.serverUrl || '').trim());

    try {
      // ===== 1. 内置 Edge TTS 本地配音（默认）=====
      if (isEdgeTts) {
        const voice =
          options.voice ||
          options.voiceName ||
          config?.voiceName ||
          config?.defaultModel ||
          config?.models?.[0] ||
          'zh-CN-XiaoxiaoNeural';
        const ttsOptions = {
          rate: options.rate,
          volume: options.volume,
          pitch: options.pitch,
        };

        // 优先使用主进程 Edge TTS 合成到 Base64
        if (win?.yijingAPI?.edgeTts?.synthesizeToBase64) {
          const res = await win.yijingAPI.edgeTts.synthesizeToBase64({
            text,
            voice,
            options: ttsOptions,
          });
          if (res?.ok && res?.base64) {
            const url = `data:audio/mpeg;base64,${res.base64}`;
            return { url, type: 'audio' as const, duration: res.duration };
          }
          throw new Error(res?.error || 'Edge TTS 合成失败，请确认已安装 edge-tts（pip install edge-tts）');
        }

        // 兼容旧接口 edgeTTS.speak
        if (win?.yijingAPI?.edgeTTS?.speak) {
          const res = await win.yijingAPI.edgeTTS.speak({ text, voice, rate: options.rate || 1 });
          const url = res?.url || res?.data?.url;
          if (url) return { url, type: 'audio' as const };
        }

        // 不可用时返回标记 URL
        return { url: `edge-tts://${encodeURIComponent(text)}`, type: 'audio' as const };
      }

      // ===== 2. ComfyUI 工作流配音 =====
      if (isComfyUI) {
        if (!win?.yijingAPI?.comfyui?.generate) {
          throw new Error('ComfyUI 接口不可用');
        }
        const serverUrl = String(config.serverUrl || config.baseUrl || '').trim().replace(/\/+$/, '');
        // 选择工作流：优先 options 指定，其次配置的第一个工作流文件
        const workflowFile =
          options.workflowFile ||
          config.workflowFiles?.find((w: any) => w.name === (options.model || config.defaultModel)) ||
          config.workflowFiles?.[0];
        const workflowJson =
          config.workflowJSON ||
          workflowFile?.content ||
          options.workflowJson ||
          '';
        if (!workflowJson) {
          throw new Error('未找到可用的 ComfyUI 语音工作流，请在设置页配置工作流文件');
        }
        const refs: Array<{ url: string; kind: string }> = [];
        if (options.sampleUrl && /^data:/.test(String(options.sampleUrl))) refs.push({ url: String(options.sampleUrl), kind: 'audio' });
        else if (options.audioData) refs.push({ url: String(options.audioData), kind: 'audio' });
        const res = await win.yijingAPI.comfyui.generate({
          serverUrl,
          workflowJson,
          prompt: text,
          options: { ...options, text, voice: options.voice || options.voiceName },
          model: options.model || config.defaultModel || '',
          params: { components: options.comfyComponents || config.components || [] },
          ...(refs.length ? { referenceMedia: refs } : {}),
        });
        if (res?.ok === false) throw new Error(res?.error || 'ComfyUI 生成失败');
        const url =
          res?.url ||
          res?.audio ||
          res?.data?.url ||
          res?.data?.[0]?.url ||
          res?.results?.[0]?.url ||
          res?.outputs?.[0]?.url;
        if (!url) throw new Error('ComfyUI 未返回音频结果');
        return { url, type: 'audio' as const };
      }

      // ===== 3. 自定义 API 接口配音 =====
      const apiBase = String(config.baseUrl || '').trim().replace(/\/+$/, '');
      const apiKey = config.apiKey || '';
      const model = config.defaultModel || options.model || '';
      const voice = options.voice || options.voiceName || 'alloy';

      // 3.0 豆包语音（openspeech.bytedance.com）：X-Api-Key 鉴权 + text_prompt/speaker 格式（同步返回 audio base64 / url）
      if (/openspeech\.bytedance\.com/i.test(apiBase)) {
        // 豆包语音正确端点固定在 https://openspeech.bytedance.com/api/v3/tts/create
        const origin = (() => { try { return new URL(apiBase).origin; } catch { return apiBase; } })();
        const url = `${origin}/api/v3/tts/create`;
        // 豆包语音：BV 系列音色（BV001_streaming 等）对应 model=volcano_tts + speaker=音色ID；
        // 若把 BV 音色名当 model 会报「fail to convert model to resource_id」403
        const isBvVoice = /^BV\d+/i.test(voice || '') || /^BV\d+/i.test(model || '');
        // 官方接口 model 仅支持 seed-audio-1.0；BV 系列音色（豆包语音合成模型2.0）通过 speaker 字段指定，
        // 绝不能把 BV 音色名当 model（会报 fail to convert model to resource_id 403）
        const ttsModel = (model && !/^BV\d+/i.test(model) && !/^volcano/i.test(model)) ? model : 'seed-audio-1.0';
        const body: any = {
          model: ttsModel,
          text_prompt: text,
          audio_config: { format: 'mp3', sample_rate: 24000 },
        };
        if (voice && voice !== 'alloy' && voice !== 'default') body.speaker = voice;
        // 参考音频（克隆音色）：sampleUrl 为 data URL 时提取 base64 作为音色参考
        if (options.sampleUrl && /^data:/.test(String(options.sampleUrl || ''))) {
          body.audio_data = String(options.sampleUrl).split(',')[1];
        } else if (options.audioData) {
          body.audio_data = String(options.audioData);
        }
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await resp.json().catch(() => null);
        if (!resp.ok || !data) {
          const em = data?.message || data?.code || data?.error?.message || (data ? JSON.stringify(data).slice(0, 300) : '') || '';
          console.error('[Volc TTS] 失败', resp.status, JSON.stringify(data || {}).slice(0, 600));
          throw new Error(em || `HTTP ${resp.status}`);
        }
        if (data.url) return { url: String(data.url), type: 'audio' as const };
        if (data.audio) {
          try {
            const bin = atob(String(data.audio));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            return { url: URL.createObjectURL(new Blob([bytes], { type: 'audio/mp3' })), type: 'audio' as const };
          } catch {
            return { url: `data:audio/mp3;base64,${data.audio}`, type: 'audio' as const };
          }
        }
        throw new Error('豆包语音未返回音频');
      }

      // 3.1 千问/百炼 DashScope 原生 TTS（CosyVoice / Qwen-Audio-TTS）
      // 官方明确：语音合成不支持 OpenAI 兼容 /audio/speech，须走原生 SpeechSynthesizer（output.audio.url 返回音频）
      if (/:\/\/dashscope[a-z0-9-]*\.aliyuncs\.com(?:\/|$)/i.test(apiBase) || /:\/\/[a-z0-9-]+\.maas\.aliyuncs\.com(?:\/|$)/i.test(apiBase)) {
        const origin = (() => { try { return new URL(apiBase).origin; } catch { return apiBase; } })();
        // 官方 SpeechSynthesizer 仅接受以下精确枚举；其他值（含不存在的 cosyvoice-flash）一律回退 cosyvoice-v2
        const DS_TTS_MODELS = ['cosyvoice-v2', 'cosyvoice-v3-plus', 'cosyvoice-v3-flash', 'cosyvoice-v3.5-plus', 'cosyvoice-v3.5-flash', 'qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash'];
        const synthModel = DS_TTS_MODELS.includes(model) ? model : 'cosyvoice-v2';
        const v = (voice && voice !== 'alloy' && voice !== 'default') ? voice : '';
        // 单次合成（带 45s 超时），返回 { err?, status?, data? }
        const doSynth = async (m: string, vv: string): Promise<any> => {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 45000);
          try {
            const resp = await fetch(`${origin}/api/v1/services/audio/tts/SpeechSynthesizer`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: m,
                input: { text, voice: vv || undefined, format: 'mp3', sample_rate: 24000 },
              }),
              signal: ctl.signal,
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok || !data) {
              const em = data?.output?.message || data?.output?.code || data?.message || data?.code || (data?.output ? JSON.stringify(data.output).slice(0, 300) : '') || '';
              return { err: em || `HTTP ${resp.status}`, status: resp.status, data };
            }
            return { data };
          } catch (e: any) {
            return { err: e?.name === 'AbortError' ? '合成超时（45s）' : (e?.message || String(e)) };
          } finally { clearTimeout(timer); }
        };
        let r = await doSynth(synthModel, v);
        // 418 = 音色与模型版本不匹配：遍历官方各版本模型，并自动补版本后缀（如 longxiaochun→longxiaochun_v2）匹配 cosyvoice-v2
        if (r?.err && /418/.test(r.err)) {
          const base = v.replace(/_(v\d+)$/, '');
          const combos: Array<[string, string]> = [];
          for (const m of DS_TTS_MODELS) {
            combos.push([m, v]);
            if (!/_v\d+$/.test(v)) {
              if (m === 'cosyvoice-v2') combos.push([m, base + '_v2']);
              if (m === 'cosyvoice-v3-flash') combos.push([m, base + '_v3']);
            }
          }
          const seen = new Set<string>();
          for (const [m, vv] of combos) {
            const key = m + '|' + vv;
            if (seen.has(key) || (m === synthModel && vv === v)) continue;
            seen.add(key);
            console.warn('[DashScope TTS] 418，尝试', m, vv);
            r = await doSynth(m, vv);
            if (!r?.err) break;
          }
        }
        if (r?.err) {
          console.error('[DashScope TTS] 失败', r?.status, JSON.stringify(r?.data || {}).slice(0, 600));
          throw new Error(r.err);
        }
        const data = r.data;
        const audioUrl = data?.output?.audio?.url;
        if (audioUrl) return { url: String(audioUrl), type: 'audio' as const };
        if (data?.output?.audio?.data) return { url: `data:audio/mp3;base64,${data.output.audio.data}`, type: 'audio' as const };
        throw new Error('千问语音未返回音频');
      }

      // 优先通过主进程 thirdParty.request 代理调用（绕过 CORS，统一错误处理）
      if (win?.yijingAPI?.thirdParty?.request) {
        // 尝试多种常见语音 API 端点格式
        const endpoints = [
          { url: `${apiBase}/audio/speech`, body: { model, voice, input: text } },
          { url: `${apiBase}/v1/audio/speech`, body: { model, voice, input: text } },
          { url: `${apiBase}/tts`, body: { model, voice, text } },
          { url: `${apiBase}/synthesize`, body: { model, voice, text } },
        ];
        let lastErr: any = null;
        for (const ep of endpoints) {
          try {
            const res = await win.yijingAPI.thirdParty.request({
              url: ep.url,
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(ep.body),
              responseType: 'blob',
            });
            if (res?.ok && res?.data) {
              const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
              const url = URL.createObjectURL(blob);
              return { url, type: 'audio' as const };
            }
            if (res?.url) return { url: res.url, type: 'audio' as const };
            lastErr = res?.error || res;
          } catch (e) { lastErr = e; }
        }
        if (lastErr) throw new Error(typeof lastErr === 'string' ? lastErr : (lastErr?.message || JSON.stringify(lastErr).slice(0, 200)));
      }

      // Fallback: 渲染进程直接 fetch（可能受 CORS 限制）
      const response = await fetch(`${apiBase}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, voice, input: text }),
      });
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { const err = await response.json(); msg = err?.error?.message || err?.error || msg; } catch {}
        throw new Error(msg);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      return { url, type: 'audio' as const };
    } catch (error: any) {
      throw new Error(`配音失败：${error.message}`);
    }
  },

  // 音色克隆：上传音频样本，克隆生成自定义音色
  // 支持常见语音克隆 API（ElevenLabs / Fish Audio / Minimax / OpenAI 兼容等），通过配置的 baseUrl 自动适配
  async cloneVoice(audioFile: File | string, config: any, options: any = {}): Promise<{ voiceId: string; name: string; previewUrl?: string; sampleUrl?: string }> {
    if (!config) throw new Error('请先在设置页配置语音 API');
    const win = window as any;
    const apiBase = String(config.baseUrl || '').trim().replace(/\/+$/, '');
    const apiKey = config.apiKey || '';
    const voiceName = options.name || options.voiceName || ('克隆音色_' + Date.now().toString(36));

    // 将 File 转为 base64
    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    try {
      let audioBase64 = '';
      let audioFileName = 'sample.mp3';
      if (typeof audioFile === 'string') {
        audioBase64 = audioFile;
      } else {
        audioBase64 = await fileToBase64(audioFile);
        audioFileName = audioFile.name || 'sample.mp3';
      }

      // ComfyUI 工作流音色克隆：上传参考音频到 ComfyUI，用语音克隆工作流（F5-TTS / GPT-SoVITS / CosyVoice 等）生成试听
      const isComfyUI = config?.source === 'comfyui' || config?.provider === 'comfyui' || Boolean((config?.serverUrl || '').trim());
      if (isComfyUI) {
        if (!win?.yijingAPI?.comfyui?.generate) throw new Error('ComfyUI 接口不可用');
        const serverUrl = String(config.serverUrl || config.baseUrl || '').trim().replace(/\/+$/, '');
        const workflowFile = options.workflowFile || config.workflowFiles?.find((w: any) => w.name === (options.model || config.defaultModel)) || config.workflowFiles?.[0];
        const workflowJson = config.workflowJSON || workflowFile?.content || options.workflowJson || '';
        if (!workflowJson) throw new Error('未找到可用的 ComfyUI 语音克隆工作流，请在设置页配置工作流文件');
        const previewText = options.previewText || '你好，这是克隆音色的试听。';
        const res = await win.yijingAPI.comfyui.generate({
          serverUrl,
          workflowJson,
          prompt: previewText,
          options: { ...options, text: previewText, voice: options.voice || options.voiceName || '' },
          model: options.model || config.defaultModel || '',
          params: { components: options.comfyComponents || config.components || [] },
          referenceMedia: [{ url: audioBase64, kind: 'audio' }],
        });
        if (res?.ok === false) throw new Error(res?.error || 'ComfyUI 音色克隆失败');
        const cUrl = res?.url || res?.audio || res?.data?.url || res?.data?.[0]?.url || res?.results?.[0]?.url;
        if (!cUrl) throw new Error('ComfyUI 未返回克隆音色试听结果');
        return { voiceId: 'comfy_clone_' + Date.now().toString(36), name: voiceName, previewUrl: cUrl, sampleUrl: audioBase64 };
      }

      // 豆包语音（openspeech.bytedance.com）：通过 audio_data 参考音频实现音色克隆
      // 上传样本后，后续生成时以 audio_data 作为音色参考（无需独立克隆端点）
      if (/openspeech\.bytedance\.com/i.test(apiBase)) {
        const dataPart = audioBase64.includes(',') ? String(audioBase64).split(',')[1] : audioBase64;
        const previewUrl = await (async () => {
          try {
            const origin2 = (() => { try { return new URL(apiBase).origin; } catch { return apiBase; } })();
            const resp = await fetch(`${origin2}/api/v3/tts/create`, {
              method: 'POST',
              headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                // 官方 model 仅支持 seed-audio-1.0；BV 音色名不能当 model（会 403）
                model: (config.defaultModel && !/^BV\d+/i.test(String(config.defaultModel)) && !/^volcano/i.test(String(config.defaultModel))) ? config.defaultModel : 'seed-audio-1.0',
                text_prompt: '你好，这是克隆音色的试听。',
                audio_data: dataPart,
                audio_config: { format: 'mp3' },
              }),
            });
            const d = await resp.json().catch(() => null);
            if (!resp.ok || !d) return undefined;
            if (d.url) return String(d.url);
            if (d.audio) return `data:audio/mp3;base64,${d.audio}`;
            return undefined;
          } catch { return undefined; }
        })();
        const voiceId = 'clone_' + Date.now().toString(36);
        return { voiceId, name: voiceName, previewUrl };
      }

      // 优先通过主进程代理调用（绕过 CORS，支持 multipart/form-data）
      if (win?.yijingAPI?.thirdParty?.request) {
        // 尝试多种常见克隆 API 端点
        const cloneEndpoints = [
          // ElevenLabs 风格
          { url: `${apiBase}/voices/add`, method: 'POST', isMultipart: true, fields: { name: voiceName, files: 'audio' } },
          // Fish Audio 风格
          { url: `${apiBase}/v1/voices`, method: 'POST', isMultipart: true, fields: { name: voiceName, audio: 'audio' } },
          // Minimax 风格
          { url: `${apiBase}/v1/t2a_v2/voice_clone`, method: 'POST', isMultipart: false, fields: { voice_name: voiceName, audio_base64: audioBase64 } },
          // 通用 OpenAI 兼容风格
          { url: `${apiBase}/voices`, method: 'POST', isMultipart: true, fields: { name: voiceName, file: 'audio' } },
        ];

        let lastErr: any = null;
        for (const ep of cloneEndpoints) {
          try {
            const res = await win.yijingAPI.thirdParty.request({
              url: ep.url,
              method: ep.method,
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                ...(ep.isMultipart ? {} : { 'Content-Type': 'application/json' }),
              },
              body: ep.isMultipart
                ? { __multipart: true, name: voiceName, audio: { __file: true, base64: audioBase64, filename: audioFileName } }
                : JSON.stringify({ ...ep.fields, voice_name: voiceName, audio_base64: audioBase64 }),
            });
            if (res?.ok) {
              const data = res.data || res;
              const voiceId = data?.voice_id || data?.id || data?.voiceId || data?.voiceID || '';
              if (voiceId) {
                return { voiceId, name: voiceName, previewUrl: data?.preview_url || data?.previewUrl || undefined };
              }
            }
            lastErr = res?.error || res;
          } catch (e) { lastErr = e; }
        }
        if (lastErr) throw new Error(typeof lastErr === 'string' ? lastErr : (lastErr?.message || '音色克隆失败'));
      }

      // Fallback: 渲染进程直接调用（仅支持 JSON 格式的 API）
      const response = await fetch(`${apiBase}/v1/t2a_v2/voice_clone`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ voice_name: voiceName, audio_base64: audioBase64 }),
      });
      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try { const err = await response.json(); msg = err?.error?.message || err?.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await response.json();
      const voiceId = data?.voice_id || data?.id || data?.voiceId || '';
      if (!voiceId) throw new Error('克隆成功但未返回 voice_id');
      return { voiceId, name: voiceName, previewUrl: data?.preview_url || undefined };
    } catch (error: any) {
      throw new Error(`音色克隆失败：${error.message}`);
    }
  },

  // 文本生成（对话API）
  async generateText(prompt: string, config: any, options: any = {}) {
    if (!config) {
      throw new Error('请先在设置页配置API');
    }

    try {
      const result = await openaiService.chat(
        config.apiKey,
        [{ role: 'user', content: prompt }],
        {
          baseUrl: config.baseUrl || options.baseUrl,
          model: config.defaultModel || options.model,
          ...options,
        }
      );

      const content = result?.choices?.[0]?.message?.content || result?.data?.[0]?.content || '';
      if (!content) {
        throw new Error(result?.error?.message || 'API返回为空');
      }

      return {
        content,
        type: 'text' as const,
      };
    } catch (error: any) {
      throw new Error(`文本生成失败：${error.message}`);
    }
  },

  // 色彩匹配（特殊处理，后续可接入真实图像处理API）
  async colorMatch(sourceImage: File, targetColor: string, intensity: number, config: any) {
    throw new Error('色彩匹配功能正在接入专业图像API，请稍后使用');
  },

  // 证件照生成（特殊处理，后续可接入真实证件照API）
  async generateIdPhoto(image: File, size: string, bgColor: string, config: any) {
    throw new Error('证件照生成功能正在接入专业图像API，请稍后使用');
  },
};

export default toolService;
