import { loadSkills } from "./skills.js";

function toSkillArtifact(skill) {
  return {
    type: "skill",
    name: skill.name,
    description: skill.description || "",
    source: skill.source,
    qualifiedName: skill.qualifiedName || skill.name,
    sourceId: skill.sourceId || null,
    path: skill.path,
  };
}

export async function listSkillArtifacts(cwd) {
  const skills = await loadSkills(cwd);
  return skills.map(toSkillArtifact);
}

export async function searchSkillArtifacts(cwd, query) {
  const artifacts = await listSkillArtifacts(cwd);
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return artifacts;

  return artifacts.filter((artifact) =>
    artifact.name.toLowerCase().includes(needle)
    || artifact.description.toLowerCase().includes(needle)
  );
}
