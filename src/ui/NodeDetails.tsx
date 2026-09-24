import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { App } from "obsidian";
import { displayTitle, nodeStatsLabel, roleLabel, t } from "../i18n";
import type { AppLanguage, BranchSource, ChatMap, ChatMessage, ChatNode, ChatNodeStatus, ContextMode, ModelProfile, NodeId } from "../types";
import { MarkdownContent } from "./MarkdownContent";
import { ReasoningBlock } from "./ReasoningBlock";
import { resolveThinkingStyle } from "../settingsDefaults";
import { OnboardingCard } from "./OnboardingCard";
import type { OnboardingGuideVariant } from "./onboarding";
import { useReadingPosition } from "./useReadingPosition";
import { SelectionBranchHint } from "./SelectionBranchHint";
import type { NodeSendOptions } from "../state/viewState";

interface SendMessageOptions {
  profileId?: string;
  contextMode?: ContextMode;
  thinking?: boolean;
}

const CONTEXT_MODES = ["none", "parent", "ancestors", "whole"] as const;

const CONTEXT_LABEL_KEYS = {
  none: "contextNone",
  parent: "contextParent",
  ancestors: "contextAncestors",
  whole: "contextWhole",
} as const;

function modelLabelOf(model: ModelProfile): string {
  return model.alias && model.alias !== "Default" ? model.alias : model.model || model.alias;
}

export interface NodeGenerationJob {
  status: "queued" | "running" | "error";
  profileId?: string;
  queuePosition: number | null;
  error?: string;
  errorDetails?: string | null;
}

interface NodeDetailsProps {
  app: App;
  mapId: string;
  mapTitle: string;
  map: ChatMap;
  node: ChatNode;
  path: ChatNode[];
  draft: string;
  error: string | null;
  errorDetails: string | null;
  isPending: boolean;
  canUseAi: boolean;
  tabBranchEnabled: boolean;
  models: ModelProfile[];
  defaultModelProfileId?: string;
  defaultContextMode: ContextMode;
  sendOptions: NodeSendOptions;
  generationJob?: NodeGenerationJob;
  language: AppLanguage;
  onboardingVariant: OnboardingGuideVariant | null;
  streamingMessage?: ChatMessage;
  /** Changes when a branch is created; asks the composer to take focus once. */
  focusComposerToken: number;
  onCancel(this: void, nodeId: NodeId): void;
  onExport(this: void): void;
  onCreateChild(this: void, anchorText?: string, source?: BranchSource): void;
  onDismissOnboarding(this: void): void;
  onDraftChange(this: void, value: string): void;
  onOpenSettings(this: void): void;
  onRevealNode(this: void, nodeId: NodeId): void;
  onRetry(this: void, nodeId?: NodeId): void;
  onSend(this: void, options?: SendMessageOptions): void;
  onSendOptionsChange(this: void, options: NodeSendOptions): void;
  onProfileChange(this: void, profileId: string): void;
  onStatusChange(this: void, status: ChatNodeStatus): void;
  onTitleChange(this: void, title: string): void;
  getSavedReadingTop(this: void, mapId: string, nodeId: NodeId): number | undefined;
  onReadingPositionChange(this: void, mapId: string, nodeId: NodeId, scrollTop: number): void;
}

