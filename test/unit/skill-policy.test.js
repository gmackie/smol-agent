import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import fs from "node:fs";
import path from "node:path";
import { createTempDir, cleanupTempDir } from "../test-utils.js";
import { filterSkillsForActiveAgent } from "../../src/skill-policy.js";

describe("filterSkillsForActiveAgent", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test("returns all skills when no default agent definition is configured", async () => {
    const skills = [
      { name: "local-skill", source: "local" },
      { name: "allowed:allowed-skill", source: "source", sourceId: "src_allowed" },
    ];

    await expect(filterSkillsForActiveAgent(tempDir, skills)).resolves.toEqual(skills);
  });

  test("filters source-backed skills using the default agent definition", async () => {
    fs.writeFileSync(
      path.join(tempDir, "smol-agent.json"),
      JSON.stringify({
        defaultAgentDefinition: "frontend-agent",
        groups: {
          "frontend-defaults": ["allowed:allowed-skill", "local-skill"],
        },
        agentDefinitions: {
          "frontend-agent": {
            sourceIds: ["src_allowed"],
            defaultGroups: ["frontend-defaults"],
            allowedArtifacts: [],
          },
        },
      }, null, 2)
    );

    const skills = [
      {
        name: "allowed:allowed-skill",
        qualifiedName: "allowed:allowed-skill",
        localName: "allowed-skill",
        source: "source",
        sourceId: "src_allowed",
      },
      {
        name: "blocked:blocked-skill",
        qualifiedName: "blocked:blocked-skill",
        localName: "blocked-skill",
        source: "source",
        sourceId: "src_blocked",
      },
      {
        name: "local-skill",
        source: "local",
      },
    ];

    await expect(filterSkillsForActiveAgent(tempDir, skills)).resolves.toEqual([
      skills[0],
      skills[2],
    ]);
  });
});
