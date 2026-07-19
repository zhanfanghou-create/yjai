import { contextBridge, ipcRenderer } from 'electron';

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('yijingAPI', {
  // ComfyUI 相关
  comfyui: {
    connect: (config: any) => ipcRenderer.invoke('comfyui:connect', config),
    generate: (config: any) => ipcRenderer.invoke('comfyui:generate', config),
    getModels: (config: any) => ipcRenderer.invoke('comfyui:getModels', config),
    saveWorkflow: (config: any) => ipcRenderer.invoke('comfyui:saveWorkflow', config),
    selectWorkflowFile: () => ipcRenderer.invoke('comfyui:selectWorkflowFile'),
    capability: (config: any) => ipcRenderer.invoke('comfyui:capability', config),
    templates: (config: any) => ipcRenderer.invoke('comfyui:templates', config),
    templateWorkflow: (config: any) => ipcRenderer.invoke('comfyui:templateWorkflow', config),
  },
  
  // OpenAI 相关
  openai: {
    chat: (config: any) => ipcRenderer.invoke('openai:chat', config),
    generate: (config: any) => ipcRenderer.invoke('openai:generate', config),
  },
  
  // Grsai 相关（通过主进程 IPC 代理，绕过 CORS）
  grsai: {
    chat: (config: any) => ipcRenderer.invoke('grsai:chat', config),
    generate: (config: any) => ipcRenderer.invoke('grsai:generate', config),
    refreshModels: (config: any) => ipcRenderer.invoke('grsai:refreshModels', config),
    checkResult: (opts: any) => ipcRenderer.invoke('grsai:checkResult', opts),
    cancelJob: (opts: any) => ipcRenderer.invoke('grsai:cancelJob', opts),
  },
  // 订阅 Grsai 后台作业事件
  onGrsaiJobUpdate: (cb: (data: any) => void) => {
    const handler = (_ev: any, data: any) => cb(data);
    ipcRenderer.on('grsai:jobUpdate', handler);
    // 返回取消订阅函数
    return () => {
      ipcRenderer.removeListener('grsai:jobUpdate', handler);
    };
  },
  
  // 画布存储相关
  canvas: {
    save: (data: string) => ipcRenderer.invoke('canvas:save', data),
    load: (filePath: string) => ipcRenderer.invoke('canvas:load', filePath),
    list: () => ipcRenderer.invoke('canvas:list'),
  },
  
  // 窗口控制相关
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // FFmpeg 本地合成依赖检测 / 安装
  ffmpeg: {
    check: () => ipcRenderer.invoke('ffmpeg:check'),
    install: () => ipcRenderer.invoke('ffmpeg:install'),
  },
  
  // 系统信息
  system: {
    platform: process.platform,
    versions: process.versions,
    openPath: (p: string) => ipcRenderer.invoke('system:openPath', p),
    // 用系统默认浏览器打开外部网址（配置页“申请 API”等链接）
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    // 读取本地文件并以 Data URL 返回（支持 file:/// 路径和绝对 Windows 路径）
    readFileAsDataUrl: (p: string) => ipcRenderer.invoke('fs:readFileAsDataUrl', p),
    // 使用主进程显示保存对话框并将数据保存到目标路径
    saveFileFromData: (opts: { dataUrl: string; suggestedName?: string }) => ipcRenderer.invoke('system:saveFileFromData', opts),
    // 无对话框下载到本地 assets 目录，返回本地路径（统一让生成结果先落地再呈现）
    downloadToAssets: (opts: { url?: string; suggestedExt?: string; prefix?: string }) => ipcRenderer.invoke('system:downloadToAssets', opts),
    // 渲染进程上报运行期错误到主进程日志（crash.log）
    reportRendererError: (info: any) => ipcRenderer.invoke('system:reportRendererError', info),
  },
  
    // 第三方 API 转接服务（如硅基流动、智谱等）
    thirdParty: {
      request: (opts: any) => ipcRenderer.invoke('thirdparty:request', opts),
    },
    // Grsai 轮询配置接口
    grsaiConfig: {
      setPollingConfig: (cfg: any) => ipcRenderer.invoke('grsai:setPollingConfig', cfg),
      getPollingConfig: () => ipcRenderer.invoke('grsai:getPollingConfig'),
    },

    // 永久记忆系统
    memory: {
      writeFile: (path: string, content: string) => ipcRenderer.invoke('memory:writeFile', path, content),
      readFile: (path: string) => ipcRenderer.invoke('memory:readFile', path),
      deleteFile: (path: string) => ipcRenderer.invoke('memory:deleteFile', path),
      listFiles: (dirPath: string) => ipcRenderer.invoke('memory:listFiles', dirPath),
      ensureDir: (dirPath: string) => ipcRenderer.invoke('memory:ensureDir', dirPath),
    },

    // Short Video Factory - Edge TTS
    edgeTts: {
      getVoiceList: () => ipcRenderer.invoke('edgeTts:getVoiceList'),
      synthesizeToFile: (params: any) => ipcRenderer.invoke('edgeTts:synthesizeToFile', params),
      synthesizeToBase64: (params: any) => ipcRenderer.invoke('edgeTts:synthesizeToBase64', params),
    },

    // Short Video Factory - 视频渲染
    video: {
      render: (params: any, onProgress?: (progress: number) => void) => {
        const handler = (_ev: any, progress: number) => onProgress?.(progress);
        if (onProgress) ipcRenderer.on('video:renderProgress', handler);
        return ipcRenderer.invoke('video:render', params).finally(() => {
          if (onProgress) ipcRenderer.removeListener('video:renderProgress', handler);
        });
      },
    },

    // Short Video Factory - 文件系统
    fileSystem: {
      selectFolder: (options?: any) => ipcRenderer.invoke('fileSystem:selectFolder', options),
      listFilesFromFolder: (options: any) => ipcRenderer.invoke('fileSystem:listFilesFromFolder', options),
    },

    // 机器码 & 激活码
    license: {
      getMachineCode: () => ipcRenderer.invoke('license:getMachineCode'),
      validate: (activationCode: string, machineCode: string) => ipcRenderer.invoke('license:validate', activationCode, machineCode),
      getInfo: (machineCode: string) => ipcRenderer.invoke('license:getInfo', machineCode),
    },
});
