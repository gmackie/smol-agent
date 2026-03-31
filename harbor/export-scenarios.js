#!/usr/bin/env node
/**
 * Export existing smol-agent E2E scenarios to Harbor task format.
 *
 * Reads test/e2e/scenarios/*.test.js, extracts the meta and prompt,
 * and generates Harbor-compatible task directories under harbor/tasks/.
 *
 * Usage:
 *   node harbor/export-scenarios.js                  # export all
 *   node harbor/export-scenarios.js --filter bug-fix # export matching
 *   node harbor/export-scenarios.js --dry-run        # preview only
 *
 * Each exported task gets:
 *   task.toml       - metadata (name, labels, timeouts)
 *   instruction.md  - the prompt from the scenario
 *   environment/    - any seed files (extracted from source)
 *   tests/test.sh   - a generic verifier that runs the original scenario
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = path.join(__dirname, "..", "test", "e2e", "scenarios");
const OUTPUT_DIR = path.join(__dirname, "tasks");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FILTER = (() => {
  const idx = args.indexOf("--filter");
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
})();

// ── Discover scenarios ──────────────────────────────────────────────

let files = fs.readdirSync(SCENARIOS_DIR)
  .filter(f => f.endsWith(".test.js"))
  .sort();

if (FILTER) {
  files = files.filter(f => f.includes(FILTER));
}

console.log(`Found ${files.length} scenario(s) to export.\n`);

// ── Extract metadata from scenario source ───────────────────────────

function extractMeta(source) {
  const meta = {};

  // Extract meta object properties
  const nameMatch = source.match(/name:\s*["']([^"']+)["']/);
  if (nameMatch) meta.name = nameMatch[1];

  const categoryMatch = source.match(/category:\s*["']([^"']+)["']/);
  if (categoryMatch) meta.category = categoryMatch[1];

  const evalTypeMatch = source.match(/evalType:\s*["']([^"']+)["']/);
  if (evalTypeMatch) meta.evalType = evalTypeMatch[1];

  const difficultyMatch = source.match(/difficulty:\s*["']([^"']+)["']/);
  if (difficultyMatch) meta.difficulty = difficultyMatch[1];

  // Extract timeout tier
  const timeoutMatch = source.match(/timeout:\s*config\.timeouts\.(\w+)/);
  if (timeoutMatch) meta.timeoutTier = timeoutMatch[1];

  return meta;
}

function extractPrompt(source) {
  // Look for the string passed to runWithTimeout
  // Pattern: runWithTimeout(\n  agent,\n  "...",  or  '...',  or  `...`
  const patterns = [
    // Template literal (backtick)
    /runWithTimeout\s*\(\s*\w+\s*,\s*`([\s\S]*?)`\s*,/,
    // Double-quoted string (possibly multi-line with +)
    /runWithTimeout\s*\(\s*\w+\s*,\s*"([\s\S]*?)"\s*,/,
    // Single-quoted string
    /runWithTimeout\s*\(\s*\w+\s*,\s*'([\s\S]*?)'\s*,/,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1].trim();
  }

  // Fallback: look for agent.run() calls
  const runMatch = source.match(/agent\.run\s*\(\s*["'`]([\s\S]*?)["'`]\s*\)/);
  if (runMatch) return runMatch[1].trim();

  return null;
}

function extractSeedFiles(source) {
  const seeds = [];
  // Match seedFile(tmpDir, "path", content) or seedFile(tmpDir, "path", VARIABLE)
  const seedCalls = source.matchAll(/seedFile\s*\(\s*\w+\s*,\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g);
  for (const match of seedCalls) {
    const filePath = match[1];
    const varName = match[2];

    // Try to find the variable content
    const varMatch = source.match(new RegExp(`const\\s+${varName}\\s*=\\s*\`([\\s\\S]*?)\`;`));
    if (varMatch) {
      seeds.push({ path: filePath, content: varMatch[1] });
    }
  }
  return seeds;
}

// ── Timeout mapping ─────────────────────────────────────────────────

const TIMEOUT_MAP = {
  simple: 300,
  medium: 600,
  complex: 900,
};

// ── Generate task directories ───────────────────────────────────────

let exported = 0;

for (const file of files) {
  const source = fs.readFileSync(path.join(SCENARIOS_DIR, file), "utf-8");
  const meta = extractMeta(source);
  const prompt = extractPrompt(source);

  if (!prompt) {
    console.log(`  SKIP: ${file} (could not extract prompt)`);
    continue;
  }

  const taskName = meta.name || path.basename(file, ".test.js").replace(/^\d+-/, "");
  const taskDir = path.join(OUTPUT_DIR, taskName);

  console.log(`  ${DRY_RUN ? "[DRY RUN] " : ""}${taskName}`);
  console.log(`    Category: ${meta.category || "uncategorized"}`);
  console.log(`    Difficulty: ${meta.difficulty || "medium"}`);
  console.log(`    Prompt: ${prompt.slice(0, 80)}...`);

  if (DRY_RUN) {
    exported++;
    continue;
  }

  // Create task directory structure
  fs.mkdirSync(path.join(taskDir, "environment"), { recursive: true });
  fs.mkdirSync(path.join(taskDir, "tests"), { recursive: true });

  // Write task.toml
  const timeout = TIMEOUT_MAP[meta.timeoutTier || meta.difficulty || "medium"] || 600;
  const labels = [
    meta.category || "uncategorized",
    meta.evalType || "capability",
    meta.difficulty || "medium",
  ].filter(Boolean);

  const toml = `[task]
name = "${taskName}"
author = "smol-agent"
labels = [${labels.map(l => `"${l}"`).join(", ")}]

[task.timeouts]
agent = ${timeout}
verifier = 60
`;
  fs.writeFileSync(path.join(taskDir, "task.toml"), toml);

  // Write instruction.md
  fs.writeFileSync(path.join(taskDir, "instruction.md"), prompt + "\n");

  // Write seed files into environment/
  const seeds = extractSeedFiles(source);
  for (const seed of seeds) {
    const seedPath = path.join(taskDir, "environment", seed.path);
    fs.mkdirSync(path.dirname(seedPath), { recursive: true });
    fs.writeFileSync(seedPath, seed.content);
  }

  // Write a generic verifier that runs the original e2e scenario
  const scenarioBasename = path.basename(file);
  const verifier = `#!/usr/bin/env bash
# Auto-generated verifier for ${taskName}.
# Runs the original smol-agent E2E scenario checks against the workspace.
#
# This verifier uses Node.js to execute the scenario's check logic
# against the files in the workspace.

set -euo pipefail

WORKSPACE="\${WORKSPACE:-/task/environment}"
REWARD_FILE="/logs/verifier/reward.txt"

echo "=== ${taskName} verifier ==="
echo "Workspace: $WORKSPACE"

# Run the scenario-specific verifier
node --no-warnings /app/smol-agent/harbor/verify-scenario.js \\
  --scenario "${scenarioBasename}" \\
  --workspace "$WORKSPACE" \\
  --reward "$REWARD_FILE"
`;

  fs.writeFileSync(path.join(taskDir, "tests", "test.sh"), verifier, { mode: 0o755 });

  exported++;
  console.log(`    -> exported to harbor/tasks/${taskName}/`);
  console.log("");
}

console.log(`\nExported ${exported} task(s)${DRY_RUN ? " (dry run)" : ""}.`);
