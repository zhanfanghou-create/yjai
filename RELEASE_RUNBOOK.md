# 艺镜AI 三平台发布运行手册（RELEASE RUNBOOK）

> 本文件是"提交打包、更新到三个平台"的权威说明。**任何执行发布的 Agent 必须先通读本文件**，
> 尤其是「各平台如何登录」一节，再动手。

---

## 1. 三个平台指什么

本项目每次正式发布产出 **3 个安装包**（这就是"三个平台"）：

| # | 平台 | 产物文件名 | 架构 |
|---|------|-----------|------|
| 1 | Windows | `YijingAI-Installer-Windows-x64.exe` | x64 |
| 2 | macOS Intel | `YijingAI-Installer-macOS-x64.dmg` | x64 |
| 3 | macOS Apple Silicon | `YijingAI-Installer-macOS-arm64.dmg` | arm64 |

打包与三平台同步由 **GitHub Actions（`.github/workflows/build.yml`）自动完成**，本地只需要
提交代码、推送 tag。tag 格式必须为 `v<版本号>-stable`（例如 `v1.2.3-stable`），推送该 tag 即触发。

CI 会把 3 个安装包 + 更新清单 `latest.json` 同步到 **3 个下载渠道**：
1. GitHub 公开发布仓库：`zhanfanghou-create/yijing-ai-downloads`
2. CNB 国内节点：`yijingshijue-2026/yijing-ai-downloads`（cnb.cool）
3. 阿里云 OSS：bucket `yjai-releases-cn-20260818`，路径 `yijing/v<版本>/` 与 `yijing/latest.json`

---

## 2. 各平台如何登录（Agent 必读）

### 2.1 GitHub（源码仓库 + 发布仓库）

- **登录状态**：本机 GitHub CLI `gh` 已登录账号 `zhanfanghou-create`，协议为 **HTTPS**，
  已配置 git-credential helper，`git push` 时自动携带令牌，无需手动输入。
  - 验证：`gh auth status`
  - 作用范围：`gist, read:org, repo`（够推送代码、管理 Releases）
- **⚠️ 关键坑：远程 URL 是 SSH，但本机 SSH key 未授权**
  - 当前 `git remote get-url origin` 返回 `git@github.com:zhanfanghou-create/yjai.git`（SSH）。
  - 本机 `ssh -T git@github.com` 返回 **Permission denied (publickey)**——SSH 推送必然失败。
  - **执行推送前必须先切到 HTTPS**：
    ```powershell
    git remote set-url origin https://github.com/zhanfanghou-create/yjai.git
    git remote -v   # 确认变成 https://github.com/zhanfanghou-create/yjai.git
    ```
  - 切换后推送/打 tag 均走 gh 凭据，无密码弹窗。
- **源码仓库**：`zhanfanghou-create/yjai`（**PRIVATE** 私有，勿公开）。
- **发布仓库**：`zhanfanghou-create/yijing-ai-downloads`（**PUBLIC** 公开，供用户下载）。
  - 查看最新发布：`gh release list -R zhanfanghou-create/yijing-ai-downloads`
  - 查看指定版本：`gh release view v1.2.2 -R zhanfanghou-create/yijing-ai-downloads`

### 2.2 CNB（cnb.cool 国内下载节点）

- **无需本地登录**：三平台同步由 CI 用 GitHub Actions 仓库级 Secret **`CNB_TOKEN`** 完成
  （见 `scripts/publish-cnb-release.mjs`，走 `https://api.cnb.cool` Bearer 认证）。
  - 确认 Secret 已配置：`gh secret list -R zhanfanghou-create/yjai`（应能看到 `CNB_TOKEN`）。
- **CNB_TOKEN 是什么**：cnb.cool 账号的个人访问令牌（在 https://cnb.cool 账号设置里生成）。
- **手动验证发布结果**（浏览器）：
  - 仓库页：https://cnb.cool/yijingshijue-2026/yijing-ai-downloads
  - Releases：https://cnb.cool/yijingshijue-2026/yijing-ai-downloads/-/releases
  - 下载直链格式：`https://cnb.cool/yijingshijue-2026/yijing-ai-downloads/-/releases/download/v<版本>/<文件名>`

### 2.3 阿里云 OSS（CDN/直链下载）

- **无需本地登录**：CI 用 GitHub Actions Secrets **`OSS_ACCESS_KEY_ID`** 与
  **`OSS_ACCESS_KEY_SECRET`**，通过 ossutil 上传（见 `build.yml` 的 "Publish installers to
  Alibaba Cloud OSS" 步骤）。
  - 确认 Secret 已配置：`gh secret list -R zhanfanghou-create/yjai`。
- **手动登录/验证**（可选，用于排查）：
  - OSS 控制台：https://oss.console.aliyun.com ，Bucket = `yjai-releases-cn-20260818`，
    区域 `cn-hangzhou`，对象前缀 `yijing/`。
  - 或安装 `ossutil` 后配置上述两把 Key 执行 `ossutil ls oss://yjai-releases-cn-20260818/yijing/`。
- **下载直链格式**：
  `https://yjai-releases-cn-20260818.oss-cn-hangzhou.aliyuncs.com/yijing/v<版本>/<文件名>`

---

## 3. GitHub Actions Secrets（三平台自动登录凭证清单）

以下 4 个 Secret 均已配置在 `zhanfanghou-create/yjai` 仓库，**缺失任何一个是 CI 失败的常见原因**：

