#!/usr/bin/env node
// 鎵撳寘涓荤▼搴忎负 payload/app.7z, 骞舵妸鐙珛鐨?7zr.exe 鏀捐繘 payload/bin/7za.exe銆?// 浣跨敤鏂瑰紡:
//   node scripts/pack-payload.mjs                 // 浣跨敤榛樿璺緞 (../release/win-unpacked)
//   node scripts/pack-payload.mjs <source-dir>    // 鏄惧紡鎸囧畾 win-unpacked 鐩綍
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

// 校验 7z 运行时文件确实是有效可执行文件（防止下载到 0 字节 / HTML 错误页导致打包后
// 安装阶段 7za.exe ENOENT）
function verifyRuntime(dest) {
  try {
    const st = fs.statSync(dest);
    if (!st.isFile() || st.size < 200 * 1024) {
      console.error('7z runtime file invalid or too small: ' + dest + ' (' + st.size + ' bytes)');
      return false;
    }
    const fd = fs.openSync(dest, 'r');
    const headBuf = Buffer.alloc(2);
    fs.readSync(fd, headBuf, 0, 2, 0);
    fs.closeSync(fd);
    if (headBuf.toString('ascii') !== 'MZ') {
      console.error('7z runtime file missing MZ header: ' + dest);
      return false;
    }
    return true;
  } catch (e) {
    console.error('7z runtime verify error: ' + e.message);
    return false;
  }
}

async function ensure7z() {
  const isWin = process.platform === 'win32';
  const runtimeName = isWin ? '7za.exe' : '7zz';
  const runtimeDest = path.join(binDir, runtimeName);
  // 优先使用resources目录下的本地7za.exe（随仓库提交，CI 不再依赖外网下载）
  const local7z = path.join(installerRoot, 'resources', runtimeName);
  if (fs.existsSync(local7z)) {
    if (!verifyRuntime(local7z)) {
      console.error('local 7z invalid, check installer-ui/resources/' + runtimeName);
      process.exit(1);
    }
    console.log('使用本地7z:', local7z);
    fs.copyFileSync(local7z, runtimeDest);
    if (!isWin) fs.chmodSync(runtimeDest, 0o755);
    return runtimeDest;
  }
  if (!fs.existsSync(runtimeDest)) {
    if (isWin) {
      // 7zr.exe 是官方发布的独立单文件版本，不依赖 7z.dll，可作为运行时解压器
      // 使用多个镜像源，防止下载失败
      const downloadMirrors = [
        "https://github.com/develar/7zip-bin/raw/master/win/x64/7za.exe",
        "https://cdn.jsdelivr.net/npm/7zip-bin@5.1.1/win/x64/7za.exe",
        "https://www.7-zip.org/a/7zr.exe",
      ];
      let lastError = null;
      for (const mirror of downloadMirrors) {
        console.log(`downloading 7za.exe from ${mirror} ...`);
        try {
          await download(mirror, runtimeDest);
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          console.log(`failed: ${e.message}`);
        }
      }
      if (lastError) throw lastError;
      if (!verifyRuntime(runtimeDest)) {
        throw new Error('downloaded 7z runtime is invalid: ' + runtimeDest);
      }
    } else {
      // macOS runners provide 7zz through Homebrew's sevenzip formula; some systems use 7z.
      const p = ["7zz", "7z"]
        .map(command => spawnSync("which", [command], { encoding: "utf8" }))
        .map(result => (result.stdout || "").trim().split(/\r?\n/)[0])
        .find(candidate => candidate && fs.existsSync(candidate));
      if (!p || !fs.existsSync(p)) {
        throw new Error("mac/linux requires 7zz or 7z (install with: brew install sevenzip)");
      }
      fs.copyFileSync(p, runtimeDest);
      fs.chmodSync(runtimeDest, 0o755);
    }
  }
  console.log("runtime 7z:", runtimeDest);
  return runtimeDest;
}

const sz = await ensure7z();

// 鐢ㄥ垰淇濆瓨鐨?runtime 7z 鐩存帴鍘嬬缉 (7zr.exe 鏀寔 a/x/l 绛夊父鐢ㄥ懡浠?
const archive = path.join(payloadDir, "app.7z");
try { fs.rmSync(archive, { force: true }); } catch {}
console.log(`compress ${source} -> ${archive}`);
const args = ["a", "-t7z", "-mx=5", "-ms=on", archive, path.join(source, "*")];
const r = spawnSync(sz, args, { stdio: "inherit" });
if (r.status !== 0) {
  console.error("7z 鎵撳寘澶辫触");
  process.exit(r.status || 1);
}
const size = fs.statSync(archive).size;
console.log(`payload 鎵撳寘瀹屾垚: ${(size / 1024 / 1024).toFixed(1)} MB`);
