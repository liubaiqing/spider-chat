import type { ChildProcessWithoutNullStreams } from "child_process";

type Message = { id?: number | string; method?: string; params?: any; result?: any; error?: { code?: number; message?: string } };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Newline-delimited app-server RPC. Never log protocol bodies or credentials. */
export class CodexRpc {
  private nextId = 0;
  private buffer = "";
  private pending = new Map<number, Pending>();
  private listeners = new Set<(method: string, params: any) => void>();
  private closeListeners = new Set<(error: Error) => void>();
  private closed?: Error;

  constructor(private process: ChildProcessWithoutNullStreams) {
    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk: string) => this.read(chunk));
    // Drain stderr without exposing local paths, prompts or authentication data.
    process.stderr.resume();
    process.on("error", () => this.dispose(new Error("Cannot start Codex. Install Codex CLI or set its executable path.")));
    process.on("exit", () => this.dispose(new Error("Codex connection closed. Check Codex login and executable path.")));
    process.stdin.on("error", () => this.dispose(new Error("Codex connection closed.")));
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: { name: "spider_chat", title: "Spider Chat", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.write({ method: "initialized" });
  }

  request(method: string, params: unknown, timeoutMs = 30_000): Promise<any> {
    if (this.closed) return Promise.reject(this.closed);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { this.dispose(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  onNotification(listener: (method: string, params: any) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  onClose(listener: (error: Error) => void): () => void {
    if (this.closed) listener(this.closed);
    else this.closeListeners.add(listener);
    return () => { this.closeListeners.delete(listener); };
  }

  dispose(error = new Error("Codex request cancelled.")): void {
    if (this.closed) return;
    this.closed = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of this.closeListeners) listener(error);
    this.closeListeners.clear();
    this.listeners.clear();
    this.process.stdin.end();
    this.process.kill();
  }

  private write(message: Message): void {
    if (this.closed) throw this.closed;
    this.process.stdin.write(JSON.stringify(message) + "\n");
  }

  private read(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > 8 * 1024 * 1024) {
      this.dispose(new Error("Codex sent an oversized protocol message."));
      return;
    }
    let newline: number;
    while (!this.closed && (newline = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message: Message;
      try { message = JSON.parse(line) as Message; }
      catch { this.dispose(new Error("Invalid Codex protocol response.")); return; }
      if (!message || typeof message !== "object" || Array.isArray(message)) {
        this.dispose(new Error("Invalid Codex protocol response.")); return;
      }
      if (message.id !== undefined && message.method) {
        // Spider Chat is a conversation client, not a host for native tool approvals.
        // Never approve file writes, commands, or external tool actions implicitly.
        if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(message.method)) {
          this.write({ id: message.id, result: { decision: "decline" } });
        } else {
          this.write({ id: message.id, error: { code: -32601, message: "Spider Chat does not support this interactive tool request." } });
        }
      } else if (typeof message.id === "number") {
        const pending = this.pending.get(message.id);
        if (!pending) continue;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message || "Codex request failed."));
        else pending.resolve(message.result);
      } else if (message.method) {
        try {
          for (const listener of this.listeners) listener(message.method, message.params);
        } catch (error) {
          this.dispose(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
}
