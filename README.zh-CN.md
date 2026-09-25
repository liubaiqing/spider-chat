# Spider Chat

[English](README.md) · [图谱存档格式](docs/map-archive.md) · [MIT 许可证](LICENSE)

**在 Obsidian 中边读 AI 回答边追问，把探索过程留成一张可回看的图谱。**

Spider Chat 以 [Spider](https://github.com/111pointer111/spider) 为底座，保留「选中回答中的文字 → 按 `Tab` → 创建追问分支」的直接操作。图谱占主视图，聊天位于右侧栏；它借鉴了 [Canvas Branch Chat](https://github.com/p4nt1um/canvas-branch-chat) 的多模型和上下文等思路，但不在原生 Canvas 上实时聊天。

## 与原项目的关系

|  | 原版 Spider | Canvas Branch Chat | Spider Chat |
| --- | --- | --- | --- |
| 实时工作区 | 独立图谱 + 聊天侧栏 | 原生 Canvas 对话节点 | 独立图谱 + 聊天侧栏，延续 Spider 的 `Tab` 追问 |
| 模型与上下文 | 单模型设置、较简单的上下文开关 | 多模型、祖先上下文等 | 多模型档案；每次请求可覆盖模型和四种上下文模式 |
| 大图阅读 | 节点导航与自动布局 | Canvas 导航 | 图谱搜索、未解决筛选、聚焦当前问题链、来源原句定位和回放 |
| 数据与导出 | Spider 地图及 Markdown / Canvas / SVG 包 | `.canvas` 对话及其他导出 | 单文件 `.spider.json` 存档；保留原导出包，增加离线交互式 HTML |
| 生成任务 | 单次请求流程 | Canvas 中生成分支 | 按节点排队、取消和重试；多视图共享地图状态 |

这些是**两种工作方式的取舍**，并非声称涵盖两个原项目的全部功能。Spider Chat 没有 Canvas Branch Chat 的批量多方向分叉、分支合并和实时 Canvas 聊天，也不会导入其旧 `.canvas` 对话。

## 为什么适合深入学习

- **从原句出发**：在 AI 回答里选中不懂的概念，按 `Tab` 建立子问题。新分支保留来源文字；返回时可定位并短暂高亮原句。
- **不同模型检验想法**：配置多个 OpenAI 兼容模型，子节点继承默认模型，也可以在单次发送时切换。历史 AI 消息记录实际使用的模型快照，不会被后来改配置影响。
- **控制上下文范围**：无附加上下文、精简上级节点、完整祖先链、全图四种模式；单次覆盖不修改默认设置。精简上级节点是默认值。
- **在大图中找回问题**：搜索标题、简记、总结、原文锚点与消息；筛选「进行中」，选中结果会把卡片移到可见区域。回放按时间、深度或广度浏览现存节点。
- **整理成自己的知识**：总结和简记分开显示，AI 生成的总结可以再编辑。图谱支持自动布局、智能吸附、折叠分支和节点状态。
- **可迁移的存档**：每张图及其聊天记录保存在笔记库的 `Spider Graphs/<地图 ID>.spider.json`。复制该文件到另一设备的同名目录即可读取图谱；API 密钥和模型配置仍需在设备上单独设置。

## 安装与首次使用

Spider Chat 使用独立插件 ID `spider-chat`，**目前尚未上架 Obsidian 社区插件市场**。请从源码构建：

~~~bash
git clone https://github.com/liubaiqing/spider-chat.git
cd spider-chat
npm ci
npm run build
~~~

将生成的 `main.js`、`styles.css` 和仓库中的 `manifest.json` 复制到笔记库的 `<vault>/.obsidian/plugins/spider-chat/`，然后重启 Obsidian，在「设置 → 第三方插件」中启用 Spider Chat。最低 Obsidian 版本为 1.8.7。

1. 在「设置 → Spider Chat」配置默认模型的 API 地址、密钥和模型名称。支持 OpenAI 兼容的 Chat Completions 端点；也可从插件目录或笔记库中的 `.env` 读取密钥。
2. 点击左侧功能区图标新建图谱，提出第一个问题。
3. 阅读右侧 AI 回答，选中文字并按 `Tab` 追问；点击图谱节点可切换对话。
4. 图谱工具栏可搜索、回放、布局和导出；右键节点可打开节点操作菜单。触屏长按或键盘 `Shift+F10` 也可打开菜单。

### 从原版 Spider 迁移

Spider Chat 继续读取 `Spider Graphs` 中的现有存档，也能迁移旧版 `.spider/maps` 地图。因为插件 ID 已改，**原版 Spider 的模型设置不会自动复制**。若要沿用，先关闭 Obsidian，将 `<vault>/.obsidian/plugins/spider/data.json` 复制到 `<vault>/.obsidian/plugins/spider-chat/data.json`，再启动并检查设置。此文件可能含 API 密钥，请勿提交到 Git 仓库。建议不要同时用两个插件编辑同一张图。

## 导出与数据

「导出」提供四种格式：原有的 Markdown / Canvas / SVG 文件包、独立交互式 HTML、单篇 Markdown、Mermaid。HTML 可离线阅读、搜索、回放和切换主题。存档是工作数据，导出文件是阅读和分享的副本；[存档结构说明](docs/map-archive.md)。

图谱存档不含 API 密钥、端点或系统提示词，但**包含完整聊天记录**。将存档上传或分享给他人前请自行检查内容。调用 AI 时，请求会发送到你配置的端点；离线浏览和导出无需连接模型服务。

## 开发

~~~bash
npm ci
npm run build
npm test
npm run test:browser
~~~

`npm run link -- "<vault 路径>"` 可将构建产物链接到本地笔记库的 `spider-chat` 插件目录。项目的 `.gitignore` 排除了构建产物、依赖、笔记库目录、插件设置和 `.env` 文件。

## 致谢与许可

本项目由 [Spider](https://github.com/111pointer111/spider) 衍生，保留其 MIT 版权声明；[Canvas Branch Chat](https://github.com/p4nt1um/canvas-branch-chat) 的设计与功能提供了启发。二者均是独立项目，Spider Chat 不代表原项目或 Obsidian 官方。详见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
