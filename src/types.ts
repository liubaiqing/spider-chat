export type NodeId = string;
export type MessageId = string;
export type ChatMapId = string;

export type ChatRole = "system" | "user" | "assistant";
export type ChatNodeStatus = "open" | "understood" | "archived";
export type AppLanguage = "zh-CN" | "en";
export type ContextMode = "none" | "parent" | "ancestors" | "whole";

export interface ModelProfile {
  id: string;
  alias: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  apiKeyEnvVar?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  /** How the deep-thinking switch is sent to this endpoint. "auto" detects it. */
  thinkingParamStyle?: ThinkingParamStyle;
}

export type ThinkingParamStyle = "auto" | "none" | "thinking" | "enable_thinking" | "reasoning";

/** One entry per option in the export picker. */
export type ExportFormat = "package" | "interactive" | "markdown" | "mermaid";

export interface ModelSnapshot {
  profileId: string;
  alias: string;
  model: string;
}

export interface MergeSourceRef {
  nodeId: NodeId;
  messageId?: MessageId;
  titleSnapshot: string;
}

export interface ChatMessage {
  id: MessageId;
  role: ChatRole;
  content: string;
  createdAt: string;
  modelSnapshot?: ModelSnapshot;
  state?: "complete" | "stopped";
  /**
   * Chain-of-thought text from reasoning models. It stays out of the answer, out of
   * the request messages, and out of exports; the chat panel renders it collapsed.
   */
  reasoning?: string;
}

/** UTF-16 offsets within a rendered message body; end is exclusive. */
export interface BranchSource {
  messageId: MessageId;
  start: number;
  end: number;
}

export interface ChatNode {
  id: NodeId;
  parentId?: NodeId;
  title: string;
  anchorText?: string;
  sourceMessageId?: MessageId;
  sourceTextRange?: { start: number; end: number };
  messages: ChatMessage[];
  summary?: string;
  summaryEditedByUser?: boolean;
  note?: string;
  status: ChatNodeStatus;
  position: {
    x: number;
    y: number;
  };
  children: NodeId[];
  createdAt: string;
  updatedAt: string;
  defaultModelProfileId?: string;
  branchDirection?: string;
  branchColor?: string;
  mergeSources?: MergeSourceRef[];
}

export interface ChatEdge {
  id: string;
  from: NodeId;
  to: NodeId;
}

export interface ChatMap {
  id: ChatMapId;
  title: string;
  rootNodeId: NodeId;
  nodes: Record<NodeId, ChatNode>;
  edges: ChatEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface BranchChatMapSettings {
  language: AppLanguage;
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  defaultExportFolder: string;
  useTabToCreateChildNodes: boolean;
  /** Magnetic alignment of dragged cards onto the axes of their neighbours. */
  snapToGuides: boolean;
  autoSummarizeNodes: boolean;
  includeParentContext: boolean;
  includeFullContext: boolean;
  streamResponses: boolean;
  onboardingCardDismissed: boolean;
  lastOpenedMapId?: string;
  /** Local reading progress for each map; never written into an exported map. */
  lastReadLocations?: Record<ChatMapId, { nodeId: NodeId; scrollTop: number }>;
  models?: ModelProfile[];
  defaultModelProfileId?: string;
  contextMode?: ContextMode;
  contextRecentFull?: number;
  contextTruncateChars?: number;
  maxContextChars?: number;
  maxConcurrentGenerations?: number;
}

export interface AiChatRequest {
  node: ChatNode;
  parent?: ChatNode;
  contextMessages?: ChatMessage[];
  model: string;
  includeParentContext: boolean;
  signal?: AbortSignal;
  profile?: ModelProfile;
  contextMode?: ContextMode;
  systemPromptOverride?: string;
  /**
   * Reasoning models report their thinking here: once for a non-streaming request,
   * and per delta while streaming. Answer text keeps using the normal return value
   * or stream chunks, so providers that ignore this callback behave exactly as before.
   */
  onReasoning?: (text: string) => void;
  /** Deep-thinking switch for this request; ignored when the endpoint style is "none". */
  thinking?: boolean;
}

export interface AiProvider {
  chat(request: AiChatRequest): Promise<string>;
  streamChat(request: AiChatRequest): AsyncGenerator<string>;
  summarizeNode(node: ChatNode, signal?: AbortSignal): Promise<string>;
  titleNode(node: ChatNode, signal?: AbortSignal): Promise<string>;
}
