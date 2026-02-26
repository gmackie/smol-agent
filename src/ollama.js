import { Ollama } from "ollama";
import { logger, isTransientError } from "./logger.js";

const DEFAULT_MODEL = "qwen2.5-coder:7b";
const DEFAULT_MAX_TOKENS = 128000;
const MAX_RETRIES = 3;

// Rate limiting configuration
const DEFAULT_RATE_LIMIT = {
  requestsPerMinute: 30,      // Max requests per minute (Ollama's default is often 30)
  requestsPerSecond: 1,       // Max concurrent/rapid requests per second
  maxConcurrent: 1,           // Max concurrent requests (Ollama typically handles 1-2)
  rateLimitBackoffMs: 5000,   // Base backoff when hitting rate limits
};

// Token bucket for rate limiting
class TokenBucket {
  constructor(capacity, refillRate) {
    this.capacity = capacity;        // Max tokens in bucket
    this.tokens = capacity;          // Current tokens
    this.refillRate = refillRate;    // Tokens added per second
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1) {
    this.refill();
    
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    
    // Calculate wait time
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    return waitTime;
  }

  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

// Request queue for sequential processing
class RequestQueue {
  constructor(concurrency = 1) {
    this.queue = [];
    this.running = 0;
    this.concurrency = concurrency;
  }

  async add(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { fn, resolve, reject } = this.queue.shift();
    
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.running--;
      this.process();
    }
  }
}

// Rate limiter state (module-level singleton)
let rateLimiter = null;
let requestQueue = null;
let recent429Count = 0;
let last429Time = 0;

function getRateLimiter() {
  if (!rateLimiter) {
    const config = {
      requestsPerMinute: parseInt(process.env.OLLAMA_RATE_LIMIT_PER_MINUTE) || DEFAULT_RATE_LIMIT.requestsPerMinute,
      requestsPerSecond: parseInt(process.env.OLLAMA_RATE_LIMIT_PER_SECOND) || DEFAULT_RATE_LIMIT.requestsPerSecond,
      maxConcurrent: parseInt(process.env.OLLAMA_MAX_CONCURRENT) || DEFAULT_RATE_LIMIT.maxConcurrent,
    };
    
    // Create token bucket with capacity for burst requests
    rateLimiter = {
      // Bucket for per-second limiting
      secondBucket: new TokenBucket(config.requestsPerSecond * 2, config.requestsPerSecond),
      // Bucket for per-minute limiting  
      minuteBucket: new TokenBucket(config.requestsPerMinute, config.requestsPerMinute / 60),
    };
    
    requestQueue = new RequestQueue(config.maxConcurrent);
    
    logger.info('Rate limiter initialized', {
      requestsPerMinute: config.requestsPerMinute,
      requestsPerSecond: config.requestsPerSecond,
      maxConcurrent: config.maxConcurrent,
    });
  }
  return { rateLimiter, requestQueue };
}

/**
 * Check if we're in a rate limit cooldown period
 */
function isRateLimitCooldown() {
  const now = Date.now();
  const cooldownMs = 30000; // 30 second cooldown after 429 errors
  
  // If we've had multiple 429s recently, stay in cooldown
  if (recent429Count > 2 && (now - last429Time) < cooldownMs) {
    return true;
  }
  return false;
}

/**
 * Get extended backoff delay for rate limit errors
 */
function getRateLimitBackoff(attempt) {
  // Exponential backoff specifically for rate limits: 5s, 10s, 20s, 40s
  const baseDelay = DEFAULT_RATE_LIMIT.rateLimitBackoffMs * Math.pow(2, attempt - 1);
  // Add some jitter
  const jitter = Math.random() * 1000;
  return baseDelay + jitter;
}

export function createClient(host) {
  const ollama = new Ollama({ host: host || "http://127.0.0.1:11434" });
  return ollama;
}

/**
 * Estimate token count from messages
 * @param {Array} messages - Array of message objects
 * @returns {number} - Estimated token count
 */
export function estimateTokenCount(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  let totalChars = 0;
  for (const msg of messages) {
    if (msg.content) {
      totalChars += msg.content.length;
    }
    if (msg.name) {
      totalChars += msg.name.length;
    }
    if (msg.role) {
      totalChars += msg.role.length;
    }
  }

  // Add some overhead for JSON structure
  const overhead = messages.length * 50;

  return Math.ceil((totalChars + overhead) / 4); // Rough estimate: 4 chars = 1 token
}

/**
 * Get detailed token breakdown for debugging/display
 * @param {Array} messages - Array of message objects
 * @returns {Object} - Token breakdown with role details
 */
export function getTokenBreakdown(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { total: 0, byRole: {}, byMessage: [] };
  }

  const byRole = {};
  const byMessage = [];
  let totalChars = 0;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    let msgChars = 0;
    
    if (msg.content) {
      msgChars += msg.content.length;
    }
    if (msg.name) {
      msgChars += msg.name.length;
    }
    if (msg.role) {
      msgChars += msg.role.length;
    }

    const msgTokens = Math.ceil((msgChars + 50) / 4);
    totalChars += msgChars;
    
    byRole[msg.role] = (byRole[msg.role] || 0) + msgTokens;
    byMessage.push({
      index: i,
      role: msg.role,
      tokens: msgTokens,
      preview: msg.content ? msg.content.substring(0, 50).replace(/\n/g, ' ') + '...' : '',
    });
  }

  const overhead = messages.length * 50;
  const total = Math.ceil((totalChars + overhead) / 4);

  return { total, byRole, byMessage };
}

