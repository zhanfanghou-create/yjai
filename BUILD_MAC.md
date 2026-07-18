# 艺镜AI - macOS DMG 打包说明

## 前置条件

1. **GitHub 账号**（免费即可）
2. **Git 已安装**（Windows/Mac 都自带）

## 步骤

### 1. 在 GitHub 上创建仓库

1. 打开 https://github.com/new
2. Repository name 填 `yijing-ai`
3. 选择 **Private**（私有仓库，保护代码）
4. **不要**勾选 "Add a README"、".gitignore"、"license"（项目里已有）
5. 点 "Create repository"

### 2. 推送代码到 GitHub

在项目目录 `C:\Users\admin\.qclaw\workspace\yijing-ai` 下运行：

```powershell
# 替换 YOUR_GITHUB_USERNAME 为你的 GitHub 用户名
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/yijing-ai.git
git branch -M main
git push -u origin main
```

如果还没配置 git 身份：
```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

### 3. 触发 GitHub Actions

1. 打开你的仓库页面：`https://github.com/YOUR_GITHUB_USERNAME/yijing-ai`
2. 点顶部 **Actions** 标签
3. 左侧找到 **Build macOS DMG** workflow
4. 点右侧 **Run workflow** 按钮 → 绿色 "Run workflow"
5. 等待构建完成（约 5-10 分钟）

### 4. 下载 DMG

1. 构建完成后，点击那次运行记录
2. 拉到底部 **Artifacts** 区域
3. 点击 `艺镜AI-macOS-dmg` 下载 zip
4. 解压后得到 `艺镜AI-1.0.0.dmg`（约 150-200MB）
5. 把 dmg 文件放到 `F:\艺镜AI\`

## 常见问题

**Q: 推送时提示 "Authentication failed"?**
A: GitHub 已不支持密码认证，需要用 Personal Access Token：
1. 打开 https://github.com/settings/tokens/new
2. 勾选 `repo` 权限，生成 token
3. 推送时用户名填 GitHub 用户名，密码填 token

**Q: Actions 运行失败?**
A: 点进失败的运行记录看日志，常见原因：
- npm install 失败 → 检查 package.json 依赖版本
- build 失败 → 检查 TypeScript 错误

**Q: Mac 用户打开 dmg 里的 app 提示"无法打开"?**
A: 因为没有 Apple 开发者签名。右键点击 app → "打开" → "打开" 即可。

## 文件清单

- `.github/workflows/build-mac.yml` — GitHub Actions workflow 文件
- 本文档 `BUILD_MAC.md`

推送到 GitHub 后，Actions 会自动在 macOS 环境打包，生成的 dmg 放在 Artifacts 里下载。
