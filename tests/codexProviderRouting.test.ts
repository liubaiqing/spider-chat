import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "obsidian";
import { OpenAICompatibleProvider } from "../src/ai/openAICompatibleProvider";
import { createDefaultSettings } from "../src/settingsDefaults";
import { createMessage, createNode } from "../src/domain/chatMap";
import { listCodexModels, streamCodex, testCodexConnection } from "../src/ai/codexAppServer";
import type { ModelProfile } from "../src/types";

vi.mock("../src/ai/codexAppServer", () => ({
  streamCodex: vi.fn(async function* () { yield "answer"; }),
  listCodexModels: vi.fn(async () => [{ model: "available" }]),
  testCodexConnection: vi.fn(async () => {}),
}));
const profile: ModelProfile = { id: "codex", alias: "ChatGPT", provider: "codex-app-server", model: "available", baseUrl: "", apiKey: "" };
const node = createNode({ title: "Node", messages: [createMessage("user", "Question")] });
beforeEach(() => vi.clearAllMocks());

describe("Codex profile routing", () => {
  it("routes streamed and non-streamed chat, summaries and titles without HTTP or an API key", async () => {
    const provider = new OpenAICompatibleProvider(createDefaultSettings("zh-CN"));
    const request = { node, model: profile.model, profile, includeParentContext: false };
    expect(await provider.chat(request)).toBe("answer");
    let answer = "";
    for await (const chunk of provider.streamChat(request)) answer += chunk;
    expect(answer).toBe("answer");
    expect(await provider.titleNode(node, undefined, profile)).toBe("answer");
    expect(await provider.summarizeNode(node, undefined, profile)).toBe("answer");
    expect(streamCodex).toHaveBeenCalledTimes(4);
    expect(requestUrl).not.toHaveBeenCalled();
    const instructions = vi.mocked(streamCodex).mock.calls.at(-1)?.[0];
    expect(instructions?.some((message) => message.content.includes("只返回总结本身"))).toBe(true);
  });

  it("routes model discovery and account tests without spending a generation", async () => {
    const provider = new OpenAICompatibleProvider(createDefaultSettings("en"));
    expect(await provider.listModels(profile)).toEqual(["available"]);
    expect((await provider.testConnection(profile)).ok).toBe(true);
    expect(listCodexModels).toHaveBeenCalledWith(profile);
    expect(testCodexConnection).toHaveBeenCalledWith(profile, undefined);
    expect(streamCodex).not.toHaveBeenCalled();
    expect(requestUrl).not.toHaveBeenCalled();
  });
});
