# 艺镜AI macOS 打包指南

## 方案说明

由于 electron-builder 不支持跨平台打包（Windows 不能打 macOS DMG），使用 **GitHub Actions** 在云端构建 macOS DMG。

## 触发方式

### 方式 1：自动触发（push 到 main）

每次 push 到 `main` 分支时，如果修改了以下文件，会自动触发构建：
- `.github/workflows/build-mac.yml`
- `src/**`
- `package.json` / `package-lock.json`
- `vite.config.ts`
- `scripts/**`
- `tsconfig*.json`

### 方式 2：手动触发

1. 打开 GitHub 仓库：https://github.com/zhanfanghou-create/yijing-ai
2. 点击 **Actions** 标签
3. 左侧选择 **Build macOS DMG**
4. 右侧点击 **Run workflow** → 选择 `main` 分支 → **Run workflow**

## 查看构建状态

1. 访问 https://github.com/zhanfanghou-create/yijing-ai/actions
2. 点击最新一次 **Build macOS DMG** 运行
3. 展开各步骤查看日志

## 获取 DMG 文件

构建成功后，DMG 文件有两种获取方式：

### 方式 A：从 Artifacts 下载（推荐，保留 30 天）

1. 进入构建详情页
2. 拉到底部 **Artifacts** 区域
3. 点击 `yijing-ai-macOS-dmg` 下载 zip
4. 解压得到 `.dmg` 文件

### 方式 B：从 release-mac 分支拉取

```powershell
# 在项目目录执行
cd C:\Users\admin\.qclaw\workspace\yijing-ai

# 拉取 release-mac 分支
git fetch origin release-mac
git checkout release-mac -- release/

# DMG 文件在 release/ 目录下
ls release/*.dmg
```

## CI 与本地打包的区别

| 项目 | 本地打包（Windows） | CI 打包（macOS） |
|------|---------------------|------------------|
| 平台 | Windows x64 | macOS x64 |
| 输出 | `艺镜AI Setup 1.0.0.exe` | `艺镜AI-1.0.0.dmg` |
| 代码混淆 | ✅ javascript-obfuscator | ❌ 跳过 |
| asarmor 保护 | ✅ bloat patch | ❌ 跳过 |
| sourcemap | ❌ 不生成 | ❌ 不生成 |

> **说明**：CI 跳过混淆和 asarmor 是为了兼容性。如果需要带保护的 macOS 版本，需要在 macOS 机器上本地打包。

## 本地打包 Windows（带保护）

```powershell
cd C:\Users\admin\.qclaw\workspace\yijing-ai

# 1. 完整构建（含混淆）
npm run build

# 2. 打包 Windows 安装包
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
npx electron-builder --win --x64

# 3. 产物在 release/ 目录
ls release/*.exe
```

## 常见问题

### Q: GitHub Actions 构建失败怎么办？

1. 进入 Actions 页面查看具体失败的步骤
2. 常见原因：
   - `npm ci` 失败：lock 文件不匹配，会自动回退到 `npm install`
   - `tsc` 失败：TypeScript 编译错误，检查本地 `npx tsc -p tsconfig.main.json` 是否通过
   - `electron-builder` 失败：通常是网络问题（下载 Electron 二进制），已配置 npmmirror 镜像

### Q: 为什么 CI 上不做代码混淆？

`javascript-obfuscator` 在 CI 环境上偶发兼容性问题（Node 版本、内存限制），且混淆会显著增加构建时间。本地打包已包含混淆，CI 只做基础打包保证 DMG 可用。

### Q: DMG 文件多大？

约 150-200 MB（主要是 Electron 运行时约 130MB + 应用代码约 5MB + 资源约 20MB）。

### Q: macOS 用户打开 DMG 提示"无法验证开发者"？

因为没有代码签名。用户需要：
1. 右键点击应用 → **打开**
2. 或在 **系统偏好设置 → 安全性与隐私** 中允许打开

如需正式签名，需要 Apple Developer 账号（$99/年）并配置证书。
