import { requestUrl } from "obsidian";
import type { AiChatRequest, AiProvider, AppLanguage, BranchChatMapSettings, ChatMessage, ChatNode, ModelProfile } from "../types";
import { normalizeApiBaseUrl, resolveThinkingStyle } from "../settingsDefaults";
import { t } from "../i18n";

/** Reasoning models disagree on the field name, so every known spelling is read. */
interface ReasoningFields {
  reasoning_content?: unknown;
  reasoning?: unknown;
  thinking?: unknown;
  reasoning_details?: unknown;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: ReasoningFields & {
      content?: string;
    };
  }>;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: ReasoningFields & {
      content?: string;
    };
  }>;
}

/**
 * Map the deep-thinking switch onto the endpoint's own parameter shape. Endpoints we
 * cannot identify send nothing, so the request stays valid for strict servers.
 */
function thinkingBody(profile: ModelProfile | undefined, thinking: boolean | undefined): Record<string, unknown> {
  if (thinking === undefined) {
    return {};
  }
  switch (resolveThinkingStyle(profile)) {
    case "thinking":
      return { thinking: { type: thinking ? "enabled" : "disabled" } };
    case "enable_thinking":
      return { enable_thinking: thinking };
    case "reasoning":
      return { reasoning: { enabled: thinking } };
    default:
      return {};
  }
}

/**
 * Read chain-of-thought text from a streamed delta or a complete message.
 * DeepSeek/Qwen/Moonshot use `reasoning_content`, OpenRouter uses `reasoning` or an
 * array in `reasoning_details`, and some gateways use `thinking`.
 */
function readReasoning(value: ReasoningFields | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  for (const field of [value.reasoning_content, value.reasoning, value.thinking]) {
    if (typeof field === "string" && field) {
      return field;
    }
  }

  if (Array.isArray(value.reasoning_details)) {
    const joined = value.reasoning_details
      .map((detail) => detail && typeof detail === "object" && typeof (detail as { text?: unknown }).text === "string"
        ? (detail as { text: string }).text
        : "")
      .join("");
    if (joined) {
      return joined;
    }
  }

  return undefined;
}

interface ModelListResponse {
  data?: Array<{ id?: string }>;
}

export interface ApiTestResult {
  ok: boolean;
  message: string;
  details?: string;
  status?: number;
}

export class AiRequestError extends Error {
  readonly status?: number;
  readonly details?: string;

  constructor(message: string, options: { status?: number; details?: string } = {}) {
    super(message);
    this.name = "AiRequestError";
    this.status = options.status;
    this.details = options.details;
  }
}

