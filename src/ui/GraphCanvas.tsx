import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  useViewport,
  useReactFlow,
} from "@xyflow/react";
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { branchesCountLabel, displayTitle, statusLabel, t } from "../i18n";
import type { AppLanguage, ChatMap, ChatNode, ModelProfile, NodeId } from "../types";
import { alignSingleChildRows } from "../domain/layout";
import { CONNECTED_GUIDE_DISTANCE, CONNECTED_SNAP_THRESHOLD, NO_GUIDES, SNAP_GUIDE_DISTANCE, SNAP_THRESHOLD, snapToGuides, type SnapBox } from "../domain/snap";
import { markdownToPlainText, truncateText } from "../utils/text";
import { NodeNotePopover } from "./NodeNotePopover";
import type { NodeGenerationJob } from "./NodeDetails";

type ReplayMode = "time" | "depth" | "breadth";

interface BranchNodeData {
  [key: string]: unknown;
  node: ChatNode;
  active: boolean;
  inPath: boolean;
  /** The root question anchors the map, so it keeps its own affordance. */
  isRoot: boolean;
  collapsed: boolean;
  childCount: number;
  hasIncomingEdge: boolean;
  hasOutgoingEdge: boolean;
  language: AppLanguage;
  searchMatch: boolean;
  searchTarget: boolean;
  notePinned: boolean;
  modelProfiles: ModelProfile[];
  generationJob?: NodeGenerationJob;
  onActivateNode(nodeId: NodeId): void;
  onPinnedNoteChange(nodeId: NodeId | null): void;
  onNoteChange(nodeId: NodeId, note: string): void;
  onSummaryChange(nodeId: NodeId, summary: string): void;
  onToggleCollapse(nodeId: NodeId): void;
  onCancelGeneration(nodeId: NodeId): void;
}

type BranchFlowNode = Node<BranchNodeData, "branchNode">;

