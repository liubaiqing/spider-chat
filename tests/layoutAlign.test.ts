import { describe, expect, it } from "vitest";
import { alignSingleChildRows, type RowAlignmentBox } from "../src/domain/layout";

const box = (id: string, y: number, height: number, parentId?: string): RowAlignmentBox => ({
  id,
  parentId,
  position: { x: 0, y },
  height,
});

describe("row alignment after auto layout", () => {
  it("puts an only child back on its parent's centre line", () => {
    // Parent centre is 300 + 233/2 = 416.5, child centre is 314 + 196/2 = 412.
    const updates = alignSingleChildRows([box("parent", 300, 233), box("child", 314, 196, "parent")]);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.nodeId).toBe("child");
    expect(updates[0]?.position.y).toBe(318.5);
  });

  it("straightens every link of a single-child chain", () => {
    const updates = alignSingleChildRows([
      box("a", 0, 200),
      box("b", -45, 300, "a"),
      box("c", -5, 220, "b"),
    ]);

    const byId = new Map(updates.map((update) => [update.nodeId, update.position.y]));
    // b: a's centre 100 -> 100 - 150 = -50
    expect(byId.get("b")).toBe(-50);
    // c: b's centre is now -50 + 150 = 100 -> 100 - 110 = -10
    expect(byId.get("c")).toBe(-10);
  });

  it("leaves parents with several children alone", () => {
    const updates = alignSingleChildRows([
      box("parent", 0, 200),
      box("one", 0, 200, "parent"),
      box("two", 400, 200, "parent"),
    ]);

    expect(updates).toEqual([]);
  });

  it("changes nothing on a second run", () => {
    const first = alignSingleChildRows([box("parent", 300, 233), box("child", 400, 196, "parent")]);
    const moved = new Map(first.map((update) => [update.nodeId, update.position]));
    const second = alignSingleChildRows([
      box("parent", 300, 233),
      { ...box("child", 318.5, 196, "parent"), position: moved.get("child") ?? { x: 0, y: 318.5 } },
    ]);

    expect(second).toEqual([]);
  });

  it("ignores sub-pixel drift and implausible jumps", () => {
    expect(alignSingleChildRows([box("parent", 0, 200), box("child", 0.2, 200, "parent")])).toEqual([]);
    expect(alignSingleChildRows([box("parent", 0, 200), box("child", 500, 200, "parent")])).toEqual([]);
  });

  it("treats a child whose parent is not rendered as a root", () => {
    const updates = alignSingleChildRows([box("orphan", 100, 200, "collapsed-parent"), box("kid", 95, 200, "orphan")]);

    expect(updates).toHaveLength(1);
    expect(updates[0]?.nodeId).toBe("kid");
  });
});
