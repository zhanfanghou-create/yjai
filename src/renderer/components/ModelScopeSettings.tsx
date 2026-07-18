import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { MODELSCOPE_CATEGORIES } from '../../services/modelScopeService';

export const ModelScopeSettings: React.FC = () => {
  const s = useAppStore();
  const [apiKey, setApiKey] = useState(s.modelscopeConfig?.apiKey || '');
  const [authType, setAuthType] = useState<'apikey' | 'oauth'>(s.modelscopeConfig?.authType || 'apikey');
  const [testing, setTesting] = useState(false);
  const [connectStatus, setConnectStatus] = useState<'idle' | 'connected' | 'failed'>(
    s.modelscopeConfig?.enabled ? 'connected' : 'idle'
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    s.modelscopeConfig?.categories || []
  );
  
  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
  };
  
  const handleAuthTypeChange = (type: 'apikey' | 'oauth') => {
    setAuthType(type);
  };
  
  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };
  
  const testConnection = async () => {
    if (!apiKey.trim()) {
      s.showToast?.('请先填写 API Key', 'error');
      return;
    }
    
    setTesting(true);
    setConnectStatus('idle');
    
    try {
      const result = await s.testModelScopeConnection();
      if (result.ok) {
        setConnectStatus('connected');
        s.showToast?.('ModelScope 连接成功', 'success');
        s.setModelScopeConfig({
          id: 'modelscope-default',
          name: 'ModelScope 模型库',
          apiKey,
          authType,
          selectedModels: [],
          categories: selectedCategories,
          enabled: true,
        });
      } else {
        setConnectStatus('failed');
        s.showToast?.(`连接失败: ${result.error}`, 'error');
      }
    } catch (error: any) {
      setConnectStatus('failed');
      s.showToast?.(`连接失败: ${error.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };
  
  const handleOAuthLogin = () => {
    const redirectUri = `${window.location.origin}/modelscope-callback`;
    const oauthUrl = `https://www.modelscope.cn/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;
    window.open(oauthUrl, '_blank');
    s.showToast?.('请在弹出的窗口中完成授权', 'info');
  };
  
  const handleApplyApiKey = () => {
    window.open('https://www.modelscope.cn/my/profile/api-token', '_blank');
  };
  
  const handleSave = () => {
    s.setModelScopeConfig({
      id: 'modelscope-default',
      name: 'ModelScope 模型库',
      apiKey,
      authType,
      selectedModels: [],
      categories: selectedCategories,
      enabled: connectStatus === 'connected',
    });
    s.showToast?.('ModelScope 配置已保存', 'success');
  };
  
  return (
    <div className="sp-card">
      <div className="sp-card-head">
        <input className="sp-title-inp" value="ModelScope 模型库" readOnly />
      </div>
      
      <div className="sp-f">
        <label className="sp-lb">授权方式</label>
        <div className="sp-auth-type">
          <button 
            className={`sp-auth-btn ${authType === 'apikey' ? 'active' : ''}`}
            onClick={() => handleAuthTypeChange('apikey')}
          >
            API Key
          </button>
          <button 
            className={`sp-auth-btn ${authType === 'oauth' ? 'active' : ''}`}
            onClick={() => handleAuthTypeChange('oauth')}
          >
            OAuth 登录
          </button>
        </div>
      </div>
      
      {authType === 'apikey' ? (
        <>
          <div className="sp-f">
            <label className="sp-lb">API Key</label>
            <input 
              className="sp-inp" 
              type="password" 
              value={apiKey} 
              onChange={handleApiKeyChange} 
              placeholder="填写 ModelScope API Key" 
            />
          </div>
          <div className="sp-f">
            <button className="sp-link-btn" onClick={handleApplyApiKey}>
              没有 API Key？点击申请
            </button>
          </div>
        </>
      ) : (
        <div className="sp-f">
          <button className="sp-btn sp-oauth" onClick={handleOAuthLogin}>
            点击登录 ModelScope 账号授权
          </button>
        </div>
      )}
      
      <div className="sp-f">
        <label className="sp-lb">模型分类（可选）</label>
        <div className="sp-categories">
          {MODELSCOPE_CATEGORIES.map(cat => (
            <label key={cat.id} className="sp-category-item">
              <input 
                type="checkbox" 
                checked={selectedCategories.includes(cat.id)}
                onChange={() => handleCategoryToggle(cat.id)}
              />
              <span>{cat.icon} {cat.name}</span>
            </label>
          ))}
        </div>
      </div>
      
      <div className="sp-actions">
        <button 
          className={`sp-btn sp-test ${connectStatus === 'connected' ? 'ok' : connectStatus === 'failed' ? 'err' : ''}`}
          onClick={testConnection}
          disabled={testing || !apiKey.trim()}
        >
          {testing ? '测试中...' : connectStatus === 'connected' ? '已连接' : '测试连接'}
        </button>
        <button 
          className="sp-btn sp-save" 
          onClick={handleSave} 
          disabled={connectStatus !== 'connected'}
        >
          保存配置
        </button>
      </div>
      
      {connectStatus === 'connected' && (
        <div className="sp-success-msg">
          ✅ ModelScope 连接成功！现在可以在工具箱和画布中使用 ModelScope 模型。
        </div>
      )}
    </div>
  );
};
