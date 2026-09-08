import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { AppLanguage, BranchSource } from "../types";
import { t } from "../i18n";
import { getMessageSelection } from "./messageSelection";

interface SelectionBranchHintProps {
  rootRef: RefObject<HTMLElement | null>;
  nodeId: string;
  enabled: boolean;
  language: AppLanguage;
  onCreateChild(text?: string, source?: BranchSource): void;
}

export function SelectionBranchHint({ rootRef, nodeId, enabled, language, onCreateChild }: SelectionBranchHintProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [hint, setHint] = useState<{ nodeId: string; text: string; source: BranchSource; left: number; top: number; width: number; doc: Document } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!enabled || !root) { setHint(null); return; }
    let unbind = () => {};
    const bind = () => {
      unbind();
      const doc = root.ownerDocument;
      const win = doc.defaultView;
      if (!win) return;
      let frame: number | undefined;
      const update = () => {
        frame = undefined;
        const selection = getMessageSelection(root);
        if (!selection) { setHint(null); return; }
        const bounds = root.getBoundingClientRect();
        const visible = [...selection.range.getClientRects()].filter((rect) => rect.height && rect.bottom > bounds.top && rect.top < bounds.bottom);
        const rect = visible.at(-1);
        if (!rect) { setHint(null); return; }
        const width = Math.max(0, Math.min(200, bounds.width - 16, win.innerWidth - 16));
        const height = buttonRef.current?.offsetHeight ?? 34;
        const lower = Math.min(bounds.bottom, win.innerHeight) - height - 8;
        const top = rect.bottom + 8 <= lower ? rect.bottom + 8 : rect.top - height - 8;
        setHint({
          nodeId, text: selection.text, source: selection.source, doc, width,
          left: Math.max(bounds.left + 8, Math.min(rect.left, bounds.right - width - 8, win.innerWidth - width - 8)),
          top: Math.max(8, bounds.top + 8, Math.min(top, lower)),
        });
      };
      const schedule = () => { frame ??= win.requestAnimationFrame(update); };
      const dismiss = (event: KeyboardEvent) => {
        if (event.key === "Escape" && getMessageSelection(root)) {
          doc.getSelection()?.removeAllRanges();
          setHint(null);
        }
      };
      doc.addEventListener("selectionchange", schedule);
      doc.addEventListener("focusin", schedule);
      doc.addEventListener("keydown", dismiss);
      doc.addEventListener("scroll", schedule, true);
      win.addEventListener("resize", schedule);
      schedule();
      unbind = () => {
        if (frame !== undefined) win.cancelAnimationFrame(frame);
        doc.removeEventListener("selectionchange", schedule);
        doc.removeEventListener("focusin", schedule);
        doc.removeEventListener("keydown", dismiss);
        doc.removeEventListener("scroll", schedule, true);
        win.removeEventListener("resize", schedule);
      };
    };
    bind();
    const view = root.closest<HTMLElement>(".spider-chat-view");
    const offMigration = view?.onWindowMigrated?.(bind);
    return () => { unbind(); offMigration?.(); };
  }, [enabled, nodeId, rootRef]);

  if (!enabled || !hint || hint.nodeId !== nodeId) return null;
  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      className="bcm-selection-branch-hint"
      style={{ left: hint.left, top: hint.top, maxWidth: hint.width }}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => {
        onCreateChild(hint.text, hint.source);
        hint.doc.getSelection()?.removeAllRanges();
        setHint(null);
      }}
    ><kbd>Tab</kbd> {t(language, "newChild")}</button>,
    hint.doc.body,
  );
}
