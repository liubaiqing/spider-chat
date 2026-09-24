import { normalizePath, type App } from "obsidian";
import type { AppLanguage, ChatMap } from "../types";
import { slugifyFileName } from "../utils/text";
import { buildInteractiveHtml } from "../export/interactiveHtml";

async function ensureVaultFolder(app: App, folder: string): Promise<void> {
  let current = "";
  for (const segment of folder.split("/").filter(Boolean)) {
    current = current ? current + "/" + segment : segment;
    if (!(await app.vault.adapter.exists(current))) {
      await app.vault.createFolder(current);
    }
  }
}

function exportTimestamp(value: string): string {
  const parsed = new Date(value);
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (part: number) => String(part).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + "-" + pad(date.getHours()) + pad(date.getMinutes());
}

export async function writeInteractiveHtmlExport(
  app: App,
  map: ChatMap,
  exportFolder: string,
  language: AppLanguage,
): Promise<string> {
  const folder = normalizePath(exportFolder.trim() || "Spider Maps").replace(/^\/+|\/+$/g, "");
  if (!folder || folder.split("/").some((part) => part === "..")) {
    throw new Error("Export folder must stay inside the vault.");
  }
  await ensureVaultFolder(app, folder);

  const baseName = exportTimestamp(map.createdAt) + "-" + slugifyFileName(map.title) + "-interactive.html";
  let fileName = baseName;
  let suffix = 2;
  let path = normalizePath(folder + "/" + fileName);
  while (await app.vault.adapter.exists(path)) {
    const dot = baseName.lastIndexOf(".html");
    fileName = baseName.slice(0, dot) + "-" + suffix++ + ".html";
    path = normalizePath(folder + "/" + fileName);
  }
  await app.vault.adapter.write(path, buildInteractiveHtml(map, language));
  return path;
}
