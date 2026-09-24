import { useEffect, useId, useRef, useState, type ReactElement, type UIEvent } from "react";
import { reasoningSummaryLabel } from "../i18n";
import type { AppLanguage, MessageId } from "../types";

interface ReasoningBlockProps {
  messageId: MessageId;
  text: string;
  /** True while this message is still being generated. */
  streaming: boolean;
  /** True once any answer text has arrived, which is the cue to collapse. */
  hasAnswer: boolean;
  language: AppLanguage;
  /** Lets the reader panel keep the newest thinking in view. */
  onGrow(this: void): void;
}

/**
 * Chain-of-thought block for reasoning models. It stays open while the model is
 * thinking and folds away as soon as the answer starts, unless the reader pinned it
 * open. The text renders as plain pre-wrapped text: it is a trace, not an answer, so
 * it skips Markdown rendering and never re-enters the request or the export.
 */
export function ReasoningBlock({
  messageId,
  text,
  streaming,
  hasAnswer,
  language,
  onGrow,
}: ReasoningBlockProps): ReactElement | null {
  const [pinned, setPinned] = useState<boolean | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const panelId = `${useId().replace(/[^a-zA-Z0-9_-]/g, "")}-reasoning`;
  const body = text.trim();
  const thinking = streaming && !hasAnswer;
  const expanded = pinned ?? thinking;

  useEffect(() => {
    const element = bodyRef.current;
    if (!body || !thinking) return;
    if (element && followRef.current) {
      element.scrollTop = element.scrollHeight;
    }
    onGrow();
  }, [body, onGrow, thinking]);

  if (!body) {
    return null;
  }

  const handleScroll = (event: UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget;
    followRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  };

  return (
    <section className="bcm-reasoning" data-expanded={expanded ? "true" : "false"} data-spider-reasoning-id={messageId}>
      <button
        className="bcm-reasoning-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setPinned(!expanded)}
      >
        <span className="bcm-reasoning-caret" aria-hidden="true">▸</span>
        <span>{reasoningSummaryLabel(language, body.length, thinking)}</span>
      </button>
      {expanded ? (
        <div className="bcm-reasoning-text" id={panelId} ref={bodyRef} onScroll={handleScroll}>
          {body}
        </div>
      ) : null}
    </section>
  );
}
