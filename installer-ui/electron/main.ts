import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execFile, spawn } from "node:child_process";
import { runInstall, payloadArchive, sevenZipExe } from "./install";

const isDev = process.env.NODE_ENV === "development";
const APP_NAME = "艺镜AI-正式版";

let mainWindow: BrowserWindow | null = null;
let installing = false;

function defaultInstallDir(): string {
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "Programs", APP_NAME);
  }
  return path.join("/Applications", `${APP_NAME}.app`);
}

async function pathDiskInfo(p: string): Promise<{ freeGB: number; totalGB: number }> {
  try {
    if (process.platform === "win32") {
      const drive = (p.match(/^[A-Za-z]:/) || ["C:"])[0];
      const out = await new Promise<string>((resolve, reject) => {
        execFile(
          "wmic",
          ["logicaldisk", "where", `Caption='${drive}'`, "get", "FreeSpace,Size", "/format:list"],
          { windowsHide: true },
          (err, stdout) => (err ? reject(err) : resolve(stdout))
        );
      });
      const free = Number((out.match(/FreeSpace=(\d+)/) || [])[1] || 0);
      const size = Number((out.match(/Size=(\d+)/) || [])[1] || 0);
      return { freeGB: free / 1024 ** 3, totalGB: size / 1024 ** 3 };
    }
    const out = await new Promise<string>((resolve, reject) => {
      execFile("df", ["-Pk", p], (err, stdout) => (err ? reject(err) : resolve(stdout)));
    });
    const line = out.trim().split(/\n/).pop() || "";
    const cols = line.split(/\s+/);
    const totalK = Number(cols[1] || 0);
    const availK = Number(cols[3] || 0);
    return { freeGB: (availK * 1024) / 1024 ** 3, totalGB: (totalK * 1024) / 1024 ** 3 };
  } catch {
    return { freeGB: 0, totalGB: 0 };
  }
}

function readLicenseText(): string {
  const candidates = [
    path.join(__dirname, "..", "resources", "license.txt"),
    process.resourcesPath ? path.join(process.resourcesPath, "license.txt") : "",
  ].filter(Boolean);
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
    } catch {}
  }
  return `艺镜AI-正式版 最终用户许可协议 (EULA)

版本: ${app.getVersion()}

请在使用本软件前仔细阅读本协议全部内容。安装或使用本软件即表示您已阅读、理解并接受本协议全部条款。`;
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1180,
    height: 740,
    resizable: false,
    frame: false,
    backgroundColor: "#0E0B1F",
    title: `${APP_NAME} 安装`,
    icon: path.join(__dirname, "..", "public", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.setMenuBarVisibility(false);
  if (isDev) {
    win.loadURL("http://127.0.0.1:5180/");
    // devtools 可按需开启：注释掉避免生产误触
    // win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"));
  }
  mainWindow = win;
  win.on("closed", () => (mainWindow = null));
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function registerIpc(): void {
  ipcMain.handle("installer:getMeta", async () => ({
    appName: APP_NAME,
    version: app.getVersion(),
    defaultPath: defaultInstallDir(),
    licenseText: readLicenseText(),
    platform: process.platform,
  }));

  ipcMain.handle("installer:pickDirectory", async (_e, current: string) => {
    const res: any = await (dialog.showOpenDialog as any)(mainWindow!, {
      title: "选择安装目录",
      defaultPath: current || defaultInstallDir(),
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const chosen = res.filePaths[0];
    if (path.basename(chosen) === APP_NAME) return chosen;
    return path.join(chosen, APP_NAME);
  });

  ipcMain.handle("installer:diskInfo", async (_e, p: string) => {
    const info = await pathDiskInfo(p);
    return { ...info, needGB: 1.25 };
  });

  ipcMain.handle("installer:openPath", async (_e, p: string) => {
    if (!p || !fs.existsSync(p)) return false;
    await shell.openPath(p);
    return true;
  });

  ipcMain.handle("installer:launchApp", async (_e, installDir: string) => {
    try {
      if (process.platform === "win32") {
        const exe = path.join(installDir, `${APP_NAME}.exe`);
        spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
      } else {
        spawn("open", [installDir], { detached: true, stdio: "ignore" }).unref();
      }
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("installer:quit", async () => app.quit());
  ipcMain.handle("installer:minimize", async () => mainWindow?.minimize());

  ipcMain.handle("installer:start", async (_e, opts) => {
    if (installing) return { ok: false, reason: "已在安装" };
    if (!fs.existsSync(payloadArchive())) {
      return { ok: false, reason: `未找到主程序数据包: ${payloadArchive()}` };
    }
    if (!fs.existsSync(sevenZipExe())) {
      return { ok: false, reason: `未找到解压工具: ${sevenZipExe()}` };
    }
    installing = true;
    try {
      await runInstall(opts, (payload) => send("installer:progress", payload), (log) => send("installer:log", log));
      return { ok: true };
    } catch (e: any) {
      const msg = String(e && (e.message || e));
      send("installer:log", { level: "error", text: msg });
      return { ok: false, reason: msg };
    } finally {
      installing = false;
    }
  });
}

// 全局未捕获异常处理：避免子进程 spawn 等错误导致安装器崩溃白屏
process.on("uncaughtException", (error) => {
  console.error("[Installer] uncaughtException:", error);
  // 尝试通过 IPC 通知渲染进程，如果窗口已创建
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("installer:log", {
      level: "error",
      text: `安装过程异常: ${error.message || String(error)}`,
    });
  }
});
process.on("unhandledRejection", (reason) => {
  console.error("[Installer] unhandledRejection:", reason);
});

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});