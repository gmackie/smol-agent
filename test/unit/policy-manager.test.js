import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import {
  setGroupEntries,
  addGroupEntries,
  removeGroup,
  setAgentDefinition,
  setDefaultAgentDefinition,
  removeAgentDefinition,
} from '../../src/policy-manager.js';
import { loadSourceConfig } from '../../src/source-config.js';

describe('policy-manager', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('setGroupEntries writes a sorted unique group definition', async () => {
    await setGroupEntries(tempDir, 'frontend-defaults', [
      'vercel:web-design-guidelines',
      'local-skill',
      'local-skill',
    ]);

    const config = await loadSourceConfig(tempDir);

    expect(config.groups).toEqual({
      'frontend-defaults': ['local-skill', 'vercel:web-design-guidelines'],
    });
  });

  test('addGroupEntries merges into an existing group without duplicates', async () => {
    fs.writeFileSync(path.join(tempDir, 'smol-agent.json'), JSON.stringify({
      groups: {
        existing: ['a:one'],
      },
    }, null, 2));

    await addGroupEntries(tempDir, 'existing', ['a:one', 'b:two']);

    const config = await loadSourceConfig(tempDir);

    expect(config.groups.existing).toEqual(['a:one', 'b:two']);
  });

  test('removeGroup deletes a configured group', async () => {
    fs.writeFileSync(path.join(tempDir, 'smol-agent.json'), JSON.stringify({
      groups: {
        existing: ['a:one'],
      },
    }, null, 2));

    await removeGroup(tempDir, 'existing');

    const config = await loadSourceConfig(tempDir);

    expect(config.groups).toEqual({});
  });

  test('setAgentDefinition stores sourceIds, groups, allowedArtifacts, and default marker', async () => {
    await setAgentDefinition(tempDir, 'frontend-agent', {
      sourceIds: ['src_vercel'],
      defaultGroups: ['frontend-defaults'],
      allowedArtifacts: ['local-skill'],
      isDefault: true,
    });

    const config = await loadSourceConfig(tempDir);

    expect(config.defaultAgentDefinition).toBe('frontend-agent');
    expect(config.agentDefinitions['frontend-agent']).toEqual({
      sourceIds: ['src_vercel'],
      defaultGroups: ['frontend-defaults'],
      allowedArtifacts: ['local-skill'],
    });
  });

  test('setDefaultAgentDefinition switches the default to an existing definition', async () => {
    fs.writeFileSync(path.join(tempDir, 'smol-agent.json'), JSON.stringify({
      agentDefinitions: {
        one: { sourceIds: [], defaultGroups: [], allowedArtifacts: [] },
        two: { sourceIds: [], defaultGroups: [], allowedArtifacts: [] },
      },
      defaultAgentDefinition: 'one',
    }, null, 2));

    await setDefaultAgentDefinition(tempDir, 'two');

    const config = await loadSourceConfig(tempDir);

    expect(config.defaultAgentDefinition).toBe('two');
  });

  test('removeAgentDefinition deletes the definition and clears default when needed', async () => {
    fs.writeFileSync(path.join(tempDir, 'smol-agent.json'), JSON.stringify({
      agentDefinitions: {
        one: { sourceIds: [], defaultGroups: [], allowedArtifacts: [] },
      },
      defaultAgentDefinition: 'one',
    }, null, 2));

    await removeAgentDefinition(tempDir, 'one');

    const config = await loadSourceConfig(tempDir);

    expect(config.agentDefinitions).toEqual({});
    expect(config.defaultAgentDefinition).toBeNull();
  });
});
