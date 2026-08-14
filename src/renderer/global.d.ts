// 全局类型定义
// 为 window.yijingAPI 添加类型声明（唯一权威来源）

export {};

declare global {
  interface Window {
    yijingAPI?: {
      comfyui?: {
        connect: (config: any) => Promise<any>;
        generate: (config: any) => Promise<any>;
        getModels: (config: any) => Promise<any>;
        saveWorkflow: (config: any) => Promise<any>;
        selectWorkflowFile: () => Promise<any>;
      };
      openai?: {
        chat: (config: any) => Promise<any>;
        generate: (config: any) => Promise<any>;
      };
      grsai?: {
        chat: (config: {
          baseUrl: string;
          apiKey: string;
          model: string;
          messages: { role: string; content: string }[];
          stream?: boolean;
        }) => Promise<{ ok: boolean; connected?: boolean; status?: number; data?: any; error?: string }>;
        generate: (config: {
          baseUrl: string;
          apiKey: string;
          model: string;
          prompt: string;
          aspectRatio?: string;
        }) => Promise<{ ok: boolean; data?: any; error?: string; accepted?: boolean; id?: string }>;
        refreshModels: (config: any) => Promise<any>;
        checkResult: (opts: any) => Promise<any>;
        cancelJob: (opts: any) => Promise<any>;
      };
      onGrsaiJobUpdate?: (cb: (data: any) => void) => () => void;
      canvas?: {
        save: (data: string) => Promise<any>;
        load: (filePath: string) => Promise<any>;
        list: () => Promise<any>;
      };
      window?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      ffmpeg?: {
        check: () => Promise<any>;
        install: () => Promise<any>;
      };
      system?: {
        platform: string;
        versions: Record<string, string | undefined>;
        openPath: (p: string) => Promise<any>;
        version: string;
        // 自动更新相关类型
        checkUpdate: () => Promise<{
          ok: boolean;
          error?: string;
          hasUpdate?: boolean;
          currentVersion?: string;
          latestVersion?: string;
          releaseName?: string;
          releaseNotes?: string;
          publishDate?: string;
          downloadUrl?: string;
          fileName?: string;
          fileSize?: number;
          sha256?: string;
        }>;
        downloadUpdate: () => Promise<{
          ok: boolean;
          error?: string;
          path?: string;
          fileName?: string;
          size?: number;
          sha256?: string;
          sha256Verified?: boolean;
          expectedSha256?: string;
          latestVersion?: string;
        }>;
        installUpdate: (installerPath: string) => Promise<{ ok: boolean; error?: string }>;
        onUpdateProgress: (cb: (data: { progress: number; downloaded: number; total: number }) => void) => () => void;
        openExternal?: (url: string) => Promise<any>;
        readFileAsDataUrl: (p: string) => Promise<any>;
        saveFileFromData: (opts: { dataUrl: string; suggestedName?: string }) => Promise<any>;
        downloadToAssets?: (opts: { url?: string; suggestedExt?: string; prefix?: string }) => Promise<any>;
        reportRendererError?: (info: any) => Promise<any>;
      };
      thirdParty?: {
        request: (opts: any) => Promise<any>;
      };
      grsaiConfig?: {
        setPollingConfig: (cfg: any) => Promise<any>;
        getPollingConfig: () => Promise<any>;
      };
      memory?: {
        writeFile: (path: string, content: string) => Promise<any>;
        readFile: (path: string) => Promise<any>;
        deleteFile: (path: string) => Promise<any>;
        listFiles: (dirPath: string) => Promise<any>;
        ensureDir: (dirPath: string) => Promise<any>;
      };
      edgeTts?: {
        getVoiceList: () => Promise<any>;
        synthesizeToFile: (params: any) => Promise<any>;
        synthesizeToBase64: (params: any) => Promise<any>;
      };
      video?: {
        render: (params: any, onProgress?: (progress: number) => void) => Promise<any>;
      };
      fileSystem?: {
        selectFolder: (options?: any) => Promise<any>;
        listFilesFromFolder: (options: any) => Promise<any>;
      };
      license?: {
        getMachineCode: () => Promise<string>;
        validate: (activationCode: string, machineCode: string) => Promise<{ valid: boolean; error?: string; expiresAt?: string; daysLeft?: number }>;
        getInfo: (machineCode: string) => Promise<{ status: 'trial' | 'activated' | 'expired'; machineCode: string; activationCode?: string; activatedAt?: string; expiresAt?: string; daysLeft: number; message?: string; trialStartedAt?: string }>;
      };
    };
  }
}
