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
  snapToGuides: true,
  autoSummarizeNodes: false,
  includeParentContext: true,
  includeFullContext: false,
  streamResponses: true,
  onboardingCardDismissed: false,
};

function createViewState(
  initialMap: ChatMap,
  settingsOverride: Partial<BranchChatMapSettings> = {},
  written: Array<{ path: string; content: string }> = [],
): ViewState {
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
    writeExport: async (_folder: string, path: string, content = "") => {
      written.push({ path, content });
      return path;
    },
  };

  return new ViewState(plugin, repository as never, initialMap);
}

describe("ViewState", () => {
  it("keeps a selected-text branch title after the assistant answers", async () => {
    const map = createRootMap("Topic", "Topic");
    const vs = createViewState(map, { streamResponses: false });
    const answer = vi.spyOn(OpenAICompatibleProvider.prototype, "chat").mockResolvedValue("The explanation");
    const title = vi.spyOn(OpenAICompatibleProvider.prototype, "titleNode").mockResolvedValue("AI answer title");
    try {
      vs.createChild("量子纠缠");
      const childId = vs.getSnapshot().activeNodeId!;
      expect(vs.getSnapshot().map?.nodes[childId]?.title).toBe("量子纠缠");
      vs.updateDraft(childId, "请解释量子纠缠");
      await vs.sendMessage();
      expect(vs.getSnapshot().map?.nodes[childId]?.title).toBe("量子纠缠");
      expect(vs.getSnapshot().map?.nodes[childId]?.messages.at(-1)?.content).toBe("The explanation");
      expect(title).not.toHaveBeenCalled();
    } finally {
      answer.mockRestore();
      title.mockRestore();
      vs.dispose();
    }
  });

  it("keeps next-question options with their node and clears them on deletion or map change", async () => {
    const root = createRootMap("Options", "Options");
    const { map, child } = addChildNode(root, root.rootNodeId, { title: "Child" });
    const vs = createViewState(map);
    vs.updateSendOptions(child.id, { contextMode: "ancestors", profileId: "model-a" });
    vs.setActiveNode(root.rootNodeId);
    expect(vs.getSnapshot().sendOptions[child.id]?.contextMode).toBe("ancestors");
    expect(vs.getSnapshot().sendOptions[root.rootNodeId]).toBeUndefined();
    vs.deleteNode(child.id);
    expect(vs.getSnapshot().sendOptions[child.id]).toBeUndefined();
    vs.updateSendOptions(root.rootNodeId, { contextMode: "whole" });
    await vs.createNewRootMap();
    expect(vs.getSnapshot().sendOptions).toEqual({});
  });

  it("preserves new branches, notes, and status while streaming and generating metadata", async () => {
    let finishStream!: () => void;
    let streamReady!: () => void;
    let finishTitle!: (title: string) => void;
    let titleReady!: () => void;
    const streamPaused = new Promise<void>((resolve) => { finishStream = resolve; });
    const firstChunk = new Promise<void>((resolve) => { streamReady = resolve; });
    const titlePaused = new Promise<string>((resolve) => { finishTitle = resolve; });
    const titleStarted = new Promise<void>((resolve) => { titleReady = resolve; });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "部分回答";
      streamReady();
      await streamPaused;
      yield "，完成";
    });
    const title = vi.spyOn(OpenAICompatibleProvider.prototype, "titleNode").mockImplementation(() => {
      titleReady();
      return titlePaused;
    });

    try {
      const map = createRootMap();
      const vs = createViewState(map);
      vs.updateDraft(map.rootNodeId, "Explain branching");
      const sending = vs.sendMessage();
      await firstChunk;
      const sourceMessageId = vs.getSnapshot().streamingMessages[map.rootNodeId]!.id;
      vs.createChild("部分回答", { messageId: sourceMessageId, start: 0, end: 4 });
      const childId = vs.getSnapshot().activeNodeId!;
      vs.updateNodeNote(map.rootNodeId, "流式期间的理解");
      vs.updateCurrentNodeStatus("understood");
      finishStream();
      await titleStarted;
      vs.updateNodeNote(map.rootNodeId, "等待标题期间的新理解");
      finishTitle("分支探索");
      await sending;

      const snapshot = vs.getSnapshot();
      expect(snapshot.map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("部分回答，完成");
      expect(snapshot.map?.nodes[map.rootNodeId]?.note).toBe("等待标题期间的新理解");
      expect(snapshot.map?.nodes[map.rootNodeId]?.children).toContain(childId);
      expect(snapshot.map?.nodes[childId]?.status).toBe("understood");
      expect(snapshot.map?.nodes[childId]?.sourceMessageId).toBe(sourceMessageId);
      expect(snapshot.map?.nodes[childId]?.sourceTextRange).toEqual({ start: 0, end: 4 });
      expect(snapshot.map?.nodes[map.rootNodeId]?.messages.at(-1)?.id).toBe(sourceMessageId);
      expect(snapshot.map?.edges.some((edge) => edge.from === map.rootNodeId && edge.to === childId)).toBe(true);
      expect(snapshot.map?.title).toBe("分支探索");
      expect(snapshot.activeNodeId).toBe(childId);
    } finally {
      finishStream();
      finishTitle("分支探索");
      stream.mockRestore();
      title.mockRestore();
    }
  });

  it.each(["delete-node", "switch-map"])("does not restore stale streaming results after %s", async (action) => {
    let finishStream!: () => void;
    let streamReady!: () => void;
    const paused = new Promise<void>((resolve) => { finishStream = resolve; });
    const ready = new Promise<void>((resolve) => { streamReady = resolve; });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "部分回答";
      streamReady();
      await paused;
      yield "，完成";
    });
    try {
      const map = createRootMap("Existing", "Existing");
      const { map: withChild, child } = addChildNode(map, map.rootNodeId, { title: "Child" });
      const vs = createViewState(withChild);
      vs.setActiveNode(child.id);
      vs.updateDraft(child.id, "Explain branching");
      const sending = vs.sendMessage();
      await ready;
      if (action === "delete-node") vs.deleteNode(child.id);
      else await vs.createNewRootMap();
      const expectedMap = vs.getSnapshot().map;
      finishStream();
      await sending;
      expect(vs.getSnapshot().map).toBe(expectedMap);
      expect(vs.getSnapshot().map?.nodes[child.id]).toBeUndefined();
      expect(vs.getSnapshot().error).toBeNull();
      expect(vs.getSnapshot().streamingMessages).toEqual({});
    } finally {
      finishStream();
      stream.mockRestore();
    }
  });

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
      vs.createChild("部分回答");
      const childId = vs.getSnapshot().activeNodeId!;
      vs.updateNodeNote(map.rootNodeId, "停止前写下的理解");
      vs.cancelGeneration();
      await vi.advanceTimersByTimeAsync(32);
      expect(vs.getSnapshot().streamingMessages[map.rootNodeId]?.content).toBe("");
      stopStream();
      await sending;
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("部分回答");
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1)?.id).toBe(messageId);
      expect(vs.getSnapshot().map?.nodes[childId]).toBeDefined();
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.note).toBe("停止前写下的理解");
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
    expect(child?.sourceMessageId).toBeUndefined();
    expect(child?.sourceTextRange).toBeUndefined();
    expect(snapshot.activeNodeId ? snapshot.drafts[snapshot.activeNodeId]?.length : 0).toBeLessThan(anchor.length);
  });

  it("records valid assistant sources only from the current parent", () => {
    const rootMap = createRootMap("Selection sources");
    const assistant = createMessage("assistant", "🧠 **注意力**与注意力");
    const user = createMessage("user", "什么是注意力？");
    const foreignAssistant = createMessage("assistant", "另一个节点的注意力");
    const withMessages = appendMessage(appendMessage(rootMap, rootMap.rootNodeId, user), rootMap.rootNodeId, assistant);
    const other = addChildNode(withMessages, rootMap.rootNodeId);
    const map = appendMessage(other.map, other.child.id, foreignAssistant);

    for (const [source, accepted] of [
      [{ messageId: assistant.id, start: 7, end: 10 }, true],
      [{ messageId: user.id, start: 0, end: 3 }, false],
      [{ messageId: foreignAssistant.id, start: 0, end: 3 }, false],
      [{ messageId: "missing", start: 0, end: 3 }, false],
      [{ messageId: assistant.id, start: 0, end: Infinity }, false],
      [{ messageId: assistant.id, start: 3, end: 3 }, false],
    ] as const) {
      const vs = createViewState(map);
      vs.createChild("注意力", source);
      const child = vs.getActiveNode();
      expect(child?.anchorText).toBe("注意力");
      expect(child?.sourceMessageId).toBe(accepted ? assistant.id : undefined);
      expect(child?.sourceTextRange).toEqual(accepted ? { start: 7, end: 10 } : undefined);
    }
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

  it("lets a user edit an AI summary without turning it into a separate note", () => {
    const map = createRootMap("Summary", "Summary root");
    const withSummary = updateNode(map, map.rootNodeId, { summary: "AI draft" });
    const vs = createViewState(withSummary);

    vs.updateNodeSummary(map.rootNodeId, "My revised summary");
    expect(vs.getSnapshot().map?.nodes[map.rootNodeId]).toMatchObject({
      summary: "My revised summary",
      summaryEditedByUser: true,
    });
    expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.note).toBeUndefined();
  });

  it("does not replace a user-edited summary during automatic summarization", async () => {
    const map = createRootMap("Summary protection", "Named root");
    const vs = createViewState(map, { autoSummarizeNodes: true });
    vs.updateNodeSummary(map.rootNodeId, "User conclusion");
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "Assistant answer";
    });
    const summarize = vi.spyOn(OpenAICompatibleProvider.prototype, "summarizeNode").mockResolvedValue("New AI summary");
    try {
      vs.updateDraft(map.rootNodeId, "Question");
      await vs.sendMessage();
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.summary).toBe("User conclusion");
      expect(vs.getSnapshot().map?.nodes[map.rootNodeId]?.summaryEditedByUser).toBe(true);
    } finally {
      stream.mockRestore();
      summarize.mockRestore();
    }
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

  it("writes one self-contained file for the markdown and mermaid formats", async () => {
    const map = createRootMap("Export", "Root question");
    const written: Array<{ path: string; content: string }> = [];
    const vs = createViewState(map, {}, written);

    await vs.exportMapAs("markdown");
    expect(written).toHaveLength(1);
    expect(written[0]?.path.endsWith(".md")).toBe(true);
    expect(written[0]?.content).toContain("## 目录");
    // Standalone files link to headings in the same note, never to package files.
    expect(written[0]?.content).toContain("[[#Root question]]");
    expect(written[0]?.content).not.toContain("../index.md");
    expect(written[0]?.content).not.toContain("../map.canvas");

    written.length = 0;
    await vs.exportMapAs("mermaid");
    expect(written).toHaveLength(1);
    expect(written[0]?.path.endsWith("-mermaid.md")).toBe(true);
    expect(written[0]?.content.startsWith("mindmap")).toBe(true);
  });

  it("keeps the composer's model, context, and thinking choices together", () => {
    const map = createRootMap("Composer", "Composer root");
    const vs = createViewState(map);
    const nodeId = map.rootNodeId;

    vs.updateSendOptions(nodeId, { contextMode: "ancestors" });
    vs.updateSendOptions(nodeId, { thinking: false });
    expect(vs.getSnapshot().sendOptions[nodeId]).toEqual({ contextMode: "ancestors", thinking: false });

    vs.updateNodeDefaultProfile(nodeId, "profile-2");
    expect(vs.getSnapshot().map?.nodes[nodeId]?.defaultModelProfileId).toBe("profile-2");

    // Clearing a one-off model override must not drop the neighbouring choices.
    vs.updateSendOptions(nodeId, { profileId: undefined });
    expect(vs.getSnapshot().sendOptions[nodeId]?.thinking).toBe(false);
    expect(vs.getSnapshot().sendOptions[nodeId]?.contextMode).toBe("ancestors");
  });

  it("stores streamed reasoning alongside the answer", async () => {
    const map = createRootMap("Reasoning", "Named root");
    const vs = createViewState(map);
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* (request) {
      request.onReasoning?.("先想一下");
      yield "回答";
    });
    try {
      vs.updateDraft(map.rootNodeId, "Question");
      await vs.sendMessage();

      const message = vs.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1);
      expect(message?.content).toBe("回答");
      expect(message?.reasoning).toBe("先想一下");
      expect(vs.getSnapshot().streamingMessages).toEqual({});
    } finally {
      stream.mockRestore();
    }
  });

  it("keeps the completed answer when automatic summarization fails", async () => {
    const map = createRootMap("Summary failure", "Named root");
    const vs = createViewState(map, { autoSummarizeNodes: true });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "Assistant answer";
    });
    const summarize = vi.spyOn(OpenAICompatibleProvider.prototype, "summarizeNode")
      .mockRejectedValue(new Error("context_length_exceeded"));
    try {
      vs.updateDraft(map.rootNodeId, "Question");
      await vs.sendMessage();

      const snapshot = vs.getSnapshot();
      expect(snapshot.map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("Assistant answer");
      expect(snapshot.map?.nodes[map.rootNodeId]?.summary).toBeUndefined();
      expect(snapshot.generationJobs[map.rootNodeId]).toBeUndefined();
      expect(snapshot.error).toBeNull();
    } finally {
      stream.mockRestore();
      summarize.mockRestore();
    }
  });

  it("drops a late summary and skips naming after the run is cancelled", async () => {
    let releaseSummary!: (summary: string) => void;
    let summaryStarted!: () => void;
    const summaryPaused = new Promise<string>((resolve) => { releaseSummary = resolve; });
    const summaryReady = new Promise<void>((resolve) => { summaryStarted = resolve; });
    const map = createRootMap();
    const vs = createViewState(map, { autoSummarizeNodes: true });
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "Assistant answer";
    });
    const summarize = vi.spyOn(OpenAICompatibleProvider.prototype, "summarizeNode").mockImplementation(() => {
      summaryStarted();
      return summaryPaused;
    });
    const title = vi.spyOn(OpenAICompatibleProvider.prototype, "titleNode").mockResolvedValue("Late title");
    try {
      vs.updateDraft(map.rootNodeId, "Question");
      const sending = vs.sendMessage();
      await summaryReady;
      vs.cancelGeneration();
      releaseSummary("Late summary");
      await sending;

      const snapshot = vs.getSnapshot();
      expect(snapshot.map?.nodes[map.rootNodeId]?.messages.at(-1)?.content).toBe("Assistant answer");
      expect(snapshot.map?.nodes[map.rootNodeId]?.summary).toBeUndefined();
      expect(title).not.toHaveBeenCalled();
      expect(snapshot.streamingMessages).toEqual({});
    } finally {
      releaseSummary("Late summary");
      stream.mockRestore();
      summarize.mockRestore();
      title.mockRestore();
    }
  });
});
