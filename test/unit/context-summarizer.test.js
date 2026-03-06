/**
 * Unit tests for context-summarizer module
 * Tests message summarization and selection logic
 */

import { describe, test, expect } from '@jest/globals';
import { selectMessagesToSummarize, createSimpleSummary } from '../../src/context-summarizer.js';

// Mock token estimator for consistent testing
function mockEstimateTokens(msg) {
  if (!msg.content) return 10;
  return Math.ceil(msg.content.length / 4) + 10;
}

describe('selectMessagesToSummarize', () => {
  test('keeps recent messages', () => {
    const messages = [
      { role: 'system', content: 'You are an assistant' },
      { role: 'user', content: 'Message 1' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Message 2' },
      { role: 'assistant', content: 'Response 2' },
    ];

    const { toKeep, systemMsg } = selectMessagesToSummarize(
      messages,
      1000,
      mockEstimateTokens
    );

    // Should keep all messages when they fit in budget
    expect(toKeep.length).toBeGreaterThanOrEqual(2);
    expect(systemMsg).not.toBeNull();
  });

  test('splits at assistant message boundary', () => {
    const messages = [
      { role: 'system', content: 'System' },
      { role: 'user', content: 'Old user message' },
      { role: 'assistant', content: 'Old assistant message' },
      { role: 'user', content: 'Recent user message' },
      { role: 'assistant', content: 'Recent assistant message' },
    ];

    const { toSummarize } = selectMessagesToSummarize(
      messages,
      50, // Small budget forces summarization
      mockEstimateTokens
    );

    // Split should be at an assistant message boundary
    if (toSummarize.length > 0) {
      // The last message to summarize should be an assistant
      const lastToSummarize = toSummarize[toSummarize.length - 1];
      expect(lastToSummarize.role).toBe('assistant');
    }
  });

  test('separates system message', () => {
    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const { systemMsg, toSummarize, toKeep } = selectMessagesToSummarize(
      messages,
      1000,
      mockEstimateTokens
    );

    expect(systemMsg).not.toBeNull();
    expect(systemMsg.role).toBe('system');
    // System message should not be in toKeep or toSummarize
    expect(toKeep.some(m => m.role === 'system')).toBe(false);
    expect(toSummarize.some(m => m.role === 'system')).toBe(false);
  });

  test('handles no system message', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const { systemMsg } = selectMessagesToSummarize(
      messages,
      1000,
      mockEstimateTokens
    );

    expect(systemMsg).toBeNull();
  });

  test('keeps minimum messages', () => {
    const messages = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ role: 'user', content: `Message ${i}` });
      messages.push({ role: 'assistant', content: `Response ${i}` });
    }

    const { toKeep } = selectMessagesToSummarize(
      messages,
      10, // Very small budget
      mockEstimateTokens
    );

    // Should keep at least MIN_KEEP_MESSAGES (6)
    expect(toKeep.length).toBeGreaterThanOrEqual(6);
  });

  test('summarizes older messages first', () => {
    const messages = [
      { role: 'user', content: 'Oldest message' },
      { role: 'assistant', content: 'Oldest response' },
      { role: 'user', content: 'Middle message' },
      { role: 'assistant', content: 'Middle response' },
      { role: 'user', content: 'Newest message' },
      { role: 'assistant', content: 'Newest response' },
    ];

    const { toKeep, toSummarize } = selectMessagesToSummarize(
      messages,
      50,
      mockEstimateTokens
    );

    // Older messages should be in toSummarize
    if (toSummarize.length > 0) {
      expect(
        toSummarize.every(m => m.content.includes('Oldest') || m.content.includes('Middle'))
      ).toBe(true);
      expect(
        toKeep.every(m => m.content.includes('Newest'))
      ).toBe(true);
    }
  });
});

describe('createSimpleSummary', () => {
  test('extracts file references', () => {
    const messages = [
      { role: 'user', content: 'Read src/index.js and fix the bug' },
      { role: 'assistant', content: 'I read src/index.js and found the issue' },
    ];

    const summary = createSimpleSummary(messages);
    expect(summary).toContain('src/index.js');
  });

  test('extracts multiple file types', () => {
    const messages = [
      { role: 'user', content: 'Edit config.json and update test.py' },
      { role: 'assistant', content: 'Done' },
    ];

    const summary = createSimpleSummary(messages);
    expect(summary).toContain('config.json');
    expect(summary).toContain('test.py');
  });

  test('tracks tool usage', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: '', tool_calls: [
        { function: { name: 'read_file' } },
        { function: { name: 'write_file' } }
      ]},
    ];

    const summary = createSimpleSummary(messages);
    expect(summary).toContain('read_file');
    expect(summary).toContain('write_file');
  });

  test('includes recent topics', () => {
    const messages = [
      { role: 'user', content: 'First topic' },
      { role: 'assistant', content: 'Response 1' },
      { role: 'user', content: 'Second topic with more details' },
      { role: 'assistant', content: 'Response 2' },
    ];

    const summary = createSimpleSummary(messages);
    expect(summary).toContain('First topic');
    expect(summary).toContain('messages compacted');
  });

  test('handles empty messages', () => {
    const summary = createSimpleSummary([]);
    expect(summary).toContain('0 earlier messages');
  });

  test('truncates long user messages in topics', () => {
    const longMessage = 'A'.repeat(100);
    const messages = [
      { role: 'user', content: longMessage },
      { role: 'assistant', content: 'Response' },
    ];

    const summary = createSimpleSummary(messages);
    // Topics should be truncated to 50 chars
    expect(summary.length).toBeLessThan(500);
  });

  test('limits file list to 5', () => {
    const messages = [
      { role: 'user', content: 'Edit a.js b.js c.js d.js e.js f.js g.js' },
      { role: 'assistant', content: 'Done' },
    ];

    const summary = createSimpleSummary(messages);
    expect(summary).toContain('...');
  });
});