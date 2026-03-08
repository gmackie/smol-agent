/**
 * Unit tests for errors module
 * Tests error classification utilities
 */

import { describe, test, expect } from '@jest/globals';
import { isContextOverflowError, classifyError, formatUserError } from '../../src/errors.js';

describe('isContextOverflowError', () => {
  test('detects "context length" error', () => {
    const err = new Error('context length exceeded');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects "prompt is too long" error', () => {
    const err = new Error('prompt is too long for this model');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects "maximum context" error', () => {
    const err = new Error('maximum context window exceeded');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects "token limit" error', () => {
    const err = new Error('token limit reached');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects "sequence length" error', () => {
    const err = new Error('sequence length exceeds maximum');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects "context window" error', () => {
    const err = new Error('context window full');
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects error in nested object', () => {
    const err = { error: { message: 'context length exceeded' } };
    expect(isContextOverflowError(err)).toBe(true);
  });

  test('detects error from string', () => {
    expect(isContextOverflowError('too many tokens')).toBe(true);
  });

  test('returns false for unrelated errors', () => {
    const err = new Error('network connection failed');
    expect(isContextOverflowError(err)).toBe(false);
  });

  test('returns false for null', () => {
    expect(isContextOverflowError(null)).toBe(false);
  });

  test('returns false for undefined', () => {
    expect(isContextOverflowError(undefined)).toBe(false);
  });

  test('is case-insensitive', () => {
    const err = new Error('CONTEXT LENGTH Exceeded');
    expect(isContextOverflowError(err)).toBe(true);
  });
});

describe('classifyError', () => {
  test('classifies context overflow correctly', () => {
    const err = new Error('context length exceeded');
    expect(classifyError(err)).toBe('context_overflow');
  });

  test('classifies ECONNREFUSED as transient', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies ETIMEDOUT as transient', () => {
    const err = new Error('connection timed out');
    err.code = 'ETIMEDOUT';
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies ECONNRESET as transient', () => {
    const err = new Error('connection reset');
    err.code = 'ECONNRESET';
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies ENOTFOUND as transient', () => {
    const err = new Error('host not found');
    err.code = 'ENOTFOUND';
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies 429 rate limit as transient', () => {
    const err = new Error('rate limited');
    err.status = 429;
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies 5xx errors as transient', () => {
    const err = new Error('internal server error');
    err.status = 500;
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies 503 service unavailable as transient', () => {
    const err = new Error('service unavailable');
    err.status = 503;
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies timeout message as transient', () => {
    const err = new Error('request timeout exceeded');
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies rate limit message as transient', () => {
    const err = new Error('rate limit exceeded, please retry');
    expect(classifyError(err)).toBe('transient');
  });

  test('classifies 4xx errors (not 429) as model_error', () => {
    const err = new Error('bad request');
    err.status = 400;
    expect(classifyError(err)).toBe('model_error');
  });

  test('classifies 404 as model_error', () => {
    const err = new Error('not found');
    err.status = 404;
    expect(classifyError(err)).toBe('model_error');
  });

  test('classifies unknown errors as logic_error', () => {
    const err = new Error('something unexpected');
    expect(classifyError(err)).toBe('logic_error');
  });

  test('returns logic_error for null', () => {
    expect(classifyError(null)).toBe('logic_error');
  });

  test('returns logic_error for undefined', () => {
    expect(classifyError(undefined)).toBe('logic_error');
  });
});

describe('formatUserError', () => {
  test('formats ECONNREFUSED for ollama', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    expect(formatUserError(err, 'llama3', 'ollama')).toBe('Cannot connect to Ollama. Is it running? Try: `ollama serve`');
  });

  test('formats ECONNREFUSED for other providers', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    expect(formatUserError(err, 'gpt-4o', 'openai')).toBe('Cannot connect to Openai. Check that the server is running.');
  });

  test('formats rate limit for ollama', () => {
    const err = new Error('rate limit exceeded');
    err.status = 429;
    expect(formatUserError(err, 'llama3', 'ollama')).toBe('Rate limited by Ollama. Wait a moment and try again.');
  });

  test('formats rate limit for groq', () => {
    const err = new Error('rate limit exceeded');
    err.status = 429;
    expect(formatUserError(err, 'llama-3.1-8b', 'groq')).toBe('Rate limited by Groq. Wait a moment and try again.');
  });

  test('formats 404 for ollama with model hint', () => {
    const err = new Error('not found');
    err.status = 404;
    expect(formatUserError(err, 'llama3', 'ollama')).toBe('Model not found. Run: `ollama pull llama3`');
  });

  test('formats 404 for other providers', () => {
    const err = new Error('not found');
    err.status = 404;
    expect(formatUserError(err, 'gpt-5', 'openai')).toBe('Model not found: gpt-5. Check that the model name is correct.');
  });

  test('formats 500 errors with provider name', () => {
    const err = new Error('internal server error');
    err.status = 500;
    expect(formatUserError(err, 'claude-3', 'anthropic')).toBe('Anthropic server error (500). The server may be overloaded.');
  });

  test('defaults to ollama provider', () => {
    const err = new Error('connection refused');
    err.code = 'ECONNREFUSED';
    expect(formatUserError(err, 'llama3')).toBe('Cannot connect to Ollama. Is it running? Try: `ollama serve`');
  });

  test('returns error message for unknown errors', () => {
    const err = new Error('something weird happened');
    expect(formatUserError(err, 'llama3', 'ollama')).toBe('something weird happened');
  });

  test('handles null error', () => {
    expect(formatUserError(null)).toBe('Unknown error.');
  });
});