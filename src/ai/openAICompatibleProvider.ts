import { requestUrl } from "obsidian";
import type { AiChatRequest, AiProvider, AppLanguage, BranchChatMapSettings, ChatMessage, ChatNode, ModelProfile } from "../types";
import { normalizeApiBaseUrl } from "../settingsDefaults";
import { t } from "../i18n";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface ChatCompletionChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
  }>;
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
): ChatMessage[] {
  let remaining = Math.max(0, Math.floor(maxChars));
  const orderedMessages = [...customInstructions, ...contextMessages, ...nodeMessages];
  if (orderedMessages.reduce((sum, message) => sum + message.content.length, 0) <= remaining) {
    return orderedMessages;
  }

  // Protect the latest user prompt, then custom instructions, then recent node
  // history and map context. Fixed language guidance is outside this budget.
  const selected = new Map<number, ChatMessage>();
  const latestUserIndex = findLastIndex(nodeMessages, (message) => message.role === "user");
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
    return this.requestChatCompletion(buildMessages(request, this.settings), request.model, request.signal, request.profile);
  }

  async *streamChat(request: AiChatRequest): AsyncGenerator<string> {
    yield* this.requestChatCompletionStream(
      buildMessages(request, this.settings),
      request.model,
      request.signal,
      request.profile,
    );
  }

  async summarizeNode(node: ChatNode, signal?: AbortSignal, profile?: ModelProfile): Promise<string> {
    const messages: ChatMessage[] = [];
    if (profile?.systemPrompt?.trim()) {
      messages.push(systemMessage("system_profile_prompt", profile.systemPrompt.trim()));
    }
    messages.push(
      systemMessage(
        "system_summary",
        this.settings.language === "zh-CN"
          ? "用一句简洁的简体中文总结这个对话节点。只返回总结本身。"
          : "Summarize this chat node in one concise sentence. Return only the summary.",
      ),
      ...node.messages,
    );

    return this.requestChatCompletion(messages, profile?.model ?? this.settings.model, signal, profile);
  }

  async titleNode(node: ChatNode, signal?: AbortSignal, profile?: ModelProfile): Promise<string> {
    const messages: ChatMessage[] = [];
    if (profile?.systemPrompt?.trim()) {
      messages.push(systemMessage("system_profile_prompt", profile.systemPrompt.trim()));
    }
    messages.push(
      systemMessage(
        "system_title",
        this.settings.language === "zh-CN"
          ? "为这个对话节点生成一个简短中文标题。只返回标题，不要解释，不要引号，不要句号，不超过 8 个字。"
          : "Create a short title for this chat node. Return only the title, no quotes, no period, under 8 words.",
      ),
      ...node.messages,
    );

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

  async listModels(profile?: ModelProfile, signal?: AbortSignal): Promise<string[]> {
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
    const content = data.choices?.[0]?.message?.content?.trim();

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
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            const readyContent = prepareStreamContent(content);
            if (readyContent) {
              yield readyContent;
            }
          }
        }
      }

      buffer += decoder.decode();
      const finalLine = buffer.trim();
      if (finalLine.startsWith("data:")) {
        const payload = finalLine.slice(5).trim();
        if (payload && payload !== "[DONE]") {
          const chunk = JSON.parse(payload) as ChatCompletionChunk;
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) {
            const readyContent = prepareStreamContent(content);
            if (readyContent) {
              yield readyContent;
            }
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
