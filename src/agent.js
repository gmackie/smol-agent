import { EventEmitter } from "node:events";
import * as ollama from "./ollama.js";
import * as registry from "./tools/registry.js";
import { gatherContext } from "./context.js";

// Import all tools so they self-register
import "./tools/read_file.js";
import "./tools/write_file.js";
import "./tools/edit_file.js";
import "./tools/list_files.js";
import "./tools/shell.js";
import "./tools/grep.js";
import { setOllamaClient as setSearchClient } from "./tools/web_search.js";
import { setOllamaClient as setFetchClient } from "./tools/web_fetch.js";
import "./tools/ask_user.js";

/**
 * Attempt to extract tool calls from the assistant's text content.
 * Some models output tool calls as JSON in their content instead of using
 * Ollama's native tool_calls field. We look for JSON objects that match
 * the pattern: {"name": "...", "arguments": {...}}
 */
function parseToolCallsFromContent(content) {
  if (!content) return [];

  const calls = [];
  // Match JSON objects that look like tool calls — may appear in ```json blocks or inline
  const jsonBlockRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/g;
  const candidates = [];

  let match;
  while ((match = jsonBlockRe.exec(content)) !== null) {
    candidates.push(match[1].trim());
  }

  // Also try to find bare JSON objects with "name" and "arguments" keys
  // (some models output them without code fences)
  const bareJsonRe = /\{[^{}]*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:\s*\{[^}]*\}[^}]*\}/g;
  while ((match = bareJsonRe.exec(content)) !== null) {
    candidates.push(match[0].trim());
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed.name && typeof parsed.name === "string" && parsed.arguments && typeof parsed.arguments === "object") {
        calls.push({
          function: {
            name: parsed.name,
            arguments: parsed.arguments,
          },
        });
      }
    } catch {
      // Not valid JSON or wrong shape — skip
    }
  }

  return calls;
}

const SYSTEM_PROMPT = `You are smol-agent, a coding assistant that runs in the user's terminal. You have direct access to the user's project through tools. Your job is to **do the work**, not describe it.

## Golden rule

**Act, don't explain.** When the user asks you to do something, use your tools to do it. Do not describe what you would do, narrate what you're seeing, or explain the codebase back to the user. They already know their code — they want you to change it.

Bad: "I can see that your project uses React. The App component is in src/App.js. I would suggest adding..."
Good: [read the file, then immediately edit it]

## How to work

1. Read the files you need to change (use \`read_file\` — you need the exact text for edits).
2. Make the changes (use \`edit_file\` or \`write_file\`).
3. Verify if possible (run tests/builds with \`shell\`).
4. Briefly say what you changed and why.

That's it. Do not over-research. Do not narrate. Jump to action quickly.

- Use \`list_files\` or \`grep\` only when you genuinely don't know where to look. If the user tells you which file to change, go straight to it.
- Use \`ask_user\` only when the request is truly ambiguous or the action is destructive. Do not ask for permission to do routine work.

## Editing files

- **Prefer \`edit_file\` over \`write_file\`** for existing files. edit_file does targeted find-and-replace.
- The \`old_string\` must match file contents **exactly** — indentation, whitespace, everything. Copy it from the read_file output (without line numbers).
- Use \`write_file\` only for new files or full rewrites.
- Match the existing code style (indentation, quotes, commas, etc.).

## Shell commands

- Use \`shell\` for builds, tests, linters, git, package installs, etc.
- Avoid destructive commands unless the user asked for them.

## Web search

- Use \`web_search\` and \`web_fetch\` when you need to look up docs or APIs you're unsure about.

## Important

- Changes are real and immediate on the user's filesystem.
- Use relative paths from the project root.
- Keep your responses short. The user wants results, not essays.`;

export class Agent extends EventEmitter {
  constructor({ host, model } = {}) {
    super();
    this.client = ollama.createClient(host);
    this.model = model || ollama.DEFAULT_MODEL;
    this.messages = [];
    this.running = false;
    this._initialized = false;

    // Give the web tools access to the Ollama client
    setSearchClient(this.client);
    setFetchClient(this.client);
  }

  /**
   * Build the system message with live project context.
   * Called once before the first run(), or after reset().
   */
  async _init() {
    if (this._initialized) return;

    let contextBlock = "";
    try {
      contextBlock = await gatherContext(process.cwd());
    } catch {
      // If context gathering fails, proceed without it
    }

    const systemContent = contextBlock
      ? `${SYSTEM_PROMPT}\n\n# Current project context\n\n${contextBlock}`
      : SYSTEM_PROMPT;

    this.messages = [{ role: "system", content: systemContent }];
    this._initialized = true;
    this.emit("context_ready");
  }

  /**
   * Send a user message and run the full tool-call loop until the model
   * produces a final text response (no more tool calls).
   *
   * Emits:
   *   "context_ready" — after project context is gathered
   *   "tool_call"     — { name, args }           when the model invokes a tool
   *   "tool_result"   — { name, result }         after a tool finishes
   *   "response"      — { content }               final assistant text
   *   "error"         — Error                     on failure
   */
  async run(userMessage) {
    await this._init();

    this.running = true;
    this.messages.push({ role: "user", content: userMessage });

    const tools = registry.ollamaTools();
    let iterations = 0;
    const MAX_ITERATIONS = 25;

    try {
      while (iterations < MAX_ITERATIONS) {
        iterations++;

        const response = await ollama.chat(
          this.client,
          this.model,
          this.messages,
          tools
        );

        const msg = response.message;
        this.messages.push(msg);

        // Use native tool_calls if present, otherwise try to parse them from content
        let toolCalls = msg.tool_calls && msg.tool_calls.length > 0
          ? msg.tool_calls
          : parseToolCallsFromContent(msg.content);

        // If no tool calls, we're done — return the text response.
        if (toolCalls.length === 0) {
          this.running = false;
          this.emit("response", { content: msg.content });
          return msg.content;
        }

        // Process each tool call
        for (const toolCall of toolCalls) {
          const name = toolCall.function.name;
          const args = toolCall.function.arguments;

          this.emit("tool_call", { name, args });

          const result = await registry.execute(name, args);

          this.emit("tool_result", { name, result });

          this.messages.push({
            role: "tool",
            content: JSON.stringify(result),
          });
        }
      }

      this.running = false;
      const limitMsg = "(Agent reached maximum iteration limit)";
      this.emit("response", { content: limitMsg });
      return limitMsg;
    } catch (err) {
      this.running = false;
      this.emit("error", err);
      throw err;
    }
  }

  /** Reset conversation history and re-gather context on next run. */
  reset() {
    this.messages = [];
    this._initialized = false;
  }
}
