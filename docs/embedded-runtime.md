# Embedded Runtime

`smol-agent` now has an explicit runtime-vs-host split.

The goal is to keep the existing terminal app working while making the agent loop embeddable inside other systems such as workflow engines or management planes.

## Runtime vs Host

The runtime owns agent behavior:

- agent loop lifecycle
- provider interaction
- context management
- tool-call execution flow
- multi-agent runtime seams

The host owns environment-specific integration:

- session storage
- memory storage
- message transport
- tool catalog and execution
- event sink

Today the default terminal build uses a local host adapter that persists sessions on disk, uses the filesystem inbox/outbox transport, and exposes the existing tool registry.

## Key Files

- `src/runtime/agent-runtime.js`
  - minimal runtime shell with host validation and structured runtime event emission
- `src/runtime/local-host.js`
  - compatibility adapter for the current terminal/filesystem environment
- `src/runtime/contracts.js`
  - required host contract validation
- `src/runtime/session-metadata.js`
  - fixed runtime context metadata persisted into sessions
- `src/runtime/request-context.js`
  - maps runtime context into OpenAI-compatible request headers
- `src/runtime/message-transport.js`
  - pluggable filesystem-backed message transport
- `src/runtime/multi-agent.js`
  - explicit multi-agent runtime methods for spawn/send/receive/await/terminate flows

## Default Local Host

The terminal app still runs through `Agent`, but `Agent` now extends the runtime shell and defaults to `createLocalHost()`.

That local host provides:

- `sessionStore`
  - wraps the existing `.smol-agent/state/sessions` persistence
- `memoryStore`
  - placeholder interface for future host-backed memory providers
- `messageTransport`
  - wraps the existing `.smol-agent/inbox` and `.smol-agent/outbox` markdown transport
- `toolProvider`
  - wraps the existing tool registry
- `eventSink`
  - default no-op event sink for terminal mode

## Fixed Runtime Context

Session metadata can now persist a fixed `runtimeContext`, including `tieredRouter` fields such as:

- `baseUrl`
- `workflowId`
- `protectionLevel`

For OpenAI-compatible providers, that runtime context can be turned into default request headers. This is the path that makes a session permanently bound to a workflow or protection contract.

## Embedded Usage Direction

An embedding host should implement the same host contract with its own storage and transport backends.

For example, a workflow system can replace:

- local session JSON with database-backed session storage
- filesystem inbox/outbox with queue or database-backed thread transport
- local tool registry with governed workflow tools
- no-op event sink with structured audit/event ingestion

The terminal UI stays one host. An external orchestrator can become another.

## Current Limits

- `watchForResponses()` in `src/cross-agent.js` still uses `fs.watch`, so live inbox watching is still filesystem-oriented.
- The embedded seams are now explicit, but broad end-to-end embedded-host coverage is still limited.
- The current local `memoryStore` adapter is intentionally minimal and will need expansion when a non-terminal host actually persists runtime memory.
