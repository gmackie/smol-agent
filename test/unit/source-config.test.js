import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import { loadSourceConfig, saveSourceConfig } from '../../src/source-config.js';

describe('loadSourceConfig', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('returns defaults when smol-agent.json is missing', async () => {
    const config = await loadSourceConfig(tempDir);

    expect(config.sourceCatalog).toEqual({});
    expect(config.sources).toEqual([]);
    expect(config.groups).toEqual({});
    expect(config.agentDefinitions).toEqual({});
  });

  test('loads source config from smol-agent.json', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        sourceCatalog: {
          vercel: {
            url: 'https://github.com/vercel-labs/agent-skills',
            label: 'Vercel Agent Skills',
          },
        },
        sources: [{ alias: 'vercel' }],
      }, null, 2)
    );

    const config = await loadSourceConfig(tempDir);

    expect(config.sourceCatalog.vercel.url).toBe('https://github.com/vercel-labs/agent-skills');
    expect(config.sources).toEqual([{ alias: 'vercel' }]);
    expect(config.groups).toEqual({});
    expect(config.agentDefinitions).toEqual({});
  });

  test('loads source config from the project root when called in a nested directory', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        sourceCatalog: {
          vercel: {
            url: 'https://github.com/vercel-labs/agent-skills',
          },
        },
        sources: [{ alias: 'vercel' }],
      }, null, 2)
    );
    const nestedDir = path.join(tempDir, 'packages', 'app');
    fs.mkdirSync(nestedDir, { recursive: true });

    const config = await loadSourceConfig(nestedDir);

    expect(config.sources).toEqual([{ alias: 'vercel' }]);
  });
});

describe('saveSourceConfig', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('writes smol-agent.json at the project root', async () => {
    await saveSourceConfig(tempDir, {
      sourceCatalog: {
        vercel: {
          url: 'https://github.com/vercel-labs/agent-skills',
        },
      },
      sources: [{ alias: 'vercel' }],
    });

    const configPath = path.join(tempDir, 'smol-agent.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(parsed.sources).toEqual([{ alias: 'vercel' }]);
  });

  test('writes smol-agent.json to the discovered project root when called in a nested directory', async () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), '{}');
    const nestedDir = path.join(tempDir, 'packages', 'app');
    fs.mkdirSync(nestedDir, { recursive: true });

    await saveSourceConfig(nestedDir, {
      sources: [{ alias: 'vercel' }],
    });

    expect(fs.existsSync(path.join(tempDir, 'smol-agent.json'))).toBe(true);
    expect(fs.existsSync(path.join(nestedDir, 'smol-agent.json'))).toBe(false);
  });
});
