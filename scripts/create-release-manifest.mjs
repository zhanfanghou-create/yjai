#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [version, githubRepository, cnbRepository, windowsPath, macX64Path, macArm64Path, outputPath] = process.argv.slice(2);
if (![version, githubRepository, cnbRepository, windowsPath, macX64Path, macArm64Path, outputPath].every(Boolean)) {
  throw new Error('Usage: create-release-manifest <version> <github-repository> <cnb-repository> <windows> <mac-x64> <mac-arm64> <output>');
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid release version: ${version}`);
for (const filePath of [windowsPath, macX64Path, macArm64Path]) {
  if (!existsSync(filePath)) throw new Error(`Release asset not found: ${filePath}`);
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

async function asset(filePath) {
  const fileName = path.basename(filePath);
  const githubUrl = `https://github.com/${githubRepository}/releases/download/v${version}/${fileName}`;
  const cnbUrl = `https://cnb.cool/${cnbRepository}/-/releases/download/v${version}/${fileName}`;
  const ossUrl = `https://yjai-releases-cn-20260818.oss-cn-hangzhou.aliyuncs.com/yijing/v${version}/${fileName}`;
  return {
    fileName,
    size: statSync(filePath).size,
    sha256: await sha256(filePath),
    url: ossUrl,
    mirrors: [
      { id: 'oss', name: '阿里云 OSS', url: ossUrl },
      { id: 'cnb', name: 'CNB 国内节点', url: cnbUrl },
      { id: 'github', name: 'GitHub 官方', url: githubUrl },
    ],
  };
}

const manifest = {
  schemaVersion: 1,
  version,
  channel: 'stable',
  publishedAt: new Date().toISOString(),
  repository: githubRepository,
  cnbRepository,
  notes: '艺镜 AI 无限画布正式版更新。',
  assets: {
    windows: await asset(windowsPath),
    macosX64: await asset(macX64Path),
    macosArm64: await asset(macArm64Path),
  },
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Release manifest created: ${outputPath}`);
