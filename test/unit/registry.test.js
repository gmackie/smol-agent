/**
 * Unit tests for tool registry module
 * Tests tool registration, validation, and execution
 */

import { describe, test, assertEqual, assertTrue, assertFalse, assertContains } from '../test-utils.js';
import registry from '../../src/tools/registry.js';

// Reset registry state between tests
function setupRegistry() {
  // Registry is a singleton, so we can't fully reset it
  // Instead we use unique tool names for testing
  const prefix = `test_${Date.now()}_`;
  return prefix;
}

export default async function runRegistryTests() {
  const prefix = setupRegistry();

  await describe('register and list', async () => {
    await test('registers a tool and lists it', async () => {
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
      assertTrue(tools.includes(name), `Tool ${name} should be in list`);
    });

    await test('registers core tools', async () => {
      const name = `${prefix}core_tool`;
      registry.register(name, {
        description: 'Core tool',
        parameters: {},
        execute: async () => 'ok',
        core: true
      });
      
      const ollamaTools = registry.ollamaTools(true);
      const names = ollamaTools.map(t => t.function.name);
      assertTrue(names.includes(name), `${name} should be in core tools`);
    });

    await test('registers extended tools (non-core)', async () => {
      const name = `${prefix}extended_tool`;
      registry.register(name, {
        description: 'Extended tool',
        parameters: {},
        execute: async () => 'ok',
        core: false
      });
      
      const ollamaTools = registry.ollamaTools(true);
      const names = ollamaTools.map(t => t.function.name);
      assertFalse(names.includes(name), `${name} should not be in core tools`);
    });
  });

  await describe('validateToolArgs', async () => {
    await test('validates required arguments', async () => {
      const result = registry.validateToolArgs('test', {}, { required: ['foo'] });
      assertFalse(result.valid, 'Should fail validation');
      assertContains(result.errors[0], 'Missing required argument: foo');
    });

    await test('passes with all required args', async () => {
      const result = registry.validateToolArgs('test',
        { foo: 'bar' },
        { required: ['foo'], properties: { foo: { type: 'string' } } }
      );
      assertTrue(result.valid, 'Should pass validation');
    });

    await test('validates grep regex pattern', async () => {
      const result = registry.validateToolArgs('grep',
        { pattern: '[invalid(regex' },
        { properties: { pattern: { type: 'string' } } }
      );
      assertFalse(result.valid, 'Invalid regex should fail');
    });

    await test('validates run_command length', async () => {
      const longCmd = 'x'.repeat(10001);
      const result = registry.validateToolArgs('run_command',
        { command: longCmd },
        { properties: { command: { type: 'string' } } }
      );
      assertFalse(result.valid, 'Long command should fail');
    });

    await test('rejects non-object args', async () => {
      const result = registry.validateToolArgs('test', null, {});
      assertFalse(result.valid, 'Null args should fail');
    });
  });

  await describe('validateFilePath', async () => {
    await test('rejects non-string paths', async () => {
      const result = registry.validateFilePath(123, '/base');
      assertFalse(result.valid, 'Non-string path should fail');
    });

    await test('rejects null bytes in path', async () => {
      const result = registry.validateFilePath('file\0.txt', '/base');
      assertFalse(result.valid, 'Null byte should fail');
    });

    await test('rejects path traversal', async () => {
      const result = registry.validateFilePath('../escape.txt', '/base');
      assertFalse(result.valid, 'Path traversal should fail');
    });

    await test('accepts valid relative paths', async () => {
      const result = registry.validateFilePath('subdir/file.txt', '/base');
      assertTrue(result.valid, 'Valid relative path should pass');
    });
  });

  await describe('execute', async () => {
    await test('executes a registered tool', async () => {
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
      assertEqual(result.result, 5);
    });

    await test('returns error for unknown tool', async () => {
      const result = await registry.execute('nonexistent_tool_xyz', {});
      assertTrue(result.error.includes('Unknown tool'), 'Should return unknown tool error');
    });

    await test('returns error for invalid args', async () => {
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
      assertTrue(result.error.includes('Missing required argument'), 'Should return validation error');
    });
  });

  await describe('requiresApproval', async () => {
    await test('write_file requires approval', async () => {
      assertTrue(registry.requiresApproval('write_file'));
    });

    await test('replace_in_file requires approval', async () => {
      assertTrue(registry.requiresApproval('replace_in_file'));
    });

    await test('run_command requires approval', async () => {
      assertTrue(registry.requiresApproval('run_command'));
    });

    await test('read_file does not require approval', async () => {
      assertFalse(registry.requiresApproval('read_file'));
    });
  });

  await describe('ollamaTools format', async () => {
    await test('returns tools in Ollama format', async () => {
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
      
      assertTrue(tool, 'Tool should be found');
      assertEqual(tool.type, 'function');
      assertTrue(tool.function.description, 'Should have description');
      assertTrue(tool.function.parameters, 'Should have parameters');
    });
  });
}