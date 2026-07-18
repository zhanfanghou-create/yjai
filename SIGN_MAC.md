# macOS 代码签名 & 公证配置

`.github/workflows/build.yml` 会自动读取以下 GitHub Secrets。**没有配置也能出 dmg**，只是用户首次打开需要右键 → 打开。

## 需要在 GitHub 仓库配置的 Secrets

打开仓库 → Settings → Secrets and variables → Actions → New repository secret

| Secret | 说明 | 是否必填 |
|---|---|---|
| `CSC_LINK` | `.p12` 证书 base64（`base64 cert.p12 \| pbcopy`）或可访问的 https URL | 需要签名时必填 |
| `CSC_KEY_PASSWORD` | 导出 `.p12` 时设的密码 | 需要签名时必填 |
| `APPLE_ID` | 苹果开发者账号邮箱 | 公证时必填 |
| `APPLE_APP_SPECIFIC_PASSWORD` | 从 https://appleid.apple.com/ 生成的 App 专用密码 | 公证时必填 |
| `APPLE_TEAM_ID` | 开发者账号 Team ID（Xcode → Membership 里看得到，10 位大写字母数字） | 公证时必填 |

## 获取 `.p12` 证书的流程

1. 加入 [Apple Developer Program]($99/年)
2. Xcode → Preferences → Accounts → 选中账号 → Manage Certificates → `+` → **Developer ID Application**
3. Keychain Access → login → My Certificates → 找到刚才的证书 → 右键 → Export → 存为 `mac_cert.p12`（记好密码）
4. 在 Mac 上：`base64 -i mac_cert.p12 -o cert_b64.txt`（内容粘到 `CSC_LINK`）

## 触发打包

参考 `PUBLISH_MAC.md`（GitHub CLI 一键发布）或 `BUILD_MAC.md`（网页操作）。tag `v2.0.0` 会自动出 Release：

```powershell
git tag v2.0.0
git push --tags
```

## 没证书想快速出 dmg？

什么 secret 都不用配。workflow 会自动跳过签名。用户拿到 dmg 后：
- 右键点击 App → 选择"打开"（一次即可）
- 或在系统偏好设置 → 隐私与安全性 里允许打开
