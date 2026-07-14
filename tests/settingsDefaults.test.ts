import { describe, expect, it } from "vitest";
import { createDefaultSettings, getMissingAiConfiguration, resolveAppLanguage } from "../src/settingsDefaults";

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
});
