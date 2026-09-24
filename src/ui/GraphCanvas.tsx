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
} from "@xyflow/react";
import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from "react";
import { branchesCountLabel, displayTitle, statusLabel, t } from "../i18n";
import type { AppLanguage, ChatMap, ChatNode, ModelProfile, NodeId } from "../types";
import { markdownToPlainText, truncateText } from "../utils/text";
import { NodeNotePopover } from "./NodeNotePopover";
import type { NodeGenerationJob } from "./NodeDetails";

type ReplayMode = "time" | "depth" | "breadth";

interface BranchNodeData {
  [key: string]: unknown;
  node: ChatNode;
  active: boolean;
  inPath: boolean;
  collapsed: boolean;
  childCount: number;
  language: AppLanguage;
  searchMatch: boolean;
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
      className={`bcm-graph-node ${data.active ? "is-active" : ""} ${data.inPath ? "is-path" : ""} ${
        data.node.status === "understood" ? "is-understood" : ""
      } ${
        data.node.status === "archived" ? "is-archived" : ""
      } ${data.searchMatch ? "is-search-match" : ""} ${hasNote && hasSummary ? "has-both-previews" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="bcm-node-meta">
        <span className="bcm-node-status">
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
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

const nodeTypes = {
  branchNode: BranchNode,
};

interface GraphCanvasProps {
  map: ChatMap;
  replayPanelId: string;
  replayPanelOpen: boolean;
  activeNodeId: NodeId;
  collapsedIds: Set<NodeId>;
  language: AppLanguage;
  searchMatchIds?: Set<NodeId>;
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
  replayPanelId,
  replayPanelOpen,
  activeNodeId,
  collapsedIds,
  language,
  searchMatchIds,
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
  const visibleIds = useMemo(() => {
    // Replay temporarily reveals prior nodes and their ancestors, while leaving the user's
    // collapsed state intact for when they restore the full graph.
    return replayVisibleIds ?? collectVisibleNodeIds(map, collapsedIds);
  }, [collapsedIds, map, replayVisibleIds]);
  const activePathIds = useMemo(() => collectActivePathIds(map, activeNodeId), [activeNodeId, map]);
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
          collapsed: collapsedIds.has(node.id),
          childCount: node.children.length,
          language,
          searchMatch: searchMatchIds?.has(node.id) ?? false,
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
  }, [activeNodeId, activePathIds, collapsedIds, generationJobs, language, map.nodes, modelProfiles, onActivateNode, onCancelGeneration, onNoteChange, onSummaryChange, onToggleCollapse, pinnedNoteNodeId, searchMatchIds, visibleIds]);

  const computedEdges = useMemo<Edge[]>(() => {
    return map.edges
      .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
      .map((edge) => {
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
  }, [activePathIds, map.edges, map.nodes, visibleIds]);

  const [nodes, setNodes] = useState<BranchFlowNode[]>(computedNodes);

  useEffect(() => {
    setNodes(computedNodes);
  }, [computedNodes]);

  return (
    <div
      className="bcm-graph"
      data-spider-canvas="true"
      tabIndex={0}
      role="application"
      aria-label={t(language, "graphCanvasLabel")}
      aria-description={t(language, "nodeSettingsHint")}
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
          setPinnedNoteNodeId(null);
          onActivateNode(node.id);
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          onOpenNodeMenu(node.id, { x: event.clientX, y: event.clientY });
        }}
        onPaneClick={() => setPinnedNoteNodeId(null)}
        onNodeDragStop={(_event, node) => onPositionChange(node.id, node.position)}
        onNodesChange={(changes: NodeChange<BranchFlowNode>[]) => {
          setNodes((current) => applyNodeChanges(changes, current));
        }}
      >
        <Background gap={24} size={1} />
        <Controls />
        <MiniMap pannable zoomable nodeStrokeWidth={2} />
      </ReactFlow>
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