/**
 * Make a chat request with retry logic and rate limiting
 * @param {Ollama} ollama - Ollama client instance
 * @param {string} model - Model name
 * @param {Array} messages - Message history
 * @param {Array} tools - Available tools
 * @param {AbortSignal} signal - Abort signal for cancellation
 * @param {number} maxTokens - Maximum context tokens
 * @param {number} maxRetries - Maximum retry attempts
 */
export async function chatWithRetry(
  ollama,
  model,
  messages,
  tools,
  signal,
  maxTokens = DEFAULT_MAX_TOKENS,
  maxRetries = MAX_RETRIES
) {
  const { rateLimiter, requestQueue } = getRateLimiter();
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wait for rate limiter before making request
      await waitForRateLimit(rateLimiter);
      
      logger.debug(`Chat API call attempt ${attempt}/${maxRetries}`);
      
      // Use the request queue to serialize requests
      const response = await requestQueue.add(async () => {
        // Double-check rate limit before actually making the call
        await waitForRateLimit(rateLimiter);
        return chat(ollama, model, messages, tools, signal, maxTokens);
      });
      
      if (attempt > 1) {
        logger.info(`Chat API call succeeded after ${attempt} attempts`);
      }
      
      // Reset 429 tracking on success
      recent429Count = 0;
      
      return response;
    } catch (err) {
      lastError = err;
      
      // Track 429 errors
      if (err.status === 429 || err.message?.includes('rate limit')) {
        recent429Count++;
        last429Time = Date.now();
        logger.warn(`Rate limit hit (attempt ${attempt}/${maxRetries}), 429 count: ${recent429Count}`);
        
        // Use extended backoff for rate limits
        if (attempt < maxRetries) {
          const delay = getRateLimitBackoff(attempt);
          logger.warn(`Rate limit backoff: waiting ${Math.round(delay/1000)}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
      
      // Check if we should retry other transient errors
      if (attempt < maxRetries && isTransientError(err)) {
        const delay = Math.pow(2, attempt) * 100; // Exponential backoff: 200ms, 400ms, etc.
        logger.warn(
          `Chat API attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logger.error(`Chat API failed after ${attempt} attempts`, {
          error: err.message,
          status: err.status,
        });
        throw err;
      }
    }
  }
  
  logger.error(`Chat API failed after ${maxRetries} retries`, { error: lastError?.message });
  throw lastError;
}

/**
 * Wait for rate limit tokens to be available
 */
async function waitForRateLimit(buckets) {
  // Check if we're in cooldown
  if (isRateLimitCooldown()) {
    const waitTime = 30000 - (Date.now() - last429Time);
    logger.warn(`Rate limit cooldown active, waiting ${Math.round(waitTime/1000)}s...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Try to acquire from second bucket first (more restrictive)
  let waitTime = await buckets.secondBucket.acquire(1);
  if (waitTime !== true) {
    logger.debug(`Rate limit: waiting ${Math.round(waitTime)}ms for second bucket`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // Then check minute bucket
  waitTime = await buckets.minuteBucket.acquire(1);
  if (waitTime !== true) {
    logger.debug(`Rate limit: waiting ${Math.round(waitTime)}ms for minute bucket`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

/**
 * Base chat function (no retry logic)
 */
export async function chat(ollama, model, messages, tools, signal, maxTokens = DEFAULT_MAX_TOKENS) {
  // Check if we need to adjust num_ctx based on message size
  const tokenCount = estimateTokenCount(messages);
  const numCtx = Math.max(tokenCount * 1.5, 16384, maxTokens);
  
  logger.debug(`Chat context size: ${tokenCount} tokens, num_ctx: ${numCtx}`);

  const response = await ollama.chat({
    model: model || DEFAULT_MODEL,
    messages,
    tools,
    stream: false,
    options: {
      num_ctx: Math.min(numCtx, maxTokens * 2), // Cap at 2x max tokens
    },
    signal,
  });
  
  return response;
}

/**
 * Chat with automatic summarization if context is too large
 */
export async function chatWithSummarization(
  ollama,
  model,
  messages,
  tools,
  signal,
  maxTokens = DEFAULT_MAX_TOKENS
) {
  const tokenCount = estimateTokenCount(messages);
  
  if (tokenCount > maxTokens * 0.95) {
    logger.warn(`Context too large (${tokenCount} tokens), summarizing...`);
    
    // Keep system prompt and recent messages
    const recentCount = Math.max(5, Math.floor(messages.length * 0.3));
    const summarizedMessages = [messages[0], ...messages.slice(-(recentCount - 1))];
    
    logger.info(`Reduced messages from ${messages.length} to ${summarizedMessages.length}`);
    
    return chat(ollama, model, summarizedMessages, tools, signal, maxTokens);
  }
  
  return chat(ollama, model, messages, tools, signal, maxTokens);
}

/**
 * Chat with retry, summarization, and conversation pruning
 */
export async function chatAdvanced(
  ollama,
  model,
  messages,
  tools,
  signal,
  maxTokens = DEFAULT_MAX_TOKENS
) {
  // First, try to prune conversation if needed
  let processedMessages = messages;
  const tokenCount = estimateTokenCount(messages);
  
  if (tokenCount > maxTokens * 0.85) {
    logger.warn(`Conversation pruning: ${tokenCount} tokens approaching limit`);
    
    // Keep system prompt and recent messages
    const recentCount = Math.max(5, Math.floor(messages.length * 0.3));
    processedMessages = [messages[0], ...messages.slice(-(recentCount - 1))];
  }
  
  // Then use chat with retry
  return chatWithRetry(ollama, model, processedMessages, tools, signal, maxTokens);
}

export { DEFAULT_MODEL };
