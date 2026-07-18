/**
 * ModelScope 模型库集成服务
 * 支持调用 ModelScope 在线模型
 */

// ModelScope 模型分类
export const MODELSCOPE_CATEGORIES = [
  { id: 'text-generation', name: '文本生成', icon: '📝' },
  { id: 'text-to-image', name: '文本生成图像', icon: '🎨' },
  { id: 'image-to-image', name: '图像生成图像', icon: '🖼️' },
  { id: 'text-to-video', name: '文本生成视频', icon: '🎬' },
  { id: 'image-to-video', name: '图像生成视频', icon: '🎥' },
  { id: 'text-to-voice', name: '文本转语音', icon: '🎤' },
  { id: 'voice-to-text', name: '语音转文本', icon: '🎙️' },
  { id: 'image-classification', name: '图像分类', icon: '🔍' },
  { id: 'object-detection', name: '目标检测', icon: '📦' },
  { id: 'segmentation', name: '图像分割', icon: '✂️' },
  { id: 'ocr', name: '文字识别', icon: '📄' },
  { id: 'translation', name: '机器翻译', icon: '🌐' },
  { id: 'question-answering', name: '问答系统', icon: '❓' },
  { id: 'sentiment-analysis', name: '情感分析', icon: '😊' },
  { id: 'summarization', name: '文本摘要', icon: '📋' },
];

// ModelScope 模型信息
export interface ModelScopeModel {
  id: string;
  modelId: string;
  name: string;
  description: string;
  category: string;
  tasks: string[];
  framework: string;
  license: string;
  stars: number;
  downloads: number;
  lastUpdated: string;
}

// ModelScope API 配置
export interface ModelScopeConfig {
  apiKey: string;
  authType: 'apikey' | 'oauth';
  oauthToken?: string;
  selectedCategories: string[];
  enabled: boolean;
}

/**
 * 测试 ModelScope API 连接
 */
export async function testModelScopeConnection(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('https://www.modelscope.cn/api/v1/models?Size=1', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      return { ok: true };
    }
    
    const error = await response.json();
    return { ok: false, error: error.message || '连接失败，请检查 API Key' };
  } catch (error: any) {
    return { ok: false, error: error.message || '网络连接失败' };
  }
}

/**
 * 获取 ModelScope 模型列表
 * @param category 模型分类（可选）
 * @param apiKey API Key
 * @param pageSize 每页数量
 * @param page 页码
 */
export async function fetchModelScopeModels(
  apiKey: string,
  category?: string,
  pageSize: number = 20,
  page: number = 1
): Promise<{ ok: boolean; models?: ModelScopeModel[]; error?: string; total?: number }> {
  try {
    let url = `https://www.modelscope.cn/api/v1/models?Size=${pageSize}&Page=${page}`;
    
    if (category) {
      url += `&Tasks=${encodeURIComponent(category)}`;
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { ok: false, error: error.message || '获取模型列表失败' };
    }
    
    const data = await response.json();
    
    // 转换模型数据格式
    const models: ModelScopeModel[] = (data.Data?.Models || []).map((m: any) => ({
      id: m.ModelId,
      modelId: m.ModelId,
      name: m.ModelName,
      description: m.Description || '',
      category: m.Tasks?.[0] || '其他',
      tasks: m.Tasks || [],
      framework: m.Framework || '',
      license: m.License || '',
      stars: m.Stars || 0,
      downloads: m.Downloads || 0,
      lastUpdated: m.LastUpdated || '',
    }));
    
    return {
      ok: true,
      models,
      total: data.Data?.Total || 0,
    };
  } catch (error: any) {
    return { ok: false, error: error.message || '获取模型列表失败' };
  }
}

/**
 * 调用 ModelScope 模型进行推理
 * @param modelId 模型ID
 * @param input 输入数据
 * @param apiKey API Key
 */
export async function callModelScopeModel(
  modelId: string,
  input: any,
  apiKey: string
): Promise<{ ok: boolean; url?: string; text?: string; error?: string }> {
  try {
    // ModelScope 推理 API 端点
    const url = `https://www.modelscope.cn/api/v1/models/${modelId}/inference`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { ok: false, error: error.message || '模型调用失败' };
    }
    
    const result = await response.json();
    
    // 根据返回结果类型处理
    if (result.url || result.data?.url) {
      return { ok: true, url: result.url || result.data?.url };
    }
    
    if (result.text || result.data?.text) {
      return { ok: true, text: result.text || result.data?.text };
    }
    
    // 默认返回 JSON 字符串
    return { ok: true, text: JSON.stringify(result) };
  } catch (error: any) {
    return { ok: false, error: error.message || '模型调用失败' };
  }
}

/**
 * 获取 ModelScope OAuth 授权链接
 * 用户可以通过此链接登录并授权
 */
export function getModelScopeOAuthUrl(redirectUri: string): string {
  const clientId = 'YOUR_CLIENT_ID'; // 需要在 ModelScope 开放平台注册应用获取
  const scope = 'read_models inference';
  return `https://www.modelscope.cn/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code`;
}

/**
 * 使用授权码换取访问令牌
 */
export async function exchangeModelScopeToken(
  code: string,
  redirectUri: string
): Promise<{ ok: boolean; token?: string; error?: string }> {
  try {
    const clientId = 'YOUR_CLIENT_ID';
    const clientSecret = 'YOUR_CLIENT_SECRET';
    
    const response = await fetch('https://www.modelscope.cn/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { ok: false, error: error.message || '授权失败' };
    }
    
    const data = await response.json();
    return { ok: true, token: data.access_token };
  } catch (error: any) {
    return { ok: false, error: error.message || '授权失败' };
  }
}

/**
 * 创建 ModelScope API Key 申请链接
 * 用户可以通过此链接申请 API Key
 */
export function getModelScopeApiKeyApplyUrl(): string {
  return 'https://www.modelscope.cn/my/profile/api-token';
}
