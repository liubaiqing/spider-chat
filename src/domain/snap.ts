export interface SnapBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapResult {
  x: number;
  y: number;
  /** X coordinates of the vertical guides to draw. */
  vertical: number[];
  /** Y coordinates of the horizontal guides to draw. */
  horizontal: number[];
}

/** Flow units within which a dragged edge or centre is pulled onto an axis. */
export const SNAP_THRESHOLD = 6;

export const NO_GUIDES: SnapResult["vertical"] = [];

function axes(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * Magnetic alignment: pull a dragged card onto the left/centre/right and
 * top/middle/bottom axes of the other cards, and report which axes to draw as
 * guides. Both directions snap independently, so a card can align on X while
 * staying free on Y.
 */
export function snapToGuides(
  moving: SnapBox,
  others: readonly SnapBox[],
  threshold = SNAP_THRESHOLD,
): SnapResult {
  const movingX = axes(moving.x, moving.width);
  const movingY = axes(moving.y, moving.height);

  let guideX: number | null = null;
  let guideY: number | null = null;
  let deltaX = 0;
  let deltaY = 0;

  for (const other of others) {
    if (other.id === moving.id) continue;
    for (const mine of movingX) {
      for (const theirs of axes(other.x, other.width)) {
        const delta = theirs - mine;
        if (Math.abs(delta) <= threshold && (guideX === null || Math.abs(delta) < Math.abs(deltaX))) {
          guideX = theirs;
          deltaX = delta;
        }
      }
    }
    for (const mine of movingY) {
      for (const theirs of axes(other.y, other.height)) {
        const delta = theirs - mine;
        if (Math.abs(delta) <= threshold && (guideY === null || Math.abs(delta) < Math.abs(deltaY))) {
          guideY = theirs;
          deltaY = delta;
        }
      }
    }
  }

  // One guide per axis: the coordinate that actually pulled the card, rather than
  // every axis that coincides afterwards (equal-sized cards share all three).
  return {
    x: moving.x + deltaX,
    y: moving.y + deltaY,
    vertical: guideX === null ? [] : [guideX],
    horizontal: guideY === null ? [] : [guideY],
  };
}
