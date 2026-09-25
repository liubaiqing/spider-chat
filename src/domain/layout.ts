import * as dagre from "@dagrejs/dagre";
import type { ChatMap, ChatNode } from "../types";
import { markdownToPlainText } from "../utils/text";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 88;

/** A sub-pixel difference is not worth a write, and a huge one means bad data. */
const MIN_ALIGN_SHIFT = 0.5;
const MAX_ALIGN_SHIFT = 120;

export interface RowAlignmentBox {
  id: string;
  parentId?: string;
  position: { x: number; y: number };
  /** Real rendered height, which the layout can only estimate. */
  height: number;
}

export interface RowAlignment {
  nodeId: string;
  position: { x: number; y: number };
  delta: number;
}

/**
 * The layout aligns node centres using *estimated* card heights, so a link between a
 * parent and its only child can end up a few pixels out and render as a step.
 * Given the measured heights, put each only child back on its parent's centre line.
 *
 * Corrections are applied top-down so a chain of only children straightens link by
 * link, and the result is idempotent: once a pair is level its delta is zero.
 */
export function alignSingleChildRows(
  boxes: readonly RowAlignmentBox[],
  maxShift = MAX_ALIGN_SHIFT,
): RowAlignment[] {
  const working = new Map(boxes.map((box) => [box.id, { ...box, position: { ...box.position } }]));
  const children = new Map<string, string[]>();
  const roots: string[] = [];

  for (const box of boxes) {
    if (box.parentId && working.has(box.parentId)) {
      children.set(box.parentId, [...(children.get(box.parentId) ?? []), box.id]);
    } else {
      roots.push(box.id);
    }
  }

  const updates: RowAlignment[] = [];
  const queue = [...roots];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const parent = working.get(id);
    if (!parent) continue;
    const kids = children.get(id) ?? [];
    queue.push(...kids);

    // Only children are meant to sit level with the parent; siblings must spread.
    if (kids.length !== 1) continue;
    const only = working.get(kids[0]!);
    if (!only) continue;

    const delta = (parent.position.y + parent.height / 2) - (only.position.y + only.height / 2);
    if (Math.abs(delta) < MIN_ALIGN_SHIFT || Math.abs(delta) > maxShift) continue;

    // Rounded to two decimals: keeps JSON tidy while staying idempotent.
    const y = Math.round((only.position.y + delta) * 100) / 100;
    only.position = { x: only.position.x, y };
    updates.push({ nodeId: only.id, position: only.position, delta });
  }

  return updates;
}

function estimatedLines(text: string, width: number): number {
  return text.split(/\r?\n/).reduce((total, line) => {
    const units = [...line].reduce((count, character) => count + (/^[\x00-\x7f]$/.test(character) ? 0.55 : 1), 0);
    return total + Math.max(1, Math.ceil(units / width));
  }, 0);
}

function estimatedNodeHeight(node: ChatNode): number {
  const summary = markdownToPlainText(node.summary ?? "").trim();
  const badgeSpace = node.branchDirection || node.messages.some((message) => message.modelSnapshot) ? 22 : 0;
  const titleSpace = node.title.length > 20 ? 19 : 0;
  const anchorSpace = node.anchorText ? 16 : 0;
  if (!summary) {
    const note = markdownToPlainText(node.note ?? "").trim();
    const noteSpace = note ? 25 + Math.min(3, estimatedLines(note, 23)) * 17 : 0;
    return NODE_HEIGHT + badgeSpace + titleSpace + anchorSpace + noteSpace;
  }
  const summaryLines = estimatedLines(summary, node.note?.trim() ? 21 : 23);
  const noteSpace = node.note?.trim() ? 35 : 0;
  return Math.max(NODE_HEIGHT, 125 + summaryLines * 17 + noteSpace + badgeSpace + titleSpace + anchorSpace);
}

export function applyDagreLayout(map: ChatMap): ChatMap {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: 80,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  for (const node of Object.values(map.nodes)) {
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: estimatedNodeHeight(node),
    });
  }

  for (const edge of map.edges) {
    graph.setEdge(edge.from, edge.to);
  }

  dagre.layout(graph);

  const nodes: Record<string, ChatNode> = {};
  for (const node of Object.values(map.nodes)) {
    const positioned = graph.node(node.id) as { x?: number; y?: number } | undefined;
    nodes[node.id] = {
      ...node,
      position: {
        x: Math.round((positioned?.x ?? node.position.x) - NODE_WIDTH / 2),
        y: Math.round((positioned?.y ?? node.position.y) - estimatedNodeHeight(node) / 2),
      },
    };
  }

  return {
    ...map,
    nodes,
  };
}
