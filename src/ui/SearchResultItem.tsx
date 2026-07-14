import type { App } from "obsidian";
import { useCallback, type KeyboardEvent, type ReactElement } from "react";
import { displayTitle } from "../i18n";
import type { NodeSearchResult } from "../state/viewState";
import type { AppLanguage, NodeId } from "../types";
import { markdownToPlainText } from "../utils/text";
import { MarkdownContent } from "./MarkdownContent";

interface SearchResultItemProps {
  app: App;
  language: AppLanguage;
  result: NodeSearchResult;
  onActivate(this: void, nodeId: NodeId): void;
}

export function SearchResultItem({ app, language, result, onActivate }: SearchResultItemProps): ReactElement {
  const nodeId = result.node.id;
  const title = displayTitle(language, result.node.title);
  const accessibleSummary = markdownToPlainText(result.excerpt);

  const handleActivate = useCallback(() => {
    onActivate(nodeId);
  }, [nodeId, onActivate]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(nodeId);
    }
  }, [nodeId, onActivate]);

  return (
    <div
      className="bcm-search-result"
      role="button"
      tabIndex={0}
      aria-label={`${title}. ${accessibleSummary}`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <span className="bcm-search-result-title">{title}</span>
      <div className="bcm-search-result-summary-shell" inert>
        <MarkdownContent
          app={app}
          markdown={result.excerpt}
          sourcePath=""
          className="bcm-search-result-summary markdown-rendered"
        />
      </div>
    </div>
  );
}
