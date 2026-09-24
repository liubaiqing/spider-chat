import { describe, expect, it } from "vitest";
import { appendMessage, createMessage, createRootMap, updateNode } from "../src/domain/chatMap";
import { buildInteractiveHtml } from "../src/export/interactiveHtml";
import { plainTextFromMarkdown, renderMarkdownToSafeHtml } from "../src/export/safeMarkdown";

describe("interactive HTML export", () => {
  it("renders common Markdown with an allowlist and rejects unsafe links and raw HTML", () => {
    const html = renderMarkdownToSafeHtml([
      "# Heading",
      "",
      "A **bold** and *italic* [safe link](https://example.com) and [local](./notes.md).",
      "",
      "- first",
      "- second",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "[bad](javascript:alert(1)) <img src=x onerror=alert(1)>",
    ].join("\n"));

    expect(html).toContain("<h1>Heading</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="./notes.md"');
    expect(html).toContain("<ul><li>first</li><li>second</li></ul>");
    expect(html).toContain("<pre><code>const answer = 42;</code></pre>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(plainTextFromMarkdown("# Hello **there** [link](https://example.com)")).toBe("Hello there link");
  });

  it("embeds user content as inert JSON, renders replay/search/theme controls, and retains provenance", () => {
    let map = createRootMap("Export <script>alert('map')</script>");
    const rootId = map.rootNodeId;
    map = appendMessage(map, rootId, createMessage(
      "assistant",
      "</script><script>alert(1)</script>\n\n## Safe Markdown\n**formatted** [blocked](javascript:alert(1))",
    ));
    map = updateNode(map, rootId, { branchDirection: "Evidence <img src=x onerror=alert(1)>", mergeSources: [
      { nodeId: "deleted-source", titleSnapshot: "Deleted <script>source</script>" },
    ] });

    const html = buildInteractiveHtml(map, "en");

    expect(html).toContain('id="spider-data" type="application/json"');
    expect(html).toContain("\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
    expect(html).not.toContain("</script><script>alert(1)</script>");
    expect(html).toContain("\\u003ch2\\u003eSafe Markdown\\u003c/h2\\u003e");
    expect(html).toContain("\\u003cstrong\\u003eformatted\\u003c/strong\\u003e");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("id=\"search\"");
    expect(html).toContain("value=\"depth\"");
    expect(html).toContain("value=\"breadth\"");
    expect(html).toContain("id=\"play\"");
    expect(html).toContain("id=\"restore\"");
    expect(html).toContain("id=\"theme\"");
    expect(html).toContain("event.code === 'Space' && event.target instanceof Element");
    expect(html).toContain("event.target.closest('button,input,select,textarea,a,[role=\"button\"]')");
    expect(html).toContain("Direction: ");
    expect(html).toContain("Merge source");
    expect(html).toContain("Deleted \\u003cscript\\u003esource\\u003c/script\\u003e");
  });
});
