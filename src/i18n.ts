import type { AppLanguage, ChatNodeStatus, ChatRole } from "./types";

export type TranslationKey =
  | "appName"
  | "openMap"
  | "createChildCommand"
  | "createChildFromSelectionCommand"
  | "goToParentCommand"
  | "summarizeCurrentNodeCommand"
  | "exportMapCommand"
  | "newMapCommand"
  | "switchMapCommand"
  | "deleteNode"
  | "delete"
  | "cancel"
  | "defaultMapTitle"
  | "rootQuestionTitle"
  | "untitledQuestionTitle"
  | "loading"
  | "newChild"
  | "mapNameLabel"
  | "currentNodeLabel"
  | "selectedSourceHint"
  | "nodeSummaryLabel"
  | "cardNoteLabel"
  | "nodeNote"
  | "addNodeNote"
  | "editNodeNote"
  | "nodeNotePlaceholder"
  | "nodeNoteEmpty"
  | "noteSaving"
  | "noteSaved"
  | "closeNodeNote"
  | "hasAnchorText"
  | "autoLayout"
  | "layout"
  | "export"
  | "deleteMap"
  | "switchMapHint"
  | "moreActions"
  | "confirmAutoLayout"
  | "confirmDeleteMap"
  | "confirmDeleteNode"
  | "confirmDialogOpenFailed"
  | "mapDeleted"
  | "mapFileNotFound"
  | "deleteFailed"
  | "searchNodes"
  | "searchPlaceholder"
  | "searchNoResults"
  | "mapSwitcherPlaceholder"
  | "mapSwitcherEmpty"
  | "galleryEmpty"
  | "rootLabel"
  | "noMessagesYet"
  | "updatedAt"
  | "rootNode"
  | "anchor"
  | "summary"
  | "parent"
  | "summarize"
  | "statusOpen"
  | "statusUnderstood"
  | "statusArchived"
  | "streaming"
  | "emptyHint"
  | "composerPlaceholder"
  | "thinkingToggle"
  | "thinkingToggleHint"
  | "thinkingStyleLabel"
  | "thinkingStyleDesc"
  | "composerHint"
  | "send"
  | "stop"
  | "retry"
  | "retryUnavailable"
  | "exported"
  | "apiTest"
  | "apiTesting"
  | "apiTestSuccess"
  | "apiTestFailed"
  | "apiAuthFailed"
  | "apiEndpointNotFound"
  | "apiRequestFailedShort"
  | "missingApiBaseUrl"
  | "missingApiKey"
  | "missingModel"
  | "aiRequestFailed"
  | "emptyAiResponse"
  | "streamUnavailable"
  | "generationStoppedWithPartial"
  | "connectAiTitle"
  | "connectAiBody"
  | "openSettings"
  | "openSettingsFailed"
  | "composerLabel"
  | "nodeTitleLabel"
  | "graphCanvasLabel"
  | "nodeStatusLabel"
  | "scrollTop"
  | "scrollLatest"
  | "details"
  | "onboardingCardLabel"
  | "onboardingAskTitle"
  | "onboardingAskBody"
  | "onboardingBranchTitle"
  | "onboardingBranchBody"
  | "onboardingChildTitle"
  | "onboardingChildBody"
  | "onboardingDoneTitle"
  | "onboardingDoneBody"
  | "onboardingDismiss"
  | "onboardingFinishButton"
  | "onboardingChildCreatedNotice"
  | "mergeSourcesLabel"
  | "mergeSourceMissing"
  | "modelLabel"
  | "contextMode"
  | "contextNone"
  | "contextParent"
  | "contextAncestors"
  | "contextWhole"
  | "sendOptionsTitle"
  | "sendOptionsForNode"
  | "defaultModelOption"
  | "apply"
  | "nodeSettingsHint"
  | "editNodeSummary"
  | "summaryPlaceholder"
  | "exportChooseTitle"
  | "exportPackageName"
  | "exportPackageDesc"
  | "exportInteractiveName"
  | "exportInteractiveDesc"
  | "exportMarkdownName"
  | "exportMarkdownDesc"
  | "exportMermaidName"
  | "exportMermaidDesc"
  | "replay"
  | "replayMode"
  | "replayTime"
  | "replayDepth"
  | "replayBreadth"
  | "pause"
  | "previousStep"
  | "nextStep"
  | "replaySpeed"
  | "replayProgress"
  | "replayIdle"
  | "exitReplay"
  | "replayHelp"
  | "replayHelpOrder"
  | "replayHelpControls"
  | "replayModeHint"
  | "replayPlayHint"
  | "replaySpeedHint"
  | "replayRangeHint"
  | "exitReplayHint"
  | "generationQueued"
  | "generationRunning"
  | "generationError"
  | "branchDirectionBadge"
  | "branchModelBadge"
  | "missingSource"
  | "settingsTitle"
  | "settingLanguageName"
  | "settingLanguageDesc"
  | "settingExportFolderName"
  | "settingExportFolderDesc"
  | "settingTabName"
  | "settingTabDesc"
  | "settingStreamName"
  | "settingStreamDesc"
  | "settingAutoSummaryName"
  | "settingAutoSummaryDesc"
  | "settingOnboardingName"
  | "settingOnboardingDesc"
  | "settingOnboardingButton"
  | "settingOnboardingRestored";

