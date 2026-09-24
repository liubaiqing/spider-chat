import { getAncestorPath } from "../domain/chatMap";
import type { BranchChatMapSettings, ChatMap, ChatMessage, ChatNode, ContextMode } from "../types";
import { resolveContextMode } from "../settingsDefaults";

/**
 * Build context messages for a generation request. `parent` stays compact for
 * the default behavior; `ancestors` adds compressed older branches, while
 * `whole` retains the legacy behavior of including other nodes' transcripts.
 */
export function buildContextMessages(
  map: ChatMap,
  nodeId: string,
  mode: ContextMode | undefined,
  settings: BranchChatMapSettings,
): ChatMessage[] {
  const node = map.nodes[nodeId];
  if (!node) {
    return [];
  }

  const resolvedMode = resolveContextMode(settings, mode);
  if (resolvedMode === "none") {
    return [];
  }

  let messages: ChatMessage[];
  if (resolvedMode === "parent") {
    messages = compactParentContext(node, node.parentId ? map.nodes[node.parentId] : undefined);
  } else if (resolvedMode === "ancestors") {
    messages = ancestorContext(map, node, settings);
  } else {
    messages = wholeMapContext(map, nodeId);
  }

  return fitContextBudget(messages, settings.maxContextChars ?? 12000);
}

function compactParentContext(node: ChatNode, parent?: ChatNode): ChatMessage[] {
  if (!parent) {
    return [];
  }

  const context = [
    `Parent topic: ${parent.title}`,
    parent.summary ? `Parent summary: ${parent.summary}` : "",
    node.anchorText ? `Selected anchor: ${node.anchorText}` : "",
  ].filter(Boolean).join("\n");

  return [systemMessage(`Use this compact context for the child question.\n${context}`, `ctx_${parent.id}_compact`)];
}

function ancestorContext(map: ChatMap, node: ChatNode, settings: BranchChatMapSettings): ChatMessage[] {
  const ancestors = getAncestorPath(map, node.id).slice(0, -1);
  if (ancestors.length === 0) {
    return [];
  }

  const recentCount = Math.max(0, Math.floor(settings.contextRecentFull ?? 2));
  const fullFrom = Math.max(0, ancestors.length - recentCount);
  const truncateChars = Math.max(128, Math.floor(settings.contextTruncateChars ?? 2400));
  const result: ChatMessage[] = [];

  for (let index = 0; index < ancestors.length; index += 1) {
    const ancestor = ancestors[index];
    if (!ancestor) {
      continue;
    }

    if (index < fullFrom) {
      const fallbackTranscript = ancestor.messages
        .filter((message) => message.role !== "system")
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n");
      const summary = ancestor.summary?.trim()
        || truncate(fallbackTranscript, truncateChars)
        || "No conversation summary is available.";
      result.push(systemMessage(`[Compressed ancestor: ${ancestor.title}]\n${summary}`, `ctx_${ancestor.id}_summary`));
      continue;
    }

    result.push(systemMessage(`[Recent ancestor: ${ancestor.title}]`, `ctx_${ancestor.id}_header`));
    result.push(...ancestor.messages.map((message) => ({
      ...message,
      id: `ctx_${message.id}`,
    })));
  }

  return result;
}

function wholeMapContext(map: ChatMap, currentNodeId: string): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const otherNode of Object.values(map.nodes)) {
    if (otherNode.id === currentNodeId || otherNode.messages.length === 0) {
      continue;
    }

    result.push(systemMessage(`[Node: ${otherNode.title}]`, `ctx_${otherNode.id}_header`));
    result.push(...otherNode.messages.map((message) => ({
      ...message,
      id: `ctx_${message.id}`,
    })));
  }
  return result;
}

function fitContextBudget(messages: ChatMessage[], maxChars: number): ChatMessage[] {
  const budget = Math.max(256, Math.floor(maxChars));
  const totalChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalChars <= budget) {
    return messages;
  }

  // Keep the newest context when the map is too large. Messages stay in their
  // original order after selection so they can be read as a coherent history.
  let remaining = budget;
  const selected: ChatMessage[] = [];
  for (let index = messages.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const message = messages[index];
    if (!message) {
      continue;
    }
    if (message.content.length <= remaining) {
      selected.push(message);
      remaining -= message.content.length;
      continue;
    }

    selected.push({
      ...message,
      content: truncate(message.content, remaining),
    });
    remaining = 0;
  }
  return selected.reverse();
}

function systemMessage(content: string, id: string): ChatMessage {
  return { id, role: "system", content, createdAt: new Date().toISOString() };
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  if (maxChars <= 1) {
    return value.slice(0, maxChars);
  }
  return `${value.slice(0, maxChars - 1)}…`;
}
