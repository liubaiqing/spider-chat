import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import { Notice } from "obsidian";
import type BranchChatMapPlugin from "../main";
import { confirmDeleteSubtreeLabel, t } from "../i18n";
import { NodeDetails } from "./NodeDetails";
import type { BranchChatMapController } from "./BranchChatMapApp";
import { confirmAction, confirmDelete } from "./ConfirmModal";
import { useActiveViewState, usePluginSettings } from "./useBranchChatMapState";
import { getOnboardingGuideVariant } from "./onboarding";
import { getSelectionInside, shouldCreateBranchFromTab, shouldGoToParentFromShiftTab, shouldHandleCanvasNavigation } from "./keyboardShortcuts";
import { openPluginSettings } from "./openPluginSettings";
import { getMissingAiConfiguration } from "../settingsDefaults";
import type { BranchSource, ContextMode } from "../types";
import { getMessageSelection } from "./messageSelection";
import { openExportPicker } from "./ExportFormatModal";

interface BranchChatMapChatAppProps {
  plugin: BranchChatMapPlugin;
  onController(this: void, controller: BranchChatMapController): void;
}

export function BranchChatMapChatApp({ plugin, onController }: BranchChatMapChatAppProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const state = useActiveViewState(plugin);
  const { map, activeNodeId, drafts, error, errorDetails, pendingNodeId, streamingMessages, generationJobs, composerFocusToken } = state;
  const node = activeNodeId && map ? map.nodes[activeNodeId] : null;
  const settings = usePluginSettings(plugin);
  const language = settings.language;
  const [onboardingDismissed, setOnboardingDismissed] = useState(settings.onboardingCardDismissed);

  const viewState = plugin.store.getActiveSession();
  const defaultContextMode: ContextMode = settings.contextMode
    ?? (settings.includeFullContext ? "whole" : settings.includeParentContext ? "parent" : "none");

  const path = viewState?.getActivePath() ?? [];
  const onboardingVariant = getOnboardingGuideVariant(map, node, onboardingDismissed);

  const dismissOnboarding = useCallback(() => {
    setOnboardingDismissed(true);
    void plugin.updateSettings({ onboardingCardDismissed: true });
    window.dispatchEvent(new CustomEvent("spider-onboarding-card-change", { detail: { dismissed: true } }));
  }, [plugin]);

  useEffect(() => {
    const handleOnboardingChange = (event: Event) => {
      const nextDismissed = (event as CustomEvent<{ dismissed?: boolean }>).detail?.dismissed;
      if (typeof nextDismissed === "boolean") {
        setOnboardingDismissed(nextDismissed);
      }
    };

    window.addEventListener("spider-onboarding-card-change", handleOnboardingChange);
    return () => window.removeEventListener("spider-onboarding-card-change", handleOnboardingChange);
  }, []);

  const createChild = useCallback(
    (anchorText?: string, source?: BranchSource) => {
      const selection = getMessageSelection(rootRef.current);
      const selectedText = anchorText?.trim() || selection?.text || getSelectionInside(rootRef.current);
      viewState?.createChild(selectedText, source ?? (selectedText === selection?.text ? selection?.source : undefined));
      if (selectedText) {
        new Notice(t(language, "onboardingChildCreatedNotice"));
      }
    },
    [language, viewState],
  );

  const exportMap = useCallback(() => {
    if (!viewState) return;
    openExportPicker(plugin.app, language, (format) => {
      void viewState.exportMapAs(format);
    });
  }, [language, plugin.app, viewState]);

  const handleDeleteCurrentMap = useCallback(async () => {
    const target = viewState?.getSnapshot().map;
    if (!viewState || !target) {
      return;
    }

    const ok = await confirmDelete(plugin.app, language, target.title);
    if (!ok) {
      return;
    }

    const removed = await viewState.deleteCurrentMap();
    if (removed) {
      new Notice(t(language, "mapDeleted"));
    }
  }, [language, plugin.app, viewState]);

  const confirmAndDeleteNode = useCallback(async (nodeId: string) => {
    if (!viewState) {
      return;
    }

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

  const handleKeydown = useCallback(
    (event: KeyboardEvent) => {
      const selectedText = getSelectionInside(rootRef.current);
      if (shouldCreateBranchFromTab(event, settings.useTabToCreateChildNodes, Boolean(selectedText))) {
        event.preventDefault();
        event.stopPropagation();
        createChild();
        rootRef.current?.ownerDocument.getSelection()?.removeAllRanges();
        return;
      }

      if (shouldGoToParentFromShiftTab(event, settings.useTabToCreateChildNodes)) {
        event.preventDefault();
        event.stopPropagation();
        viewState?.goToParent();
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
        const vs = viewState;
        const snap = vs?.getSnapshot();
        if (snap?.map && snap.activeNodeId && snap.activeNodeId !== snap.map.rootNodeId) {
          event.preventDefault();
          void confirmAndDeleteNode(snap.activeNodeId);
          return;
        }
      }

      const vs = viewState;
      if (!vs) {
        return;
      }
      const { map, activeNodeId: currentId } = vs.getSnapshot();
      if (!map || !currentId) {
        return;
      }

      const currentNode = map.nodes[currentId];
      if (!currentNode) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        vs.goToParent();
        return;
      }

      if (event.key === "ArrowRight") {
        if (currentNode.children.length > 0) {
          const firstChild = currentNode.children[0];
          if (firstChild) {
            event.preventDefault();
            vs.setActiveNode(firstChild);
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
            vs.setActiveNode(prev);
          }
        } else if (event.key === "ArrowDown" && idx < siblings.length - 1) {
          const next = siblings[idx + 1];
          if (next) {
            event.preventDefault();
            vs.setActiveNode(next);
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
      goToParent: () => viewState?.goToParent(),
      summarizeCurrentNode: () => viewState?.summarizeCurrentNode() ?? Promise.resolve(),
      exportMap: () => viewState?.exportMap() ?? Promise.resolve(),
      deleteCurrentMap: handleDeleteCurrentMap,
    });
  }, [createChild, handleDeleteCurrentMap, handleKeydown, onController, viewState]);

  if (!node) {
    return (
      <div className="bcm-sidebar-root" ref={rootRef}>
        <div className="bcm-loading">{error ?? t(language, "loading")}</div>
      </div>
    );
  }

  const vs = viewState;

  return (
    <div className="bcm-sidebar-root" ref={rootRef}>
      <NodeDetails
        app={plugin.app}
        mapId={map?.id ?? ""}
        mapTitle={map ? map.title : ""}
        map={map!}
        node={node}
        path={path}
        draft={drafts[node.id] ?? ""}
        error={error}
        errorDetails={errorDetails}
        isPending={pendingNodeId === node.id}
        canUseAi={!getMissingAiConfiguration(settings)}
        tabBranchEnabled={settings.useTabToCreateChildNodes}
        models={settings.models ?? []}
        defaultModelProfileId={settings.defaultModelProfileId}
        defaultContextMode={defaultContextMode}
        sendOptions={state.sendOptions[node.id] ?? {}}
        generationJob={generationJobs[node.id]}
        language={language}
        onboardingVariant={onboardingVariant}
        streamingMessage={streamingMessages[node.id]}
        focusComposerToken={composerFocusToken}
        onCancel={(nodeId) => vs?.cancelGeneration(nodeId)}
        onExport={exportMap}
        onCreateChild={createChild}
        onDismissOnboarding={dismissOnboarding}
        onDraftChange={(value) => vs?.updateDraft(node.id, value)}
        onOpenSettings={() => {
          if (!openPluginSettings(plugin.app, plugin.manifest.id)) {
            new Notice(t(language, "openSettingsFailed"));
          }
        }}
        onRevealNode={(nodeId) => vs?.revealNode(nodeId)}
        onRetry={(nodeId) => void vs?.retryAssistant(nodeId)}
        onSend={(options) => void vs?.sendMessage(options, node.id)}
        onSendOptionsChange={(options) => vs?.updateSendOptions(node.id, options)}
        onProfileChange={(profileId) => {
          // Switching the model in the composer changes this node's default, which is
          // what children inherit, and clears any earlier one-off override.
          vs?.updateNodeDefaultProfile(node.id, profileId);
          vs?.updateSendOptions(node.id, { profileId: undefined });
        }}
        onStatusChange={(status) => vs?.updateCurrentNodeStatus(status)}
        onTitleChange={(title) => vs?.updateCurrentNodeTitle(title)}
      />
    </div>
  );
}
