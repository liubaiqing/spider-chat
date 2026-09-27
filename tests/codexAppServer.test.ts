import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexRpc } from "../src/ai/codexRpc";
import { codexConversation, readCodexModels, streamCodexTurn } from "../src/ai/codexAppServer";
import { createMessage } from "../src/domain/chatMap";
import { getMissingAiConfiguration, normalizeSettings, resolveThinkingStyle } from "../src/settingsDefaults";
import { resolveProfileApiKey } from "../src/ai/profileKeys";
import type { ModelProfile } from "../src/types";

const profile: ModelProfile = { id: "codex", alias: "ChatGPT", provider: "codex-app-server", model: "model-from-codex", baseUrl: "", apiKey: "", reasoningEffort: "high" };
const clients: CodexRpc[] = [];
afterEach(() => { clients.splice(0).forEach((client) => client.dispose()); vi.useRealTimers(); });

function server(respond: (message: any, send: (message: any) => void) => void) {
  const messages: any[] = [];
  const process = new EventEmitter() as ChildProcessWithoutNullStreams;
  Object.assign(process, { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
  const send = (message: any) => process.stdout.emit("data", JSON.stringify(message) + "\n");
  Object.assign(process, { stdin: new Writable({ write(chunk, _encoding, callback) {
    const message = JSON.parse(String(chunk));
    messages.push(message);
    queueMicrotask(() => respond(message, send));
    callback();
  } }) });
  const client = new CodexRpc(process);
  clients.push(client);
  return { client, process, messages, send };
}

async function collect(stream: AsyncGenerator<string>) {
  let text = "";
  for await (const chunk of stream) text += chunk;
  return text;
}

describe("Codex app-server protocol", () => {
  it("initializes before notifying, handles fragmented UTF-8 JSON and closes pending requests", async () => {
    const { client, process, messages } = server((message, send) => {
      if (message.method === "initialize") send({ id: message.id, result: {} });
    });
    await client.initialize();
    expect(messages.map((message) => message.method)).toEqual(["initialize", "initialized"]);
    const pending = client.request("test", {});
    const response = JSON.stringify({ id: 2, result: { text: "中文" } }) + "\n";
    process.stdout.emit("data", response.slice(0, 8));
    process.stdout.emit("data", response.slice(8));
    expect(await pending).toEqual({ text: "中文" });
    const interrupted = client.request("slow", {});
    const check = expect(interrupted).rejects.toThrow("closed");
    process.emit("exit", 1);
    await check;
    expect(process.kill).toHaveBeenCalledOnce();
  });

  it("declines approval requests without mistaking their IDs for client responses", async () => {
    const { client, send, messages } = server((message, reply) => {
      if (message.method === "test") {
        reply({ id: message.id, method: "item/commandExecution/requestApproval", params: {} });
        reply({ id: message.id, result: "correct response" });
      }
    });
    expect(await client.request("test", {})).toBe("correct response");
    expect(messages).toContainEqual({ id: 1, result: { decision: "decline" } });
    send({ id: "unknown", method: "future/tool", params: {} });
    expect(messages.at(-1)?.error.code).toBe(-32601);
  });

  it("times out requests and fails malformed protocol data", async () => {
    vi.useFakeTimers();
    const { client, process } = server(() => {});
    const pending = expect(client.request("slow", {}, 10)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(11);
    await pending;
    const broken = expect(client.request("next", {})).rejects.toThrow("Invalid Codex");
    process.stdout.emit("data", "not-json\n");
    await broken;
  });

  it("paginates model capabilities without replacing exact effort names", async () => {
    const { client } = server((message, send) => send({ id: message.id, result: message.params.cursor
      ? { data: [{ model: "second", supportedReasoningEfforts: [{ reasoningEffort: "ultra" }] }], nextCursor: null }
      : { data: [{ model: "first", supportedReasoningEfforts: [{ reasoningEffort: "max" }] }], nextCursor: "next" } }));
    const models = await readCodexModels(client);
    expect(models.map((model) => model.model)).toEqual(["first", "second"]);
    expect(models[1]?.supportedReasoningEfforts[0]?.reasoningEffort).toBe("ultra");
  });

  it("separates summaries, filters other threads and never duplicates final text", async () => {
    const reasoning: string[] = [];
    const { client, messages } = server((message, send) => {
      if (message.method !== "turn/start") return;
      // Events may arrive before the turn/start response.
      send({ method: "item/started", params: { threadId: "thread", item: { id: "progress", type: "agentMessage", phase: "commentary" } } });
      send({ method: "item/agentMessage/delta", params: { threadId: "thread", itemId: "progress", delta: "Let me think" } });
      send({ method: "item/completed", params: { threadId: "thread", item: { id: "progress", type: "agentMessage", phase: "commentary", text: "Let me think" } } });
      send({ method: "item/agentMessage/delta", params: { threadId: "other", delta: "wrong" } });
      send({ method: "item/reasoning/summaryTextDelta", params: { threadId: "thread", itemId: "r", delta: "summary" } });
      send({ method: "item/agentMessage/delta", params: { threadId: "thread", itemId: "a", delta: "Hello" } });
      send({ id: message.id, result: { turn: { id: "turn" } } });
      send({ method: "item/completed", params: { threadId: "thread", item: { type: "agentMessage", id: "a", text: "Hello world" } } });
      send({ method: "item/completed", params: { threadId: "thread", item: { type: "reasoning", id: "r", summary: ["summary"] } } });
      send({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn", status: "completed" } } });
    });
    expect(await collect(streamCodexTurn(client, "thread", "prompt", profile, undefined, (text) => reasoning.push(text)))).toBe("Hello world");
    expect(reasoning).toEqual(["summary"]);
    expect(messages[0].params).toMatchObject({ effort: "high", summary: "detailed", model: profile.model });
  });

  it("accepts completed-only messages and reasoning", async () => {
    const reasoning: string[] = [];
    const { client } = server((message, send) => {
      send({ id: message.id, result: { turn: { id: "t" } } });
      send({ method: "item/completed", params: { threadId: "s", item: { type: "reasoning", id: "r", summary: ["one", "two"] } } });
      send({ method: "item/completed", params: { threadId: "s", item: { type: "agentMessage", id: "a", text: "answer" } } });
      send({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
    });
    expect(await collect(streamCodexTurn(client, "s", "prompt", profile, undefined, (text) => reasoning.push(text)))).toBe("answer");
    expect(reasoning).toEqual(["one\ntwo"]);
  });

  it("rejects a completed answer that contradicts already streamed text", async () => {
    const { client } = server((message, send) => {
      send({ id: message.id, result: { turn: { id: "t" } } });
      send({ method: "item/agentMessage/delta", params: { threadId: "s", itemId: "a", delta: "stale answer" } });
      send({ method: "item/completed", params: { threadId: "s", item: { type: "agentMessage", id: "a", text: "corrected answer" } } });
      send({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status: "completed" } } });
    });
    await expect(collect(streamCodexTurn(client, "s", "prompt", profile))).rejects.toThrow("changed a completed answer");
  });

  it.each(["failed", "interrupted"])("rejects %s turns instead of saving a successful answer", async (status) => {
    const { client } = server((message, send) => {
      send({ id: message.id, result: { turn: { id: "t" } } });
      send({ method: "turn/completed", params: { threadId: "s", turn: { id: "t", status, error: { message: "stopped" } } } });
    });
    await expect(collect(streamCodexTurn(client, "s", "prompt", profile))).rejects.toThrow("stopped");
  });

  it("interrupts cancelled turns and stops waiting on connection failure", async () => {
    const controller = new AbortController();
    const { client, send, messages } = server((message, reply) => {
      if (message.method === "turn/start") reply({ id: message.id, result: { turn: { id: "t" } } });
      else reply({ id: message.id, result: {} });
    });
    const iterator = streamCodexTurn(client, "s", "prompt", profile, controller.signal);
    const first = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    send({ method: "item/agentMessage/delta", params: { threadId: "s", itemId: "a", delta: "partial" } });
    expect((await first).value).toBe("partial");
    const next = iterator.next();
    const rejected = expect(next).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(messages.some((message) => message.method === "turn/interrupt")).toBe(true);
    const waiting = collect(streamCodexTurn(client, "s", "prompt", profile));
    const closed = expect(waiting).rejects.toThrow("closed");
    await new Promise((resolve) => setTimeout(resolve, 0));
    client.dispose(new Error("closed"));
    await closed;
  });

  it("times out a turn without a completion event", async () => {
    vi.useFakeTimers();
    const { client } = server((message, send) => send({ id: message.id, result: { turn: { id: "t" } } }));
    const checked = expect(collect(streamCodexTurn(client, "s", "prompt", profile, undefined, undefined, 20))).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(21);
    await checked;
  });
});

describe("ChatGPT profiles and context", () => {
  it("uses Codex credentials, keeps settings, and does not load API secrets", async () => {
    const settings = normalizeSettings({ models: [profile], defaultModelProfileId: profile.id });
    expect(settings.models?.[0]).toMatchObject(profile);
    expect(getMissingAiConfiguration(settings)).toBeNull();
    expect(resolveThinkingStyle(profile)).toBe("none");
    const readFile = vi.fn();
    expect(await resolveProfileApiKey({ ...profile, apiKey: "unused" }, { pluginEnvPath: ".env", isDesktop: true, isMobile: false, readFile })).toBe("");
    expect(readFile).not.toHaveBeenCalled();
  });

  it("sends only supplied context, with no stored reasoning or credentials", () => {
    const result = codexConversation([
      createMessage("system", "Answer in Chinese."),
      createMessage("user", "parent question"),
      { ...createMessage("assistant", "parent answer"), reasoning: "private reasoning" },
      createMessage("user", "branch question"),
    ]);
    expect(result.instructions).toContain("Answer in Chinese.");
    expect(result.input).toContain('"role":"assistant","content":"parent answer"');
    expect(result.input).toContain("User request:\nbranch question");
    expect(JSON.stringify(result)).not.toContain("private reasoning");
    expect(codexConversation([createMessage("user", "fresh branch")]).input).not.toContain("parent answer");
  });
});
