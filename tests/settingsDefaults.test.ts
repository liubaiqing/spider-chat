import { describe, expect, it } from "vitest";
import { createDefaultSettings, detectThinkingStyle, getMissingAiConfiguration, normalizeSettings, resolveAppLanguage, resolveThinkingStyle } from "../src/settingsDefaults";
import type { ModelProfile } from "../src/types";

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return { id: "p", alias: "P", model: "m", baseUrl: "https://api.deepseek.com/v1", apiKey: "k", ...overrides };
}

describe("settings defaults", () => {
  it("follows the Obsidian locale and falls back to English", () => {
    expect(resolveAppLanguage("zh-CN")).toBe("zh-CN");
    expect(resolveAppLanguage("zh-TW")).toBe("zh-CN");
    expect(resolveAppLanguage("en-GB")).toBe("en");
    expect(resolveAppLanguage("de")).toBe("en");
    expect(createDefaultSettings("en-US").language).toBe("en");
  });

  it("identifies the first missing AI configuration field", () => {
    const configured = createDefaultSettings("en");
    configured.apiKey = "test-key";

    expect(getMissingAiConfiguration(configured)).toBeNull();
    expect(getMissingAiConfiguration({ ...configured, apiBaseUrl: "" })).toBe("apiBaseUrl");
    expect(getMissingAiConfiguration({ ...configured, apiKey: "" })).toBe("apiKey");
    expect(getMissingAiConfiguration({ ...configured, model: "" })).toBe("model");
  });

  it("detects the thinking switch from the endpoint host", () => {
    expect(detectThinkingStyle("https://api.deepseek.com/v1")).toBe("thinking");
    expect(detectThinkingStyle("https://ark.cn-beijing.volces.com/api/v3")).toBe("thinking");
    expect(detectThinkingStyle("https://dashscope.aliyuncs.com/compatible-mode/v1")).toBe("enable_thinking");
    expect(detectThinkingStyle("https://api.siliconflow.cn/v1")).toBe("enable_thinking");
    expect(detectThinkingStyle("https://openrouter.ai/api/v1")).toBe("reasoning");
    // Unknown or unparsable endpoints must stay silent: strict servers reject extra fields.
    expect(detectThinkingStyle("https://api.openai.com/v1")).toBe("none");
    expect(detectThinkingStyle("")).toBe("none");
    expect(detectThinkingStyle("not a url")).toBe("none");
  });

  it("lets an explicit profile choice override endpoint detection", () => {
    expect(resolveThinkingStyle(profile())).toBe("thinking");
    expect(resolveThinkingStyle(profile({ thinkingParamStyle: "none" }))).toBe("none");
    expect(resolveThinkingStyle(profile({ baseUrl: "https://api.openai.com/v1", thinkingParamStyle: "enable_thinking" }))).toBe("enable_thinking");
    expect(resolveThinkingStyle(profile({ thinkingParamStyle: "auto" }))).toBe("thinking");
    expect(resolveThinkingStyle(undefined)).toBe("none");
  });

  it("ignores invalid saved reading locations", () => {
    const normalized = normalizeSettings({
      lastReadLocations: {
        good: { nodeId: "node-1", scrollTop: 123 },
        bad: { nodeId: "node-2", scrollTop: -Infinity },
      },
    });
    expect(normalized.lastReadLocations).toEqual({ good: { nodeId: "node-1", scrollTop: 123 } });
  });
});
