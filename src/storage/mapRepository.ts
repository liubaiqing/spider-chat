import { normalizePath, type App } from "obsidian";
import { DATA_DIR, LEGACY_DATA_DIR } from "../constants";
import { isChatMap } from "../domain/guards";
import type { ChatMap } from "../types";

interface StoredMap {
  map: ChatMap;
  path: string;
  canonical: boolean;
}

export class MapRepository {
  private readonly app: App;
  private readonly saveTails = new Map<string, Promise<void>>();

  constructor(app: App) {
    this.app = app;
  }

  async loadLatestMap(): Promise<ChatMap | null> {
    const maps = await this.readAllMaps();
    maps.sort((left, right) => {
      const timeDifference = Date.parse(right.map.updatedAt) - Date.parse(left.map.updatedAt);
      if (Number.isFinite(timeDifference) && timeDifference !== 0) return timeDifference;
      return Number(right.canonical) - Number(left.canonical);
    });
    const selected = maps[0];
    if (!selected) return null;
    await this.migrateLegacyMap(selected);
    return selected.map;
  }

  async loadMap(mapId: string): Promise<ChatMap | null> {
    const stored = await this.findMap(mapId);
    if (!stored) return null;
    await this.migrateLegacyMap(stored);
    return stored.map;
  }

  async listMaps(): Promise<ChatMap[]> {
    const byId = new Map<string, StoredMap>();
    for (const stored of await this.readAllMaps()) {
      const current = byId.get(stored.map.id);
      if (!current || (stored.canonical && !current.canonical)) {
        byId.set(stored.map.id, stored);
      }
    }
    return [...byId.values()].map(({ map }) => map);
  }

  async deleteMap(mapId: string): Promise<boolean> {
    const matching = (await this.readAllMaps(true)).filter(({ map }) => map.id === mapId);
    if (matching.length === 0) return false;

    // Remove only paths whose current contents still identify this map. This also
    // cleans up duplicate legacy snapshots without trusting a title-derived path.
    for (const stored of matching) {
      try {
        const raw = await this.app.vault.adapter.read(stored.path);
        const current = JSON.parse(raw) as unknown;
        if (isChatMap(current) && current.id === mapId) {
          await this.app.vault.adapter.remove(stored.path);
        }
      } catch {
        // A stale or unreadable path is not a reason to delete another file.
      }
    }
    return true;
  }

  async saveMap(map: ChatMap): Promise<void> {
    const path = this.mapPath(map.id);
    const prior = this.saveTails.get(map.id) ?? Promise.resolve();
    // Adapter writes are serialized per map. Recover the queue after a failed
    // write so a later, newer revision can still be persisted.
    const write = prior.catch(() => undefined).then(async () => {
      await this.ensureDataDir();
      await this.app.vault.adapter.write(path, `${JSON.stringify(map, null, 2)}\n`);
      await this.removeMigratedLegacyCopies(map);
    });
    this.saveTails.set(map.id, write);
    try {
      await write;
    } finally {
      if (this.saveTails.get(map.id) === write) this.saveTails.delete(map.id);
    }
  }

