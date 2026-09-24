import { describe, expect, it } from "vitest";
import { snapToGuides, type SnapBox } from "../src/domain/snap";

const box = (id: string, x: number, y: number, width = 300, height = 200): SnapBox => ({ id, x, y, width, height });

describe("smart guides", () => {
  it("pulls a dragged card onto a matching left edge and reports the guide", () => {
    const result = snapToGuides(box("moving", 103, 40), [box("other", 100, 400)]);

    expect(result.x).toBe(100);
    expect(result.y).toBe(40);
    expect(result.vertical).toEqual([100]);
    expect(result.horizontal).toEqual([]);
  });

  it("aligns centres even when the cards have different widths", () => {
    const moving = box("moving", 250, 0, 200, 100);
    const other = box("other", 200, 500, 300, 100);

    // moving centre is 350, other centre is 350 -> already aligned
    expect(snapToGuides(moving, [other]).x).toBe(250);

    // nudge 4 units off the shared centre axis and it snaps back
    const nudged = snapToGuides(box("moving", 254, 0, 200, 100), [other]);
    expect(nudged.x).toBe(250);
    expect(nudged.vertical).toContain(350);
  });

  it("snaps the right edge onto another card's left edge", () => {
    const result = snapToGuides(box("moving", 402, 0, 300, 200), [box("other", 700, 0)]);

    expect(result.x).toBe(400);
    expect(result.vertical).toEqual([700]);
  });

  it("leaves a card alone once it is past the threshold", () => {
    const result = snapToGuides(box("moving", 130, 0), [box("other", 100, 0)]);

    expect(result.x).toBe(130);
    expect(result.vertical).toEqual([]);
  });

  it("snaps both directions independently", () => {
    const result = snapToGuides(box("moving", 97, 298), [box("other", 100, 300)]);

    expect(result.x).toBe(100);
    expect(result.y).toBe(300);
    expect(result.vertical).toEqual([100]);
    expect(result.horizontal).toEqual([300]);
  });

  it("ignores the dragged card when it is also present in the list", () => {
    const result = snapToGuides(box("moving", 103, 0), [box("moving", 100, 0), box("far", 5000, 0)]);

    expect(result.x).toBe(103);
    expect(result.vertical).toEqual([]);
  });

  it("draws a single guide per axis even when several cards share the column", () => {
    const result = snapToGuides(box("moving", 101, 0), [box("a", 100, 500), box("b", 100, 1400)]);

    expect(result.vertical).toEqual([100]);
    expect(result.horizontal).toEqual([]);
  });
});
