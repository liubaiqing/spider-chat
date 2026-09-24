import { describe, expect, it } from "vitest";
import { createMessage, createNode, createRootMap, addChildNode, appendMessage, updateNode } from "../src/domain/chatMap";
import { buildContextMessages } from "../src/ai/contextBuilder";
import { parseDotEnv, resolveProfileApiKey } from "../src/ai/profileKeys";
import { createDefaultSettings, normalizeSettings } from "../src/settingsDefaults";

describe("model profile settings", () => {
  it("migrates the old single-model settings into a default profile", () => {
    const settings = normalizeSettings({
      language: "en",
      apiBaseUrl: "https://example.test/v1/chat/completions/",
      apiKey: "legacy-key",
      model: "legacy-model",
    });

    expect(settings.models).toHaveLength(1);
    expect(settings.defaultModelProfileId).toBe("default");
    expect(settings.models?.[0]).toMatchObject({
      id: "default",
      model: "legacy-model",
      baseUrl: "https://example.test/v1",
      apiKey: "legacy-key",
    });
    expect(settings.contextMode).toBe("parent");
    expect(settings.maxConcurrentGenerations).toBe(3);
  });

  it("keeps explicit profile values and derives legacy context modes", () => {
    const settings = normalizeSettings({
      ...createDefaultSettings("en"),
      models: [{ id: "reasoning", alias: "Reasoning", model: "o3", baseUrl: "https://example.test/v1", apiKey: "" }],
      defaultModelProfileId: "reasoning",
      includeParentContext: false,
      includeFullContext: true,
      contextMode: undefined,
    });

    expect(settings.models?.[0]?.model).toBe("o3");
    expect(settings.defaultModelProfileId).toBe("reasoning");
    expect(settings.contextMode).toBe("whole");
  });
});

describe("profile API key resolution", () => {
  const profile = {
    id: "env-profile",
    alias: "Environment",
    model: "test-model",
    baseUrl: "https://example.test/v1",
    apiKey: "",
    apiKeyEnvVar: "SPIDER_PROFILE_TEST_KEY",
  };

  it("parses dotenv assignments and uses the plugin file before the vault file", async () => {
    expect(parseDotEnv("# comment\nexport SPIDER_PROFILE_TEST_KEY='plugin-key' # note\nIGNORED")).toEqual({
      SPIDER_PROFILE_TEST_KEY: "plugin-key",
    });

    const result = await resolveProfileApiKey(profile, {
      pluginEnvPath: ".obsidian/plugins/spider/.env",
      isDesktop: true,
      isMobile: false,
      readFile: async (path) => path.endsWith("plugins/spider/.env")
        ? "SPIDER_PROFILE_TEST_KEY=plugin-key"
        : "SPIDER_PROFILE_TEST_KEY=vault-key",
    });
    expect(result).toBe("plugin-key");
  });

  it("falls through to the vault file and desktop process environment, but blocks process env on mobile", async () => {
    process.env.SPIDER_PROFILE_TEST_KEY = "process-key";
    try {
      const vault = await resolveProfileApiKey(profile, {
        pluginEnvPath: "plugins/spider/.env",
        isDesktop: false,
        isMobile: true,
        readFile: async (path) => path === ".env" ? "SPIDER_PROFILE_TEST_KEY=vault-key" : null,
      });
      const desktop = await resolveProfileApiKey(profile, {
        pluginEnvPath: "plugins/spider/.env",
        isDesktop: true,
        isMobile: false,
        readFile: async () => null,
      });
      const mobile = await resolveProfileApiKey(profile, {
        pluginEnvPath: "plugins/spider/.env",
        isDesktop: false,
        isMobile: true,
        readFile: async () => null,
      });

      expect(vault).toBe("vault-key");
      expect(desktop).toBe("process-key");
      expect(mobile).toBe("");
    } finally {
      delete process.env.SPIDER_PROFILE_TEST_KEY;
    }
  });

  it("prefers the profile key over every external source", async () => {
    const result = await resolveProfileApiKey({ ...profile, apiKey: "direct-key" }, {
      pluginEnvPath: "plugins/spider/.env",
      isDesktop: true,
      isMobile: false,
      readFile: async () => "SPIDER_PROFILE_TEST_KEY=file-key",
    });
    expect(result).toBe("direct-key");
  });
});

describe("context builder", () => {
  it("preserves compact parent context by default", () => {
    const root = createRootMap("Context");
    const parentWithSummary = updateNode(root, root.rootNodeId, { summary: "The parent summary." });
    const childResult = addChildNode(parentWithSummary, root.rootNodeId, { anchorText: "selected phrase" });
    const settings = createDefaultSettings("en");

    const contexts = buildContextMessages(childResult.map, childResult.child.id, "parent", settings);
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.content).toContain("Parent topic:");
    expect(contexts[0]?.content).toContain("The parent summary.");
    expect(contexts[0]?.content).toContain("selected phrase");
  });

  it("compresses older ancestors and retains recent ancestor turns", () => {
    let map = createRootMap("Context");
    map = updateNode(map, map.rootNodeId, { summary: "Root summary." });
    map = appendMessage(map, map.rootNodeId, createMessage("user", "Old root question"));
    const first = addChildNode(map, map.rootNodeId, { title: "Middle topic" });
    map = appendMessage(first.map, first.child.id, createMessage("user", "Middle question"));
    const second = addChildNode(map, first.child.id, { title: "Current topic" });
    const settings = { ...createDefaultSettings("en"), contextRecentFull: 1 };

    const contexts = buildContextMessages(second.map, second.child.id, "ancestors", settings);
    expect(contexts.some((message) => message.content.includes("Compressed ancestor: Root question"))).toBe(true);
    expect(contexts.some((message) => message.content.includes("Root summary."))).toBe(true);
    expect(contexts.some((message) => message.content.includes("Recent ancestor: Middle topic"))).toBe(true);
    expect(contexts.some((message) => message.content === "Middle question")).toBe(true);
  });

  it("supports none and legacy full-map modes", () => {
    const root = createRootMap("Context");
    const withRootMessage = appendMessage(root, root.rootNodeId, createMessage("user", "Root history"));
    const child = addChildNode(withRootMessage, root.rootNodeId, { title: "Current" });
    const settings = { ...createDefaultSettings("en"), contextMode: undefined, includeParentContext: false, includeFullContext: true };

    expect(buildContextMessages(child.map, child.child.id, "none", settings)).toEqual([]);
    const legacy = buildContextMessages(child.map, child.child.id, undefined, settings);
    expect(legacy.some((message) => message.content.includes("Node: Root question"))).toBe(true);
    expect(legacy.some((message) => message.content === "Root history")).toBe(true);
  });
});
