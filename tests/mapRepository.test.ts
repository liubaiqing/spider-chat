import { expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { createRootMap } from "../src/domain/chatMap";
import type BranchChatMapPlugin from "../src/main";
import { createDefaultSettings } from "../src/settingsDefaults";
import { ViewState } from "../src/state/viewState";
import { MapRepository } from "../src/storage/mapRepository";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  normalizePath: (value: string) => value.replaceAll("\\", "/").replace(/\/{2,}/g, "/"),
}));

it("exports numbered snapshots without touching previous notes and links each Canvas to its own snapshot", async () => {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const rmdir = vi.fn();
  const app = {
    vault: {
      adapter: {
        exists: async (path: string) => files.has(path) || folders.has(path),
        write: async (path: string, content: string) => { files.set(path, content); },
        rmdir,
      },
      createFolder: async (path: string) => {
        if (folders.has(path) || files.has(path)) throw new Error("Already exists");
        folders.add(path);
      },
    },
  } as unknown as App;
  const plugin = {
    settings: { ...createDefaultSettings("zh-CN"), defaultExportFolder: "Spider Maps" },
  } as BranchChatMapPlugin;
  const state = new ViewState(plugin, new MapRepository(app), createRootMap("快照验证", "快照验证"));

  try {
    await state.exportMap();
    expect(state.getSnapshot().error).toBeNull();
    const original = [...files.keys()].find((path) => path.endsWith("/index.md"))!.replace(/\/index\.md$/, "");
    files.set(`${original}/index.md`, "手写修改的入口");
    files.set(`${original}/我的补充.md`, "自己的研究判断");
    const before = new Map(files);

    await state.exportMap();
    await state.exportMap();

    expect(state.getSnapshot().error).toBeNull();
    for (const [path, content] of before) expect(files.get(path)).toBe(content);
    expect(rmdir).not.toHaveBeenCalled();
    for (const suffix of ["-2", "-3"]) {
      const folder = original + suffix;
      expect(files.has(`${folder}/index.md`)).toBe(true);
      expect(files.has(`${folder}/map.svg`)).toBe(true);
      const canvas = JSON.parse(files.get(`${folder}/map.canvas`)!);
      const text = canvas.nodes.map((node: { text: string }) => node.text).join("\n");
      expect(decodeURIComponent(text)).toContain(`${folder}/nodes/`);
      expect(decodeURIComponent(text)).not.toContain(`${original}/nodes/`);
    }
  } finally {
    state.dispose();
  }
});
