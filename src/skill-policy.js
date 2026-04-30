import { loadSourceConfig } from "./source-config.js";

function buildAllowedArtifactSet(config, agentDefinition) {
  const allowed = new Set(agentDefinition.allowedArtifacts || []);

  for (const groupName of agentDefinition.defaultGroups || []) {
    const groupEntries = config.groups?.[groupName] || [];
    for (const entry of groupEntries) {
      allowed.add(entry);
    }
  }

  return allowed;
}

function isSourceAllowed(skill, allowedSourceIds) {
  if (skill.source !== "source") return true;
  if (!allowedSourceIds || allowedSourceIds.size === 0) return true;
  return allowedSourceIds.has(skill.sourceId);
}

function isArtifactAllowed(skill, allowedArtifacts) {
  if (!allowedArtifacts || allowedArtifacts.size === 0) return true;
  return allowedArtifacts.has(skill.name)
    || (skill.qualifiedName && allowedArtifacts.has(skill.qualifiedName))
    || (skill.localName && allowedArtifacts.has(skill.localName));
}

export async function filterSkillsForActiveAgent(cwd, skills) {
  const config = await loadSourceConfig(cwd);
  const definitionName = config.defaultAgentDefinition;
  if (!definitionName) return skills;

  const agentDefinition = config.agentDefinitions?.[definitionName];
  if (!agentDefinition) return skills;

  const allowedSourceIds = new Set(agentDefinition.sourceIds || []);
  const allowedArtifacts = buildAllowedArtifactSet(config, agentDefinition);

  return skills.filter((skill) =>
    isSourceAllowed(skill, allowedSourceIds) && isArtifactAllowed(skill, allowedArtifacts)
  );
}
