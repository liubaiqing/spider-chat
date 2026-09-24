import { describe, expect, it, vi } from "vitest";
import { OpenAICompatibleProvider } from "../src/ai/openAICompatibleProvider";
import { addChildNode, createRootMap, updateNode } from "../src/domain/chatMap";
import { MapDocumentRegistry } from "../src/state/mapDocument";
import { ViewState } from "../src/state/viewState";
import type BranchChatMapPlugin from "../src/main";
import type { BranchChatMapSettings, ChatMap, ModelProfile } from "../src/types";

const baseSettings: BranchChatMapSettings = {
  language: "en",
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
  maxConcurrentGenerations: 3,
};

function deferred<T = void>(): { promise: Promise<T>; resolve: (value?: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve: (value?: T) => resolve(value as T) };
}

type Deferred = ReturnType<typeof deferred<void>>;

function cloneMap(map: ChatMap): ChatMap {
  return JSON.parse(JSON.stringify(map)) as ChatMap;
}

function memoryRepository(initial: ChatMap[] = []) {
  const maps = new Map(initial.map((map) => [map.id, cloneMap(map)]));
  const saves: ChatMap[] = [];
  const repository = {
    saveMap: vi.fn(async (map: ChatMap) => {
      saves.push(cloneMap(map));
      maps.set(map.id, cloneMap(map));
    }),
    listMaps: async () => [...maps.values()].map(cloneMap),
    loadMap: async (id: string) => {
      const map = maps.get(id);
      return map ? cloneMap(map) : null;
    },
    loadLatestMap: async () => {
      const latest = [...maps.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      return latest ? cloneMap(latest) : null;
    },
    deleteMap: async (id: string) => maps.delete(id),
    writeExport: async (_folder: string, path: string) => path,
  };
  return { maps, saves, repository: repository as never };
}

function createPlugin(settings: Partial<BranchChatMapSettings> = {}): BranchChatMapPlugin {
  return {
    settings: { ...baseSettings, ...settings },
    saveSettings: async () => {},
  } as BranchChatMapPlugin;
}

describe("shared map state and generation scheduling", () => {
  it("shares one map document across views and persists revisions in order", async () => {
    const map = createRootMap("Shared map", "Shared map");
    const firstWriteStarted = deferred();
    const releaseFirstWrite = deferred();
    const durable = new Map<string, ChatMap>();
    const writeStarts: ChatMap[] = [];
    const repository = {
      saveMap: vi.fn(async (snapshot: ChatMap) => {
        writeStarts.push(cloneMap(snapshot));
        if (writeStarts.length === 1) {
          firstWriteStarted.resolve();
          await releaseFirstWrite.promise;
        }
        durable.set(snapshot.id, cloneMap(snapshot));
      }),
      listMaps: async () => [...durable.values()],
      loadMap: async (id: string) => durable.get(id) ?? null,
      loadLatestMap: async () => [...durable.values()][0] ?? null,
      deleteMap: async (id: string) => durable.delete(id),
      writeExport: async (_folder: string, path: string) => path,
    } as never;
    const documents = new MapDocumentRegistry(repository);
    const firstView = new ViewState(createPlugin(), repository, map, documents);
    const secondView = new ViewState(createPlugin(), repository, map, documents);
    const document = documents.get(map);

    try {
      firstView.updateNodeNote(map.rootNodeId, "first view edit");
      await firstWriteStarted.promise;
      secondView.markUnderstood();
      expect(firstView.getSnapshot().map?.nodes[map.rootNodeId]?.status).toBe("understood");
      expect(secondView.getSnapshot().map?.nodes[map.rootNodeId]?.note).toBe("first view edit");

      releaseFirstWrite.resolve();
      await document.flushWrites();

      expect(writeStarts).toHaveLength(2);
      expect(writeStarts[0]?.nodes[map.rootNodeId]?.status).toBe("open");
      expect(writeStarts[1]?.nodes[map.rootNodeId]?.status).toBe("understood");
      expect(durable.get(map.id)?.nodes[map.rootNodeId]?.note).toBe("first view edit");
      expect(durable.get(map.id)?.nodes[map.rootNodeId]?.status).toBe("understood");
    } finally {
      releaseFirstWrite.resolve();
      firstView.dispose();
      secondView.dispose();
      documents.dispose();
    }
  });

  it("applies the concurrency limit across different maps", async () => {
    const repository = memoryRepository();
    const documents = new MapDocumentRegistry(repository.repository);
    const views: ViewState[] = [];
    const childIds: string[] = [];
    const started: string[] = [];
    const gates = new Map<string, Deferred>();
    const firstTwoStarted = deferred();
    const thirdStarted = deferred();
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* (request) {
      const nodeId = request.node.id;
      started.push(nodeId);
      if (started.length === 2) firstTwoStarted.resolve();
      if (started.length === 3) thirdStarted.resolve();
      await gates.get(nodeId)!.promise;
      yield "answer";
    });

    try {
      for (let index = 0; index < 3; index += 1) {
        const root = createRootMap(`Map ${index}`, `Map ${index}`);
        const { map, child } = addChildNode(root, root.rootNodeId, { title: `Branch ${index}` });
        const view = new ViewState(createPlugin({ maxConcurrentGenerations: 2 }), repository.repository, map, documents);
        view.setActiveNode(child.id);
        view.updateDraft(child.id, `Prompt ${index}`);
        views.push(view);
        childIds.push(child.id);
        gates.set(child.id, deferred());
      }

      const sends = views.map((view) => view.sendMessage());
      await firstTwoStarted.promise;
      expect(started).toHaveLength(2);
      await vi.waitFor(() => {
        const queuedCount = views.reduce((count, view) => count + view.getSnapshot().generationQueue.length, 0);
        expect(queuedCount).toBe(1);
      });

      gates.get(started[0]!)!.resolve();
      await thirdStarted.promise;
      expect(started).toHaveLength(3);
      expect(started).toContain(childIds.find((id) => !started.slice(0, 2).includes(id)));

      for (const gate of gates.values()) gate.resolve();
      await Promise.all(sends);
    } finally {
      for (const gate of gates.values()) gate.resolve();
      stream.mockRestore();
      for (const view of views) view.dispose();
      documents.dispose();
    }
  });

  it("queues five node requests, survives interleaved completion, and retries one failure without duplicating its prompt", async () => {
    const map = createRootMap("Five branch fan-out", "Five branch fan-out");
    const repository = memoryRepository([map]);
    const view = new ViewState(createPlugin({ maxConcurrentGenerations: 2 }), repository.repository, map);
    const started: string[] = [];
    const attempts = new Map<string, number>();
    const gates = new Map<string, Deferred>();
    const startWaiters = Array.from({ length: 6 }, () => deferred());
    let failedNodeId = "";
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* (request) {
      const nodeId = request.node.id;
      const attempt = (attempts.get(nodeId) ?? 0) + 1;
      attempts.set(nodeId, attempt);
      started.push(nodeId);
      startWaiters[started.length - 1]?.resolve();
      const gate = deferred();
      gates.set(`${nodeId}:${attempt}`, gate);
      await gate.promise;
      if (nodeId === failedNodeId && attempt === 1) throw new Error("expected branch failure");
      yield `answer:${nodeId}:attempt${attempt}`;
    });

    try {
      const directions = Array.from({ length: 5 }, (_, index) => `Direction ${index + 1}`);
      const branchIds: string[] = [];
      for (const direction of directions) {
        view.setActiveNode(map.rootNodeId);
        view.createChild();
        const id = view.getSnapshot().activeNodeId!;
        view.updateCurrentNodeTitle(direction);
        view.updateDraft(id, `Question: ${direction}`);
        branchIds.push(id);
      }
      const sends = branchIds.map((id) => view.sendMessage({}, id));
      expect(branchIds).toHaveLength(5);
      await startWaiters[1]!.promise;

      const branchByDirection = new Map(branchIds.map((id) => [view.getSnapshot().map!.nodes[id]!.title, id]));
      const failedId = started[0]!;
      failedNodeId = failedId;
      expect(started).toHaveLength(2);
      const queued = branchIds.filter((id) => !started.includes(id));
      expect(queued).toHaveLength(3);
      await vi.waitFor(() => {
        for (const id of queued) expect(view.getSnapshot().generationJobs[id]?.status).toBe("queued");
      });

      // Finish the second running branch while the first stays active. Its slot
      // admits a third branch before the first request fails.
      gates.get(`${started[1]}:1`)!.resolve();
      await startWaiters[2]!.promise;
      const secondFinishedId = started[1]!;
      expect(view.getSnapshot().map?.nodes[secondFinishedId]?.messages.at(-1)?.content)
        .toBe(`answer:${secondFinishedId}:attempt1`);

      gates.get(`${started[0]}:1`)!.resolve();
      await vi.waitFor(() => expect(view.getSnapshot().generationJobs[failedId]?.status).toBe("error"));
      await startWaiters[3]!.promise;
      gates.get(`${started[2]}:1`)!.resolve();
      await startWaiters[4]!.promise;
      gates.get(`${started[3]}:1`)!.resolve();
      gates.get(`${started[4]}:1`)!.resolve();
      await vi.waitFor(() => {
        const active = Object.values(view.getSnapshot().generationJobs).filter((job) => job.status !== "error");
        expect(active).toHaveLength(0);
      });

      const failedNode = view.getSnapshot().map!.nodes[failedId]!;
      expect(failedNode.messages.filter((message) => message.role === "user")).toHaveLength(1);
      expect(failedNode.messages.filter((message) => message.role === "assistant")).toHaveLength(0);

      const retrying = view.retryAssistant(failedId);
      await startWaiters[5]!.promise;
      gates.get(`${failedId}:2`)!.resolve();
      await retrying;
      await Promise.all(sends);

      const finalMap = view.getSnapshot().map!;
      for (const direction of directions) {
        const id = branchByDirection.get(direction)!;
        const node = finalMap.nodes[id]!;
        expect(node.messages.filter((message) => message.role === "user")).toHaveLength(1);
        const assistant = node.messages.find((message) => message.role === "assistant");
        expect(assistant?.content).toBe(`answer:${id}:attempt${id === failedId ? 2 : 1}`);
      }
      expect(finalMap.nodes[failedId]?.messages[0]?.content).toContain("Question: Direction");
      expect(view.getSnapshot().generationJobs[failedId]).toBeUndefined();
    } finally {
      for (const gate of gates.values()) gate.resolve();
      stream.mockRestore();
      view.dispose();
    }
  });

  it("saves only streamed text received before cancellation", async () => {
    const firstChunk = deferred();
    const releaseStream = deferred();
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      yield "partial answer";
      firstChunk.resolve();
      await releaseStream.promise;
      yield " late text";
    });
    const map = createRootMap("Cancel stream", "Cancel stream");
    const repository = memoryRepository([map]);
    const view = new ViewState(createPlugin(), repository.repository, map);

    try {
      view.updateDraft(map.rootNodeId, "Question");
      const sending = view.sendMessage();
      await firstChunk.promise;
      view.cancelGeneration(map.rootNodeId);
      releaseStream.resolve();
      await sending;

      const assistant = view.getSnapshot().map?.nodes[map.rootNodeId]?.messages.at(-1);
      expect(assistant?.role).toBe("assistant");
      expect(assistant?.content).toBe("partial answer");
      expect(assistant?.state).toBe("stopped");
    } finally {
      releaseStream.resolve();
      stream.mockRestore();
      view.dispose();
    }
  });

  it("never saves a non-streaming answer that arrives after cancellation", async () => {
    const requestStarted = deferred();
    const releaseRequest = deferred();
    const chat = vi.spyOn(OpenAICompatibleProvider.prototype, "chat").mockImplementation(async () => {
      requestStarted.resolve();
      await releaseRequest.promise;
      return "late non-stream response";
    });
    const map = createRootMap("Cancel non-stream", "Cancel non-stream");
    const repository = memoryRepository([map]);
    const view = new ViewState(createPlugin({ streamResponses: false }), repository.repository, map);

    try {
      view.updateDraft(map.rootNodeId, "Question");
      const sending = view.sendMessage();
      await requestStarted.promise;
      view.cancelGeneration(map.rootNodeId);
      releaseRequest.resolve();
      await sending;

      const messages = view.getSnapshot().map?.nodes[map.rootNodeId]?.messages ?? [];
      expect(messages.map((message) => message.role)).toEqual(["user"]);
      expect(messages.some((message) => message.content.includes("late non-stream"))).toBe(false);
    } finally {
      releaseRequest.resolve();
      chat.mockRestore();
      view.dispose();
    }
  });

  it("keeps a deleted map deleted after its canceled request settles and refreshes other views", async () => {
    const requestStarted = deferred();
    const releaseStream = deferred();
    const stream = vi.spyOn(OpenAICompatibleProvider.prototype, "streamChat").mockImplementation(async function* () {
      requestStarted.resolve();
      await releaseStream.promise;
      yield "too late";
    });
    const map = createRootMap("Deleted map", "Deleted map");
    const repository = memoryRepository([map]);
    const documents = new MapDocumentRegistry(repository.repository);
    const firstView = new ViewState(createPlugin(), repository.repository, map, documents);
    const secondView = new ViewState(createPlugin(), repository.repository, map, documents);

    try {
      firstView.updateDraft(map.rootNodeId, "Question");
      const sending = firstView.sendMessage();
      await requestStarted.promise;
      const deleted = await firstView.deleteCurrentMap();
      expect(deleted).toBe(true);
      expect(repository.maps.has(map.id)).toBe(false);
      const replacementId = firstView.getSnapshot().map?.id;
      expect(replacementId).toBeTruthy();

      const oldMapSaveCount = repository.saves.filter((saved) => saved.id === map.id).length;
      releaseStream.resolve();
      await sending;
      await vi.waitFor(() => expect(secondView.getSnapshot().map?.id).toBe(replacementId));

      expect(repository.maps.has(map.id)).toBe(false);
      expect(repository.saves.filter((saved) => saved.id === map.id)).toHaveLength(oldMapSaveCount);
      expect(secondView.getSnapshot().error).toBeNull();
    } finally {
      releaseStream.resolve();
      stream.mockRestore();
      firstView.dispose();
      secondView.dispose();
      documents.dispose();
    }
  });

  it("ignores an older map load that resolves after a newer selection", async () => {
    const olderMap = createRootMap("Older", "Older");
    const newerMap = createRootMap("Newer", "Newer");
    const olderLoad = deferred<ChatMap | null>();
    const newerLoad = deferred<ChatMap | null>();
    const repository = {
      saveMap: async () => {},
      listMaps: async () => [],
      loadMap: (id: string) => id === olderMap.id ? olderLoad.promise : newerLoad.promise,
      loadLatestMap: async () => null,
      deleteMap: async () => false,
      writeExport: async (_folder: string, path: string) => path,
    } as never;
    const view = new ViewState(createPlugin(), repository);

    try {
      const loadingOlder = view.load(olderMap.id);
      const loadingNewer = view.load(newerMap.id);
      newerLoad.resolve(newerMap);
      await loadingNewer;
      olderLoad.resolve(olderMap);
      await loadingOlder;
      expect(view.getSnapshot().map?.id).toBe(newerMap.id);
    } finally {
      view.dispose();
    }
  });

  it("uses a send-only profile override without changing the node default inherited by children", async () => {
    const defaultProfile: ModelProfile = {
      id: "default-profile", alias: "Default", model: "default-model", baseUrl: "https://default.test/v1", apiKey: "default-key",
    };
    const alternateProfile: ModelProfile = {
      id: "alternate-profile", alias: "Alternate", model: "alternate-model", baseUrl: "https://alternate.test/v1", apiKey: "alternate-key",
    };
    const chat = vi.spyOn(OpenAICompatibleProvider.prototype, "chat").mockResolvedValue("answer");
    const title = vi.spyOn(OpenAICompatibleProvider.prototype, "titleNode").mockResolvedValue("Map title");
    let map = createRootMap("Profile inheritance");
    map = updateNode(map, map.rootNodeId, { defaultModelProfileId: defaultProfile.id });
    const repository = memoryRepository([map]);
    const view = new ViewState(createPlugin({
      models: [defaultProfile, alternateProfile],
      defaultModelProfileId: defaultProfile.id,
      streamResponses: false,
    }), repository.repository, map);

    try {
      view.updateDraft(map.rootNodeId, "Question");
      await view.sendMessage({ profileId: alternateProfile.id });
      const root = view.getSnapshot().map!.nodes[map.rootNodeId]!;
      expect(root.defaultModelProfileId).toBe(defaultProfile.id);
      expect(root.messages.at(-1)?.modelSnapshot?.profileId).toBe(alternateProfile.id);

      view.createChild();
      expect(view.getActiveNode()?.defaultModelProfileId).toBe(defaultProfile.id);
    } finally {
      chat.mockRestore();
      title.mockRestore();
      view.dispose();
    }
  });
});