| Secret | 用途 | 是否已配置 |
|--------|------|-----------|
| `PUBLIC_RELEASE_REPO_TOKEN` | 写 GitHub 公开发布仓库 `zhanfanghou-create/yijing-ai-downloads` | ✅ 已配置 |
| `CNB_TOKEN` | 发布到 CNB `yijingshijue-2026/yijing-ai-downloads` | ✅ 已配置 |
| `OSS_ACCESS_KEY_ID` | 上传阿里云 OSS | ✅ 已配置 |
| `OSS_ACCESS_KEY_SECRET` | 上传阿里云 OSS | ✅ 已配置 |

校验命令：`gh secret list -R zhanfanghou-create/yjai`

---

## 4. 标准发布流程（提交打包 → 更新三平台）

### 前置校验（每一步都要确认）
1. 分支必须是 `main`：`git branch --show-current`
2. `package.json` 与 `installer-ui/package.json` 的 `version` **必须完全一致**
   （CI `prepare` 阶段会强制校验，不一致直接失败）。
3. 确认远程是 HTTPS（见 2.1），否则先 `git remote set-url origin https://github.com/zhanfanghou-create/yjai.git`。

### 方式 A：用发布脚本（推荐，一条命令完成 build+commit+push+tag）
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-release.ps1 `
  -Version 1.2.3 -Message "release: v1.2.3 <一句话说明>"
```
脚本 `scripts/publish-release.ps1` 会自动：
- 校验 origin / 分支 / 版本一致 / 本地与远端同步
- `npm run typecheck` + `npm run build`
- 只暂存项目文件（显式路径，`token/password/secret/dist/release` 等敏感或产物一律拦截）
- 提交 → 推送 `main` → 打注释 tag `v1.2.3-stable` → 推送 tag

> 注意：脚本里 `git add` 显式包含 `RELEASE_RUNBOOK.md`，因此**本文件必须存在于仓库根目录**。

### 方式 B：手动步骤（等价，适合想逐步确认时）
```powershell
# 1) 升版本（如需要）：改 package.json 和 installer-ui/package.json 的 version
# 2) 本地构建校验
npm run typecheck
npm run build
# 3) 提交并推送 main（仅提交项目文件，勿提交未跟踪的杂项如 *.txt/*.png/*.bak）
git add -u
git add .github build installer-ui public scripts src package.json package-lock.json tsconfig.json tsconfig.main.json tsconfig.renderer.json vite.config.ts RELEASE_RUNBOOK.md
git commit -m "release: v1.2.3 <一句话说明>"
git push origin main
# 4) 打 tag 并推送（触发三平台打包）
git tag -a v1.2.3-stable -m "艺镜 AI 无限画布 v1.2.3-stable"
git push origin v1.2.3-stable
```

### 方式 C：仅触发 CI（不新提交代码时）
```powershell
gh workflow run build.yml -R zhanfanghou-create/yjai
```

---

## 5. 监控与验证（务必等到三平台全部就绪）

推送 tag 后立即监控：
```powershell
gh run list --workflow=build.yml -R zhanfanghou-create/yjai --limit 3
gh run watch <run-id> -R zhanfanghou-create/yjai   # 等待全部 job 完成
```

`build.yml` 有 4 个 job，**全部绿**才算成功：
- `prepare` — 校验版本、创建公开草稿 Release
- `build`（矩阵 3 端）— 产出 Windows/macOS-x64/macOS-arm64 安装包并上传公开仓库
- `publish` — 生成 `latest.json`、发布 GitHub Release、同步 **CNB** 与 **阿里云 OSS**、更新 CNB manifest 分支
- `restore-source-privacy` — 把源码仓库恢复为私有

发布完成后逐渠道验证（三平台安装包 + latest.json）：
1. **GitHub**：`gh release view v1.2.3 -R zhanfanghou-create/yijing-ai-downloads`
   → 应看到 3 个安装包 + `latest.json` 共 4 个 asset，且 `Latest` 标记正确。
2. **CNB**：浏览器打开 https://cnb.cool/yijingshijue-2026/yijing-ai-downloads/-/releases
3. **OSS**：浏览器访问
   `https://yjai-releases-cn-20260818.oss-cn-hangzhou.aliyuncs.com/yijing/latest.json`
   → 能打开且 `version` 为新版本号。

---

## 6. 故障排查

| 现象 | 原因与处理 |
|------|-----------|
| `Permission denied (publickey)` | 远程还是 SSH。执行 `git remote set-url origin https://github.com/zhanfanghou-create/yjai.git` 后再推。 |
| CI `prepare` 失败 | 两个 package.json 版本不一致；或 `installer-ui/package.json` 版本未同步。 |
| CI 失败缺少 Secret | `gh secret list -R zhanfanghou-create/yjai` 核对 4 个 Secret 是否齐全。 |
| 只有部分平台产物 | `build` 矩阵某端失败；点进对应 job 看日志，常见为 `npm ci`/`electron-builder` 下载超时（工作流已配置重试）。 |
| tag 已存在 | 一个版本只能发布一次；需升版本号。`publish-release.ps1` 会拒绝重复 tag。 |
| 用户下载更新失败 | 检查 `latest.json` 里的 `version`/`sha256`/三个 mirror URL 是否可访问。 |

---

## 7. 常用命令速查

```powershell
gh auth status                                   # 确认 GitHub 登录
git remote -v                                    # 确认是 https 远程
gh secret list -R zhanfanghou-create/yjai        # 确认 4 个 Secret
gh release list -R zhanfanghou-create/yijing-ai-downloads   # 查看已发布版本
gh run list --workflow=build.yml -R zhanfanghou-create/yjai --limit 3   # 看 CI 状态
```