type TranslationDictionary = Record<TranslationKey, string>;

const zh: TranslationDictionary = {
  appName: "Spider",
  openMap: "打开 Spider",
  createChildCommand: "创建分支",
  createChildFromSelectionCommand: "从选中文本创建分支",
  goToParentCommand: "回到父节点",
  summarizeCurrentNodeCommand: "总结当前节点",
  exportMapCommand: "导出图谱",
  deleteNode: "删除节点",
  delete: "删除",
  cancel: "取消",
  newMapCommand: "新建 Spider 图谱",
  switchMapCommand: "切换 Spider 图谱",
  defaultMapTitle: "未命名对话图谱",
  rootQuestionTitle: "根问题",
  untitledQuestionTitle: "未命名问题",
  loading: "正在加载 Spider...",
  newChild: "创建分支",
  mapNameLabel: "图谱",
  currentNodeLabel: "当前节点",
  selectedSourceHint: "来自上一节点选中的原文",
  nodeSummaryLabel: "总结",
  cardNoteLabel: "简记",
  nodeNote: "我的笔记",
  addNodeNote: "添加节点笔记",
  editNodeNote: "编辑节点笔记",
  nodeNotePlaceholder: "记录你的判断、结论或待办，支持 Markdown。",
  nodeNoteEmpty: "点击记录你对这个节点的判断或结论。",
  noteSaving: "保存中…",
  noteSaved: "已自动保存",
  closeNodeNote: "关闭节点笔记",
  hasAnchorText: "有原文",
  autoLayout: "自动布局",
  layout: "布局",
  export: "导出",
  deleteMap: "删除图谱",
  switchMapHint: "切换图谱",
  moreActions: "更多",
  confirmAutoLayout: "自动布局会重新排列当前图谱，可能覆盖你手动拖动的位置。确认继续？",
  confirmDeleteMap: "确认删除「{title}」？此操作不可撤销。",
  confirmDeleteNode: "确认删除当前节点？此操作不可撤销。",
  confirmDialogOpenFailed: "打开确认弹窗失败：{message}",
  mapDeleted: "图谱已删除",
  mapFileNotFound: "未找到该图谱文件",
  deleteFailed: "删除失败：{message}",
  searchNodes: "搜索节点",
  searchPlaceholder: "搜索标题、笔记、摘要、锚点或消息",
  searchNoResults: "没有找到匹配节点",
  mapSwitcherPlaceholder: "切换 Spider 图谱...",
  mapSwitcherEmpty: "没有找到图谱。",
  galleryEmpty: "还没有图谱。点击上方按钮创建一个。",
  rootLabel: "根问题",
  noMessagesYet: "暂无对话",
  updatedAt: "更新于 {time}",
  rootNode: "根节点",
  anchor: "原文锚点",
  summary: "节点总结",
  parent: "返回上级",
  summarize: "总结",
  statusOpen: "进行中",
  statusUnderstood: "已理解",
  statusArchived: "已归档",
  streaming: "生成中",
  emptyHint: "先输入一个问题。AI 回复后，选中一句想深入的内容，按 Tab 创建分支。",
  composerPlaceholder: "问这个节点的问题…",
  thinkingToggle: "深度思考",
  thinkingToggleHint: "让模型先输出思维链再作答。",
  composerHint: "Enter 发送 · Shift + Enter 换行",
  thinkingStyleLabel: "思考参数",
  thinkingStyleDesc: "深度思考开关以什么形式发给该接口。自动会按 API 地址判断；无法识别的接口不发送该参数。",
  send: "发送",
  stop: "停止",
  retry: "重试",
  retryUnavailable: "只有最新一条用户消息生成失败后才能重试。",
  exported: "已导出到 {path}",
  apiTest: "测试 API",
  apiTesting: "正在测试...",
  apiTestSuccess: "API 配置可用，模型响应正常。",
  apiTestFailed: "API 测试失败，请查看详情。",
  apiAuthFailed: "API Key 无效或没有权限。",
  apiEndpointNotFound: "没有找到接口，请检查 API 地址是否包含正确的 /v1 基础路径。",
  apiRequestFailedShort: "AI 请求失败（{status}）。",
  missingApiBaseUrl: "缺少 API 地址。请在 Spider 设置里填写。",
  missingApiKey: "缺少 API Key。请在 Spider 设置里填写。",
  missingModel: "缺少模型名称。请在 Spider 设置里填写。",
  aiRequestFailed: "AI 请求失败（{status}）。{body}",
  emptyAiResponse: "AI 返回为空。",
  streamUnavailable: "当前接口没有返回可读取的流。",
  generationStoppedWithPartial: "已停止生成，已保存当前部分回复。",
  connectAiTitle: "连接 AI 服务",
  connectAiBody: "先配置 OpenAI 兼容的 API 地址、API Key 和模型。你的草稿会保留在当前分支。",
  openSettings: "打开 Spider 设置",
  openSettingsFailed: "无法自动打开设置，请前往“设置 → Spider”。",
  composerLabel: "当前分支的问题",
  nodeTitleLabel: "节点标题",
  graphCanvasLabel: "知识图谱。使用方向键浏览节点，按 Tab 创建分支，按 Shift + Tab 返回父节点。",
  nodeStatusLabel: "节点状态",
  scrollTop: "回到顶部",
  scrollLatest: "跳到最新消息",
  details: "详情",
  onboardingCardLabel: "Spider 引导卡片",
  onboardingAskTitle: "从一个问题开始",
  onboardingAskBody: "先问一个根问题。Spider 会把这次探索固定成图谱里的起点。",
  onboardingBranchTitle: "把关键句拉成分支",
  onboardingBranchBody: "看到想深入的一句？选中它，按 Tab 创建分支。",
  onboardingChildTitle: "继续追问这段原文",
  onboardingChildBody: "这个子节点已带入选中的原文。现在直接追问它。",
  onboardingDoneTitle: "很棒哦，做得好，欢迎来到 Spider",
  onboardingDoneBody: "你已经完成核心流程。点击关闭结束引导；之后也可以在设置里重新显示。",
  onboardingDismiss: "隐藏引导",
  onboardingFinishButton: "关闭",
  onboardingChildCreatedNotice: "已从选中文本创建分支",
  mergeSourcesLabel: "引用的来源分支",
  mergeSourceMissing: "来源节点已删除",
  modelLabel: "模型",
  contextMode: "上下文",
  contextNone: "只发送当前问题",
  contextParent: "加上级节点的要点",
  contextAncestors: "加上沿途所有上级节点",
  contextWhole: "加入整张图谱",
  sendOptionsTitle: "本次提问设置",
  sendOptionsForNode: "设置“{title}”的下一次提问。发送后恢复默认设置。",
  defaultModelOption: "默认模型",
  apply: "应用",
  nodeSettingsHint: "右键节点打开操作菜单",
  editNodeSummary: "编辑节点总结",
  summaryPlaceholder: "编辑这段总结，支持 Markdown。",
  exportChooseTitle: "选择导出格式",
  exportPackageName: "完整研究包",
  exportPackageDesc: "一个文件夹：入口笔记、研究简报、每节点一篇 Markdown、可编辑 Canvas 与 SVG 图谱。",
  exportInteractiveName: "交互式 HTML",
  exportInteractiveDesc: "单个离线文件，自带搜索、回放与主题切换，方便分享。",
  exportMarkdownName: "单个 Markdown",
  exportMarkdownDesc: "整张图谱合成一个带目录的 Markdown 文件，节点之间用标题锚点互相跳转。",
  exportMermaidName: "Mermaid 思维导图",
  exportMermaidDesc: "输出 Mermaid mindmap 代码块，可直接贴进任意笔记渲染。",
  replay: "回放",
  replayMode: "回放顺序",
  replayTime: "按时间",
  replayDepth: "按深度",
  replayBreadth: "按广度",
  pause: "暂停",
  previousStep: "上一步",
  nextStep: "下一步",
  replaySpeed: "速度",
  replayProgress: "第 {current} / {total} 个节点",
  replayIdle: "当前显示完整图谱",
  exitReplay: "退出回放",
  replayHelp: "回放说明",
  replayHelpOrder: "按时间、深度或广度逐个显示现有节点；不会重新生成回答。",
  replayHelpControls: "播放、单步或拖动进度条查看；退出后恢复完整图谱和原先选中的节点。",
  replayModeHint: "选择节点出现的顺序，不改变图谱内容",
  replayPlayHint: "按当前顺序逐个显示节点",
  replaySpeedHint: "调整自动播放的速度",
  replayRangeHint: "拖动跳转回放进度；最左端显示完整图谱",
  exitReplayHint: "结束回放，恢复完整图谱和原先选中的节点",
  generationQueued: "排队中",
  generationRunning: "生成中",
  generationError: "生成失败",
  branchDirectionBadge: "方向",
  branchModelBadge: "模型",
  missingSource: "来源节点缺失",
  settingsTitle: "Spider",
  settingLanguageName: "界面语言",
  settingLanguageDesc: "切换插件界面语言，所有已打开的 Spider 视图会立即刷新。",
  settingExportFolderName: "默认导出文件夹",
  settingExportFolderDesc: "图谱首页、研究简报、节点对话和 Canvas 会导出到这里。",
  settingTabName: "使用 Tab 创建分支",
  settingTabDesc: "聚焦图谱画布时，Tab 会创建分支；在 AI 回复中选中文字后按 Tab，会从该文本创建分支。",
  settingStreamName: "流式输出",
  settingStreamDesc: "开启后 AI 回复会边生成边显示。",
  settingAutoSummaryName: "自动总结节点",
  settingAutoSummaryDesc: "每次 AI 回复后生成一句简短节点总结。",
  settingOnboardingName: "新手引导卡片",
  settingOnboardingDesc: "重新显示右侧面板里的 Spider 核心操作提示。",
  settingOnboardingButton: "重新显示",
  settingOnboardingRestored: "新手引导卡片已恢复。",
};

