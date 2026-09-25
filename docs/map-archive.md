# Spider Chat graph archive

Spider Chat stores each graph in one file under the vault's `Spider Graphs` folder. This path and the `.spider.json` format are kept for compatibility with existing maps:

`Spider Graphs/<URL-encoded map ID>.spider.json`

The filename uses the stable map ID, so renaming a graph does not create a second file. The file includes the graph title, nodes, positions, edges, summaries, notes, branch source references, and all user and assistant messages. It does not include API keys, API endpoints, system prompts, local reading position, or current in-flight responses. Those remain device-specific plugin state.

The UTF-8 JSON envelope is versioned:

```json
{
  "format": "spider-map",
  "version": 1,
  "map": {
    "id": "map_example",
    "title": "Example",
    "rootNodeId": "node_example",
    "nodes": {},
    "edges": [],
    "createdAt": "2026-09-25T00:00:00.000Z",
    "updatedAt": "2026-09-25T00:00:00.000Z"
  }
}
```

`map` is the current `ChatMap` structure; the example above only illustrates the envelope, not a valid map. Spider Chat discovers these files by scanning the folder, validates the map data, and opens them by map ID. Moving one archive to the same folder in another vault is enough to transfer its graph and chat history. Model profiles must be configured on that device before new AI requests can use them.

Old raw JSON maps in `.spider/maps` and `.branch-chat-map/maps` remain readable. On opening an old map, Spider Chat saves the new archive first and then removes that map's old file. A failed new write leaves the old file available. Exports remain separate in the configured export folder.

This format makes the graph portable; it does not coordinate simultaneous edits on multiple devices or resolve file conflicts produced by a sync provider.
