import { Modal, Setting, type App } from "obsidian";
import { t, type TranslationKey } from "../i18n";
import type { AppLanguage, ExportFormat } from "../types";

interface FormatOption {
  format: ExportFormat;
  nameKey: TranslationKey;
  descKey: TranslationKey;
}

const FORMAT_OPTIONS: readonly FormatOption[] = [
  { format: "package", nameKey: "exportPackageName", descKey: "exportPackageDesc" },
  { format: "interactive", nameKey: "exportInteractiveName", descKey: "exportInteractiveDesc" },
  { format: "markdown", nameKey: "exportMarkdownName", descKey: "exportMarkdownDesc" },
  { format: "mermaid", nameKey: "exportMermaidName", descKey: "exportMermaidDesc" },
];

/** Format picker shared by the graph toolbar, the chat sidebar, and the command. */
export class ExportFormatModal extends Modal {
  private readonly language: AppLanguage;
  private readonly onSelect: (format: ExportFormat) => void;

  constructor(app: App, language: AppLanguage, onSelect: (format: ExportFormat) => void) {
    super(app);
    this.language = language;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.titleEl.setText(t(this.language, "exportChooseTitle"));
    contentEl.empty();

    for (const option of FORMAT_OPTIONS) {
      new Setting(contentEl)
        .setName(t(this.language, option.nameKey))
        .setDesc(t(this.language, option.descKey))
        .addButton((button) => {
          button.setButtonText(t(this.language, "export")).onClick(() => {
            this.close();
            this.onSelect(option.format);
          });
        });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function openExportPicker(app: App, language: AppLanguage, onSelect: (format: ExportFormat) => void): void {
  new ExportFormatModal(app, language, onSelect).open();
}
