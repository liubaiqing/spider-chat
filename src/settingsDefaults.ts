import type { AppLanguage, BranchChatMapSettings, ContextMode, ModelProfile, ThinkingParamStyle } from "./types";
import { DEFAULT_EXPORT_DIR } from "./constants";

export type MissingAiConfiguration = "apiBaseUrl" | "apiKey" | "model";

/**
 * Endpoints whose OpenAI-compatible thinking switch is known. Everything else stays
 * on "none", because a strict server (OpenAI itself, for one) rejects unknown
 * request fields instead of ignoring them.
 */
const THINKING_STYLE_HOSTS: ReadonlyArray<{ host: RegExp; style: ThinkingParamStyle }> = [
  { host: /(^|\.)deepseek\.com$/i, style: "thinking" },
  { host: /(^|\.)volces\.com$/i, style: "thinking" },
  { host: /(^|\.)aliyuncs\.com$/i, style: "enable_thinking" },
  { host: /(^|\.)siliconflow\.(com|cn)$/i, style: "enable_thinking" },
  { host: /(^|\.)openrouter\.ai$/i, style: "reasoning" },
];

/** Pick a thinking switch from the endpoint host, or "none" when it is unknown. */
export function detectThinkingStyle(baseUrl: string): ThinkingParamStyle {
  let host = "";
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return "none";
  }
  return THINKING_STYLE_HOSTS.find((entry) => entry.host.test(host))?.style ?? "none";
}

/** Resolve the effective switch: an explicit profile choice wins over detection. */
export function resolveThinkingStyle(profile?: ModelProfile | null): ThinkingParamStyle {
  const configured = profile?.thinkingParamStyle;
  if (configured && configured !== "auto") {
    return configured;
  }
  return detectThinkingStyle(profile?.baseUrl ?? "");
}

export const DEFAULT_MODEL_PROFILE_ID = "default";

export function resolveAppLanguage(locale: string): AppLanguage {
  return locale.trim().toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function createDefaultModelProfile(): ModelProfile {
  return {
    id: DEFAULT_MODEL_PROFILE_ID,
    alias: "Default",
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
  };
}

export function createDefaultSettings(locale: string): BranchChatMapSettings {
  const defaultProfile = createDefaultModelProfile();
  return {
    language: resolveAppLanguage(locale),
    apiBaseUrl: defaultProfile.baseUrl,
    apiKey: defaultProfile.apiKey,
    model: defaultProfile.model,
    defaultExportFolder: DEFAULT_EXPORT_DIR,
    useTabToCreateChildNodes: true,
    snapToGuides: true,
    autoSummarizeNodes: false,
    includeParentContext: true,
    includeFullContext: false,
    streamResponses: true,
    onboardingCardDismissed: false,
    models: [defaultProfile],
    defaultModelProfileId: defaultProfile.id,
    contextMode: "parent",
    contextRecentFull: 2,
    contextTruncateChars: 2400,
    maxContextChars: 12000,
    maxConcurrentGenerations: 3,
  };
}

export const DEFAULT_SETTINGS: BranchChatMapSettings = createDefaultSettings("en");

/** Normalize saved settings and migrate the previous single-model shape. */
export function normalizeSettings(
  raw: Partial<BranchChatMapSettings> | null | undefined,
  locale = "en",
): BranchChatMapSettings {
  const defaults = createDefaultSettings(locale);
  const input = raw ?? {};
  const legacyProfile: ModelProfile = {
    id: DEFAULT_MODEL_PROFILE_ID,
    alias: "Default",
    model: cleanString(input.model) || defaults.model,
    baseUrl: normalizeApiBaseUrl(cleanString(input.apiBaseUrl) || defaults.apiBaseUrl),
    apiKey: cleanString(input.apiKey),
  };

  let models = Array.isArray(input.models)
    ? input.models.filter(isModelProfile).map((profile, index) => normalizeModelProfile(profile, index, legacyProfile))
    : [];

  // A missing or empty profile list is the old one-provider settings format.
  if (models.length === 0) {
    models = [legacyProfile];
  }

  let defaultModelProfileId = cleanString(input.defaultModelProfileId);
  if (!defaultModelProfileId || !models.some((profile) => profile.id === defaultModelProfileId)) {
    defaultModelProfileId = models[0]?.id ?? DEFAULT_MODEL_PROFILE_ID;
  }

  const defaultProfile = models.find((profile) => profile.id === defaultModelProfileId) ?? legacyProfile;
  const contextMode = isContextMode(input.contextMode)
    ? input.contextMode
    : input.includeFullContext
      ? "whole"
      : input.includeParentContext === false
        ? "none"
        : "parent";

  return {
    ...defaults,
    ...input,
    apiBaseUrl: defaultProfile.baseUrl,
    apiKey: defaultProfile.apiKey,
    model: defaultProfile.model,
    models,
    defaultModelProfileId,
    contextMode,
    contextRecentFull: nonNegativeInteger(input.contextRecentFull, defaults.contextRecentFull ?? 2),
    contextTruncateChars: positiveInteger(input.contextTruncateChars, defaults.contextTruncateChars ?? 2400),
    maxContextChars: positiveInteger(input.maxContextChars, defaults.maxContextChars ?? 12000),
    maxConcurrentGenerations: positiveInteger(input.maxConcurrentGenerations, defaults.maxConcurrentGenerations ?? 3),
    snapToGuides: typeof input.snapToGuides === "boolean" ? input.snapToGuides : defaults.snapToGuides,
    includeParentContext: contextMode !== "none",
    includeFullContext: contextMode === "whole",
  };
}

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  // Settings accept either the API root (/v1) or the full chat completion URL.
  return trimmed.replace(/\/chat\/completions\/?$/i, "").replace(/\/+$/, "");
}