function isImeComposing(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function ScrollJumpIcon({ direction }: { direction: "up" | "down" }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={direction === "down" ? "is-down" : undefined}
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
    >
      <path d="m5 11 7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m5 18 7-7 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function NodeDetails({
  app,
  mapId,
  mapTitle,
  map,
  node,
  path,
  draft,
  error,
  errorDetails,
  isPending,
  canUseAi,
  tabBranchEnabled,
  models,
  defaultModelProfileId,
  defaultContextMode,
  sendOptions,
  generationJob,
  language,
  onboardingVariant,
  streamingMessage,
  focusComposerToken,
  onCancel,
  onExport,
  onCreateChild,
  onDismissOnboarding,
  onDraftChange,
  onOpenSettings,
  onRevealNode,
  onRetry,
  onSend,
  onSendOptionsChange,
  onProfileChange,
  onStatusChange,
  onTitleChange,
  getSavedReadingTop,
  onReadingPositionChange,
}: NodeDetailsProps): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { scrollRef, onScroll, onRendered: handleMarkdownRendered, scrollToBottom, scrollToTop, showScrollTop, showScrollBottom, highlightName } = useReadingPosition(mapId, node, path, getSavedReadingTop, onReadingPositionChange);
  const [titleDraft, setTitleDraft] = useState(displayTitle(language, node.title));
  const [openMenu, setOpenMenu] = useState<"model" | "context" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileId = sendOptions.profileId ?? node.defaultModelProfileId ?? defaultModelProfileId ?? "";
  const contextMode = sendOptions.contextMode ?? defaultContextMode;
  const thinking = sendOptions.thinking ?? true;
  const selectedProfile = models.find((item) => item.id === profileId);
  // The chip only appears for endpoints that actually expose a thinking switch.
  const thinkingAvailable = resolveThinkingStyle(selectedProfile) !== "none";
  const currentModelLabel = selectedProfile ? modelLabelOf(selectedProfile) : t(language, "defaultModelOption");
  const contextLabel = t(language, CONTEXT_LABEL_KEYS[contextMode]);
  const canSendWithSelectedProfile = canUseAi || Boolean(
    selectedProfile?.baseUrl.trim()
    && selectedProfile.model.trim()
    && (selectedProfile.apiKey.trim() || selectedProfile.apiKeyEnvVar?.trim()),
  );
  const isJobPending = generationJob?.status === "queued" || generationJob?.status === "running";
  const nodeError = generationJob?.status === "error" ? generationJob.error ?? error : error;
  const sourcePath = `spider/${node.id}.md`;
  // A reasoning model streams its thinking before any answer text, so the pending
  // message has to render on either part of the stream.
  const pendingMessage = streamingMessage
    && (streamingMessage.content || streamingMessage.reasoning)
    && !node.messages.some((message) => message.id === streamingMessage.id)
    ? streamingMessage
    : undefined;
  const messages = pendingMessage ? [...node.messages, pendingMessage] : node.messages;

  const sendWithOptions = () => {
    onSend({
      profileId: profileId || undefined,
      contextMode,
      thinking,
    });
  };

  const commitTitle = useCallback(() => {
    const nextTitle = titleDraft.trim();
    if (nextTitle && nextTitle !== node.title) {
      onTitleChange(nextTitle);
    } else {
      setTitleDraft(displayTitle(language, node.title));
    }
  }, [language, node.title, onTitleChange, titleDraft]);

  useEffect(() => {
    setTitleDraft(displayTitle(language, node.title));
  }, [language, node.id, node.title]);

  useEffect(() => {
    setOpenMenu(null);
  }, [node.id]);

  // Composer menus open upward because the panel sits at the bottom of the window.
  useEffect(() => {
    if (!openMenu) return undefined;
    const container = menuRef.current;
    const doc = container?.ownerDocument;
    if (!container || !doc) return undefined;
    const closeOnOutside = (event: Event): void => {
      if (!container.contains(event.target as Node)) setOpenMenu(null);
    };
    // React's KeyboardEvent is already imported here, so name the DOM one explicitly.
    const closeOnEscape = (event: Event): void => {
      if ((event as globalThis.KeyboardEvent).key === "Escape") setOpenMenu(null);
    };
    doc.addEventListener("pointerdown", closeOnOutside, true);
    doc.addEventListener("keydown", closeOnEscape, true);
    return () => {
      doc.removeEventListener("pointerdown", closeOnOutside, true);
      doc.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [openMenu]);

  // Focus the composer only right after a branch is created, where typing the
  // follow-up is the obvious next step. Focusing on every empty node would steal
  // the canvas focus that arrow-key navigation depends on.
  useEffect(() => {
    if (focusComposerToken > 0 && node.messages.length === 0) {
      inputRef.current?.focus();
    }
  }, [focusComposerToken]);

  return (
    <aside className="bcm-detail">
      <style>{`::highlight(${highlightName}) { background-color: var(--text-highlight-bg, #ffe28a); color: var(--text-normal, #202124); }`}</style>
      <header className="bcm-context-header">
        <div className="bcm-map-context">
          <span className="bcm-context-label">{t(language, "mapNameLabel")}</span>
          <span className="bcm-map-title">{displayTitle(language, mapTitle)}</span>
        </div>
        <div className="bcm-node-head">
          <input
            className="bcm-node-title-input"
            value={titleDraft}
            title={t(language, "currentNodeLabel")}
            aria-label={t(language, "nodeTitleLabel")}
            onBlur={commitTitle}
            onChange={(e) => setTitleDraft(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
          />
          <select
            className={`bcm-status bcm-status-${node.status}`}
            value={node.status}
            onChange={(e) => onStatusChange(e.currentTarget.value as ChatNodeStatus)}
            aria-label={t(language, "nodeStatusLabel")}
          >
            <option value="open">{t(language, "statusOpen")}</option>
            <option value="understood">{t(language, "statusUnderstood")}</option>
            <option value="archived">{t(language, "statusArchived")}</option>
          </select>
        </div>
        <div className="bcm-node-facts">
          <span>{nodeStatsLabel(language, node.messages.length, node.children.length)}</span>
          <div className="bcm-node-badges">
            {node.branchDirection ? <span className="bcm-node-badge is-direction">{t(language, "branchDirectionBadge")}: {node.branchDirection}</span> : null}
            {generationJob?.status === "queued" ? <span className="bcm-node-badge is-queued">{t(language, "generationQueued")}{generationJob.queuePosition ? " · " + generationJob.queuePosition : ""}</span> : null}
            {generationJob?.status === "running" ? <span className="bcm-node-badge is-running">{t(language, "generationRunning")}</span> : null}
          </div>
          <div className="bcm-node-actions">
            <button type="button" onClick={onExport}>{t(language, "export")}</button>
          </div>
        </div>
      </header>

      <div className="bcm-message-area">
        <div className="bcm-scroll-area" ref={scrollRef} onScroll={onScroll}>
        {node.anchorText ? (
          <section className="bcm-context-strip bcm-anchor">
            <div className="bcm-anchor-heading">
              <span>{t(language, "anchor")}</span>
              {node.parentId ? (
                <button type="button" className="bcm-source-return" onClick={() => onRevealNode(node.parentId!)}>
                  {t(language, "returnToSource")}
                </button>
              ) : null}
            </div>
            <MarkdownContent app={app} markdown={node.anchorText} sourcePath={sourcePath} className="bcm-context-markdown" onRendered={handleMarkdownRendered} />
          </section>
        ) : null}

        {node.mergeSources?.length ? (
          <section className="bcm-context-strip bcm-merge-sources" aria-label={t(language, "mergeSourcesLabel")}>
            <span>{t(language, "mergeSourcesLabel")}</span>
            <div className="bcm-merge-chips">
              {node.mergeSources.map((source) => {
                const sourceNode = map.nodes[source.nodeId];
                return sourceNode ? (
                  <button key={source.nodeId} type="button" className="bcm-merge-chip" onClick={() => onRevealNode(source.nodeId)}>
                    ↗ {displayTitle(language, sourceNode.title)}
                  </button>
                ) : (
                  <span key={source.nodeId} className="bcm-merge-chip is-missing" title={t(language, "mergeSourceMissing")}>
                    {t(language, "missingSource")}: {source.titleSnapshot}
                  </span>
                );
              })}
            </div>
          </section>
        ) : null}

        {onboardingVariant === "child" ? (
          <OnboardingCard language={language} variant="child" onDismiss={onDismissOnboarding} />
        ) : null}

        {node.summary ? (
          <section className="bcm-context-strip bcm-summary">
            <span>{t(language, "summary")}</span>
            <MarkdownContent app={app} markdown={node.summary} sourcePath={sourcePath} className="bcm-context-markdown" onRendered={handleMarkdownRendered} />
          </section>
        ) : null}

        {messages.length === 0 ? (
          <div className="bcm-empty">
            {t(language, "emptyHint")}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <article className={`bcm-message bcm-message-${message.role}${message === pendingMessage ? " bcm-message-streaming" : ""}`} data-spider-message-id={message.id} key={message.id}>
                <div className="bcm-message-meta">
                  {message === pendingMessage ? t(language, "streaming") : roleLabel(language, message.role)}
                </div>
                {message.reasoning ? (
                  <ReasoningBlock
                    messageId={message.id}
                    text={message.reasoning}
                    streaming={message === pendingMessage}
                    hasAnswer={Boolean(message.content.trim())}
                    language={language}
                    onGrow={handleMarkdownRendered}
                  />
                ) : null}
                <div className="bcm-message-content bcm-streaming-content" data-spider-message-body="true">
                  <MarkdownContent app={app} markdown={message.content} sourcePath={sourcePath} className="bcm-message-content markdown-rendered" onRendered={handleMarkdownRendered} />
                  {message === pendingMessage ? <span className="bcm-caret" /> : null}
                </div>
              </article>
            ))}
            {onboardingVariant === "branch" ? (
              <OnboardingCard language={language} variant="branch" onDismiss={onDismissOnboarding} />
            ) : null}
            {onboardingVariant === "done" ? (
              <OnboardingCard language={language} variant="done" onDismiss={onDismissOnboarding} />
            ) : null}
          </>
        )}

        </div>

        <SelectionBranchHint rootRef={scrollRef} nodeId={node.id} enabled={tabBranchEnabled} language={language} onCreateChild={onCreateChild} />

        {showScrollTop ? (
          <button className="bcm-scroll-jump bcm-scroll-top" type="button" onClick={() => scrollToTop()} aria-label={t(language, "scrollTop")}>
            <ScrollJumpIcon direction="up" />
          </button>
        ) : null}

        {showScrollBottom ? (
          <button className="bcm-scroll-jump bcm-scroll-bottom" type="button" onClick={() => scrollToBottom()} aria-label={t(language, "scrollLatest")}>
            <ScrollJumpIcon direction="down" />
          </button>
        ) : null}
      </div>

      {nodeError ? (
        <div className="bcm-error">
          <span>{nodeError}</span>
          {generationJob?.errorDetails || errorDetails ? (
            <details>
              <summary>{t(language, "details")}</summary>
              <pre>{generationJob?.errorDetails ?? errorDetails}</pre>
            </details>
          ) : null}
          <button type="button" onClick={() => onRetry(node.id)}>{t(language, "retry")}</button>
        </div>
      ) : null}

      <div className="bcm-composer">
        {!canUseAi && !canSendWithSelectedProfile ? (
          <section className="bcm-provider-setup" aria-labelledby="spider-provider-setup-title">
            <div>
              <div className="bcm-provider-setup-title" id="spider-provider-setup-title">{t(language, "connectAiTitle")}</div>
              <div className="bcm-provider-setup-body">{t(language, "connectAiBody")}</div>
            </div>
            <button type="button" onClick={onOpenSettings}>{t(language, "openSettings")}</button>
          </section>
        ) : onboardingVariant === "ask" ? (
          <OnboardingCard language={language} variant="ask" onDismiss={onDismissOnboarding} />
        ) : null}
        <div className="bcm-composer-box">
          <textarea
            ref={inputRef}
            data-branch-chat-input="true"
            value={draft}
            aria-label={t(language, "composerLabel")}
            aria-description={t(language, "composerHint")}
            placeholder={t(language, "composerPlaceholder")}
            onChange={(e) => onDraftChange(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
                e.preventDefault();
                if (canSendWithSelectedProfile) {
                  void sendWithOptions();
                }
              }
            }}
          />
          <div className="bcm-composer-bar">
            <div className="bcm-composer-bar-start">
              {thinkingAvailable ? (
                <button
                  className={`bcm-chip bcm-chip-thinking${thinking ? " is-on" : ""}`}
                  type="button"
                  aria-pressed={thinking}
                  title={t(language, "thinkingToggleHint")}
                  aria-description={t(language, "thinkingToggleHint")}
                  onClick={() => onSendOptionsChange({ thinking: !thinking })}
                >
                  <svg className="bcm-chip-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true">
                    <path d="M12 3v2.4M12 18.6V21M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" />
                  </svg>
                  {t(language, "thinkingToggle")}
                </button>
              ) : null}
            </div>
            <div className="bcm-composer-bar-end" ref={menuRef}>
              <button
                className="bcm-composer-trigger is-model"
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === "model"}
                aria-label={t(language, "modelLabel")}
                title={t(language, "modelLabel")}
                onClick={() => setOpenMenu(openMenu === "model" ? null : "model")}
              >
                <span className="bcm-composer-trigger-label">{currentModelLabel}</span>
                <span className="bcm-composer-caret" aria-hidden="true" />
              </button>
              <button
                className={`bcm-composer-trigger is-more${sendOptions.contextMode ? " is-set" : ""}`}
                type="button"
                aria-haspopup="menu"
                aria-expanded={openMenu === "context"}
                aria-label={t(language, "contextMode")}
                title={`${t(language, "contextMode")} · ${contextLabel}`}
                onClick={() => setOpenMenu(openMenu === "context" ? null : "context")}
              >
                <span aria-hidden="true">⋯</span>
              </button>

              {openMenu === "model" ? (
                <div className="bcm-composer-menu is-model" role="menu" aria-label={t(language, "modelLabel")}>
                  {models.length > 0 ? models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={model.id === profileId}
                      onClick={() => {
                        onProfileChange(model.id);
                        setOpenMenu(null);
                      }}
                    >
                      <span className="bcm-composer-menu-label">{modelLabelOf(model)}</span>
                    </button>
                  )) : (
                    <div className="bcm-composer-menu-empty">{t(language, "defaultModelOption")}</div>
                  )}
                </div>
              ) : null}

              {openMenu === "context" ? (
                <div className="bcm-composer-menu is-context" role="menu" aria-label={t(language, "contextMode")}>
                  {CONTEXT_MODES.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="menuitemradio"
                      aria-checked={mode === contextMode}
                      onClick={() => {
                        onSendOptionsChange({ contextMode: mode });
                        setOpenMenu(null);
                      }}
                    >
                      <span className="bcm-composer-menu-label">{t(language, CONTEXT_LABEL_KEYS[mode])}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {isPending || isJobPending ? (
                <button
                  className="bcm-send-button is-stop"
                  type="button"
                  onClick={() => onCancel(node.id)}
                  aria-label={t(language, "stop")}
                  title={t(language, "stop")}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <rect x="7" y="7" width="10" height="10" rx="1.8" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  className="bcm-send-button"
                  type="button"
                  onClick={() => { void sendWithOptions(); }}
                  disabled={!canSendWithSelectedProfile || !draft.trim()}
                  aria-label={t(language, "send")}
                  title={canSendWithSelectedProfile ? t(language, "send") : t(language, "missingApiKey")}
                >
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
                    <path d="M12 19V5M12 5l-5.5 5.5M12 5l5.5 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
