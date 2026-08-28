import { contextBridge, ipcRenderer } from 'electron';

// 鏆撮湶缁欐覆鏌撹繘绋嬬殑 API
contextBridge.exposeInMainWorld('yijingAPI', {
  // ComfyUI 鐩稿叧
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
  
  // OpenAI 鐩稿叧
  openai: {
    chat: (config: any) => ipcRenderer.invoke('openai:chat', config),
    generate: (config: any) => ipcRenderer.invoke('openai:generate', config),
  },
  
  // Grsai 鐩稿叧锛堥€氳繃涓昏繘绋?IPC 浠ｇ悊锛岀粫杩?CORS锛?
  grsai: {
    chat: (config: any) => ipcRenderer.invoke('grsai:chat', config),
    generate: (config: any) => ipcRenderer.invoke('grsai:generate', config),
    refreshModels: (config: any) => ipcRenderer.invoke('grsai:refreshModels', config),
    checkResult: (opts: any) => ipcRenderer.invoke('grsai:checkResult', opts),
    cancelJob: (opts: any) => ipcRenderer.invoke('grsai:cancelJob', opts),
  },
  // 璁㈤槄 Grsai 鍚庡彴浣滀笟浜嬩欢
  onGrsaiJobUpdate: (cb: (data: any) => void) => {
    const handler = (_ev: any, data: any) => cb(data);
    ipcRenderer.on('grsai:jobUpdate', handler);
    // 杩斿洖鍙栨秷璁㈤槄鍑芥暟
    return () => {
      ipcRenderer.removeListener('grsai:jobUpdate', handler);
    };
  },
  
  // 鐢诲竷瀛樺偍鐩稿叧
  canvas: {
    save: (data: string) => ipcRenderer.invoke('canvas:save', data),
    load: (filePath: string) => ipcRenderer.invoke('canvas:load', filePath),
    list: () => ipcRenderer.invoke('canvas:list'),
  },
  
  // 绐楀彛鎺у埗鐩稿叧
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },

  // FFmpeg 鏈湴鍚堟垚渚濊禆妫€娴?/ 瀹夎
  ffmpeg: {
    check: () => ipcRenderer.invoke('ffmpeg:check'),
    install: () => ipcRenderer.invoke('ffmpeg:install'),
  },
  
  // 绯荤粺淇℃伅
  system: {
    platform: process.platform,
    versions: process.versions,
    version: process.env.npm_package_version,
    openPath: (p: string) => ipcRenderer.invoke('system:openPath', p),
    checkUpdate: () => ipcRenderer.invoke('system:checkUpdate'),
    downloadUpdate: () => ipcRenderer.invoke('system:downloadUpdate'),
    installUpdate: (installerPath: string) => ipcRenderer.invoke('system:installUpdate', installerPath),
    onUpdateProgress: (cb: (data: any) => void) => {
      const handler = (_ev: any, data: any) => cb(data);
      ipcRenderer.on('system:updateProgress', handler);
      return () => ipcRenderer.removeListener('system:updateProgress', handler);
    },
    // 鐢ㄧ郴缁熼粯璁ゆ祻瑙堝櫒鎵撳紑澶栭儴缃戝潃锛堥厤缃〉鈥滅敵璇?API鈥濈瓑閾炬帴锛?
    openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),
    // 璇诲彇鏈湴鏂囦欢骞朵互 Data URL 杩斿洖锛堟敮鎸?file:/// 璺緞鍜岀粷瀵?Windows 璺緞锛?
    readFileAsDataUrl: (p: string) => ipcRenderer.invoke('fs:readFileAsDataUrl', p),
    // 浣跨敤涓昏繘绋嬫樉绀轰繚瀛樺璇濇骞跺皢鏁版嵁淇濆瓨鍒扮洰鏍囪矾寰?
    saveFileFromData: (opts: { dataUrl: string; suggestedName?: string }) => ipcRenderer.invoke('system:saveFileFromData', opts),
    // 鏃犲璇濇涓嬭浇鍒版湰鍦?assets 鐩綍锛岃繑鍥炴湰鍦拌矾寰勶紙缁熶竴璁╃敓鎴愮粨鏋滃厛钀藉湴鍐嶅憟鐜帮級
    downloadToAssets: (opts: { url?: string; suggestedExt?: string; prefix?: string }) => ipcRenderer.invoke('system:downloadToAssets', opts),
    // Convert remote URL to data URL (base64) to bypass CORS restrictions in renderer
    urlToDataUrl: (opts: { url?: string }) => ipcRenderer.invoke('system:urlToDataUrl', opts),
    // 娓叉煋杩涚▼涓婃姤杩愯鏈熼敊璇埌涓昏繘绋嬫棩蹇楋紙crash.log锛?
    reportRendererError: (info: any) => ipcRenderer.invoke('system:reportRendererError', info),
  },
  
    // 绗笁鏂?API 杞帴鏈嶅姟锛堝纭呭熀娴佸姩銆佹櫤璋辩瓑锛?
    thirdParty: {
      request: (opts: any) => ipcRenderer.invoke('thirdparty:request', opts),
    },
    // Grsai 杞閰嶇疆鎺ュ彛
    grsaiConfig: {
      setPollingConfig: (cfg: any) => ipcRenderer.invoke('grsai:setPollingConfig', cfg),
      getPollingConfig: () => ipcRenderer.invoke('grsai:getPollingConfig'),
    },

    // 姘镐箙璁板繂绯荤粺
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

    // Short Video Factory - 瑙嗛娓叉煋
    video: {
      render: (params: any, onProgress?: (progress: number) => void) => {
        const handler = (_ev: any, progress: number) => onProgress?.(progress);
        if (onProgress) ipcRenderer.on('video:renderProgress', handler);
        return ipcRenderer.invoke('video:render', params).finally(() => {
          if (onProgress) ipcRenderer.removeListener('video:renderProgress', handler);
        });
      },
    },

    // Short Video Factory - 鏂囦欢绯荤粺
    fileSystem: {
      selectFolder: (options?: any) => ipcRenderer.invoke('fileSystem:selectFolder', options),
      listFilesFromFolder: (options: any) => ipcRenderer.invoke('fileSystem:listFilesFromFolder', options),
    },

    // 鏈哄櫒鐮?& 婵€娲荤爜
    license: {
      getMachineCode: () => ipcRenderer.invoke('license:getMachineCode'),
      validate: (activationCode: string, machineCode: string) => ipcRenderer.invoke('license:validate', activationCode, machineCode),
      getInfo: (machineCode: string) => ipcRenderer.invoke('license:getInfo', machineCode),
    },
});
