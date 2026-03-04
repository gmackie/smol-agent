/**
 * Unit tests for context-summarizer module
 * Tests message summarization utilities
 */

import { describe, test, assertEqual, assertTrue } from '../test-utils.js';
import { selectMessagesToSummarize } from '../../src/context-summarizer.js';

export default async function runContextSummarizerTests() {
  await describe('selectMessagesToSummarize', async () => {
    await test('returns empty array for empty messages', async () => {
      const result = selectMessagesToSummarize([], 1000);
      assertEqual(result.length, 0);
    });

    await test('returns empty array for single message', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const result = selectMessagesToSummarize(messages, 1000);
      assertEqual(result.length, 0);
    });

    await test('returns empty array for messages below threshold', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
        { role: 'assistant', content: 'I am well!' },
      ];
      const result = selectMessagesToSummarize(messages, 10000);
      assertEqual(result.length, 0);
    });

    await test('selects older messages for summarization', async () => {
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` });
      }
      // With threshold of 5, should select messages from the older half
      const result = selectMessagesToSummarize(messages, 5);
      assertTrue(result.length > 0);
      assertTrue(result.length < messages.length);
      // First message should be in the selection
      assertTrue(result.some(m => m.content === 'Message 0'));
    });

    await test('preserves recent messages', async () => {
      const messages = [];
      for (let i = 0; i < 20; i++) {
        messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` });
      }
      const result = selectMessagesToSummarize(messages, 5);
      // Last few messages should NOT be in selection
      assertTrue(!result.some(m => m.content === 'Message 19'));
      assertTrue(!result.some(m => m.content === 'Message 18'));
      assertTrue(!result.some(m => m.content === 'Message 17'));
    });

    await test('handles messages with tool calls', async () => {
      const messages = [
        { role: 'user', content: 'Read a file' },
        { role: 'assistant', content: '', tool_calls: [{ name: 'read_file', arguments: { filePath: 'test.js' } }] },
        { role: 'tool', content: 'file contents here' },
        { role: 'assistant', content: 'I read the file.' },
        { role: 'user', content: 'Thanks' },
        { role: 'assistant', content: 'You are welcome!' },
      ];
      const result = selectMessagesToSummarize(messages, 2);
      // Should handle tool role messages
      assertTrue(Array.isArray(result));
    });

    await test('handles single user message', async () => {
      const messages = [{ role: 'user', content: 'Just one message' }];
      const result = selectMessagesToSummarize(messages, 1);
      assertEqual(result.length, 0);
    });

    await test('handles threshold of 0', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ];
      const result = selectMessagesToSummarize(messages, 0);
      // Should still preserve at least some messages
      assertTrue(result.length < messages.length || result.length === 0);
    });

    await test('handles large message arrays', async () => {
      const messages = [];
      for (let i = 0; i < 100; i++) {
        messages.push({ role: i % 2 === 0 ? 'user' : 'assistant', content: `Message ${i}` });
      }
      const result = selectMessagesToSummarize(messages, 20);
      assertTrue(result.length > 0);
      assertTrue(result.length < messages.length);
    });
  });
}