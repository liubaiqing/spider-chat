import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/ai/openAICompatibleProvider";
import { createMessage, createNode } from "../src/domain/chatMap";
import type { BranchChatMapSettings } from "../src/types";

const settings: BranchChatMapSettings = {
  language: "zh-CN",
  apiBaseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "test-model",
  defaultExportFolder: "Spider Maps",
  useTabToCreateChildNodes: true,
  autoSummarizeNodes: false,
  includeParentContext: true,
  includeFullContext: false,
  streamResponses: true,
  onboardingCardDismissed: false,
};

function streamFromText(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

describe("OpenAICompatibleProvider", () => {
  it("tests API configuration with a minimal non-streaming request", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: "",
      json: { choices: [{ message: { content: "OK" } }] },
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });

    const provider = new OpenAICompatibleProvider(settings);
    const result = await provider.testConnection();

    expect(result.ok).toBe(true);
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.test/v1/chat/completions",
      method: "POST",
    }));
  });

  it("maps API test auth errors to friendly messages with details", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 401,
      text: "bad key",
      json: {},
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });

    const provider = new OpenAICompatibleProvider(settings);
    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("API Key");
    expect(result.details).toContain("401");
  });

  it("validates missing model before testing API", async () => {
    const provider = new OpenAICompatibleProvider({ ...settings, model: "" });
    const result = await provider.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toContain("模型");
  });

  it("streams OpenAI-compatible chunks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        streamFromText(
          [
            'data: {"choices":[{"delta":{"content":" 你好"}}]}',
            'data: {"choices":[{"delta":{"content":"，世界 "}}]}',
            "data: [DONE]",
            "",
          ].join("\n"),
        ),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenAICompatibleProvider(settings);
    const node = createNode({
      title: "测试",
      messages: [createMessage("user", "解释一下流式输出")],
    });

    let content = "";
    for await (const chunk of provider.streamChat({
      node,
      model: settings.model,
      includeParentContext: true,
    })) {
      content += chunk;
    }

    expect(content).toBe("你好，世界");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"stream":true'),
      }),
    );

    vi.unstubAllGlobals();
  });

  it("uses a profile's endpoint, credentials, prompt, temperature, and token limit for sync requests", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: "",
      json: { choices: [{ message: { content: "Profile answer" } }] },
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });
    const provider = new OpenAICompatibleProvider(settings);
    const node = createNode({ title: "Profile", messages: [createMessage("user", "Question")] });

    await provider.chat({
      node,
      model: "legacy-model",
      includeParentContext: false,
      profile: {
        id: "reasoning",
        alias: "Reasoning",
        model: "profile-model",
        baseUrl: "https://profile.test/v1/chat/completions/",
        apiKey: "profile-key",
        temperature: 0.4,
        maxTokens: 777,
      },
      systemPromptOverride: "Answer with citations.",
    });

    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://profile.test/v1/chat/completions",
      headers: expect.objectContaining({ Authorization: "Bearer profile-key" }),
      body: expect.stringContaining('"model":"profile-model"'),
    }));
    const callArg = requestUrl.mock.calls.at(-1)?.[0];
    const call = typeof callArg === "string" ? undefined : callArg;
    const body = JSON.parse(typeof call?.body === "string" ? call.body : "{}") as {
      temperature?: number;
      max_tokens?: number;
      messages?: Array<{ content: string }>;
    };
    expect(body.temperature).toBe(0.4);
    expect(body.max_tokens).toBe(777);
    expect(body.messages?.some((message) => message.content === "Answer with citations.")).toBe(true);
  });

  it("lists models from a profile endpoint", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: "",
      json: { data: [{ id: "model-a" }, { id: "model-b" }] },
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });
    const provider = new OpenAICompatibleProvider(settings);
    const models = await provider.listModels({
      id: "custom",
      alias: "Custom",
      model: "model-a",
      baseUrl: "https://profile.test/v1/chat/completions",
      apiKey: "custom-key",
    });

    expect(models).toEqual(["model-a", "model-b"]);
    expect(requestUrl).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://profile.test/v1/models",
      method: "GET",
      headers: { Authorization: "Bearer custom-key" },
    }));
  });

  it("uses profile settings in the streaming request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(streamFromText('data: {"choices":[{"delta":{"content":"ok"}}]}\ndata: [DONE]\n'), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider(settings);
    const node = createNode({ title: "Profile", messages: [createMessage("user", "Question")] });
    const profile = {
      id: "fast",
      alias: "Fast",
      model: "fast-model",
      baseUrl: "https://profile.test/v1",
      apiKey: "stream-key",
      temperature: 0.2,
      maxTokens: 333,
    };

    for await (const _chunk of provider.streamChat({ node, model: settings.model, includeParentContext: false, profile })) {
      // Consume the stream.
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as { model?: string; temperature?: number; max_tokens?: number };
    expect(fetchMock).toHaveBeenCalledWith("https://profile.test/v1/chat/completions", expect.anything());
    expect(body).toMatchObject({ model: "fast-model", temperature: 0.2, max_tokens: 333 });
    vi.unstubAllGlobals();
  });

  it("trims streamed leading and trailing whitespace like sync responses, including an unterminated final SSE line", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(streamFromText('data: {"choices":[{"delta":{"content":"  answer  "}}]}'), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider(settings);
    const node = createNode({ title: "Whitespace", messages: [createMessage("user", "Question")] });
    let answer = "";

    for await (const chunk of provider.streamChat({ node, model: settings.model, includeParentContext: false })) {
      answer += chunk;
    }

    expect(answer).toBe("answer");
    vi.unstubAllGlobals();
  });

  it("keeps current node history and the latest prompt within the configured context budget", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: "",
      json: { choices: [{ message: { content: "answer" } }] },
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });
    const provider = new OpenAICompatibleProvider({ ...settings, maxContextChars: 40 });
    const node = createNode({
      title: "Long history",
      messages: [
        createMessage("user", "old user content that should be dropped"),
        createMessage("assistant", "old assistant content that should be dropped"),
        createMessage("user", "latest prompt"),
      ],
    });

    await provider.chat({ node, model: settings.model, includeParentContext: false });

    const callArg = requestUrl.mock.calls.at(-1)?.[0];
    const call = typeof callArg === "string" ? undefined : callArg;
    const body = JSON.parse(typeof call?.body === "string" ? call.body : "{}") as {
      messages?: Array<{ role: string; content: string }>;
    };
    const payloadHistory = body.messages?.filter((message) => message.role !== "system").map((message) => message.content).join("") ?? "";
    expect(payloadHistory.length).toBeLessThanOrEqual(40);
    expect(payloadHistory).toContain("latest prompt");
  });

  it("counts profile and skill system prompts in the budget while preserving the latest user prompt", async () => {
    const requestUrl = await import("obsidian").then((mod) => vi.mocked(mod.requestUrl));
    requestUrl.mockResolvedValueOnce({
      status: 200,
      text: "",
      json: { choices: [{ message: { content: "answer" } }] },
      arrayBuffer: new ArrayBuffer(0),
      headers: {},
    });
    const provider = new OpenAICompatibleProvider({ ...settings, maxContextChars: 30 });
    const node = createNode({
      title: "Prompt budget",
      messages: [createMessage("user", "old question"), createMessage("assistant", "old answer"), createMessage("user", "latest prompt")],
    });

    await provider.chat({
      node,
      model: settings.model,
      includeParentContext: false,
      contextMessages: [createMessage("user", "older map conversation that should be cut")],
      profile: { id: "profile", alias: "Profile", model: "m", baseUrl: "https://example.test/v1", apiKey: "k", systemPrompt: "PROFILE" },
      systemPromptOverride: "SKILL",
    });

    const callArg = requestUrl.mock.calls.at(-1)?.[0];
    const call = typeof callArg === "string" ? undefined : callArg;
    const body = JSON.parse(typeof call?.body === "string" ? call.body : "{}") as {
      messages?: Array<{ role: string; content: string }>;
    };
    const countedMessages = body.messages?.filter((message) => !message.content.startsWith("除非用户明确要求其他语言")) ?? [];
    expect(countedMessages.reduce((total, message) => total + message.content.length, 0)).toBeLessThanOrEqual(30);
    expect(countedMessages.some((message) => message.content === "PROFILE")).toBe(true);
    expect(countedMessages.some((message) => message.content === "SKILL")).toBe(true);
    expect(countedMessages.some((message) => message.content === "latest prompt")).toBe(true);
  });
});
