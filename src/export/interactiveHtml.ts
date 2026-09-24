import type { AppLanguage, ChatMap } from "../types";
import { plainTextFromMarkdown, renderMarkdownToSafeHtml } from "./safeMarkdown";

interface SafeMarkdown {
  source: string;
  html: string;
}

interface InteractiveNode {
  id: string;
  parentId?: string;
  title: string;
  createdAt: string;
  direction?: string;
  model?: string;
  summary?: SafeMarkdown;
  note?: SafeMarkdown;
  anchorText?: SafeMarkdown;
  messages: Array<{ role: string; content: SafeMarkdown; createdAt: string }>;
  mergeSources: Array<{ nodeId: string; titleSnapshot: string }>;
  searchText: string;
}

function latestModel(map: ChatMap, nodeId: string): string | undefined {
  const node = map.nodes[nodeId];
  if (!node) return undefined;
  const latest = [...node.messages].reverse().find((message) => message.role === "assistant" && message.modelSnapshot);
  return latest?.modelSnapshot?.alias || latest?.modelSnapshot?.model;
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/**
 * Build an offline page from inert escaped JSON and allowlist-rendered Markdown.
 */
export function buildInteractiveHtml(map: ChatMap, language: AppLanguage = "zh-CN"): string {
  const markdown = (value?: string): SafeMarkdown | undefined => value === undefined
    ? undefined
    : { source: value, html: renderMarkdownToSafeHtml(value) };
  const nodes = Object.values(map.nodes).map((node): InteractiveNode => ({
    id: node.id,
    parentId: node.parentId,
    title: node.title,
    createdAt: node.createdAt,
    direction: node.branchDirection,
    model: latestModel(map, node.id),
    summary: markdown(node.summary),
    note: markdown(node.note),
    anchorText: markdown(node.anchorText),
    messages: node.messages.map((message) => ({
      role: message.role,
      content: markdown(message.content)!,
      createdAt: message.createdAt,
    })),
    mergeSources: (node.mergeSources ?? []).map(({ nodeId, titleSnapshot }) => ({ nodeId, titleSnapshot })),
    searchText: plainTextFromMarkdown([
      node.title,
      node.branchDirection,
      node.summary,
      node.note,
      node.anchorText,
      ...node.messages.map((message) => message.content),
      ...(node.mergeSources ?? []).map((source) => source.titleSnapshot),
    ].filter((value): value is string => Boolean(value)).join(" ")),
  }));
  const payload = safeJsonForHtml({ mapTitle: map.title, rootNodeId: map.rootNodeId, nodes });
  const english = language === "en";
  const runtime = [
    "(() => {",
    "  'use strict';",
    "  const data = JSON.parse(document.getElementById('spider-data').textContent || '{}');",
    "  const nodes = Array.isArray(data.nodes) ? data.nodes : [];",
    "  const byId = new Map(nodes.map((node) => [node.id, node]));",
    "  const title = document.getElementById('title');",
    "  const cards = document.getElementById('cards');",
    "  const search = document.getElementById('search');",
    "  const mode = document.getElementById('mode');",
    "  const speed = document.getElementById('speed');",
    "  const progress = document.getElementById('progress');",
    "  const empty = document.getElementById('empty');",
    "  const playButton = document.getElementById('play');",
    "  const isEnglish = " + String(english) + ";",
    "  title.textContent = data.mapTitle || 'Spider';",
    "  let order = []; let step = -1; let timer = 0; let running = false; let rendered = [];",
    "  const plain = (value) => String(value || '');",
    "  const section = (card, heading, content) => {",
    "    if (!content || !content.source) return;",
    "    const block = document.createElement('section'); block.className = 'section';",
    "    const label = document.createElement('h3'); label.textContent = heading;",
    "    const body = document.createElement('div'); body.className = 'body markdown'; body.innerHTML = content.html;",
    "    block.append(label, body); card.append(block);",
    "  };",
    "  function buildCard(node) {",
    "    const card = document.createElement('article'); card.className = 'card'; card.dataset.nodeId = plain(node.id);",
    "    const heading = document.createElement('h2'); heading.textContent = plain(node.title); card.append(heading);",
    "    const meta = document.createElement('div'); meta.className = 'meta';",
    "    if (node.direction) { const pill = document.createElement('span'); pill.textContent = (isEnglish ? 'Direction: ' : '方向：') + plain(node.direction); meta.append(pill); }",
    "    if (node.model) { const pill = document.createElement('span'); pill.textContent = (isEnglish ? 'Model: ' : '模型：') + plain(node.model); meta.append(pill); }",
    "    const date = document.createElement('span'); date.textContent = new Date(node.createdAt).toLocaleString(); meta.append(date); card.append(meta);",
    "    section(card, isEnglish ? 'Note' : '笔记', node.note);",
    "    section(card, isEnglish ? 'Summary' : '总结', node.summary);",
    "    section(card, isEnglish ? 'Source text' : '原文', node.anchorText);",
    "    for (const source of node.mergeSources || []) {",
    "      const sourceNode = byId.get(source.nodeId);",
    "      const block = document.createElement('section'); block.className = 'section';",
    "      const label = document.createElement('h3'); label.textContent = isEnglish ? 'Merge source' : '合并来源';",
    "      const body = document.createElement('p'); body.className = 'body';",
    "      body.textContent = (sourceNode ? sourceNode.title : source.titleSnapshot) + (sourceNode ? '' : (isEnglish ? ' (missing)' : '（已删除）'));",
    "      if (!sourceNode) body.classList.add('missing'); block.append(label, body); card.append(block);",
    "    }",
    "    for (const message of node.messages || []) {",
    "      const item = document.createElement('section'); item.className = 'message';",
    "      const role = document.createElement('div'); role.className = 'role';",
    "      role.textContent = message.role === 'user' ? (isEnglish ? 'You' : '你') : message.role === 'assistant' ? 'AI' : (isEnglish ? 'System' : '系统');",
    "      const body = document.createElement('div'); body.className = 'body markdown'; body.innerHTML = message.content.html;",
    "      item.append(role, body); card.append(item);",
    "    }",
    "    return card;",
    "  }",
    "  function computeOrder() {",
    "    const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));",
    "    if (mode.value === 'depth' || mode.value === 'breadth') {",
    "      const result = []; const seen = new Set(); const queue = [data.rootNodeId];",
    "      while (queue.length) {",
    "        const id = mode.value === 'depth' ? queue.pop() : queue.shift();",
    "        if (!id || seen.has(id) || !byId.has(id)) continue;",
    "        seen.add(id); result.push(id);",
    "        const children = nodes.filter((node) => node.parentId === id).map((node) => node.id);",
    "        if (mode.value === 'depth') queue.push(...children.reverse()); else queue.push(...children);",
    "      }",
    "      for (const node of nodes) if (!seen.has(node.id)) result.push(node.id);",
    "      return result;",
    "    }",
    "    return [...nodes].sort((left, right) => {",
    "      const delta = Date.parse(left.createdAt) - Date.parse(right.createdAt);",
    "      return (Number.isFinite(delta) ? delta : 0) || originalIndex.get(left.id) - originalIndex.get(right.id);",
    "    }).map((node) => node.id);",
    "  }",
    "  function update() {",
    "    const query = search.value.trim().toLocaleLowerCase(); let visibleCount = 0;",
    "    rendered.forEach(({ id, element, searchText }) => {",
    "      const allowedByReplay = step < 0 || order.indexOf(id) <= step;",
    "      element.hidden = !(allowedByReplay && (!query || searchText.includes(query)));",
    "      if (!element.hidden) visibleCount += 1;",
    "    });",
    "    empty.hidden = visibleCount > 0;",
    "    progress.textContent = step < 0 ? (isEnglish ? 'All nodes' : '全部节点') : (isEnglish ? 'Node ' + (step + 1) + ' of ' + order.length : '第 ' + (step + 1) + ' / ' + order.length + ' 个节点');",
    "    playButton.textContent = running ? (isEnglish ? 'Pause' : '暂停') : (isEnglish ? 'Play' : '播放');",
    "    playButton.setAttribute('aria-label', running ? (isEnglish ? 'Pause replay' : '暂停回放') : (isEnglish ? 'Play replay' : '播放回放'));",
    "  }",
    "  function rebuild() {",
    "    running = false; clearTimeout(timer); order = computeOrder(); step = -1;",
    "    rendered = nodes.map((node) => {",
    "      const element = buildCard(node);",
    "      const searchable = [node.searchText, node.model].join(' ').toLocaleLowerCase();",
    "      return { id: node.id, element, searchText: searchable };",
    "    });",
    "    cards.replaceChildren(...rendered.map((item) => item.element)); update();",
    "  }",
    "  function setStep(next) { step = Math.max(0, Math.min(order.length - 1, next)); update(); }",
    "  function tick() {",
    "    if (step >= order.length - 1) { running = false; update(); return; }",
    "    setStep(step < 0 ? 0 : step + 1); timer = setTimeout(tick, 1600 / Number(speed.value || 1));",
    "  }",
    "  document.getElementById('previous').addEventListener('click', () => { running = false; clearTimeout(timer); setStep(step <= 0 ? 0 : step - 1); });",
    "  document.getElementById('next').addEventListener('click', () => { running = false; clearTimeout(timer); setStep(step < 0 ? 0 : step + 1); });",
    "  playButton.addEventListener('click', () => { if (running) { running = false; clearTimeout(timer); update(); } else { if (step >= order.length - 1) step = -1; running = true; tick(); } });",
    "  document.getElementById('restore').addEventListener('click', () => { running = false; clearTimeout(timer); step = -1; update(); });",
    "  document.getElementById('theme').addEventListener('click', () => { document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; });",
    "  mode.addEventListener('change', rebuild); search.addEventListener('input', update);",
    "  speed.addEventListener('change', () => { if (running) { clearTimeout(timer); timer = setTimeout(tick, 1600 / Number(speed.value || 1)); } });",
    "  document.addEventListener('keydown', (event) => {",
    "    if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button,input,select,textarea,a,[role=\"button\"]')) return;",
    "    if (event.target === search || event.target instanceof HTMLSelectElement) return;",
    "    if (event.key === 'ArrowLeft') { event.preventDefault(); document.getElementById('previous').click(); }",
    "    else if (event.key === 'ArrowRight') { event.preventDefault(); document.getElementById('next').click(); }",
    "    else if (event.code === 'Space') { event.preventDefault(); playButton.click(); }",
    "    else if (event.key === 'Escape') { event.preventDefault(); document.getElementById('restore').click(); }",
    "  });",
    "  rebuild(); document.body.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';",
    "})();",
  ].join("\n");
  const labels = english
    ? { offline: "Offline Spider map", controls: "Map controls", search: "Search nodes and messages", order: "Order", time: "Time", depth: "Depth first", breadth: "Breadth first", previous: "Previous step", play: "Play replay", next: "Next step", speed: "Speed", restore: "Restore all", noResults: "No matching nodes.", theme: "Toggle theme" }
    : { offline: "Spider 离线图谱", controls: "图谱控制", search: "搜索节点和消息", order: "顺序", time: "时间", depth: "深度优先", breadth: "广度优先", previous: "上一步", play: "播放回放", next: "下一步", speed: "速度", restore: "显示全部", noResults: "没有匹配的节点。", theme: "切换主题" };

  return [
    "<!doctype html>",
    '<html lang="' + (english ? "en" : "zh-CN") + '">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Spider</title>",
    "<style>",
    ":root{color-scheme:light dark;--bg:#f5f7fb;--card:#fff;--text:#172033;--muted:#586579;--line:#d8deea;--accent:#6054d9;--soft:#eeecff;--danger:#a43c48;font:16px/1.55 system-ui,-apple-system,\"Segoe UI\",sans-serif}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text)}body[data-theme=dark]{--bg:#151a24;--card:#202735;--text:#edf1fa;--muted:#aab5c8;--line:#394357;--accent:#b0a7ff;--soft:#312c4c;--danger:#ff9aa5;color-scheme:dark}.shell{max-width:1000px;margin:auto;padding:24px 18px 56px}.header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.header h1{font-size:clamp(22px,4vw,34px);line-height:1.2;margin:0 0 8px;overflow-wrap:anywhere}.header p{color:var(--muted);margin:0}.toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:20px 0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--card)}button,select,input{font:inherit;color:inherit}button,select{min-height:42px;border:1px solid var(--line);border-radius:8px;background:var(--card);padding:7px 11px}button{cursor:pointer}button:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid color-mix(in srgb,var(--accent) 55%,transparent);outline-offset:2px}.toolbar label{display:flex;gap:6px;align-items:center;color:var(--muted);font-size:13px}.search{flex:1 1 220px;min-width:150px;min-height:42px;border:1px solid var(--line);border-radius:8px;padding:8px 11px;background:var(--card)}.progress{color:var(--muted);min-width:110px;text-align:center}.cards{display:grid;gap:12px}.card{border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:12px;background:var(--card);padding:16px;overflow-wrap:anywhere}.card[hidden]{display:none}.card h2{font-size:19px;margin:0 0 8px}.meta{display:flex;flex-wrap:wrap;gap:6px 12px;color:var(--muted);font-size:13px;margin:0 0 10px}.meta span{background:var(--soft);border-radius:999px;padding:2px 8px}.section{margin-top:10px}.section h3{font-size:13px;color:var(--muted);margin:0 0 4px}.body{white-space:pre-wrap;margin:0}.message{border-top:1px solid var(--line);padding-top:10px;margin-top:10px}.role{font-size:12px;font-weight:650;color:var(--accent);margin-bottom:3px}.missing{color:var(--danger)}.empty{padding:28px;text-align:center;color:var(--muted);border:1px dashed var(--line);border-radius:12px}@media(max-width:600px){.shell{padding:16px 12px 36px}.header{align-items:center}.toolbar{gap:7px}.toolbar>*{flex:1 1 auto}.toolbar .search{flex-basis:100%}.progress{min-width:100%;order:3}.card{padding:13px}}",
    "</style>",
    "</head>",
    "<body>",
    '<main class="shell">',
    '<header class="header"><div><h1 id="title"></h1><p>' + labels.offline + '</p></div><button id="theme" type="button" aria-label="' + labels.theme + '">' + (english ? "Theme" : "主题") + '</button></header>',
    '<section class="toolbar" aria-label="' + labels.controls + '">',
    '<input class="search" id="search" type="search" placeholder="' + labels.search + '" aria-label="' + labels.search + '">',
    '<label>' + labels.order + '<select id="mode" aria-label="' + labels.order + '"><option value="time">' + labels.time + '</option><option value="depth">' + labels.depth + '</option><option value="breadth">' + labels.breadth + '</option></select></label>',
    '<button id="previous" type="button" aria-label="' + labels.previous + '">◀</button>',
    '<button id="play" type="button" aria-label="' + labels.play + '">' + (english ? "Play" : "播放") + '</button>',
    '<button id="next" type="button" aria-label="' + labels.next + '">▶</button>',
    '<label>' + labels.speed + '<select id="speed" aria-label="' + labels.speed + '"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select></label>',
    '<button id="restore" type="button">' + labels.restore + '</button><span class="progress" id="progress" aria-live="polite"></span>',
    '</section><section class="cards" id="cards" aria-live="polite"></section><div class="empty" id="empty" hidden>' + labels.noResults + '</div>',
    "</main>",
    '<script id="spider-data" type="application/json">' + payload + "</script>",
    "<script>",
    runtime,
    "</script>",
    "</body>",
    "</html>",
  ].join("\n");
}
