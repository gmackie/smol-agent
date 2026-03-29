import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import {
  listGroups,
  listAgentDefinitions,
} from '../../src/policy-inventory.js';

describe('policy-inventory', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('lists configured groups with their entries', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        groups: {
          'frontend-defaults': ['vercel:web-design-guidelines', 'local-skill'],
          planning: ['vercel:brainstorming'],
        },
      }, null, 2)
    );

    const groups = await listGroups(tempDir);

    expect(groups).toEqual([
      {
        name: 'frontend-defaults',
        entries: ['vercel:web-design-guidelines', 'local-skill'],
      },
      {
        name: 'planning',
        entries: ['vercel:brainstorming'],
      },
    ]);
  });

  test('lists configured agent definitions with defaults and allowed artifacts', async () => {
    fs.writeFileSync(
      path.join(tempDir, 'smol-agent.json'),
      JSON.stringify({
        defaultAgentDefinition: 'frontend-agent',
        agentDefinitions: {
          'frontend-agent': {
            sourceIds: ['src_vercel'],
            defaultGroups: ['frontend-defaults'],
            allowedArtifacts: ['vercel:web-design-guidelines'],
          },
          'planner-agent': {
            sourceIds: [],
            defaultGroups: ['planning'],
            allowedArtifacts: [],
          },
        },
      }, null, 2)
    );

    const definitions = await listAgentDefinitions(tempDir);

    expect(definitions).toEqual([
      {
        name: 'frontend-agent',
        isDefault: true,
        sourceIds: ['src_vercel'],
        defaultGroups: ['frontend-defaults'],
        allowedArtifacts: ['vercel:web-design-guidelines'],
      },
      {
        name: 'planner-agent',
        isDefault: false,
        sourceIds: [],
        defaultGroups: ['planning'],
        allowedArtifacts: [],
      },
    ]);
  });
});
