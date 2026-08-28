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

      const url = result?.url || result?.data?.[0]?.url || result?.data?.[0]?.b64_json || result?.images?.[0]?.url || result?.results?.[0]?.url;
      if (!url) {
        throw new Error(result?.error?.message || 'API返回结果为空');
      }

      return {
        url,
        type: 'image' as const,
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
      const result = await openaiService.editImage(
        config.apiKey,
        imageFile,
        prompt,
        {
          baseUrl: config.baseUrl || options.baseUrl,
          model: config.defaultModel || options.model,
          ...options,
        }
      );

      const url = result?.url || result?.data?.[0]?.url || result?.data?.[0]?.b64_json;
      if (!url) {
        throw new Error(result?.error?.message || 'API返回结果为空');
      }

      return {
        url,
        type: 'image' as const,
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
            const status = pdata?.status;
            if (status === 'completed' || status === 'succeeded' || status === 'success') {
              const u = pickUrl(pdata);
              if (u) return { url: u, type: 'video' as const };
              throw new Error('视频生成完成但未返回可用地址');
            }
            if (status === 'failed' || status === 'error') {
              throw new Error(pdata?.error?.message || pdata?.error || '视频生成失败');
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
        const res = await win.yijingAPI.comfyui.generate({
          serverUrl,
          workflowJson,
          prompt: text,
          options: { ...options, text, voice: options.voice || options.voiceName },
          model: options.model || config.defaultModel || '',
          params: { components: options.comfyComponents || config.components || [] },
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
  async cloneVoice(audioFile: File | string, config: any, options: any = {}): Promise<{ voiceId: string; name: string; previewUrl?: string }> {
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
