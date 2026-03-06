/**
 * Unit tests for logger module
 * Tests log level filtering, formatting, and transient error detection
 */

import { describe, test, expect } from '@jest/globals';
import { createLogger, formatError, isTransientError, LEVELS } from '../../src/logger.js';

describe('createLogger', () => {
  test('creates logger with default level', () => {
    const log = createLogger();
    expect(log.getLevel()).toBe('info');
  });

  test('creates logger with debug level', () => {
    const log = createLogger('debug');
    expect(log.getLevel()).toBe('debug');
  });

  test('creates logger with error level', () => {
    const log = createLogger('error');
    expect(log.getLevel()).toBe('error');
  });

  test('falls back to info for invalid level', () => {
    const log = createLogger('invalid');
    expect(log.getLevel()).toBe('info');
  });

  test('setLevel changes level', () => {
    const log = createLogger('error');
    expect(log.getLevel()).toBe('error');
    log.setLevel('debug');
    expect(log.getLevel()).toBe('debug');
  });
});

describe('LEVELS constant', () => {
  test('has correct severity order', () => {
    expect(LEVELS.debug).toBe(0);
    expect(LEVELS.info).toBe(1);
    expect(LEVELS.warn).toBe(2);
    expect(LEVELS.error).toBe(3);
  });
});

describe('formatError', () => {
  test('formats error with stack trace', () => {
    const err = new Error('Test error');
    err.name = 'TestError';
    const formatted = formatError(err);
    expect(formatted).toContain('TestError');
    expect(formatted).toContain('Test error');
    expect(formatted).toContain('Stack trace');
  });

  test('handles error without stack', () => {
    const formatted = formatError('Just a string');
    expect(formatted).toBe('Just a string');
  });

  test('handles null error', () => {
    const formatted = formatError(null);
    expect(formatted).toBe('null');
  });

  test('handles undefined error', () => {
    const formatted = formatError(undefined);
    expect(formatted).toBe('undefined');
  });
});

describe('isTransientError', () => {
  test('detects ECONNREFUSED as transient', () => {
    const err = new Error('Connection refused');
    err.code = 'ECONNREFUSED';
    expect(isTransientError(err)).toBe(true);
  });

  test('detects ETIMEDOUT as transient', () => {
    const err = new Error('Timed out');
    err.code = 'ETIMEDOUT';
    expect(isTransientError(err)).toBe(true);
  });

  test('detects ECONNRESET as transient', () => {
    const err = new Error('Connection reset');
    err.code = 'ECONNRESET';
    expect(isTransientError(err)).toBe(true);
  });

  test('detects ENOTFOUND as transient', () => {
    const err = new Error('Not found');
    err.code = 'ENOTFOUND';
    expect(isTransientError(err)).toBe(true);
  });

  test('detects EAI_AGAIN as transient', () => {
    const err = new Error('DNS lookup failed');
    err.code = 'EAI_AGAIN';
    expect(isTransientError(err)).toBe(true);
  });

  test('detects timeout message as transient', () => {
    const err = new Error('Request timeout exceeded');
    expect(isTransientError(err)).toBe(true);
  });

  test('detects deadline message as transient', () => {
    const err = new Error('Deadline exceeded');
    expect(isTransientError(err)).toBe(true);
  });

  test('detects 429 status as transient', () => {
    const err = new Error('Rate limited');
    err.status = 429;
    expect(isTransientError(err)).toBe(true);
  });

  test('detects 500 status as transient', () => {
    const err = new Error('Internal server error');
    err.status = 500;
    expect(isTransientError(err)).toBe(true);
  });

  test('detects 503 status as transient', () => {
    const err = new Error('Service unavailable');
    err.status = 503;
    expect(isTransientError(err)).toBe(true);
  });

  test('detects 502 status as transient', () => {
    const err = new Error('Bad gateway');
    err.status = 502;
    expect(isTransientError(err)).toBe(true);
  });

  test('returns false for non-transient errors', () => {
    const err = new Error('Invalid argument');
    err.status = 400;
    expect(isTransientError(err)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isTransientError(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isTransientError(undefined)).toBe(false);
  });
});