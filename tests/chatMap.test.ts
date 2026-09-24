import { describe, expect, it } from "vitest";
import { addChildNode, createRootMap, getAncestorPath } from "../src/domain/chatMap";

describe("chat map domain", () => {
  it("creates child and grandchild nodes with Tab-style branching", () => {
    const rootMap = createRootMap("Transformer map");
    const first = addChildNode(rootMap, rootMap.rootNodeId, {
      anchorText: "Self-Attention",
      source: { messageId: "assistant-message", start: 8, end: 22 },
    });
    const second = addChildNode(first.map, first.child.id, {
      anchorText: "Query Key Value",
    });

    expect(first.child.parentId).toBe(rootMap.rootNodeId);
    expect(first.child.anchorText).toBe("Self-Attention");
    expect(first.child.sourceMessageId).toBe("assistant-message");
    expect(first.child.sourceTextRange).toEqual({ start: 8, end: 22 });
    expect(second.child.parentId).toBe(first.child.id);
    expect(second.child.sourceMessageId).toBeUndefined();
    expect(second.child.sourceTextRange).toBeUndefined();
    expect(second.map.nodes[rootMap.rootNodeId]?.children).toEqual([first.child.id]);
    expect(second.map.nodes[first.child.id]?.children).toEqual([second.child.id]);
  });

  it("returns parent path for Shift+Tab navigation", () => {
    const rootMap = createRootMap();
    const first = addChildNode(rootMap, rootMap.rootNodeId);
    const second = addChildNode(first.map, first.child.id);

    const path = getAncestorPath(second.map, second.child.id);

    expect(path.map((node) => node.id)).toEqual([rootMap.rootNodeId, first.child.id, second.child.id]);
  });

  it("keeps merge references outside the structural parent path", () => {
    const root = createRootMap("Merge provenance");
    const left = addChildNode(root, root.rootNodeId, { defaultModelProfileId: "analyst", branchDirection: "Cost", branchColor: "#123456" });
    const right = addChildNode(left.map, root.rootNodeId, { branchDirection: "Risk" });
    const merged = addChildNode(right.map, left.child.id, {
      mergeSources: [
        { nodeId: left.child.id, titleSnapshot: left.child.title },
        { nodeId: right.child.id, titleSnapshot: right.child.title },
      ],
    });

    expect(merged.child.defaultModelProfileId).toBe("analyst");
    expect(merged.child.branchColor).toBe("#123456");
    expect(merged.child.mergeSources).toHaveLength(2);
    expect(getAncestorPath(merged.map, merged.child.id).map((node) => node.id)).toEqual([
      root.rootNodeId, left.child.id, merged.child.id,
    ]);
    expect(merged.map.edges).toHaveLength(3);
  });
});
