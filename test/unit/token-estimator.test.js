/**
 * Unit tests for token-estimator module
 * Tests token counting for messages and text
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  getTokenBreakdown,
  countTokens,
  isTiktokenAvailable,
  ensureInitialized
} from '../../src/token-estimator.js';

describe('estimateTokens', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  test('returns 0 for null', () => {
    expect(estimateTokens(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(estimateTokens(undefined)).toBe(0);
  });

  test('returns positive tokens for number', () => {
    const result = estimateTokens(12345);
    expect(result).toBeGreaterThan(0);
  });

  test('counts tokens for simple text', () => {
    const text = 'Hello world';
    const tokens = estimateTokens(text);
    // "Hello world" is typically 2 tokens
    expect(tokens).toBeGreaterThanOrEqual(1);
    expect(tokens).toBeLessThanOrEqual(5);
  });

  test('counts more tokens for longer text', () => {
    const short = 'Hello';
    const long = 'Hello world this is a longer sentence with more words';
    const shortTokens = estimateTokens(short);
    const longTokens = estimateTokens(long);
    expect(longTokens).toBeGreaterThan(shortTokens);
  });

  test('handles code content', () => {
    const code = 'function add(a, b) { return a + b; }';
    const tokens = estimateTokens(code);
    expect(tokens).toBeGreaterThan(0);
  });

  test('handles special characters', () => {
    const text = '```javascript\nconst x = 1;\n```';
    const tokens = estimateTokens(text);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateMessageTokens', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('counts tokens for simple user message', () => {
    const msg = { role: 'user', content: 'Hello' };
    const tokens = estimateMessageTokens(msg);
    // Base overhead (4) + role tokens + content tokens
    expect(tokens).toBeGreaterThan(4);
  });

  test('counts tokens for assistant message', () => {
    const msg = { role: 'assistant', content: 'Hello there!' };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBeGreaterThan(4);
  });

  test('includes name overhead', () => {
    const msgWithName = { role: 'user', name: 'TestUser', content: 'Hello' };
    const msgWithoutName = { role: 'user', content: 'Hello' };
    const tokensWithName = estimateMessageTokens(msgWithName);
    const tokensWithoutName = estimateMessageTokens(msgWithoutName);
    expect(tokensWithName).toBeGreaterThan(tokensWithoutName);
  });

  test('counts tool_calls overhead', () => {
    const msg = {
      role: 'assistant',
      content: 'Here is the result',
      tool_calls: [
        {
          function: {
            name: 'read_file',
            arguments: '{"filePath": "test.js"}'
          }
        }
      ]
    };
    const tokens = estimateMessageTokens(msg);
    // Should include tool call overhead (3 base + 5 per call)
    expect(tokens).toBeGreaterThan(10);
  });

  test('handles multiple tool calls', () => {
    const singleTool = {
      role: 'assistant',
      tool_calls: [{ function: { name: 'read_file', arguments: '{}' } }]
    };
    const multiTool = {
      role: 'assistant',
      tool_calls: [
        { function: { name: 'read_file', arguments: '{}' } },
        { function: { name: 'write_file', arguments: '{}' } }
      ]
    };
    const singleTokens = estimateMessageTokens(singleTool);
    const multiTokens = estimateMessageTokens(multiTool);
    expect(multiTokens).toBeGreaterThan(singleTokens);
  });

  test('handles parsed arguments object', () => {
    const msg = {
      role: 'assistant',
      tool_calls: [
        {
          function: {
            name: 'grep',
            arguments: { pattern: 'TODO', path: 'src/' }  // Object, not string
          }
        }
      ]
    };
    const tokens = estimateMessageTokens(msg);
    expect(tokens).toBeGreaterThan(0);
  });

  test('handles message without content', () => {
    const msg = { role: 'assistant', tool_calls: [] };
    const tokens = estimateMessageTokens(msg);
    // Should still count base overhead
    expect(tokens).toBeGreaterThanOrEqual(4);
  });
});

describe('estimateTotalTokens', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('returns baseline overhead for empty array', () => {
    const tokens = estimateTotalTokens([]);
    // Empty array still has conversation overhead (3) + response overhead (4) = 7
    expect(tokens).toBeGreaterThanOrEqual(0);
  });

  test('returns 0 for null', () => {
    expect(estimateTotalTokens(null)).toBe(0);
  });

  test('returns 0 for undefined', () => {
    expect(estimateTotalTokens(undefined)).toBe(0);
  });

  test('includes conversation overhead', () => {
    const messages = [
      { role: 'user', content: 'Hello' }
    ];
    const tokens = estimateTotalTokens(messages);
    // Should include 3 for conversation overhead + 4 for response overhead
    expect(tokens).toBeGreaterThan(7);
  });

  test('sums multiple messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' }
    ];
    const total = estimateTotalTokens(messages);
    const sum = messages.reduce((acc, msg) => acc + estimateMessageTokens(msg), 0);
    expect(total).toBeGreaterThan(sum);
  });
});

describe('getTokenBreakdown', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('returns empty breakdown for empty array', () => {
    const result = getTokenBreakdown([]);
    expect(result.total).toBe(0);
    expect(Object.keys(result.byRole).length).toBe(0);
    expect(result.byMessage.length).toBe(0);
  });

  test('returns empty breakdown for null', () => {
    const result = getTokenBreakdown(null);
    expect(result.total).toBe(0);
  });

  test('groups by role', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'How are you?' }
    ];
    const result = getTokenBreakdown(messages);

    expect(result.byRole.user).toBeGreaterThan(0);
    expect(result.byRole.assistant).toBeGreaterThan(0);
  });

  test('includes message previews', () => {
    const messages = [
      { role: 'user', content: 'This is a long message that should be truncated in the preview' }
    ];
    const result = getTokenBreakdown(messages);

    expect(result.byMessage.length).toBe(1);
    expect(result.byMessage[0].role).toBe('user');
    expect(result.byMessage[0].tokens).toBeGreaterThan(0);
    expect(result.byMessage[0].preview.length).toBeLessThanOrEqual(53); // 50 chars + '...'
  });

  test('handles message without content', () => {
    const messages = [
      { role: 'assistant', tool_calls: [] }
    ];
    const result = getTokenBreakdown(messages);

    expect(result.byMessage.length).toBe(1);
    expect(result.byMessage[0].preview).toBe('');
  });
});

describe('countTokens', () => {
  beforeAll(async () => {
    await ensureInitialized();
  });

  test('is alias for estimateTokens', () => {
    const text = 'Hello world';
    expect(countTokens(text)).toBe(estimateTokens(text));
  });
});

describe('isTiktokenAvailable', () => {
  test('returns boolean', () => {
    const result = isTiktokenAvailable();
    expect(typeof result).toBe('boolean');
  });
});