const BranchNode = memo(function BranchNode({ data }: NodeProps<BranchFlowNode>) {
  const statusLabelText = statusLabel(data.language, data.node.status);
  const hasNote = Boolean(data.node.note?.trim());
  const hasSummary = Boolean(data.node.summary?.trim());
  const hasAnchor = Boolean(data.node.anchorText?.trim());
  const branchLabel = branchesCountLabel(data.language, data.childCount);
  const summaryPreview = hasSummary ? markdownToPlainText(data.node.summary!) : "";
  const notePreview = hasNote ? truncateText(markdownToPlainText(data.node.note!), 180) : "";
  const latestAssistant = [...data.node.messages].reverse().find((message) => message.role === "assistant" && message.modelSnapshot);
  const defaultProfile = data.modelProfiles.find((profile) => profile.id === data.node.defaultModelProfileId);
  const modelName = latestAssistant?.modelSnapshot?.model || defaultProfile?.model;
  const branchColor = data.node.branchColor && /^#[0-9a-f]{6}$/i.test(data.node.branchColor) ? data.node.branchColor : undefined;

  return (
    <div
      className={`bcm-graph-node ${data.isRoot ? "is-root" : ""} ${data.active ? "is-active" : ""} ${data.inPath ? "is-path" : ""} ${
        data.node.status === "understood" ? "is-understood" : ""
      } ${
        data.node.status === "archived" ? "is-archived" : ""
      } ${data.searchMatch ? "is-search-match" : ""} ${data.searchTarget ? "is-search-target" : ""} ${hasNote && hasSummary ? "has-both-previews" : ""}`}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: data.hasIncomingEdge ? "visible" : "hidden" }} />
      <div className="bcm-node-meta">
        <span className="bcm-node-status">
          {data.isRoot ? <span className="bcm-node-root-badge">{t(data.language, "rootNode")}</span> : null}
          <span className="bcm-node-status-dot" aria-hidden="true" />
          {statusLabelText}
        </span>
        <div className="bcm-node-meta-actions">
          <NodeNotePopover
            nodeId={data.node.id}
            note={data.node.note}
            summary={data.node.summary}
            language={data.language}
            pinned={data.notePinned}
            preferLeft={!data.node.parentId}
            onActivate={data.onActivateNode}
            onPinnedChange={data.onPinnedNoteChange}
            onNoteChange={data.onNoteChange}
            onSummaryChange={data.onSummaryChange}
          />
          {data.childCount > 0 ? (
            <button
              className="bcm-node-branch-count"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                data.onToggleCollapse(data.node.id);
              }}
            >
              {data.collapsed ? `+${branchLabel}` : branchLabel}
            </button>
          ) : null}
        </div>
      </div>
      {(data.node.branchDirection || modelName || data.generationJob) ? (
        <div className="bcm-node-badges">
          {data.node.branchDirection ? <span className="bcm-node-badge is-direction" style={branchColor ? { borderColor: branchColor } : undefined}>{t(data.language, "branchDirectionBadge")}: {data.node.branchDirection}</span> : null}
          {modelName ? <span className="bcm-node-badge is-model">{t(data.language, "branchModelBadge")}: {modelName}</span> : null}
          {data.generationJob?.status === "queued" ? (
            <span className="bcm-node-badge is-queued">
              {t(data.language, "generationQueued")}{data.generationJob.queuePosition ? " · " + data.generationJob.queuePosition : ""}
              <button type="button" aria-label={t(data.language, "stop")} onClick={(event) => { event.stopPropagation(); data.onCancelGeneration(data.node.id); }}>×</button>
            </span>
          ) : null}
          {data.generationJob?.status === "running" ? (
            <span className="bcm-node-badge is-running">
              {t(data.language, "generationRunning")}
              <button type="button" aria-label={t(data.language, "stop")} onClick={(event) => { event.stopPropagation(); data.onCancelGeneration(data.node.id); }}>×</button>
            </span>
          ) : null}
          {data.generationJob?.status === "error" ? <span className="bcm-node-badge is-error">{t(data.language, "generationError")}</span> : null}
        </div>
      ) : null}
      <div className="bcm-node-title" title={displayTitle(data.language, data.node.title)}>
        {displayTitle(data.language, data.node.title)}
      </div>
      {summaryPreview ? (
        <div className="bcm-node-preview is-summary">
          <span className="bcm-node-section-label">{t(data.language, "nodeSummaryLabel")}</span>
          <div className="bcm-node-preview-text">{summaryPreview}</div>
        </div>
      ) : null}
      {notePreview ? (
        <div className="bcm-node-preview is-note">
          <span className="bcm-node-section-label">{t(data.language, "cardNoteLabel")}</span>
          <div className="bcm-node-preview-text" title={notePreview}>{notePreview}</div>
        </div>
      ) : null}
      {hasAnchor ? (
        <div className="bcm-node-signals">
          <span>{t(data.language, "hasAnchorText")}</span>
        </div>
      ) : null}
      <Handle type="source" position={Position.Right} style={{ visibility: data.hasOutgoingEdge ? "visible" : "hidden" }} />
    </div>
  );
});

const nodeTypes = {
  branchNode: BranchNode,
};

/** Fallbacks used only before React Flow reports a measured size. */
const FALLBACK_WIDTH = 300;
const FALLBACK_HEIGHT = 88;

interface GraphCanvasProps {
  map: ChatMap;
  snapEnabled: boolean;
  /** Changes on every auto-layout; triggers one exact levelling pass. */
  layoutToken: number;
  onAlignPositions(this: void, updates: ReadonlyArray<{ nodeId: NodeId; position: { x: number; y: number } }>): void;
  replayPanelId: string;
  replayPanelOpen: boolean;
  activeNodeId: NodeId;
  collapsedIds: Set<NodeId>;
  language: AppLanguage;
  searchMatchIds?: Set<NodeId>;
  searchReveal?: { nodeId: NodeId; token: number };
  focusCurrentPath?: boolean;
  modelProfiles?: ModelProfile[];
  generationJobs?: Record<NodeId, NodeGenerationJob>;
  onActivateNode(this: void, nodeId: NodeId): void;
  onNoteChange(this: void, nodeId: NodeId, note: string): void;
  onSummaryChange(this: void, nodeId: NodeId, summary: string): void;
  onToggleCollapse(this: void, nodeId: NodeId): void;
  onPositionChange(this: void, nodeId: NodeId, position: { x: number; y: number }): void;
  onCancelGeneration(this: void, nodeId: NodeId): void;
  onOpenNodeMenu(this: void, nodeId: NodeId, position: { x: number; y: number }): void;
}

