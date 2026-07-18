# 艺镜AI → GitHub → macOS DMG 自动打包

## 一键发布流程

### 步骤 1：安装 GitHub CLI（推荐）

下载安装：https://cli.github.com/

安装后打开 PowerShell 运行：
```powershell
gh auth login
```
按提示选择 GitHub.com → HTTPS → 浏览器登录

### 步骤 2：创建仓库并推送

```powershell
cd C:\Users\admin\.qclaw\workspace\yijing-ai

# 用 gh 创建私有仓库并推送（一条命令搞定）
gh repo create yijing-ai --private --source=. --remote=origin --push
```

### 步骤 3：触发 macOS 打包

```powershell
# 手动触发 GitHub Actions
gh workflow run build-mac.yml
```

或者打开浏览器访问：`https://github.com/<你的用户名>/yijing-ai/actions`

### 步骤 4：下载 DMG（5-10 分钟后）

```powershell
# 查看运行状态
gh run list --workflow=build-mac.yml --limit 1

# 等构建完成后下载 artifact
gh run download --workflow=build-mac.yml
```

下载的文件在当前目录的 `艺镜AI-macOS-dmg/` 文件夹里，包含：
- `艺镜AI-1.0.0.dmg` — macOS 安装包
- `艺镜AI-1.0.0-mac.zip` — 免安装版

把 dmg 复制到 `F:\艺镜AI\` 即可。

---

## 如果不想装 gh CLI

### 步骤 1：在 GitHub 网页创建仓库

1. 打开 https://github.com/new
2. Repository name: `yijing-ai`
3. 选 **Private**
4. 不勾选任何初始化选项
5. Create repository

### 步骤 2：推送代码

```powershell
cd C:\Users\admin\.qclaw\workspace\yijing-ai

# 替换 YOUR_USERNAME
git remote add origin https://github.com/YOUR_USERNAME/yijing-ai.git
git branch -M main
git push -u origin main
```

首次推送时会弹出浏览器让你登录 GitHub（credential.helper manager 已配置好）。

### 步骤 3：触发 Actions

打开 `https://github.com/YOUR_USERNAME/yijing-ai/actions` → 左侧 "Build macOS DMG" → "Run workflow"

### 步骤 4：下载

构建完成后点击运行记录 → 底部 Artifacts → 下载 `艺镜AI-macOS-dmg`

---

## 已完成

- ✅ Windows x64 安装包：`F:\艺镜AI\艺镜AI-Setup-1.0.0-Win-x64.exe`（200 MB）
- ⏳ macOS DMG：推送到 GitHub 后自动打包

## 注意事项

- 仓库建议设为 **Private**（私有），保护源码
- GitHub Actions 免费额度：私有仓库每月 2000 分钟，macOS runner 按 10 倍计算，一次构建约消耗 50-100 分钟，足够用
- DMG 没有苹果开发者签名，用户首次打开需右键 → 打开
