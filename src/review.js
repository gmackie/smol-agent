/**
 * Review Mode — analyzes recent changes and provides actionable feedback.
 *
 * Uses a read-only agent pass to examine git diffs and recent commits,
 * then produces a structured code review with actionable suggestions.
 *
 * Similar to architect mode but focused on reviewing existing changes
 * rather than planning new ones.
 *
 * Key exports:
 *   - reviewPass(client, model, options): Main entry point
 *   - REVIEW_SYSTEM_PROMPT: System prompt for review mode
 *
 * Dependencies: ./ollama.js, ./tools/registry.js, ./tool-call-parser.js,
 *               ./logger.js, ./constants.js
 * Depended on by: src/agent.js, src/ui/App.js
 */

import * as ollama from "./ollama.js";
import * as registry from "./tools/registry.js";
import { parseToolCallsFromContent } from "./tool-call-parser.js";
import { logger } from "./logger.js";
import { DEFAULT_MAX_TOKENS } from "./constants.js";
import { execFileSync } from "node:child_process";

const READ_ONLY_TOOLS = new Set(["read_file", "list_files", "grep"]);

const REVIEW_SYSTEM_PROMPT = `You are a code reviewer that analyzes recent changes and provides actionable feedback.

## Your role
- Examine the git diff and recent commits provided below
- Use read-only tools (read_file, list_files, grep) to understand surrounding context
- Produce a clear, actionable code review

## Rules
- Use tools immediately — do NOT narrate "I will read..."
- Read relevant files to understand the context around changes
- Focus on substantive issues, not style nitpicks
- Your final output must be a structured review with:
  1. **Summary**: Brief overview of what changed
  2. **Issues**: Bugs, logic errors, security concerns, or correctness problems
  3. **Improvements**: Suggestions for better approaches, performance, or readability
  4. **Good patterns**: Things done well that should be continued
  5. **Action items**: A prioritized checklist of concrete fixes (most important first)
- Each issue or improvement must reference the specific file and code involved
- Be constructive — explain *why* something is a problem and *how* to fix it
- Use <thinking>...</thinking> for internal reasoning`;

const MAX_REVIEW_ITERATIONS = 20;

/**
 * Detect the base branch that the current branch diverged from.
 * Tries main, then master, then falls back to HEAD~1.
 *
 * @param {string} cwd - Working directory
 * @returns {string} The merge-base ref to diff against
 */
function detectBaseBranch(cwd) {
  const opts = { cwd, maxBuffer: 10 * 1024, timeout: 10_000 };

  // Get current branch name
  let currentBranch = "";
  try {
    currentBranch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], opts).toString().trim();
  } catch { /* empty */ }

  // If we're on main/master itself, fall back to HEAD~1
  if (currentBranch === "main" || currentBranch === "master") {
    return "HEAD~1";
  }

  // Try to find the merge-base with common default branches
  for (const base of ["main", "master"]) {
    try {
      const mergeBase = execFileSync(
        "git", ["merge-base", base, "HEAD"],
        opts,
      ).toString().trim();
      if (mergeBase) return mergeBase;
    } catch { /* branch doesn't exist, try next */ }
  }

  // Fallback: diff against HEAD~1
  return "HEAD~1";
}

/**
 * Gather changes in the current branch for review.
 * Compares the current branch against its base (main/master) to show
 * all changes introduced by this branch, including uncommitted work.
 *
 * @param {string} cwd - Working directory (must be inside a git repo)
 * @returns {{ diff: string, log: string, uncommitted: string }} The git context
 */
function gatherGitChanges(cwd) {
  const opts = { cwd, maxBuffer: 200 * 1024, timeout: 15_000 };

  const base = detectBaseBranch(cwd);
  let diff = "";
  let log = "";
  let uncommitted = "";

  // All committed changes on this branch since diverging from base
  try {
    diff = execFileSync("git", ["diff", base, "HEAD"], opts).toString();
  } catch {
    // Fallback for fresh repos or missing base
    try {
      diff = execFileSync("git", ["diff", "HEAD~1", "HEAD"], opts).toString();
    } catch { /* empty */ }
  }

  // Uncommitted changes (staged + unstaged) on top of HEAD
  try {
    const uncommittedDiff = execFileSync("git", ["diff", "HEAD"], opts).toString();
    if (uncommittedDiff.trim()) {
      uncommitted = uncommittedDiff;
    }
  } catch { /* empty */ }

  // Commit log for this branch since base
  try {
    log = execFileSync(
      "git", ["log", "--oneline", "--no-decorate", `${base}..HEAD`],
      opts,
    ).toString();
  } catch {
    // Fallback
    try {
      log = execFileSync(
        "git", ["log", "--oneline", "-10", "--no-decorate"],
        opts,
      ).toString();
    } catch { /* empty */ }
  }

  return { diff, log, uncommitted };
}

