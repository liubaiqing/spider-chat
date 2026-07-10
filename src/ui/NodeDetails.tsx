import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import type { App } from "obsidian";
import { displayTitle, roleLabel, statusLabel, t } from "../i18n";
import type { AppLanguage, ChatNode, ChatNodeStatus, NodeId } from "../types";
import { MarkdownContent } from "./MarkdownContent";
import { OnboardingCard } from "./OnboardingCard";
import type { OnboardingGuideVariant } from "./onboarding";

interface NodeDetailsProps {
  app: App;
  mapTitle: string;
  node: ChatNode;
  parent?: ChatNode;
  path: ChatNode[];
  draft: string;
  error: string | null;
  errorDetails: string | null;
  focusToken: number;
  isPending: boolean;
  canUseAi: boolean;
  language: AppLanguage;
  onboardingVariant: OnboardingGuideVariant | null;
  streamingContent: string;
  onCancel(this: void): void;
  onCreateChild(this: void): void;
  onDeleteNode(this: void, nodeId: NodeId): void;
  onDismissOnboarding(this: void): void;
  onDraftChange(this: void, value: string): void;
  onGoParent(this: void): void;
  onMarkUnderstood(this: void): void;
  onRevealNode(this: void, nodeId: NodeId): void;
  onRetry(this: void): void;
  onSend(this: void): void;
  onSummarize(this: void): void;
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
  mapTitle,
  node,
  parent,
  path,
  draft,
  error,
  errorDetails,
  focusToken,
  isPending,
  canUseAi,
  language,
  onboardingVariant,
  streamingContent,
  onCancel,
  onCreateChild,
  onDeleteNode,
  onDismissOnboarding,
  onDraftChange,
  onGoParent,
  onMarkUnderstood,
  onRevealNode,
  onRetry,
  onSend,
  onSummarize,
  onStatusChange,
  onTitleChange,
}: NodeDetailsProps): ReactElement {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [titleDraft, setTitleDraft] = useState(displayTitle(language, node.title));
  const sourcePath = `spider/${node.id}.md`;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickToBottomRef.current = true;
    setShowScrollBottom(false);
  }, []);

  const scrollToTop = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, behavior });
  }, []);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const toBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = toBottom < 80;
    setShowScrollTop(el.scrollTop > 60);
    setShowScrollBottom(toBottom > 40);
  }, []);

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
    const frame = window.requestAnimationFrame(() => scrollToBottom("auto"));
    return () => window.cancelAnimationFrame(frame);
  }, [node.id, scrollToBottom]);

  useEffect(() => {
    if (!stickToBottomRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => scrollToBottom(streamingContent ? "auto" : "smooth"));
    return () => window.cancelAnimationFrame(frame);
  }, [node.messages.length, scrollToBottom, streamingContent]);

  useEffect(() => {
    if (node.messages.length === 0) {
      inputRef.current?.focus();
    }
  }, [node.id]);

  return (
    <aside className="bcm-detail">
      <header className="bcm-context-header">
        <div className="bcm-map-context">
          <span className="bcm-context-label">{t(language, "mapNameLabel")}</span>
          <span className="bcm-map-title">{displayTitle(language, mapTitle)}</span>
        </div>
        <div className="bcm-context-current" title={t(language, "currentNodeLabel")}>
          {displayTitle(language, node.title)}
        </div>
        {path.length > 1 ? (
          <nav className="bcm-path" aria-label={t(language, "explorationPath")}>
            <span className="bcm-context-label">{t(language, "explorationPath")}</span>
            <div className="bcm-breadcrumbs">
              {path.slice(0, -1).map((item, index) => (
                <span className="bcm-breadcrumb-part" key={item.id}>
                  {index > 0 ? <span className="bcm-path-sep">/</span> : null}
                  <button className="bcm-breadcrumb-button" type="button" onClick={() => onRevealNode(item.id)}>
                    {displayTitle(language, item.title)}
                  </button>
                </span>
              ))}
            </div>
          </nav>
        ) : null}
      </header>

      <div className="bcm-message-area">
        <div className="bcm-scroll-area" ref={scrollRef} onScroll={updateScrollState}>
          <div className="bcm-node-toolbar">
            <div className="bcm-node-toolbar-main">
              <input
                className="bcm-node-title-input"
                value={titleDraft}
                onBlur={commitTitle}
                onChange={(e) => setTitleDraft(e.currentTarget.value)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
              />
              <select
                className={`bcm-status bcm-status-${node.status}`}
                value={node.status}
                onChange={(e) => onStatusChange(e.currentTarget.value as ChatNodeStatus)}
                aria-label={language === "zh-CN" ? "节点状态" : "Node status"}
              >
                <option value="open">{t(language, "statusOpen")}</option>
                <option value="understood">{t(language, "statusUnderstood")}</option>
                <option value="archived">{t(language, "statusArchived")}</option>
              </select>
            </div>
            <div className="bcm-node-facts">
              {t(language, "nodeStats", { messages: node.messages.length, children: node.children.length })}
            </div>
          </div>

        {node.anchorText ? (
          <section className="bcm-context-strip bcm-anchor">
            <span>{t(language, "anchor")}</span>
            <div className="bcm-source-hint">{t(language, "selectedSourceHint")}</div>
            <MarkdownContent app={app} markdown={node.anchorText} sourcePath={sourcePath} className="bcm-context-markdown" />
          </section>
        ) : null}

        {onboardingVariant === "child" ? (
          <OnboardingCard language={language} variant="child" onDismiss={onDismissOnboarding} />
        ) : null}

        {node.summary ? (
          <section className="bcm-context-strip bcm-summary">
            <span>{t(language, "summary")}</span>
            <MarkdownContent app={app} markdown={node.summary} sourcePath={sourcePath} className="bcm-context-markdown" />
          </section>
        ) : null}

        {node.messages.length === 0 && !streamingContent ? (
          <div className="bcm-empty">
            {t(language, "emptyHint")}
          </div>
        ) : (
          <>
            {node.messages.map((message) => (
              <article className={`bcm-message bcm-message-${message.role}`} key={message.id}>
                <div className="bcm-message-meta">{roleLabel(language, message.role)}</div>
                <MarkdownContent app={app} markdown={message.content} sourcePath={sourcePath} className="bcm-message-content markdown-rendered" />
              </article>
            ))}
            {streamingContent ? (
              <article className="bcm-message bcm-message-assistant bcm-message-streaming">
                <div className="bcm-message-meta">{t(language, "streaming")}</div>
                <div className="bcm-streaming-content">
                  <MarkdownContent app={app} markdown={streamingContent} sourcePath={sourcePath} className="bcm-message-content markdown-rendered" />
                  <span className="bcm-caret" />
                </div>
              </article>
            ) : null}
            {onboardingVariant === "branch" ? (
              <OnboardingCard language={language} variant="branch" onDismiss={onDismissOnboarding} />
            ) : null}
            {onboardingVariant === "done" ? (
              <OnboardingCard language={language} variant="done" onDismiss={onDismissOnboarding} />
            ) : null}
          </>
        )}

        </div>

        {showScrollTop ? (
          <button className="bcm-scroll-jump bcm-scroll-top" type="button" onClick={() => scrollToTop()} aria-label={language === "zh-CN" ? "回到顶部" : "Scroll to top"}>
            <ScrollJumpIcon direction="up" />
          </button>
        ) : null}

        {showScrollBottom ? (
          <button className="bcm-scroll-jump bcm-scroll-bottom" type="button" onClick={() => scrollToBottom()} aria-label={language === "zh-CN" ? "跳到最新消息" : "Jump to latest"}>
            <ScrollJumpIcon direction="down" />
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="bcm-error">
          <span>{error}</span>
          {errorDetails ? (
            <details>
              <summary>{language === "zh-CN" ? "详情" : "Details"}</summary>
              <pre>{errorDetails}</pre>
            </details>
          ) : null}
          <button type="button" onClick={onRetry}>{t(language, "retry")}</button>
        </div>
      ) : null}

      <div className="bcm-composer">
        {onboardingVariant === "ask" ? (
          <OnboardingCard language={language} variant="ask" onDismiss={onDismissOnboarding} />
        ) : null}
        <textarea
          ref={inputRef}
          data-branch-chat-input="true"
          value={draft}
          placeholder={t(language, "composerPlaceholder")}
          onChange={(e) => onDraftChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !isImeComposing(e)) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <div className="bcm-composer-footer">
          <div className="bcm-detail-actions">
            <button type="button" onClick={onCreateChild} title="Tab">{t(language, "newChild")}</button>
            <button type="button" onClick={onGoParent} disabled={!parent} title="Shift + Tab">{t(language, "parent")}</button>
            <button type="button" onClick={() => onDeleteNode(node.id)} disabled={!parent}>{t(language, "deleteNode")}</button>
            <button type="button" onClick={onSummarize} disabled={!canUseAi} title={!canUseAi ? t(language, "missingApiKey") : undefined}>{t(language, "summarize")}</button>
          </div>
          <div className="bcm-composer-actions">
            {isPending ? (
              <button type="button" onClick={onCancel}>{t(language, "stop")}</button>
            ) : (
              <button type="button" onClick={onSend}>{t(language, "send")}</button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
