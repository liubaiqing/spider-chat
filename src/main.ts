import { getLanguage, Platform, Plugin, WorkspaceLeaf, type Command, type Editor } from "obsidian";
import { BranchChatMapSettingTab } from "./settings";
import { DEFAULT_SETTINGS, normalizeSettings, normalizeApiBaseUrl } from "./settingsDefaults";
import type { BranchChatMapSettings, ModelProfile } from "./types";
import {
  VIEW_TYPE_BRANCH_CHAT_MAP,
  VIEW_TYPE_BRANCH_CHAT_MAP_CHAT,
} from "./constants";
import { BranchChatMapChatView, BranchChatMapView } from "./view";
import { t, type TranslationKey } from "./i18n";
import { BranchChatMapStore } from "./state/branchChatMapStore";
import { PluginSettingsStore } from "./state/pluginSettingsStore";
import { MapSwitcherModal } from "./ui/MapSwitcherModal";
import { createRootMap } from "./domain/chatMap";
import { applyDagreLayout } from "./domain/layout";
import { updateLocalizedChrome, type LocalizedCommand } from "./localizedChrome";
import { resolveProfileApiKey } from "./ai/profileKeys";
import { openExportPicker } from "./ui/ExportFormatModal";
import type { ViewState } from "./state/viewState";

export default class BranchChatMapPlugin extends Plugin {
  settings: BranchChatMapSettings = DEFAULT_SETTINGS;
  store!: BranchChatMapStore;
  private readonly settingsStore = new PluginSettingsStore();
  private readonly localizedCommands: LocalizedCommand[] = [];
  private ribbonEl: HTMLElement | null = null;

  subscribeSettings = this.settingsStore.subscribe;
  getSettingsRevision = this.settingsStore.getRevision;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.store = new BranchChatMapStore(this);

    this.registerView(
      VIEW_TYPE_BRANCH_CHAT_MAP,
      (leaf: WorkspaceLeaf) => new BranchChatMapView(leaf, this),
    );
    this.registerView(
      VIEW_TYPE_BRANCH_CHAT_MAP_CHAT,
      (leaf: WorkspaceLeaf) => new BranchChatMapChatView(leaf, this),
    );

    this.ribbonEl = this.addRibbonIcon("network", t(this.settings.language, "openMap"), () => {
      void this.activateView();
    });

    this.addLocalizedCommand("openMap", {
      id: "open-map",
      callback: () => {
        void this.activateView();
      },
    });

    this.addLocalizedCommand("createChildCommand", {
      id: "create-child-node",
      callback: () => {
        const vs = this.store.getActiveSession();
        if (vs) {
          vs.createChild();
        } else {
          void this.activateView().then(() => this.store.getActiveSession()?.createChild());
        }
      },
    });

    this.addLocalizedCommand("createChildFromSelectionCommand", {
      id: "create-child-node-from-selection",
      editorCallback: (editor: Editor) => {
        const selection = editor.getSelection().trim();
        const vs = this.store.getActiveSession();
        if (vs) {
          vs.createChild(selection || undefined);
        } else {
          void this.activateView().then(() => this.store.getActiveSession()?.createChild(selection || undefined));
        }
      },
    });

    this.addLocalizedCommand("goToParentCommand", {
      id: "go-to-parent-node",
      callback: () => {
        this.store.getActiveSession()?.goToParent();
      },
    });

    this.addLocalizedCommand("summarizeCurrentNodeCommand", {
      id: "summarize-current-node",
      callback: () => {
        void this.store.getActiveSession()?.summarizeCurrentNode();
      },
    });

    this.addLocalizedCommand("exportMapCommand", {
      id: "export-current-map",
      callback: () => {
        const session = this.store.getActiveSession();
        if (session) {
          this.openExportPicker(session);
          return;
        }
        void this.activateView().then(() => {
          const active = this.store.getActiveSession();
          if (active) this.openExportPicker(active);
        });
      },
    });

    this.addLocalizedCommand("newMapCommand", {
      id: "new-map",
      callback: () => {
        void this.newSpiderView();
      },
    });

