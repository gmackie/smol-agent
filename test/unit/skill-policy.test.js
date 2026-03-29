import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { loadSkills } from '../../src/skills.js';
import { gatherContext } from '../../src/context.js';

function createGitSkillRepo(baseDir, repoName, skillName, description) {
  const repoDir = path.join(baseDir, repoName);
  const skillDir = path.join(repoDir, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: ${description}\n---\nBody\n`
  );

  execFileSync('git', ['init'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });

  return repoDir;
}

describe('skill policy filtering', () => {
  let tempDir;
  let xdgDir;
  let previousXdg;

  beforeEach(() => {
    tempDir = createTempDir();
    xdgDir = createTempDir('smol-xdg-');
    previousXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = xdgDir;
  });

  afterEach(() => {
    if (previousXdg === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdg;
    }
    cleanupTempDir(tempDir);
    cleanupTempDir(xdgDir);
  });

  test('loadSkills filters visible skills using the default agent definition', async () => {
    const localSkillDir = path.join(tempDir, '.smol-agent', 'skills', 'local-skill');
    fs.mkdirSync(localSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(localSkillDir, 'SKILL.md'),
      '---\nname: local-skill\ndescription: Local skill\n---\nBody'
    );

    const allowedRepo = createGitSkillRepo(tempDir, 'allowed-repo', 'allowed-skill', 'Allowed remote skill');
    const blockedRepo = createGitSkillRepo(tempDir, 'blocked-repo', 'blocked-skill', 'Blocked remote skill');

    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        defaultAgentDefinition: 'frontend-agent',
        sourceCatalog: {
          allowed: { url: allowedRepo, label: 'Allowed Source' },
          blocked: { url: blockedRepo, label: 'Blocked Source' },
        },
        sources: [{ alias: 'allowed' }, { alias: 'blocked' }],
        groups: {
          'frontend-defaults': ['allowed:allowed-skill', 'local-skill'],
        },
        agentDefinitions: {
          'frontend-agent': {
            sourceIds: ['src_allowed'],
            defaultGroups: ['frontend-defaults'],
            allowedArtifacts: [],
          },
        },
      }, null, 2)
    );

    const skills = await loadSkills(tempDir);
    const names = skills.map((skill) => skill.name);

    expect(names).toContain('allowed:allowed-skill');
    expect(names).toContain('local-skill');
    expect(names).not.toContain('blocked:blocked-skill');
  });

  test('gatherContext only includes skills visible to the default agent definition', async () => {
    const allowedRepo = createGitSkillRepo(tempDir, 'allowed-repo', 'allowed-skill', 'Allowed remote skill');
    const blockedRepo = createGitSkillRepo(tempDir, 'blocked-repo', 'blocked-skill', 'Blocked remote skill');

    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        defaultAgentDefinition: 'frontend-agent',
        sourceCatalog: {
          allowed: { url: allowedRepo, label: 'Allowed Source' },
          blocked: { url: blockedRepo, label: 'Blocked Source' },
        },
        sources: [{ alias: 'allowed' }, { alias: 'blocked' }],
        groups: {
          'frontend-defaults': ['allowed:allowed-skill'],
        },
        agentDefinitions: {
          'frontend-agent': {
            sourceIds: ['src_allowed'],
            defaultGroups: ['frontend-defaults'],
            allowedArtifacts: [],
          },
        },
      }, null, 2)
    );

    const context = await gatherContext(tempDir);

    expect(context).toContain('allowed:allowed-skill');
    expect(context).not.toContain('blocked:blocked-skill');
  });
});
