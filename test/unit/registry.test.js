/**
 * Unit tests for tool registry module
 * Tests tool registration, validation, and execution
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import registry from '../../src/tools/registry.js';

// Reset registry state between tests
function setupRegistry() {
  // Registry is a singleton, so we can't fully reset it
  // Instead we use unique tool names for testing
  const prefix = `test_${Date.now()}_`;
  return prefix;
}

describe('register and list', () => {
  let prefix;

  beforeEach(() => {
    prefix = setupRegistry();
  });

  test('registers a tool and lists it', () => {
    const name = `${prefix}echo`;
    registry.register(name, {
      description: 'Echo test tool',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        }
      },
      execute: async (args) => args.message
    });

    const tools = registry.list();
    expect(tools).toContain(name);
  });

  test('registers core tools', () => {
    const name = `${prefix}core_tool`;
    registry.register(name, {
      description: 'Core tool',
      parameters: {},
      execute: async () => 'ok',
      core: true
    });

    const ollamaTools = registry.ollamaTools(true);
    const names = ollamaTools.map(t => t.function.name);
    expect(names).toContain(name);
  });

  test('registers extended tools (non-core)', () => {
    const name = `${prefix}extended_tool`;
    registry.register(name, {
      description: 'Extended tool',
      parameters: {},
      execute: async () => 'ok',
      core: false
    });

    const ollamaTools = registry.ollamaTools(true);
    const names = ollamaTools.map(t => t.function.name);
    expect(names).not.toContain(name);
  });
});

describe('validateToolArgs', () => {
  test('validates required arguments', () => {
    const result = registry.validateToolArgs('test', {}, { required: ['foo'] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('Missing required argument: foo');
  });

  test('passes with all required args', () => {
    const result = registry.validateToolArgs('test',
      { foo: 'bar' },
      { required: ['foo'], properties: { foo: { type: 'string' } } }
    );
    expect(result.valid).toBe(true);
  });

  test('validates grep regex pattern', () => {
    const result = registry.validateToolArgs('grep',
      { pattern: '[invalid(regex' },
      { properties: { pattern: { type: 'string' } } }
    );
    expect(result.valid).toBe(false);
  });

  test('validates run_command length', () => {
    const longCmd = 'x'.repeat(10001);
    const result = registry.validateToolArgs('run_command',
      { command: longCmd },
      { properties: { command: { type: 'string' } } }
    );
    expect(result.valid).toBe(false);
  });

  test('rejects non-object args', () => {
    const result = registry.validateToolArgs('test', null, {});
    expect(result.valid).toBe(false);
  });
});

describe('validateFilePath', () => {
  test('rejects non-string paths', () => {
    const result = registry.validateFilePath(123, '/base');
    expect(result.valid).toBe(false);
  });

  test('rejects null bytes in path', () => {
    const result = registry.validateFilePath('file\0.txt', '/base');
    expect(result.valid).toBe(false);
  });

  test('rejects path traversal', () => {
    const result = registry.validateFilePath('../escape.txt', '/base');
    expect(result.valid).toBe(false);
  });

  test('accepts valid relative paths', () => {
    const result = registry.validateFilePath('subdir/file.txt', '/base');
    expect(result.valid).toBe(true);
  });
});

describe('execute', () => {
  let prefix;

  beforeEach(() => {
    prefix = setupRegistry();
  });

  test('executes a registered tool', async () => {
    const name = `${prefix}add`;
    registry.register(name, {
      description: 'Add two numbers',
      parameters: {
        type: 'object',
        required: ['a', 'b'],
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        }
      },
      execute: async ({ a, b }) => ({ result: a + b })
    });

    const result = await registry.execute(name, { a: 2, b: 3 });
    expect(result.result).toBe(5);
  });

  test('returns error for unknown tool', async () => {
    const result = await registry.execute('nonexistent_tool_xyz', {});
    expect(result.error).toContain('Unknown tool');
  });

  test('returns error for invalid args', async () => {
    const name = `${prefix}needs_arg`;
    registry.register(name, {
      description: 'Needs arg',
      parameters: {
        type: 'object',
        required: ['requiredArg'],
        properties: {
          requiredArg: { type: 'string' }
        }
      },
      execute: async () => 'ok'
    });

    const result = await registry.execute(name, {});
    expect(result.error).toContain('Missing required argument');
  });
});

describe('requiresApproval', () => {
  test('write_file requires approval', () => {
    expect(registry.requiresApproval('write_file')).toBe(true);
  });

  test('replace_in_file requires approval', () => {
    expect(registry.requiresApproval('replace_in_file')).toBe(true);
  });

  test('run_command requires approval', () => {
    expect(registry.requiresApproval('run_command')).toBe(true);
  });

  test('read_file does not require approval', () => {
    expect(registry.requiresApproval('read_file')).toBe(false);
  });
});

describe('ollamaTools format', () => {
  let prefix;

  beforeEach(() => {
    prefix = setupRegistry();
  });

  test('returns tools in Ollama format', () => {
    const name = `${prefix}format_test`;
    registry.register(name, {
      description: 'Format test',
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Input value' }
        }
      },
      execute: async () => 'ok'
    });

    const tools = registry.ollamaTools(false);
    const tool = tools.find(t => t.function.name === name);

    expect(tool).toBeDefined();
    expect(tool.type).toBe('function');
    expect(tool.function.description).toBeTruthy();
    expect(tool.function.parameters).toBeTruthy();
  });
});