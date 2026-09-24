# Spider

[![GitHub release (latest)](https://img.shields.io/github/v/release/111pointer111/spider?style=flat-square)](https://github.com/111pointer111/spider/releases/latest)
[![GitHub downloads](https://img.shields.io/github/downloads/111pointer111/spider/total?style=flat-square)](https://github.com/111pointer111/spider/releases)
[![License](https://img.shields.io/github/license/111pointer111/spider?style=flat-square)](LICENSE)
[![Obsidian min version](https://img.shields.io/badge/Obsidian-%E2%89%A5%201.8.7-blueviolet?style=flat-square)](https://obsidian.md)
[![Obsidian Community](https://img.shields.io/badge/Obsidian-Community-blueviolet?style=flat-square)](https://community.obsidian.md/plugins/spider)

> 🌏 **Other languages**: [中文文档](README.zh-CN.md)

**AI conversations that branch like a spider's web — press `Tab` to spin off a deep-dive from any answer. Explore, compare, and trace back without losing context.**

An Obsidian plugin that turns ChatGPT / Claude / DeepSeek / any OpenAI-compatible API into a **branching knowledge map**. Read an AI answer, hit an unfamiliar term, select the text, press `Tab` — a child node appears, ready for the next question. Infinite depth, instant backtrack, one-click export to Obsidian Canvas / Markdown / Mermaid mindmap.

![spider screenshot](.github/screenshot.png)

> The screenshot shows the Chinese interface. Spider follows Obsidian's language on first install, and you can switch between Chinese and English at any time.

---

## 🤔 Why Spider?

| Scenario | Plain AI chat | Spider |
|---|---|---|
| Mid-answer, want to drill into a term | Copy-paste → new window → lose the original thread | Select text → `Tab` → child node carries the context |
| Want to compare 3 phrasings of the same question | Open 3 tabs and alt-tab | Same parent, 3 children, side-by-side |
| Done exploring, want it as notes | Copy-paste into a note, links break | Add personal node notes, then export Markdown + Canvas |
| Want AI to live inside your docs, not a separate tab | Constant window switching | Stay in Obsidian the entire time |

## ⚡ 30-Second Quick Start

1. **Install**: Settings → Community plugins → Browse → search `Spider` → Install → Enable
2. **Configure a model profile**: Settings → Spider → set the default profile's API URL, key, and model (any OpenAI-compatible endpoint)
3. **Create your first map**: Click the Spider ribbon icon (or run command `Spider: New Spider map`) → start chatting
4. **Try Tab-branching**: Select any text in an AI response, press `Tab` — that's it

---

## Advanced branching workflow

The graph and chat sidebar remain the live workspace. The ordinary select-text → `Tab` flow still creates one child immediately; advanced actions are available separately:

- **Model profiles**: keep several OpenAI-compatible model configurations. A child inherits its parent's default profile, and an individual reply can use another profile. Assistant messages record the model and profile label used at generation time.
- **Batch branches**: create up to five directions from one node, with a direction and model choice for each. Generation runs through a plugin-wide queue (three requests at once by default; configurable from one to five).
- **Context control**: choose no added context, a compact parent summary (the default), ancestor history, or the whole map. A one-request override does not change the default.
- **Reference merge**: create a summary child that cites other nodes without changing the graph's parent-child structure. References retain a title snapshot if the source is deleted.
- **Replay**: browse the existing conversation by time, depth, or breadth, with pause, step, and speed controls. Replay shows the current map's surviving messages; it does not reconstruct deleted edits or token-by-token generation.
- **Standalone HTML export**: export an offline, searchable map with replay and theme controls. The existing Markdown / Canvas / SVG export package keeps its file layout.

Existing Spider maps and single-model settings load through migration. This workflow does not use Obsidian's native Canvas as the live chat surface and does not import Canvas Branch Chat `.canvas` conversations.

---

## ✨ Features

### 🌳 Infinite-Depth Branching Chat
- **No depth limit**: drill down as deep as you need; the graph grows with you
- **Optional parent context**: child node requests automatically include parent title / summary / anchor
- **Streaming responses**: typewriter-style real-time rendering with Markdown & code-block highlighting
- **Select-to-branch**: highlight any text in an AI response → `Tab` → the child's "anchor" is that exact highlight
- **Selection hint**: selecting AI answer text shows a clickable “Tab Create branch” hint; clearing the selection hides it
- **Return to source**: parent and breadcrumb navigation restore your reading position and briefly highlight the source passage; other node switches retain their position for this session
- **Auxiliary actions**: retry, summarize, AI auto-title

### 🕸️ Interactive Knowledge Graph
- **Full-tab canvas** powered by React Flow
- **Click a node to switch context**; the chat panel follows automatically
- **Collapse / expand subtrees** to keep large maps clean
- **Auto-layout** via Dagre algorithm with active-path highlighting
- **Drag nodes** — positions persist, the canvas looks the way you left it
- **Personal node notes** — hover the pencil for a preview, click to pin and edit with autosave

### 📦 One-Click Structured Export

```
Spider Maps/
  ├── index.md                  # Obsidian entry-point note
  ├── brief.md                  # Findings, open questions, and progress
  ├── nodes/                    # One Markdown file per node
  ├── map.canvas                # Editable knowledge map
  └── map.svg                   # Sharp, shareable knowledge map image
```

- Canvas nodes are color-coded by state (purple = root / green = understood / gray = archived / blue = open)
- Canvas cards show concept titles, short previews, and links to full notes, with generous spacing
- Follow arrows to explore branches; source anchors stay in the notes instead of overlapping the graph
- SVG keeps card titles and previews visible at any zoom, with the same spacious layout
- Repeated exports create numbered snapshot folders, preserving earlier exports and handwritten additions
- Markdown files cross-link parent / child / index — backlinks wire up the full thinking chain

### 🔌 Works with Any OpenAI-Compatible API
- **Official OpenAI** (`https://api.openai.com/v1`)
- **DeepSeek / Moonshot / Qwen / GLM** (OpenAI-compatible mode)
- **OpenRouter / Together / Groq** (aggregator APIs)
- **Local LLMs**: Ollama, vLLM, LM Studio — all expose OpenAI-compatible endpoints
- **Anthropic Claude via proxy**

> 💡 Because it's the OpenAI Chat Completions spec, you just need a base URL + key + any model name that endpoint supports.

### 🔐 Privacy & Network Disclosure
- The plugin **requires network** to call AI, but **you fully control which endpoint**
- **API keys stay local** in Obsidian plugin settings or a selected `.env` source; requests send the key only to the endpoint you configure
- **Maps are 100% local**: stored as `.spider/maps/*.json`, syncable via Obsidian Sync
- **Offline-capable**: knowledge graph, navigation, export, history — everything works offline. Only "send message" needs network.

### 🌐 Bilingual UI
Spider follows Obsidian's language on first install. You can switch between Chinese and English at any time, and newly generated export artifacts use the current Spider interface language.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Tab` | With text selected in an AI response → create a branch from that source. On the focused map canvas → create an empty branch. |
| `Shift + Tab` | On the focused map canvas → go to the parent branch |
| `← →` | On the focused map canvas → parent ↔ first child |
| `↑ ↓` | On the focused map canvas → move between sibling nodes |
| `Enter` | Send message (inside composer) |
| `Shift + Enter` | Newline (inside composer) |
| `Esc` | Clear current selection |
| `Delete` / `Backspace` | On the focused map canvas → delete the current non-root node |

---

## ⚙️ Settings

| Setting | Description | Default |
|---|---|---|
| Model profiles | Alias, model, API root or full completion URL, key or `.env` key name, optional prompt and generation parameters | One migrated default profile |
| Default model profile | Profile inherited by new branches | Default profile |
| Context mode | None / compact parent / ancestors / whole map | Compact parent |
| Context limits | Older answer truncation and total context length | Configurable |
| Concurrent generations | Plugin-wide request limit | 3 (range 1–5) |
| Interface Language | Chinese / English | Follows Obsidian |
| Stream responses | Stream tokens as they arrive | ✅ on |
| Tab to create child nodes | Enable the Tab shortcut | ✅ on |
| Auto-summarize nodes | AI auto-summarizes each node | ❌ off |
| Default export folder | Where export packages go | `Spider Maps` |

---

## 📥 Installation

### From Community Plugins (recommended)

Open **Settings → Community plugins → Browse**, search for `Spider`, then select **Install → Enable**. Configure a default model profile under **Settings → Spider**.

### From GitHub Release (manual installation)
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [release](https://github.com/111pointer111/spider/releases/latest)
2. Create `<vault>/.obsidian/plugins/spider/`
3. Copy the three files into that directory
4. Restart Obsidian, enable Spider under **Settings → Community plugins**, then configure your API key and model

### From Source (development)
```bash
git clone https://github.com/111pointer111/spider
cd spider
npm install
npm run build
# Copy main.js, manifest.json, styles.css into
# <vault>/.obsidian/plugins/spider/
# Then enable the plugin in Obsidian
```

Or use `npm run link` to symlink the build output to your vault and pair with `npm run dev` for live-reload during development.

---

## 🛠 Development

```bash
npm install        # install dependencies
npm run dev        # watch mode (esbuild)
npm run build      # production build (runs tsc --noEmit first)
npm test           # run vitest tests
npm run test:browser # open the local URL and click Run source navigation checks (mock Obsidian API, no vault access)
npm run link       # symlink build output into your vault
```

### Project Structure

```
src/
  ai/          OpenAI-compatible provider, profile keys, and context builder
  domain/      ChatMap immutable factories + tree ops + guards + Dagre layout
  export/      Markdown / Mermaid / Canvas / SVG / JSON and standalone HTML exporters
  state/       Shared per-map document and request scheduler + per-view UI state
  storage/     Vault JSON persistence with stable map ID paths and legacy migration
  ui/          React components (graph, chat panel, gallery, modals)
  utils/       ID generation, path handling, activeDocument shim
tests/         vitest unit tests (domain + export + AI layers)
__mocks__/     Obsidian API stub for vitest
```

## 🧭 Roadmap (running list)

- [ ] Multi-select nodes + batch operations
- [ ] Node backlinks (auto-track "which nodes reference me")
- [ ] Custom system prompts
- [ ] Optional AI summary attached to export package

---

## 📜 License

[MIT](LICENSE)

---

## 🙏 Credits

- [Obsidian](https://obsidian.md) — the endlessly extensible note app
- [React Flow (@xyflow/react)](https://reactflow.dev/) — canvas engine
- [@dagrejs/dagre](https://github.com/dagrejs/dagre) — auto-layout
- [Feynman Technique](https://en.wikipedia.org/wiki/Feynman_technique) — the pedagogical idea: if you can't explain it simply, you don't understand it
