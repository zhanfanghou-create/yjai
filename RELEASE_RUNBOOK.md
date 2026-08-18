# 艺镜 AI 无限画布发布说明

## 项目边界

- 当前正式源码与发布仓库：`zhanfanghou-create/yjai`
- 本地同步目录：`D:\yjai-work`
- 日常源码参考目录：`D:\yijing-ai`（本次不写入、不混入）
- 公开下载仓库：`zhanfanghou-create/yijing-ai-downloads`
- 国内 CNB 下载仓库：`yijingshijue-2026/yijing-ai-downloads`
- OSS 下载线路：`oss://yjai-releases-cn-20260818/yijing/`

## 更新与发布顺序

客户端更新清单由 `scripts/create-release-manifest.mjs` 生成，客户端按当前国内线路实测结果使用以下顺序下载并校验 SHA-256：

1. 阿里云 OSS
2. CNB 国内节点
3. GitHub Release

每个稳定版本包含 Windows x64、macOS Intel x64、macOS Apple Silicon arm64 三个安装包。只有公开下载仓库出现新版本时客户端才提示更新。

## 平台登录与密钥位置

本地仓库只保存远端地址和脚本，不保存账号密码、Token、AccessKey 或 `.env` 文件。

| 平台 | 用途 | 授权位置 |
| --- | --- | --- |
| GitHub `zhanfanghou-create/yjai` | 私有源码、Actions | 本机 Git SSH；发布工作流使用 GitHub Actions 内置权限 |
| GitHub `zhanfanghou-create/yijing-ai-downloads` | 公开 Release 与下载 | Actions Secret `PUBLIC_RELEASE_REPO_TOKEN` |
| CNB `yijingshijue-2026/yijing-ai-downloads` | 国内 Release 与 `latest.json` | Actions Secret `CNB_TOKEN` |
| 阿里云 OSS `yjai-releases-cn-20260818` | 国内对象存储下载线路 | Actions Secrets `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`；区域 `cn-hangzhou` |

当前工作流文件：`.github/workflows/build.yml`。本地 `gh auth status` 未作为发布凭据来源；Actions 发布不依赖本机保存明文登录数据。

若打包前需要临时公开源码仓库，Actions 的 `restore-source-privacy` 任务会在成功、失败或取消后的可执行收尾阶段恢复私密。优先配置具有 `zhanfanghou-create/yjai` Administration 写权限的 `SOURCE_REPOSITORY_ADMIN_TOKEN`；未配置时会尝试复用 `PUBLIC_RELEASE_REPO_TOKEN`，该 Token 同样必须拥有源码仓库管理权限。

## 本地提交并触发发布

先把 `package.json` 和 `installer-ui/package.json` 的版本改成同一个三段式版本号，然后运行：

```powershell
./scripts/publish-release.ps1 -Version 1.2.1 -Message "release: v1.2.1"
```

脚本会执行远端快进检查、类型检查、构建、敏感文件扫描、提交、推送 `main`，最后推送 `v1.2.1-stable` 标签。标签推送后由 GitHub Actions 构建三端安装包并同步 GitHub、CNB、OSS。

仅在已经完成本地验证、明确需要跳过构建时使用 `-SkipBuild`。发布前应确认 Actions 的 `prepare`、三端 `build`、`publish` 均成功。
