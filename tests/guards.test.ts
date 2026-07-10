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
});
