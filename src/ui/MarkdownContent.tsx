import { Component, MarkdownRenderer, type App } from "obsidian";
import { useEffect, useRef, type ReactElement } from "react";

interface MarkdownContentProps {
  app: App;
  markdown: string;
  sourcePath: string;
  className?: string;
  onRendered?: () => void;
}

export function MarkdownContent({ app, markdown, sourcePath, className, onRendered }: MarkdownContentProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const requestRenderRef = useRef<((markdown: string, onRendered?: () => void) => void) | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return undefined;
    }

    let cancelled = false;
    let rendering = false;
    let pending: { markdown: string; onRendered?: () => void } | null = null;
    let displayedComponent: Component | null = null;
    let renderingComponent: Component | null = null;

    const renderPending = async () => {
      if (rendering) return;
      rendering = true;
      while (pending && !cancelled) {
        const request = pending;
        pending = null;
        const component = new Component();
        renderingComponent = component;
        component.load();
        const rendered = root.ownerDocument.createElement("div");
        rendered.className = root.className;
        await MarkdownRenderer.render(app, request.markdown, rendered, sourcePath, component).catch(() => {
          rendered.textContent = request.markdown;
        });
        if (cancelled) {
          component.unload();
          break;
        }
        displayedComponent?.unload();
        root.replaceChildren(rendered);
        displayedComponent = component;
        renderingComponent = null;
        request.onRendered?.();
      }
      rendering = false;
    };

    requestRenderRef.current = (nextMarkdown, nextOnRendered) => {
      // Finish the current render so slow postprocessors cannot starve streaming updates.
      pending = { markdown: nextMarkdown, onRendered: nextOnRendered };
      void renderPending();
    };

    return () => {
      cancelled = true;
      requestRenderRef.current = null;
      displayedComponent?.unload();
      renderingComponent?.unload();
    };
  }, [app, sourcePath]);

  useEffect(() => {
    requestRenderRef.current?.(markdown, onRendered);
  }, [app, markdown, onRendered, sourcePath]);

  return <div className={className} ref={rootRef} />;
}
