# 艺镜AI（结构性重写版）

无限画布 AI 创作工具的 Electron + React 桌面应用。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build         # 编译 renderer + main
npm run dist:win      # 打包 Windows NSIS 安装器
npm run dist:mac      # 打包 macOS dmg
```

## GitHub Actions

推送 tag `v*.*.*` 会自动触发 Win + Mac 双平台打包并发布 Release。

## 目录结构

- `src/main`       Electron 主进程
- `src/preload`    预加载脚本（暴露安全 IPC API）
- `src/renderer`   React 渲染进程
- `src/shared`     主/渲染共用的类型与常量
- `public`         静态资源

## 迭代说明

本项目采用"结构性重写 + 增量迁移"策略。P1 提供骨架、主题、侧栏与占位路由；
后续每一轮聚焦一个页面/系统，独立可验证。
# yjai
