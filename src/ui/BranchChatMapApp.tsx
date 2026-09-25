import "@xyflow/react/dist/style.css";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";
import { Menu, Notice } from "obsidian";
import type BranchChatMapPlugin from "../main";
import { confirmDeleteSubtreeLabel, displayTitle, mapStatsLabel, t } from "../i18n";
import { GraphCanvas } from "./GraphCanvas";
import { useBranchChatMapState, usePluginSettings } from "./useBranchChatMapState";
import { MapSwitcherModal } from "./MapSwitcherModal";
import { MapGallery } from "./MapGallery";
import { confirmAction, confirmDelete } from "./ConfirmModal";
import type { ViewState } from "../state/viewState";
import type { ChatMapId, NodeId } from "../types";
import { getSelectionInside, shouldCreateBranchFromTab, shouldGoToParentFromShiftTab, shouldHandleCanvasNavigation } from "./keyboardShortcuts";
import { SearchResultItem } from "./SearchResultItem";
import { openExportPicker } from "./ExportFormatModal";
import { NodeSendOptionsModal } from "./NodeSendOptionsModal";
import { getMissingAiConfiguration } from "../settingsDefaults";

export interface BranchChatMapController {
  handleKeydown(this: void, event: KeyboardEvent): void;
  createChild(this: void, anchorText?: string): void;
  goToParent(this: void): void;
  summarizeCurrentNode(this: void): Promise<void>;
  exportMap(this: void): Promise<void>;
  deleteCurrentMap(this: void): Promise<void>;
}

interface BranchChatMapAppProps {
  plugin: BranchChatMapPlugin;
  viewState: ViewState;
  onController(this: void, controller: BranchChatMapController): void;
  setTabTitle(this: void, title: string): void;
  onNewSpider(this: void): void;
  onLoadMap(this: void, mapId: ChatMapId): void;
}

function openMapSwitcher(plugin: BranchChatMapPlugin): void {
  const modal = new MapSwitcherModal(plugin);
  void modal.loadMaps().then(() => modal.open());
}

