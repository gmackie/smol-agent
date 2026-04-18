# ACP roadmap and t3code integration (planning)

This document is **planning and documentation only** for the smol-agent repository. It records known Agent Client Protocol (ACP) limitations, intended directions to address them, and how to experiment with smol-agent against the sibling **[t3code](https://github.com/pingdotgg/t3code)** tree (`../t3code` when both repos live side by side). No integration code is implied in t3code until product decisions are made there.

---

## Context: t3code

**t3code** is the `@t3tools/monorepo` project: a minimal web (and desktop) GUI for coding agents (Codex, Claude, etc.), built with **Turbo**, **Bun**, and **Effect**. It is a separate codebase from smol-agent.

Using smol-agent as an **ACP backend** while editing t3code is a reasonable local experiment: point the agent jail at the t3code checkout and connect an ACP-capable client to `smol-agent --acp`.

---

## Current ACP limitations (smol-agent)

These are accurate as of the planning pass that added this document. Treat as a backlog, not a promise of order.

| Area | Current behavior | Risks / notes |
|------|------------------|----------------|
| **Concurrent sessions** | `MAX_SESSIONS = 1` | Global singletons (jail, network clients, sub-agent config) make multi-session unsafe without refactors. |
| **`session/fork` (unstable)** | Not implemented | Nice for “branch” conversations; needs message/session clone + new id. |
| **`unstable_setSessionModel`** | Not implemented | Needs safe runtime model/provider switch and capability advertisement. |
| **MCP `mcpServers` in `newSession` / `load`** | Ignored | Spec allows MCP alongside the agent; we do not connect MCP from ACP params yet. |
| **Remote HTTP server (`--remote`)** | Session ids are UUIDs; disk sessions use smol hex ids | Two different identity models; confusing if you expect one id everywhere. |
| **Authentication** | Shared secret validated against `authenticate._meta.token` | SDK Zod strips unknown top-level fields; token must ride on `_meta` (see README ACP section). |
| **Images / audio in prompts** | Placeholder text only | Full support depends on provider multimodal APIs and `promptCapabilities`. |

---

## Using smol-agent on `../t3code` (today)

Prerequisites:

- Built or linked `smol-agent` from this repo.
- ACP-capable editor or harness (e.g. Zed, or the SDK examples) configured to launch the binary.

**Suggested command** (jail = t3code root):

```bash
cd ../t3code
/path/to/smol-agent --acp -d "$(pwd)"
# Optionally: -m / -p / --api-key / SMOL_AGENT_* env vars for your provider
```

Behavior to expect:

- **Single active session** per connection; start another only after closing or finishing the previous workflow in the client.
- **Session ids** returned from `session/new` match **on-disk** sessions under `.smol-agent/state/sessions/` for that cwd (after the ACP improvements that call `startSession()`).
- **`session/load`** and **`session/resume` (unstable)** use the same ids as those files.
- For **auth**, if `SMOL_AGENT_AUTH_TOKEN` / `--auth-token` is set on the agent process, clients must complete **`authenticate`** with `methodId: "smol_bearer"` and the token in **`_meta.token`**.

This does **not** add smol-agent to t3code’s UI or installer; it only documents how a power user or future integration could wire them.

---

## What “full t3code integration” could mean (future, mostly outside this repo)

Product-level integration would likely live in **t3code** (custom agent template, env injection, docs). smol-agent would remain a separate binary or optional dependency.

Possible building blocks:

1. **Agent definition** — Command: `smol-agent --acp -d <workspaceRoot>`, env for provider.
2. **Workspace root** — t3code passes the opened folder as `-d`.
3. **Optional** — Wrapper script in t3code repo, health check, or model picker mapped to `unstable_setSessionModel` once implemented.

Until then, treat **manual stdio + editor** as the supported experiment.

---

## Phased plan (smol-agent codebase)

### Phase A — Docs and operator clarity (this repo)

- Keep this roadmap updated when limitations change.
- README: short ACP subsection with link here + auth reminder.
- Optional: add an `examples/acp-env.example` later (not required for this planning pass).

### Phase B — Protocol gaps without large refactors

- Implement **`unstable_setSessionModel`** where it is safe (same provider family, re-init provider).
- Implement **`unstable_forkSession`** as “duplicate messages + new session file” (or explicitly defer with `methodNotFound` until designed).
- **Remote server**: choose **one** story — either align HTTP session ids with persisted sessions or document **dual-ID** semantics and API responses.

### Phase C — MCP

- Parse `mcpServers` from ACP; either connect MCP clients or return a clear **unsupported** capability so clients do not assume tools exist.

### Phase D — Multi-session / isolation (large)

- Audit globals (`setJailDirectory`, search/fetch clients, sub-agent config).
- Either remove globals in favor of per-session context **or** keep `MAX_SESSIONS = 1` by design and document it as a **hard constraint** for the embedded CLI agent.

---

## Handoff for the next session

1. Decide whether **Phase D** (multi-session) is a product goal or we **codify single-session** as permanent for smol-agent ACP.
2. If t3code wants first-class smol-agent support, open tracking in **t3code**; keep this file as the smol-agent-side contract/limitations reference.
3. After any code change to ACP, update the **Current limitations** table above so operators are not misled.
