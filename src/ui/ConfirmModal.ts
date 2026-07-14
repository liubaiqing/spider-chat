import { App, ButtonComponent, Modal, Notice } from "obsidian";
import { t } from "../i18n";
import type { AppLanguage } from "../types";

interface ConfirmActionOptions {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  openFailureText(errorMessage: string): string;
}

export function confirmAction(app: App, options: ConfirmActionOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    // Use a plain Modal (not ConfirmationModal) and create ButtonComponent
    // instances directly. Both Modal.addButton and ConfirmationModal.addButton
    // install a default onClick AFTER the user callback runs, which clobbers
    // any handler set inside the callback. Creating ButtonComponent directly
    // is the only way to keep the click handler we actually want.
    const modal = new Modal(app);
    modal.titleEl.setText(options.title);
    modal.contentEl.setText(options.message);

    const buttonRow = modal.contentEl.createDiv({ cls: "spider-confirm-row" });

    new ButtonComponent(buttonRow)
      .setButtonText(options.cancelText)
      .onClick(() => {
        settle(false);
        modal.close();
      });

    new ButtonComponent(buttonRow)
      .setButtonText(options.confirmText)
      .setCta()
      .onClick(() => {
        settle(true);
        modal.close();
      });

    // Escape key, scrim click, or any other path that closes the modal
    // resolves to false.
    modal.onClose = (): void => {
      settle(false);
    };

    try {
      modal.open();
    } catch (openError: unknown) {
      const message = openError instanceof Error ? openError.message : String(openError);
      new Notice(options.openFailureText(message));
      settle(false);
    }
  });
}

export function confirmDelete(app: App, language: AppLanguage, itemName: string): Promise<boolean> {
  return confirmAction(app, {
    title: t(language, "deleteMap"),
    message: t(language, "confirmDeleteMap", { title: itemName }),
    confirmText: t(language, "delete"),
    cancelText: t(language, "cancel"),
    openFailureText: (message) => t(language, "confirmDialogOpenFailed", { message }),
  });
}
