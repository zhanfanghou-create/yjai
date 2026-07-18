/// <reference types="vite/client" />

export type ProgressPayload = { percent: number; phase: string; label: string };
export type LogPayload = { level: "info" | "warn" | "error"; text: string };

export interface InstallerBridge {
  getMeta: () => Promise<{
    appName: string;
    version: string;
    defaultPath: string;
    licenseText: string;
    platform: NodeJS.Platform;
  }>;
  pickDirectory: (current: string) => Promise<string | null>;
  diskInfo: (p: string) => Promise<{ freeGB: number; totalGB: number; needGB: number }>;
  openPath: (p: string) => Promise<boolean>;
  launchApp: (installDir: string) => Promise<boolean>;
  quit: () => Promise<void>;
  minimize: () => Promise<void>;
  start: (opts: {
    targetPath: string;
    createDesktopShortcut: boolean;
    createStartMenuShortcut: boolean;
    autoStart: boolean;
  }) => Promise<{ ok: boolean; reason?: string }>;
  onProgress: (cb: (p: ProgressPayload) => void) => () => void;
  onLog: (cb: (p: LogPayload) => void) => () => void;
}

declare global {
  interface Window {
    installer?: InstallerBridge;
  }
}