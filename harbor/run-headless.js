#!/usr/bin/env node
/**
 * Headless runner for smol-agent inside Harbor.
 *
 * Reads the instruction from a file and runs the agent programmatically
 * (no TUI). Outputs events to stdout for observability and logs.
 *
 * Usage:
 *   node run-headless.js \
 *     --provider ollama --model qwen2.5-coder:7b \
 *     --directory /workspace \
 *     --instruction /task/instruction.md \
 *     --max-iterations 30 --context-size 32768
 */

import fs from "node:fs";
import path from "node:path";
import { Agent } from "../src/agent.js";

// ── Parse CLI args ──────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const instructionFile = args.instruction;
if (!instructionFile || !fs.existsSync(instructionFile)) {
  console.error(`ERROR: Instruction file not found: ${instructionFile}`);
  process.exit(1);
}

const instruction = fs.readFileSync(instructionFile, "utf-8").trim();
if (!instruction) {
  console.error("ERROR: Instruction file is empty");
  process.exit(1);
}

const workDir = args.directory || process.cwd();
const maxIterations = parseInt(args["max-iterations"], 10) || 30;
const contextSize = parseInt(args["context-size"], 10) || 32768;

// ── Create and run agent ────────────────────────────────────────────

const agent = new Agent({
  host: args.host || undefined,
  model: args.model || "qwen2.5-coder:7b",
  provider: args.provider || "ollama",
  contextSize,
  jailDirectory: workDir,
  coreToolsOnly: false,
});

// Auto-approve all tool calls (headless mode)
agent._approveAll = true;

// Cap iterations
agent._maxIterations = maxIterations;

// ── Event logging ───────────────────────────────────────────────────

const startTime = Date.now();
let toolCallCount = 0;
let totalTokens = 0;

agent.on("tool_call", (e) => {
  toolCallCount++;
  console.log(`[${elapsed()}] TOOL_CALL #${toolCallCount}: ${e.name}(${summarizeArgs(e.args || e.input)})`);
});

agent.on("tool_result", (e) => {
  const preview = summarizeResult(e.result || e.content);
  console.log(`[${elapsed()}] TOOL_RESULT: ${e.name} -> ${preview}`);
});

agent.on("response", (text) => {
  console.log(`\n[${elapsed()}] RESPONSE:\n${text}\n`);
});

agent.on("error", (e) => {
  console.error(`[${elapsed()}] ERROR: ${e.message || e}`);
});

agent.on("thinking", (content) => {
  console.log(`[${elapsed()}] THINKING: ${String(content).slice(0, 200)}`);
});

agent.on("token_usage", (usage) => {
  const t = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0) +
            (usage.input_tokens || 0) + (usage.output_tokens || 0);
  totalTokens += t;
});

// ── Helpers ─────────────────────────────────────────────────────────

function elapsed() {
  const ms = Date.now() - startTime;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function summarizeArgs(args) {
  if (!args) return "";
  const str = typeof args === "string" ? args : JSON.stringify(args);
  return str.length > 120 ? str.slice(0, 117) + "..." : str;
}

function summarizeResult(result) {
  if (!result) return "(empty)";
  const str = typeof result === "string" ? result : JSON.stringify(result);
  return str.length > 200 ? str.slice(0, 197) + "..." : str;
}

// ── Timeout ─────────────────────────────────────────────────────────

const TIMEOUT_MS = parseInt(args.timeout, 10) || 15 * 60 * 1000; // 15 min default
const timer = setTimeout(() => {
  console.error(`\n[${elapsed()}] TIMEOUT: Agent exceeded ${TIMEOUT_MS / 1000}s limit`);
  agent.cancel();
}, TIMEOUT_MS);

// ── Run ─────────────────────────────────────────────────────────────

console.log(`Starting smol-agent headless run`);
console.log(`  Instruction: ${instruction.slice(0, 200)}${instruction.length > 200 ? "..." : ""}`);
console.log(`  Working directory: ${workDir}`);
console.log(`  Max iterations: ${maxIterations}`);
console.log(`  Context size: ${contextSize}`);
console.log("");

try {
  const response = await agent.run(instruction);
  clearTimeout(timer);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Agent completed successfully`);
  console.log(`  Tool calls: ${toolCallCount}`);
  console.log(`  Total tokens: ${totalTokens}`);
  console.log(`  Duration: ${elapsed()}`);
  console.log(`${"=".repeat(60)}`);
} catch (err) {
  clearTimeout(timer);

  if (err.name === "AbortError" || err.message === "Operation cancelled") {
    console.log(`\nAgent was cancelled/timed out after ${elapsed()}`);
    process.exit(0); // Not an error — verifier will grade the output
  }

  console.error(`\nAgent failed: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
}
