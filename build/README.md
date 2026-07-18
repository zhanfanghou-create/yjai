# build/ 资源目录

electron-builder 会从此处读取：

- `icon.ico` — Windows 图标（256x256 起，多尺寸 ico）
- `icon.icns` — macOS 图标（1024x1024 源图）
- `icon.png` — Linux 图标 & fallback

**当前为占位**：CI 中若这些文件不存在，electron-builder 会使用 electron 默认图标，
不会中断打包。稍后你放入真实图标即可。

## 生成图标

macOS:
```bash
brew install imagemagick
# 从 1024x1024 png 生成 .icns
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
cp icon.png icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset
```