export function BranchChatMapApp({ plugin, viewState, onController, setTabTitle, onNewSpider, onLoadMap }: BranchChatMapAppProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const searchRevealCounter = useRef(0);
  const state = useBranchChatMapState(viewState);
  const { map, activeNodeId, collapsedIds, hasManualPositions, generationJobs, layoutToken } = state;
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchOpenOnly, setSearchOpenOnly] = useState(false);
  const [searchReveal, setSearchReveal] = useState<{ nodeId: NodeId; token: number } | undefined>();
  const [focusCurrentPath, setFocusCurrentPath] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [replayPanelOpen, setReplayPanelOpen] = useState(false);
  const replayPanelId = useId();
  const searchResultsId = useId();
  const activeNode = activeNodeId && map ? map.nodes[activeNodeId] : null;
  const settings = usePluginSettings(plugin);
  const language = settings.language;
  const path = viewState.getActivePath();

  useEffect(() => {
    if (map) {
      setTabTitle(displayTitle(language, map.title));
    }
  }, [map, language, setTabTitle]);

  useEffect(() => {
    setReplayPanelOpen(false);
    setSearchQuery("");
    setSearchOpen(false);
    setSearchOpenOnly(false);
    setSearchReveal(undefined);
    setFocusCurrentPath(false);
  }, [map?.id]);

  useEffect(() => {
    if (!searchOpen) return undefined;
    const panel = searchPanelRef.current;
    const doc = panel?.ownerDocument;
    if (!panel || !doc) return undefined;
    const onOutside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) setSearchOpen(false);
    };
    doc.addEventListener("pointerdown", onOutside, true);
    return () => doc.removeEventListener("pointerdown", onOutside, true);
  }, [searchOpen]);

  const handleSwitchClick = useCallback(() => {
    openMapSwitcher(plugin);
  }, [plugin]);

  const handleSelectMap = useCallback((mapId: ChatMapId) => {
    onLoadMap(mapId);
  }, [onLoadMap]);

  const handleExport = useCallback(() => {
    openExportPicker(plugin.app, language, (format) => {
      void viewState.exportMapAs(format);
    });
  }, [language, plugin.app, viewState]);

  const handleDeleteCurrentMap = useCallback(async () => {
    const target = viewState.getSnapshot().map;
    if (!target) {
      return;
    }
    const ok = await confirmDelete(plugin.app, language, target.title);
    if (!ok) {
      return;
    }
    try {
      const removed = await viewState.deleteCurrentMap();
      new Notice(t(language, removed ? "mapDeleted" : "mapFileNotFound"));
    } catch (error: unknown) {
      new Notice(t(language, "deleteFailed", { message: error instanceof Error ? error.message : String(error) }));
    }
  }, [language, plugin.app, viewState]);

  const handleAutoLayout = useCallback(async () => {
    if (hasManualPositions) {
      const ok = await confirmAction(plugin.app, {
        title: t(language, "autoLayout"),
        message: t(language, "confirmAutoLayout"),
        confirmText: t(language, "autoLayout"),
        cancelText: t(language, "cancel"),
        openFailureText: (message) => t(language, "confirmDialogOpenFailed", { message }),
      });
      if (!ok) {
        return;
      }
    }

    viewState.autoLayout();
  }, [hasManualPositions, language, plugin.app, viewState]);

  const confirmAndDeleteNode = useCallback(async (nodeId: ChatMapId) => {
    const subtreeCount = viewState.countNodeSubtree(nodeId);
    const childCount = Math.max(0, subtreeCount - 1);
    const message = childCount > 0
      ? confirmDeleteSubtreeLabel(language, childCount)
      : t(language, "confirmDeleteNode");
    const ok = await confirmAction(plugin.app, {
      title: t(language, "deleteNode"),
      message,
      confirmText: t(language, "deleteNode"),
      cancelText: t(language, "cancel"),
      openFailureText: (openError) => t(language, "confirmDialogOpenFailed", { message: openError }),
    });
    if (ok) {
      viewState.deleteNode(nodeId);
    }
  }, [language, plugin.app, viewState]);

  const openNodeMenu = useCallback((nodeId: NodeId, position: { x: number; y: number }) => {
    const selectedMap = viewState.getSnapshot().map;
    const node = selectedMap?.nodes[nodeId];
    if (!selectedMap || !node) return;
    const mapId = selectedMap.id;
    viewState.setActiveNode(nodeId);
    const isCurrent = () => viewState.getSnapshot().map?.id === mapId && Boolean(viewState.getSnapshot().map?.nodes[nodeId]);
    const selectNode = () => { if (isCurrent()) viewState.setActiveNode(nodeId); return isCurrent(); };
    const menu = new Menu();
    menu.addItem((item) => item.setTitle(t(language, "newChild")).setIcon("git-branch").onClick(() => {
      if (selectNode()) viewState.createChild();
    }));
    menu.addItem((item) => item.setTitle(t(language, "parent")).setIcon("arrow-left").setDisabled(!node.parentId).onClick(() => {
      if (selectNode()) viewState.goToParent();
    }));
    menu.addItem((item) => item.setTitle(t(language, "summarize")).setIcon("sparkles")
      .setDisabled(Boolean(getMissingAiConfiguration(settings))).onClick(() => {
        if (selectNode()) void viewState.summarizeCurrentNode();
      }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t(language, "sendOptionsTitle")).setIcon("settings-2").onClick(() => {
      if (!selectNode()) return;
      const contextMode = settings.contextMode
        ?? (settings.includeFullContext ? "whole" : settings.includeParentContext ? "parent" : "none");
      new NodeSendOptionsModal(plugin.app, {
        node,
        language,
        models: settings.models ?? [],
        defaults: { profileId: node.defaultModelProfileId ?? settings.defaultModelProfileId, contextMode },
        current: viewState.getSnapshot().sendOptions[nodeId] ?? {},
        onApply: (options) => { if (isCurrent()) viewState.updateSendOptions(nodeId, options); },
      }).open();
    }));
    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t(language, "deleteNode")).setIcon("trash-2").setWarning(true)
      .setDisabled(nodeId === selectedMap.rootNodeId).onClick(() => {
        if (selectNode()) void confirmAndDeleteNode(nodeId);
      }));
    menu.showAtPosition(position, rootRef.current?.ownerDocument);
  }, [confirmAndDeleteNode, language, plugin.app, settings, viewState]);

  const searchResults = useMemo(() => viewState.searchNodes(searchQuery, searchOpenOnly), [searchQuery, searchOpenOnly, state.map, viewState]);
  const searchMatchIds = useMemo(() => new Set(searchQuery.trim() ? searchResults.map((result) => result.node.id) : []), [searchQuery, searchResults]);

  const createChild = useCallback(
    (anchorText?: string) => {
      const selectedText = anchorText?.trim() || getSelectionInside(rootRef.current);
      viewState.createChild(selectedText);
      if (selectedText) {
        new Notice(t(language, "onboardingChildCreatedNotice"));
      }
    },
    [language, viewState],
  );

  const handleNoteChange = useCallback((nodeId: NodeId, note: string) => {
    viewState.updateNodeNote(nodeId, note);
  }, [viewState]);

  const handleSummaryChange = useCallback((nodeId: NodeId, summary: string) => {
    viewState.updateNodeSummary(nodeId, summary);
  }, [viewState]);

  const handleRevealSearchResult = useCallback((nodeId: NodeId) => {
    viewState.revealNode(nodeId);
    setSearchReveal({ nodeId, token: ++searchRevealCounter.current });
    setSearchOpen(false);
    setSearchQuery("");
  }, [viewState]);

  const handleKeydown = useCallback(
    (event: KeyboardEvent) => {
      const selectedText = getSelectionInside(rootRef.current);
      if (shouldCreateBranchFromTab(event, settings.useTabToCreateChildNodes, Boolean(selectedText))) {
        event.preventDefault();
        event.stopPropagation();
        createChild(selectedText);
        rootRef.current?.ownerDocument.getSelection()?.removeAllRanges();
        return;
      }

      if (shouldGoToParentFromShiftTab(event, settings.useTabToCreateChildNodes)) {
        event.preventDefault();
        event.stopPropagation();
        viewState.goToParent();
        return;
      }

      if (event.key === "Escape") {
        rootRef.current?.ownerDocument.getSelection()?.removeAllRanges();
        return;
      }

      if (!shouldHandleCanvasNavigation(event)) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        const { map, activeNodeId } = viewState.getSnapshot();
        if (map && activeNodeId && activeNodeId !== map.rootNodeId) {
          event.preventDefault();
          void confirmAndDeleteNode(activeNodeId);
          return;
        }
      }

      const { map, activeNodeId: currentId } = viewState.getSnapshot();
      if (!map || !currentId) {
        return;
      }

      const currentNode = map.nodes[currentId];
      if (!currentNode) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        viewState.goToParent();
        return;
      }

      if (event.key === "ArrowRight") {
        if (currentNode.children.length > 0) {
          const firstChild = currentNode.children[0];
          if (firstChild) {
            event.preventDefault();
            viewState.setActiveNode(firstChild);
          }
        }
        return;
      }

      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        if (!currentNode.parentId) {
          return;
        }

        const parent = map.nodes[currentNode.parentId];
        if (!parent) {
          return;
        }

        const siblings = parent.children;
        const idx = siblings.indexOf(currentId);
        if (idx < 0) {
          return;
        }

        if (event.key === "ArrowUp" && idx > 0) {
          const prev = siblings[idx - 1];
          if (prev) {
            event.preventDefault();
            viewState.setActiveNode(prev);
          }
        } else if (event.key === "ArrowDown" && idx < siblings.length - 1) {
          const next = siblings[idx + 1];
          if (next) {
            event.preventDefault();
            viewState.setActiveNode(next);
          }
        }
      }
    },
    [confirmAndDeleteNode, createChild, settings.useTabToCreateChildNodes, viewState],
  );

  useEffect(() => {
    onController({
      handleKeydown,
      createChild,
      goToParent: () => viewState.goToParent(),
      summarizeCurrentNode: () => viewState.summarizeCurrentNode(),
      exportMap: () => viewState.exportMap(),
      deleteCurrentMap: handleDeleteCurrentMap,
    });
  }, [createChild, handleDeleteCurrentMap, handleKeydown, onController, viewState]);

  if (!map || !activeNode) {
    return (
      <MapGallery
        plugin={plugin}
        onSelectMap={handleSelectMap}
        onNewMap={onNewSpider}
      />
    );
  }

  const nodeCount = Object.keys(map.nodes).length;

  return (
    <div className="bcm-root bcm-root-graph" ref={rootRef}>
      <div className="bcm-topbar">
        <div className="bcm-topbar-title">
          <div className="bcm-title-row">
            <span
              className="bcm-title-link"
              onClick={handleSwitchClick}
              role="button"
              tabIndex={0}
              title={t(language, "switchMapHint")}
              aria-label={t(language, "switchMapHint")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleSwitchClick();
                }
              }}
            >
              {displayTitle(language, map.title)}
              <span className="bcm-title-arrow">▾</span>
            </span>
            <button className="bcm-title-add" onClick={onNewSpider} type="button" aria-label={t(language, "newMapCommand")}>+</button>
          </div>
          <div className="bcm-topbar-meta">{mapStatsLabel(language, nodeCount, Math.max(path.length - 1, 0))}</div>
        </div>
        <div className="bcm-search-panel" ref={searchPanelRef}>
          <input
            className="bcm-search-input"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setSearchOpen(false);
                event.currentTarget.blur();
              }
            }}
            placeholder={searchOpenOnly ? t(language, "searchOpenOnly") : t(language, "searchPlaceholder")}
            aria-label={t(language, "searchNodes")}
            aria-expanded={searchOpen}
            aria-controls={searchOpen ? searchResultsId : undefined}
          />
          {searchOpen ? (
            <div id={searchResultsId} className="bcm-search-results">
              <button
                type="button"
                className={`bcm-search-filter${searchOpenOnly ? " is-on" : ""}`}
                aria-pressed={searchOpenOnly}
                onClick={() => setSearchOpenOnly((current) => !current)}
              >
                <span aria-hidden="true">{searchOpenOnly ? "✓" : ""}</span>
                {t(language, "searchOpenOnly")}
              </button>
              {(searchQuery.trim() || searchOpenOnly) && (searchResults.length > 0 ? searchResults.map((result) => (
                <SearchResultItem
                  app={plugin.app}
                  key={result.node.id}
                  language={language}
                  result={result}
                  onActivate={handleRevealSearchResult}
                />
              )) : (
                <div className="bcm-search-empty">{t(language, "searchNoResults")}</div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="bcm-topbar-actions">
          <button
            className={`bcm-topbar-btn${replayPanelOpen ? " is-active" : ""}`}
            type="button"
            aria-expanded={replayPanelOpen}
            aria-controls={replayPanelId}
            onClick={() => setReplayPanelOpen((open) => !open)}
          >
            {t(language, "replay")}
          </button>
          <button className="bcm-topbar-btn" onClick={() => { void handleAutoLayout(); }} type="button" title={t(language, "autoLayout")}>
            {t(language, "layout")}
          </button>
          <button className="bcm-topbar-btn" onClick={handleExport} type="button" title={t(language, "export")}>
            {t(language, "export")}
          </button>
          <div className="bcm-more">
            <button className="bcm-topbar-btn" onClick={() => setMoreOpen((open) => !open)} type="button" title={t(language, "moreActions")} aria-expanded={moreOpen}>
              {t(language, "moreActions")} ▾
            </button>
            {moreOpen ? (
              <div className="bcm-more-menu">
                <button
                  className={`bcm-more-item${settings.snapToGuides ? " is-on" : ""}`}
                  type="button"
                  aria-pressed={settings.snapToGuides}
                  title={t(language, "snapToGuidesHint")}
                  onClick={() => { void plugin.updateSettings({ snapToGuides: !settings.snapToGuides }); }}
                >
                  <span className="bcm-more-check" aria-hidden="true">{settings.snapToGuides ? "✓" : ""}</span>
                  {t(language, "snapToGuides")}
                </button>
                <button
                  className={`bcm-more-item${focusCurrentPath ? " is-on" : ""}`}
                  type="button"
                  aria-pressed={focusCurrentPath}
                  onClick={() => { setFocusCurrentPath((current) => !current); setMoreOpen(false); }}
                >
                  <span className="bcm-more-check" aria-hidden="true">{focusCurrentPath ? "✓" : ""}</span>
                  {t(language, "focusCurrentPath")}
                </button>
                <button className="bcm-more-item is-danger" onClick={() => { setMoreOpen(false); void handleDeleteCurrentMap(); }} type="button">
                  {t(language, "deleteMap")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bcm-workspace">
        <GraphCanvas
          map={map}
          snapEnabled={settings.snapToGuides}
          layoutToken={layoutToken}
          onAlignPositions={(updates) => viewState.applyNodePositions(updates)}
          replayPanelId={replayPanelId}
          replayPanelOpen={replayPanelOpen}
          activeNodeId={activeNode.id}
          collapsedIds={collapsedIds}
          language={language}
          searchMatchIds={searchMatchIds}
          searchReveal={searchReveal}
          focusCurrentPath={focusCurrentPath}
          modelProfiles={settings.models ?? []}
          generationJobs={generationJobs}
          onActivateNode={(nodeId) => viewState.setActiveNode(nodeId)}
          onNoteChange={handleNoteChange}
          onSummaryChange={handleSummaryChange}
          onToggleCollapse={(nodeId) => viewState.toggleCollapse(nodeId)}
          onPositionChange={(nodeId, position) => viewState.updatePosition(nodeId, position)}
          onCancelGeneration={(nodeId) => viewState.cancelGeneration(nodeId)}
          onOpenNodeMenu={openNodeMenu}
        />
      </div>
    </div>
  );
}
