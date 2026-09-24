import type { ModelProfile } from "../types";

export interface ProfileKeyResolverOptions {
  pluginEnvPath: string;
  isDesktop: boolean;
  isMobile: boolean;
  readFile?: (path: string) => Promise<string | null>;
}

/** Resolve a profile key using the documented direct → plugin → vault → desktop order. */
export async function resolveProfileApiKey(
  profile: ModelProfile,
  options: ProfileKeyResolverOptions,
): Promise<string> {
  const directKey = profile.apiKey.trim();
  if (directKey) {
    return directKey;
  }

  const envName = profile.apiKeyEnvVar?.trim() || "OPENAI_API_KEY";
  if (options.readFile) {
    const pluginContent = await safeRead(options.readFile, options.pluginEnvPath);
    const pluginKey = pluginContent ? parseDotEnv(pluginContent)[envName]?.trim() : undefined;
    if (pluginKey) {
      return pluginKey;
    }

    const vaultContent = await safeRead(options.readFile, ".env");
    const vaultKey = vaultContent ? parseDotEnv(vaultContent)[envName]?.trim() : undefined;
    if (vaultKey) {
      return vaultKey;
    }
  }

  if (options.isDesktop && !options.isMobile) {
    const processLike = (globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }).process;
    const processKey = processLike?.env?.[envName]?.trim();
    if (processKey) {
      return processKey;
    }
  }

  return "";
}

export function parseDotEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment) {
      continue;
    }

    let value = assignment[2]?.trim() ?? "";
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0];
      const closingQuoteIndex = value.indexOf(quote ?? "", 1);
      if (closingQuoteIndex >= 0) {
        value = value.slice(1, closingQuoteIndex);
      }
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    result[assignment[1] ?? ""] = value;
  }
  return result;
}

async function safeRead(readFile: (path: string) => Promise<string | null>, path: string): Promise<string | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}
