import type { ChatMap, ChatNode } from "../types";

export type OnboardingGuideVariant = "ask" | "branch" | "child" | "done";

export function getOnboardingGuideVariant(
  map: ChatMap | null,
  node: ChatNode | null | undefined,
  dismissed: boolean,
): OnboardingGuideVariant | null {
  if (dismissed || !map || !node) {
    return null;
  }

  const hasUserMessage = node.messages.some((message) => message.role === "user");
  const hasAssistantMessage = node.messages.some((message) => message.role === "assistant");
  const hasAnchoredChild = Object.values(map.nodes).some((candidate) => candidate.id !== map.rootNodeId && Boolean(candidate.anchorText));

  if (node.anchorText && !hasUserMessage) {
    return "child";
  }

  if (!hasUserMessage) {
    return "ask";
  }

  if (hasAssistantMessage && !hasAnchoredChild) {
    return "branch";
  }

  if (hasAnchoredChild) {
    return "done";
  }

  return null;
}
