import { describe, expect, it } from "vitest";
import { addChildNode, appendMessage, createMessage, createRootMap } from "../src/domain/chatMap";
import { getOnboardingGuideVariant } from "../src/ui/onboarding";

describe("getOnboardingGuideVariant", () => {
  it("returns no guide after onboarding is dismissed", () => {
    const map = createRootMap("Guide");
    const root = map.nodes[map.rootNodeId];

    expect(getOnboardingGuideVariant(map, root, true)).toBeNull();
  });

  it("guides empty nodes toward asking a first question", () => {
    const map = createRootMap("Guide");
    const root = map.nodes[map.rootNodeId];

    expect(getOnboardingGuideVariant(map, root, false)).toBe("ask");
  });

  it("guides answered nodes toward selecting text and branching", () => {
    const map = createRootMap("Guide");
    const withUser = appendMessage(map, map.rootNodeId, createMessage("user", "What is retrieval augmented generation?"));
    const withAssistant = appendMessage(withUser, map.rootNodeId, createMessage("assistant", "RAG grounds answers in retrieved sources."));
    const root = withAssistant.nodes[withAssistant.rootNodeId];

    expect(getOnboardingGuideVariant(withAssistant, root, false)).toBe("branch");
  });

  it("guides anchored child nodes toward asking a follow-up", () => {
    const map = createRootMap("Guide");
    const withChild = addChildNode(map, map.rootNodeId, { anchorText: "retrieved sources" });

    expect(getOnboardingGuideVariant(withChild.map, withChild.child, false)).toBe("child");
  });

  it("shows a completion guide after an anchored child has been created", () => {
    const map = createRootMap("Guide");
    const withUser = appendMessage(map, map.rootNodeId, createMessage("user", "What is retrieval augmented generation?"));
    const withAssistant = appendMessage(withUser, map.rootNodeId, createMessage("assistant", "RAG grounds answers in retrieved sources."));
    const withChild = addChildNode(withAssistant, withAssistant.rootNodeId, { anchorText: "retrieved sources" });
    const root = withChild.map.nodes[withChild.map.rootNodeId];

    expect(getOnboardingGuideVariant(withChild.map, root, false)).toBe("done");
  });
});
