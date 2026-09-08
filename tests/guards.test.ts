import { describe, expect, it } from "vitest";
import { createRootMap, updateNode } from "../src/domain/chatMap";
import { isChatMap, isChatNode } from "../src/domain/guards";

describe("domain guards", () => {
  it("accepts old nodes without notes and new nodes with string notes", () => {
    const map = createRootMap("Compatibility");
    const root = map.nodes[map.rootNodeId];
    const notedMap = updateNode(map, map.rootNodeId, { note: "Personal note" });

    expect(isChatNode(root)).toBe(true);
    expect(isChatMap(notedMap)).toBe(true);
  });

  it("rejects non-string node notes", () => {
    const map = createRootMap("Invalid note");
    const root = map.nodes[map.rootNodeId];

    expect(isChatNode({ ...root, note: 42 })).toBe(false);
  });

  it("accepts optional source ranges and rejects malformed offsets", () => {
    const map = createRootMap("Source compatibility");
    const root = map.nodes[map.rootNodeId];
    expect(isChatNode(root)).toBe(true);
    expect(isChatNode({ ...root, sourceMessageId: "legacy-message" })).toBe(true);
    expect(isChatNode({ ...root, sourceMessageId: "assistant-message", sourceTextRange: { start: 0, end: 4 } })).toBe(true);
    for (const sourceTextRange of [
      null, {}, { start: "0", end: 4 }, { start: NaN, end: 4 }, { start: 0, end: Infinity },
      { start: -1, end: 4 }, { start: 4, end: 4 }, { start: 4, end: 2 }, { start: 0.5, end: 4 },
    ]) {
      expect(isChatNode({ ...root, sourceTextRange })).toBe(false);
    }
  });
});
