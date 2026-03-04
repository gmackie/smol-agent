/**
 * Unit tests for tool-call-parser module
 * Tests parsing of tool calls from model output
 */

import { describe, test, assertEqual, assertTrue } from '../test-utils.js';
import { parseToolCallsFromContent } from '../../src/tool-call-parser.js';

export default async function runToolCallParserTests() {
  await describe('parseToolCallsFromContent', async () => {
    await test('returns empty array for plain text', async () => {
      const result = parseToolCallsFromContent('Hello, this is just a response.');
      assertEqual(result.length, 0);
    });

    await test('parses tool_calls JSON array', async () => {
      const content = 'Here is the result:\n```json\n{"tool_calls": [{"name": "read_file", "arguments": {"filePath": "test.js"}}]}\n```';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'read_file');
      assertEqual(result[0].arguments.filePath, 'test.js');
    });

    await test('parses tool_call (singular) format', async () => {
      const content = '{"tool_call": {"name": "write_file", "arguments": {"filePath": "output.txt", "content": "hello"}}}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'write_file');
      assertEqual(result[0].arguments.content, 'hello');
    });

    await test('parses function call format', async () => {
      const content = '{"function": "grep", "parameters": {"pattern": "TODO"}}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'grep');
      assertEqual(result[0].arguments.pattern, 'TODO');
    });

    await test('parses direct tool invocation', async () => {
      const content = '```tool\nread_file({"filePath": "src/index.js"})\n```';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'read_file');
      assertEqual(result[0].arguments.filePath, 'src/index.js');
    });

    await test('parses tool_use blocks (Claude-style)', async () => {
      const content = `<tool_use>
<name>run_command</name>
<arguments>{"command": "npm test"}</arguments>
</tool_use>`;
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'run_command');
      assertEqual(result[0].arguments.command, 'npm test');
    });

    await test('handles multiple tool calls', async () => {
      const content = `{"tool_calls": [
        {"name": "read_file", "arguments": {"filePath": "a.js"}},
        {"name": "read_file", "arguments": {"filePath": "b.js"}}
      ]}`;
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 2);
      assertEqual(result[0].arguments.filePath, 'a.js');
      assertEqual(result[1].arguments.filePath, 'b.js');
    });

    await test('extracts JSON from code blocks', async () => {
      const content = `I'll read that file:
\`\`\`json
{"name": "list_files", "arguments": {"pattern": "*.js"}}
\`\`\`
Let me know if you need more.`;
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'list_files');
    });

    await test('handles arguments as string (parses to object)', async () => {
      const content = '{"name": "grep", "arguments": "{\\"pattern\\": \\"import\\"}"}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].arguments.pattern, 'import');
    });

    await test('returns empty array for invalid JSON', async () => {
      const content = 'This is not JSON at all { broken';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 0);
    });

    await test('handles null input', async () => {
      const result = parseToolCallsFromContent(null);
      assertEqual(result.length, 0);
    });

    await test('handles undefined input', async () => {
      const result = parseToolCallsFromContent(undefined);
      assertEqual(result.length, 0);
    });

    await test('handles empty string', async () => {
      const result = parseToolCallsFromContent('');
      assertEqual(result.length, 0);
    });

    await test('parses ask_user tool call', async () => {
      const content = '{"name": "ask_user", "arguments": {"question": "What should I do?"}}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result.length, 1);
      assertEqual(result[0].name, 'ask_user');
      assertEqual(result[0].arguments.question, 'What should I do?');
    });

    await test('preserves numeric arguments', async () => {
      const content = '{"name": "test", "arguments": {"count": 5, "ratio": 0.5}}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result[0].arguments.count, 5);
      assertEqual(result[0].arguments.ratio, 0.5);
    });

    await test('preserves boolean arguments', async () => {
      const content = '{"name": "test", "arguments": {"enabled": true, "verbose": false}}';
      const result = parseToolCallsFromContent(content);
      assertEqual(result[0].arguments.enabled, true);
      assertEqual(result[0].arguments.verbose, false);
    });

    await test('preserves array arguments', async () => {
      const content = '{"name": "test", "arguments": {"files": ["a.js", "b.js", "c.js"]}}';
      const result = parseToolCallsFromContent(content);
      assertTrue(Array.isArray(result[0].arguments.files));
      assertEqual(result[0].arguments.files.length, 3);
    });
  });
}