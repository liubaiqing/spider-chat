import { Platform } from "obsidian";
import type { ChatMessage, ModelProfile } from "../types";
import { CodexRpc } from "./codexRpc";

export interface CodexModel {
  model: string;
  displayName: string;
  supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
  defaultReasoningEffort?: string;
  isDefault?: boolean;
}

const active = new Set<CodexRpc>();
export function disposeCodexConnections(): void {
  for (const client of active) client.dispose();
  active.clear();
}

/** Load Node only on desktop, leaving API profiles and archives usable on mobile. */
async function connect(profile: ModelProfile, signal?: AbortSignal): Promise<{ client: CodexRpc; cwd: string; close: () => void }> {
  if (!Platform.isDesktop) throw new Error("ChatGPT / Codex requires Obsidian desktop. / 此连接仅支持桌面版 Obsidian。");
  signal?.throwIfAborted();
  const { spawn } = require("child_process") as typeof import("child_process");
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const executable = resolveCodexExecutable(profile.codexPath);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "spider-chat-codex-"));
  const process = spawn(executable, ["app-server"], { cwd, windowsHide: true, shell: false, stdio: "pipe" });
  process.once("exit", () => { try { fs.rmdirSync(cwd); } catch { /* Keep non-empty directories. */ } });
  const client = new CodexRpc(process);
  active.add(client);
  const cancel = () => client.dispose(new DOMException("Cancelled", "AbortError"));
  signal?.addEventListener("abort", cancel, { once: true });
  const close = () => {
    signal?.removeEventListener("abort", cancel);
    active.delete(client);
    client.dispose();
    // Delete only the empty temporary directory we created; never recursively remove agent output.
    try { fs.rmdirSync(cwd); } catch { /* An in-flight process may still hold it. */ }
  };
  try {
    await client.initialize();
    signal?.throwIfAborted();
    signal?.removeEventListener("abort", cancel);
    return { client, cwd, close };
  } catch (error) { close(); throw error; }
}

export function resolveCodexExecutable(configured?: string): string {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const os = require("os") as typeof import("os");
  const windows = process.platform === "win32";
  const candidates: string[] = [];
  if (configured?.trim()) candidates.push(configured.trim());
  else {
    for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(directory.replace(/^"|"$/g, ""), windows ? "codex.exe" : "codex"));
      if (windows) candidates.push(path.join(directory, "codex.cmd"));
    }
    if (windows && process.env.LOCALAPPDATA) {
      const root = path.join(process.env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
      try {
        candidates.push(...fs.readdirSync(root).map((name) => path.join(root, name, "codex.exe"))
          .filter((file) => fs.existsSync(file)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs));
      } catch { /* Codex desktop is optional. */ }
    }
    candidates.push(path.join(os.homedir(), ".local", "bin", "codex"), "/opt/homebrew/bin/codex", "/usr/local/bin/codex");
  }
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) continue;
    if (/\.(cmd|bat|ps1)$/i.test(candidate)) {
      // Resolve npm's native binary instead of invoking a command shell with a user path.
      const modules = path.join(path.dirname(candidate), "node_modules", "@openai");
      const triple = process.arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      for (const packageName of ["codex", `codex-win32-${arch}`, path.join("codex", "node_modules", "@openai", `codex-win32-${arch}`)]) {
        const binary = path.join(modules, packageName, "vendor", triple, "codex", "codex.exe");
        if (fs.existsSync(binary)) return binary;
      }
      continue;
    }
    return candidate;
  }
  throw new Error("Codex executable not found. Install Codex CLI or enter its executable path, then run codex login. / 请安装 Codex 或填写可执行文件路径，并运行 codex login。");
}

