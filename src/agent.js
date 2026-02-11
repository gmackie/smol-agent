import { EventEmitter } from "node:events";
import * as ollama from "./ollama.js";
import * as registry from "./tools/registry.js";

// Import all tools so they self-register
import "./tools/read_file.js";
import "./tools/write_file.js";
import "./tools/edit_file.js";
import "./tools/list_files.js";
import "./tools/shell.js";
import "./tools/grep.js";
import "./tools/ask_user.js";

const SYSTEM_PROMPT = `You are smol-agent, a helpful coding assistant that runs in the user's terminal.
You have access to tools for reading, writing, and editing files, running shell commands, searching code, and asking the user for clarification.

Guidelines:
- Always read a file before editing it.
- Use list_files to understand project structure before making changes.
- Use grep to find relevant code across the codebase.
- Use ask_user when you are unsure what the user wants, need to confirm a destructive action, or need to choose between approaches.
- Keep your responses concise and focused.
- When you are done with a task, summarize what you did.`;

export class Agent extends EventEmitter {
  constructor({ host, model } = {}) {
    super();
    this.client = ollama.createClient(host);
    this.model = model || ollama.DEFAULT_MODEL;
    this.messages = [{ role: "system", content: SYSTEM_PROMPT }];
    this.running = false;
  }

  /**
   * Send a user message and run the full tool-call loop until the model
   * produces a final text response (no more tool calls).
   *
   * Emits:
   *   "tool_call"  — { name, args }           when the model invokes a tool
   *   "tool_result" — { name, result }         after a tool finishes
   *   "response"   — { content }               final assistant text
   *   "error"      — Error                     on failure
   */
  async run(userMessage) {
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

        // If no tool calls, we're done — return the text response.
        if (!msg.tool_calls || msg.tool_calls.length === 0) {
          this.running = false;
          this.emit("response", { content: msg.content });
          return msg.content;
        }

        // Process each tool call
        for (const toolCall of msg.tool_calls) {
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

  /** Reset conversation history (keeps system prompt). */
  reset() {
    this.messages = [this.messages[0]];
  }
}
