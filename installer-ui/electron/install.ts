import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { extractEmbedded7za } from "./embedded7za";

export const APP_NAME = "艺镜AI-正式版";
const isDev = process.env.NODE_ENV === "development";

let cachedPayloadRoot: string | null = null;

function payloadRoot(): string {
  if (isDev) return path.resolve(__dirname, "..", "payload");
  if (cachedPayloadRoot) return cachedPayloadRoot;

  const candidates: string[] = [];
  const binName = process.platform === "win32" ? "7za.exe" : "7zz";

  // 1. asarUnpack路径（最可靠，portable模式下也能正常解压）
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const appPath = electron?.app?.getAppPath?.() || __dirname;
    if (appPath) {
      // resources/app.asar.unpacked/payload
      candidates.push(path.join(path.dirname(appPath), "app.asar.unpacked", "payload"));
      // app.asar.unpacked/payload（另一种路径形式）
      candidates.push(path.join(appPath, "..", "app.asar.unpacked", "payload"));
    }
  } catch { /* ignore */ }

  // 2. extraResources路径（标准）
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "payload"));
  }

  // 3. 可执行文件同级resources
  try {
    candidates.push(path.join(path.dirname(process.execPath), "resources", "payload"));
  } catch { /* ignore */ }

  // 4. __dirname上级目录的payload（dev或特殊打包模式）
  try {
    candidates.push(path.resolve(__dirname, "..", "payload"));
  } catch { /* ignore */ }

  // 打印所有候选路径，方便调试
  console.log("[Installer] payload 候选路径:", candidates);

  // 检查候选路径是否有效（同时包含 app.7z 和 bin/7za.exe）
  const isValidPath = (p: string): boolean => {
    try {
      return !!(p && fs.existsSync(p) &&
        fs.existsSync(path.join(p, "app.7z")) &&
        fs.existsSync(path.join(p, "bin", binName)));
    } catch { return false; }
  };

  for (const p of candidates) {
    if (isValidPath(p)) {
      console.log("[Installer] 找到 payload 目录:", p);
      cachedPayloadRoot = p;
      return p;
    }
  }

  // 都没找到时，尝试从 app.asar 中复制 payload 到临时目录（终极fallback）
  console.error("[Installer] 未找到同时包含 app.7z 和 bin/7za.exe 的 payload 目录!");
  // 详细打印每个候选路径的状态
  for (const p of candidates) {
    try {
      const hasDir = p && fs.existsSync(p);
      const has7z = hasDir && fs.existsSync(path.join(p, "app.7z"));
      const hasBin = hasDir && fs.existsSync(path.join(p, "bin", binName));
      console.error(`[Installer]   ${p}: dir=${hasDir}, app.7z=${has7z}, bin/${binName}=${hasBin}`);
    } catch (e) {
      console.error(`[Installer]   ${p}: 检查异常 ${e}`);
    }
  }

  // 尝试从 app.asar 中读取 payload 并复制到临时目录
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require("electron");
    const appPath = electron?.app?.getAppPath?.() || __dirname;
    const asarPayloadPath = path.join(appPath, "payload"); // app.asar 中的 payload 目录
    console.log("[Installer] 尝试从 app.asar 复制 payload:", asarPayloadPath);

    if (fs.existsSync(asarPayloadPath)) {
      const tempDir = path.join(os.tmpdir(), `yijing-payload-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      // 复制 app.7z
      const src7z = path.join(asarPayloadPath, "app.7z");
      const dst7z = path.join(tempDir, "app.7z");
      if (fs.existsSync(src7z)) {
        console.log("[Installer] 正在复制 app.7z 到临时目录...");
        fs.copyFileSync(src7z, dst7z);
        console.log("[Installer] app.7z 复制完成");
      }

      // 复制 bin 目录
      const srcBin = path.join(asarPayloadPath, "bin");
      const dstBin = path.join(tempDir, "bin");
      if (fs.existsSync(srcBin)) {
        fs.mkdirSync(dstBin, { recursive: true });
        const binFiles = fs.readdirSync(srcBin);
        for (const f of binFiles) {
          fs.copyFileSync(path.join(srcBin, f), path.join(dstBin, f));
        }
        console.log("[Installer] bin 目录复制完成");
      }

      if (isValidPath(tempDir)) {
        console.log("[Installer] 从 app.asar 复制 payload 成功:", tempDir);
        cachedPayloadRoot = tempDir;
        return tempDir;
      }
    }
  } catch (e) {
    console.error("[Installer] 从 app.asar 复制 payload 失败:", e);
  }

  // 最后fallback：返回第一个存在的目录
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        cachedPayloadRoot = p;
        return p;
      }
    } catch { /* ignore */ }
  }
  const fallback = candidates[0] || path.join(process.resourcesPath || "", "payload");
  cachedPayloadRoot = fallback;
  return fallback;
}
export function payloadArchive(): string {
  return path.join(payloadRoot(), "app.7z");
}
export function sevenZipExe(): string {
  const bin = process.platform === "win32" ? "7za.exe" : "7zz";
  // 【终极保障】优先使用内嵌的7za.exe，确保无论portable模式如何都能找到
  if (process.platform === "win32") {
    try {
      const embedded = extractEmbedded7za();
      if (embedded && fs.existsSync(embedded)) {
        return embedded;
      }
    } catch (e) {
      console.error("[Installer] 内嵌7za.exe提取失败，回退到payload目录:", e);
    }
  }
  return path.join(payloadRoot(), "bin", bin);
}

// 初始化payload：在安装器启动时调用，确保7za.exe和app.7z可用
// 这是终极保障：7za.exe使用内嵌资源，app.7z从app.asar中提取
export function initializePayload(): { ok: boolean; payloadDir: string; error?: string } {
  try {
    const binName = process.platform === "win32" ? "7za.exe" : "7zz";
    
    // 【终极保障1】优先使用内嵌的7za.exe
    let sevenZipPath = "";
    if (process.platform === "win32") {
      try {
        sevenZipPath = extractEmbedded7za();
        console.log("[Installer] initializePayload: 使用内嵌7za.exe =", sevenZipPath);
      } catch (e) {
        console.error("[Installer] 内嵌7za.exe提取失败:", e);
      }
    }
    
    const dir = payloadRoot();
    const app7z = path.join(dir, "app.7z");
    const sevenZip = sevenZipPath || path.join(dir, "bin", binName);

    console.log("[Installer] initializePayload: payloadDir =", dir);
    console.log("[Installer] initializePayload: app.7z exists =", fs.existsSync(app7z));
    console.log("[Installer] initializePayload: 7za.exe exists =", fs.existsSync(sevenZip));

    // 如果7za.exe不存在（内嵌也失败了），尝试从app.asar中提取
    if (!fs.existsSync(sevenZip)) {
      console.warn("[Installer] 7za.exe 不存在（内嵌也失败），尝试从 app.asar 提取...");
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require("electron");
        const appPath = electron?.app?.getAppPath?.() || __dirname;
        const asarPayloadPath = path.join(appPath, "payload");
        console.log("[Installer] app.asar payload path =", asarPayloadPath);
        console.log("[Installer] app.asar payload exists =", fs.existsSync(asarPayloadPath));

        if (fs.existsSync(asarPayloadPath)) {
          const tempDir = path.join(os.tmpdir(), `yijing-payload-${Date.now()}`);
          fs.mkdirSync(tempDir, { recursive: true });
          fs.mkdirSync(path.join(tempDir, "bin"), { recursive: true });

          // 复制 app.7z
          const src7z = path.join(asarPayloadPath, "app.7z");
          const dst7z = path.join(tempDir, "app.7z");
          if (fs.existsSync(src7z)) {
            const stat = fs.statSync(src7z);
            console.log(`[Installer] 正在复制 app.7z (${(stat.size / 1024 / 1024).toFixed(1)} MB)...`);
            fs.copyFileSync(src7z, dst7z);
            console.log("[Installer] app.7z 复制完成");
          } else {
            console.error("[Installer] app.asar 中找不到 app.7z");
          }

          // 复制 bin 目录下的所有文件
          const srcBin = path.join(asarPayloadPath, "bin");
          const dstBin = path.join(tempDir, "bin");
          if (fs.existsSync(srcBin)) {
            const binFiles = fs.readdirSync(srcBin);
            console.log("[Installer] bin 目录文件列表:", binFiles);
            for (const f of binFiles) {
              const srcFile = path.join(srcBin, f);
              const dstFile = path.join(dstBin, f);
              if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, dstFile);
                console.log(`[Installer] 已复制 ${f}`);
              }
            }
          } else {
            console.error("[Installer] app.asar 中找不到 bin 目录");
          }

          // 验证复制结果
          if (fs.existsSync(path.join(tempDir, "app.7z")) && fs.existsSync(path.join(tempDir, "bin", binName))) {
            console.log("[Installer] 从 app.asar 提取 payload 成功:", tempDir);
            cachedPayloadRoot = tempDir;
            return { ok: true, payloadDir: tempDir };
          } else {
            console.error("[Installer] 从 app.asar 提取 payload 失败：文件不完整");
            return { ok: false, payloadDir: tempDir, error: "从 app.asar 提取的文件不完整" };
          }
        } else {
          console.error("[Installer] app.asar 中找不到 payload 目录");
          return { ok: false, payloadDir: dir, error: "app.asar 中找不到 payload 目录" };
        }
      } catch (e) {
        console.error("[Installer] 从 app.asar 提取 payload 异常:", e);
        return { ok: false, payloadDir: dir, error: `从 app.asar 提取 payload 异常: ${String(e)}` };
      }
    }

    if (!fs.existsSync(app7z)) {
      console.error("[Installer] app.7z 不存在");
      return { ok: false, payloadDir: dir, error: "app.7z 不存在" };
    }

    console.log("[Installer] payload 初始化成功");
    return { ok: true, payloadDir: dir };
  } catch (e) {
    console.error("[Installer] payload 初始化异常:", e);
    return { ok: false, payloadDir: "", error: `payload 初始化异常: ${String(e)}` };
  }
}

type ProgressCb = (p: { percent: number; phase: string; label: string }) => void;
type LogCb = (p: { level: "info" | "warn" | "error"; text: string }) => void;

export async function runInstall(
  opts: {
    targetPath: string;
    createDesktopShortcut: boolean;
    createStartMenuShortcut: boolean;
    autoStart: boolean;
    version?: string;
  },
  onProgress: ProgressCb,
  onLog: LogCb
): Promise<void> {
  const target = opts.targetPath;
  onProgress({ percent: 0, phase: "prepare", label: "准备安装" });
  onLog({ level: "info", text: `目标目录: ${target}` });

  await fs.promises.mkdir(target, { recursive: true });
  onProgress({ percent: 5, phase: "prepare", label: "创建目录完成" });

  const archive = payloadArchive();
  const sz = sevenZipExe();

  // 覆盖/升级安装前，先结束正在运行的目标目录主程序，避免 exe 被占用导致解压失败
  try { await closeRunningApp(target); } catch (e) { onLog({ level: "warn", text: `关闭运行中程序失败: ${String(e)}` }); }

  onProgress({ percent: 10, phase: "extract", label: "正在释放主程序文件" });

  await new Promise<void>((resolve, reject) => {
    const args = ["x", archive, `-o${target}`, "-y", "-bsp1"];
    // stdin 设为 ignore，避免 Windows 临时目录运行时 stdin 管道创建失败导致 ENOTCONN
    const proc = spawn(sz, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let carry = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      carry += chunk.toString("utf8");
      const lines = carry.split(/[\r\n]+/);
      carry = lines.pop() || "";
      for (const line of lines) {
        const m = line.match(/(\d{1,3})%/);
        if (m) {
          const last = Number(m[1]);
          if (!Number.isNaN(last)) {
            const scaled = 10 + Math.min(75, Math.round(last * 0.75));
            onProgress({ percent: scaled, phase: "extract", label: `释放文件 ${last}%` });
          }
        }
      }
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      onLog({ level: "warn", text: chunk.toString("utf8").trim() });
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`7-Zip 解压失败, exit=${code}`));
    });
  });

  onProgress({ percent: 85, phase: "shortcut", label: "创建快捷方式" });

  if (process.platform === "win32") {
    try { await createWindowsShortcuts(target, opts); } catch (e) { onLog({ level: "warn", text: `快捷方式创建失败: ${String(e)}` }); }
    try { await writeUninstaller(target); } catch (e) { onLog({ level: "warn", text: `卸载器写入失败: ${String(e)}` }); }
    try { await writeUninstallRegistry(target, opts.version || require("../package.json").version); } catch (e) { onLog({ level: "warn", text: `卸载登记写入失败: ${String(e)}` }); }
    if (opts.autoStart) {
      try { await writeAutoStart(target); } catch (e) { onLog({ level: "warn", text: `开机自启写入失败: ${String(e)}` }); }
    }
  }

  onProgress({ percent: 100, phase: "done", label: "安装完成" });
}

// ---------------- Windows helpers ----------------

function psQuote(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

// 结束运行中的旧版主程序（覆盖/升级安装时需要，避免文件被占用导致解压失败）
async function closeRunningApp(target: string): Promise<void> {
  if (process.platform !== "win32") return;
  const exe = path.join(target, `${APP_NAME}.exe`);
  if (!fs.existsSync(exe)) return;
  try {
    await runPowerShell(`Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ${psQuote(exe)} } | Stop-Process -Force -ErrorAction SilentlyContinue`);
    await new Promise((r) => setTimeout(r, 500));
  } catch { /* 无运行实例时忽略 */ }
}

async function runPowerShell(script: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    let err = "";
    proc.stderr.on("data", (c: Buffer) => (err += c.toString("utf8")));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`powershell exit ${code}: ${err.trim()}`))
    );
  });
}

async function createWindowsShortcuts(
  target: string,
  opts: { createDesktopShortcut: boolean; createStartMenuShortcut: boolean }
): Promise<void> {
  const exe = path.join(target, `${APP_NAME}.exe`);
  const desktop = path.join(os.homedir(), "Desktop", `${APP_NAME}.lnk`);
  const startMenuDir = path.join(
    process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    APP_NAME
  );
  const startMenu = path.join(startMenuDir, `${APP_NAME}.lnk`);

  const scriptParts: string[] = [
    "$sh = New-Object -ComObject WScript.Shell",
  ];
  if (opts.createDesktopShortcut) {
    scriptParts.push(
      `$s = $sh.CreateShortcut(${psQuote(desktop)}); ` +
      `$s.TargetPath=${psQuote(exe)}; ` +
      `$s.WorkingDirectory=${psQuote(target)}; ` +
      `$s.IconLocation=${psQuote(exe + ",0")}; ` +
      `$s.Save()`
    );
  }
  if (opts.createStartMenuShortcut) {
    scriptParts.push(`New-Item -ItemType Directory -Force -Path ${psQuote(startMenuDir)} | Out-Null`);
    scriptParts.push(
      `$s = $sh.CreateShortcut(${psQuote(startMenu)}); ` +
      `$s.TargetPath=${psQuote(exe)}; ` +
      `$s.WorkingDirectory=${psQuote(target)}; ` +
      `$s.IconLocation=${psQuote(exe + ",0")}; ` +
      `$s.Save()`
    );
  }
  if (scriptParts.length > 1) {
    await runPowerShell(scriptParts.join("; "));
  }
}

async function writeUninstaller(target: string): Promise<void> {
  const bat = path.join(target, "Uninstall.cmd");
  const cmd = `@echo off\r\nchcp 65001 >NUL\r\n` +
    `echo 正在卸载 ${APP_NAME} ...\r\n` +
    `taskkill /IM "${APP_NAME}.exe" /F >NUL 2>&1\r\n` +
    `timeout /t 1 >NUL\r\n` +
    `del /Q "%USERPROFILE%\\Desktop\\${APP_NAME}.lnk" >NUL 2>&1\r\n` +
    `rmdir /S /Q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\${APP_NAME}" >NUL 2>&1\r\n` +
    `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}" /f >NUL 2>&1\r\n` +
    `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_NAME}" /f >NUL 2>&1\r\n` +
    `start "" cmd /c "timeout /t 1 >NUL & rmdir /S /Q \"${target}\""\r\n` +
    `exit /b 0\r\n`;
  await fs.promises.writeFile(bat, cmd, { encoding: "utf8" });
}