export async function readCodexModels(client: CodexRpc): Promise<CodexModel[]> {
  const models: CodexModel[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await client.request("model/list", { cursor, limit: 100 });
    for (const item of page.data ?? []) {
      if (typeof item.model === "string") models.push(item as CodexModel);
    }
    cursor = page.nextCursor ?? null;
    if (cursor && seen.has(cursor)) throw new Error("Codex returned a repeated model-list cursor.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return models;
}

export async function listCodexModels(profile: ModelProfile): Promise<CodexModel[]> {
  const connection = await connect(profile);
  try { return await readCodexModels(connection.client); }
  finally { connection.close(); }
}

async function checkAccount(client: CodexRpc): Promise<void> {
  const status = await client.request("account/read", { refreshToken: false });
  if (!status.account || status.account.type !== "chatgpt") {
    throw new Error("Sign in with your ChatGPT account using codex login, then retry. / 请先运行 codex login 登录 ChatGPT 账号。");
  }
}

export async function testCodexConnection(profile: ModelProfile, signal?: AbortSignal): Promise<void> {
  const connection = await connect(profile, signal);
  const cancel = () => connection.client.dispose(new DOMException("Cancelled", "AbortError"));
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    signal?.throwIfAborted();
    await checkAccount(connection.client);
    const models = await readCodexModels(connection.client);
    if (!models.some((entry) => entry.model === profile.model)) {
      throw new Error("The selected model is not in your Codex model list. Refresh models and choose an available model. / 请刷新并选择可用模型。");
    }
  } finally { signal?.removeEventListener("abort", cancel); connection.close(); }
}

export function codexConversation(messages: ChatMessage[]): { instructions: string; input: string } {
  const conversation = messages.filter((message) => message.role !== "system");
  const last = conversation.at(-1);
  // A fresh thread per request ensures edits, retries and context-mode changes cannot
  // silently reuse history from a different branch. Only budgeted visible text is sent.
  const history = last?.role === "user" ? conversation.slice(0, -1) : conversation;
  return {
    instructions: ["You are a conversational learning assistant inside Spider Chat. Answer the user's question using the supplied conversation. Do not run tools, inspect local files or modify the workspace.",
      ...messages.filter((message) => message.role === "system").map((message) => message.content)].join("\n\n"),
    input: [history.length ? `Conversation history (JSON):\n${JSON.stringify(history.map(({ role, content }) => ({ role, content })))}` : "",
      last?.role === "user" ? `User request:\n${last.content}` : "Respond to the supplied conversation following the instructions."].filter(Boolean).join("\n\n"),
  };
}

/** Consume app-server events, preserving cancellation, terminal errors and completed-only replies. */
export async function* streamCodexTurn(
  client: CodexRpc, threadId: string, input: string, profile: ModelProfile,
  signal?: AbortSignal, onReasoning?: (text: string) => void, timeoutMs = 600_000,
): AsyncGenerator<string> {
  let finished = false;
  let failure: Error | undefined;
  let turnId: string | undefined;
  let wake: (() => void) | undefined;
  const queue: string[] = [];
  const textByItem = new Map<string, string>();
  const reasoningByItem = new Set<string>();
  const commentaryItems = new Set<string>();
  const emit = (text: string) => { if (text) { queue.push(text); wake?.(); } };
  const fail = (error: Error) => { failure = error; finished = true; wake?.(); };
  const unsubscribe = client.onNotification((method, params) => {
    if (finished || params?.threadId !== threadId || (turnId && params.turnId && params.turnId !== turnId)) return;
    if (method === "item/started" && params.item?.type === "agentMessage" && params.item.phase === "commentary") {
      commentaryItems.add(params.item.id);
    } else if (method === "item/agentMessage/delta" && typeof params.delta === "string" && !commentaryItems.has(params.itemId)) {
      textByItem.set(params.itemId, (textByItem.get(params.itemId) ?? "") + params.delta);
      emit(params.delta);
    } else if (method === "item/reasoning/summaryTextDelta" && typeof params.delta === "string") {
      reasoningByItem.add(params.itemId);
      onReasoning?.(params.delta);
    } else if (method === "item/completed") {
      const item = params.item;
      if (item?.type === "agentMessage" && typeof item.text === "string" && item.phase !== "commentary" && !commentaryItems.has(item.id)) {
        const prior = textByItem.get(item.id) ?? "";
        // The provider's completed item is authoritative. This append-only stream
        // cannot replace already emitted text, so fail instead of saving a stale answer.
        if (!item.text.startsWith(prior)) {
          fail(new Error("Codex changed a completed answer after streaming. Retry this reply."));
          return;
        }
        emit(item.text.slice(prior.length));
        textByItem.set(item.id, item.text);
      } else if (item?.type === "reasoning" && !reasoningByItem.has(item.id)) {
        if (Array.isArray(item.summary)) onReasoning?.(item.summary.join("\n"));
        reasoningByItem.add(item.id);
      }
    } else if (method === "turn/completed") {
      if (turnId && params.turn?.id !== turnId) return;
      if (params.turn?.status !== "completed") fail(new Error(params.turn?.error?.message || `Codex turn ${params.turn?.status || "failed"}.`));
      else { finished = true; wake?.(); }
    } else if (method === "error" && !params.willRetry) {
      fail(new Error(params.error?.message || "Codex generation failed."));
    }
  });
  const unsubscribeClose = client.onClose(fail);
  let interrupt: Promise<unknown> | undefined;
  const cancel = () => {
    fail(new DOMException("Cancelled", "AbortError"));
    if (turnId) interrupt = client.request("turn/interrupt", { threadId, turnId }, 2_000).catch(() => {});
    else client.dispose(new DOMException("Cancelled", "AbortError"));
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => fail(new Error("Codex generation timed out.")), timeoutMs);
  try {
    signal?.throwIfAborted();
    const started = await client.request("turn/start", {
      threadId, input: [{ type: "text", text: input, text_elements: [] }],
      model: profile.model, summary: "detailed",
      ...(profile.reasoningEffort ? { effort: profile.reasoningEffort } : {}),
    });
    turnId = started.turn?.id;
    if (!turnId) throw new Error("Codex did not return a turn ID.");
    while (true) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      if (queue.length) { yield queue.shift()!; continue; }
      if (finished) break;
      await new Promise<void>((resolve) => { wake = resolve; });
    }
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    unsubscribe();
    unsubscribeClose();
    await interrupt;
  }
}

