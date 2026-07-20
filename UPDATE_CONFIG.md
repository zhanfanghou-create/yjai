# 自动更新配置说明

## 功能特性

✅ **私有仓库支持** - 可配置 GitHub Token 访问私有 Releases  
✅ **国内镜像加速** - 自动使用 ghproxy 等镜像下载  
✅ **SHA256 完整性校验** - 自动验证下载文件完整性  
✅ **自动静默安装** - 下载完成后自动关闭旧版本并安装  
✅ **实时下载进度** - 显示精确的下载进度和文件大小  

## 配置私有仓库 Token

如果你的 GitHub 仓库是私有的，需要配置 Personal Access Token：

### 1. 生成 Token
1. 打开 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. 点击 "Generate new token"
3. 配置权限：
   - Repository access → Only select repositories → 选择你的仓库
   - Permissions → Repository permissions → Contents → Read-only
4. 生成并复制 Token

### 2. 配置到代码
在 `src/main/main.ts` 中找到配置部分：

```typescript
const GITHUB_CONFIG = {
  owner: "zhanfanghou-create",
  repo: "yjai",
  // 填入你的 Token
  token: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  // 国内镜像站列表（按优先级排序）
  mirrors: [
    "https://mirror.ghproxy.com/",
    "https://ghproxy.net/",
    "https://gh-proxy.com/",
    "", // 直连（最后尝试）
  ],
};
```

> **注意**：打包后的 Token 可以被反编译获取，建议：
> - 使用 Fine-grained Token 而不是 Classic Token
> - 仅授予必要的最小权限（Contents: Read-only）
> - Token 设置较短的过期时间
> - 公开仓库可以留空 token 字段

## GitHub Actions Release 配置

你的 GitHub Actions 配置已经包含了 SHA256 校验和的生成，在 Release 页面会显示：

```text
SHA256 (艺镜AI-正式版-1.1.9.exe) = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

程序会自动从 Release Notes 中提取这个值进行校验。

## 版本更新流程

1. **检查更新**：进入设置页面自动检查，或手动点击"检查更新"
2. **提示更新**：发现新版本时显示版本号和发布说明
3. **镜像下载**：自动依次尝试国内镜像，失败则直连
4. **SHA256 校验**：下载完成后自动校验文件完整性
5. **自动安装**：Windows 平台自动关闭旧版本并静默安装
6. **自动退出**：安装程序启动后自动退出当前应用

## 支持的平台

| 平台 | 自动关闭旧版本 | 自动静默安装 | 自动打开安装包 |
|------|----------------|--------------|----------------|
| Windows | ✅ | ✅ | - |
| macOS (Intel) | ❌ | ❌ | ✅ |
| macOS (Arm) | ❌ | ❌ | ✅ |

## 配置 NSIS 安装程序

在 `build/installer.nsh` 中已经配置了：

- ✅ 自动检测旧版本安装路径
- ✅ 支持 `/S` 参数进行静默安装
- ✅ 安装前自动关闭正在运行的程序
- ✅ 支持中文界面

## 故障排除

### 1. 检查更新失败
- 确认网络连接正常
- 私有仓库确认 Token 权限正确
- 检查 GitHub API 是否可以访问

### 2. 下载速度慢
- 程序会自动尝试多个国内镜像
- 如果都失败，会使用直连下载

### 3. 自动安装失败
- 检查是否有杀毒软件拦截
- 可以手动到 `%TEMP%\yijing-update` 文件夹中找到安装包手动安装

### 4. SHA256 校验失败
- 文件下载不完整，重新下载
- Release Notes 中的校验和格式不正确（需要严格匹配 `SHA256 (filename) = hash` 格式）
