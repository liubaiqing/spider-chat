import type { ChatEdge } from "../types";

export interface GraphSvgCard {
  id: string;
  title: string;
  preview: string;
  previewLabel: string;
  statusLabel: string;
  x: number;
  y: number;
  color: string;
  root: boolean;
  notePath: string;
}

function xml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);
}

function wrapText(text: string, units: number, maxLines: number): string[] {
  const chars = [...text.replace(/\s+/g, " ").trim()];
  const lines: string[] = [];
  let line = "";
  let width = 0;
  // ponytail: conservative system-font widths; measure text if custom fonts are introduced.
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    const size = /\s/.test(char) ? 0.35 : /[MW@]/.test(char) ? 1 : /[A-Z]/.test(char) ? 0.75 : /[\x00-\xff]/.test(char) ? 0.6 : 1;
    if (width + size > units && line) {
      if (lines.length === maxLines - 1) {
        lines.push(line.trimEnd() + "…");
        return lines;
      }
      lines.push(line.trim());
      line = "";
      width = 0;
    }
    line += char;
    width += size;
  }
  if (line) lines.push(line.trim());
  return lines;
}

function textLines(lines: string[], x: number, y: number, lineHeight: number): string {
  return lines.map((line, index) => `<tspan x="${x}" y="${y + index * lineHeight}">${xml(line)}</tspan>`).join("");
}

export function renderGraphSvg(title: string, description: string, openNoteLabel: string, cards: GraphSvgCard[], edges: ChatEdge[]): string {
  const margin = 80;
  const header = 220;
  const cardWidth = 400;
  const cardHeight = 320;
  const width = Math.max(1000, ...cards.map((card) => card.x + cardWidth)) + margin * 2;
  const height = Math.max(cardHeight, ...cards.map((card) => card.y + cardHeight)) + header + margin;
  const byId = new Map(cards.map((card) => [card.id, card]));
  const palette: Record<string, string> = { "6": "#7256a8", "5": "#377e94", "4": "#377b59", "#9ca3af": "#667085" };
  const color = (card: GraphSvgCard) => palette[card.color] ?? "#377e94";

  const connectors = edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];
    const x1 = from.x + cardWidth;
    const y1 = from.y + cardHeight / 2;
    const x2 = to.x;
    const y2 = to.y + cardHeight / 2;
    const middle = (x1 + x2) / 2;
    return [`<path data-edge-id="${xml(edge.id)}" d="M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${x2 - 10} ${y2}" stroke="${color(to)}" stroke-width="2.5" fill="none" marker-end="url(#spider-arrow)"/>`];
  });

  const nodes = cards.map((card) => {
    const ink = card.root ? "#ffffff" : "#25324a";
    const muted = card.root ? "#efebf7" : "#536174";
    const href = card.notePath.split("/").map(encodeURIComponent).join("/");
    return `<g data-node-id="${xml(card.id)}" transform="translate(${card.x} ${card.y})">
      <title>${xml(card.title)}</title>
      <a href="${xml(href)}" aria-label="${xml(card.title + " · " + openNoteLabel)}">
        <rect width="${cardWidth}" height="${cardHeight}" rx="12" fill="${card.root ? "#66508f" : "#ffffff"}" stroke="${card.root ? "#66508f" : "#d7dfe8"}" stroke-width="1.5"/>
        <circle cx="28" cy="32" r="5" fill="${card.root ? "#dfd3f5" : color(card)}"/>
        <text x="44" y="38" font-size="18" fill="${muted}">${xml(card.statusLabel)}</text>
        <text font-size="30" font-weight="650" fill="${ink}">${textLines(wrapText(card.title, 11, 2), 24, 84, 38)}</text>
        <text x="24" y="158" font-size="16" fill="${muted}">${xml(card.previewLabel)}</text>
        <text font-size="22" fill="${muted}">${textLines(wrapText(card.preview, 15, 3), 24, 190, 30)}</text>
        <line x1="24" y1="274" x2="376" y2="274" stroke="${card.root ? "#9786b5" : "#e5eaf0"}"/>
        <text x="24" y="302" font-size="18" fill="${card.root ? "#ffffff" : color(card)}">${xml(openNoteLabel)}</text>
      </a>
    </g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="spider-map-title spider-map-desc">
  <title id="spider-map-title">${xml(title)}</title>
  <desc id="spider-map-desc">${xml(description)}</desc>
  <defs><marker id="spider-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#377e94" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>
  <style>text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; } a { cursor: pointer; }</style>
  <rect width="${width}" height="${height}" fill="#f6f8fb"/>
  <text font-size="44" font-weight="650" fill="#25324a">${textLines(wrapText(title, (width - margin * 2) / 44 - 1, 2), margin, 78, 52)}</text>
  <text font-size="22" fill="#536174">${textLines(wrapText(description, (width - margin * 2) / 22 - 1, 2), margin, 166, 30)}</text>
  <g transform="translate(${margin} ${header})">${connectors.join("\n")}${nodes.join("\n")}</g>
</svg>\n`;
}
