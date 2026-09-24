import type { MapRepository } from "../storage/mapRepository";
import type { ChatMap, ChatMessage, NodeId } from "../types";

export type GenerationJobStatus = "queued" | "running" | "error";

export interface GenerationJob {
  nodeId: NodeId;
  status: GenerationJobStatus;
  profileId?: string;
  /** One based position in the waiting queue, or null once running/failed. */
  queuePosition: number | null;
  error?: string;
  errorDetails?: string | null;
}

export interface MapDocumentSnapshot {
  map: ChatMap;
  generationJobs: Record<NodeId, GenerationJob>;
  generationQueue: NodeId[];
  streamingMessages: Record<NodeId, ChatMessage>;
  error: string | null;
  errorDetails: string | null;
}

export type GenerationRunner = (controller: AbortController) => Promise<void>;

interface GenerationRecord extends GenerationJob {
  controller?: AbortController;
  runner: GenerationRunner;
  resolve: () => void;
  promise: Promise<void>;
  cancelled: boolean;
  scheduled?: ScheduledGeneration;
}

interface ScheduledGeneration {
  cancelled: boolean;
  start(release: () => void): void;
}

class GenerationScheduler {
  private readonly queue: ScheduledGeneration[] = [];
  private running = 0;
  private maxConcurrent = 3;

  setLimit(value: number): void {
    this.maxConcurrent = Number.isFinite(value) ? Math.max(1, Math.min(5, Math.floor(value))) : 3;
    this.pump();
  }

  enqueue(item: ScheduledGeneration): void {
    this.queue.push(item);
    this.pump();
  }

  cancel(item: ScheduledGeneration): void {
    item.cancelled = true;
    const index = this.queue.indexOf(item);
    if (index >= 0) this.queue.splice(index, 1);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (item.cancelled) continue;
      this.running += 1;
      let released = false;
      item.start(() => {
        if (released) return;
        released = true;
        this.running = Math.max(0, this.running - 1);
        this.pump();
      });
    }
  }
}

/** One canonical, revisioned document and generation queue for each open map. */
export class MapDocument {
  private mapValue: ChatMap;
  private revision = 0;
  private readonly repository: MapRepository;
  private readonly scheduler: GenerationScheduler;
  private readonly listeners = new Set<() => void>();
  private readonly jobs = new Map<NodeId, GenerationRecord>();
  private readonly streams: Record<NodeId, ChatMessage> = {};
  private queue: NodeId[] = [];
  private writeTail: Promise<void> = Promise.resolve();
  private lastWrite: Promise<void> = Promise.resolve();
  private persistenceError: string | null = null;
  private persistenceErrorDetails: string | null = null;
  private readonly submissionLocks = new Set<NodeId>();
  private invalidated = false;

  constructor(map: ChatMap, repository: MapRepository, scheduler: GenerationScheduler) {
    this.mapValue = map;
    this.repository = repository;
    this.scheduler = scheduler;
  }

  get id(): string {
    return this.mapValue.id;
  }

  get map(): ChatMap {
    return this.mapValue;
  }

  get isValid(): boolean {
    return !this.invalidated;
  }

