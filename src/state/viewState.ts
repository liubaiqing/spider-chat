import { Notice } from "obsidian";
import type BranchChatMapPlugin from "../main";
import { OpenAICompatibleProvider } from "../ai/openAICompatibleProvider";
import { buildContextMessages } from "../ai/contextBuilder";
import { createRootMap, addChildNode, appendMessage, createMessage, getAncestorPath, updateMapTitle, updateNode } from "../domain/chatMap";
import { applyDagreLayout } from "../domain/layout";
import { isSourceTextRange } from "../domain/guards";
import { buildExportFiles, exportMarkdown, exportMermaidMindmap } from "../export/exporters";
import { writeInteractiveHtmlExport } from "../storage/interactiveHtmlExport";
import { t } from "../i18n";
import { MapRepository } from "../storage/mapRepository";
import { MapDocumentRegistry, type GenerationJob, type MapDocument } from "./mapDocument";
import type { BranchSource, BranchChatMapSettings, ChatMap, ChatMapId, ChatMessage, ChatNode, ChatNodeStatus, ContextMode, ExportFormat, ModelProfile, NodeId } from "../types";
import { cleanText, slugifyFileName, truncateText } from "../utils/text";

export interface BranchChatMapState {
  map: ChatMap | null;
  activeNodeId: NodeId | null;
  collapsedIds: Set<NodeId>;
  drafts: Record<NodeId, string>;
  sendOptions: Record<NodeId, NodeSendOptions>;
  pendingNodeId: NodeId | null;
  streamingMessages: Record<NodeId, ChatMessage>;
  generationJobs: Record<NodeId, GenerationJob>;
  generationQueue: NodeId[];
  error: string | null;
  errorDetails: string | null;
  hasManualPositions: boolean;
}

export interface NodeSendOptions {
  profileId?: string;
  contextMode?: ContextMode;
  /** Deep-thinking switch for this node. Undefined leaves the endpoint default. */
  thinking?: boolean;
}

const INITIAL_STATE: BranchChatMapState = {
  map: null,
  activeNodeId: null,
  collapsedIds: new Set(),
  drafts: {},
  sendOptions: {},
  pendingNodeId: null,
  streamingMessages: {},
  generationJobs: {},
  generationQueue: [],
  error: null,
  errorDetails: null,
  hasManualPositions: false,
};

export interface NodeSearchResult {
  node: ChatNode;
  path: ChatNode[];
  excerpt: string;
}

export class ViewState {
  private readonly plugin: BranchChatMapPlugin;
  private readonly repository: MapRepository;
  private readonly documents: MapDocumentRegistry;
  private readonly listeners = new Set<() => void>();
  private state: BranchChatMapState = INITIAL_STATE;
  private document: MapDocument | null = null;
  private unsubscribeDocument: (() => void) | null = null;
  private unsubscribeForgotten: (() => void) | null = null;
  private readonly auxiliaryControllers = new Set<AbortController>();
  private loadEpoch = 0;
  private disposed = false;
  private loadedMapId: ChatMapId | null = null;

