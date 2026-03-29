import fs from "node:fs";
import { loadSourceConfig, saveSourceConfig } from "./source-config.js";
import { loadSourceLockfile, saveSourceLockfile } from "./source-lockfile.js";
import { deriveSourceAlias, resolveSourceDefinition, resolveSourceReference } from "./source-catalog.js";
import { getSourceCachePath, syncConfiguredSources } from "./source-sync.js";

function getReferenceFromSource(source) {
  if (typeof source === "string") return source;
  return source.alias || source.url || null;
}

function matchesReference(source, reference, config) {
  if (typeof source === "string") {
    return source === reference;
  }

  if (source.alias === reference || source.url === reference) {
    return true;
  }

  try {
    return resolveSourceDefinition(source, config).id === resolveSourceReference(reference, config).id;
  } catch {
    return false;
  }
}

export async function installSource(cwd, reference) {
  const config = await loadSourceConfig(cwd);
  const resolved = resolveSourceReference(reference, config);

  const nextSources = [...config.sources];
  const exists = nextSources.some((source) => matchesReference(source, reference, config));
  if (!exists) {
    if (resolved.alias) {
      nextSources.push({ alias: resolved.alias, url: resolved.url });
    } else {
      const derivedAlias = deriveSourceAlias(resolved.url);
      nextSources.push(derivedAlias ? { alias: derivedAlias, url: resolved.url } : { url: resolved.url });
    }
  }

  const installedEntry = nextSources.find((source) => matchesReference(source, reference, config))
    || nextSources[nextSources.length - 1];
  const resolvedInstalledEntry = resolveSourceDefinition(installedEntry, {
    ...config,
    sources: nextSources,
  });

  await saveSourceConfig(cwd, {
    ...config,
    sources: nextSources,
  });

  const synced = await syncConfiguredSources(cwd);
  return synced.find((source) => source.id === resolvedInstalledEntry.id) || resolvedInstalledEntry;
}

export async function listInstalledSources(cwd) {
  const config = await loadSourceConfig(cwd);
  const lockfile = await loadSourceLockfile(cwd);

  return (config.sources || []).map((source) => {
    const resolved = resolveSourceDefinition(source, config);
    const lock = lockfile.sources[resolved.id] || {};
    return {
      ...resolved,
      revision: lock.revision || null,
    };
  });
}

export async function updateSource(cwd, reference = null) {
  const config = await loadSourceConfig(cwd);
  if (!reference) {
    const synced = await syncConfiguredSources(cwd);
    return synced;
  }

  const installedEntry = (config.sources || []).find((source) => matchesReference(source, reference, config));

  if (!installedEntry) {
    throw new Error(`Source is not installed: ${reference}`);
  }

  const resolved = resolveSourceDefinition(installedEntry, config);

  const synced = await syncConfiguredSources(cwd);
  return synced.find((source) => source.id === resolved.id) || resolved;
}

export async function removeSource(cwd, reference) {
  const config = await loadSourceConfig(cwd);
  const installedEntry = (config.sources || []).find((source) => matchesReference(source, reference, config));
  const resolved = installedEntry
    ? resolveSourceDefinition(installedEntry, config)
    : resolveSourceReference(reference, config);

  const sources = (config.sources || []).filter((source) => {
    if (matchesReference(source, reference, config)) return false;

    try {
      return resolveSourceDefinition(source, config).id !== resolved.id;
    } catch {
      return true;
    }
  });

  await saveSourceConfig(cwd, {
    ...config,
    sources,
  });

  const lockfile = await loadSourceLockfile(cwd);
  if (lockfile.sources[resolved.id]) {
    const nextSources = { ...lockfile.sources };
    delete nextSources[resolved.id];
    await saveSourceLockfile(cwd, {
      ...lockfile,
      sources: nextSources,
    });
  }

  const cachePath = getSourceCachePath(resolved.id);
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
}
