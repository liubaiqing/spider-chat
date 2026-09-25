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
  /** Maximum visible gap to an unrelated guide, in flow coordinates. */
  maxGuideDistance?: number;
  /** Connected cards may be farther apart across graph columns. */
  connectedGuideDistance?: number;
}

/** Screen pixels; the canvas converts these to flow coordinates at its zoom. */
export const SNAP_THRESHOLD = 8;

/**
 * Connected cards reach further: the point of the pull is to make the edge
 * between them a straight line, which is easier to hit than an incidental axis.
 */
export const CONNECTED_SNAP_THRESHOLD = 14;
export const SNAP_GUIDE_DISTANCE = 280;
export const CONNECTED_GUIDE_DISTANCE = 480;

export const NO_GUIDES: SnapResult["vertical"] = [];

const NO_NEIGHBOURS: ReadonlySet<string> = new Set<string>();

function axes(start: number, size: number): number[] {
  return [start, start + size / 2, start + size];
}

function gap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number): number {
  return Math.max(0, secondStart - firstEnd, firstStart - secondEnd);
}

function overlaps(x: number, y: number, moving: SnapBox, others: readonly SnapBox[]): boolean {
  return others.some((other) => other.id !== moving.id
    && x < other.x + other.width && x + moving.width > other.x
    && y < other.y + other.height && y + moving.height > other.y);
}

interface Candidate {
  delta: number;
  guide: number;
  priority: number;
  distance: number;
}

function closest(candidates: Candidate[], isSafe: (delta: number) => boolean): Candidate | null {
  candidates.sort((left, right) => left.priority - right.priority
    || Math.abs(left.delta) - Math.abs(right.delta)
    || left.distance - right.distance);
  return candidates.find(({ delta }) => isSafe(delta)) ?? null;
}

/**
 * Magnetic alignment: pull a dragged card onto the left/centre/right and
 * top/middle/bottom axes of the other cards, and report which axis to draw as a
 * guide.
 *
 * Candidate guides must be near the card on the other axis, and a snap must not
 * put the dragged card on top of another card. Connected centre alignment wins
 * over incidental guides when both are safe.
 */
export function snapToGuides(
  moving: SnapBox,
  others: readonly SnapBox[],
  options: SnapOptions = {},
): SnapResult {
  const threshold = options.threshold ?? SNAP_THRESHOLD;
  const connectedThreshold = options.connectedThreshold ?? CONNECTED_SNAP_THRESHOLD;
  const maxGuideDistance = options.maxGuideDistance ?? SNAP_GUIDE_DISTANCE;
  const connectedGuideDistance = options.connectedGuideDistance ?? CONNECTED_GUIDE_DISTANCE;
  const connected = options.connected ?? NO_NEIGHBOURS;
  const collisionRange = Math.max(threshold, connectedThreshold);
  const collisionBoxes = others.filter((other) => other.id !== moving.id
    && gap(moving.x - collisionRange, moving.x + moving.width + collisionRange, other.x, other.x + other.width) === 0
    && gap(moving.y - collisionRange, moving.y + moving.height + collisionRange, other.y, other.y + other.height) === 0);
  const xCandidates: Candidate[] = [];
  const yCandidates: Candidate[] = [];
  const movingX = axes(moving.x, moving.width);
  const movingY = axes(moving.y, moving.height);
  for (const other of others) {
    if (other.id === moving.id) continue;
    const verticalGap = gap(moving.y, moving.y + moving.height, other.y, other.y + other.height);
    const horizontalGap = gap(moving.x, moving.x + moving.width, other.x, other.x + other.width);
    if (verticalGap <= maxGuideDistance) {
      for (const mine of movingX) {
        for (const theirs of axes(other.x, other.width)) {
          const delta = theirs - mine;
          if (Math.abs(delta) <= threshold) {
            xCandidates.push({ delta, guide: theirs, priority: 1, distance: verticalGap });
          }
        }
      }
    }
    if (connected.has(other.id) && horizontalGap <= connectedGuideDistance) {
      const guide = other.y + other.height / 2;
      const delta = guide - (moving.y + moving.height / 2);
      if (Math.abs(delta) <= connectedThreshold) {
        yCandidates.push({ delta, guide, priority: 0, distance: horizontalGap });
      }
    }
    if (horizontalGap <= maxGuideDistance) {
      for (const mine of movingY) {
        for (const theirs of axes(other.y, other.height)) {
          const delta = theirs - mine;
          if (Math.abs(delta) <= threshold) {
            yCandidates.push({ delta, guide: theirs, priority: 1, distance: horizontalGap });
          }
        }
      }
    }
  }

  let x = closest(xCandidates, (delta) => !overlaps(moving.x + delta, moving.y, moving, collisionBoxes));
  let y = closest(yCandidates, (delta) => !overlaps(moving.x, moving.y + delta, moving, collisionBoxes));
  if (x && y && overlaps(moving.x + x.delta, moving.y + y.delta, moving, collisionBoxes)) {
    if (y.priority < x.priority || (y.priority === x.priority && Math.abs(y.delta) <= Math.abs(x.delta))) x = null;
    else y = null;
  }

  return {
    x: moving.x + (x?.delta ?? 0),
    y: moving.y + (y?.delta ?? 0),
    vertical: x ? [x.guide] : [],
    horizontal: y ? [y.guide] : [],
  };
}