function collectVisibleNodeIds(map: ChatMap, collapsedIds: Set<NodeId>): Set<NodeId> {
  const visible = new Set<NodeId>();

  const visit = (nodeId: NodeId): void => {
    const node = map.nodes[nodeId];
    if (!node) {
      return;
    }

    visible.add(nodeId);
    if (collapsedIds.has(nodeId)) {
      return;
    }

    for (const childId of node.children) {
      visit(childId);
    }
  };

  visit(map.rootNodeId);
  return visible;
}

function getReplayOrder(map: ChatMap, mode: ReplayMode): NodeId[] {
  const allNodes = Object.values(map.nodes);
  if (mode === "time") {
    return allNodes
      .map((node, index) => ({ node, index, time: Date.parse(node.createdAt) }))
      .sort((left, right) => ((Number.isFinite(left.time) ? left.time : 0) - (Number.isFinite(right.time) ? right.time : 0)) || left.index - right.index)
      .map(({ node }) => node.id);
  }

  const result: NodeId[] = [];
  const seen = new Set<NodeId>();
  const queue = [map.rootNodeId];
  while (queue.length > 0) {
    const nodeId = mode === "depth" ? queue.pop() : queue.shift();
    if (!nodeId || seen.has(nodeId) || !map.nodes[nodeId]) continue;
    seen.add(nodeId);
    result.push(nodeId);
    const children = map.nodes[nodeId]?.children.filter((childId) => Boolean(map.nodes[childId])) ?? [];
    if (mode === "depth") queue.push(...children.reverse());
    else queue.push(...children);
  }
  for (const node of allNodes) {
    if (!seen.has(node.id)) result.push(node.id);
  }
  return result;
}

function collectActivePathIds(map: ChatMap, activeNodeId: NodeId): Set<NodeId> {
  const ids = new Set<NodeId>();
  let current = map.nodes[activeNodeId];

  while (current) {
    ids.add(current.id);
    current = current.parentId ? map.nodes[current.parentId] : undefined;
  }

  return ids;
}

