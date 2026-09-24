import { describe, expect, it } from "vitest";
import { addChildNode, createRootMap, updateNode } from "../src/domain/chatMap";
import { applyDagreLayout } from "../src/domain/layout";

describe("graph layout", () => {
  it("reserves more vertical space for a complete long summary", () => {
    const root = createRootMap("Layout", "Root");
    const first = addChildNode(root, root.rootNodeId, { title: "First" });
    const second = addChildNode(first.map, root.rootNodeId, { title: "Second" });
    const withSummary = updateNode(second.map, first.child.id, { summary: "完整结论".repeat(60) });

    const laidOut = applyDagreLayout(withSummary);
    const firstY = laidOut.nodes[first.child.id]!.position.y;
    const secondY = laidOut.nodes[second.child.id]!.position.y;
    expect(Math.abs(firstY - secondY)).toBeGreaterThan(300);
    expect(laidOut.nodes[first.child.id]!.summary).toBe(withSummary.nodes[first.child.id]!.summary);
  });
});