    this.addLocalizedCommand("switchMapCommand", {
      id: "switch-map",
      callback: () => {
        const modal = new MapSwitcherModal(this);
        void modal.loadMaps().then(() => modal.open());
      },
    });

    this.addSettingTab(new BranchChatMapSettingTab(this.app, this));
    this.updateLocalizedChrome();

    this.app.workspace.onLayoutReady(() => {
      void this.ensureMainTabView(false).then((leaf) => {
        if (leaf) {
          if (leaf.view instanceof BranchChatMapView) leaf.view.activateSession();
          void this.ensureChatSidebarView(true);
        }
      });
    });
  }

  onunload(): void {
    this.store.dispose();
  }

  async loadSettings(): Promise<void> {
    const saved = (await this.loadData()) as Partial<BranchChatMapSettings> | null;
    this.settings = normalizeSettings(saved, getLanguage());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async updateSettings(patch: Partial<BranchChatMapSettings>): Promise<void> {
    const previous = this.settings;
    let next: Partial<BranchChatMapSettings> = { ...previous, ...patch };
    const legacyAiFieldsChanged = "apiBaseUrl" in patch || "apiKey" in patch || "model" in patch;
    if (legacyAiFieldsChanged && !patch.models) {
      const profiles = previous.models ?? [];
      const defaultId = previous.defaultModelProfileId;
      const profileIndex = profiles.findIndex((profile) => profile.id === defaultId);
      if (profileIndex >= 0) {
        const updated = profiles.map((profile, index) => index === profileIndex
          ? {
              ...profile,
              baseUrl: "apiBaseUrl" in patch ? normalizeApiBaseUrl(patch.apiBaseUrl ?? "") : profile.baseUrl,
              apiKey: "apiKey" in patch ? patch.apiKey ?? "" : profile.apiKey,
              model: "model" in patch ? patch.model ?? "" : profile.model,
            }
          : profile);
        next = { ...next, models: updated };
      }
    }
    this.settings = normalizeSettings(next, next.language ?? previous.language);
    try {
      await this.saveSettings();
    } catch (error: unknown) {
      this.settings = previous;
      throw error;
    }
    this.updateLocalizedChrome();
    this.settingsStore.notify();
  }

  /** Select a profile, falling back to the configured default when its id is missing. */
  async resolveProfileForRequest(id?: string): Promise<{ profile: ModelProfile; fellBack: boolean }> {
    const profiles = this.settings.models ?? [];
    const requestedId = id?.trim();
    const requested = requestedId ? profiles.find((profile) => profile.id === requestedId) : undefined;
    const defaultProfile = profiles.find((profile) => profile.id === this.settings.defaultModelProfileId);
    const profile = defaultProfile ?? profiles[0] ?? {
      id: "default",
      alias: "Default",
      model: this.settings.model,
      baseUrl: this.settings.apiBaseUrl,
      apiKey: this.settings.apiKey,
    };
    const selected = requested ?? profile;
    const resolvedSelected = { ...selected, apiKey: await this.resolveProfileApiKey(selected) };
    const invalidRequested = Boolean(requested && requested.id !== profile.id && !isProfileReady(resolvedSelected));
    const unknownRequested = Boolean(requestedId && !requested);

    if ((invalidRequested || unknownRequested) && requested?.id !== profile.id) {
      return {
        profile: { ...profile, apiKey: await this.resolveProfileApiKey(profile) },
        fellBack: true,
      };
    }

    return {
      profile: resolvedSelected,
      fellBack: false,
    };
  }

  private async resolveProfileApiKey(profile: ModelProfile): Promise<string> {
    const adapter = this.app.vault?.adapter;
    const pluginDir = (this.manifest.dir ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
    return resolveProfileApiKey(profile, {
      pluginEnvPath: pluginDir ? `${pluginDir}/.env` : ".env",
      isDesktop: Platform.isDesktop,
      isMobile: Platform.isMobile,
      readFile: adapter ? (path) => adapter.read(path) : undefined,
    });
  }

  async activateView(): Promise<void> {
    const leaf = await this.ensureMainTabView(true);
    if (leaf) {
      await this.app.workspace.revealLeaf(leaf);
      if (leaf.view instanceof BranchChatMapView) leaf.view.activateSession();
    }
    await this.ensureChatSidebarView(true);
  }

  async newSpiderView(): Promise<void> {
    const language = this.settings.language;
    const map = applyDagreLayout(createRootMap(t(language, "defaultMapTitle"), t(language, "rootQuestionTitle")));
    await this.store.repository.saveMap(map);

    this.store.prepareSessionWithMap(map);

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_BRANCH_CHAT_MAP,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof BranchChatMapView) leaf.view.activateSession();

    await this.ensureChatSidebarView(true);
  }

  private async ensureMainTabView(openIfMissing: boolean): Promise<WorkspaceLeaf | null> {
    const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BRANCH_CHAT_MAP);
    if (!openIfMissing && existingLeaves.length === 0) {
      return null;
    }

    const mainLeaf = existingLeaves.find((leaf) => this.isMainWorkspaceLeaf(leaf));
    if (mainLeaf) {
      return mainLeaf;
    }

    if (!openIfMissing) {
      return null;
    }

    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_BRANCH_CHAT_MAP,
      active: true,
    });
    await this.app.workspace.revealLeaf(leaf);

    return leaf;
  }

  private async ensureChatSidebarView(openIfMissing: boolean): Promise<WorkspaceLeaf | null> {
    const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_BRANCH_CHAT_MAP_CHAT);
    if (!openIfMissing && existingLeaves.length === 0) {
      return null;
    }

    const sideLeaf = existingLeaves.find((leaf) => this.isRightSidebarLeaf(leaf));
    for (const existingLeaf of existingLeaves) {
      if (existingLeaf !== sideLeaf) {
        existingLeaf.detach();
      }
    }

    if (sideLeaf) {
      this.app.workspace.rightSplit.expand();
      if (openIfMissing) {
        await this.app.workspace.revealLeaf(sideLeaf);
      }
      return sideLeaf;
    }

    const leaf = await this.app.workspace.ensureSideLeaf(VIEW_TYPE_BRANCH_CHAT_MAP_CHAT, "right", {
      active: true,
      reveal: openIfMissing,
      split: false,
    });
    this.app.workspace.rightSplit.expand();

    return leaf;
  }

  private addLocalizedCommand(key: TranslationKey, command: Omit<Command, "name">): void {
    const localizedCommand: Command = {
      ...command,
      name: t(this.settings.language, key),
    };
    // Keep our own reference because some Obsidian builds do not return the command object at runtime.
    this.addCommand(localizedCommand);
    this.localizedCommands.push({ command: localizedCommand, key });
  }

  private openExportPicker(session: ViewState): void {
    openExportPicker(this.app, this.settings.language, (format) => {
      void session.exportMapAs(format);
    });
  }

  private updateLocalizedChrome(): void {
    updateLocalizedChrome(this.settings.language, this.localizedCommands, this.ribbonEl);
  }

  private isRightSidebarLeaf(leaf: WorkspaceLeaf): boolean {
    let parent: unknown = leaf.parent;

    while (parent && typeof parent === "object") {
      if (parent === this.app.workspace.rightSplit) {
        return true;
      }

      if (parent === this.app.workspace.rootSplit || parent === this.app.workspace.leftSplit) {
        return false;
      }

      parent = (parent as { parent?: unknown }).parent;
    }

    return false;
  }

  private isMainWorkspaceLeaf(leaf: WorkspaceLeaf): boolean {
    let parent: unknown = leaf.parent;

    while (parent && typeof parent === "object") {
      if (parent === this.app.workspace.rootSplit) {
        return true;
      }

      if (parent === this.app.workspace.leftSplit || parent === this.app.workspace.rightSplit) {
        return false;
      }

      parent = (parent as { parent?: unknown }).parent;
    }

    return false;
  }
}

function isProfileReady(profile: ModelProfile): boolean {
  return Boolean(profile.baseUrl.trim() && profile.model.trim() && profile.apiKey.trim());
}
