import type { ChatMap, ChatMessage, ChatNode, MergeSourceRef } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isPosition(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number";
}

export function isSourceTextRange(value: unknown): value is { start: number; end: number } {
  return isRecord(value)
    && typeof value.start === "number" && Number.isSafeInteger(value.start) && value.start >= 0
    && typeof value.end === "number" && Number.isSafeInteger(value.end) && value.end > value.start;
}

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    (value.role === "system" || value.role === "user" || value.role === "assistant") &&
    isString(value.content) &&
    isString(value.createdAt) &&
    (value.modelSnapshot === undefined || (isRecord(value.modelSnapshot) && isString(value.modelSnapshot.profileId) && isString(value.modelSnapshot.alias) && isString(value.modelSnapshot.model))) &&
    (value.state === undefined || value.state === "complete" || value.state === "stopped")
  );
}

function isMergeSourceRef(value: unknown): value is MergeSourceRef {
  return isRecord(value) && isString(value.nodeId) && isString(value.titleSnapshot) &&
    (value.messageId === undefined || isString(value.messageId));
}

export function isChatNode(value: unknown): value is ChatNode {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.id) &&
    (value.parentId === undefined || isString(value.parentId)) &&
    isString(value.title) &&
    (value.anchorText === undefined || isString(value.anchorText)) &&
    (value.sourceMessageId === undefined || isString(value.sourceMessageId)) &&
    (value.sourceTextRange === undefined || isSourceTextRange(value.sourceTextRange)) &&
    Array.isArray(value.messages) &&
    value.messages.every(isChatMessage) &&
    (value.summary === undefined || isString(value.summary)) &&
    (value.summaryEditedByUser === undefined || typeof value.summaryEditedByUser === "boolean") &&
    (value.note === undefined || isString(value.note)) &&
    (value.status === "open" || value.status === "understood" || value.status === "archived") &&
    isPosition(value.position) &&
    isStringArray(value.children) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
    && (value.defaultModelProfileId === undefined || isString(value.defaultModelProfileId))
    && (value.branchDirection === undefined || isString(value.branchDirection))
    && (value.branchColor === undefined || isString(value.branchColor))
    && (value.mergeSources === undefined || (Array.isArray(value.mergeSources) && value.mergeSources.every(isMergeSourceRef)))
  );
}

export function isChatMap(value: unknown): value is ChatMap {
  if (!isRecord(value) || !isRecord(value.nodes) || !Array.isArray(value.edges)) {
    return false;
  }

  const nodes = Object.values(value.nodes);

  return (
    isString(value.id) &&
    isString(value.title) &&
    isString(value.rootNodeId) &&
    nodes.every(isChatNode) &&
    value.edges.every((edge) => {
      return isRecord(edge) && isString(edge.id) && isString(edge.from) && isString(edge.to);
    }) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}
