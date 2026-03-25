/**
 * Sub-agent tool — spawns a focused agent for research tasks.
 *
 * When the main agent needs to explore unfamiliar code, search across many files,
 * or gather information without polluting its context window, it can delegate
 * to a sub-agent with a clean context. The sub-agent has read-only tools and
 * returns a condensed result.
 *
 * Design:
 *   - Sub-agent starts with an empty context (no conversation history)
 *   - Only has read-only tools: read_file, list_files, grep, ask_user
 *   - Maximum 15 iterations to prevent runaway exploration
 *   - Tool results truncated to 8000 chars to stay small
 *   - Returns condensed summary to parent agent
 *
 * Key exports:
 *   - setSubAgentConfig(cfg): Configure with parent's provider/settings
 *   - Tool registration: delegate
 *
 * Dependencies: ./registry.js, ../logger.js, ../errors.js, ../tool-call-parser.js
 * Depended on by: src/acp-server.js, src/agent.js, src/ui/App.js, test/e2e/harness.js
 */
import { register } from "./registry.js";
import * as registry from "./registry.js";
import { logger } from "../logger.js";
import { isContextOverflowError } from "../errors.js";
import { parseToolCallsFromContent } from "../tool-call-parser.js";
import { createMultiAgentRuntime } from "../runtime/multi-agent.js";

// Config set by parent agent — updated per run with signal/progress callback
const config = {
  llmProvider: null,
  maxTokens: 32768,
  cwd: process.cwd(),
  signal: null,
  onProgress: null,
  host: null,
};

/**
 * Configure the sub-agent with the parent agent's provider and settings.
 * Called from Agent constructor (for provider/cwd) and at each run()
 * start (for signal/onProgress).
 */
export function setSubAgentConfig(cfg) {
  if (cfg.llmProvider !== undefined) config.llmProvider = cfg.llmProvider;
  if (cfg.maxTokens !== undefined) config.maxTokens = Math.min(cfg.maxTokens, 32768);
  if (cfg.cwd !== undefined) config.cwd = cfg.cwd;
  if (cfg.signal !== undefined) config.signal = cfg.signal;
  if (cfg.onProgress !== undefined) config.onProgress = cfg.onProgress;
  if (cfg.host !== undefined) config.host = cfg.host;
}

const READ_ONLY_TOOLS = new Set(["read_file", "list_files", "grep"]);
const MAX_ITERATIONS = 15;
const MAX_TOOL_RESULT_SIZE = 8000;
let multiAgentRuntime = null;

/**
 * Strip <thinking>...</thinking> tags from content to save context tokens.
 */
function stripThinking(content) {
  if (!content) return content;
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim() || content;
}

/**
 * Prune messages to recover from context overflow.
 * Keeps system message + last few exchanges.
 */
function pruneMessages(messages) {
  if (messages.length <= 4) return messages;
  const system = messages[0];
  // Keep last 4 messages (2 exchanges)
  const recent = messages.slice(-4);
  return [system, ...recent];
}

