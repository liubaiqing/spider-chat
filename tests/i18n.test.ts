import { describe, expect, it } from "vitest";
import {
  branchesCountLabel,
  confirmDeleteSubtreeLabel,
  displayTitle,
  mapStatsLabel,
  nodeStatsLabel,
  nodesCountLabel,
  roleLabel,
  statusLabel,
} from "../src/i18n";

describe("English interface copy", () => {
  it("localizes legacy default titles in both directions", () => {
    expect(displayTitle("en", "未命名对话图谱")).toBe("Untitled chat map");
    expect(displayTitle("en", "根问题")).toBe("Root question");
    expect(displayTitle("zh-CN", "Untitled question")).toBe("未命名问题");
  });

  it("uses natural role and status labels", () => {
    expect(statusLabel("en", "open")).toBe("Open");
    expect(roleLabel("en", "user")).toBe("You");
    expect(roleLabel("en", "assistant")).toBe("AI");
  });

  it("applies English singular and plural forms", () => {
    expect(nodesCountLabel("en", 1)).toBe("1 node");
    expect(nodesCountLabel("en", 2)).toBe("2 nodes");
    expect(branchesCountLabel("en", 1)).toBe("1 branch");
    expect(mapStatsLabel("en", 1, 0)).toBe("1 node · depth 0");
    expect(nodeStatsLabel("en", 1, 1)).toBe("1 message · 1 branch");
    expect(confirmDeleteSubtreeLabel("en", 1)).toBe("Delete the current node and its 1 branch? This cannot be undone.");
  });
});
