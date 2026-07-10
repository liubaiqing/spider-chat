export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncateText(value: string, maxLength: number): string {
  const clean = cleanText(value);
  if (clean.length <= maxLength) {
    return clean;
  }

  return `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function markdownToPlainText(value: string): string {
  return cleanText(
    value
      .replace(/```[\s\S]*?```/g, " 代码 ")
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/^\s*>\s?/gm, "")
      .replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, "")
      .replace(/[|]/g, " · ")
      .replace(/[*_~`]/g, ""),
  );
}

export function escapeMermaid(value: string): string {
  return cleanText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll('"', "'")
    .replaceAll("#", "#35;")
    .replaceAll("[", "#91;")
    .replaceAll("]", "#93;")
    .replaceAll("(", "#40;")
    .replaceAll(")", "#41;")
    .replaceAll("{", "#123;")
    .replaceAll("}", "#125;");
}

export function slugifyFileName(value: string): string {
  const slug = cleanText(value)
    .replace(/[\\/:*?"<>|#^[\]]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return slug || "spider";
}
