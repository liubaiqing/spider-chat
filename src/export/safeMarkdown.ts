function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeHref(value: string): string | null {
  const href = value.trim();
  if (!href || /[\u0000-\u0020\\]/.test(href) || href.includes("&") || href.startsWith("//")) return null;
  if (/^(https?:\/\/|mailto:)/i.test(href)) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
  return href;
}

function renderInline(value: string): string {
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|(\x60[^\x60]+\x60)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~)/g;
  let output = "";
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(lastIndex, index));
    const token = match[0];
    if (match[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      output += href
        ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + renderInline(match[2]) + "</a>"
        : escapeHtml(token);
    } else if (match[4] !== undefined) {
      output += "<code>" + escapeHtml(match[4].slice(1, -1)) + "</code>";
    } else if (match[5] !== undefined || match[6] !== undefined) {
      output += "<strong>" + renderInline(match[5] ?? match[6] ?? "") + "</strong>";
    } else if (match[7] !== undefined || match[8] !== undefined) {
      output += "<em>" + renderInline(match[7] ?? match[8] ?? "") + "</em>";
    } else if (match[9] !== undefined) {
      output += "<del>" + renderInline(match[9]) + "</del>";
    }
    lastIndex = index + token.length;
  }
  return output + escapeHtml(value.slice(lastIndex));
}

function isBlank(value: string | undefined): boolean {
  return !value?.trim();
}

/** Render a useful Markdown subset while allowing only HTML generated here. */
export function renderMarkdownToSafeHtml(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s{0,3}(\x60{3,}|~{3,})\s*([\w+-]*)\s*$/);
    if (fence) {
      const fenceChar = fence[1]?.[0] ?? String.fromCharCode(96);
      const code: string[] = [];
      index += 1;
      while (index < lines.length) {
        const candidate = lines[index] ?? "";
        const isClosing = fenceChar === "~"
          ? /^\s{0,3}~{3,}\s*$/.test(candidate)
          : /^\s{0,3}\x60{3,}\s*$/.test(candidate);
        if (isClosing) break;
        code.push(candidate);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1]?.length ?? 1;
      blocks.push("<h" + level + ">" + renderInline(heading[2] ?? "") + "</h" + level + ">");
      index += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    const listItem = line.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const ordered = /^\d/.test(listItem[1] ?? "");
      const tag = ordered ? "ol" : "ul";
      const items: string[] = [];
      while (index < lines.length) {
        const next = lines[index]?.match(/^\s{0,3}([-+*]|\d+[.)])\s+(.+)$/);
        if (!next || /^\d/.test(next[1] ?? "") !== ordered) break;
        items.push("<li>" + renderInline(next[2] ?? "") + "</li>");
        index += 1;
      }
      blocks.push("<" + tag + ">" + items.join("") + "</" + tag + ">");
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      blocks.push("<blockquote>" + renderMarkdownToSafeHtml(quote.join("\n")) + "</blockquote>");
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (
      index < lines.length
      && !isBlank(lines[index])
      && !/^\s{0,3}(?:#{1,6}\s|\x60{3,}|~{3,}|[-+*]\s|\d+[.)]\s|>)/.test(lines[index] ?? "")
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push("<p>" + paragraph.map(renderInline).join("<br>") + "</p>");
  }

  return blocks.join("");
}

export function plainTextFromMarkdown(markdown: string): string {
  return markdown
    .replace(/\x60{3,}[\s\S]*?\x60{3,}/g, " ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/[*_~\x60]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