  getSnapshot(): MapDocumentSnapshot {
    const generationJobs: Record<NodeId, GenerationJob> = {};
    for (const [nodeId, job] of this.jobs) {
      generationJobs[nodeId] = {
        nodeId,
        status: job.status,
        profileId: job.profileId,
        queuePosition: job.queuePosition,
        error: job.error,
        errorDetails: job.errorDetails,
      };
    }
    return {
      map: this.mapValue,
      generationJobs,
      generationQueue: [...this.queue],
      streamingMessages: { ...this.streams },
      error: this.persistenceError,
      errorDetails: this.persistenceErrorDetails,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  commit(update: (current: ChatMap) => ChatMap): ChatMap {
    if (this.invalidated) return this.mapValue;
    const nextMap = update(this.mapValue);
    if (nextMap === this.mapValue) return this.mapValue;
    if (nextMap.id !== this.mapValue.id) {
      throw new Error("A map commit cannot change the map id.");
    }
    this.mapValue = nextMap;
    this.revision += 1;
    const revision = this.revision;
    const snapshot = nextMap;
    this.persistenceError = null;
    this.persistenceErrorDetails = null;
    this.emit();

    // Writes are started synchronously in revision order and serialized by the
    // map repository, so a slower earlier adapter write cannot replace a newer
    // snapshot on disk.
    this.scheduleWrite(snapshot, revision);
    return nextMap;
  }

  async flushWrites(): Promise<void> {
    await this.lastWrite;
  }

  async persistCurrent(): Promise<void> {
    if (this.invalidated) throw new Error("This chat map is no longer available.");
    this.scheduleWrite(this.mapValue, this.revision);
    await this.lastWrite;
  }

  replaceMap(map: ChatMap): void {
    if (this.invalidated) return;
    if (map.id !== this.mapValue.id) throw new Error("A map replacement must preserve the map id.");
    this.mapValue = map;
    this.revision += 1;
    this.emit();
  }

  setStreamingMessage(nodeId: NodeId, message: ChatMessage | null): void {
    if (message) this.streams[nodeId] = message;
    else delete this.streams[nodeId];
    this.emit();
  }

  setMaxConcurrent(value: number): void {
    this.scheduler.setLimit(value);
    this.emit();
  }

  tryBeginSubmission(nodeId: NodeId): boolean {
    if (this.invalidated || this.submissionLocks.has(nodeId)) return false;
    const existing = this.jobs.get(nodeId);
    if (existing && existing.status !== "error") return false;
    this.submissionLocks.add(nodeId);
    return true;
  }

  finishSubmission(nodeId: NodeId): void {
    this.submissionLocks.delete(nodeId);
  }

  enqueueGeneration(nodeId: NodeId, profileId: string | undefined, runner: GenerationRunner): Promise<void> {
    if (this.invalidated) return Promise.resolve();
    const existing = this.jobs.get(nodeId);
    if (existing?.status !== "error" && existing) return existing.promise;
    if (existing) this.jobs.delete(nodeId);

    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    const record: GenerationRecord = {
      nodeId,
      status: "queued",
      profileId,
      queuePosition: this.queue.length + 1,
      runner,
      resolve,
      promise,
      cancelled: false,
    };
    this.jobs.set(nodeId, record);
    this.queue.push(nodeId);
    this.updateQueuePositions();
    this.emit();
    const scheduled: ScheduledGeneration = {
      cancelled: false,
      start: (release) => this.startGeneration(record, release),
    };
    record.scheduled = scheduled;
    this.scheduler.enqueue(scheduled);
    return promise;
  }

  setGenerationError(nodeId: NodeId, error: unknown, profileId?: string): void {
    if (this.invalidated) return;
    let record = this.jobs.get(nodeId);
    if (!record) {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => { resolve = done; });
      resolve();
      record = {
        nodeId,
        status: "error",
        profileId,
        queuePosition: null,
        runner: async () => {},
        resolve,
        promise,
        cancelled: false,
      };
      this.jobs.set(nodeId, record);
    }
    if (record.cancelled) return;
    const message = error instanceof Error ? error.message : String(error);
    record.status = "error";
    record.queuePosition = null;
    record.error = message;
    record.errorDetails = error instanceof Error && "details" in error && typeof error.details === "string"
      ? error.details
      : null;
    this.emit();
  }

  cancelGeneration(nodeId?: NodeId): void {
    const targets = nodeId
      ? [nodeId]
      : [...this.jobs.values()].filter((job) => job.status !== "error").map((job) => job.nodeId);
    for (const target of targets) {
      const record = this.jobs.get(target);
      if (!record) continue;
      record.cancelled = true;
      if (record.status === "queued") {
        if (record.scheduled) this.scheduler.cancel(record.scheduled);
        this.queue = this.queue.filter((id) => id !== target);
        this.jobs.delete(target);
        record.resolve();
      } else if (record.status === "running") {
        record.controller?.abort();
        // Keep the internal slot until the runner settles, while hiding a
        // canceled job from the queue UI and preventing a duplicate on this node.
        this.jobs.delete(target);
      } else {
        this.jobs.delete(target);
        record.resolve();
      }
      if (record.status !== "running") delete this.streams[target];
    }
    this.updateQueuePositions();
    this.emit();
  }

  invalidate(): void {
    if (this.invalidated) return;
    this.invalidated = true;
    this.cancelGeneration();
    for (const nodeId of Object.keys(this.streams)) delete this.streams[nodeId];
    this.submissionLocks.clear();
    this.emit();
  }

  private startGeneration(record: GenerationRecord, release: () => void): void {
    const nodeId = record.nodeId;
    if (record.cancelled || this.jobs.get(nodeId) !== record || this.invalidated) {
      release();
      return;
    }
    this.queue = this.queue.filter((id) => id !== nodeId);
    record.status = "running";
    record.queuePosition = null;
    record.controller = new AbortController();
    this.updateQueuePositions();
    this.emit();
    void Promise.resolve()
      .then(() => record.runner(record.controller!))
      .catch((error: unknown) => {
        if (!record.cancelled && this.jobs.get(nodeId) === record) {
          this.setGenerationError(nodeId, error, record.profileId);
        }
      })
      .finally(() => {
        if (this.jobs.get(nodeId) === record) {
          if (record.status !== "error") this.jobs.delete(nodeId);
        }
        this.submissionLocks.delete(nodeId);
        record.resolve();
        this.updateQueuePositions();
        this.emit();
        release();
      });
  }

  private updateQueuePositions(): void {
    this.queue.forEach((nodeId, index) => {
      const record = this.jobs.get(nodeId);
      if (record) {
        record.status = "queued";
        record.queuePosition = index + 1;
      }
    });
  }

  private scheduleWrite(snapshot: ChatMap, revision: number): void {
    const write = this.writeTail.catch(() => undefined).then(() => this.repository.saveMap(snapshot));
    this.lastWrite = write;
    this.writeTail = write.catch((error: unknown) => {
      if (this.revision === revision) {
        this.persistenceError = error instanceof Error ? error.message : String(error);
        this.persistenceErrorDetails = error instanceof Error && "details" in error && typeof error.details === "string"
          ? error.details
          : null;
        this.emit();
      }
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Shared by all ViewStates owned by one BranchChatMapStore. */
export class MapDocumentRegistry {
  private readonly repository: MapRepository;
  private readonly documents = new Map<string, MapDocument>();
  private readonly scheduler = new GenerationScheduler();
  private readonly forgottenListeners = new Set<(mapId: string) => void>();

  constructor(repository: MapRepository) {
    this.repository = repository;
  }

  get(map: ChatMap): MapDocument {
    const current = this.documents.get(map.id);
    if (current) return current;
    const document = new MapDocument(map, this.repository, this.scheduler);
    this.documents.set(map.id, document);
    return document;
  }

  async forget(mapId: string): Promise<void> {
    const document = this.documents.get(mapId);
    document?.invalidate();
    try {
      await document?.flushWrites();
    } catch {
      // Deletion must still prevent later writes from recreating this map.
    }
    if (this.documents.get(mapId) === document) {
      this.documents.delete(mapId);
      for (const listener of this.forgottenListeners) listener(mapId);
    }
  }

  async invalidateAndFlush(mapId: string): Promise<void> {
    const document = this.documents.get(mapId);
    document?.invalidate();
    try {
      await document?.flushWrites();
    } catch {
      // The map must still be invalidated so no late generation can recreate it.
    }
  }

  subscribeForgotten(listener: (mapId: string) => void): () => void {
    this.forgottenListeners.add(listener);
    return () => this.forgottenListeners.delete(listener);
  }

  dispose(): void {
    for (const document of this.documents.values()) document.invalidate();
    this.documents.clear();
    this.forgottenListeners.clear();
  }
}
