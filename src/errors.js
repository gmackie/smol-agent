/**
 * Shared error classification utilities.
 *
 * Centralises the context-overflow detection that was duplicated in
 * ollama.js and context-manager.js, and adds a general classifier
 * used by retry logic.
 */

const OVERFLOW_PATTERNS = [
  'context length',
  'prompt is too long',
  'maximum context',
  'token limit',
  'sequence length',
  'too many tokens',
  'context window',
  'exceeds maximum',
  'requested tokens',
  'input too long',
];

/**
 * Returns true when the error indicates the LLM's context window has
 * been exceeded.  Works with both Error objects and plain strings.
 */
export function isContextOverflowError(err) {
  if (!err) return false;
  const raw = err.message || (typeof err.error === 'string' ? err.error : err.error?.message) || String(err);
  const msg = raw.toLowerCase();
  return OVERFLOW_PATTERNS.some(p => msg.includes(p));
}

/**
 * Classify an error for retry / backoff decisions.
 *
 * @param {Error} err
 * @returns {'transient' | 'context_overflow' | 'model_error' | 'logic_error'}
 */
export function classifyError(err) {
  if (!err) return 'logic_error';

  if (isContextOverflowError(err)) return 'context_overflow';

  // Network / rate-limit — safe to retry
  if (
    err.code === 'ECONNREFUSED' ||
    err.code === 'ETIMEDOUT' ||
    err.code === 'ECONNRESET' ||
    err.code === 'ENOTFOUND' ||
    err.code === 'EAI_AGAIN' ||
    err.status === 429 ||
    (err.status >= 500 && err.status < 600) ||
    err.message?.includes('timeout') ||
    err.message?.includes('deadline') ||
    err.message?.includes('rate limit')
  ) {
    return 'transient';
  }

  // 4xx (not 429) from the API — usually bad request / model issue
  if (err.status >= 400 && err.status < 500) return 'model_error';

  return 'logic_error';
}

/**
 * Map an error to a short, actionable message for the user.
 *
 * @param {Error} err
 * @param {string} [model] — model name, used in the 404 hint
 * @returns {string}
 */
export function formatUserError(err, model) {
  if (!err) return 'Unknown error.';

  if (err.code === 'ECONNREFUSED') {
    return 'Cannot connect to Ollama. Is it running? Try: `ollama serve`';
  }
  if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return 'Cannot resolve Ollama host. Check OLLAMA_HOST.';
  }
  if (err.status === 429 || err.message?.includes('rate limit')) {
    return 'Rate limited by Ollama.';
  }
  if (err.status === 404) {
    const m = model || '<model>';
    return `Model not found. Run: \`ollama pull ${m}\``;
  }
  if (err.status >= 500 && err.status < 600) {
    return `Ollama server error (${err.status}). The server may be overloaded.`;
  }
  if (err.code === 'ETIMEDOUT' || err.message?.includes('timeout') || err.message?.includes('deadline')) {
    return 'Request timed out. The model may be loading.';
  }
  if (err.code === 'ECONNRESET') {
    return 'Connection reset by Ollama. The server may have restarted.';
  }
  if (isContextOverflowError(err)) {
    return 'Context limit exceeded — conversation is too long.';
  }

  return err.message || String(err);
}
