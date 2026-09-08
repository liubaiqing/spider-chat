import { isSourceTextRange } from "../domain/guards";
import type { BranchSource, ChatNode } from "../types";
import { cleanText } from "../utils/text";

const ASSISTANT_MESSAGE = ".bcm-message-assistant[data-spider-message-id]";

/** Build a range using UTF-16 offsets across all descendant text nodes. */
export function textRange(root: HTMLElement, start: number, end: number): Range | null {
  if (!isSourceTextRange({ start, end })) return null;
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = doc.createRange();
  let offset = 0;
  let started = false;
  let text = walker.nextNode();
  while (text) {
    const nextOffset = offset + (text.nodeValue?.length ?? 0);
    if (!started && start < nextOffset) {
      range.setStart(text, start - offset);
      started = true;
    }
    if (started && end <= nextOffset) {
      range.setEnd(text, end - offset);
      return range;
    }
    offset = nextOffset;
    text = walker.nextNode();
  }
  return null;
}

export function getMessageSelection(root: HTMLElement | null): { text: string; source: BranchSource; range: Range } | undefined {
  if (!root) return undefined;
  const doc = root.ownerDocument;
  const active = doc.activeElement;
  if (active && (active.matches("input, textarea") || ("isContentEditable" in active && active.isContentEditable))) {
    return undefined;
  }
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount !== 1) return undefined;
  const selected = selection.getRangeAt(0);
  if (selected.collapsed) return undefined;
  const startElement = selected.startContainer.nodeType === 1
    ? selected.startContainer as Element
    : selected.startContainer.parentElement;
  const body = startElement?.closest<HTMLElement>("[data-spider-message-body]");
  if (!body || !root.contains(body) || !body.contains(selected.startContainer) || !body.contains(selected.endContainer)) {
    return undefined;
  }
  const article = body.closest<HTMLElement>(ASSISTANT_MESSAGE);
  const messageId = article?.dataset.spiderMessageId;
  if (!article || !root.contains(article) || !messageId) return undefined;
  const raw = selected.toString();
  const text = raw.trim();
  if (!text) return undefined;
  const prefix = doc.createRange();
  prefix.selectNodeContents(body);
  prefix.setEnd(selected.startContainer, selected.startOffset);
  const start = prefix.toString().length + raw.length - raw.trimStart().length;
  const end = start + text.length;
  const range = textRange(body, start, end);
  return range ? { text, source: { messageId, start, end }, range } : undefined;
}

export function findSourceRange(root: HTMLElement, node: ChatNode): Range | null {
  const anchor = cleanText(node.anchorText ?? "");
  if (!anchor) return null;
  const messages = Array.from(root.querySelectorAll<HTMLElement>(ASSISTANT_MESSAGE));
  if (root.matches(ASSISTANT_MESSAGE)) messages.unshift(root);
  const hasSource = node.sourceMessageId !== undefined;
  const candidates = hasSource
    ? messages.filter((article) => article.dataset.spiderMessageId === node.sourceMessageId)
    : messages.reverse();
  // Match normalized whitespace while keeping the match's original UTF-16 indices.
  const pattern = new RegExp(anchor.split(" ").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "u");
  for (const article of candidates) {
    const body = article.querySelector<HTMLElement>("[data-spider-message-body]");
    if (!body || body.closest(ASSISTANT_MESSAGE) !== article) continue;
    if (hasSource && isSourceTextRange(node.sourceTextRange)) {
      const range = textRange(body, node.sourceTextRange.start, node.sourceTextRange.end);
      if (range && cleanText(range.toString()) === anchor) return range;
    }
    const match = pattern.exec(body.textContent ?? "");
    if (match) {
      // When the render has shifted, an ambiguous repeated term is not a safe fallback.
      if (hasSource && node.sourceTextRange && pattern.test((body.textContent ?? "").slice(match.index + 1))) return null;
      return textRange(body, match.index, match.index + match[0].length);
    }
  }
  return null;
}