const en: TranslationDictionary = {
  appName: "Spider",
  openMap: "Open Spider",
  createChildCommand: "Create branch",
  createChildFromSelectionCommand: "Create branch from selection",
  goToParentCommand: "Go to parent node",
  summarizeCurrentNodeCommand: "Summarize current node",
  exportMapCommand: "Export map",
  deleteNode: "Delete node",
  delete: "Delete",
  cancel: "Cancel",
  newMapCommand: "New Spider map",
  switchMapCommand: "Switch Spider map",
  defaultMapTitle: "Untitled chat map",
  rootQuestionTitle: "Root question",
  untitledQuestionTitle: "Untitled question",
  loading: "Loading Spider...",
  newChild: "Create branch",
  mapNameLabel: "Map",
  currentNodeLabel: "Current node",
  selectedSourceHint: "Selected from the parent branch",
  nodeSummaryLabel: "Summary",
  cardNoteLabel: "Quick note",
  nodeNote: "My note",
  addNodeNote: "Add node note",
  editNodeNote: "Edit node note",
  nodeNotePlaceholder: "Capture your judgment, conclusion, or next step. Markdown is supported.",
  nodeNoteEmpty: "Click to record your judgment or conclusion for this node.",
  noteSaving: "Saving…",
  noteSaved: "Autosaved",
  closeNodeNote: "Close node note",
  hasAnchorText: "Has source",
  autoLayout: "Auto layout",
  layout: "Layout",
  export: "Export",
  deleteMap: "Delete map",
  switchMapHint: "Switch map",
  moreActions: "More",
  confirmAutoLayout: "Auto layout will rearrange this map and may overwrite manually dragged positions. Continue?",
  confirmDeleteMap: "Delete “{title}”? This cannot be undone.",
  confirmDeleteNode: "Delete the current node? This cannot be undone.",
  confirmDialogOpenFailed: "Could not open the confirmation dialog: {message}",
  mapDeleted: "Map deleted",
  mapFileNotFound: "Map file not found",
  deleteFailed: "Delete failed: {message}",
  searchNodes: "Search nodes",
  searchPlaceholder: "Search titles, notes, summaries, anchors, or messages",
  searchNoResults: "No matching nodes",
  mapSwitcherPlaceholder: "Switch Spider map...",
  mapSwitcherEmpty: "No maps found.",
  galleryEmpty: "No maps yet. Create one above.",
  rootLabel: "Root question",
  noMessagesYet: "No messages yet",
  updatedAt: "Updated {time}",
  rootNode: "Root node",
  anchor: "Source text",
  summary: "Summary",
  parent: "Go to parent",
  summarize: "Summarize",
  statusOpen: "Open",
  statusUnderstood: "Understood",
  statusArchived: "Archived",
  streaming: "Generating",
  emptyHint: "Start with a question. After AI replies, select a useful passage and press Tab to create a branch.",
  composerPlaceholder: "Ask a question in this branch…",
  thinkingToggle: "Deep thinking",
  thinkingToggleHint: "Let the model reason before it answers.",
  composerHint: "Enter sends · Shift + Enter for a new line",
  thinkingStyleLabel: "Thinking parameter",
  thinkingStyleDesc: "How the deep-thinking switch is sent to this endpoint. Automatic detects it from the API address; unknown endpoints send nothing.",
  send: "Send",
  stop: "Stop",
  retry: "Retry",
  retryUnavailable: "Retry is available after the latest user message fails.",
  exported: "Exported to {path}",
  apiTest: "Test API",
  apiTesting: "Testing...",
  apiTestSuccess: "API configuration works and the model responded.",
  apiTestFailed: "API test failed. Check details.",
  apiAuthFailed: "The API key is invalid or does not have access.",
  apiEndpointNotFound: "Endpoint not found. Check that the API base URL includes the correct /v1 path.",
  apiRequestFailedShort: "AI request failed ({status}).",
  missingApiBaseUrl: "Missing API base URL. Add one in Spider settings.",
  missingApiKey: "Missing API key. Add one in Spider settings.",
  missingModel: "Missing model. Add one in Spider settings.",
  aiRequestFailed: "AI request failed ({status}). {body}",
  emptyAiResponse: "AI response was empty.",
  streamUnavailable: "The API did not return a readable stream.",
  generationStoppedWithPartial: "Generation stopped. The partial response was saved.",
  connectAiTitle: "Connect an AI provider",
  connectAiBody: "Configure an OpenAI-compatible endpoint, API key, and model first. Your draft will stay in this branch.",
  openSettings: "Open Spider settings",
  openSettingsFailed: "Could not open settings automatically. Go to Settings → Spider.",
  composerLabel: "Question for this branch",
  nodeTitleLabel: "Node title",
  graphCanvasLabel: "Knowledge map. Use arrow keys to navigate nodes, Tab to create a branch, and Shift + Tab to go to the parent.",
  nodeStatusLabel: "Node status",
  scrollTop: "Scroll to top",
  scrollLatest: "Jump to latest message",
  details: "Details",
  onboardingCardLabel: "Spider guide card",
  onboardingAskTitle: "Start with one question",
  onboardingAskBody: "Ask a root question first. Spider anchors this exploration as the starting point of the map.",
  onboardingBranchTitle: "Branch from the useful phrase",
  onboardingBranchBody: "Found a useful phrase? Select it and press Tab to branch.",
  onboardingChildTitle: "Follow up on this source text",
  onboardingChildBody: "This child node carries the selected source text. Ask your follow-up here.",
  onboardingDoneTitle: "Nice work. Welcome to Spider",
  onboardingDoneBody: "You have completed the core flow. Click Close to finish the guide; you can show it again from settings.",
  onboardingDismiss: "Hide guide",
  onboardingFinishButton: "Close",
  onboardingChildCreatedNotice: "Created a child node from selection",
  mergeSourcesLabel: "Referenced source branches",
  mergeSourceMissing: "Source node was deleted",
  modelLabel: "Model",
  contextMode: "Context",
  contextNone: "Current question only",
  contextParent: "Add the previous node's key points",
  contextAncestors: "Add all previous nodes on this path",
  contextWhole: "Add the entire map",
  sendOptionsTitle: "Next question settings",
  sendOptionsForNode: "Configure the next question for “{title}”. Defaults return after sending.",
  defaultModelOption: "Default model",
  apply: "Apply",
  nodeSettingsHint: "Right click a node for its actions",
  editNodeSummary: "Edit node summary",
  summaryPlaceholder: "Edit this summary. Markdown is supported.",
  exportChooseTitle: "Choose an export format",
  exportPackageName: "Full research package",
  exportPackageDesc: "A folder with an entry note, research brief, one Markdown file per node, an editable Canvas, and an SVG graph.",
  exportInteractiveName: "Interactive HTML",
  exportInteractiveDesc: "One offline file with search, replay, and theme switching. Easy to share.",
  exportMarkdownName: "Single Markdown",
  exportMarkdownDesc: "The whole map as one file with a table of contents; nodes link to each other by heading.",
  exportMermaidName: "Mermaid mindmap",
  exportMermaidDesc: "A Mermaid mindmap block you can paste into any note.",
  replay: "Replay",
  replayMode: "Replay order",
  replayTime: "Time",
  replayDepth: "Depth first",
  replayBreadth: "Breadth first",
  pause: "Pause",
  previousStep: "Previous step",
  nextStep: "Next step",
  replaySpeed: "Speed",
  replayProgress: "Node {current} of {total}",
  replayIdle: "Showing the full graph",
  exitReplay: "Exit replay",
  replayHelp: "Replay guide",
  replayHelpOrder: "Show existing nodes one by one in time, depth-first, or breadth-first order. Answers are not generated again.",
  replayHelpControls: "Play, step, or drag the timeline. Exit to restore the full graph and your previous selection.",
  replayModeHint: "Choose the order in which nodes appear; the graph itself is unchanged",
  replayPlayHint: "Show nodes one by one in the selected order",
  replaySpeedHint: "Adjust automatic playback speed",
  replayRangeHint: "Drag to jump to a replay step; the far left shows the full graph",
  exitReplayHint: "End replay and restore the full graph and previous selection",
  generationQueued: "Queued",
  generationRunning: "Generating",
  generationError: "Generation failed",
  branchDirectionBadge: "Direction",
  branchModelBadge: "Model",
  missingSource: "Source node is missing",
  settingsTitle: "Spider",
  settingLanguageName: "Interface language",
  settingLanguageDesc: "Switch the plugin interface language. All open Spider views update immediately.",
  settingExportFolderName: "Default export folder",
  settingExportFolderDesc: "The map index, research brief, node conversations, and Canvas are exported here.",
  settingTabName: "Use Tab to create branches",
  settingTabDesc: "When the map canvas is focused, Tab creates a branch. Selecting text in an AI response and pressing Tab branches from that text.",
  settingStreamName: "Stream responses",
  settingStreamDesc: "Show AI responses as they are generated.",
  settingAutoSummaryName: "Auto-summarize nodes",
  settingAutoSummaryDesc: "Generate a short summary after each AI response.",
  settingOnboardingName: "Onboarding guide cards",
  settingOnboardingDesc: "Show the Spider core workflow hints in the right panel again.",
  settingOnboardingButton: "Show again",
  settingOnboardingRestored: "Onboarding guide cards restored.",
};

