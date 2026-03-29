import { listInstalledSources } from "./source-manager.js";
import { listSkillArtifacts, searchSkillArtifacts } from "./artifact-inventory.js";
import { listGroups, listAgentDefinitions } from "./policy-inventory.js";

function formatArtifacts(artifacts, emptyMessage = "No discovered artifacts.") {
  if (artifacts.length === 0) {
    return [emptyMessage];
  }

  const lines = [];
  for (const artifact of artifacts) {
    lines.push(`${artifact.type} ${artifact.name}`);
    if (artifact.description) lines.push(`  ${artifact.description}`);
  }
  return lines;
}

export async function runProjectInventoryQuery({ commandName, commandArgs, cwd }) {
  if (commandName === "sources" && commandArgs[0] === "list") {
    const sources = await listInstalledSources(cwd);
    if (sources.length === 0) {
      return { lines: ["No installed sources."] };
    }

    const lines = [];
    for (const source of sources) {
      lines.push(`${source.alias || source.url}`);
      if (source.revision) lines.push(`  revision: ${source.revision}`);
      lines.push(`  url: ${source.url}`);
    }
    return { lines };
  }

  if (commandName === "artifacts" && commandArgs[0] === "list") {
    return { lines: formatArtifacts(await listSkillArtifacts(cwd)) };
  }

  if (commandName === "artifacts" && commandArgs[0] === "search") {
    const query = commandArgs.slice(1).join(" ").trim();
    if (!query) {
      throw new Error("Usage: smol-agent artifacts search <query>");
    }
    const artifacts = await searchSkillArtifacts(cwd, query);
    return { lines: formatArtifacts(artifacts, "No matching artifacts.") };
  }

  if (commandName === "groups" && commandArgs[0] === "list") {
    const groups = await listGroups(cwd);
    if (groups.length === 0) {
      return { lines: ["No configured groups."] };
    }

    const lines = [];
    for (const group of groups) {
      lines.push(group.name);
      for (const entry of group.entries) {
        lines.push(`  - ${entry}`);
      }
    }
    return { lines };
  }

  if (commandName === "agent-definitions" && commandArgs[0] === "list") {
    const definitions = await listAgentDefinitions(cwd);
    if (definitions.length === 0) {
      return { lines: ["No configured agent definitions."] };
    }

    const lines = [];
    for (const definition of definitions) {
      const marker = definition.isDefault ? " (default)" : "";
      lines.push(`${definition.name}${marker}`);
      if (definition.sourceIds.length > 0) lines.push(`  sources: ${definition.sourceIds.join(", ")}`);
      if (definition.defaultGroups.length > 0) lines.push(`  groups: ${definition.defaultGroups.join(", ")}`);
      if (definition.allowedArtifacts.length > 0) lines.push(`  allowed: ${definition.allowedArtifacts.join(", ")}`);
    }
    return { lines };
  }

  throw new Error(`Unknown inventory command: ${commandName} ${commandArgs.join(" ").trim()}`.trim());
}
