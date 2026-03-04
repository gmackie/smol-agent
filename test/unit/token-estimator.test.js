/**
 * Unit tests for token-estimator module
 * Tests token estimation functions
 */

import { describe, test, assertEqual, assertTrue } from '../test-utils.js';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  getTokenBreakdown,
  countTokens,
  isTiktokenAvailable,
} from '../../src/token-estimator.js';

export default async function runTokenEstimatorTests() {
  await describe('estimateTokens', async () => {
    await test('returns 0 for empty string', async () => {
      assertEqual(estimateTokens(''), 0);
    });

    await test('returns 0 for null', async () => {
      assertEqual(estimateTokens(null), 0);
    });

    await test('returns 0 for undefined', async () => {
      estimateTokens(undefined);
      // Should not throw, returns 0
      assertEqual(estimateTokens(undefined), 0);
    });

    await test('estimates tokens for simple text', async () => {
      const tokens = estimateTokens('Hello world');
      assertTrue(tokens > 0, 'Should return positive token count');
    });

    await test('estimates more tokens for longer text', async () => {
      const shortTokens = estimateTokens('Hello');
      const longTokens = estimateTokens('Hello world this is a longer sentence');
      assertTrue(longTokens > shortTokens, 'Longer text should have more tokens');
    });

    await test('handles non-string input', async () => {
      const tokens = estimateTokens(12345);
      assertTrue(tokens > 0, 'Should convert number to string and estimate');
    });

    await test('handles string with special characters', async () => {
      const tokens = estimateTokens('Hello\nWorld\tTab');
      assertTrue(tokens > 0, 'Should handle special characters');
    });
  });

  await describe('estimateMessageTokens', async () => {
    await test('estimates tokens for simple message', async () => {
      const msg = { role: 'user', content: 'Hello world' };
      const tokens = estimateMessageTokens(msg);
      assertTrue(tokens > 0, 'Should return positive token count');
    });

    await test('includes role overhead', async () => {
      const msg = { role: 'user', content: 'Hello' };
      const textTokens = estimateTokens('Hello');
      const msgTokens = estimateMessageTokens(msg);
      // Message should have more tokens than just the text due to role overhead
      assertTrue(msgTokens > textTokens, 'Message should include overhead');
    });

    await test('includes name in estimation', async () => {
      const msgWith = { role: 'user', content: 'Hello', name: 'Alice' };
      const msgWithout = { role: 'user', content: 'Hello' };
      const tokensWith = estimateMessageTokens(msgWith);
      const tokensWithout = estimateMessageTokens(msgWithout);
      assertTrue(tokensWith > tokensWithout, 'Name should add tokens');
    });

    await test('handles tool_calls', async () => {
      const msg = {
        role: 'assistant',
        content: 'Let me help you.',
        tool_calls: [
          {
            function: {
              name: 'read_file',
              arguments: '{"filePath": "test.js"}',
            },
          },
        ],
      };
      const tokens = estimateMessageTokens(msg);
      assertTrue(tokens > 0, 'Should estimate tokens for tool calls');
    });

    await test('handles empty content', async () => {
      const msg = { role: 'assistant', content: '' };
      const tokens = estimateMessageTokens(msg);
      // Should still have base overhead
      assertTrue(tokens >= 4, 'Should have minimum overhead');
    });

    await test('handles missing content', async () => {
      const msg = { role: 'system' };
      const tokens = estimateMessageTokens(msg);
      assertTrue(tokens >= 4, 'Should have minimum overhead');
    });
  });

  await describe('estimateTotalTokens', async () => {
    await test('returns 0 for empty array', async () => {
      assertEqual(estimateTotalTokens([]), 0);
    });

    await test('returns 0 for null', async () => {
      assertEqual(estimateTotalTokens(null), 0);
    });

    await test('returns 0 for undefined', async () => {
      assertEqual(estimateTotalTokens(undefined), 0);
    });

    await test('estimates tokens for message array', async () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const tokens = estimateTotalTokens(messages);
      assertTrue(tokens > 0, 'Should return positive token count');
    });

    await test('adds conversation overhead', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const singleTokens = estimateMessageTokens(messages[0]);
      const totalTokens = estimateTotalTokens(messages);
      // Total should be more than single message due to conversation overhead
      assertTrue(totalTokens > singleTokens, 'Should add conversation overhead');
    });

    await test('scales with more messages', async () => {
      const few = [{ role: 'user', content: 'Hello' }];
      const many = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
        { role: 'user', content: 'How are you?' },
      ];
      const fewTokens = estimateTotalTokens(few);
      const manyTokens = estimateTotalTokens(many);
      assertTrue(manyTokens > fewTokens, 'More messages should have more tokens');
    });
  });

  await describe('getTokenBreakdown', async () => {
    await test('returns empty breakdown for empty array', async () => {
      const breakdown = getTokenBreakdown([]);
      assertEqual(breakdown.total, 0);
      assertEqual(Object.keys(breakdown.byRole).length, 0);
      assertEqual(breakdown.byMessage.length, 0);
    });

    await test('returns empty breakdown for null', async () => {
      const breakdown = getTokenBreakdown(null);
      assertEqual(breakdown.total, 0);
    });

    await test('provides breakdown by role', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'How are you?' },
      ];
      const breakdown = getTokenBreakdown(messages);
      assertTrue(breakdown.byRole.user > 0, 'Should track user tokens');
      assertTrue(breakdown.byRole.assistant > 0, 'Should track assistant tokens');
    });

    await test('provides per-message breakdown', async () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ];
      const breakdown = getTokenBreakdown(messages);
      assertEqual(breakdown.byMessage.length, 2);
      assertEqual(breakdown.byMessage[0].role, 'user');
      assertEqual(breakdown.byMessage[1].role, 'assistant');
    });

    await test('includes preview of content', async () => {
      const messages = [{ role: 'user', content: 'This is a long message that should be truncated' }];
      const breakdown = getTokenBreakdown(messages);
      assertTrue(breakdown.byMessage[0].preview.length > 0, 'Should include preview');
    });
  });

  await describe('countTokens', async () => {
    await test('is alias for estimateTokens', async () => {
      const text = 'Hello world';
      assertEqual(countTokens(text), estimateTokens(text));
    });
  });

  await describe('isTiktokenAvailable', async () => {
    await test('returns boolean', async () => {
      const available = isTiktokenAvailable();
      assertTrue(typeof available === 'boolean', 'Should return boolean');
    });
  });
}