import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type BranchChatMapPlugin from "./main";
import { DEFAULT_EXPORT_DIR } from "./constants";
import { t } from "./i18n";
import { OpenAICompatibleProvider, type ApiTestResult } from "./ai/openAICompatibleProvider";

export { DEFAULT_SETTINGS } from "./settingsDefaults";

export class BranchChatMapSettingTab extends PluginSettingTab {
  private readonly plugin: BranchChatMapPlugin;
  private apiTestResult: ApiTestResult | null = null;
  private isTestingApi = false;

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
      .setName(t(language, "settingApiBaseUrlName"))
      .setDesc(t(language, "settingApiBaseUrlDesc"))
      .addText((text) => {
        text
          .setPlaceholder("https://api.openai.com/v1")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ apiBaseUrl: value.trim() });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingApiKeyName"))
      .setDesc(t(language, "settingApiKeyDesc"))
      .addText((text) => {
        text.inputEl.type = "password";
        text
          .setPlaceholder("sk-...")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ apiKey: value.trim() });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingModelName"))
      .setDesc(t(language, "settingModelDesc"))
      .addText((text) => {
        text
          .setPlaceholder("gpt-4o-mini")
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ model: value.trim() });
          });
      });

    const apiTestSetting = new Setting(containerEl)
      .setName(t(language, "apiTest"))
      .setDesc(this.apiTestResult ? formatApiTestResult(this.apiTestResult) : t(language, "apiTestDesc"));

    apiTestSetting.addButton((button) => {
      button
        .setButtonText(this.isTestingApi ? t(language, "apiTesting") : t(language, "apiTest"))
        .setDisabled(this.isTestingApi)
        .onClick(async () => {
          this.isTestingApi = true;
          this.apiTestResult = null;
          this.display();

          const provider = new OpenAICompatibleProvider(this.plugin.settings);
          const result = await provider.testConnection();
          this.apiTestResult = result;
          this.isTestingApi = false;
          new Notice(result.message);
          this.display();
        });
    });

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
      .setName(t(language, "settingParentContextName"))
      .setDesc(t(language, "settingParentContextDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.includeParentContext)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ includeParentContext: value });
          });
      });

    new Setting(containerEl)
      .setName(t(language, "settingFullContextName"))
      .setDesc(t(language, "settingFullContextDesc"))
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.includeFullContext)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ includeFullContext: value });
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
}

function formatApiTestResult(result: ApiTestResult): string {
  if (result.ok) {
    return result.message;
  }

  return result.details ? `${result.message}\n${result.details}` : result.message;
}
