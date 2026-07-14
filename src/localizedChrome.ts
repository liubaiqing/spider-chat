import type { Command } from "obsidian";
import { t, type TranslationKey } from "./i18n";
import type { AppLanguage } from "./types";

export interface LocalizedCommand {
  command: Pick<Command, "name">;
  key: TranslationKey;
}

export function updateLocalizedChrome(
  language: AppLanguage,
  commands: LocalizedCommand[],
  ribbonEl: HTMLElement | null,
): void {
  for (const { command, key } of commands) {
    command.name = t(language, key);
  }

  if (ribbonEl) {
    const label = t(language, "openMap");
    ribbonEl.setAttribute("aria-label", label);
    ribbonEl.setAttribute("title", label);
  }
}
