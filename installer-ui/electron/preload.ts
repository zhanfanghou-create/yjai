import { contextBridge, ipcRenderer } from "electron";

type ProgressPayload = { percent: number; phase: string; label: string };
type LogPayload = { level: "info" | "warn" | "error"; text: string };

const api = {
  getMeta: () => ipcRenderer.invoke("installer:getMeta"),
  pickDirectory: (current: string) => ipcRenderer.invoke("installer:pickDirectory", current),
  diskInfo: (p: string) => ipcRenderer.invoke("installer:diskInfo", p),
  openPath: (p: string) => ipcRenderer.invoke("installer:openPath", p),
  launchApp: (installDir: string) => ipcRenderer.invoke("installer:launchApp", installDir),
  quit: () => ipcRenderer.invoke("installer:quit"),
  minimize: () => ipcRenderer.invoke("installer:minimize"),
  start: (opts: {
    targetPath: string;
    createDesktopShortcut: boolean;
    createStartMenuShortcut: boolean;
    autoStart: boolean;
  }) => ipcRenderer.invoke("installer:start", opts),
  onProgress: (cb: (p: ProgressPayload) => void) => {
    const l = (_: unknown, p: ProgressPayload) => cb(p);
    ipcRenderer.on("installer:progress", l);
    return () => ipcRenderer.removeListener("installer:progress", l);
  },
  onLog: (cb: (p: LogPayload) => void) => {
    const l = (_: unknown, p: LogPayload) => cb(p);
    ipcRenderer.on("installer:log", l);
    return () => ipcRenderer.removeListener("installer:log", l);
  },
};

contextBridge.exposeInMainWorld("installer", api);
export type InstallerBridge = typeof api;