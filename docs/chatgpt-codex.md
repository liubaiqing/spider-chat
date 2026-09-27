# ChatGPT through Codex

Spider Chat can use your locally signed-in ChatGPT account through the official
[Codex App Server](https://developers.openai.com/codex/app-server/). This is a
desktop-only connection option alongside the existing OpenAI-compatible API.
Availability and usage limits follow your Codex account.

## Setup

1. Install Codex CLI or Codex desktop and run `codex login` with your ChatGPT account.
2. In **Settings → Spider Chat → Models**, select **ChatGPT / Codex** as the connection.
3. Leave the executable path empty for automatic detection, or specify the Codex
   executable. On Windows, native executables and standard npm installations are
   supported without running a command shell. Custom wrappers should point to
   their underlying native executable instead.
4. Refresh the model list and select a model. Reasoning-effort choices come from
   that model's live catalog; **Automatic** leaves the model default unchanged.
   A manually entered model ID is sent unchanged. Connection testing verifies it
   against the available catalog.
5. Test the connection, make the profile the default if desired, and chat normally.

No API key is required or resolved for this connection. Codex owns login and token
refresh; Spider Chat never reads or copies its authentication files. Connection
testing checks account and catalog access without generating an answer. Temperature,
token-limit and HTTP thinking-switch options apply only to API profiles.

## Conversation behavior

- Chat, streaming, titles and summaries use the same connection. Supplied reasoning
  summaries are displayed separately from the answer. Process commentary is not
  saved as the answer, and completed-item text is not duplicated after streaming.
- Each request starts an ephemeral Codex thread with the context already selected
  and budgeted by Spider Chat. This preserves branch isolation, edits, retries and
  all four context modes. It does not reuse unrelated native Codex conversations.
- System instructions remain separate from serialized conversation history.
  Stored reasoning is never replayed as history.
- Stop interrupts the turn and closes its dedicated process; startup cancellation,
  process exit, timeouts and failed turns also clean up the connection. Unloading
  the plugin closes all active Codex connections.
- The client requests a read-only sandbox in a temporary working directory and
  instructs Codex to answer conversationally. It declines command/file approvals
  and unsupported interactive requests. **Read-only does not mean text-only:**
  Codex may still run commands that read local files without asking. Its own
  configuration may also provide tools or MCP services. Tool results can be sent
  to the model. Use this connection only if you trust your local Codex setup and
  the text you send; the OpenAI-compatible API connection remains available for
  a conventional chat-only request path. Spider Chat does not edit Codex config.
- API profiles and saved maps remain usable on mobile. A Codex request on mobile
  reports that a desktop runtime is required.

## Reference alignment

This integration follows the recommended GPT connection behavior observed in the
user-supplied Zotero AI Paper Companion review package 3.9.8.7: local `codex
app-server`, existing ChatGPT login, live model/effort discovery, detailed reasoning
summaries, streaming and cancellation. It is an independent implementation of the
official protocol; no code or assets from that AGPL package are included.

Zotero-specific library/PDF tools, its native agent permissions UI, browser-chat
automation, and the package's deprecated direct ChatGPT backend are outside this
conversation adapter. Spider Chat continues to own graph history and context.

Verified with Codex CLI `0.155.0-alpha.2.6` on Windows. Protocol tests cover the RPC
handshake, split messages, model pagination, event ordering, completed-only output,
reasoning separation, cancellation, timeout, disconnect and profile routing.
