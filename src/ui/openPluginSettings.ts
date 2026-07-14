import type { App } from "obsidian";

interface SettingsNavigation {
  open(): void;
  openTabById(id: string): void;
}

type AppWithSettings = App & { setting?: SettingsNavigation };

export function openPluginSettings(app: App, pluginId: string): boolean {
  const settings = (app as AppWithSettings).setting;
  if (!settings) {
    return false;
  }
  settings.open();
  settings.openTabById(pluginId);
  return true;
}
