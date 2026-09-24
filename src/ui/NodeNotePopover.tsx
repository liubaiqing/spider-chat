import { NodeToolbar, Position, useStore } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type ReactElement } from "react";
import { t } from "../i18n";
import type { AppLanguage, NodeId } from "../types";
import { markdownToPlainText, truncateText } from "../utils/text";

type SaveState = "idle" | "saving" | "saved";

interface NodeNotePopoverProps {
  nodeId: NodeId;
  note?: string;
  summary?: string;
  language: AppLanguage;
  pinned: boolean;
  preferLeft?: boolean;
  onActivate(this: void, nodeId: NodeId): void;
  onPinnedChange(this: void, nodeId: NodeId | null): void;
  onNoteChange(this: void, nodeId: NodeId, note: string): void;
  onSummaryChange(this: void, nodeId: NodeId, summary: string): void;
}

type EditMode = "note" | "summary";

const NOTE_PANEL_WIDTH = 288;
const NOTE_PANEL_GAP = 20;
const AUTOSAVE_DELAY = 600;
const HOVER_OPEN_DELAY = 240;
const HOVER_CLOSE_DELAY = 180;

function NoteIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none">
      <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m13 7 4 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function NodeNotePopover({
  nodeId,
  note,
  summary,
  language,
  pinned,
  preferLeft = false,
  onActivate,
  onPinnedChange,
  onNoteChange,
  onSummaryChange,
}: NodeNotePopoverProps): ReactElement {
  const [hovered, setHovered] = useState(false);
  const initialMode: EditMode = note?.trim() ? "note" : summary?.trim() ? "summary" : "note";
  const [mode, setMode] = useState<EditMode>(initialMode);
  const [draft, setDraft] = useState(initialMode === "summary" ? summary ?? "" : note ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const hoverTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const modeRef = useRef<EditMode>(initialMode);
  const valuesRef = useRef({ note: note ?? "", summary: summary ?? "" });
  const draftRef = useRef(initialMode === "summary" ? summary ?? "" : note ?? "");
  const savedValueRef = useRef(draftRef.current);
  const dirtyRef = useRef(false);
  const wasPinnedRef = useRef(pinned);

  const toolbarPosition = useStore(useCallback((state) => {
    const internalNode = state.nodeLookup.get(nodeId);
    const [translateX, , zoom] = state.transform;
    const absoluteX = internalNode?.internals.positionAbsolute.x ?? 0;
    const nodeWidth = internalNode?.measured.width ?? 300;
    const leftSpace = absoluteX * zoom + translateX;
    const rightSpace = state.width - (leftSpace + nodeWidth * zoom);

    if (preferLeft && leftSpace >= NOTE_PANEL_WIDTH + NOTE_PANEL_GAP) {
      return Position.Left;
    }
    if (rightSpace >= NOTE_PANEL_WIDTH + NOTE_PANEL_GAP || rightSpace >= leftSpace) {
      return Position.Right;
    }
    return Position.Left;
  }, [nodeId, preferLeft]));

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  const openHoverPreview = useCallback(() => {
    clearHoverTimer();
    setHovered(true);
  }, [clearHoverTimer]);

  const scheduleHoverOpen = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setHovered(true);
      hoverTimerRef.current = null;
    }, HOVER_OPEN_DELAY);
  }, [clearHoverTimer]);

  const scheduleHoverClose = useCallback(() => {
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      setHovered(false);
      hoverTimerRef.current = null;
    }, HOVER_CLOSE_DELAY);
  }, [clearHoverTimer]);

  const persistDraft = useCallback((value: string) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const normalized = value.trim() ? value.trimEnd() : "";
    if (normalized !== savedValueRef.current) {
      valuesRef.current[modeRef.current] = normalized;
      if (modeRef.current === "summary") onSummaryChange(nodeId, normalized);
      else onNoteChange(nodeId, normalized);
      savedValueRef.current = normalized;
    }
    dirtyRef.current = false;
    setSaveState("saved");
  }, [nodeId, onNoteChange, onSummaryChange]);

  const switchMode = useCallback((nextMode: EditMode) => {
    if (modeRef.current === nextMode) return;
    if (dirtyRef.current) persistDraft(draftRef.current);
    modeRef.current = nextMode;
    const nextValue = valuesRef.current[nextMode];
    draftRef.current = nextValue;
    savedValueRef.current = nextValue;
    setDraft(nextValue);
    setMode(nextMode);
    setSaveState("idle");
  }, [persistDraft]);

  const handleDraftChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.currentTarget.value;
    draftRef.current = value;
    dirtyRef.current = true;
    setDraft(value);
    setSaveState("saving");

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => persistDraft(draftRef.current), AUTOSAVE_DELAY);
  }, [persistDraft]);

  const handleTogglePinned = useCallback(() => {
    clearHoverTimer();
    setHovered(false);
    onActivate(nodeId);
    onPinnedChange(pinned ? null : nodeId);
  }, [clearHoverTimer, nodeId, onActivate, onPinnedChange, pinned]);

  const handleClose = useCallback(() => {
    if (dirtyRef.current) {
      persistDraft(draftRef.current);
    }
    setHovered(false);
    onPinnedChange(null);
  }, [onPinnedChange, persistDraft]);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleClose();
      return;
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      persistDraft(draftRef.current);
    }
  }, [handleClose, persistDraft]);

  useEffect(() => {
    if (!dirtyRef.current || modeRef.current !== "note") valuesRef.current.note = note ?? "";
    if (!dirtyRef.current || modeRef.current !== "summary") valuesRef.current.summary = summary ?? "";
    if (dirtyRef.current) return;
    if (modeRef.current === "note" && !note?.trim() && summary?.trim() && !pinned) {
      modeRef.current = "summary";
      setMode("summary");
    }
    const nextValue = valuesRef.current[modeRef.current];
    if (nextValue !== savedValueRef.current) {
      setDraft(nextValue);
      draftRef.current = nextValue;
      savedValueRef.current = nextValue;
      setSaveState("idle");
    }
  }, [note, pinned, summary]);

  useEffect(() => {
    if (wasPinnedRef.current && !pinned && dirtyRef.current) {
      persistDraft(draftRef.current);
    }
    wasPinnedRef.current = pinned;
  }, [persistDraft, pinned]);

  useEffect(() => {
    return () => {
      clearHoverTimer();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (dirtyRef.current) {
        const normalized = draftRef.current.trim() ? draftRef.current.trimEnd() : "";
        if (modeRef.current === "summary") onSummaryChange(nodeId, normalized);
        else onNoteChange(nodeId, normalized);
      }
    };
  }, [clearHoverTimer, nodeId, onNoteChange, onSummaryChange]);

  const hasContent = Boolean(note?.trim() || summary?.trim() || draft.trim());
  const preview = hasContent ? truncateText(markdownToPlainText(note?.trim() || summary?.trim() || draft), 180) : t(language, "nodeNoteEmpty");
  const isVisible = pinned || hovered;

  return (
    <>
      <button
        className={`bcm-node-note-trigger nodrag ${hasContent ? "has-note" : ""} ${pinned ? "is-pinned" : ""}`}
        type="button"
        aria-label={t(language, note?.trim() ? "editNodeNote" : summary?.trim() ? "editNodeSummary" : "addNodeNote")}
        aria-expanded={isVisible}
        onClick={(event) => {
          event.stopPropagation();
          handleTogglePinned();
        }}
        onFocus={openHoverPreview}
        onBlur={scheduleHoverClose}
        onMouseEnter={scheduleHoverOpen}
        onMouseLeave={scheduleHoverClose}
      >
        <NoteIcon />
      </button>

      <NodeToolbar
        className="bcm-node-note-toolbar"
        isVisible={isVisible}
        position={toolbarPosition}
        align="start"
        offset={12}
      >
        <section
          className={`bcm-node-note-popover nodrag nopan nowheel ${pinned ? "is-pinned" : "is-preview"}`}
          aria-label={t(language, mode === "summary" ? "summary" : "nodeNote")}
          onClick={(event) => event.stopPropagation()}
          onMouseEnter={openHoverPreview}
          onMouseLeave={scheduleHoverClose}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <header className="bcm-node-note-header">
            <span>{t(language, mode === "summary" ? "summary" : "nodeNote")}</span>
            {pinned ? (
              <button
                className="bcm-node-note-close"
                type="button"
                aria-label={t(language, "closeNodeNote")}
                title={t(language, "closeNodeNote")}
                onClick={handleClose}
              >
                ×
              </button>
            ) : null}
          </header>

          {pinned ? (
            <>
              <div className="bcm-node-note-tabs" role="group" aria-label={t(language, "details")}>
                <button type="button" aria-pressed={mode === "summary"} onClick={() => switchMode("summary")}>{t(language, "summary")}</button>
                <button type="button" aria-pressed={mode === "note"} onClick={() => switchMode("note")}>{t(language, "nodeNote")}</button>
              </div>
              <textarea
                autoFocus
                className="bcm-node-note-editor nodrag nopan nowheel"
                data-spider-note-editor="true"
                value={draft}
                placeholder={t(language, mode === "summary" ? "summaryPlaceholder" : "nodeNotePlaceholder")}
                onChange={handleDraftChange}
                onKeyDown={handleEditorKeyDown}
              />
              <div className="bcm-node-note-save-state" aria-live="polite">
                {saveState === "saving" ? t(language, "noteSaving") : saveState === "saved" ? t(language, "noteSaved") : ""}
              </div>
            </>
          ) : (
            <button className="bcm-node-note-preview" type="button" onClick={handleTogglePinned}>
              {preview}
            </button>
          )}
        </section>
      </NodeToolbar>
    </>
  );
}
