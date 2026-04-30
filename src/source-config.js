import fs from "node:fs/promises";
import path from "node:path";
import { findProjectRoot } from "./project-root.js";

const CONFIG_FILE = "smol-agent.json";

const DEFAULT_CONFIG = {
  sourceCatalog: {},
  sources: [],
  groups: {},
  agentDefinitions: {},
  defaultAgentDefinition: null,
};

export async function loadSourceConfig(cwd) {
  try {
    const projectRoot = await findProjectRoot(cwd);
    const filepath = path.join(projectRoot, CONFIG_FILE);
    const data = await fs.readFile(filepath, "utf-8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveSourceConfig(cwd, config) {
  const projectRoot = await findProjectRoot(cwd);
  const filepath = path.join(projectRoot, CONFIG_FILE);
  const merged = { ...DEFAULT_CONFIG, ...config };
  await fs.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}
