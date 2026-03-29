import { describe, test, expect, jest } from '@jest/globals';

const setGroupEntries = jest.fn();
const addGroupEntries = jest.fn();
const removeGroup = jest.fn();
const setAgentDefinition = jest.fn();
const setDefaultAgentDefinition = jest.fn();
const removeAgentDefinition = jest.fn();

jest.unstable_mockModule('../../src/policy-manager.js', () => ({
  setGroupEntries,
  addGroupEntries,
  removeGroup,
  setAgentDefinition,
  setDefaultAgentDefinition,
  removeAgentDefinition,
}));

jest.unstable_mockModule('../../src/source-manager.js', () => ({
  installSource: jest.fn(),
  updateSource: jest.fn(),
  removeSource: jest.fn(),
}));

jest.unstable_mockModule('../../src/project-inventory.js', () => ({
  runProjectInventoryQuery: jest.fn(),
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

describe('runProjectCommand policy management', () => {
  test('handles groups set', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'groups',
      commandArgs: ['set', 'frontend-defaults', 'vercel:web-design-guidelines', 'local-skill'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(setGroupEntries).toHaveBeenCalledWith(
      '/tmp/project',
      'frontend-defaults',
      ['vercel:web-design-guidelines', 'local-skill'],
    );
  });

  test('handles groups add', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'groups',
      commandArgs: ['add', 'frontend-defaults', 'local-skill'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(addGroupEntries).toHaveBeenCalledWith('/tmp/project', 'frontend-defaults', ['local-skill']);
  });

  test('handles agent-definitions set with repeated flags', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'agent-definitions',
      commandArgs: [
        'set',
        'frontend-agent',
        '--source', 'src_vercel',
        '--source', 'src_custom',
        '--group', 'frontend-defaults',
        '--allow', 'local-skill',
        '--default',
      ],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(setAgentDefinition).toHaveBeenCalledWith('/tmp/project', 'frontend-agent', {
      sourceIds: ['src_vercel', 'src_custom'],
      defaultGroups: ['frontend-defaults'],
      allowedArtifacts: ['local-skill'],
      isDefault: true,
    });
  });

  test('handles agent-definitions default', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'agent-definitions',
      commandArgs: ['default', 'frontend-agent'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(0);
    expect(setDefaultAgentDefinition).toHaveBeenCalledWith('/tmp/project', 'frontend-agent');
  });

  test('returns usage for invalid groups set usage', async () => {
    const io = createIo();

    const code = await runProjectCommand({
      commandName: 'groups',
      commandArgs: ['set', 'frontend-defaults'],
      cwd: '/tmp/project',
      io,
    });

    expect(code).toBe(1);
    expect(io.err.join('\n')).toContain('Usage: smol-agent groups set <name> <artifact...>');
  });
});
