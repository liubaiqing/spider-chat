import { isChatMap } from "../domain/guards";
import type { ChatMap } from "../types";

/** The archive contains graph data only; model credentials stay in local settings. */
export interface SpiderMapArchive {
  format: "spider-map";
  version: 1;
  map: ChatMap;
}

export function serializeMapArchive(map: ChatMap): string {
  const archive: SpiderMapArchive = { format: "spider-map", version: 1, map };
  return `${JSON.stringify(archive, null, 2)}\n`;
}

export function parseMapArchive(raw: string): ChatMap | null {
  const parsed: unknown = JSON.parse(raw);
  // Older Spider files stored the map directly without an archive envelope.
  if (isChatMap(parsed)) return parsed;
  if (typeof parsed !== "object" || parsed === null) return null;
  const archive = parsed as Record<string, unknown>;
  return archive.format === "spider-map" && archive.version === 1 && isChatMap(archive.map)
    ? archive.map
    : null;
}
