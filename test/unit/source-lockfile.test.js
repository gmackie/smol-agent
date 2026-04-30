import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { loadSourceLockfile, saveSourceLockfile } from '../../src/source-lockfile.js';

describe('loadSourceLockfile', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('returns an empty lockfile when missing', async () => {
    const lockfile = await loadSourceLockfile(tempDir);

    expect(lockfile.lockfileVersion).toBe(1);
    expect(lockfile.sources).toEqual({});
  });

  test('loads a project lockfile from .smol-agent/sources.lock.json', async () => {
    const lockDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, 'sources.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        sources: {
          src_vercel: {
            url: 'https://github.com/vercel-labs/agent-skills',
            revision: 'abc123',
          },
        },
      }, null, 2)
    );

    const lockfile = await loadSourceLockfile(tempDir);

    expect(lockfile.sources.src_vercel.revision).toBe('abc123');
  });

  test('loads the project lockfile from the root when called in a nested directory', async () => {
    const lockDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(
      path.join(lockDir, 'sources.lock.json'),
      JSON.stringify({
        lockfileVersion: 1,
        sources: {
          src_vercel: {
            url: 'https://github.com/vercel-labs/agent-skills',
            revision: 'abc123',
          },
        },
      }, null, 2)
    );
    const nestedDir = path.join(tempDir, 'packages', 'app');
    fs.mkdirSync(nestedDir, { recursive: true });

    const lockfile = await loadSourceLockfile(nestedDir);

    expect(lockfile.sources.src_vercel.revision).toBe('abc123');
  });
});

describe('saveSourceLockfile', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('writes the lockfile under .smol-agent/sources.lock.json', async () => {
    await saveSourceLockfile(tempDir, {
      lockfileVersion: 1,
      sources: {
        src_vercel: {
          url: 'https://github.com/vercel-labs/agent-skills',
          revision: 'abc123',
        },
      },
    });

    const lockfilePath = path.join(tempDir, '.smol-agent', 'sources.lock.json');
    expect(fs.existsSync(lockfilePath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(lockfilePath, 'utf-8'));
    expect(parsed.sources.src_vercel.revision).toBe('abc123');
  });

  test('writes the lockfile under the discovered project root when called in a nested directory', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    const nestedDir = path.join(tempDir, 'packages', 'app');
    fs.mkdirSync(nestedDir, { recursive: true });

    await saveSourceLockfile(nestedDir, {
      lockfileVersion: 1,
      sources: {
        src_vercel: {
          url: 'https://github.com/vercel-labs/agent-skills',
          revision: 'abc123',
        },
      },
    });

    expect(fs.existsSync(path.join(tempDir, '.smol-agent', 'sources.lock.json'))).toBe(true);
    expect(fs.existsSync(path.join(nestedDir, '.smol-agent', 'sources.lock.json'))).toBe(false);
  });
});