export async function* streamCodex(
  messages: ChatMessage[], profile: ModelProfile, signal?: AbortSignal, onReasoning?: (text: string) => void,
): AsyncGenerator<string> {
  const connection = await connect(profile, signal);
  const cancelSetup = () => connection.client.dispose(new DOMException("Cancelled", "AbortError"));
  signal?.addEventListener("abort", cancelSetup, { once: true });
  try {
    signal?.throwIfAborted();
    await checkAccount(connection.client);
    const { instructions, input } = codexConversation(messages);
    const threadParams = {
      model: profile.model, cwd: connection.cwd, ephemeral: true,
      approvalPolicy: "never", developerInstructions: instructions,
    };
    let started: { thread?: { id?: string } };
    try {
      started = await connection.client.request("thread/start", { ...threadParams, sandbox: "read-only" });
    } catch (error) {
      // Older app-server builds use CLI-style `read-only`; newer protocol builds
      // document `readOnly`. Retry only when the server rejects that exact variant.
      if (!(error instanceof Error) || !/unknown variant [`']read-only[`']/.test(error.message)) throw error;
      started = await connection.client.request("thread/start", { ...threadParams, sandbox: "readOnly" });
    }
    const threadId = started.thread?.id;
    if (!threadId) throw new Error("Codex did not return a thread ID.");
    signal?.removeEventListener("abort", cancelSetup);
    let answer = "";
    for await (const text of streamCodexTurn(connection.client, threadId, input, profile, signal, onReasoning)) {
      answer += text;
      yield text;
    }
    if (!answer.trim()) throw new Error("Codex returned no answer. / Codex 未返回回答。");
  } finally { signal?.removeEventListener("abort", cancelSetup); connection.close(); }
}