/**
 * Run the review pass: analyze recent changes and produce a code review.
 *
 * @param {object} client - Ollama client
 * @param {string} model - Model name
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {number} [options.maxTokens] - Max context tokens
 * @param {string} [options.projectContext] - Pre-gathered project context
 * @param {AbortSignal} [options.signal] - Cancellation signal
 * @param {function} [options.onProgress] - Progress callback
 * @param {string} [options.scope] - Optional scope hint (e.g. file path or "staged")
 * @returns {Promise<string>} The code review
 */
export async function reviewPass(client, model, options = {}) {
  const {
    cwd = process.cwd(),
    maxTokens = DEFAULT_MAX_TOKENS,
    projectContext = "",
    signal = null,
    onProgress = null,
    scope = "",
  } = options;

  const { diff, log, uncommitted } = gatherGitChanges(cwd);

  if (!diff && !uncommitted) {
    return "(No changes found to review. Make some changes or commits first.)";
  }

  // Build the user prompt with the git context
  let changesSection = "";
  if (log) {
    changesSection += `## Branch commits\n\`\`\`\n${log}\n\`\`\`\n\n`;
  }
  if (diff) {
    changesSection += `## Branch changes (committed)\n\`\`\`diff\n${diff}\n\`\`\`\n\n`;
  }
  if (uncommitted) {
    changesSection += `## Uncommitted changes\n\`\`\`diff\n${uncommitted}\n\`\`\`\n\n`;
  }

  const scopeHint = scope ? `\nFocus your review on: ${scope}\n` : "";

  const userPrompt = `Review the following recent changes and provide actionable feedback.${scopeHint}

${changesSection}
Read the relevant source files for additional context, then produce your review.`;

  const systemContent = projectContext
    ? `${REVIEW_SYSTEM_PROMPT}\n\n# Project context\n\n${projectContext}`
    : REVIEW_SYSTEM_PROMPT;

  const messages = [
    { role: "system", content: systemContent },
    { role: "user", content: userPrompt },
  ];

  // Only expose read-only tools
  const readOnlyTools = registry
    .ollamaTools(true)
    .filter((t) => READ_ONLY_TOOLS.has(t.function.name));

  onProgress?.({ type: "review_start" });

  for (let i = 0; i < MAX_REVIEW_ITERATIONS; i++) {
    if (signal?.aborted) {
      return "(Review cancelled)";
    }

    onProgress?.({ type: "review_iteration", current: i + 1, max: MAX_REVIEW_ITERATIONS });

    let response;
    try {
      response = await ollama.chatWithRetry(
        client, model, messages, readOnlyTools, signal, maxTokens,
      );
    } catch (err) {
      logger.error(`Review pass failed: ${err.message}`);
      return `(Review failed: ${err.message})`;
    }

    const msg = response.message;

    // Strip thinking tags
    const content = msg.content
      ? msg.content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim()
      : "";

    messages.push({ role: "assistant", content, tool_calls: msg.tool_calls });

    // Check for tool calls
    let toolCalls = msg.tool_calls || [];
    if (toolCalls.length === 0 && content) {
      toolCalls = parseToolCallsFromContent(content)
        .filter(tc => READ_ONLY_TOOLS.has(tc.function.name));
    }

    // No tool calls → this is the final review
    if (toolCalls.length === 0) {
      onProgress?.({ type: "review_done", iterations: i + 1 });
      return content || "(No review produced)";
    }

    // Execute read-only tool calls
    for (const tc of toolCalls) {
      const name = tc.function.name;
      const args = tc.function.arguments;

      if (!READ_ONLY_TOOLS.has(name)) {
        messages.push({
          role: "tool",
          content: JSON.stringify({ error: `Tool "${name}" not available in review mode (read-only)` }),
        });
        continue;
      }

      onProgress?.({ type: "review_tool", name, args });

      const result = await registry.execute(name, args, { cwd });
      const str = JSON.stringify(result);
      // Truncate large results
      const truncated = str.length > 12000
        ? str.substring(0, 12000) + "\n[truncated]"
        : str;
      messages.push({ role: "tool", content: truncated });
    }
  }

  // Hit iteration limit — return last assistant content
  const lastAssistant = messages.filter(m => m.role === "assistant").pop();
  return lastAssistant?.content || "(Review reached iteration limit)";
}
