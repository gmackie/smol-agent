import { loadSourceConfig } from "./source-config.js";

export async function listGroups(cwd) {
  const config = await loadSourceConfig(cwd);
  return Object.entries(config.groups || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, entries]) => ({
      name,
      entries: Array.isArray(entries) ? entries : [],
    }));
}

export async function listAgentDefinitions(cwd) {
  const config = await loadSourceConfig(cwd);
  const defaultName = config.defaultAgentDefinition || null;

  return Object.entries(config.agentDefinitions || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, definition]) => ({
      name,
      isDefault: name === defaultName,
      sourceIds: definition.sourceIds || [],
      defaultGroups: definition.defaultGroups || [],
      allowedArtifacts: definition.allowedArtifacts || [],
    }));
}
