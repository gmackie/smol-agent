# AGENT.md — Agent Navigation Guide

## What this project is

smol-agent is a terminal-based coding agent powered by Ollama (local LLMs). It gives a language model tools to read/write/edit files, run shell commands, search code, and ask the user questions — then loops until the model produces a final text response. The UI is built with Ink (React for the terminal).

## Commands

```bash
npm install          # install dependencies
npm start            # run the agent (equivalent to: node src/index.js)
node src/index.js    # direct run
node src/index.js -m <model> "prompt here"  # one-shot with specific model
```

No test suite exists yet. No build step — plain ES modules (Node >= 18).

## Architecture overview

```
User prompt → Agent.run() → Ollama chat API → tool calls → execute tools → feed results back → repeat until text response
```

The agent is an EventEmitter that drives a loop: send messages to Ollama, check for tool calls, execute them, push results back, and repeat (max 25 iterations). The Ink UI subscribes to events (`tool_call`, `tool_result`, `response`, `error`) to render progress.

## File map

### Core files (src/)

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | 49 | CLI entry point. Parses `--model`, `--host`, `--help` args. Creates `Agent`, renders Ink `App`. |
| `agent.js` | 234 | **Core agent loop.** `Agent` class (extends EventEmitter). Holds conversation `messages[]`, calls Ollama, processes tool calls in a loop. Contains the system prompt. Also has `parseToolCallsFromContent()` fallback for models that emit tool calls as JSON in text instead of using Ollama's native `tool_calls` field. |
| `context.js` | 164 | **Project context gathering.** `gatherContext(cwd)` builds a string with: working directory, file tree (2 levels), git branch/status/log, config file contents (package.json, tsconfig, etc.), and README excerpt. Injected into the system prompt on first `run()`. |
| `ollama.js` | 20 | Thin wrapper. Exports `createClient(host)`, `chat(client, model, messages, tools)`, and `DEFAULT_MODEL` (`qwen2.5-coder:7b`). |

### UI (src/ui/)

| File | Lines | Purpose |
|------|-------|---------|
| `App.js` | 204 | Ink (React) terminal UI. Manages message log, input field, spinner, ask_user flow. Uses `React.createElement` directly (no JSX). Subscribes to agent events. Handles `/reset`, `exit`/`quit`, `Ctrl-C`. |

### Tools (src/tools/)

All tools self-register by calling `register(name, { description, parameters, execute })` on import. The agent imports them in `agent.js` to trigger registration.

| File | Tool name | Purpose |
|------|-----------|---------|
| `registry.js` | — | Tool registry. `register()`, `execute()`, `ollamaTools()` (serializes to Ollama format), `list()`. |
| `read_file.js` | `read_file` | Reads a file, returns numbered lines. Supports `offset`/`limit` params. |
| `write_file.js` | `write_file` | Writes content to a file, creating parent dirs if needed. |
| `edit_file.js` | `edit_file` | Find-and-replace: finds `old_string` in file, replaces with `new_string`. First occurrence only. |
| `list_files.js` | `list_files` | Glob-based file listing (uses `glob` npm package). Ignores `node_modules/` and `.git/`. |
| `shell.js` | `shell` | Runs a shell command via `execSync`. 30s default timeout, 1MB max buffer. |
| `grep.js` | `grep` | Regex search via `grep -rn`. Returns up to 200 matching lines. |
| `web_search.js` | `web_search` | Web search via `ollama.webSearch()`. Requires `OLLAMA_API_KEY`. Needs client injected via `setOllamaClient()`. |
| `web_fetch.js` | `web_fetch` | Fetches a URL via `ollama.webFetch()`. Truncates to 12k chars. Needs client injected via `setOllamaClient()`. |
| `ask_user.js` | `ask_user` | Asks user a question. Works via a promise bridge: UI sets a handler with `setAskHandler()`, tool awaits it. |

## Key patterns

### Adding a new tool

1. Create `src/tools/your_tool.js`
2. Import and call `register()` from `./registry.js`:
   ```js
   import { register } from "./registry.js";
   register("tool_name", {
     description: "What it does",
     parameters: { type: "object", required: [...], properties: { ... } },
     async execute(args) { return { result: "..." }; }
   });
   ```
3. Add `import "./tools/your_tool.js";` in `agent.js` (around line 8-15) to trigger self-registration.

### Tool call parsing fallback

Some models don't use Ollama's native `tool_calls` field — they output tool calls as JSON in the message content. `parseToolCallsFromContent()` in `agent.js` handles this by scanning for `{"name": "...", "arguments": {...}}` patterns in code fences or bare JSON.

### ask_user bridge

`ask_user` is special — it needs to pause the agent loop and collect user input from the Ink UI. This works via a promise:
- `App.js` calls `setAskHandler(fn)` at mount time
- When the tool executes, it calls the handler which returns a Promise
- The UI resolves the promise when the user submits an answer
- The agent loop resumes with the answer

### Context injection

On first `Agent.run()`, `gatherContext()` collects project info and appends it to the system prompt. This runs once per session (or after `agent.reset()`). The gathered context includes file tree, git info, config files, and README excerpt.

### Event flow

```
Agent emits:
  "context_ready" → after gatherContext() finishes
  "tool_call"     → { name, args }     before executing a tool
  "tool_result"   → { name, result }   after tool finishes
  "response"      → { content }        final text response (loop done)
  "error"         → Error              on failure
```

## Dependencies

- `ollama` — Ollama JS client (chat API, web search/fetch)
- `ink`, `react` — Terminal UI framework
- `ink-text-input` — Text input component
- `ink-spinner` — Spinner component
- `glob` — File globbing (used by `list_files` tool)