function GraphCanvasInner({
  map,
  snapEnabled,
  layoutToken,
  onAlignPositions,
  replayPanelId,
  replayPanelOpen,
  activeNodeId,
  collapsedIds,
  language,
  searchMatchIds,
  searchReveal,
  focusCurrentPath = false,
  modelProfiles = [],
  generationJobs = {},
  onActivateNode,
  onNoteChange,
  onSummaryChange,
  onToggleCollapse,
  onPositionChange,
  onCancelGeneration,
  onOpenNodeMenu,
}: GraphCanvasProps): ReactElement {
  const graphRef = useRef<HTMLDivElement>(null);
  const longPressRef = useRef<{ timer: ReturnType<typeof setTimeout>; nodeId: NodeId; x: number; y: number } | null>(null);
  const lastMenuRef = useRef<{ nodeId: NodeId; time: number; source: "touch" | "other" } | null>(null);
  const suppressClickRef = useRef<{ nodeId: NodeId; until: number } | null>(null);
  const { fitView } = useReactFlow();
  const [searchTargetId, setSearchTargetId] = useState<NodeId | null>(null);
  const handledSearchToken = useRef<number | null>(null);
  const searchHighlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [replayMode, setReplayMode] = useState<ReplayMode>("time");
  const [replayIndex, setReplayIndex] = useState(-1);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const replayOrder = useMemo(() => getReplayOrder(map, replayMode), [map, replayMode]);
  const replayVisibleIds = useMemo(() => {
    if (replayIndex < 0) return null;
    const allowed = new Set<NodeId>();
    for (const nodeId of replayOrder.slice(0, replayIndex + 1)) {
      let node = map.nodes[nodeId];
      while (node) {
        allowed.add(node.id);
        node = node.parentId ? map.nodes[node.parentId] : undefined;
      }
    }
    return allowed;
  }, [map.nodes, replayIndex, replayOrder]);
  const activePathIds = useMemo(() => collectActivePathIds(map, activeNodeId), [activeNodeId, map]);
  const visibleIds = useMemo(() => {
    // Replay temporarily reveals prior nodes and their ancestors, while leaving the user's
    // collapsed state intact for when they restore the full graph.
    if (replayVisibleIds) return replayVisibleIds;
    const ordinary = collectVisibleNodeIds(map, collapsedIds);
    if (!focusCurrentPath) return ordinary;
    const allowed = new Set(activePathIds);
    if (!collapsedIds.has(activeNodeId)) {
      for (const childId of map.nodes[activeNodeId]?.children ?? []) allowed.add(childId);
    }
    return allowed;
  }, [activeNodeId, activePathIds, collapsedIds, focusCurrentPath, map, replayVisibleIds]);

  useEffect(() => {
    const nodeId = searchReveal?.nodeId;
    if (!nodeId || !visibleIds.has(nodeId) || handledSearchToken.current === searchReveal?.token) return undefined;
    const doc = graphRef.current?.ownerDocument ?? document;
    const frame = doc.defaultView?.requestAnimationFrame(() => {
      handledSearchToken.current = searchReveal?.token ?? null;
      void fitView({ nodes: [{ id: nodeId }], padding: 0.55, maxZoom: 1.1, duration: 360 });
      setSearchTargetId(nodeId);
      const element = [...(graphRef.current?.querySelectorAll<HTMLElement>(".react-flow__node[data-id]") ?? [])]
        .find((candidate) => candidate.dataset.id === nodeId);
      element?.focus({ preventScroll: true });
    });
    if (searchHighlightTimer.current) clearTimeout(searchHighlightTimer.current);
    searchHighlightTimer.current = setTimeout(() => setSearchTargetId((current) => current === nodeId ? null : current), 2400);
    return () => {
      if (frame !== undefined) doc.defaultView?.cancelAnimationFrame(frame);
    };
  }, [fitView, searchReveal?.token, visibleIds]);

  useEffect(() => () => {
    if (searchHighlightTimer.current) clearTimeout(searchHighlightTimer.current);
  }, []);

  const previousFocusMode = useRef(focusCurrentPath);
  useEffect(() => {
    const justEnabled = focusCurrentPath && !previousFocusMode.current;
    if (!focusCurrentPath) previousFocusMode.current = false;
    if (!justEnabled) return undefined;
    const win = graphRef.current?.ownerDocument.defaultView;
    const frame = win?.requestAnimationFrame(() => {
      previousFocusMode.current = true;
      void fitView({ nodes: [...visibleIds].map((id) => ({ id })), padding: 0.2, maxZoom: 1.1, duration: 280 });
    });
    return () => { if (frame !== undefined) win?.cancelAnimationFrame(frame); };
  }, [fitView, focusCurrentPath, visibleIds]);

  const clearLongPress = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };

  const menuPosition = (x: number, y: number): { x: number; y: number } => {
    const doc = graphRef.current?.ownerDocument;
    const width = doc?.defaultView?.innerWidth ?? 360;
    const height = doc?.defaultView?.innerHeight ?? 640;
    return {
      x: Math.max(8, Math.min(x, Math.max(8, width - 240))),
      y: Math.max(8, Math.min(y, Math.max(8, height - 270))),
    };
  };

  const showNodeMenu = (nodeId: NodeId, x: number, y: number, source: "touch" | "other" = "other") => {
    const recent = lastMenuRef.current;
    if (recent?.source === "touch" && source === "other" && recent.nodeId === nodeId && Date.now() - recent.time < 700) return;
    lastMenuRef.current = { nodeId, time: Date.now(), source };
    onOpenNodeMenu(nodeId, menuPosition(x, y));
  };

  useEffect(() => () => clearLongPress(), []);
  const visibleEdges = useMemo(() => map.edges.filter(
    (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
  ), [map.edges, visibleIds]);
  const connectedNodeIds = useMemo(() => {
    const incoming = new Set<NodeId>();
    const outgoing = new Set<NodeId>();
    for (const edge of visibleEdges) {
      outgoing.add(edge.from);
      incoming.add(edge.to);
    }
    return { incoming, outgoing };
  }, [visibleEdges]);
  const [pinnedNoteNodeId, setPinnedNoteNodeId] = useState<NodeId | null>(null);
  const preReplayActiveNodeId = useRef<NodeId | null>(null);
  const replayHelpRef = useRef<HTMLDetailsElement>(null);

  const moveReplayTo = (nextIndex: number) => {
    if (replayIndex < 0) preReplayActiveNodeId.current = activeNodeId;
    setReplayPlaying(false);
    setReplayIndex(nextIndex);
  };

  const restoreReplay = () => {
    setReplayPlaying(false);
    setReplayIndex(-1);
    const previousNodeId = preReplayActiveNodeId.current;
    preReplayActiveNodeId.current = null;
    if (previousNodeId && map.nodes[previousNodeId]) onActivateNode(previousNodeId);
  };

  useEffect(() => {
    if (!replayPanelOpen) {
      restoreReplay();
      if (replayHelpRef.current) replayHelpRef.current.open = false;
    }
  }, [replayPanelOpen]);

  const startReplay = () => {
    if (replayIndex < 0) preReplayActiveNodeId.current = activeNodeId;
    if (replayIndex < 0 || replayIndex >= replayOrder.length - 1) setReplayIndex(0);
    setReplayPlaying(true);
  };

  useEffect(() => {
    if (replayIndex >= replayOrder.length) setReplayIndex(Math.max(0, replayOrder.length - 1));
  }, [replayIndex, replayOrder.length]);

  useEffect(() => {
    if (replayIndex >= 0) {
      const nodeId = replayOrder[replayIndex];
      if (nodeId && nodeId !== activeNodeId) onActivateNode(nodeId);
    }
  }, [activeNodeId, onActivateNode, replayIndex, replayOrder]);

  useEffect(() => {
    if (!replayPlaying) return undefined;
    if (replayIndex >= replayOrder.length - 1) {
      setReplayPlaying(false);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setReplayIndex((current) => Math.min(replayOrder.length - 1, current + 1));
    }, 1800 / replaySpeed);
    return () => window.clearTimeout(timer);
  }, [replayIndex, replayOrder.length, replayPlaying, replaySpeed]);

  const handleReplayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.target instanceof Element && event.target.closest("summary")) return;
    if (
      event.code === "Space"
      && event.target instanceof Element
      && event.target.closest('button,input,select,textarea,a,[role="button"]')
    ) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      moveReplayTo(Math.max(0, replayIndex - 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      moveReplayTo(Math.min(replayOrder.length - 1, replayIndex < 0 ? 0 : replayIndex + 1));
    } else if (event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      if (replayPlaying) setReplayPlaying(false);
      else startReplay();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      restoreReplay();
    }
  };

  const computedNodes = useMemo<BranchFlowNode[]>(() => {
    return Object.values(map.nodes)
      .filter((node) => visibleIds.has(node.id))
      .map((node) => ({
        id: node.id,
        type: "branchNode",
        position: node.position,
        data: {
          node,
          active: node.id === activeNodeId,
          inPath: activePathIds.has(node.id),
          isRoot: node.id === map.rootNodeId,
          collapsed: collapsedIds.has(node.id),
          childCount: node.children.length,
          hasIncomingEdge: connectedNodeIds.incoming.has(node.id),
          hasOutgoingEdge: connectedNodeIds.outgoing.has(node.id),
          language,
          searchMatch: searchMatchIds?.has(node.id) ?? false,
          searchTarget: searchTargetId === node.id,
          notePinned: pinnedNoteNodeId === node.id,
          modelProfiles,
          generationJob: generationJobs[node.id],
          onActivateNode,
          onPinnedNoteChange: setPinnedNoteNodeId,
          onNoteChange,
          onSummaryChange,
          onToggleCollapse,
          onCancelGeneration,
        },
      }));
  }, [activeNodeId, activePathIds, collapsedIds, connectedNodeIds, generationJobs, language, map.nodes, map.rootNodeId, modelProfiles, onActivateNode, onCancelGeneration, onNoteChange, onSummaryChange, onToggleCollapse, pinnedNoteNodeId, searchMatchIds, searchTargetId, visibleIds]);

  const computedEdges = useMemo<Edge[]>(() => {
    return visibleEdges.map((edge) => {
      const targetNode = map.nodes[edge.to];
      const isPathEdge = activePathIds.has(edge.from) && activePathIds.has(edge.to) && targetNode?.parentId === edge.from;

      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        animated: isPathEdge,
        className: isPathEdge ? "is-path-edge" : undefined,
      };
    });
  }, [activePathIds, map.nodes, visibleEdges]);

  const [nodes, setNodes] = useState<BranchFlowNode[]>(computedNodes);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({
    vertical: NO_GUIDES,
    horizontal: NO_GUIDES,
  });
  const { x: viewportX, y: viewportY, zoom } = useViewport();
  // Sizes of the other cards are stable during a drag, so a ref is enough here.
  const nodesRef = useRef<BranchFlowNode[]>(computedNodes);
  const draggingIds = useRef(new Set<NodeId>());
  const dragPositions = useRef(new Map<NodeId, { x: number; y: number }>());

  useEffect(() => {
    setNodes((current) => {
      const previousById = new Map(current.map((node) => [node.id, node]));
      return computedNodes.map((node) => {
        const previous = previousById.get(node.id);
        if (!previous || !draggingIds.current.has(node.id)) return node;
        // Keep the live position when a message, status, or selection changes mid-drag.
        return {
          ...node,
          position: dragPositions.current.get(node.id) ?? previous.position,
          measured: previous.measured,
          dragging: previous.dragging,
        };
      });
    });
  }, [computedNodes]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Heights only depend on card content, so they stay valid across a re-layout.
  const measuredHeights = useRef(new Map<NodeId, number>());
  useEffect(() => {
    for (const node of nodes) {
      const height = node.measured?.height;
      if (height) measuredHeights.current.set(node.id, height);
    }
  }, [nodes]);

  const alignedToken = useRef(0);
  useEffect(() => {
    if (layoutToken === alignedToken.current) return;
    alignedToken.current = layoutToken;
    if (layoutToken === 0) return;

    const boxes = computedNodes.flatMap((node) => {
      const height = measuredHeights.current.get(node.id);
      return height ? [{ id: node.id, parentId: node.data.node.parentId, position: node.position, height }] : [];
    });
    const updates = alignSingleChildRows(boxes);
    if (updates.length > 0) {
      onAlignPositions(updates.map((update) => ({ nodeId: update.nodeId, position: update.position })));
    }
  }, [computedNodes, layoutToken, onAlignPositions]);

  // Cards joined by an edge pull each other's centres together, so dragging either
  // end of a stepped link straightens it.
  const connections = useMemo(() => {
    const index = new Map<NodeId, Set<NodeId>>();
    const link = (from: NodeId, to: NodeId): void => {
      const neighbours = index.get(from) ?? new Set<NodeId>();
      neighbours.add(to);
      index.set(from, neighbours);
    };
    for (const edge of map.edges) {
      link(edge.from, edge.to);
      link(edge.to, edge.from);
    }
    return index;
  }, [map.edges]);

  const toSnapBoxes = (list: readonly BranchFlowNode[], excludeId: string): SnapBox[] => list
    .filter((candidate) => candidate.id !== excludeId)
    .map((candidate) => ({
      id: candidate.id,
      x: candidate.position.x,
      y: candidate.position.y,
      width: candidate.measured?.width ?? FALLBACK_WIDTH,
      height: candidate.measured?.height ?? FALLBACK_HEIGHT,
    }));

  /** Magnetic alignment: rewrite the position React Flow is about to apply. */
  const applySnap = (changes: NodeChange<BranchFlowNode>[]): NodeChange<BranchFlowNode>[] => {
    if (!snapEnabled) {
      for (const change of changes) {
        if (change.type === "position" && change.dragging && change.position) dragPositions.current.set(change.id, change.position);
      }
      setGuides((current) => (current.vertical.length || current.horizontal.length ? { vertical: NO_GUIDES, horizontal: NO_GUIDES } : current));
      return changes;
    }

    let next = { vertical: NO_GUIDES as number[], horizontal: NO_GUIDES as number[] };
    const adjusted = changes.map((change) => {
      if (change.type !== "position" || !change.dragging || !change.position) return change;
      const dragged = nodesRef.current.find((candidate) => candidate.id === change.id);
      const result = snapToGuides({
        id: change.id,
        x: change.position.x,
        y: change.position.y,
        width: dragged?.measured?.width ?? FALLBACK_WIDTH,
        height: dragged?.measured?.height ?? FALLBACK_HEIGHT,
      }, toSnapBoxes(nodesRef.current, change.id), {
        connected: connections.get(change.id),
        threshold: SNAP_THRESHOLD / zoom,
        connectedThreshold: CONNECTED_SNAP_THRESHOLD / zoom,
        maxGuideDistance: SNAP_GUIDE_DISTANCE / zoom,
        connectedGuideDistance: CONNECTED_GUIDE_DISTANCE / zoom,
      });
      if (result.vertical.length || result.horizontal.length) {
        next = { vertical: result.vertical, horizontal: result.horizontal };
      }
      const position = { x: result.x, y: result.y };
      dragPositions.current.set(change.id, position);
      return { ...change, position };
    });

    setGuides((current) => (current.vertical.join() === next.vertical.join()
      && current.horizontal.join() === next.horizontal.join()
      ? current
      : next));
    return adjusted;
  };

  return (
    <div
      ref={graphRef}
      className="bcm-graph"
      data-spider-canvas="true"
      tabIndex={0}
      role="application"
      aria-label={t(language, "graphCanvasLabel")}
      aria-description={t(language, "nodeSettingsHint")}
      onPointerDownCapture={(event) => {
        if (event.pointerType !== "touch" || !(event.target instanceof Element)) return;
        const target = event.target;
        if (target.closest("button,input,textarea,select,a,[role='button']")) return;
        const nodeEl = target.closest<HTMLElement>(".react-flow__node[data-id]");
        const nodeId = nodeEl?.dataset.id;
        if (!nodeId) return;
        clearLongPress();
        const x = event.clientX;
        const y = event.clientY;
        const timer = setTimeout(() => {
          longPressRef.current = null;
          suppressClickRef.current = { nodeId, until: Date.now() + 800 };
          showNodeMenu(nodeId, x, y, "touch");
        }, 550);
        longPressRef.current = { timer, nodeId, x, y };
      }}
      onPointerMoveCapture={(event) => {
        const pending = longPressRef.current;
        if (pending && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 12) clearLongPress();
      }}
      onPointerUpCapture={clearLongPress}
      onPointerCancelCapture={clearLongPress}
      onKeyDownCapture={(event) => {
        if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("button,input,textarea,select,a,[contenteditable='true']")) return;
        const nodeEl = event.target.closest<HTMLElement>(".react-flow__node[data-id]");
        if (!nodeEl && event.target !== event.currentTarget) return;
        const nodeId = nodeEl?.dataset.id ?? activeNodeId;
        if (!map.nodes[nodeId]) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = nodeEl?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
        showNodeMenu(nodeId, rect.left + Math.min(rect.width - 8, 48), rect.top + 24);
      }}
    >
      <div id={replayPanelId} className="bcm-replay-controls" role="group" aria-label={t(language, "replay")} hidden={!replayPanelOpen} onKeyDown={handleReplayKeyDown}>
        <label>
          <span>{t(language, "replayMode")}</span>
          <select aria-label={t(language, "replayMode")} aria-description={t(language, "replayModeHint")} value={replayMode} onChange={(event) => setReplayMode(event.currentTarget.value as ReplayMode)}>
            <option value="time">{t(language, "replayTime")}</option>
            <option value="depth">{t(language, "replayDepth")}</option>
            <option value="breadth">{t(language, "replayBreadth")}</option>
          </select>
        </label>
        <button type="button" aria-label={t(language, "previousStep")} onClick={() => moveReplayTo(Math.max(0, replayIndex - 1))}>
          ◀ <span>{t(language, "previousStep")}</span>
        </button>
        <button
          type="button"
          aria-label={replayPlaying ? t(language, "pause") : t(language, "replay")}
          aria-description={replayPlaying ? undefined : t(language, "replayPlayHint")}
          onClick={() => {
            if (replayPlaying) setReplayPlaying(false);
            else startReplay();
          }}
        >
          {replayPlaying ? "Ⅱ" : "▶"} <span>{replayPlaying ? t(language, "pause") : t(language, "replay")}</span>
        </button>
        <button type="button" aria-label={t(language, "nextStep")} onClick={() => moveReplayTo(Math.min(replayOrder.length - 1, replayIndex < 0 ? 0 : replayIndex + 1))}>
          ▶ <span>{t(language, "nextStep")}</span>
        </button>
        <label className="bcm-replay-speed">
          <span>{t(language, "replaySpeed")}</span>
          <select aria-label={t(language, "replaySpeed")} aria-description={t(language, "replaySpeedHint")} value={replaySpeed} onChange={(event) => setReplaySpeed(Number(event.currentTarget.value))}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
        </label>
        <label className="bcm-replay-range">
          <span>{t(language, "replay")}</span>
          <input
            type="range"
            min={-1}
            max={Math.max(-1, replayOrder.length - 1)}
            value={replayIndex}
            aria-label={t(language, "replay")}
            aria-valuetext={replayIndex < 0 ? t(language, "replayIdle") : t(language, "replayProgress", { current: replayIndex + 1, total: replayOrder.length })}
            aria-description={t(language, "replayRangeHint")}
            onChange={(event) => {
              const nextIndex = Number(event.currentTarget.value);
              if (nextIndex < 0) restoreReplay();
              else moveReplayTo(nextIndex);
            }}
          />
        </label>
        <output aria-live="polite" className="bcm-replay-progress">
          {replayIndex < 0 ? t(language, "replayIdle") : t(language, "replayProgress", { current: replayIndex + 1, total: replayOrder.length })}
        </output>
        {replayIndex >= 0 ? (
          <button type="button" aria-description={t(language, "exitReplayHint")} onClick={restoreReplay}>{t(language, "exitReplay")}</button>
        ) : null}
        <details className="bcm-replay-help" ref={replayHelpRef}>
          <summary>
            {t(language, "replayHelp")}
          </summary>
          <div className="bcm-replay-help-card">
            <strong>{t(language, "replayHelp")}</strong>
            <p>{t(language, "replayHelpOrder")}</p>
            <p>{t(language, "replayHelpControls")}</p>
          </div>
        </details>
      </div>
      <ReactFlow<BranchFlowNode, Edge>
        nodes={nodes}
        edges={computedEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.24 }}
        minZoom={0.18}
        maxZoom={1.7}
        onNodeClick={(_event, node) => {
          if (suppressClickRef.current?.nodeId === node.id && Date.now() < suppressClickRef.current.until) {
            suppressClickRef.current = null;
            return;
          }
          setPinnedNoteNodeId(null);
          onActivateNode(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          clearLongPress();
          showNodeMenu(node.id, event.clientX, event.clientY);
        }}
        onPaneClick={() => setPinnedNoteNodeId(null)}
        onNodeDragStop={(_event, node) => {
          setGuides({ vertical: NO_GUIDES, horizontal: NO_GUIDES });
          draggingIds.current.delete(node.id);
          const position = dragPositions.current.get(node.id) ?? node.position;
          dragPositions.current.delete(node.id);
          onPositionChange(node.id, position);
        }}
        onNodeDragStart={(_event, node) => {
          clearLongPress();
          draggingIds.current.add(node.id);
          dragPositions.current.set(node.id, node.position);
        }}
        onNodesChange={(changes: NodeChange<BranchFlowNode>[]) => {
          // Snapping and guide updates happen before the updater: an updater must stay
          // pure, and calling setGuides inside it would re-run the whole node array on
          // every render pass, wiping the measured sizes React Flow needs.
          const adjusted = applySnap(changes);
          setNodes((current) => applyNodeChanges(adjusted, current));
        }}
      >
        <Background gap={24} size={1} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
      {guides.vertical.length > 0 || guides.horizontal.length > 0 ? (
        <div className="bcm-snap-guides" aria-hidden="true">
          {guides.vertical.map((x) => (
            <div key={`vertical-${x}`} className="bcm-snap-guide is-vertical" style={{ left: x * zoom + viewportX }} />
          ))}
          {guides.horizontal.map((y) => (
            <div key={`horizontal-${y}`} className="bcm-snap-guide is-horizontal" style={{ top: y * zoom + viewportY }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function GraphCanvas(props: GraphCanvasProps): ReactElement {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
