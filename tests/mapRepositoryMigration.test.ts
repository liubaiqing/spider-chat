import { expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { DATA_DIR, LEGACY_DATA_DIR, MAP_ARCHIVE_SUFFIX, PREVIOUS_DATA_DIR } from "../src/constants";
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
  const stablePath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;

  await repository.saveMap(map);
  await repository.saveMap(renamed);

  expect([...files.keys()].filter((path) => path.startsWith(`${DATA_DIR}/`))).toEqual([stablePath]);
  expect(JSON.parse(files.get(stablePath)!).map.title).toBe("Renamed title");
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
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;

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
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  const legacyPath = `${LEGACY_DATA_DIR}/stale-title.json`;
  const impostorPath = `${LEGACY_DATA_DIR}/another-id.json`;
  const impostor: ChatMap = { ...createRootMap("Impostor"), title: map.title };
  files.set(canonicalPath, JSON.stringify({ format: "spider-map", version: 1, map }));
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
  folders.add(".spider");
  folders.add(PREVIOUS_DATA_DIR);
  folders.add(DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Delete duplicates");
  const canonicalPath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  const previousPath = `${PREVIOUS_DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  const legacyPath = `${LEGACY_DATA_DIR}/old-title.json`;
  files.set(canonicalPath, JSON.stringify({ format: "spider-map", version: 1, map }));
  files.set(previousPath, JSON.stringify(map));
  files.set(legacyPath, JSON.stringify(map));

  expect(await repository.deleteMap(map.id)).toBe(true);

  expect(files.has(canonicalPath)).toBe(false);
  expect(files.has(previousPath)).toBe(false);
  expect(files.has(legacyPath)).toBe(false);
  expect(await repository.loadMap(map.id)).toBeNull();
});

it("reports a failed file removal instead of claiming the map was deleted", async () => {
  const { app, files, folders } = createMemoryApp();
  folders.add(DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Protected map");
  const path = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  files.set(path, JSON.stringify({ format: "spider-map", version: 1, map }));
  app.vault.adapter.remove = async () => { throw new Error("permission denied"); };

  await expect(repository.deleteMap(map.id)).rejects.toThrow("permission denied");
  expect(files.has(path)).toBe(true);
});

it("keeps imported ids inside the map directory", async () => {
  const { app, files } = createMemoryApp();
  const repository = new MapRepository(app);
  const map = { ...createRootMap("Imported"), id: "../outside" };

  await repository.saveMap(map);

  expect([...files.keys()]).toContain(`${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`);
  expect([...files.keys()]).not.toContain(".spider/outside.json");
});

it("loads a copied graph archive with its chat history on another vault", async () => {
  const source = createMemoryApp();
  const sourceRepository = new MapRepository(source.app);
  const map = createRootMap("Portable graph");
  const node = map.nodes[map.rootNodeId]!;
  node.messages = [
    { id: "question", role: "user", content: "What is a wave?", createdAt: map.createdAt },
    { id: "answer", role: "assistant", content: "A propagating disturbance.", createdAt: map.createdAt },
  ];
  await sourceRepository.saveMap(map);

  const archivePath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  const archive = source.files.get(archivePath)!;
  expect(JSON.parse(archive)).toMatchObject({ format: "spider-map", version: 1, map: { id: map.id } });

  const destination = createMemoryApp();
  destination.folders.add(DATA_DIR);
  destination.files.set(archivePath, archive);
  const destinationRepository = new MapRepository(destination.app);
  expect((await destinationRepository.listMaps()).map(({ id }) => id)).toEqual([map.id]);
  expect(await destinationRepository.loadMap(map.id)).toEqual(map);
});

it("migrates the previous hidden Spider map only after the new archive is saved", async () => {
  const { app, files, folders } = createMemoryApp();
  folders.add(".spider");
  folders.add(PREVIOUS_DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Existing Spider map");
  const previousPath = `${PREVIOUS_DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  const archivePath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  files.set(previousPath, JSON.stringify(map));

  expect(await repository.loadMap(map.id)).toEqual(map);
  expect(files.has(archivePath)).toBe(true);
  expect(files.has(previousPath)).toBe(false);
});

it("preserves the old map when archive creation fails", async () => {
  const { app, files, folders } = createMemoryApp();
  folders.add(".spider");
  folders.add(PREVIOUS_DATA_DIR);
  const repository = new MapRepository(app);
  const map = createRootMap("Keep source on failure");
  const previousPath = `${PREVIOUS_DATA_DIR}/${encodeURIComponent(map.id)}.json`;
  const archivePath = `${DATA_DIR}/${encodeURIComponent(map.id)}${MAP_ARCHIVE_SUFFIX}`;
  files.set(previousPath, JSON.stringify(map));
  app.vault.adapter.write = async () => { throw new Error("disk full"); };

  expect(await repository.loadMap(map.id)).toEqual(map);
  expect(files.has(previousPath)).toBe(true);
  expect(files.has(archivePath)).toBe(false);
});
