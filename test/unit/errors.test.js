/**
 * Unit tests for errors module
 * Tests error classification utilities
 */

import { describe, test, assertEqual, assertTrue, assertFalse } from '../test-utils.js';
import { isContextOverflowError, classifyError } from '../../src/errors.js';

export default async function runErrorsTests() {
  await describe('isContextOverflowError', async () => {
    await test('detects "context length" error', async () => {
      const err = new Error('context length exceeded');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects "prompt is too long" error', async () => {
      const err = new Error('prompt is too long for this model');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects "maximum context" error', async () => {
      const err = new Error('maximum context window exceeded');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects "token limit" error', async () => {
      const err = new Error('token limit reached');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects "sequence length" error', async () => {
      const err = new Error('sequence length exceeds maximum');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects "context window" error', async () => {
      const err = new Error('context window full');
      assertTrue(isContextOverflowError(err));
    });

    await test('detects error in nested object', async () => {
      const err = { error: { message: 'context length exceeded' } };
      assertTrue(isContextOverflowError(err));
    });

    await test('detects error from string', async () => {
      assertTrue(isContextOverflowError('too many tokens'));
    });

    await test('returns false for unrelated errors', async () => {
      const err = new Error('network connection failed');
      assertFalse(isContextOverflowError(err));
    });

    await test('returns false for null', async () => {
      assertFalse(isContextOverflowError(null));
    });

    await test('returns false for undefined', async () => {
      assertFalse(isContextOverflowError(undefined));
    });

    await test('is case-insensitive', async () => {
      const err = new Error('CONTEXT LENGTH Exceeded');
      assertTrue(isContextOverflowError(err));
    });
  });

  await describe('classifyError', async () => {
    await test('classifies context overflow correctly', async () => {
      const err = new Error('context length exceeded');
      assertEqual(classifyError(err), 'context_overflow');
    });

    await test('classifies ECONNREFUSED as transient', async () => {
      const err = new Error('connection refused');
      err.code = 'ECONNREFUSED';
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies ETIMEDOUT as transient', async () => {
      const err = new Error('connection timed out');
      err.code = 'ETIMEDOUT';
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies ECONNRESET as transient', async () => {
      const err = new Error('connection reset');
      err.code = 'ECONNRESET';
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies ENOTFOUND as transient', async () => {
      const err = new Error('host not found');
      err.code = 'ENOTFOUND';
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies 429 rate limit as transient', async () => {
      const err = new Error('rate limited');
      err.status = 429;
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies 5xx errors as transient', async () => {
      const err = new Error('internal server error');
      err.status = 500;
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies 503 service unavailable as transient', async () => {
      const err = new Error('service unavailable');
      err.status = 503;
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies timeout message as transient', async () => {
      const err = new Error('request timeout exceeded');
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies rate limit message as transient', async () => {
      const err = new Error('rate limit exceeded, please retry');
      assertEqual(classifyError(err), 'transient');
    });

    await test('classifies 4xx errors (not 429) as model_error', async () => {
      const err = new Error('bad request');
      err.status = 400;
      assertEqual(classifyError(err), 'model_error');
    });

    await test('classifies 404 as model_error', async () => {
      const err = new Error('not found');
      err.status = 404;
      assertEqual(classifyError(err), 'model_error');
    });

    await test('classifies unknown errors as logic_error', async () => {
      const err = new Error('something unexpected');
      assertEqual(classifyError(err), 'logic_error');
    });

    await test('returns logic_error for null', async () => {
      assertEqual(classifyError(null), 'logic_error');
    });

    await test('returns logic_error for undefined', async () => {
      assertEqual(classifyError(undefined), 'logic_error');
    });
  });
}