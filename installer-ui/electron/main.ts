import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { execFile, spawn } from "node:child_process";
import { runInstall, payloadArchive, sevenZipExe, initializePayload } from "./install";

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
    // 使用 Node 原生 fs.statfs 获取磁盘空间，替代已废弃的 wmic（Win11 已移除 wmic 导致误报“存储不足”）
    if (process.platform === "win32") {
      const drive = (p.match(/^[A-Za-z]:/) || ["C:"])[0];
      const root = drive + "\\";
      const s = await fs.promises.statfs(root);
      const free = Number(s.bavail) * Number(s.bsize);
      const total = Number(s.blocks) * Number(s.bsize);
      return { freeGB: free / 1024 ** 3, totalGB: total / 1024 ** 3 };
    }
    const s = await fs.promises.statfs(p);
    const free = Number(s.bavail) * Number(s.bsize);
    const total = Number(s.blocks) * Number(s.bsize);
    return { freeGB: free / 1024 ** 3, totalGB: total / 1024 ** 3 };
  } catch {
    return { freeGB: 0, totalGB: 0 };
  }
}

async function findExistingInstallDir(): Promise<string | null> {
  try {
    if (process.platform !== "win32") {
      const macApp = path.join("/Applications", `${APP_NAME}.app`);
      if (fs.existsSync(macApp)) return macApp;
      return null;
    }
    const appExe = `${APP_NAME}.exe`;
    const isValidDir = (dir: string): boolean => {
      try {
        return !!(dir && fs.existsSync(dir) && fs.existsSync(path.join(dir, appExe)));
      } catch { return false; }
    };

    // 0. 检查命令行参数（软件内更新时传递的安装目录）
    const args = process.argv;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--install-dir" && i + 1 < args.length) {
        const dir = args[i + 1];
        if (isValidDir(dir)) {
          console.log("[Installer] 从命令行参数找到安装目录:", dir);
          return dir;
        }
      }
      if (args[i].startsWith("--install-dir=")) {
        const dir = args[i].substring("--install-dir=".length);
        if (isValidDir(dir)) {
          console.log("[Installer] 从命令行参数找到安装目录:", dir);
          return dir;
        }
      }
    }

    // 1. 检查 HKCU 注册表（用户级安装）
    const hkcuKey = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`;
    try {
      const out = await new Promise<string>((resolve, reject) => {
        execFile("reg", ["query", hkcuKey, "/v", "InstallLocation"], { windowsHide: true }, (err, stdout) =>
          err ? reject(err) : resolve(stdout)
        );
      });
      const m = out.match(/InstallLocation\\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\\s+(.+)/);
      if (m && m[1].trim()) {
        const dir = m[1].trim();
        if (isValidDir(dir)) {
          console.log("[Installer] 从HKCU注册表找到安装目录:", dir);
          return dir;
        }
      }
    } catch { /* HKCU注册表无记录 */ }

    // 2. 检查 HKLM 注册表（系统级安装）
    const hklmKeys = [
      `HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`,
      `HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`,
    ];
    for (const key of hklmKeys) {
      try {
        const out = await new Promise<string>((resolve, reject) => {
          execFile("reg", ["query", key, "/v", "InstallLocation"], { windowsHide: true }, (err, stdout) =>
            err ? reject(err) : resolve(stdout)
          );
        });
        const m = out.match(/InstallLocation\\s+REG_(?:SZ|EXPAND_SZ|MULTI_SZ)\\s+(.+)/);
        if (m && m[1].trim()) {
          const dir = m[1].trim();
          if (isValidDir(dir)) {
            console.log("[Installer] 从HKLM注册表找到安装目录:", dir);
            return dir;
          }
        }
      } catch { /* 该注册表位置无记录 */ }
    }

    // 3. 检查桌面快捷方式
    try {
      const desktopPaths = [
        path.join(os.homedir(), "Desktop", `${APP_NAME}.lnk`),
        path.join(process.env.PUBLIC || "C:\\Users\\Public", "Desktop", `${APP_NAME}.lnk`),
      ];
      for (const lnk of desktopPaths) {
        if (fs.existsSync(lnk)) {
          try {
            // 使用 PowerShell 解析快捷方式目标
            const out = await new Promise<string>((resolve) => {
              const ps = spawn("powershell", ["-NoProfile", "-Command",
                `(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}').TargetPath`],
                { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
              let stdout = "";
              ps.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
              ps.on("close", () => resolve(stdout.trim()));
            });
            if (out) {
              const dir = path.dirname(out);
              if (isValidDir(dir)) {
                console.log("[Installer] 从桌面快捷方式找到安装目录:", dir);
                return dir;
              }
            }
          } catch { /* 忽略 */ }
        }
      }
    } catch { /* 忽略 */ }

    // 4. 检查开始菜单快捷方式
    try {
      const startMenuPaths = [
        path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
          "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME, `${APP_NAME}.lnk`),
        path.join(process.env.ProgramData || "C:\\ProgramData",
          "Microsoft", "Windows", "Start Menu", "Programs", APP_NAME, `${APP_NAME}.lnk`),
      ];
      for (const lnk of startMenuPaths) {
        if (fs.existsSync(lnk)) {
          try {
            const out = await new Promise<string>((resolve) => {
              const ps = spawn("powershell", ["-NoProfile", "-Command",
                `(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}').TargetPath`],
                { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
              let stdout = "";
              ps.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
              ps.on("close", () => resolve(stdout.trim()));
            });
            if (out) {
              const dir = path.dirname(out);
              if (isValidDir(dir)) {
                console.log("[Installer] 从开始菜单快捷方式找到安装目录:", dir);
                return dir;
              }
            }
          } catch { /* 忽略 */ }
        }
      }
    } catch { /* 忽略 */ }

    // 5. 扫描常见安装目录
    const commonDirs = [
      defaultInstallDir(), // %LOCALAPPDATA%\Programs\艺镜AI-正式版
      path.join(process.env.PROGRAMFILES || "C:\\Program Files", APP_NAME),
      path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", APP_NAME),
      path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), APP_NAME),
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME),
      path.join("C:\\Program Files", APP_NAME),
      path.join("D:\\Program Files", APP_NAME),
      path.join("E:\\Program Files", APP_NAME),
      path.join("D:\\", APP_NAME),
      path.join("E:\\", APP_NAME),
    ];
    for (const dir of commonDirs) {
      if (isValidDir(dir)) {
        console.log("[Installer] 从常见目录找到安装目录:", dir);
        return dir;
      }
    }

    // 6. 通过正在运行的进程查找安装目录
    try {
      const out = await new Promise<string>((resolve) => {
        execFile("wmic", ["process", "where", `name='${appExe}'`, "get", "ExecutablePath", "/format:list"],
          { windowsHide: true }, (err, stdout) => resolve(stdout || ""));
      });
      const m = out.match(/ExecutablePath=(.+)/);
      if (m && m[1].trim()) {
        const dir = path.dirname(m[1].trim());
        if (isValidDir(dir)) {
          console.log("[Installer] 从运行进程找到安装目录:", dir);
          return dir;
        }
      }
    } catch { /* wmic可能不可用 */ }

    console.log("[Installer] 未找到已有的安装目录，将使用默认目录");
    return null;
  } catch (e) {
    console.error("[Installer] findExistingInstallDir 异常:", e);
    return null;
  }
}

