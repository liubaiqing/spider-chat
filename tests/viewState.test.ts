import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/ai/openAICompatibleProvider";
import { appendMessage, createMessage, createRootMap, addChildNode, updateNode } from "../src/domain/chatMap";
import { ViewState } from "../src/state/viewState";
import type BranchChatMapPlugin from "../src/main";
import type { BranchChatMapSettings, ChatMap } from "../src/types";

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

function createViewState(initialMap: ChatMap, settingsOverride: Partial<BranchChatMapSettings> = {}): ViewState {
  const plugin = {
    settings: { ...settings, ...settingsOverride },
    saveSettings: async () => {},
  } as BranchChatMapPlugin;

  const repository = {
    saveMap: async () => {},
    listMaps: async () => [],
    deleteMap: async () => true,
    loadMap: async () => null,
    loadLatestMap: async () => null,
    writeExport: async (_folder: string, path: string) => path,
  };

  return new ViewState(plugin, repository as never, initialMap);
}

describe("ViewState", () => {
  it("batches streaming bursts and preserves the final tokens without delayed updates", async () => {
    vi.useFakeTimers();
    let finishStream!: () => void;
    let burstReady!: () => void;
    const paused = new Promise<void>((resolve) => { finishStream = resolve; });
    const ready = new Promise<void>((resolve) => { burstReady = resolve; });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "你";
      yield "好";
      yield "，";
      burstReady();
      await paused;
      yield "世界";
    });

    try {
      const map = createRootMap("Streaming", "Streaming");
      const vs = createViewState(map);
      vs.updateDraft(map.rootNodeId, "Explain streaming");
      const updates: string[] = [];
      vs.subscribe(() => {
        const content = vs.getSnapshot().streamingMessages[map.rootNodeId]?.content;
        if (content) updates.push(content);
      });
      const sending = vs.sendMessage();
      await ready;
      const messageId = vs.getSnapshot().streamingMessages[map.rootNodeId]?.id;
      expect(messageId).toBeTruthy();
      expect(updates).toEqual([]);

      await vi.advanceTimersByTimeAsync(32);
      expect(updates).toEqual(["你好，"]);

      finishStream();
      await sending;
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("你好，世界");
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.id).toBe(messageId);
      expect(vs.getSnapshot().streamingMessages).toEqual({});
      expect(vs.getSnapshot().pendingNodeId).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      const updateCount = updates.length;
      await vi.runAllTimersAsync();
      expect(updates).toHaveLength(updateCount);
    } finally {
      finishStream();
      stream.mockRestore();
      vi.useRealTimers();
    }
  });

  it("cancels a pending stream update while retaining the partial answer", async () => {
    vi.useFakeTimers();
    let stopStream!: () => void;
    let chunkReady!: () => void;
    const paused = new Promise<void>((resolve) => { stopStream = resolve; });
    const ready = new Promise<void>((resolve) => { chunkReady = resolve; });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "部分回答";
      chunkReady();
      await paused;
      throw new DOMException("Aborted", "AbortError");
    });

    try {
      const map = createRootMap("Cancel streaming", "Cancel streaming");
      const vs = createViewState(map);
      vs.updateDraft(map.rootNodeId, "Explain streaming");
      const sending = vs.sendMessage();
      await ready;
      const messageId = vs.getSnapshot().streamingMessages[map.rootNodeId]?.id;
      vs.cancelGeneration();
      await vi.advanceTimersByTimeAsync(32);
      expect(vs.getSnapshot().streamingMessages[map.rootNodeId]?.content).toBe("");
      stopStream();
      await sending;
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("部分回答");
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.id).toBe(messageId);
      expect(vs.getSnapshot().streamingMessages).toEqual({});
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      stopStream();
      stream.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps full anchor text but truncates the child draft prompt", () => {
    const map = createRootMap("Long anchor");
    const vs = createViewState(map);
    const anchor = "自注意力机制".repeat(30);

    vs.createChild(anchor);

    const snapshot = vs.getSnapshot();
    const child = snapshot.activeNodeId ? snapshot.map?.nodes[snapshot.activeNodeId] : undefined;
    expect(child?.anchorText).toBe(anchor);
    expect(snapshot.activeNodeId ? snapshot.drafts[snapshot.activeNodeId]?.length : 0).toBeLessThan(anchor.length);
  });

  it("counts node subtrees including the selected node", () => {
    const rootMap = createRootMap("Tree");
    const first = addChildNode(rootMap, rootMap.rootNodeId);
    const second = addChildNode(first.map, first.child.id);
    const vs = createViewState(second.map);

    expect(vs.countNodeSubtree(first.child.id)).toBe(2);
    expect(vs.countNodeSubtree(second.child.id)).toBe(1);
  });

  it("searches titles, summaries, anchors, and messages", () => {
    const rootMap = createRootMap("Transformer map", "Transformer root");
    const child = addChildNode(rootMap, rootMap.rootNodeId, { anchorText: "embedding" });
    const withMessage = appendMessage(child.map, child.child.id, createMessage("user", "What is vector search?"));
    const finalMap = updateNode(withMessage, child.child.id, { summary: "Vector search summary" });
    const vs = createViewState(finalMap);

    expect(vs.searchNodes("transformer").map((result) => result.node.id)).toContain(rootMap.rootNodeId);
    expect(vs.searchNodes("embedding").map((result) => result.node.id)).toContain(child.child.id);
    expect(vs.searchNodes("vector").map((result) => result.node.id)).toContain(child.child.id);
    expect(vs.searchNodes("")).toEqual([]);
  });

  it("stores and searches a personal node note without touching the AI summary", () => {
    const stableMap = createRootMap("Notes");
    const vs = createViewState(stableMap);

    vs.updateNodeNote(stableMap.rootNodeId, "这是我自己的研究判断");

    const node = vs.getSnapshot().map?.nodes[stableMap.rootNodeId];
    expect(node?.note).toBe("这是我自己的研究判断");
    expect(node?.summary).toBeUndefined();
    expect(vs.searchNodes("研究判断").map((result) => result.node.id)).toContain(stableMap.rootNodeId);

    vs.updateNodeNote(stableMap.rootNodeId, "   ");
    expect(vs.getSnapshot().map?.nodes[stableMap.rootNodeId]?.note).toBeUndefined();
  });

  it("preserves the draft when AI configuration is incomplete", async () => {
    const map = createRootMap("Missing configuration");
    const vs = createViewState(map, { language: "en", apiKey: "" });
    vs.updateDraft(map.rootNodeId, "Explain retrieval augmented generation");

    await vs.sendMessage();

    const snapshot = vs.getSnapshot();
    expect(snapshot.map?.nodes[map.rootNodeId]?.messages).toHaveLength(0);
    expect(snapshot.drafts[map.rootNodeId]).toBe("Explain retrieval augmented generation");
    expect(snapshot.error).toBe("Missing API key. Add one in Spider settings.");
  });
});
