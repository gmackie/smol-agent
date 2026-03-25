/**
 * Unit tests for tool-call-parser module.
 *
 * Tests parsing of tool calls from model output:
 * - parseToolCallsFromContent: Extracting tool calls from text
 * - JSON code block detection
 * - Fallback parsing for models that emit tool calls as JSON
 * - Handling malformed tool call JSON
 *
 * Dependencies: @jest/globals, ../../src/tool-call-parser.js
 */
import { describe, test, expect } from '@jest/globals';
import { parseToolCallsFromContent } from '../../src/tool-call-parser.js';

describe('parseToolCallsFromContent', () => {
  test('returns empty array for plain text', () => {
    const result = parseToolCallsFromContent('Hello, this is just a response.');
    expect(result.length).toBe(0);
  });

  test('parses name/arguments format in code block', () => {
    const content = 'I will use the tool:\n```json\n{"name": "write_file", "arguments": {"filePath": "output.txt", "content": "hello"}}\n```';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('write_file');
    expect(result[0].function.arguments.content).toBe('hello');
  });

  test('parses direct tool invocation', () => {
    const content = 'read_file({"filePath": "src/index.js"})';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('read_file');
    expect(result[0].function.arguments.filePath).toBe('src/index.js');
  });

  test('handles multiple tool calls in array', () => {
    const content = '{"tool_calls": [{"name": "read_file", "arguments": {"filePath": "a.js"}}, {"name": "read_file", "arguments": {"filePath": "b.js"}}]}';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(2);
    expect(result[0].function.arguments.filePath).toBe('a.js');
    expect(result[1].function.arguments.filePath).toBe('b.js');
  });

  test('extracts JSON from code blocks', () => {
    const content = 'I will read that file:\n```json\n{"name": "list_files", "arguments": {"pattern": "*.js"}}\n```\nLet me know if you need more.';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('list_files');
  });

  test('returns empty array for invalid JSON', () => {
    const content = 'This is not JSON at all { broken';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(0);
  });

  test('handles null input', () => {
    const result = parseToolCallsFromContent(null);
    expect(result.length).toBe(0);
  });

  test('handles undefined input', () => {
    const result = parseToolCallsFromContent(undefined);
    expect(result.length).toBe(0);
  });

  test('handles empty string', () => {
    const result = parseToolCallsFromContent('');
    expect(result.length).toBe(0);
  });

  test('parses ask_user tool call', () => {
    const content = '{"name": "ask_user", "arguments": {"question": "What should I do?"}}';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('ask_user');
    expect(result[0].function.arguments.question).toBe('What should I do?');
  });

  test('parses function wrapper format', () => {
    const content = '{"function": {"name": "read_file", "arguments": {"filePath": "test.js"}}}';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('read_file');
    expect(result[0].function.arguments.filePath).toBe('test.js');
  });

  test('parses array of tool calls', () => {
    const content = '[{"name": "read_file", "arguments": {"filePath": "a.js"}}, {"name": "write_file", "arguments": {"filePath": "b.js", "content": "test"}}]';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(2);
    expect(result[0].function.name).toBe('read_file');
    expect(result[1].function.name).toBe('write_file');
  });

  test('deduplicates identical calls', () => {
    const content = '{"name": "read_file", "arguments": {"filePath": "test.js"}}\n{"name": "read_file", "arguments": {"filePath": "test.js"}}';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
  });

  test('marks calls as text parsed', () => {
    const content = '{"name": "read_file", "arguments": {"filePath": "test.js"}}';
    const result = parseToolCallsFromContent(content);
    expect(result[0]._textParsed).toBe(true);
  });

  test('can disable textParsed marking', () => {
    const content = '{"name": "read_file", "arguments": {"filePath": "test.js"}}';
    const result = parseToolCallsFromContent(content, { markAsTextParsed: false });
    expect(result[0]._textParsed).toBeUndefined();
  });

  test('parses multiple function calls in text', () => {
    const content = 'I will run these commands:\nrun_command({"command": "npm test"})\nrun_command({"command": "npm run lint"})';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(2);
    expect(result[0].function.arguments.command).toBe('npm test');
    expect(result[1].function.arguments.command).toBe('npm run lint');
  });

  test('extracts fenced code without json label', () => {
    const content = '```\n{"name": "grep", "arguments": {"pattern": "import"}}\n```';
    const result = parseToolCallsFromContent(content);
    expect(result.length).toBe(1);
    expect(result[0].function.name).toBe('grep');
  });
});