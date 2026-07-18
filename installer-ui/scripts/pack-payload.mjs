#!/usr/bin/env node
// 打包主程序为 payload/app.7z, 并把独立的 7zr.exe 放进 payload/bin/7za.exe。
// 使用方式:
//   node scripts/pack-payload.mjs                 // 使用默认路径 (../release/win-unpacked)
//   node scripts/pack-payload.mjs <source-dir>    // 显式指定 win-unpacked 目录
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const installerRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(installerRoot, "..");
const payloadDir = path.join(installerRoot, "payload");
const binDir = path.join(payloadDir, "bin");

const source = process.argv[2] || path.join(repoRoot, "release", "win-unpacked");
if (!fs.existsSync(source)) {
  console.error(`payload source not found: ${source}`);
  process.exit(1);
}
fs.mkdirSync(payloadDir, { recursive: true });
fs.mkdirSync(binDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const doGet = (u, redirects = 0) => {
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          return doGet(res.headers.location, redirects + 1);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} ${u}`));
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      }).on("error", reject);
    };
    doGet(url);
  });
}

async function ensure7z() {
  const isWin = process.platform === "win32";
  const runtimeName = isWin ? "7za.exe" : "7zz";
  const runtimeDest = path.join(binDir, runtimeName);
  if (!fs.existsSync(runtimeDest)) {
    if (isWin) {
      // 7zr.exe 是官方发布的独立单文件版本，不依赖 7z.dll，可作为运行时解压器
      console.log("downloading 7zr.exe ...");
      await download("https://www.7-zip.org/a/7zr.exe", runtimeDest);
    } else {
      // mac/linux 依赖系统的 p7zip
      const which = spawnSync("which", ["7zz"], { encoding: "utf8" });
      const p = (which.stdout || "").trim().split(/\r?\n/)[0];
      if (!p || !fs.existsSync(p)) {
        throw new Error("mac/linux 请先安装 p7zip: brew install p7zip");
      }
      fs.copyFileSync(p, runtimeDest);
      fs.chmodSync(runtimeDest, 0o755);
    }
  }
  console.log("runtime 7z:", runtimeDest);
  return runtimeDest;
}

const sz = await ensure7z();

// 用刚保存的 runtime 7z 直接压缩 (7zr.exe 支持 a/x/l 等常用命令)
const archive = path.join(payloadDir, "app.7z");
try { fs.rmSync(archive, { force: true }); } catch {}
console.log(`compress ${source} -> ${archive}`);
const args = ["a", "-t7z", "-mx=5", "-ms=on", archive, path.join(source, "*")];
const r = spawnSync(sz, args, { stdio: "inherit" });
if (r.status !== 0) {
  console.error("7z 打包失败");
  process.exit(r.status || 1);
}
const size = fs.statSync(archive).size;
console.log(`payload 打包完成: ${(size / 1024 / 1024).toFixed(1)} MB`);
