import { describe, test, expect, jest } from '@jest/globals';

const installSource = jest.fn();
const updateSource = jest.fn();
const removeSource = jest.fn();
const listInstalledSources = jest.fn();
const listSkillArtifacts = jest.fn();
const searchSkillArtifacts = jest.fn();
const listGroups = jest.fn();
const listAgentDefinitions = jest.fn();

jest.unstable_mockModule('../../src/source-manager.js', () => ({
  installSource,
  updateSource,
  removeSource,
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

const { runProjectCommand } = await import('../../src/commands/project-commands.js');

function createIo() {
  return {
    out: [],
    err: [],
    log(message) {
      this.out.push(String(message));
    },
    error(message) {
      this.err.push(String(message));
    },
  };
}

describe('runProjectCommand', () => {
  test('handles sources list output', async () => {
    listInstalledSources.mockResolvedValueOnce([
      { alias: 'vercel', url: 'https://github.com/vercel-labs/agent-skills', revision: 'abc123' },
    ]);
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'sources',
      commandArgs: ['list'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(io.out.join('\n')).toContain('vercel');
    expect(io.out.join('\n')).toContain('revision: abc123');
  });

  test('handles artifacts search output', async () => {
    searchSkillArtifacts.mockResolvedValueOnce([
      { type: 'skill', name: 'vercel:web-design-guidelines', description: 'Design skill' },
    ]);
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'artifacts',
      commandArgs: ['search', 'design'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(io.out.join('\n')).toContain('skill vercel:web-design-guidelines');
  });

  test('handles groups list output', async () => {
    listGroups.mockResolvedValueOnce([
      { name: 'frontend-defaults', entries: ['vercel:web-design-guidelines'] },
    ]);
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'groups',
      commandArgs: ['list'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(io.out.join('\n')).toContain('frontend-defaults');
  });

  test('handles agent-definitions list output', async () => {
    listAgentDefinitions.mockResolvedValueOnce([
      {
        name: 'frontend-agent',
        isDefault: true,
        sourceIds: ['src_vercel'],
        defaultGroups: ['frontend-defaults'],
        allowedArtifacts: ['vercel:web-design-guidelines'],
      },
    ]);
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'agent-definitions',
      commandArgs: ['list'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(io.out.join('\n')).toContain('frontend-agent (default)');
  });

  test('returns 1 and usage for invalid artifacts search usage', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'artifacts',
      commandArgs: ['search'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(1);
    expect(io.err.join('\n')).toContain('Usage: smol-agent artifacts search <query>');
  });
});