function readLicenseText(): string {
  const candidates = [
    path.join(__dirname, "..", "resources", "license.txt"),
    process.resourcesPath ? path.join(process.resourcesPath, "license.txt") : "",
  ].filter(Boolean);
  const currentVersion = app.getVersion();
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        let text = fs.readFileSync(p, "utf8");
        // 动态替换协议中的版本号为当前版本
        text = text.replace(/版本[：:]\s*[\d.]+/g, `版本：${currentVersion}`);
        text = text.replace(/Version[：:]\s*[\d.]+/gi, `Version: ${currentVersion}`);
        return text;
      }
    } catch {}
  }
  return `艺镜AI-正式版 最终用户许可协议 (EULA)

版本: ${currentVersion}

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
    defaultPath: (await findExistingInstallDir()) || defaultInstallDir(),
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

    // 【关键】在安装开始前再次验证payload是否可用
    // 如果不可用，尝试重新初始化（从app.asar提取）
    let payloadResult = initializePayload();
    if (!payloadResult.ok) {
      console.error("[Installer] payload 不可用，尝试重新初始化...");
      payloadResult = initializePayload();
    }
    if (!payloadResult.ok) {
      const errorMsg = `安装初始化失败: ${payloadResult.error || "解压工具或主程序数据包不存在"}。请重新下载安装包后重试。`;
      console.error("[Installer]", errorMsg);
      return { ok: false, reason: errorMsg };
    }

    if (!fs.existsSync(payloadArchive())) {
      return { ok: false, reason: `未找到主程序数据包: ${payloadArchive()}` };
    }
    if (!fs.existsSync(sevenZipExe())) {
      return { ok: false, reason: `未找到解压工具: ${sevenZipExe()}` };
    }
    installing = true;
    try {
      await runInstall({ ...opts, version: app.getVersion() }, (payload) => send("installer:progress", payload), (log) => send("installer:log", log));
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
  // 【关键】在启动时就初始化payload，确保7za.exe和app.7z可用
  // 这是终极保障：如果所有路径都找不到，就从app.asar中提取到临时目录
  const payloadResult = initializePayload();
  console.log("[Installer] payload 初始化结果:", payloadResult);
  if (!payloadResult.ok) {
    console.error("[Installer] payload 初始化失败:", payloadResult.error);
    // 延迟通知渲染进程，确保窗口已创建
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("installer:log", {
          level: "error",
          text: `初始化失败: ${payloadResult.error || "未知错误"}。请尝试重新下载安装包。`,
        });
      }
    }, 1000);
  }

  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});