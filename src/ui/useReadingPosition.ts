import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChatNode } from "../types";
import { findSourceRange } from "./messageSelection";

// Reading positions belong to this chat panel, not the exported knowledge map.
export function useReadingPosition(mapId: string, node: ChatNode, path: ChatNode[]) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { top: number; follow: boolean }>());
  const context = useRef<{ mapId: string; node: ChatNode; path: ChatNode[] } | null>(null);
  const restore = useRef<{ top: number; follow: boolean; source?: ChatNode } | null>(null);
  const follow = useRef(true);
  const source = useRef<ChatNode | null>(null);
  const highlightDoc = useRef<Document | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const highlightName = `spider-source-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const clearHighlight = useCallback(() => {
    const win = highlightDoc.current?.defaultView as (Window & typeof globalThis) | null;
    win?.CSS?.highlights?.delete(highlightName);
    source.current = null;
    clearTimeout(highlightTimer.current);
  }, [highlightName]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    const current = context.current;
    if (!el || !current) return;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollTop(el.scrollTop > 60);
    setShowScrollBottom(remaining > 40);
    if (!restore.current) {
      positions.current.set(`${current.mapId}:${current.node.id}`, { top: el.scrollTop, follow: follow.current });
    }
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || restore.current) return;
    follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    updateScrollState();
  }, [updateScrollState]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    restore.current = null;
    follow.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    updateScrollState();
  }, [updateScrollState]);

  const scrollToTop = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    restore.current = null;
    follow.current = false;
    el.scrollTo({ top: 0, behavior });
  }, []);

  const onRendered = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pending = restore.current;
    if (pending) {
      // Wait for all asynchronous Markdown blocks before restoring the old offset.
      if ([...el.querySelectorAll<HTMLElement>("[data-spider-markdown]")].some((item) => item.dataset.spiderMarkdownReady !== "true")) return;
      el.scrollTop = pending.follow ? el.scrollHeight : pending.top;
      follow.current = pending.follow;
      source.current = pending.source ?? null;
      restore.current = null;
    } else {
      const selection = el.ownerDocument.getSelection();
      const readingSelection = selection?.rangeCount && !selection.isCollapsed && el.contains(selection.getRangeAt(0).commonAncestorContainer);
      if (follow.current && !readingSelection) el.scrollTop = el.scrollHeight;
    }

    if (source.current) {
      const range = findSourceRange(el, source.current);
      const win = el.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      if (range && win?.Highlight && win.CSS?.highlights) {
        win.CSS.highlights.set(highlightName, new win.Highlight(range));
        highlightDoc.current = el.ownerDocument;
        if (pending) {
          const bounds = el.getBoundingClientRect();
          const target = range.getBoundingClientRect();
          if (target.top < bounds.top + 12 || target.bottom > bounds.bottom - 12) {
            el.scrollTop += target.top - bounds.top - Math.min(120, bounds.height / 3);
          }
          follow.current = false;
          highlightTimer.current = setTimeout(clearHighlight, 4000);
        }
      }
    }
    updateScrollState();
  }, [clearHighlight, highlightName, updateScrollState]);

  useLayoutEffect(() => {
    const previous = context.current;
    context.current = { mapId, node, path };
    if (previous?.mapId === mapId && previous.node.id === node.id) return;
    clearHighlight();
    const child = previous?.mapId === mapId
      ? previous.path.find((_, index) => previous.path[index - 1]?.id === node.id)
      : undefined;
    const remembered = positions.current.get(`${mapId}:${node.id}`);
    restore.current = {
      top: remembered?.top ?? 0,
      follow: child?.anchorText ? false : remembered?.follow ?? true,
      source: child?.anchorText ? child : undefined,
    };
    follow.current = false;
    const win = scrollRef.current?.ownerDocument.defaultView;
    const frame = win?.requestAnimationFrame(onRendered);
    return () => { if (frame !== undefined) win?.cancelAnimationFrame(frame); };
  }, [mapId, node.id, clearHighlight, onRendered]);

  useEffect(() => clearHighlight, [clearHighlight]);

  return { scrollRef, onScroll, onRendered, scrollToBottom, scrollToTop, showScrollTop, showScrollBottom, highlightName };
}
