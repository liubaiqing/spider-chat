# Spider Chat

[简体中文](README.zh-CN.md) · [Map archive format](docs/map-archive.md) · [MIT license](LICENSE)

**Read an AI answer, follow a question, and keep the exploration as a navigable map inside Obsidian.**

Spider Chat builds on [Spider](https://github.com/111pointer111/spider) and keeps its direct “select text in an answer → press `Tab` → create a follow-up branch” workflow. The graph is the main view and chat stays in the right sidebar. It draws on ideas from [Canvas Branch Chat](https://github.com/p4nt1um/canvas-branch-chat), including model choice and context control, without using native Canvas as the live chat surface.

## How it differs from the source projects

| | Original Spider | Canvas Branch Chat | Spider Chat |
| --- | --- | --- | --- |
| Live workspace | Dedicated graph and chat sidebar | Native Canvas conversation nodes | Dedicated graph and sidebar, preserving Spider's `Tab` workflow |
| Models and context | Single-model settings and simpler context switches | Multiple models and ancestor context | Model profiles and per-request choice of model and four context modes |
| Reading a large map | Node navigation and auto-layout | Canvas navigation | Search, open-question filter, focus on current path, source-passage jump, and replay |
| Data and export | Spider maps and Markdown / Canvas / SVG package | `.canvas` conversations and other exports | Portable single-file `.spider.json` archives; existing export package plus offline interactive HTML |
| Generation | Single-request flow | Branch generation in Canvas | Per-node queue, cancellation, retry, and shared map state across views |

These are workflow choices, not a claim to contain every feature of both projects. Spider Chat does not include Canvas Branch Chat's batch branching, branch merge, or live Canvas chat, and it does not import its old `.canvas` conversations.

## Built for learning through follow-up questions

- **Follow the exact passage:** Select an unfamiliar phrase in an AI answer and press `Tab`. The new branch keeps its source text. Returning to the source can scroll to and briefly highlight that passage.
- **Compare models:** Configure multiple OpenAI-compatible model profiles. A child inherits its parent's model, with an optional override for a single request. Assistant messages keep a snapshot of the model actually used.
- **Control context:** Choose no additional context, a compact parent summary, the full ancestor chain, or the whole map. One-request overrides leave defaults untouched; compact parent is the default.
- **Find your way back:** Search titles, notes, summaries, anchors, and messages; filter open questions and reveal matching cards. Replay the surviving nodes in time, depth, or breadth order.
- **Turn answers into notes:** Summaries and personal notes appear separately; AI-generated summaries remain editable. The graph supports auto-layout, snapping, collapsed branches, and node status.
- **Move a map between devices:** A graph and its chat history live in `Spider Graphs/<map ID>.spider.json` inside the vault. Copy that file to the same folder on another device to read it. Configure model profiles and API keys separately on that device.

## Install and start

Spider Chat has its own plugin ID, `spider-chat`, and **is not currently listed in Obsidian's Community Plugins directory**. Build from source:

~~~bash
git clone https://github.com/liubaiqing/spider-chat.git
cd spider-chat
npm ci
npm run build
~~~

Copy the generated `main.js` and `styles.css`, plus `manifest.json`, into `<vault>/.obsidian/plugins/spider-chat/`. Restart Obsidian and enable Spider Chat in Settings → Community plugins. Obsidian 1.8.7 or later is required.

1. In Settings → Spider Chat, configure the default model's API URL, key, and model name. OpenAI-compatible Chat Completions endpoints are supported. Keys may also come from a `.env` file in the plugin folder or vault.
2. Use the ribbon icon to create a map and ask the first question.
3. Select text in the AI answer and press `Tab` to follow up; click a graph card to switch conversations.
4. Use the graph toolbar for search, replay, layout, and export. Right-click a node for its actions; long-press or `Shift+F10` also opens the menu.

### Moving from the original Spider

Spider Chat continues to read archives in `Spider Graphs` and can migrate legacy maps from `.spider/maps`. Because the plugin ID changed, **model settings do not copy automatically**. To keep them, close Obsidian, copy `<vault>/.obsidian/plugins/spider/data.json` to `<vault>/.obsidian/plugins/spider-chat/data.json`, reopen Obsidian, and check the settings. That file can contain API keys; never commit it to Git. Avoid editing the same map in both plugins at once.

## Exports and data

The Export menu offers four formats: the existing Markdown / Canvas / SVG package, standalone interactive HTML, one Markdown file, and Mermaid. HTML supports offline reading, search, replay, and theme switching. Archives are working data; exports are copies for reading and sharing. See the [archive format](docs/map-archive.md).

Archives exclude API keys, endpoints, and system prompts, but **include the full chat history**. Review an archive before sharing it. AI requests go to the endpoint you configure; browsing and exporting a saved map work offline.

## Development

~~~bash
npm ci
npm run build
npm test
npm run test:browser
~~~

`npm run link -- "<vault path>"` links build artifacts into that vault's `spider-chat` plugin directory. The `.gitignore` excludes build outputs, dependencies, vault folders, local plugin settings, and `.env` files.

## Credits and license

This project derives from [Spider](https://github.com/111pointer111/spider) and retains its MIT copyright notice. [Canvas Branch Chat](https://github.com/p4nt1um/canvas-branch-chat) informed the design and feature work. Both are independent projects; Spider Chat is not their official release or an official Obsidian plugin. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
