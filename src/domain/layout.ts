import * as dagre from "@dagrejs/dagre";
import type { ChatMap, ChatNode } from "../types";
import { markdownToPlainText } from "../utils/text";

const NODE_WIDTH = 300;
const NODE_HEIGHT = 196;

function estimatedLines(text: string, width: number): number {
  return text.split(/\r?\n/).reduce((total, line) => {
    const units = [...line].reduce((count, character) => count + (/^[\x00-\x7f]$/.test(character) ? 0.55 : 1), 0);
    return total + Math.max(1, Math.ceil(units / width));
  }, 0);
}

function estimatedNodeHeight(node: ChatNode): number {
  const summary = markdownToPlainText(node.summary ?? "").trim();
  if (!summary) return NODE_HEIGHT;
  const summaryLines = estimatedLines(summary, node.note?.trim() ? 21 : 23);
  const noteSpace = node.note?.trim() ? 35 : 0;
  const badgeSpace = node.branchDirection || node.messages.some((message) => message.modelSnapshot) ? 22 : 0;
  const titleSpace = node.title.length > 20 ? 19 : 0;
  const anchorSpace = node.anchorText ? 16 : 0;
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