async function runDelegatedTask({ task, context, cwd, llmProvider, maxTokens, signal, onProgress }) {
  if (!llmProvider) {
    return {
      error:
        "Sub-agent not configured. Only available for 30B+ models.",
    };
  }

  const provider = llmProvider;
  // Use host's tool provider if available, fall back to registry
  const allTools = config.host
    ? config.host.toolProvider.getTools(true)
    : registry.getTools(true);
  const readOnlyTools = allTools
    .filter((t) => READ_ONLY_TOOLS.has(t.function.name));

  const systemPrompt = `You are a focused research sub-agent. Explore the codebase and return a concise answer.
Working directory: ${cwd}

Rules:
- Use tools to explore, then return a clear, concise summary.
- Keep your final answer under 1000 tokens.
- Focus only on the task given.
- Do NOT narrate — use tools immediately.
${context ? `\nContext: ${context}` : ""}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  onProgress?.({ type: "start", task });

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (signal?.aborted) {
        return { error: "Sub-agent cancelled" };
      }

      onProgress?.({ type: "iteration", current: i + 1, max: MAX_ITERATIONS });

      let response;
      try {
        response = await provider.chatWithRetry(
          messages,
          readOnlyTools,
          signal,
          maxTokens,
        );
      } catch (err) {
        if (isContextOverflowError(err) && messages.length > 4) {
          logger.warn("Sub-agent context overflow — pruning messages");
          onProgress?.({ type: "prune", reason: "context_overflow" });
          const pruned = pruneMessages(messages);
          messages.length = 0;
          messages.push(...pruned);
          try {
            response = await provider.chatWithRetry(
              messages,
              readOnlyTools,
              signal,
              maxTokens,
            );
          } catch (retryErr) {
            logger.error(`Sub-agent failed after prune: ${retryErr.message}`);
            return { error: `Sub-agent context overflow (unrecoverable): ${retryErr.message}` };
          }
        } else {
          throw err;
        }
      }

      const msg = response.message;
      const cleanedContent = stripThinking(msg.content);
      messages.push({ role: "assistant", content: cleanedContent, tool_calls: msg.tool_calls });

      let toolCalls = msg.tool_calls || [];
      if (toolCalls.length === 0 && cleanedContent) {
        toolCalls = parseToolCallsFromContent(cleanedContent);
      }

      if (toolCalls.length === 0) {
        onProgress?.({ type: "done", iterations: i + 1 });
        return { result: cleanedContent || "(no result)" };
      }

      for (const tc of toolCalls) {
        const name = tc.function.name;
        const args = tc.function.arguments;

        if (signal?.aborted) {
          return { error: "Sub-agent cancelled" };
        }

        if (!READ_ONLY_TOOLS.has(name)) {
          messages.push({
            role: "tool",
            content: JSON.stringify({
              error: `Tool "${name}" not available to sub-agent`,
            }),
          });
          continue;
        }

        onProgress?.({ type: "tool_call", name, args });

        const result = config.host
          ? await config.host.toolProvider.execute(name, args, { cwd })
          : await registry.execute(name, args, { cwd });
        const str = JSON.stringify(result);
        const truncated =
          str.length > MAX_TOOL_RESULT_SIZE
            ? str.substring(0, MAX_TOOL_RESULT_SIZE) + "\n[truncated]"
            : str;
        messages.push({ role: "tool", content: truncated });
      }
    }

    const lastAssistant = messages
      .filter((m) => m.role === "assistant")
      .pop();
    onProgress?.({ type: "done", iterations: MAX_ITERATIONS, limitReached: true });
    return {
      result:
        lastAssistant?.content ||
        "(sub-agent reached iteration limit)",
    };
  } catch (err) {
    logger.error(`Sub-agent failed: ${err.message}`);
    onProgress?.({ type: "error", error: err.message });
    return { error: `Sub-agent failed: ${err.message}` };
  }
}

function getMultiAgentRuntime() {
  if (!multiAgentRuntime) {
    multiAgentRuntime = createMultiAgentRuntime({
      spawnChild: runDelegatedTask,
    });
  }
  return multiAgentRuntime;
}

export function setMultiAgentRuntime(runtime) {
  multiAgentRuntime = runtime || null;
}

register("delegate", {
  description:
    "Delegate a focused research subtask to a sub-agent with a clean context window. The sub-agent has read-only tools (read_file, list_files, grep) and returns a condensed result. Use for exploring unfamiliar code, searching across many files, or gathering information without polluting your main context.",
  parameters: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description:
          "Clear, specific description of what to research or find",
      },
      context: {
        type: "string",
        description:
          "Any relevant context the sub-agent needs (file paths, function names, etc.)",
      },
    },
    required: ["task"],
  },
  async execute({ task, context }) {
    return getMultiAgentRuntime().spawnAgent({
      task,
      context,
      cwd: config.cwd,
      llmProvider: config.llmProvider,
      maxTokens: config.maxTokens,
      signal: config.signal,
      onProgress: config.onProgress,
    });
  },
});
