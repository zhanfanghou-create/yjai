import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { spawn } from "node:child_process";

export const APP_NAME = "艺镜AI-正式版";
const isDev = process.env.NODE_ENV === "development";

function payloadRoot(): string {
  if (isDev) return path.resolve(__dirname, "..", "payload");
  return path.join(process.resourcesPath, "payload");
}
export function payloadArchive(): string {
  return path.join(payloadRoot(), "app.7z");
}
export function sevenZipExe(): string {
  const bin = process.platform === "win32" ? "7za.exe" : "7zz";
  return path.join(payloadRoot(), "bin", bin);
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
    try { await writeUninstallRegistry(target, opts.version || "1.2.17"); } catch (e) { onLog({ level: "warn", text: `卸载登记写入失败: ${String(e)}` }); }
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
    `reg add ${psQuote(key)} /v DisplayVersion /t REG_SZ /d ${psQuote(version || "1.2.17")} /f`,
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