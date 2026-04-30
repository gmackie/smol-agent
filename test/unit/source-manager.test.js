import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import {
  installSource,
  listInstalledSources,
  removeSource,
  updateSource,
} from '../../src/source-manager.js';
import { loadSourceConfig } from '../../src/source-config.js';
import { loadSourceLockfile } from '../../src/source-lockfile.js';

function createGitSkillRepo(baseDir, skillName = 'managed-skill') {
  const repoDir = path.join(baseDir, 'managed-skills-repo');
  const skillDir = path.join(repoDir, 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Managed skill\n---\nBody\n`
  );

  execFileSync('git', ['init'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: repoDir });
  execFileSync('git', ['add', '.'], { cwd: repoDir });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir });

  return repoDir;
}

describe('source-manager', () => {
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

  test('installSource adds a source to config and syncs it', async () => {
    const repoDir = createGitSkillRepo(tempDir);

    const result = await installSource(tempDir, repoDir);

    expect(result.id.startsWith('src_')).toBe(true);
    const config = await loadSourceConfig(tempDir);
    expect(config.sources).toEqual([{ alias: 'managed-skills-repo', url: repoDir }]);

    const lockfile = await loadSourceLockfile(tempDir);
    expect(lockfile.sources[result.id].revision).toMatch(/^[0-9a-f]{40}$/);
  });

  test('listInstalledSources returns configured sources with sync metadata', async () => {
    const repoDir = createGitSkillRepo(tempDir);
    await installSource(tempDir, repoDir);

    const sources = await listInstalledSources(tempDir);

    expect(sources).toHaveLength(1);
    expect(sources[0].alias).toBe('managed-skills-repo');
    expect(sources[0].url).toBe(repoDir);
    expect(sources[0].revision).toMatch(/^[0-9a-f]{40}$/);
  });

  test('removeSource removes a configured source and lockfile entry', async () => {
    const repoDir = createGitSkillRepo(tempDir);
    const installed = await installSource(tempDir, repoDir);

    await removeSource(tempDir, repoDir);

    const config = await loadSourceConfig(tempDir);
    expect(config.sources).toEqual([]);

    const lockfile = await loadSourceLockfile(tempDir);
    expect(lockfile.sources[installed.id]).toBeUndefined();
  });

  test('updateSource refreshes the pinned revision after new commits', async () => {
    const repoDir = createGitSkillRepo(tempDir);
    const installed = await installSource(tempDir, repoDir);
    const before = installed.revision;

    fs.writeFileSync(
      path.join(repoDir, 'skills', 'managed-skill', 'SKILL.md'),
      `---\nname: managed-skill\ndescription: Managed skill updated\n---\nBody\n`
    );
    execFileSync('git', ['add', '.'], { cwd: repoDir });
    execFileSync('git', ['commit', '-m', 'Update skill'], { cwd: repoDir });

    const updated = await updateSource(tempDir, repoDir);

    expect(updated.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(updated.revision).not.toBe(before);
  });
});