  async writeExport(folder: string, fileName: string, content: string): Promise<string> {
    const cleanFolder = normalizePath(folder);
    const path = normalizePath(`${cleanFolder}/${fileName}`);
    const parentFolder = path.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parentFolder || cleanFolder);
    await this.app.vault.adapter.write(path, content);
    return path;
  }

  async createExportFolder(folder: string): Promise<string> {
    const cleanFolder = normalizePath(folder);
    let destination = cleanFolder;
    let suffix = 2;
    while (await this.app.vault.adapter.exists(destination)) {
      destination = `${cleanFolder}-${suffix++}`;
    }
    const parent = cleanFolder.split("/").slice(0, -1).join("/");
    await this.ensureFolder(parent);
    // Create exclusively: a concurrent export must fail instead of overwriting another snapshot.
    await this.app.vault.createFolder(destination);
    return destination;
  }

  private mapPath(mapId: string): string {
    if (!mapId || typeof mapId !== "string") {
      throw new Error("Cannot save a chat map without a valid id.");
    }
    // encodeURIComponent keeps arbitrary imported ids in one path segment. The
    // suffix makes even ids such as `..` ordinary filenames.
    return normalizePath(`${DATA_DIR}/${encodeURIComponent(mapId)}.json`);
  }

  private async findMap(mapId: string): Promise<StoredMap | null> {
    const canonicalPath = this.mapPath(mapId);
    for (const dir of [DATA_DIR, LEGACY_DATA_DIR]) {
      if (!(await this.app.vault.adapter.exists(dir))) continue;
      const listed = await this.app.vault.adapter.list(dir);
      const paths = dir === DATA_DIR
        ? [canonicalPath, ...listed.files.filter((path) => path.endsWith(".json") && path !== canonicalPath)]
        : listed.files.filter((path) => path.endsWith(".json"));
      for (const path of paths) {
        if (path !== canonicalPath && !listed.files.includes(path)) continue;
        try {
          const raw = await this.app.vault.adapter.read(path);
          const parsed = JSON.parse(raw) as unknown;
          if (isChatMap(parsed) && parsed.id === mapId) {
            return { map: parsed, path, canonical: path === canonicalPath };
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private async readAllMaps(includeDuplicates = false): Promise<StoredMap[]> {
    await this.ensureDataDir();
    const maps: StoredMap[] = [];
    const canonicalIds = new Set<string>();

    for (const dir of [DATA_DIR, LEGACY_DATA_DIR]) {
      if (!(await this.app.vault.adapter.exists(dir))) continue;
      const listed = await this.app.vault.adapter.list(dir);
      for (const path of listed.files) {
        if (!path.endsWith(".json")) continue;
        try {
          const raw = await this.app.vault.adapter.read(path);
          const parsed = JSON.parse(raw) as unknown;
          if (!isChatMap(parsed)) continue;
          const canonical = path === this.mapPath(parsed.id);
          if (canonical) canonicalIds.add(parsed.id);
          maps.push({ map: parsed, path, canonical });
        } catch {
          continue;
        }
      }
    }

    return includeDuplicates
      ? maps
      : maps.filter((stored) => stored.canonical || !canonicalIds.has(stored.map.id));
  }

  private async migrateLegacyMap(stored: StoredMap): Promise<void> {
    try {
      if (stored.canonical) {
        // A canonical copy may coexist with an older title-derived file. Clean
        // only files whose parsed id still matches, preserving unrelated data.
        await this.removeMigratedLegacyCopies(stored.map);
      } else {
        await this.saveMap(stored.map);
      }
    } catch {
      // Keep the legacy source intact if the destination cannot be written.
    }
  }

  private async removeMigratedLegacyCopies(map: ChatMap): Promise<void> {
    const canonicalPath = this.mapPath(map.id);
    for (const dir of [DATA_DIR, LEGACY_DATA_DIR]) {
      if (!(await this.app.vault.adapter.exists(dir))) continue;
      const listed = await this.app.vault.adapter.list(dir);
      for (const path of listed.files) {
        if (!path.endsWith(".json") || path === canonicalPath) continue;
        try {
          const raw = await this.app.vault.adapter.read(path);
          const parsed = JSON.parse(raw) as unknown;
          if (isChatMap(parsed) && parsed.id === map.id) {
            await this.app.vault.adapter.remove(path);
          }
        } catch {
          // Leave files that cannot be positively identified as this map.
        }
      }
    }
  }

  private async ensureDataDir(): Promise<void> {
    await this.ensureFolder(DATA_DIR);
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const segments = normalized.split("/").filter(Boolean);
    let current = "";

    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment;
      if (!(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.createFolder(current);
      }
    }
  }
}