export function resolveContextMode(settings: BranchChatMapSettings, override?: ContextMode): ContextMode {
  if (override && isContextMode(override)) {
    return override;
  }
  if (settings.contextMode && isContextMode(settings.contextMode)) {
    return settings.contextMode;
  }
  if (settings.includeFullContext) {
    return "whole";
  }
  return settings.includeParentContext ? "parent" : "none";
}

export function getMissingAiConfiguration(settings: BranchChatMapSettings): MissingAiConfiguration | null {
  const profile = settings.models?.find((item) => item.id === settings.defaultModelProfileId);
  const baseUrl = profile && settings.apiBaseUrl === profile.baseUrl ? profile.baseUrl : settings.apiBaseUrl;
  const apiKey = profile && settings.apiKey === profile.apiKey ? profile.apiKey : settings.apiKey;
  const model = profile && settings.model === profile.model ? profile.model : settings.model;
  if (!baseUrl.trim()) {
    return "apiBaseUrl";
  }
  if (!apiKey.trim() && !profile?.apiKeyEnvVar?.trim()) {
    return "apiKey";
  }
  if (!model.trim()) {
    return "model";
  }
  return null;
}

function normalizeModelProfile(profile: ModelProfile, index: number, legacy: ModelProfile): ModelProfile {
  const id = cleanString(profile.id) || `profile-${index + 1}`;
  return {
    ...profile,
    id,
    alias: cleanString(profile.alias) || `Profile ${index + 1}`,
    model: typeof profile.model === "string" ? profile.model.trim() : legacy.model,
    baseUrl: typeof profile.baseUrl === "string"
      ? normalizeApiBaseUrl(profile.baseUrl)
      : legacy.baseUrl,
    apiKey: cleanString(profile.apiKey),
    apiKeyEnvVar: cleanString(profile.apiKeyEnvVar) || undefined,
    systemPrompt: typeof profile.systemPrompt === "string" ? profile.systemPrompt : undefined,
    temperature: finiteNumber(profile.temperature),
    maxTokens: positiveIntegerOptional(profile.maxTokens),
    thinkingParamStyle: isThinkingParamStyle(profile.thinkingParamStyle) ? profile.thinkingParamStyle : undefined,
  };
}

function isModelProfile(value: unknown): value is ModelProfile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const profile = value as Partial<ModelProfile>;
  return typeof profile.id === "string";
}

function isThinkingParamStyle(value: unknown): value is ThinkingParamStyle {
  return value === "auto" || value === "none" || value === "thinking"
    || value === "enable_thinking" || value === "reasoning";
}

function isContextMode(value: unknown): value is ContextMode {
  return value === "none" || value === "parent" || value === "ancestors" || value === "whole";
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = positiveIntegerOptional(value);
  return parsed ?? fallback;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveIntegerOptional(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === "") {
    return undefined;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
