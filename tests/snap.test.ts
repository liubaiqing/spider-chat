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
    const other = box("other", 200, 320, 300, 100);

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
    const result = snapToGuides(box("moving", 97, 298), [
      box("same-column", 100, 600),
      box("same-row", 500, 300),
    ]);

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

  it("prefers a connected neighbour's centre over a closer unrelated axis", () => {
    const moving = box("moving", 100, 300, 300, 200); // centre 400
    // The stranger is nearer, but the connected parent straightens the link.
    const result = snapToGuides(moving, [box("stranger", 520, 299), box("parent", 750, 305)], {
      connected: new Set(["parent"]),
    });

    expect(result.y).toBe(305);
    expect(result.horizontal).toEqual([405]);
  });

  it("reaches further for a connected neighbour than for an unrelated card", () => {
    const moving = box("moving", 100, 300, 300, 200); // centre 400
    const parent = box("parent", 520, 312); // centre 412, twelve units away

    expect(snapToGuides(moving, [parent]).y).toBe(300);

    const linked = snapToGuides(moving, [parent], { connected: new Set(["parent"]) });
    expect(linked.y).toBe(312);
    expect(linked.horizontal).toEqual([412]);
  });

  it("falls back to ordinary axes when no connected neighbour is near", () => {
    const moving = box("moving", 100, 300, 300, 200);
    const result = snapToGuides(moving, [box("parent", 300, 900), box("other", 103, 0)], {
      connected: new Set(["parent"]),
    });

    expect(result.x).toBe(103);
    expect(result.horizontal).toEqual([]);
  });

  it("draws a single guide per axis even when several cards share the column", () => {
    const result = snapToGuides(box("moving", 101, 0), [box("a", 100, 400), box("b", 100, 1400)]);

    expect(result.vertical).toEqual([100]);
    expect(result.horizontal).toEqual([]);
  });

  it("ignores a matching axis on a distant card", () => {
    const result = snapToGuides(box("moving", 103, 0), [box("far-away", 100, 1500)]);
    expect(result.x).toBe(103);
    expect(result.vertical).toEqual([]);
  });

  it("does not pull a card on top of another card", () => {
    const result = snapToGuides(box("moving", 103, 100), [box("occupied", 100, 100)]);
    expect(result).toEqual({ x: 103, y: 100, vertical: [], horizontal: [] });
  });

  it("keeps the same screen-space threshold at different zoom levels", () => {
    for (const zoom of [0.25, 1, 1.7]) {
      const near = snapToGuides(box("moving", 100 + 7 / zoom, 0), [box("other", 100, 350)], {
        threshold: 8 / zoom,
        maxGuideDistance: 280 / zoom,
      });
      const far = snapToGuides(box("moving", 100 + 12 / zoom, 0), [box("other", 100, 350)], {
        threshold: 8 / zoom,
        maxGuideDistance: 280 / zoom,
      });
      expect(near.x).toBe(100);
      expect(far.x).toBe(100 + 12 / zoom);
    }
  });
});
