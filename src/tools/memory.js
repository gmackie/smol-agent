import { register } from "./registry.js";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveJailedPath } from "../path-utils.js";

const MEMORY_DIR = ".smol-agent";
const MEMORY_FILE = "memory.json";

/**
 * Load persistent memories from disk.
 * Exported for use in context.js to inject memories into system prompt.
 */
export async function loadMemories(cwd) {
  try {
    const dirPath = resolveJailedPath(cwd, MEMORY_DIR);
    const filepath = path.join(dirPath, MEMORY_FILE);
    const data = await fs.readFile(filepath, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveMemories(cwd, memories) {
  const dirPath = resolveJailedPath(cwd, MEMORY_DIR);
  await fs.mkdir(dirPath, { recursive: true });
  const filepath = path.join(dirPath, MEMORY_FILE);
  await fs.writeFile(filepath, JSON.stringify(memories, null, 2), "utf-8");
}

register("remember", {
  description:
    "Save a fact, pattern, or preference to persistent memory. Persists across sessions. Use to remember project conventions, successful strategies, user preferences, test commands, etc.",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description:
          "Short key for the memory (e.g. 'test_command', 'coding_style', 'db_schema')",
      },
      value: {
        type: "string",
        description: "The information to remember",
      },
      category: {
        type: "string",
        description:
          "Category: project, preference, pattern, or learned",
      },
    },
    required: ["key", "value"],
  },
  async execute({ key, value, category }, { cwd = process.cwd() } = {}) {
    const memories = await loadMemories(cwd);
    memories[key] = {
      value,
      category: category || "general",
      savedAt: new Date().toISOString(),
    };
    await saveMemories(cwd, memories);
    return { success: true, message: `Remembered "${key}": ${value}` };
  },
});

register("recall", {
  description:
    "Retrieve memories from persistent storage. Omit key to get all memories.",
  parameters: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Specific key to recall, or omit for all",
      },
    },
  },
  async execute({ key }, { cwd = process.cwd() } = {}) {
    const memories = await loadMemories(cwd);
    if (key) {
      return memories[key] || { error: `No memory for "${key}"` };
    }
    const count = Object.keys(memories).length;
    if (count === 0) return { message: "No memories stored yet." };
    return { count, memories };
  },
});
