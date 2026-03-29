import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import {
  listSkillArtifacts,
  searchSkillArtifacts,
} from '../../src/artifact-inventory.js';

function createGitSkillRepo(baseDir, skillName = 'remote-skill', description = 'Remote skill description') {
  const repoDir = path.join(baseDir, 'artifact-skills-repo');
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

describe('artifact-inventory', () => {
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

  test('lists local and source-backed skill artifacts', async () => {
    const localSkillDir = path.join(tempDir, '.smol-agent', 'skills', 'local-skill');
    fs.mkdirSync(localSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(localSkillDir, 'SKILL.md'),
      '---\nname: local-skill\ndescription: Local skill\n---\nBody'
    );

    const repoDir = createGitSkillRepo(tempDir, 'remote-skill', 'Remote skill');
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        sourceCatalog: {
          remote: {
            url: repoDir,
            label: 'Remote Skills',
          },
        },
        sources: [{ alias: 'remote' }],
      }, null, 2)
    );

    const artifacts = await listSkillArtifacts(tempDir);

    expect(artifacts.some((artifact) => artifact.name === 'local-skill' && artifact.type === 'skill')).toBe(true);
    expect(artifacts.some((artifact) => artifact.name === 'remote:remote-skill' && artifact.type === 'skill')).toBe(true);
  });

  test('searches skill artifacts by name and description', async () => {
    const repoDir = createGitSkillRepo(tempDir, 'design-review', 'Review polished UI systems');
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        sourceCatalog: {
          remote: {
            url: repoDir,
            label: 'Remote Skills',
          },
        },
        sources: [{ alias: 'remote' }],
      }, null, 2)
    );

    const byName = await searchSkillArtifacts(tempDir, 'design');
    const byDescription = await searchSkillArtifacts(tempDir, 'polished');

    expect(byName.map((artifact) => artifact.name)).toContain('remote:design-review');
    expect(byDescription.map((artifact) => artifact.name)).toContain('remote:design-review');
  });
});
