import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { syncConfiguredSources } from '../../src/source-sync.js';
import { loadSourceLockfile } from '../../src/source-lockfile.js';

function createGitSkillRepo(baseDir, skillName = 'repo-skill') {
  const repoDir = path.join(baseDir, 'skills-repo');
  const skillDir = path.join(repoDir, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Skill from git repo\n---\nBody\n`
  );

  execFileSync('git', ['init'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });

  return repoDir;
}

describe('syncConfiguredSources', () => {
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

  test('syncs configured sources into cache and writes project lockfile', async () => {
    const repoDir = createGitSkillRepo(tempDir, 'repo-skill');
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        sourceCatalog: {
          'local-repo': {
            url: repoDir,
            label: 'Local Repo',
          },
        },
        sources: [{ alias: 'local-repo' }],
      }, null, 2)
    );

    const sources = await syncConfiguredSources(tempDir);

    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('src_local_repo');

    const cachedSkillPath = path.join(
      xdgDir,
      'smol-agent',
      'sources',
      'src_local_repo',
      'skills',
      'repo-skill',
      'SKILL.md'
    );
    expect(fs.existsSync(cachedSkillPath)).toBe(true);

    const lockfile = await loadSourceLockfile(tempDir);
    expect(lockfile.sources.src_local_repo).toBeTruthy();
    expect(lockfile.sources.src_local_repo.revision).toMatch(/^[0-9a-f]{40}$/);
  });
});
