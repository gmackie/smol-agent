import { describe, test, expect, jest } from '@jest/globals';

const listInstalledSources = jest.fn();
const listSkillArtifacts = jest.fn();
const searchSkillArtifacts = jest.fn();
const listGroups = jest.fn();
const listAgentDefinitions = jest.fn();

jest.unstable_mockModule('../../src/source-manager.js', () => ({
  listInstalledSources,
}));

jest.unstable_mockModule('../../src/artifact-inventory.js', () => ({
  listSkillArtifacts,
  searchSkillArtifacts,
}));

jest.unstable_mockModule('../../src/policy-inventory.js', () => ({
  listGroups,
  listAgentDefinitions,
}));

const { runProjectInventoryQuery } = await import('../../src/project-inventory.js');

describe('runProjectInventoryQuery', () => {
  test('formats installed sources for shared CLI and TUI use', async () => {
    listInstalledSources.mockResolvedValueOnce([
      { alias: 'vercel', url: 'https://github.com/vercel-labs/agent-skills', revision: 'abc123' },
    ]);

    const result = await runProjectInventoryQuery({
      commandName: 'sources',
      commandArgs: ['list'],
      cwd: '/tmp/project',
    });

    expect(result.lines).toEqual([
      'vercel',
      '  revision: abc123',
      '  url: https://github.com/vercel-labs/agent-skills',
    ]);
  });

  test('formats artifact search results', async () => {
    searchSkillArtifacts.mockResolvedValueOnce([
      { type: 'skill', name: 'vercel:web-design-guidelines', description: 'Design skill' },
    ]);

    const result = await runProjectInventoryQuery({
      commandName: 'artifacts',
      commandArgs: ['search', 'design'],
      cwd: '/tmp/project',
    });

    expect(result.lines).toEqual([
      'skill vercel:web-design-guidelines',
      '  Design skill',
    ]);
  });

  test('returns usage error for artifacts search without a query', async () => {
    await expect(runProjectInventoryQuery({
      commandName: 'artifacts',
      commandArgs: ['search'],
      cwd: '/tmp/project',
    })).rejects.toThrow('Usage: smol-agent artifacts search <query>');
  });

  test('formats agent definitions with default marker and policy details', async () => {
    listAgentDefinitions.mockResolvedValueOnce([
      {
        name: 'frontend-agent',
        isDefault: true,
        sourceIds: ['src_vercel'],
        defaultGroups: ['frontend-defaults'],
        allowedArtifacts: ['vercel:web-design-guidelines'],
      },
    ]);

    const result = await runProjectInventoryQuery({
      commandName: 'agent-definitions',
      commandArgs: ['list'],
      cwd: '/tmp/project',
    });

    expect(result.lines).toEqual([
      'frontend-agent (default)',
      '  sources: src_vercel',
      '  groups: frontend-defaults',
      '  allowed: vercel:web-design-guidelines',
    ]);
  });
});
