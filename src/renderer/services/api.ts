export const comfyuiService = {
  // 默认 ComfyUI 服务器地址（用户未配置时使用，仅作 localhost 回退提示）
  defaultServer: '',
  
  // 文生图工作流模板
  textToImageWorkflow: {
    "3": {
      "class_type": "KSampler",
      "inputs": {
        "seed": 123456,
        "steps": 20,
        "cfg": 7,
        "sampler_name": "euler",
        "scheduler": "normal",
        "denoise": 1,
        "model": ["4", 0],
        "positive": ["6", 0],
        "negative": ["7", 0],
        "latent_image": ["5", 0]
      }
    },
    "4": {
      "class_type": "CheckpointLoaderSimple",
      "inputs": {
        "ckpt_name": "v1-5-pruned-emaonly.ckpt"
      }
    },
    "5": {
      "class_type": "EmptyLatentImage",
      "inputs": {
        "width": 512,
        "height": 512,
        "batch_size": 1
      }
    },
    "6": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": "",
        "clip": ["4", 1]
      }
    },
    "7": {
      "class_type": "CLIPTextEncode",
      "inputs": {
        "text": "bad quality",
        "clip": ["4", 1]
      }
    },
    "8": {
      "class_type": "VAEDecode",
      "inputs": {
        "samples": ["3", 0],
        "vae": ["4", 2]
      }
    },
    "9": {
      "class_type": "SaveImage",
      "inputs": {
        "filename_prefix": "YijingAI",
        "images": ["8", 0]
      }
    }
  },
  
  // 图生视频工作流模板（基于 AnimateDiff）
  imageToVideoWorkflow: {
    "1": {
      "class_type": "AnimateDiffLoaderWithContext",
      "inputs": {
        "model_name": "mm_sd_v15.ckpt",
        "beta_schedule": "autoselect",
        "frame_rate": 8,
        "context_length": 16,
        "context_stride": 1
      }
    }
  },
  
  // 构建文生图请求
  buildTextToImageRequest(prompt: string, negativePrompt: string, options: any = {}) {
    const workflow = JSON.parse(JSON.stringify(this.textToImageWorkflow));
    workflow["6"].inputs.text = prompt;
    workflow["7"].inputs.text = negativePrompt || "bad quality, blurry";
    
    if (options.width) workflow["5"].inputs.width = options.width;
    if (options.height) workflow["5"].inputs.height = options.height;
    if (options.steps) workflow["3"].inputs.steps = options.steps;
    if (options.seed) workflow["3"].inputs.seed = options.seed;
    if (options.checkpoint) workflow["4"].inputs.ckpt_name = options.checkpoint;
    
    return workflow;
  },
  
  // 检查服务器连接
  async checkConnection(serverUrl?: string) {
    const url = serverUrl || this.defaultServer;
    try {
      // Use IPC via preload to avoid CORS and keep network code in main process
      const res = await (window as any).yijingAPI.comfyui.connect({ serverUrl: url });
      return res?.ok === true;
    } catch {
      return false;
    }
  },
  
  // 获取模型列表
  async getModels(serverUrl?: string) {
    const url = serverUrl || this.defaultServer;
    try {
      const res = await (window as any).yijingAPI.comfyui.getModels({ serverUrl: url });
      if (res?.ok && res.models) return res.models;
      return res?.models || [];
    } catch {
      return [];
    }
  }
};

export const openaiService = {
  baseUrl: '',
  
  // 文生图
  async generateImage(apiKey: string, prompt: string, options: any = {}) {
    try {
      const win = window as any;
      if (win?.yijingAPI?.openai?.generate) {
        const res = await win.yijingAPI.openai.generate({
          apiKey,
          baseUrl: options.baseUrl || this.baseUrl,
          model: options.model,
          prompt,
          size: options.size || '1024x1024',
          quality: options.quality || 'standard',
          n: options.n || 1,
        });
        return res;
      }

      const baseUrl = options.baseUrl || this.baseUrl;
      const response = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          prompt,
          size: options.size || '1024x1024',
          quality: options.quality || 'standard',
          n: options.n || 1,
        }),
      });

      return response.json();
    } catch (err) {
      return { error: (err as Error).message };
    }
  },
  
  // 图像编辑（图生图）
  async editImage(apiKey: string, image: File, prompt: string, options: any = {}) {
    try {
      const win = window as any;
      if (win?.yijingAPI?.openai?.generate && image) {
        // Fallback: we can't easily send FormData via IPC; keep direct fetch for editImage
      }

      const formData = new FormData();
      formData.append('image', image);
      formData.append('prompt', prompt);
      formData.append('size', options.size || '1024x1024');

      const baseUrl = options.baseUrl || this.baseUrl;
      const response = await fetch(`${baseUrl}/images/edits`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        body: formData,
      });

      return response.json();
    } catch (err) {
      return { error: (err as Error).message };
    }
  },
  
  // ChatGPT 对话
  async chat(apiKey: string, messages: any[], options: any = {}) {
    try {
      const win = window as any;
      if (win?.yijingAPI?.openai?.chat) {
        const res = await win.yijingAPI.openai.chat({
          apiKey,
          baseUrl: options.baseUrl || this.baseUrl,
          model: options.model,
          messages,
          temperature: options.temperature || 0.7,
        });
        return res;
      }

      const baseUrl = options.baseUrl || this.baseUrl;
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          temperature: options.temperature || 0.7,
        }),
      });

      return response.json();
    } catch (err) {
      return { error: (err as Error).message };
    }
  }
};

// 第三方 API 转接服务（如硅基流动、智谱等）
export const thirdPartyService = {
  // 硅基流动
  siliconflow: {
    baseUrl: '',
    
    async generateImage(apiKey: string, prompt: string, model?: string) {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '1024x1024',
        }),
      });
      
      return response.json();
    }
  },
  
  // 智谱 AI
  zhipu: {
    baseUrl: '',
    
    async generateImage(apiKey: string, prompt: string, options: { model?: string; baseUrl?: string } = {}) {
      try {
        const win = window as any;
        if (win?.yijingAPI?.thirdParty?.request) {
          const res = await win.yijingAPI.thirdParty.request({
            method: 'POST',
            url: `${this.baseUrl}/images/generations`,
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: { model: options.model || '', prompt },
          });
          return res.data ?? res;
        }

        const baseUrl = options.baseUrl || this.baseUrl;
      const response = await fetch(`${baseUrl}/images/generations`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model || '',
            prompt,
          }),
        });
        
        return response.json();
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  }
};
