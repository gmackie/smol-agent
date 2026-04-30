import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { loadSourceConfig } from "./source-config.js";
import { loadSourceLockfile, saveSourceLockfile } from "./source-lockfile.js";
import { resolveSourceDefinition } from "./source-catalog.js";
import { logger } from "./logger.js";

function getXdgConfigHome() {
  return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
}

export function getSourceCacheRoot() {
  return path.join(getXdgConfigHome(), "smol-agent", "sources");
}

export function getSourceCachePath(sourceId) {
  return path.join(getSourceCacheRoot(), sourceId);
}

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ensureCloned(url, cachePath) {
  if (!fs.existsSync(cachePath)) {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    runGit(["clone", url, cachePath], process.cwd());
    return;
  }

  if (!fs.existsSync(path.join(cachePath, ".git"))) {
    throw new Error(`Source cache exists but is not a git repository: ${cachePath}`);
  }

  runGit(["fetch", "origin"], cachePath);

  let remoteHead = "origin/HEAD";
  try {
    const symbolicRef = runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], cachePath);
    remoteHead = symbolicRef.replace(/^refs\/remotes\//, "");
  } catch {
    // Fall back to origin/HEAD when symbolic-ref is unavailable.
  }

  runGit(["checkout", "--detach", remoteHead], cachePath);
}

export async function syncConfiguredSources(cwd) {
  const config = await loadSourceConfig(cwd);
  if (!Array.isArray(config.sources) || config.sources.length === 0) return [];

  const existingLockfile = await loadSourceLockfile(cwd);
  const nextLockfile = {
    ...existingLockfile,
    sources: { ...existingLockfile.sources },
  };
  const synced = [];

  for (const sourceRef of config.sources) {
    let resolved;
    try {
      resolved = resolveSourceDefinition(sourceRef, config);
    } catch (err) {
      logger.warn(`Failed to resolve configured source: ${err.message}`);
      continue;
    }
    const cachePath = getSourceCachePath(resolved.id);

    try {
      ensureCloned(resolved.url, cachePath);
      const revision = runGit(["rev-parse", "HEAD"], cachePath);
      nextLockfile.sources[resolved.id] = {
        url: resolved.url,
        revision,
      };
      synced.push({
        ...resolved,
        cachePath,
        revision,
      });
    } catch (err) {
      logger.warn(`Failed to sync source ${resolved.alias || resolved.url}: ${err.message}`);
    }
  }

  await saveSourceLockfile(cwd, nextLockfile);
  return synced;
}
