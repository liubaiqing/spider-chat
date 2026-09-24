import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type BranchChatMapPlugin from "./main";
import { DEFAULT_EXPORT_DIR } from "./constants";
import { t } from "./i18n";
import { OpenAICompatibleProvider, type ApiTestResult } from "./ai/openAICompatibleProvider";
import { createDefaultModelProfile, normalizeApiBaseUrl } from "./settingsDefaults";
import type { ContextMode, ModelProfile, ThinkingParamStyle } from "./types";

export { DEFAULT_SETTINGS } from "./settingsDefaults";

export class BranchChatMapSettingTab extends PluginSettingTab {
  private readonly plugin: BranchChatMapPlugin;
  private readonly apiTestResults = new Map<string, ApiTestResult>();
  private readonly availableModels = new Map<string, string[]>();
  private readonly attemptedModelFetch = new Set<string>();
  private isTestingProfileId: string | null = null;
  private isLoadingModelsProfileId: string | null = null;

  constructor(app: App, plugin: BranchChatMapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    const language = this.plugin.settings.language;
    containerEl.empty();

    new Setting(containerEl).setName(t(language, "settingsTitle")).setHeading();

    new Setting(containerEl)
      .setName(t(language, "settingLanguageName"))
      .setDesc(t(language, "settingLanguageDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("zh-CN", "简体中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ language: value === "en" ? "en" : "zh-CN" });
            this.display();
          });
      });

    new Setting(containerEl)
      .setName(label(language, "模型配置", "Model profiles"))
      .setDesc(label(
        language,
        "每个节点可以选择自己的模型配置。密钥按直接填写、插件目录 .env、库目录 .env、桌面环境变量的顺序读取。",
        "Each node can use a profile. Keys are read from the profile first, then the plugin .env, vault .env, and desktop environment.",
      ))
      .setHeading();

    const profiles = this.plugin.settings.models ?? [];
    for (const profile of profiles) {
      this.renderProfile(profile, profiles.length);
    }

    new Setting(containerEl)
      .addButton((button) => {
        button.setButtonText(label(language, "添加模型配置", "Add model profile")).onClick(async () => {
          const defaultProfile = createDefaultModelProfile();
          const id = `profile-${Date.now().toString(36)}`;
          const profile: ModelProfile = {
            ...defaultProfile,
            id,
            alias: label(language, `模型 ${profiles.length + 1}`, `Profile ${profiles.length + 1}`),
            model: "",
          };
          await this.updateProfiles([...(this.plugin.settings.models ?? []), profile]);
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(label(language, "对话上下文", "Conversation context"))
      .setDesc(label(
        language,
        "控制发送给模型的图谱历史。字符上限包含配置提示词、图谱历史和当前节点消息，仅不包含固定语言提示词。",
        "Choose which map history is sent. The character limit covers profile prompts, map history, and current node messages; only the fixed language instruction is excluded.",
      ))
      .setHeading();

    new Setting(containerEl)
      .setName(label(language, "上下文范围", "Context mode"))
      .setDesc(label(
        language,
        "上级模式会压缩携带直接父节点；祖先模式会压缩较早祖先并保留最近对话；全图谱模式会携带其他节点记录。",
        "Parent sends a compact parent summary. Ancestors compress older branches and keep recent turns. Whole includes other node transcripts.",
      ))
      .addDropdown((dropdown) => {
        const current = this.plugin.settings.contextMode ?? "parent";
        dropdown
          .addOption("none", label(language, "不携带", "None"))
          .addOption("parent", label(language, "直接上级", "Parent"))
          .addOption("ancestors", label(language, "祖先节点", "Ancestors"))
          .addOption("whole", label(language, "全图谱", "Whole map"))
          .setValue(current)
          .onChange(async (value) => {
            const contextMode: ContextMode = isContextMode(value) ? value : "parent";
            await this.plugin.updateSettings({
              contextMode,
              includeParentContext: contextMode !== "none",
              includeFullContext: contextMode === "whole",
            });
          });
      });

    const contextAdvanced = containerEl.createEl("details", { cls: "spider-settings-advanced" });
    contextAdvanced.createEl("summary", { text: label(language, "上下文高级选项", "Advanced context options") });
    this.addNumberSetting(contextAdvanced, language, "最近完整祖先", "Recent full ancestors", "contextRecentFull", 2, 0, 12);
    this.addNumberSetting(contextAdvanced, language, "祖先摘要最大字符", "Ancestor summary character limit", "contextTruncateChars", 2400, 128, 20000);
    this.addNumberSetting(contextAdvanced, language, "上下文最大字符", "Maximum context characters", "maxContextChars", 12000, 256, 100000);

    new Setting(containerEl)
      .setName(t(language, "settingExportFolderName"))
      .setDesc(t(language, "settingExportFolderDesc"))
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_EXPORT_DIR)
          .setValue(this.plugin.settings.defaultExportFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ defaultExportFolder: value.trim() || DEFAULT_EXPORT_DIR });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingTabName"))
      .setDesc(t(language, "settingTabDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.useTabToCreateChildNodes)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ useTabToCreateChildNodes: value });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingStreamName"))
      .setDesc(t(language, "settingStreamDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.streamResponses)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ streamResponses: value });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingAutoSummaryName"))
      .setDesc(t(language, "settingAutoSummaryDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoSummarizeNodes)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ autoSummarizeNodes: value });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingOnboardingName"))
      .setDesc(t(language, "settingOnboardingDesc"))
      .addButton((button) => {
        button
          .setButtonText(t(language, "settingOnboardingButton"))
          .onClick(async () => {
            await this.plugin.updateSettings({ onboardingCardDismissed: false });
            window.dispatchEvent(new CustomEvent("spider-onboarding-card-change", { detail: { dismissed: false } }));
            new Notice(t(language, "settingOnboardingRestored"));
          });
      });
  }

  private renderProfile(profile: ModelProfile, profileCount: number): void {
    const language = this.plugin.settings.language;
    const isDefault = profile.id === this.plugin.settings.defaultModelProfileId;
    const heading = new Setting(this.containerEl)
      .setName(isDefault ? label(language, "默认模型配置", "Default model profile") : profile.alias || label(language, "未命名配置", "Unnamed profile"))
      .setHeading();
    if (!isDefault) {
      heading.addButton((button) => {
        button.setButtonText(label(language, "设为默认", "Make default")).onClick(async () => {
          await this.plugin.updateSettings({ defaultModelProfileId: profile.id });
          this.display();
        });
      });
    }
    if (profileCount > 1) {
      heading.addButton((button) => {
        button.setButtonText(label(language, "删除", "Remove")).onClick(async () => {
          const remaining = (this.plugin.settings.models ?? []).filter((item) => item.id !== profile.id);
          const nextDefault = profile.id === this.plugin.settings.defaultModelProfileId
            ? remaining[0]?.id
            : this.plugin.settings.defaultModelProfileId;
          await this.plugin.updateSettings({ models: remaining, defaultModelProfileId: nextDefault });
          this.apiTestResults.delete(profile.id);
          this.availableModels.delete(profile.id);
          this.display();
        });
      });
    }

    if (!isDefault) {
      this.addProfileText(profile, "alias", label(language, "名称", "Alias"), label(language, "例如：推理模型", "For example: Reasoning"));
    }
    this.addProfileText(
      profile,
      "baseUrl",
      label(language, "API 地址", "API base URL"),
      "https://api.openai.com/v1",
      label(language, "可以填写基础地址或完整的 /chat/completions 地址。", "Accepts the API root or a full /chat/completions URL."),
    );
    this.addProfileText(
      profile,
      "apiKey",
      label(language, "API Key", "API key"),
      "sk-...",
      label(language, "留空时会从环境变量读取。", "Leave blank to resolve the key from an environment variable."),
      true,
    );
    this.renderModelPicker(profile, language);

    const advanced = this.containerEl.createEl("details", { cls: "spider-settings-advanced" });
    advanced.createEl("summary", { text: label(language, "高级模型选项", "Advanced model options") });
    this.addProfileText(
      profile,
      "apiKeyEnvVar",
      label(language, "环境变量名称", "API key environment variable"),
      "OPENAI_API_KEY",
      label(language, "未填写时默认读取 OPENAI_API_KEY。", "Defaults to OPENAI_API_KEY when blank."),
      false,
      advanced,
    );

    new Setting(advanced)
      .setName(label(language, "系统提示词", "System prompt"))
      .setDesc(label(language, "会作为系统消息发送给此配置的模型。", "Sent as a system message to this profile's model."))
      .addTextArea((text) => {
        text
          .setPlaceholder(label(language, "可选", "Optional"))
          .setValue(profile.systemPrompt ?? "")
          .onChange(async (value) => this.updateProfile(profile.id, { systemPrompt: value || undefined }));
      });

    this.addProfileNumber(profile, "temperature", label(language, "温度", "Temperature"), "0–2", advanced);
    this.addProfileNumber(profile, "maxTokens", label(language, "最大输出 Token", "Maximum output tokens"), "", advanced);

    new Setting(advanced)
      .setName(t(language, "thinkingStyleLabel"))
      .setDesc(t(language, "thinkingStyleDesc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("auto", label(language, "自动（按 API 地址判断）", "Automatic (from the API address)"))
          .addOption("none", label(language, "不发送", "Send nothing"))
          .addOption("thinking", '{"thinking": {"type": "enabled|disabled"}}')
          .addOption("enable_thinking", '{"enable_thinking": true|false}')
          .addOption("reasoning", '{"reasoning": {"enabled": true|false}}')
          .setValue(profile.thinkingParamStyle ?? "auto")
          .onChange(async (value) => {
            await this.updateProfile(profile.id, {
              thinkingParamStyle: isThinkingParamStyle(value) ? value : "auto",
            });
          });
      });

    const testResult = this.apiTestResults.get(profile.id);
    const testSetting = new Setting(this.containerEl)
      .setName(label(language, "连接测试", "Connection test"))
      .setDesc(testResult ? formatApiTestResult(testResult) : label(language, "测试此配置的 API 和模型。", "Test this profile's API endpoint and model."));
    testSetting.addButton((button) => {
      const testing = this.isTestingProfileId === profile.id;
      button
        .setButtonText(testing ? t(language, "apiTesting") : t(language, "apiTest"))
        .setDisabled(testing)
        .onClick(async () => {
          this.isTestingProfileId = profile.id;
          this.apiTestResults.delete(profile.id);
          this.display();
          try {
            const resolved = await this.plugin.resolveProfileForRequest(profile.id);
            const provider = new OpenAICompatibleProvider(this.plugin.settings);
            this.apiTestResults.set(profile.id, await provider.testConnection(resolved.profile));
          } catch (error: unknown) {
            this.apiTestResults.set(profile.id, {
              ok: false,
              message: t(language, "apiTestFailed"),
              details: error instanceof Error ? error.message : String(error),
            });
          } finally {
            this.isTestingProfileId = null;
          }
          const result = this.apiTestResults.get(profile.id);
          if (result) {
            new Notice(result.message);
          }
          this.display();
        });
    });

  }

  private renderModelPicker(profile: ModelProfile, language: "zh-CN" | "en"): void {
    const setting = new Setting(this.containerEl)
      .setName(label(language, "可用模型", "Available models"))
      .setDesc(label(language, "输入以搜索；选中列表项，或输入自定义模型 ID 后按 Enter。", "Type to search; select a result, or press Enter to use a custom model ID."));
    setting.settingEl.addClass("spider-model-setting");
    const picker = setting.controlEl.createDiv({ cls: "spider-model-picker" });
    const input = picker.createEl("input", {
      cls: "spider-model-picker-input",
      type: "text",
      attr: {
        role: "combobox",
        "aria-label": label(language, "可用模型", "Available models"),
        "aria-autocomplete": "list",
        "aria-expanded": "false",
        autocomplete: "off",
        placeholder: "gpt-4o-mini",
      },
    });
    input.value = profile.model;
    const list = picker.createDiv({ cls: "spider-model-picker-list" });
    list.id = `spider-models-${profile.id.replace(/[^a-z0-9_-]/gi, "-")}`;
    list.setAttribute("role", "listbox");
    list.hidden = true;
    input.setAttribute("aria-controls", list.id);
    let savedModel = profile.model;
    let searching = false;
    let highlighted = 0;
    let matches: string[] = [];

    const close = () => {
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    };
    const select = (model: string) => {
      input.value = model;
      searching = false;
      close();
      if (model !== savedModel) {
        savedModel = model;
        void this.updateProfile(profile.id, { model });
      }
    };
    const render = () => {
      if (!input.isConnected) return;
      const models = this.availableModels.get(profile.id) ?? [];
      const query = searching ? input.value.trim().toLocaleLowerCase() : "";
      matches = models.filter((model) => model.toLocaleLowerCase().includes(query)).slice(0, 80);
      highlighted = Math.min(highlighted, Math.max(0, matches.length - 1));
      list.empty();
      if (matches.length === 0) {
        const message = this.isLoadingModelsProfileId === profile.id
          ? label(language, "正在获取模型…", "Loading models…")
          : models.length === 0
            ? label(language, "无法列出模型时，可手动输入模型 ID。", "You can enter a model ID manually if no list is available.")
            : label(language, "没有匹配的模型；按 Enter 使用输入值。", "No match; press Enter to use the typed ID.");
        list.createDiv({ cls: "spider-model-picker-empty", text: message });
      }
      matches.forEach((model, index) => {
        const item = list.createEl("button", { cls: "spider-model-picker-option", text: model, type: "button" });
        item.id = `${list.id}-option-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", String(index === highlighted));
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", () => select(model));
      });
      const active = matches[highlighted];
      if (active) input.setAttribute("aria-activedescendant", `${list.id}-option-${highlighted}`);
      else input.removeAttribute("aria-activedescendant");
    };

    const fetchModels = async () => {
      if (this.isLoadingModelsProfileId === profile.id) return;
      this.isLoadingModelsProfileId = profile.id;
      this.attemptedModelFetch.add(profile.id);
      refreshButton.disabled = true;
      refreshButton.textContent = label(language, "获取中…", "Loading…");
      render();
      try {
        const resolved = await this.plugin.resolveProfileForRequest(profile.id);
        const provider = new OpenAICompatibleProvider(this.plugin.settings);
        const models = await provider.listModels(resolved.profile);
        this.availableModels.set(profile.id, models);
        if (models.length === 0) new Notice(label(language, "服务未返回模型列表，可手动输入模型 ID。", "No models returned; you can enter an ID manually."));
      } catch (error: unknown) {
        new Notice(error instanceof Error ? error.message : String(error));
      } finally {
        this.isLoadingModelsProfileId = null;
        if (refreshButton.isConnected) {
          refreshButton.disabled = false;
          refreshButton.textContent = label(language, "刷新列表", "Refresh list");
          render();
        }
      }
    };
    const refreshButton = setting.controlEl.createEl("button", {
      cls: "spider-model-picker-refresh",
      text: label(language, "获取列表", "Load list"),
      type: "button",
    });
    refreshButton.setAttribute("aria-label", label(language, "获取或刷新模型列表", "Load or refresh model list"));
    refreshButton.addEventListener("click", () => {
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      void fetchModels();
      input.focus();
    });
    const open = () => {
      const wasClosed = list.hidden;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      if (wasClosed && !searching) {
        highlighted = Math.max(0, (this.availableModels.get(profile.id) ?? []).indexOf(savedModel));
      }
      render();
      if (!this.availableModels.has(profile.id) && !this.attemptedModelFetch.has(profile.id)) void fetchModels();
    };
    input.addEventListener("focus", open);
    input.addEventListener("click", open);
    input.addEventListener("input", () => {
      searching = true;
      highlighted = 0;
      open();
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        input.value = savedModel;
        searching = false;
        close();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        if (list.hidden) open();
        else {
          highlighted = Math.max(0, Math.min(matches.length - 1, highlighted + (event.key === "ArrowDown" ? 1 : -1)));
          render();
        }
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        const typed = input.value.trim();
        const result = !list.hidden && matches.length > 0 ? matches[highlighted] : typed;
        if (result) select(result);
        else input.value = savedModel;
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!input.isConnected || list.contains(input.ownerDocument.activeElement)) return;
        input.value = savedModel;
        searching = false;
        close();
      }, 120);
    });
  }

  private addProfileText(
    profile: ModelProfile,
    key: "alias" | "baseUrl" | "apiKey" | "apiKeyEnvVar",
    name: string,
    placeholder: string,
    desc?: string,
    password = false,
    container: HTMLElement = this.containerEl,
  ): void {
    new Setting(container)
      .setName(name)
      .setDesc(desc ?? "")
      .addText((text) => {
        if (password) {
          text.inputEl.type = "password";
        }
        text
          .setPlaceholder(placeholder)
          .setValue(profile[key] ?? "")
          .onChange(async (value) => {
            const normalized = key === "baseUrl" ? normalizeApiBaseUrl(value) : value;
            const fieldValue = key === "baseUrl" || key === "apiKey"
              ? normalized
              : normalized || undefined;
            await this.updateProfile(profile.id, {
              [key]: fieldValue,
            } as Partial<ModelProfile>);
          });
      });
  }

  private addProfileNumber(profile: ModelProfile, key: "temperature" | "maxTokens", name: string, placeholder: string, container: HTMLElement = this.containerEl): void {
    new Setting(container)
      .setName(name)
      .addText((text) => {
        text.inputEl.type = "number";
        if (key === "temperature") {
          text.inputEl.min = "0";
          text.inputEl.max = "2";
          text.inputEl.step = "0.1";
        } else {
          text.inputEl.min = "1";
          text.inputEl.step = "1";
        }
        text
          .setPlaceholder(placeholder)
          .setValue(profile[key] === undefined ? "" : String(profile[key]))
          .onChange(async (value) => {
            const parsed = value.trim() ? Number(value) : undefined;
            await this.updateProfile(profile.id, { [key]: parsed } as Partial<ModelProfile>);
          });
      });
  }

  private addNumberSetting(
    container: HTMLElement,
    language: "zh-CN" | "en",
    zhName: string,
    enName: string,
    key: "contextRecentFull" | "contextTruncateChars" | "maxContextChars",
    fallback: number,
    min: number,
    max: number,
  ): void {
    new Setting(container)
      .setName(label(language, zhName, enName))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = String(min);
        text.inputEl.max = String(max);
        text.setValue(String(this.plugin.settings[key] ?? fallback)).onChange(async (value) => {
          const parsed = Number(value);
          if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
            await this.plugin.updateSettings({ [key]: Math.floor(parsed) } as Pick<BranchChatMapPlugin["settings"], typeof key>);
          }
        });
      });
  }

  private async updateProfile(id: string, patch: Partial<ModelProfile>): Promise<void> {
    const models = (this.plugin.settings.models ?? []).map((profile) => profile.id === id ? { ...profile, ...patch } : profile);
    await this.updateProfiles(models);
  }

  private async updateProfiles(models: ModelProfile[]): Promise<void> {
    await this.plugin.updateSettings({ models });
  }
}

function formatApiTestResult(result: ApiTestResult): string {
  if (result.ok) {
    return result.message;
  }
  return result.details ? `${result.message}\n${result.details}` : result.message;
}

function label(language: "zh-CN" | "en", chinese: string, english: string): string {
  return language === "zh-CN" ? chinese : english;
}

function isThinkingParamStyle(value: string): value is ThinkingParamStyle {
  return value === "auto" || value === "none" || value === "thinking"
    || value === "enable_thinking" || value === "reasoning";
}

function isContextMode(value: string): value is ContextMode {
  return value === "none" || value === "parent" || value === "ancestors" || value === "whole";
}
