import { App, Modal, Setting } from "obsidian";
import { displayTitle, t } from "../i18n";
import type { NodeSendOptions } from "../state/viewState";
import type { AppLanguage, ChatNode, ContextMode, ModelProfile } from "../types";

interface Options {
  node: ChatNode;
  language: AppLanguage;
  models: ModelProfile[];
  defaults: NodeSendOptions;
  current: NodeSendOptions;
  onApply(options: NodeSendOptions): void;
}

export class NodeSendOptionsModal extends Modal {
  private readonly options: Options;

  constructor(app: App, options: Options) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { node, language, models, defaults, current, onApply } = this.options;
    let profileId = current.profileId ?? defaults.profileId ?? "";
    let contextMode = current.contextMode ?? defaults.contextMode ?? "parent";
    this.titleEl.setText(t(language, "sendOptionsTitle"));
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: t(language, "sendOptionsForNode", { title: displayTitle(language, node.title) }) });

    new Setting(this.contentEl).setName(t(language, "modelLabel")).addDropdown((dropdown) => {
      for (const model of models) dropdown.addOption(model.id, model.alias === "Default" ? model.model : model.alias || model.model);
      dropdown.setValue(profileId).onChange((value) => { profileId = value; });
    });
    new Setting(this.contentEl).setName(t(language, "contextMode")).addDropdown((dropdown) => {
      for (const mode of ["none", "parent", "ancestors", "whole"] as const) {
        const key = ({ none: "contextNone", parent: "contextParent", ancestors: "contextAncestors", whole: "contextWhole" } as const)[mode];
        dropdown.addOption(mode, t(language, key));
      }
      dropdown.setValue(contextMode).onChange((value) => { contextMode = value as ContextMode; });
    });
    new Setting(this.contentEl).addButton((button) => button.setButtonText(t(language, "cancel")).onClick(() => this.close()))
      .addButton((button) => button.setButtonText(t(language, "apply")).setCta().onClick(() => {
        onApply({ profileId, contextMode });
        this.close();
      }));
  }
}
