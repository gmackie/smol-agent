/**
 * Unit tests for logger module
 * Tests log level filtering, formatting, and transient error detection
 */

import { describe, test, assertEqual, assertTrue, assertFalse } from '../test-utils.js';
import { createLogger, formatError, isTransientError, LEVELS } from '../../src/logger.js';

export default async function runLoggerTests() {
  await describe('createLogger', async () => {
    await test('creates logger with default level', async () => {
      const log = createLogger();
      assertEqual(log.getLevel(), 'info');
    });

    await test('creates logger with debug level', async () => {
      const log = createLogger('debug');
      assertEqual(log.getLevel(), 'debug');
    });

    await test('creates logger with error level', async () => {
      const log = createLogger('error');
      assertEqual(log.getLevel(), 'error');
    });

    await test('falls back to info for invalid level', async () => {
      const log = createLogger('invalid');
      assertEqual(log.getLevel(), 'info');
    });

    await test('setLevel changes level', async () => {
      const log = createLogger('error');
      assertEqual(log.getLevel(), 'error');
      log.setLevel('debug');
      assertEqual(log.getLevel(), 'debug');
    });
  });

  await describe('LEVELS constant', async () => {
    await test('has correct severity order', async () => {
      assertEqual(LEVELS.debug, 0);
      assertEqual(LEVELS.info, 1);
      assertEqual(LEVELS.warn, 2);
      assertEqual(LEVELS.error, 3);
    });
  });

  await describe('formatError', async () => {
    await test('formats error with stack trace', async () => {
      const err = new Error('Test error');
      err.name = 'TestError';
      const formatted = formatError(err);
      assertTrue(formatted.includes('TestError'), 'Should include error name');
      assertTrue(formatted.includes('Test error'), 'Should include message');
      assertTrue(formatted.includes('Stack trace'), 'Should include stack trace label');
    });

    await test('handles error without stack', async () => {
      const formatted = formatError('Just a string');
      assertEqual(formatted, 'Just a string');
    });

    await test('handles null error', async () => {
      const formatted = formatError(null);
      assertEqual(formatted, 'null');
    });

    await test('handles undefined error', async () => {
      const formatted = formatError(undefined);
      assertEqual(formatted, 'undefined');
    });
  });

  await describe('isTransientError', async () => {
    await test('detects ECONNREFUSED as transient', async () => {
      const err = new Error('Connection refused');
      err.code = 'ECONNREFUSED';
      assertTrue(isTransientError(err));
    });

    await test('detects ETIMEDOUT as transient', async () => {
      const err = new Error('Timed out');
      err.code = 'ETIMEDOUT';
      assertTrue(isTransientError(err));
    });

    await test('detects ECONNRESET as transient', async () => {
      const err = new Error('Connection reset');
      err.code = 'ECONNRESET';
      assertTrue(isTransientError(err));
    });

    await test('detects ENOTFOUND as transient', async () => {
      const err = new Error('Not found');
      err.code = 'ENOTFOUND';
      assertTrue(isTransientError(err));
    });

    await test('detects EAI_AGAIN as transient', async () => {
      const err = new Error('DNS lookup failed');
      err.code = 'EAI_AGAIN';
      assertTrue(isTransientError(err));
    });

    await test('detects timeout message as transient', async () => {
      const err = new Error('Request timeout exceeded');
      assertTrue(isTransientError(err));
    });

    await test('detects deadline message as transient', async () => {
      const err = new Error('Deadline exceeded');
      assertTrue(isTransientError(err));
    });

    await test('detects 429 status as transient', async () => {
      const err = new Error('Rate limited');
      err.status = 429;
      assertTrue(isTransientError(err));
    });

    await test('detects 500 status as transient', async () => {
      const err = new Error('Internal server error');
      err.status = 500;
      assertTrue(isTransientError(err));
    });

    await test('detects 503 status as transient', async () => {
      const err = new Error('Service unavailable');
      err.status = 503;
      assertTrue(isTransientError(err));
    });

    await test('detects 502 status as transient', async () => {
      const err = new Error('Bad gateway');
      err.status = 502;
      assertTrue(isTransientError(err));
    });

    await test('returns false for non-transient errors', async () => {
      const err = new Error('Invalid argument');
      err.status = 400;
      assertFalse(isTransientError(err));
    });

    await test('returns false for null', async () => {
      assertFalse(isTransientError(null));
    });

    await test('returns false for undefined', async () => {
      assertFalse(isTransientError(undefined));
    });
  });
}