import fs from "node:fs/promises";
import path from "node:path";
import { resolveJailedPath } from "./path-utils.js";

const SKILLS_DIR = ".smol-agent/skills";

/**
 * Parse YAML frontmatter from a markdown string.
 * Returns { data: { key: value, ... }, content: "body" }.
 * Handles simple key: value pairs only (no nested YAML).
 */
export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, content: text };

  const data = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (!key) continue;
    data[key] = val;
  }

  return { data, content: match[2] };
}

/**
 * Load skill metadata from .smol-agent/skills/*.md.
 * Returns [{ name, description, file }] or [] if dir missing.
 */
export async function loadSkills(cwd) {
  try {
    const skillsPath = resolveJailedPath(cwd, SKILLS_DIR);
    const entries = await fs.readdir(skillsPath);
    const skills = [];

    for (const file of entries.filter((f) => f.endsWith(".md"))) {
      try {
        const filepath = path.join(skillsPath, file);
        const raw = await fs.readFile(filepath, "utf-8");
        const { data } = parseFrontmatter(raw);
        skills.push({
          name: data.name || file.slice(0, -3),
          description: data.description || "",
          file,
        });
      } catch { /* skip unreadable files */ }
    }

    return skills;
  } catch {
    return [];
  }
}
