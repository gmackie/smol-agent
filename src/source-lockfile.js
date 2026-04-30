import fs from "node:fs/promises";
import path from "node:path";
import { findProjectRoot } from "./project-root.js";

const LOCKFILE_DIR = ".smol-agent";
const LOCKFILE_NAME = "sources.lock.json";

const DEFAULT_LOCKFILE = {
  lockfileVersion: 1,
  sources: {},
};

export async function loadSourceLockfile(cwd) {
  try {
    const projectRoot = await findProjectRoot(cwd);
    const filepath = path.join(projectRoot, LOCKFILE_DIR, LOCKFILE_NAME);
    const data = await fs.readFile(filepath, "utf-8");
    const parsed = JSON.parse(data);
    return { ...DEFAULT_LOCKFILE, ...parsed };
  } catch {
    return { ...DEFAULT_LOCKFILE };
  }
}

export async function saveSourceLockfile(cwd, lockfile) {
  const projectRoot = await findProjectRoot(cwd);
  const dir = path.join(projectRoot, LOCKFILE_DIR);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, LOCKFILE_NAME);
  const merged = { ...DEFAULT_LOCKFILE, ...lockfile };
  await fs.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}
