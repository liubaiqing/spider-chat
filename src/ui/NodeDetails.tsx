import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { App } from "obsidian";
import { displayTitle, nodeStatsLabel, roleLabel, t } from "../i18n";
import type { AppLanguage, BranchSource, ChatMap, ChatMessage, ChatNode, ChatNodeStatus, ContextMode, ModelProfile, NodeId } from "../types";
import { MarkdownContent } from "./MarkdownContent";
import { OnboardingCard } from "./OnboardingCard";
import type { OnboardingGuideVariant } from "./onboarding";
import { useReadingPosition } from "./useReadingPosition";
import { SelectionBranchHint } from "./SelectionBranchHint";
import type { NodeSendOptions } from "../state/viewState";

interface SendMessageOptions {
  profileId?: string;
  contextMode?: ContextMode;
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
  focusToken: number;
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
  onCancel(this: void, nodeId: NodeId): void;
  onExportInteractive(this: void): void;
  onCreateChild(this: void, anchorText?: string, source?: BranchSource): void;
  onDismissOnboarding(this: void): void;
  onDraftChange(this: void, value: string): void;
  onMarkUnderstood(this: void): void;
  onOpenSettings(this: void): void;
  onRevealNode(this: void, nodeId: NodeId): void;
  onRetry(this: void, nodeId?: NodeId): void;
  onSend(this: void, options?: SendMessageOptions): void;
  onSendOptionsChange(this: void, options: NodeSendOptions): void;
  onOpenSendOptions(this: void): void;
  onStatusChange(this: void, status: ChatNodeStatus): void;
  onTitleChange(this: void, title: string): void;
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
  focusToken,
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
  onCancel,
  onExportInteractive,
  onCreateChild,
  onDismissOnboarding,
  onDraftChange,
  onMarkUnderstood,
  onOpenSettings,
  onRevealNode,
  onRetry,
  onSend,
  onSendOptionsChange,
  onOpenSendOptions,
  onStatusChange,
  onTitleChange,
}: NodeDetailsProps): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { scrollRef, onScroll, onRendered: handleMarkdownRendered, scrollToBottom, scrollToTop, showScrollTop, showScrollBottom, highlightName } = useReadingPosition(mapId, node, path);
  const [titleDraft, setTitleDraft] = useState(displayTitle(language, node.title));
  const profileId = sendOptions.profileId ?? node.defaultModelProfileId ?? defaultModelProfileId ?? "";
  const contextMode = sendOptions.contextMode ?? defaultContextMode;
  const selectedProfile = models.find((item) => item.id === profileId);
  const canSendWithSelectedProfile = canUseAi || Boolean(
    selectedProfile?.baseUrl.trim()
    && selectedProfile.model.trim()
    && (selectedProfile.apiKey.trim() || selectedProfile.apiKeyEnvVar?.trim()),
  );
  const isJobPending = generationJob?.status === "queued" || generationJob?.status === "running";
  const nodeError = generationJob?.status === "error" ? generationJob.error ?? error : error;
  const sourcePath = `spider/${node.id}.md`;
  const pendingMessage = streamingMessage?.content && !node.messages.some((message) => message.id === streamingMessage.id)
    ? streamingMessage
    : undefined;
  const messages = pendingMessage ? [...node.messages, pendingMessage] : node.messages;

  const sendWithOptions = () => {
    onSend({
      profileId: profileId || undefined,
      contextMode,
    });
    onSendOptionsChange({});
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
    if (node.messages.length === 0) {
      inputRef.current?.focus();
    }
  }, [node.id]);

  return (
    <aside className="bcm-detail">
      <style>{`::highlight(${highlightName}) { background-color: var(--text-highlight-bg, #ffe28a); color: var(--text-normal, #202124); }`}</style>
      <header className="bcm-context-header">
        <div className="bcm-map-context">
          <span className="bcm-context-label">{t(language, "mapNameLabel")}</span>
          <span className="bcm-map-title">{displayTitle(language, mapTitle)}</span>
        </div>
        <div className="bcm-context-current" title={t(language, "currentNodeLabel")}>
          {displayTitle(language, node.title)}
        </div>
      </header>

      <div className="bcm-message-area">
        <div className="bcm-scroll-area" ref={scrollRef} onScroll={onScroll}>
          <div className="bcm-node-toolbar">
            <div className="bcm-node-toolbar-main">
              <input
                className="bcm-node-title-input"
                value={titleDraft}
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
                <button type="button" onClick={onExportInteractive}>{t(language, "interactiveExport")}</button>
              </div>
            </div>
          </div>

        {node.anchorText ? (
          <section className="bcm-context-strip bcm-anchor">
            <span>{t(language, "anchor")}</span>
            <div className="bcm-source-hint">{t(language, "selectedSourceHint")}</div>
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
        <textarea
          ref={inputRef}
          data-branch-chat-input="true"
          value={draft}
          aria-label={t(language, "composerLabel")}
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
        <div className="bcm-composer-options" aria-label={t(language, "currentSendOnly")}>
          <button type="button" onClick={onOpenSendOptions}>{t(language, "sendOptionsTitle")}</button>
          <span className="bcm-send-options-summary">
            {selectedProfile?.model || t(language, "defaultModelOption")}
            {" · "}{t(language, ({ none: "contextNone", parent: "contextParent", ancestors: "contextAncestors", whole: "contextWhole" } as const)[contextMode])}
          </span>
        </div>
        <div className="bcm-composer-footer">
          <div className="bcm-composer-actions">
            {isPending || isJobPending ? (
              <button type="button" onClick={() => onCancel(node.id)}>{t(language, "stop")}</button>
            ) : (
              <button type="button" onClick={() => { void sendWithOptions(); }} disabled={!canSendWithSelectedProfile || !draft.trim()} title={!canSendWithSelectedProfile ? t(language, "missingApiKey") : undefined}>{t(language, "send")}</button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
