# DramaPage.tsx 重写完成

## 任务概述
完全重写 `src/renderer/components/DramaPage.tsx`，实现两个状态的 UI：
1. **状态1 - 历史记录页**：居中布局，带大图标、标题、副标题、蓝色"开始创作"按钮、卡片式历史记录列表（编辑/打开/复制/删除）
2. **状态2 - 工作台页**：顶部栏（标题+保存+关闭）、步骤进度条、消息展示区（支持 ReactMarkdown+remarkGfm 表格渲染）、底部输入区（textarea+接口选择器+模型选择器+发送按钮+开始创作按钮）

## 技术实现

### Store 依赖
- 从 `../store/appStore` 导入 `useAppStore`, `DramaChatMessage`
- 使用 `dramaApiConfigId`, `dramaModel`, `setDramaApiConfig`, `setDramaModel`
- 使用 `dramaRecords`, `currentDramaRecordId`, `saveDramaRecord`, `loadDramaRecord`, `deleteDramaRecord`, `copyDramaRecord`, `showToast`
- 统一配置合并 `recommendedConfigs` + `apiConfigs`

### API 调用
- 通过 `window.yijingAPI.grsai.chat()` IPC 通道调用
- `result.ok && result.data.choices[0].message.content` 获取回复

### 6步工作流
| 步骤 | ID | 图标 | 系统提示词 |
|------|----|------|-----------|
| 导演阐述 | director | 🎬 | 输出故事概要/主要角色/幕结构/关键转折点表格 |
| 故事创作 | writer | ✍️ | 输出场景标题/对白/动作描写/情绪强度表格 |
| 剧本写作 | scriptWriter | 📝 | 输出场次/场景/时间/人物/对话/动作表格 |
| 分镜设计 | storyboardArtist | 📸 | 输出场景/镜头/景别/机位/运镜/画面描述/对白/时长表格 |
| 视觉资产 | assetCreator | 🎨 | 输出资产类型/名称/描述/参考图/重要程度表格 |
| 提示词生成 | promptOptimizer | ✨ | 输出镜头编号/图片提示词/视频提示词/风格参考/注意事项表格 |

### 关键功能
- **发送按钮**：自由对话，不加系统提示词（加简单通用助手提示）
- **开始创作按钮**：按6步顺序执行，每步带对应系统提示词模板
- **消息渲染**：ReactMarkdown + remarkGfm，支持表格（内置CSS样式）
- **错误处理**：try-catch 包裹 API 调用，失败显示 Toast
- **步骤进度条**：显示6个步骤的完成状态和当前步骤

### 构建验证
- `npm run build:renderer` ✓ 通过（547 modules transformed, built in 1.65s）
- 仅 chunk size warning（>500KB advisory），无编译错误

### 文件
- 输出：`src/renderer/components/DramaPage.tsx` (28,646 bytes, UTF-8)
