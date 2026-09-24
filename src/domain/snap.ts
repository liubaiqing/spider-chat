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

export interface SnapOptions {
  threshold?: number;
  /** Cards joined to the dragged one by an edge. */
  connected?: ReadonlySet<string> | undefined;
  /** Wider pull for connected cards, so a link can be straightened on purpose. */
  connectedThreshold?: number;
}

/** Flow units within which a dragged edge or centre is pulled onto an axis. */
export const SNAP_THRESHOLD = 6;

/**
 * Connected cards reach further: the point of the pull is to make the edge
 * between them a straight line, which is easier to hit than an incidental axis.
 */
export const CONNECTED_SNAP_THRESHOLD = 14;

export const NO_GUIDES: SnapResult["vertical"] = [];

const NO_NEIGHBOURS: ReadonlySet<string> = new Set<string>();

function axes(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

/**
 * Magnetic alignment: pull a dragged card onto the left/centre/right and
 * top/middle/bottom axes of the other cards, and report which axis to draw as a
 * guide.
 *
 * Cards joined to the dragged one by an edge are handled first: matching their
 * vertical centres is what turns a stepped link into a straight horizontal line,
 * so that pull wins over an incidental alignment with an unrelated card.
 */
export function snapToGuides(
  moving: SnapBox,
  others: readonly SnapBox[],
  options: SnapOptions = {},
): SnapResult {
  const threshold = options.threshold ?? SNAP_THRESHOLD;
  const connectedThreshold = options.connectedThreshold ?? CONNECTED_SNAP_THRESHOLD;
  const connected = options.connected ?? NO_NEIGHBOURS;

  let guideX: number | null = null;
  let guideY: number | null = null;
  let deltaX = 0;
  let deltaY = 0;

  // Pass 1: straighten the link to a connected neighbour.
  const movingCentreY = moving.y + moving.height / 2;
  for (const other of others) {
    if (other.id === moving.id || !connected.has(other.id)) continue;
    const otherCentreY = other.y + other.height / 2;
    const delta = otherCentreY - movingCentreY;
    if (Math.abs(delta) <= connectedThreshold && (guideY === null || Math.abs(delta) < Math.abs(deltaY))) {
      guideY = otherCentreY;
      deltaY = delta;
    }
  }

  // Pass 2: ordinary axes. Y is skipped when the connected pull already applied.
  const movingX = axes(moving.x, moving.width);
  const movingY = axes(moving.y, moving.height);
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
    if (guideY !== null) continue;
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
