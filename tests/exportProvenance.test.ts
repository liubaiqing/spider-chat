import { describe, expect, it } from "vitest";
import { addChildNode, appendMessage, createMessage, createRootMap, updateNode } from "../src/domain/chatMap";
import { buildExportFiles, exportCanvas } from "../src/export/exporters";
import type { JsonCanvasFile } from "../src/export/exporters";

describe("export provenance", () => {
  it("includes direction, model, source and merge provenance without adding package files", () => {
    let map = createRootMap("Provenance map");
    const rootId = map.rootNodeId;
    const sourceMessage = createMessage("assistant", "Source answer");
    map = appendMessage(map, rootId, sourceMessage);
    const child = addChildNode(map, rootId);
    map = appendMessage(child.map, child.child.id, createMessage("assistant", "Branch answer"));
    map = updateNode(map, child.child.id, {
      title: "Evidence branch",
      branchDirection: "Check the evidence",
      defaultModelProfileId: "profile-1",
      sourceMessageId: sourceMessage.id,
      sourceTextRange: { start: 2, end: 8 },
      mergeSources: [
        { nodeId: rootId, titleSnapshot: "old root title" },
        { nodeId: "removed", titleSnapshot: "Removed source" },
      ],
    });

    const files = buildExportFiles(map, { modelProfiles: [
      { id: "profile-1", alias: "Writing model", model: "vendor/model", baseUrl: "https://example.com", apiKey: "" },
    ] });
    const canvas = JSON.parse(exportCanvas(map, { modelProfiles: [
      { id: "profile-1", alias: "Writing model", model: "vendor/model", baseUrl: "https://example.com", apiKey: "" },
    ] })) as JsonCanvasFile;
    const canvasNode = canvas.nodes.find((node) => node.id === child.child.id);
    const nodeFile = files.find((file) => file.path.startsWith("nodes/02-"));

    expect(files.map((file) => file.path)).toEqual([
      "index.md",
      "brief.md",
      expect.stringMatching(/^nodes\/01-/),
      expect.stringMatching(/^nodes\/02-/),
      "map.canvas",
      "map.svg",
    ]);
    expect(canvasNode?.type === "text" ? canvasNode.text : "").toContain("Check the evidence");
    expect(canvasNode?.type === "text" ? canvasNode.text : "").toContain("Writing model");
    expect(canvasNode?.type === "text" ? canvasNode.text : "").toContain("Removed source (来源已删除)");
    expect(nodeFile?.content).toContain("- 探索方向: Check the evidence");
    expect(nodeFile?.content).toContain("- 模型: Writing model");
    expect(nodeFile?.content).toContain("- 原始分支: [Root question](01-Root-question.md)");
    expect(nodeFile?.content).toContain("原始消息:");
    expect(nodeFile?.content).toContain("- 合并来源: Removed source (来源已删除)");
  });
});
