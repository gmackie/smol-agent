import fs from "node:fs/promises";
import path from "node:path";

const ROOT_MARKERS = [
  "smol-agent.json",
  ".smol-agent",
  "package.json",
  ".git",
];

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function findProjectRoot(startDir) {
  let currentDir = path.resolve(startDir);

  while (true) {
    for (const marker of ROOT_MARKERS) {
      if (await exists(path.join(currentDir, marker))) {
        return currentDir;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.resolve(startDir);
    }
    currentDir = parentDir;
  }
}
