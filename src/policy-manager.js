import { loadSourceConfig, saveSourceConfig } from "./source-config.js";

function uniqueSorted(items) {
  return [...new Set((items || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export async function setGroupEntries(cwd, name, entries) {
  const config = await loadSourceConfig(cwd);
  const groups = { ...(config.groups || {}) };
  groups[name] = uniqueSorted(entries);
  return saveSourceConfig(cwd, { ...config, groups });
}

export async function addGroupEntries(cwd, name, entries) {
  const config = await loadSourceConfig(cwd);
  const groups = { ...(config.groups || {}) };
  groups[name] = uniqueSorted([...(groups[name] || []), ...(entries || [])]);
  return saveSourceConfig(cwd, { ...config, groups });
}

export async function removeGroup(cwd, name) {
  const config = await loadSourceConfig(cwd);
  const groups = { ...(config.groups || {}) };
  delete groups[name];
  return saveSourceConfig(cwd, { ...config, groups });
}

export async function setAgentDefinition(cwd, name, definition) {
  const config = await loadSourceConfig(cwd);
  const agentDefinitions = { ...(config.agentDefinitions || {}) };
  agentDefinitions[name] = {
    sourceIds: uniqueSorted(definition.sourceIds),
    defaultGroups: uniqueSorted(definition.defaultGroups),
    allowedArtifacts: uniqueSorted(definition.allowedArtifacts),
  };

  return saveSourceConfig(cwd, {
    ...config,
    agentDefinitions,
    defaultAgentDefinition: definition.isDefault ? name : config.defaultAgentDefinition,
  });
}

export async function setDefaultAgentDefinition(cwd, name) {
  const config = await loadSourceConfig(cwd);
  if (!config.agentDefinitions?.[name]) {
    throw new Error(`Unknown agent definition: ${name}`);
  }

  return saveSourceConfig(cwd, {
    ...config,
    defaultAgentDefinition: name,
  });
}

export async function removeAgentDefinition(cwd, name) {
  const config = await loadSourceConfig(cwd);
  const agentDefinitions = { ...(config.agentDefinitions || {}) };
  delete agentDefinitions[name];

  return saveSourceConfig(cwd, {
    ...config,
    agentDefinitions,
    defaultAgentDefinition: config.defaultAgentDefinition === name ? null : config.defaultAgentDefinition,
  });
}