  constructor(plugin: BranchChatMapPlugin, repository: MapRepository, initialMap?: ChatMap, documents?: MapDocumentRegistry) {
    this.plugin = plugin;
    this.repository = repository;
    this.documents = documents ?? new MapDocumentRegistry(repository);
    this.unsubscribeForgotten = this.documents.subscribeForgotten((mapId) => this.handleForgottenMap(mapId));
    if (initialMap) {
      this.attachMap(initialMap, true);
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): BranchChatMapState => this.state;

  getLoadedMapId(): ChatMapId | null {
    return this.loadedMapId;
  }

  async load(mapId?: ChatMapId): Promise<void> {
    const epoch = ++this.loadEpoch;
    if (mapId) return this.loadById(mapId, epoch);
    return this.loadLatest(epoch);
  }

  async createNewRootMap(): Promise<ChatMap> {
    const language = this.plugin.settings.language;
    const map = applyDagreLayout(createRootMap(t(language, "defaultMapTitle"), t(language, "rootQuestionTitle")));
    await this.repository.saveMap(map);
    this.attachMap(map, true);
    return map;
  }

  setActiveNode(nodeId: NodeId): void {
    if (!this.state.map?.nodes[nodeId]) {
      return;
    }

    this.setState({ activeNodeId: nodeId });
  }

  createChild(anchorText?: string, source?: BranchSource): void {
    const { map, activeNodeId } = this.state;
    if (!map || !activeNodeId || !this.document) {
      return;
    }

    const selectedText = anchorText?.trim();
    const streamingMessage = this.state.pendingNodeId === activeNodeId ? this.state.streamingMessages[activeNodeId] : undefined;
    const validSource = isSourceTextRange(source) && (
      map.nodes[activeNodeId]?.messages.some((message) => message.id === source.messageId && message.role === "assistant")
      || (streamingMessage?.id === source.messageId && streamingMessage.role === "assistant")
    ) ? source : undefined;
    const language = this.plugin.settings.language;
    let child: ChatNode | null = null;
    this.commitMap((currentMap) => {
      if (!currentMap.nodes[activeNodeId]) return currentMap;
      const result = addChildNode(currentMap, activeNodeId, {
        anchorText: selectedText || undefined,
        title: selectedText ? undefined : t(language, "untitledQuestionTitle"),
        source: validSource,
      });
      child = result.child;
      return result.map;
    });
    const createdChild = child as ChatNode | null;
    if (!createdChild) return;
    this.setState({
      activeNodeId: createdChild.id,
      drafts: selectedText
        ? {
            ...this.state.drafts,
            [createdChild.id]: language === "zh-CN"
              ? `请解释这段内容：${truncateText(selectedText, 120)}`
              : `Please explain this: ${truncateText(selectedText, 120)}`,
          }
        : this.state.drafts,
    });
  }

  goToParent(): void {
    const activeNode = this.getActiveNode();
    if (!activeNode?.parentId) {
      return;
    }

    this.setState({
      activeNodeId: activeNode.parentId,
    });
  }

  deleteNode(nodeId: NodeId): void {
    const { map, activeNodeId } = this.state;
    if (!map || !activeNodeId || nodeId === map.rootNodeId || !this.document) {
      return;
    }

    const node = map.nodes[nodeId];
    if (!node) {
      return;
    }

    const toDelete = new Set<NodeId>();
    const collect = (id: NodeId): void => {
      toDelete.add(id);
      const n = this.document?.map.nodes[id];
      if (n) {
        for (const cid of n.children) {
          collect(cid);
        }
      }
    };
    collect(nodeId);

    for (const id of toDelete) {
      this.document.cancelGeneration(id);
      this.document.setStreamingMessage(id, null);
    }

    const nextActiveId = toDelete.has(activeNodeId) ? (node.parentId ?? map.rootNodeId) : activeNodeId;
    this.commitMap((currentMap) => {
      const currentNode = currentMap.nodes[nodeId];
      if (!currentNode || nodeId === currentMap.rootNodeId) return currentMap;
      const nextMap: ChatMap = {
        ...currentMap,
        nodes: { ...currentMap.nodes },
        edges: currentMap.edges.filter((edge) => !toDelete.has(edge.from) && !toDelete.has(edge.to)),
      };
      if (currentNode.parentId) {
        const parent = nextMap.nodes[currentNode.parentId];
        if (parent) nextMap.nodes[currentNode.parentId] = { ...parent, children: parent.children.filter((id) => id !== nodeId) };
      }
      for (const id of toDelete) delete nextMap.nodes[id];
      return nextMap;
    });
    const sendOptions = { ...this.state.sendOptions };
    for (const id of toDelete) delete sendOptions[id];
    this.setState({ activeNodeId: nextActiveId, sendOptions });
  }

  async summarizeCurrentNode(): Promise<void> {
    const { map, activeNodeId } = this.state;
    const document = this.document;
    if (!map || !activeNodeId || !document) {
      return;
    }

    const node = map.nodes[activeNodeId];
    if (!node) {
      return;
    }

    const controller = new AbortController();
    this.auxiliaryControllers.add(controller);
    this.setState({ error: null, errorDetails: null });

    try {
      const answerProfileId = [...node.messages].reverse().find((message) => message.role === "assistant")?.modelSnapshot?.profileId;
      const resolved = await this.resolveProfile(answerProfileId ?? node.defaultModelProfileId);
      if (resolved.fellBack) this.noticeProfileFallback();
      const missingConfiguration = this.getMissingProfileConfiguration(resolved.profile);
      if (missingConfiguration) throw new Error(t(this.plugin.settings.language, missingConfiguration === "apiBaseUrl"
        ? "missingApiBaseUrl"
        : missingConfiguration === "apiKey"
          ? "missingApiKey"
          : "missingModel"));
      const provider = new OpenAICompatibleProvider(this.plugin.settings);
      const summary = await provider.summarizeNode(node, controller.signal, resolved.profile);
      const currentMap = document.map;
      if (controller.signal.aborted || !document.isValid || currentMap.id !== map.id || !currentMap.nodes[activeNodeId]) return;
      document.commit((latestMap) => {
        const currentNode = latestMap.nodes[activeNodeId];
        return currentNode && currentNode.summary === node.summary && currentNode.summaryEditedByUser === node.summaryEditedByUser
          ? updateNode(latestMap, activeNodeId, { summary, summaryEditedByUser: false })
          : latestMap;
      });
    } catch (summaryError: unknown) {
      if (this.document === document) this.reportError(summaryError);
    } finally {
      this.auxiliaryControllers.delete(controller);
    }
  }

  async deleteCurrentMap(): Promise<boolean> {
    const { map } = this.state;
    if (!map || !this.document) {
      return false;
    }

    await this.documents.invalidateAndFlush(map.id);
    const removed = await this.repository.deleteMap(map.id);
    if (!removed) {
      await this.documents.forget(map.id);
      return false;
    }

    const remaining = await this.repository.listMaps();
    if (remaining.length > 0) {
      await this.loadLatest(++this.loadEpoch);
    } else {
      const language = this.plugin.settings.language;
      const fresh = applyDagreLayout(
        createRootMap(t(language, "defaultMapTitle"), t(language, "rootQuestionTitle")),
      );
      await this.repository.saveMap(fresh);
      this.attachMap(fresh, true);
    }

    await this.documents.forget(map.id);

    return true;
  }

  /**
   * Single entry point for every export format, so the graph toolbar, the chat
   * sidebar, and the command all offer the same choices.
   */
  async exportMapAs(format: ExportFormat = "package"): Promise<void> {
    const { map } = this.state;
    if (!map) {
      return;
    }

    const language = this.plugin.settings.language;
    try {
      const prepared = await this.prepareMapForExport(map);
      const folder = this.plugin.settings.defaultExportFolder;
      const baseName = this.exportFolderName(prepared);

      if (format === "interactive") {
        const path = await writeInteractiveHtmlExport(this.plugin.app, prepared, folder, language);
        new Notice(t(language, "exported", { path }));
        return;
      }

      if (format === "markdown" || format === "mermaid") {
        const path = await this.repository.writeExport(
          folder,
          format === "markdown" ? `${baseName}.md` : `${baseName}-mermaid.md`,
          format === "markdown" ? exportMarkdown(prepared, language) : exportMermaidMindmap(prepared),
        );
        new Notice(t(language, "exported", { path }));
        return;
      }

      const exportFolder = await this.repository.createExportFolder(`${folder}/${baseName}`);
      const files = buildExportFiles(prepared, {
        exportFolder,
        language,
        modelProfiles: this.plugin.settings.models,
      });
      let entryPath = "";

      for (const file of files) {
        const path = await this.repository.writeExport(exportFolder, file.path, file.content);
        if (file.path === "index.md") {
          entryPath = path;
        }
      }

      new Notice(t(language, "exported", { path: entryPath || exportFolder }));
    } catch (exportError: unknown) {
      this.reportError(exportError);
    }
  }

  async exportMap(): Promise<void> {
    return this.exportMapAs("package");
  }

  async sendMessage(options: { profileId?: string; contextMode?: ContextMode; thinking?: boolean } = {}, targetNodeId?: NodeId): Promise<void> {
    const { drafts } = this.state;
    const activeNodeId = targetNodeId ?? this.state.activeNodeId;
    const requestSettings = this.settingsSnapshot();
    const document = this.document;
    if (!document || !activeNodeId || !document.map.nodes[activeNodeId]) return;
    const draft = drafts[activeNodeId]?.trim();
    if (!draft || !document.tryBeginSubmission(activeNodeId)) return;

    let profile: ModelProfile;
    try {
      const resolved = await this.resolveProfile(options.profileId ?? document.map.nodes[activeNodeId]?.defaultModelProfileId);
      profile = resolved.profile;
      if (resolved.fellBack) this.noticeProfileFallback();
      const missingConfiguration = this.getMissingProfileConfiguration(profile);
      if (missingConfiguration) {
        const errorKey = missingConfiguration === "apiBaseUrl"
          ? "missingApiBaseUrl"
          : missingConfiguration === "apiKey"
            ? "missingApiKey"
            : "missingModel";
        if (this.document === document) this.setState({ error: t(requestSettings.language, errorKey), errorDetails: null });
        document.finishSubmission(activeNodeId);
        return;
      }
    } catch (profileError: unknown) {
      document.finishSubmission(activeNodeId);
      if (this.document === document) this.reportError(profileError);
      return;
    }

    if (!document.isValid || !document.map.nodes[activeNodeId]) {
      document.finishSubmission(activeNodeId);
      return;
    }

    const userMessage = createMessage("user", draft);
    document.commit((currentMap) => {
      const node = currentMap.nodes[activeNodeId];
      if (!node) return currentMap;
      return updateNode(currentMap, activeNodeId, {
        messages: [...node.messages, userMessage],
      });
    });
    const currentDraft = this.document === document ? this.state.drafts[activeNodeId] : undefined;
    if (currentDraft?.trim() === draft) {
      this.setState({ drafts: { ...this.state.drafts, [activeNodeId]: "" } });
    }

    try {
      // The conversation turn reaches disk before the provider can receive it.
      await document.flushWrites();
    } catch (saveError: unknown) {
      document.setGenerationError(activeNodeId, saveError, profile.id);
      document.finishSubmission(activeNodeId);
      if (this.document === document) this.reportError(saveError);
      return;
    }

    const contextMode = options.contextMode ?? requestSettings.contextMode;
    const thinking = options.thinking ?? this.state.sendOptions[activeNodeId]?.thinking;
    document.setMaxConcurrent(requestSettings.maxConcurrentGenerations ?? 3);
    await document.enqueueGeneration(activeNodeId, profile.id, (controller) =>
      this.generateAssistant(document, activeNodeId, profile, contextMode, thinking, requestSettings, controller));
  }

  async retryAssistant(nodeId: NodeId = this.state.activeNodeId ?? ""): Promise<void> {
    const document = this.document;
    const requestSettings = this.settingsSnapshot();
    if (!document || !nodeId || !document.map.nodes[nodeId] || !document.tryBeginSubmission(nodeId)) return;

    const node = document.map.nodes[nodeId];
    const lastMessage = node.messages.at(-1);
    if (lastMessage?.role !== "user") {
      document.finishSubmission(nodeId);
      this.setState({ error: t(this.plugin.settings.language, "retryUnavailable"), errorDetails: null });
      return;
    }

    const failedProfileId = document.getSnapshot().generationJobs[nodeId]?.profileId;

    let profile: ModelProfile;
    try {
      const resolved = await this.resolveProfile(failedProfileId ?? node.defaultModelProfileId);
      profile = resolved.profile;
      if (resolved.fellBack) this.noticeProfileFallback();
      const missingConfiguration = this.getMissingProfileConfiguration(profile);
      if (missingConfiguration) {
        const errorKey = missingConfiguration === "apiBaseUrl"
          ? "missingApiBaseUrl"
          : missingConfiguration === "apiKey"
            ? "missingApiKey"
            : "missingModel";
        if (this.document === document) this.setState({ error: t(this.plugin.settings.language, errorKey), errorDetails: null });
        document.setGenerationError(nodeId, new Error(t(this.plugin.settings.language, errorKey)), profile.id);
        document.finishSubmission(nodeId);
        return;
      }
    } catch (profileError: unknown) {
      document.finishSubmission(nodeId);
      if (this.document === document) this.reportError(profileError);
      return;
    }

    const contextMode = requestSettings.contextMode;
    const thinking = this.state.sendOptions[nodeId]?.thinking;
    document.setMaxConcurrent(requestSettings.maxConcurrentGenerations ?? 3);
    try {
      await document.persistCurrent();
    } catch (saveError: unknown) {
      document.setGenerationError(nodeId, saveError, profile.id);
      document.finishSubmission(nodeId);
      if (this.document === document) this.reportError(saveError);
      return;
    }
    await document.enqueueGeneration(nodeId, profile.id, (controller) =>
      this.generateAssistant(document, nodeId, profile, contextMode, thinking, requestSettings, controller));
  }

  cancelGeneration(nodeId?: NodeId): void {
    this.document?.cancelGeneration(nodeId);
  }

  updateDraft(nodeId: NodeId, value: string): void {
    this.setState({
      drafts: {
        ...this.state.drafts,
        [nodeId]: value,
      },
    });
  }

  updateSendOptions(nodeId: NodeId, options: NodeSendOptions): void {
    if (!this.state.map?.nodes[nodeId]) return;
    // Merge so the composer can update one control without dropping the others.
    this.setState({
      sendOptions: {
        ...this.state.sendOptions,
        [nodeId]: { ...this.state.sendOptions[nodeId], ...options },
      },
    });
  }

  updateNodeDefaultProfile(nodeId: NodeId, profileId: string): void {
    const cleanProfileId = profileId.trim();
    if (!cleanProfileId) return;
    this.commitMap((currentMap) => currentMap.nodes[nodeId]
      ? updateNode(currentMap, nodeId, { defaultModelProfileId: cleanProfileId })
      : currentMap);
  }

  updateCurrentNodeTitle(title: string): void {
    const cleanTitle = title.trim();
    const { map, activeNodeId } = this.state;
    if (!map || !activeNodeId || !cleanTitle) {
      return;
    }

    this.commitMap((currentMap) => {
      if (!currentMap.nodes[activeNodeId]) return currentMap;
      let nextMap = updateNode(currentMap, activeNodeId, { title: cleanTitle });
      if (activeNodeId === currentMap.rootNodeId) nextMap = updateMapTitle(nextMap, cleanTitle);
      return nextMap;
    });
  }

  updateCurrentNodeStatus(status: ChatNodeStatus): void {
    const { map, activeNodeId } = this.state;
    if (!map || !activeNodeId) {
      return;
    }

    this.commitMap((currentMap) => currentMap.nodes[activeNodeId]
      ? updateNode(currentMap, activeNodeId, { status })
      : currentMap);
  }

  updateNodeNote(nodeId: NodeId, note: string): void {
    const { map } = this.state;
    if (!map?.nodes[nodeId]) {
      return;
    }

    const normalizedNote = note.trim() ? note.trimEnd() : undefined;
    if ((map.nodes[nodeId]?.note ?? undefined) === normalizedNote) return;
    this.commitMap((currentMap) => {
      if (!currentMap.nodes[nodeId] || (currentMap.nodes[nodeId]?.note ?? undefined) === normalizedNote) return currentMap;
      return updateNode(currentMap, nodeId, { note: normalizedNote });
    });
  }

  updateNodeSummary(nodeId: NodeId, summary: string): void {
    const normalizedSummary = summary.trim() ? summary.trimEnd() : undefined;
    const currentNode = this.state.map?.nodes[nodeId];
    if (!currentNode || (currentNode.summary ?? undefined) === normalizedSummary) return;
    this.commitMap((currentMap) => currentMap.nodes[nodeId]
      ? updateNode(currentMap, nodeId, { summary: normalizedSummary, summaryEditedByUser: true })
      : currentMap);
  }

  updatePosition(nodeId: NodeId, position: { x: number; y: number }): void {
    const { map } = this.state;
    if (!map) {
      return;
    }

    this.commitMap((currentMap) => currentMap.nodes[nodeId]
      ? updateNode(currentMap, nodeId, { position })
      : currentMap);
    this.setState({ hasManualPositions: true });
  }

  toggleCollapse(nodeId: NodeId): void {
    const collapsedIds = new Set(this.state.collapsedIds);
    if (collapsedIds.has(nodeId)) {
      collapsedIds.delete(nodeId);
    } else {
      collapsedIds.add(nodeId);
    }

    this.setState({ collapsedIds });
  }

  autoLayout(): void {
    const { map } = this.state;
    if (map) {
      this.commitMap((currentMap) => applyDagreLayout(currentMap));
      this.setState({ hasManualPositions: false });
    }
  }

  countNodeSubtree(nodeId: NodeId): number {
    const { map } = this.state;
    if (!map || !map.nodes[nodeId]) {
      return 0;
    }

    let count = 0;
    const visit = (id: NodeId): void => {
      const node = map.nodes[id];
      if (!node) {
        return;
      }

      count += 1;
      for (const childId of node.children) {
        visit(childId);
      }
    };

    visit(nodeId);
    return count;
  }

  searchNodes(query: string): NodeSearchResult[] {
    const { map } = this.state;
    const cleanQuery = cleanText(query).toLowerCase();
    if (!map || !cleanQuery) {
      return [];
    }

    return Object.values(map.nodes)
      .map((node) => {
        const haystack = [
          node.title,
          node.note ?? "",
          node.summary ?? "",
          node.anchorText ?? "",
          ...node.messages.map((message) => message.content),
        ].join(" ");

        if (!haystack.toLowerCase().includes(cleanQuery)) {
          return null;
        }

        return {
          node,
          path: getAncestorPath(map, node.id),
          excerpt: this.searchExcerpt(haystack, cleanQuery),
        };
      })
      .filter((result): result is NodeSearchResult => Boolean(result));
  }

  revealNode(nodeId: NodeId): void {
    const { map } = this.state;
    if (!map?.nodes[nodeId]) {
      return;
    }

    const collapsedIds = new Set(this.state.collapsedIds);
    for (const node of getAncestorPath(map, nodeId)) {
      collapsedIds.delete(node.id);
    }

    this.setState({
      activeNodeId: nodeId,
      collapsedIds,
    });
  }

  getActiveNode(): ChatNode | null {
    const { map, activeNodeId } = this.state;
    return activeNodeId && map ? map.nodes[activeNodeId] ?? null : null;
  }

  getActivePath(): ChatNode[] {
    const { map, activeNodeId } = this.state;
    return activeNodeId && map ? getAncestorPath(map, activeNodeId) : [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loadEpoch += 1;
    this.unsubscribeDocument?.();
    this.unsubscribeDocument = null;
    this.unsubscribeForgotten?.();
    this.unsubscribeForgotten = null;
    for (const controller of this.auxiliaryControllers) controller.abort();
    this.auxiliaryControllers.clear();
    this.listeners.clear();
  }

  private async loadLatest(epoch: number): Promise<void> {
    try {
      const lastId = this.plugin.settings.lastOpenedMapId;
      let loaded: ChatMap | null = null;

      if (lastId) {
        loaded = await this.repository.loadMap(lastId);
        if (epoch !== this.loadEpoch || this.disposed) return;
      }

      if (!loaded) {
        loaded = await this.repository.loadLatestMap();
        if (epoch !== this.loadEpoch || this.disposed) return;
      }

      const language = this.plugin.settings.language;
      const initial = loaded ?? applyDagreLayout(createRootMap(t(language, "defaultMapTitle"), t(language, "rootQuestionTitle")));
      if (!loaded) {
        if (epoch !== this.loadEpoch || this.disposed) return;
        await this.repository.saveMap(initial);
      }
      if (epoch !== this.loadEpoch || this.disposed) return;
      this.attachMap(initial, true);
    } catch (loadError: unknown) {
      if (epoch === this.loadEpoch && !this.disposed) this.reportError(loadError);
    }
  }

  private async loadById(mapId: ChatMapId, epoch: number): Promise<void> {
    try {
      const loaded = await this.repository.loadMap(mapId);
      if (!loaded || epoch !== this.loadEpoch || this.disposed) {
        return;
      }

      const updateSettings = (this.plugin as unknown as { updateSettings?: (patch: Partial<BranchChatMapSettings>) => Promise<void> }).updateSettings;
      if (typeof updateSettings === "function") void updateSettings.call(this.plugin, { lastOpenedMapId: loaded.id });
      this.attachMap(loaded, true);
    } catch (loadError: unknown) {
      if (epoch === this.loadEpoch && !this.disposed) this.reportError(loadError);
    }
  }

  private attachMap(map: ChatMap, resetUi: boolean): void {
    this.unsubscribeDocument?.();
    this.document = this.documents.get(map);
    this.loadedMapId = this.document.map.id;
    this.unsubscribeDocument = this.document.subscribe(() => this.syncDocument());
    const activeNodeId = resetUi || !this.document.map.nodes[this.state.activeNodeId ?? ""]
      ? this.document.map.rootNodeId
      : this.state.activeNodeId;
    this.state = {
      ...this.state,
      map: this.document.map,
      activeNodeId,
      collapsedIds: resetUi ? new Set() : this.state.collapsedIds,
      drafts: resetUi ? {} : this.state.drafts,
      sendOptions: resetUi ? {} : this.state.sendOptions,
      pendingNodeId: null,
      streamingMessages: {},
      generationJobs: {},
      generationQueue: [],
      error: null,
      errorDetails: null,
      hasManualPositions: resetUi ? false : this.state.hasManualPositions,
    };
    this.syncDocument();
  }

  private handleForgottenMap(mapId: string): void {
    if (this.disposed || this.document?.id !== mapId) return;
    this.unsubscribeDocument?.();
    this.unsubscribeDocument = null;
    this.document = null;
    this.loadedMapId = null;
    this.state = {
      ...INITIAL_STATE,
      collapsedIds: new Set(),
      drafts: {},
      sendOptions: {},
      streamingMessages: {},
      generationJobs: {},
      generationQueue: [],
    };
    this.emit();
    void this.load();
  }

  private syncDocument(): void {
    const document = this.document;
    if (!document || this.disposed) return;
    const snapshot = document.getSnapshot();
    const activeJob = this.state.activeNodeId ? snapshot.generationJobs[this.state.activeNodeId] : undefined;
    const error = snapshot.error ?? (activeJob?.status === "error" ? activeJob.error ?? null : null);
    const errorDetails = snapshot.errorDetails ?? (activeJob?.status === "error" ? activeJob.errorDetails ?? null : null);
    this.setState({
      map: snapshot.map,
      generationJobs: snapshot.generationJobs,
      generationQueue: snapshot.generationQueue,
      streamingMessages: snapshot.streamingMessages,
      pendingNodeId: activeJob && (activeJob.status === "queued" || activeJob.status === "running")
        ? activeJob.nodeId
        : null,
      error,
      errorDetails,
    });
  }

  private commitMap(update: (currentMap: ChatMap) => ChatMap): ChatMap | null {
    if (!this.document?.isValid) return this.document?.map ?? null;
    const nextMap = this.document.commit(update);
    return nextMap;
  }

  private async resolveProfile(id?: string): Promise<{ profile: ModelProfile; fellBack: boolean }> {
    const pluginWithResolver = this.plugin as unknown as {
      resolveProfileForRequest?: (profileId?: string) => Promise<{ profile: ModelProfile; fellBack: boolean }>;
    };
    if (typeof pluginWithResolver.resolveProfileForRequest === "function") {
      return pluginWithResolver.resolveProfileForRequest.call(this.plugin, id);
    }

    const settings = this.plugin.settings;
    const selected = id ? settings.models?.find((profile) => profile.id === id) : undefined;
    const fallback = settings.models?.find((profile) => profile.id === settings.defaultModelProfileId)
      ?? settings.models?.[0];
    if (selected) {
      const profile = { ...selected };
      // Older plugin callers (including the browser harness) can still provide
      // credentials only on the legacy top-level settings fields. Normalize
      // those into the default profile without borrowing them for named profiles.
      if (profile.id === settings.defaultModelProfileId) {
        profile.baseUrl ||= settings.apiBaseUrl;
        profile.apiKey ||= settings.apiKey;
        profile.model ||= settings.model;
      }
      return { profile, fellBack: false };
    }
    if (fallback) {
      const profile = { ...fallback };
      if (profile.id === settings.defaultModelProfileId) {
        profile.baseUrl ||= settings.apiBaseUrl;
        profile.apiKey ||= settings.apiKey;
        profile.model ||= settings.model;
      }
      return { profile, fellBack: Boolean(id && id !== fallback.id) };
    }
    return {
      profile: {
        id: id || settings.defaultModelProfileId || "legacy-default",
        alias: "Default",
        model: settings.model,
        baseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
      },
      fellBack: false,
    };
  }

  private settingsSnapshot(): BranchChatMapSettings {
    const settings = this.plugin.settings;
    return {
      ...settings,
      models: settings.models?.map((profile) => ({ ...profile })),
    };
  }

  private getMissingProfileConfiguration(profile: ModelProfile): "apiBaseUrl" | "apiKey" | "model" | null {
    if (!profile.baseUrl.trim()) return "apiBaseUrl";
    if (!profile.apiKey.trim()) return "apiKey";
    if (!profile.model.trim()) return "model";
    return null;
  }

  private noticeProfileFallback(): void {
    const message = this.plugin.settings.language === "zh-CN"
      ? "所选模型配置不可用，已改用默认模型。"
      : "The selected model profile is unavailable. Using the default profile.";
    new Notice(message);
  }

  private async generateAssistant(
    document: MapDocument,
    nodeId: NodeId,
    profile: ModelProfile,
    contextMode: ContextMode | undefined,
    thinking: boolean | undefined,
    requestSettings: BranchChatMapSettings,
    controller: AbortController,
  ): Promise<void> {
    const baseMap = document.map;
    const requestNode = baseMap.nodes[nodeId];
    if (!requestNode || !document.isValid) return;

    const assistantMessage: ChatMessage = {
      ...createMessage("assistant", ""),
      modelSnapshot: { profileId: profile.id, alias: profile.alias, model: profile.model },
    };
    document.setStreamingMessage(nodeId, assistantMessage);

    let answer = "";
    let streamUpdateTimer: ReturnType<typeof setTimeout> | undefined;
    const currentMap = () => {
      if (!document.isValid) return null;
      const snapshot = document.getSnapshot();
      return document.map.id === baseMap.id && document.map.nodes[nodeId]
        && snapshot.streamingMessages[nodeId]?.id === assistantMessage.id ? document.map : null;
    };
    let reasoning = "";
    const publishStream = () => {
      streamUpdateTimer = undefined;
      if (controller.signal.aborted || !currentMap()) return;
      document.setStreamingMessage(nodeId, {
        ...assistantMessage,
        content: answer,
        reasoning: reasoning || undefined,
      });
    };

    try {
      const provider = new OpenAICompatibleProvider(requestSettings);
      const parent = requestNode.parentId ? baseMap.nodes[requestNode.parentId] : undefined;
      const contextMessages = buildContextMessages(baseMap, nodeId, contextMode, requestSettings);
      const includeParentContext = contextMode === undefined
        ? requestSettings.includeParentContext
        : contextMode !== "none";
      const systemPromptOverride = profile.systemPrompt?.trim() || undefined;
      const request = {
        node: requestNode,
        parent,
        contextMessages,
        model: profile.model,
        includeParentContext,
        signal: controller.signal,
        profile,
        contextMode,
        thinking,
        systemPromptOverride,
        // Reasoning models report their thinking through this channel; it is batched
        // with the answer so a burst of thinking does not re-render per delta.
        onReasoning: (text: string) => {
          reasoning += text;
          streamUpdateTimer ??= setTimeout(publishStream, 32);
        },
      };

      if (requestSettings.streamResponses) {
        for await (const chunk of provider.streamChat(request)) {
          controller.signal.throwIfAborted();
          answer += chunk;
          // Batch token bursts before notifying React and rendering Markdown.
          streamUpdateTimer ??= setTimeout(publishStream, 32);
        }
        clearTimeout(streamUpdateTimer);
        publishStream();
      } else {
        answer = await provider.chat(request);
        publishStream();
      }

      controller.signal.throwIfAborted();
      answer = answer.trim();
      const reasoningText = reasoning.trim();
      if (!currentMap()) return;
      document.commit((currentMapValue) => currentMapValue.nodes[nodeId]
        ? appendMessage(currentMapValue, nodeId, {
            ...assistantMessage,
            content: answer,
            state: "complete",
            reasoning: reasoningText || undefined,
          })
        : currentMapValue);

      let latestMap = document.map;
      let updatedNode = latestMap.nodes[nodeId];
      if (requestSettings.autoSummarizeNodes && updatedNode) {
        // The answer is already saved. Summarizing is auxiliary, so a failure here
        // must never mark the node as failed or discard the completed answer.
        try {
          const summary = await provider.summarizeNode(updatedNode, controller.signal, profile);
          if (!controller.signal.aborted && currentMap()) {
            document.commit((currentMapValue) => {
              const currentNode = currentMapValue.nodes[nodeId];
              return currentNode && !currentNode.summaryEditedByUser
                ? updateNode(currentMapValue, nodeId, { summary, summaryEditedByUser: false })
                : currentMapValue;
            });
          }
        } catch {
          // Ignored on purpose: the completed answer is the result that matters.
        }
      }

      latestMap = document.map;
      updatedNode = latestMap.nodes[nodeId];
      // Naming stays auxiliary too: no new request once the run was cancelled or the map is gone.
      if (!controller.signal.aborted && currentMap() && updatedNode && this.shouldAutoTitle(updatedNode, latestMap, requestSettings.language)) {
        try {
          const titleNode = updatedNode;
          const title = this.normalizeGeneratedTitle(await provider.titleNode(titleNode, controller.signal, profile));
          const liveNode = document.map.nodes[nodeId];
          if (title && !controller.signal.aborted && liveNode?.title === titleNode.title) {
            document.commit((currentMapValue) => {
              const currentNode = currentMapValue.nodes[nodeId];
              if (!currentNode || currentNode.title !== titleNode.title) return currentMapValue;
              let nextMap = updateNode(currentMapValue, nodeId, { title });
              if (nodeId === nextMap.rootNodeId) nextMap = updateMapTitle(nextMap, title);
              return nextMap;
            });
          }
        } catch {
          // Naming is helpful, but it should never discard the completed answer.
        }
      }
    } catch (generateError: unknown) {
      if (controller.signal.aborted) {
        const partial = requestSettings.streamResponses ? answer.trim() : "";
        const latestMap = currentMap();
        if (partial && latestMap && !latestMap.nodes[nodeId]?.messages.some((message) => message.id === assistantMessage.id)) {
          document.commit((currentMapValue) => currentMapValue.nodes[nodeId]
            && !currentMapValue.nodes[nodeId]?.messages.some((message) => message.id === assistantMessage.id)
            ? appendMessage(currentMapValue, nodeId, {
                ...assistantMessage,
                content: partial,
                state: "stopped",
                reasoning: reasoning.trim() || undefined,
              })
            : currentMapValue);
          if (this.document === document) new Notice(t(requestSettings.language, "generationStoppedWithPartial"));
        }
      } else if (currentMap()) {
        document.setGenerationError(nodeId, generateError, profile.id);
        if (this.document === document) this.reportError(generateError);
      }
    } finally {
      clearTimeout(streamUpdateTimer);
      const liveStream = document.getSnapshot().streamingMessages[nodeId];
      if (liveStream?.id === assistantMessage.id) document.setStreamingMessage(nodeId, null);
    }
  }

  private shouldAutoTitle(node: ChatNode, map: ChatMap, language = this.plugin.settings.language): boolean {
    const cleanTitle = cleanText(node.title);
    const defaultTitles = new Set([
      t(language, "rootQuestionTitle"),
      t(language, "untitledQuestionTitle"),
      "Root question",
      "Untitled question",
      "根问题",
      "未命名问题",
    ]);

    if (node.id === map.rootNodeId) {
      return defaultTitles.has(cleanTitle) || map.title === t(language, "defaultMapTitle") || map.title === "Untitled chat map" || map.title === "未命名对话图谱";
    }

    // A selected passage supplies the child's title. An answer must not rename it.
    return !node.anchorText?.trim() && defaultTitles.has(cleanTitle);
  }

  private async prepareMapForExport(map: ChatMap): Promise<ChatMap> {
    const document = this.document;
    const root = map.nodes[map.rootNodeId];
    if (!root || root.messages.length === 0 || !this.shouldAutoTitle(root, map)) {
      return map;
    }

    try {
      const answerProfileId = [...root.messages].reverse().find((message) => message.role === "assistant")?.modelSnapshot?.profileId;
      const resolved = await this.resolveProfile(answerProfileId ?? root.defaultModelProfileId);
      if (resolved.fellBack) this.noticeProfileFallback();
      if (this.getMissingProfileConfiguration(resolved.profile)) return map;
      const provider = new OpenAICompatibleProvider(this.plugin.settings);
      const controller = new AbortController();
      const title = this.normalizeGeneratedTitle(await provider.titleNode(root, controller.signal, resolved.profile));
      if (!title) {
        return map;
      }

      const currentMap = document?.map;
      if (!document?.isValid || currentMap?.id !== map.id || !currentMap.nodes[root.id]) return map;
      if (currentMap.nodes[root.id]?.title !== root.title) return currentMap;
      document.commit((latestMap) => {
        if (latestMap.id !== map.id || latestMap.nodes[root.id]?.title !== root.title) return latestMap;
        return updateMapTitle(updateNode(latestMap, root.id, { title }), title);
      });
      return document.map;
    } catch {
      return map;
    }
  }

  private exportFolderName(map: ChatMap): string {
    return `${this.formatExportTimestamp(map.createdAt)}-${slugifyFileName(map.title)}`;
  }

  private formatExportTimestamp(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return slugifyFileName(value);
    }

    const pad = (number: number): string => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  }

  private normalizeGeneratedTitle(title: string): string {
    return truncateText(cleanText(title).replace(/^["'“”‘’]+|["'“”‘’]+$/g, ""), 42);
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const details = error instanceof Error && "details" in error && typeof error.details === "string" ? error.details : null;
    this.setState({ error: message, errorDetails: details });
    new Notice(message);
  }

  private searchExcerpt(value: string, query: string): string {
    const clean = cleanText(value);
    const idx = clean.toLowerCase().indexOf(query);
    if (idx < 0) {
      return truncateText(clean, 120);
    }

    const start = Math.max(0, idx - 36);
    const end = Math.min(clean.length, idx + query.length + 72);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < clean.length ? "..." : "";
    return `${prefix}${clean.slice(start, end)}${suffix}`;
  }

  private setState(patch: Partial<BranchChatMapState>): void {
    let nextState: BranchChatMapState = {
      ...this.state,
      ...patch,
    };
    if (this.document) {
      const snapshot = this.document.getSnapshot();
      const activeJob = nextState.activeNodeId ? snapshot.generationJobs[nextState.activeNodeId] : undefined;
      nextState = {
        ...nextState,
        map: snapshot.map,
        generationJobs: snapshot.generationJobs,
        generationQueue: snapshot.generationQueue,
        streamingMessages: snapshot.streamingMessages,
        pendingNodeId: activeJob && (activeJob.status === "queued" || activeJob.status === "running")
          ? activeJob.nodeId
          : null,
      };
    }
    this.state = nextState;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
