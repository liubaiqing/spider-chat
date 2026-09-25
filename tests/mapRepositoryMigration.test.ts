import { expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { DATA_DIR, LEGACY_DATA_DIR } from "../src/constants";
import { createRootMap } from "../src/domain/chatMap";
import { MapRepository } from "../src/storage/mapRepository";
import type { ChatMap } from "../src/types";

vi.mock("obsidian", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  normalizePath: (value: string) => value.replaceAll("\\", "/").replace(/\/{2,}/g, "/"),
}));

function createMemoryApp() {
  const files = new Map<string, string>();
  const folders = new Set<string>();
  const isDirectChild = (parent: string, path: string): boolean => {
    const remainder = path.slice(parent.length + 1);
    return path.startsWith(`${parent}/`) && !remainder.includes("/");
  };
  const app = {
    vault: {
      adapter: {
        exists: async (path: string) => files.has(path) || folders.has(path),
        list: async (path: string) => ({
          files: [...files.keys()].filter((candidate) => isDirectChild(path, candidate)),
          folders: [...folders].filter((candidate) => isDirectChild(path, candidate)),
        }),
        read: async (path: string) => {
          const content = files.get(path);
          if (content === undefined) throw new Error(`Missing file: ${path}`);
          return content;
        },
        write: async (path: string, content: string) => { files.set(path, content); },
        remove: async (path: string) => { files.delete(path); },
      },
      createFolder: async (path: string) => {
        if (folders.has(path) || files.has(path)) throw new Error(`Already exists: ${path}`);
        folders.add(path);
      },
    },
  } as unknown as App;
  return { app, files, folders };
}

function seedLegacyFolders(folders: Set<string>): void {
  folders.add(".branch-chat-map");
  folders.add(LEGACY_DATA_DIR);
}

it("updates a map at one stable path when its title changes", async () => {
  const { app, files } = createMemoryApp();
  const repository = new MapRepository(app);
  const map = createRootMap("Original title");
  const renamed = { ...map, title: "Renamed title", updatedAt: new Date(Date.now() + 1000).toISOString() };
  const stablePath = `${DATA_DIR}/${encodeURIComponent(map.id)}.json`;

  await repository.saveMap(map);
  await repository.saveMap(renamed);

  expect([...files.keys()].filter((path) => path.startsWith(`${DATA_DIR}/`))).toEqual([stablePath]);
  expect(JSON.parse(files.get(stablePath)!).title).toBe("Renamed title");
});

it("loads maps from the legacy directory and removes the source only after migration", async () => {
  const { app, files, folders } = createMemoryApp();
  seedLegacyFolders(folders);
  const repository = new MapRepository(app);
  const map = createRootMap("Legacy map");
  const other = createRootMap("Other legacy map");
  const legacyPath = `${LEGACY_DATA_DIR}/old-title-path.json`;
  const unrelatedLegacyPath = `${LEGACY_DATA_DIR}/unrelated.json`;
  files.set(legacyPath, JSON.stringify(map));
  files.set(unrelatedLegacyPath, JSON.stringify(other));
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}.json`;

  const loaded = await repository.loadMap(map.id);

  expect(loaded?.id).toBe(map.id);
  expect(files.has(canonicalPath)).toBe(true);
  expect(files.has(legacyPath)).toBe(false);
  expect(files.has(unrelatedLegacyPath)).toBe(true);
});

it("cleans a matching old path beside a valid canonical map without deleting unrelated files", async () => {
  const { app, files, folders } = createMemoryApp();
  seedLegacyFolders(folders);
  folders.add(DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Canonical map");
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  const legacyPath = `${LEGACY_DATA_DIR}/stale-title.json`;
  const impostorPath = `${LEGACY_DATA_DIR}/another-id.json`;
  const impostor: ChatMap = { ...createRootMap("Impostor"), title: map.title };
  files.set(canonicalPath, JSON.stringify(map));
  files.set(legacyPath, JSON.stringify(map));
  files.set(impostorPath, JSON.stringify(impostor));

  const loaded = await repository.loadMap(map.id);

  expect(loaded?.id).toBe(map.id);
  expect(files.has(legacyPath)).toBe(false);
  expect(files.has(impostorPath)).toBe(true);
});

it("deletes every canonical and legacy copy so a map cannot reappear", async () => {
  const { app, files, folders } = createMemoryApp();
  seedLegacyFolders(folders);
  folders.add(DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Delete duplicates");
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  const legacyPath = `${LEGACY_DATA_DIR}/old-title.json`;
  files.set(canonicalPath, JSON.stringify(map));
  files.set(legacyPath, JSON.stringify(map));

  expect(await repository.deleteMap(map.id)).toBe(true);

  expect(files.has(canonicalPath)).toBe(false);
  expect(files.has(legacyPath)).toBe(false);
  expect(await repository.loadMap(map.id)).toBeNull();
});

it("reports a failed file removal instead of claiming the map was deleted", async () => {
  const { app, files, folders } = createMemoryApp();
  folders.add(DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Protected map");
  const path = `${DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  files.set(path, JSON.stringify(map));
  app.vault.adapter.remove = async () => { throw new Error("permission denied"); };

  await expect(repository.deleteMap(map.id)).rejects.toThrow("permission denied");
  expect(files.has(path)).toBe(true);
});

it("keeps imported ids inside the map directory", async () => {
  const { app, files } = createMemoryApp();
  const repository = new MapRepository(app);
  const map = { ...createRootMap("Imported"), id: "../outside" };

  await repository.saveMap(map);

  expect([...files.keys()]).toContain(`${DATA_DIR}/${encodeURIComponent(map.id)}.json`);
  expect([...files.keys()]).not.toContain(".spider/outside.json");
});