function buildMessages(request: AiChatRequest, settings: BranchChatMapSettings): ChatMessage[] {
  const contextMessages: ChatMessage[] = [];
  const languageInstruction = systemMessage(
    "system_language",
    settings.language === "zh-CN"
      ? "除非用户明确要求其他语言，否则请默认使用简体中文回答。回答要清晰、适合学习场景，并尽量保留关键术语。"
      : "Unless the user explicitly asks for another language, respond in English. Keep answers clear and useful for learning.",
  );

  const customInstructions: ChatMessage[] = [];
  if (request.profile?.systemPrompt?.trim()) {
    customInstructions.push(systemMessage("system_profile_prompt", request.profile.systemPrompt.trim()));
  }
  if (request.systemPromptOverride?.trim()) {
    customInstructions.push(systemMessage("system_request_override", request.systemPromptOverride.trim()));
  }

  if (request.contextMessages === undefined && request.includeParentContext && request.parent) {
    const context = [
      `Parent topic: ${request.parent.title}`,
      request.parent.summary ? `Parent summary: ${request.parent.summary}` : "",
      request.node.anchorText ? `Selected anchor: ${request.node.anchorText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    contextMessages.push({
      id: "system_parent_context",
      role: "system",
      content: `Use this compact context for the child question.\n${context}`,
      createdAt: new Date().toISOString(),
    });
  }

  if (request.contextMessages && request.contextMessages.length > 0) {
    if (request.contextMessages.every((message) => message.role === "system")) {
      contextMessages.push(...request.contextMessages);
    } else {
      contextMessages.push({
        id: "system_full_context",
        role: "system",
        content:
          settings.language === "zh-CN"
            ? "以下是图谱中的相关对话记录，供你参考上下文：\n\n" +
              request.contextMessages.map((m) => `${m.role}: ${m.content}`).join("\n")
            : "Below are relevant conversations from this map for context:\n\n" +
              request.contextMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
        createdAt: new Date().toISOString(),
      });
    }
  }

  const contextBudget = settings.maxContextChars ?? 12000;
  const budgetedMessages = fitConversationBudget(
    customInstructions,
    contextMessages,
    request.node.messages,
    contextBudget,
  );
  return [languageInstruction, ...budgetedMessages];
}

function fitConversationBudget(
  customInstructions: ChatMessage[],
  contextMessages: ChatMessage[],
  nodeMessages: ChatMessage[],
  maxChars: number,
  protectLatestUserPrompt = true,
): ChatMessage[] {
  let remaining = Math.max(0, Math.floor(maxChars));
  const orderedMessages = [...customInstructions, ...contextMessages, ...nodeMessages];
  if (orderedMessages.reduce((sum, message) => sum + message.content.length, 0) <= remaining) {
    return orderedMessages;
  }

  // By default protect the latest user prompt, then custom instructions, then recent
  // node history and map context. Auxiliary calls opt out so that their newest turn
  // survives even when the latest prompt is long. Fixed language guidance is outside
  // this budget.
  const selected = new Map<number, ChatMessage>();
  const latestUserIndex = protectLatestUserPrompt
    ? findLastIndex(nodeMessages, (message) => message.role === "user")
    : -1;
  const take = (message: ChatMessage, index: number, keepTail = false): void => {
    if (remaining <= 0) {
      return;
    }
    if (message.content.length <= remaining) {
      selected.set(index, message);
      remaining -= message.content.length;
      return;
    }
    selected.set(index, {
      ...message,
      content: keepTail
        ? message.content.slice(message.content.length - remaining)
        : message.content.slice(0, remaining),
    });
    remaining = 0;
  };

  const customStart = 0;
  const contextStart = customInstructions.length;
  const nodeStart = contextStart + contextMessages.length;

  if (latestUserIndex >= 0) {
    take(nodeMessages[latestUserIndex]!, nodeStart + latestUserIndex);
  }
  for (let index = customInstructions.length - 1; index >= 0 && remaining > 0; index -= 1) {
    take(customInstructions[index]!, customStart + index);
  }
  for (let index = nodeMessages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    if (index !== latestUserIndex) {
      take(nodeMessages[index]!, nodeStart + index);
    }
  }
  for (let index = contextMessages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    take(contextMessages[index]!, contextStart + index, true);
  }

  return [...selected.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, message]) => message);
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index]!)) {
      return index;
    }
  }
  return -1;
}

export class OpenAICompatibleProvider implements AiProvider {
  private readonly settings: BranchChatMapSettings;

  constructor(settings: BranchChatMapSettings) {
    this.settings = settings;
  }

  async chat(request: AiChatRequest): Promise<string> {
    return this.requestChatCompletion(
      buildMessages(request, this.settings),
      request.model,
      request.signal,
      request.profile,
      request.onReasoning,
      thinkingBody(request.profile, request.thinking),
    );
  }

  async *streamChat(request: AiChatRequest): AsyncGenerator<string> {
    yield* this.requestChatCompletionStream(
      buildMessages(request, this.settings),
      request.model,
      request.signal,
      request.profile,
      request.onReasoning,
      thinkingBody(request.profile, request.thinking),
    );
  }

  async summarizeNode(node: ChatNode, signal?: AbortSignal, profile?: ModelProfile): Promise<string> {
    return this.requestAuxiliaryCompletion(
      "system_summary",
      this.settings.language === "zh-CN"
        ? "用一句简洁的简体中文总结这个对话节点。只返回总结本身。"
        : "Summarize this chat node in one concise sentence. Return only the summary.",
      node,
      signal,
      profile,
    );
  }

  async titleNode(node: ChatNode, signal?: AbortSignal, profile?: ModelProfile): Promise<string> {
    return this.requestAuxiliaryCompletion(
      "system_title",
      this.settings.language === "zh-CN"
        ? "为这个对话节点生成一个简短中文标题。只返回标题，不要解释，不要引号，不要句号，不超过 8 个字。"
        : "Create a short title for this chat node. Return only the title, no quotes, no period, under 8 words.",
      node,
      signal,
      profile,
    );
  }

  /**
   * Summaries and titles are auxiliary requests, so they follow the configured
   * context budget instead of sending the whole node history. Their instruction is
   * reserved outside that budget, and stored system messages are dropped because
   * they would sit after the instruction and could override it.
   */
  private async requestAuxiliaryCompletion(
    instructionId: string,
    instruction: string,
    node: ChatNode,
    signal?: AbortSignal,
    profile?: ModelProfile,
  ): Promise<string> {
    const instructions: ChatMessage[] = [];
    if (profile?.systemPrompt?.trim()) {
      instructions.push(systemMessage("system_profile_prompt", profile.systemPrompt.trim()));
    }
    instructions.push(systemMessage(instructionId, instruction));

    const reservedChars = instructions.reduce((total, message) => total + message.content.length, 0);
    const historyBudget = Math.max(0, Math.floor(this.settings.maxContextChars ?? 12000) - reservedChars);
    const history = node.messages.filter((message) => message.role !== "system");
    // Newest first: a summary describes the latest exchange, not the oldest content.
    const messages = [...instructions, ...fitConversationBudget([], [], history, historyBudget, false)];

    return this.requestChatCompletion(messages, profile?.model ?? this.settings.model, signal, profile);
  }

  async testConnection(profileOrSignal?: ModelProfile | AbortSignal, maybeSignal?: AbortSignal): Promise<ApiTestResult> {
    const profile = isModelProfile(profileOrSignal) ? profileOrSignal : undefined;
    const signal = profile ? maybeSignal : profileOrSignal as AbortSignal | undefined;
    const validation = validateSettings(this.settings, profile);
    if (validation) {
      return validation;
    }

    try {
      await this.requestChatCompletion(
        [
          {
            id: "system_api_test",
            role: "system",
            content: "Reply with OK only.",
            createdAt: new Date().toISOString(),
          },
          {
            id: "user_api_test",
            role: "user",
            content: "OK",
            createdAt: new Date().toISOString(),
          },
        ],
        profile?.model ?? this.settings.model,
        signal,
        profile,
      );

      return {
        ok: true,
        message: t(this.settings.language, "apiTestSuccess"),
      };
    } catch (error: unknown) {
      return errorToTestResult(error, this.settings.language);
    }
  }

  async listModels(profile?: ModelProfile): Promise<string[]> {
    const config = this.getRequestConfig(profile?.model ?? this.settings.model, profile);
    if (!config.baseUrl) {
      throw new AiRequestError(t(this.settings.language, "missingApiBaseUrl"));
    }
    if (!config.apiKey) {
      throw new AiRequestError(t(this.settings.language, "missingApiKey"));
    }

    const response = await requestUrl({
      url: `${config.baseUrl}/models`,
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      throw: false,
    });
    if (response.status < 200 || response.status >= 300) {
      const body = typeof response.text === "string" ? response.text.slice(0, 240) : "";
      throw new AiRequestError(friendlyHttpMessage(this.settings.language, response.status), {
        status: response.status,
        details: t(this.settings.language, "aiRequestFailed", { status: response.status, body }),
      });
    }

    const data = response.json as ModelListResponse;
    return [...new Set((data.data ?? []).map((model) => model.id?.trim()).filter((id): id is string => Boolean(id)))];
  }

  private async requestChatCompletion(
    messages: ChatMessage[],
    model: string,
    signal?: AbortSignal,
    profile?: ModelProfile,
    onReasoning?: (text: string) => void,
    bodyExtras: Record<string, unknown> = {},
  ): Promise<string> {
    const config = this.getRequestConfig(model, profile);
    if (!config.apiKey) {
      throw new AiRequestError(t(this.settings.language, "missingApiKey"));
    }

    if (!config.model) {
      throw new AiRequestError(t(this.settings.language, "missingModel"));
    }
    if (!config.baseUrl) {
      throw new AiRequestError(t(this.settings.language, "missingApiBaseUrl"));
    }

    // requestUrl cannot be aborted once started, but a cancelled request can still be
    // stopped from ever leaving the client.
    signal?.throwIfAborted();

    const response = await requestUrl({
      url: `${config.baseUrl}/chat/completions`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: false,
        ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
        ...(config.maxTokens === undefined ? {} : { max_tokens: config.maxTokens }),
        ...bodyExtras,
      }),
      throw: false,
    });

    if (response.status < 200 || response.status >= 300) {
      const body = typeof response.text === "string" ? response.text.slice(0, 240) : "";
      throw new AiRequestError(friendlyHttpMessage(this.settings.language, response.status), {
        status: response.status,
        details: t(this.settings.language, "aiRequestFailed", { status: response.status, body }),
      });
    }

    const data = response.json as ChatCompletionResponse;
    const message = data.choices?.[0]?.message;
    const content = message?.content?.trim();

    const reasoning = readReasoning(message)?.trim();
    if (reasoning) {
      onReasoning?.(reasoning);
    }

    if (!content) {
      throw new AiRequestError(t(this.settings.language, "emptyAiResponse"));
    }

    return content;
  }

  private async *requestChatCompletionStream(
    messages: ChatMessage[],
    model: string,
    signal?: AbortSignal,
    profile?: ModelProfile,
    onReasoning?: (text: string) => void,
    bodyExtras: Record<string, unknown> = {},
  ): AsyncGenerator<string> {
    const config = this.getRequestConfig(model, profile);
    if (!config.apiKey) {
      throw new AiRequestError(t(this.settings.language, "missingApiKey"));
    }

    if (!config.model) {
      throw new AiRequestError(t(this.settings.language, "missingModel"));
    }
    if (!config.baseUrl) {
      throw new AiRequestError(t(this.settings.language, "missingApiBaseUrl"));
    }

    // Streaming requires fetch — Obsidian's requestUrl does not support
    // ReadableStream / SSE chunks, so the streaming path is the one place
    // where fetch is unavoidable. Sync requests in requestChatCompletion
    // already use requestUrl.
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        stream: true,
        ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
        ...(config.maxTokens === undefined ? {} : { max_tokens: config.maxTokens }),
        ...bodyExtras,
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new AiRequestError(friendlyHttpMessage(this.settings.language, response.status), {
        status: response.status,
        details: t(this.settings.language, "aiRequestFailed", { status: response.status, body: body.slice(0, 240) }),
      });
    }

    if (!response.body) {
      throw new AiRequestError(t(this.settings.language, "streamUnavailable"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let emittedContent = false;
    let pendingWhitespace = "";
    const prepareStreamContent = (content: string): string => {
      let nextContent = content;
      if (!emittedContent) {
        nextContent = nextContent.trimStart();
        if (!nextContent) {
          return "";
        }
        emittedContent = true;
      }

      const combined = pendingWhitespace + nextContent;
      const trailingWhitespace = combined.match(/\s+$/)?.[0] ?? "";
      const readyContent = trailingWhitespace
        ? combined.slice(0, -trailingWhitespace.length)
        : combined;
      pendingWhitespace = trailingWhitespace;
      return readyContent;
    };

    let emittedReasoning = false;
    const pushReasoning = (text: string): void => {
      if (!onReasoning) {
        return;
      }
      // A leading blank line from the first reasoning delta would render as an empty gap.
      const nextText = emittedReasoning ? text : text.replace(/^\s+/, "");
      if (!nextText) {
        return;
      }
      emittedReasoning = true;
      onReasoning(nextText);
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) {
            continue;
          }

          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") {
            continue;
          }

          const chunk = JSON.parse(payload) as ChatCompletionChunk;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            const readyContent = prepareStreamContent(delta.content);
            if (readyContent) {
              yield readyContent;
            }
          }

          const reasoning = readReasoning(delta);
          if (reasoning) {
            pushReasoning(reasoning);
          }
        }
      }

      buffer += decoder.decode();
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data:")) {
        const payload = finalLine.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          const chunk = JSON.parse(payload) as ChatCompletionChunk;
          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            const readyContent = prepareStreamContent(delta.content);
            if (readyContent) {
              yield readyContent;
            }
          }

          const reasoning = readReasoning(delta);
          if (reasoning) {
            pushReasoning(reasoning);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!emittedContent) {
      throw new AiRequestError(t(this.settings.language, "emptyAiResponse"));
    }
  }

  private getRequestConfig(model: string, profile?: ModelProfile): {
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature?: number;
    maxTokens?: number;
  } {
    return {
      baseUrl: normalizeApiBaseUrl(profile?.baseUrl ?? this.settings.apiBaseUrl),
      apiKey: profile?.apiKey.trim() ?? this.settings.apiKey.trim(),
      model: profile?.model ?? model,
      temperature: profile?.temperature,
      maxTokens: profile?.maxTokens,
    };
  }
}

function validateSettings(settings: BranchChatMapSettings, profile?: ModelProfile): ApiTestResult | null {
  if (!(profile?.baseUrl ?? settings.apiBaseUrl).trim()) {
    return { ok: false, message: t(settings.language, "missingApiBaseUrl") };
  }

  if (!(profile?.apiKey ?? settings.apiKey).trim()) {
    return { ok: false, message: t(settings.language, "missingApiKey") };
  }

  if (!(profile?.model ?? settings.model).trim()) {
    return { ok: false, message: t(settings.language, "missingModel") };
  }

  return null;
}

function isModelProfile(value: ModelProfile | AbortSignal | undefined): value is ModelProfile {
  return Boolean(value && "id" in value && "baseUrl" in value && "model" in value);
}

function systemMessage(id: string, content: string): ChatMessage {
  return { id, role: "system", content, createdAt: new Date().toISOString() };
}

function friendlyHttpMessage(language: AppLanguage, status: number): string {
  if (status === 401 || status === 403) {
    return t(language, "apiAuthFailed");
  }

  if (status === 404) {
    return t(language, "apiEndpointNotFound");
  }

  return t(language, "apiRequestFailedShort", { status });
}

function errorToTestResult(error: unknown, language: AppLanguage): ApiTestResult {
  if (error instanceof AiRequestError) {
    return {
      ok: false,
      message: error.message,
      details: error.details,
      status: error.status,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    message: t(language, "apiTestFailed"),
    details: message,
  };
}