const dictionaries: Record<AppLanguage, TranslationDictionary> = {
  "zh-CN": zh,
  en,
};

export function t(language: AppLanguage, key: TranslationKey, vars: Record<string, string | number> = {}): string {
  const template = dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? ""));
}

export function displayTitle(language: AppLanguage, title: string): string {
  const defaultTitles: Record<AppLanguage, Record<string, string>> = {
    "zh-CN": {
      "Untitled chat map": zh.defaultMapTitle,
      "Root question": zh.rootQuestionTitle,
      "Untitled question": zh.untitledQuestionTitle,
    },
    en: {
      "未命名对话图谱": en.defaultMapTitle,
      "根问题": en.rootQuestionTitle,
      "未命名问题": en.untitledQuestionTitle,
    },
  };
  return defaultTitles[language][title] ?? title;
}

export function statusLabel(language: AppLanguage, status: ChatNodeStatus): string {
  const keys: Record<ChatNodeStatus, TranslationKey> = {
    open: "statusOpen",
    understood: "statusUnderstood",
    archived: "statusArchived",
  };
  return t(language, keys[status]);
}

export function roleLabel(language: AppLanguage, role: ChatRole): string {
  const labels: Record<AppLanguage, Record<ChatRole, string>> = {
    "zh-CN": { system: "系统", user: "你", assistant: "AI" },
    en: { system: "System", user: "You", assistant: "AI" },
  };
  return labels[language][role];
}

function englishCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function nodesCountLabel(language: AppLanguage, count: number): string {
  return language === "zh-CN" ? `${count} 个节点` : englishCount(count, "node", "nodes");
}

export function branchesCountLabel(language: AppLanguage, count: number): string {
  return language === "zh-CN" ? `${count} 分支` : englishCount(count, "branch", "branches");
}

export function mapStatsLabel(language: AppLanguage, nodes: number, depth: number): string {
  return language === "zh-CN"
    ? `${nodes} 个节点 · 当前第 ${depth} 层`
    : `${englishCount(nodes, "node", "nodes")} · depth ${depth}`;
}

export function nodeStatsLabel(language: AppLanguage, messages: number, children: number): string {
  return language === "zh-CN"
    ? `${messages} 条消息 · ${children} 个子节点`
    : `${englishCount(messages, "message", "messages")} · ${englishCount(children, "branch", "branches")}`;
}

export function reasoningSummaryLabel(language: AppLanguage, chars: number, streaming: boolean): string {
  const count = chars.toLocaleString(language);
  if (language === "zh-CN") {
    return streaming ? `思考中… ${count} 字` : `思考过程 · ${count} 字`;
  }
  return streaming ? `Thinking… ${count} chars` : `Thinking · ${count} chars`;
}

export function confirmDeleteSubtreeLabel(language: AppLanguage, count: number): string {
  return language === "zh-CN"
    ? `确认删除当前节点及其 ${count} 个子节点？此操作不可撤销。`
    : `Delete the current node and its ${englishCount(count, "branch", "branches")}? This cannot be undone.`;
}