async function writeUninstallRegistry(target: string, version: string): Promise<void> {
  const uninstBat = path.join(target, "Uninstall.cmd");
  const iconExe = path.join(target, `${APP_NAME}.exe`);
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_NAME}`;
  const script = [
    `reg add ${psQuote(key)} /v DisplayName /t REG_SZ /d ${psQuote(APP_NAME)} /f`,
    `reg add ${psQuote(key)} /v DisplayVersion /t REG_SZ /d ${psQuote(version || require("../package.json").version)} /f`,
    `reg add ${psQuote(key)} /v InstallLocation /t REG_SZ /d ${psQuote(target)} /f`,
    `reg add ${psQuote(key)} /v DisplayIcon /t REG_SZ /d ${psQuote(iconExe)} /f`,
    `reg add ${psQuote(key)} /v UninstallString /t REG_SZ /d ${psQuote('"' + uninstBat + '"')} /f`,
    `reg add ${psQuote(key)} /v Publisher /t REG_SZ /d ${psQuote("艺镜 AI 团队")} /f`,
    `reg add ${psQuote(key)} /v NoModify /t REG_DWORD /d 1 /f`,
    `reg add ${psQuote(key)} /v NoRepair /t REG_DWORD /d 1 /f`,
  ].join("; ");
  await runPowerShell(script);
}

async function writeAutoStart(target: string): Promise<void> {
  const exe = path.join(target, `${APP_NAME}.exe`);
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const script = `reg add ${psQuote(key)} /v ${psQuote(APP_NAME)} /t REG_SZ /d ${psQuote('"' + exe + '"')} /f`;
  await runPowerShell(script);
}