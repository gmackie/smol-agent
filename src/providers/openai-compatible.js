/**
 * OpenAI-compatible LLM provider.
 *
 * Works with any OpenAI-compatible API:
 *   - OpenAI (ChatGPT): https://api.openai.com/v1
 *   - Grok (xAI):       https://api.x.ai/v1
 *   - Groq:             https://api.groq.com/openai/v1
 *   - Gemini (Google):  https://generativelanguage.googleapis.com/v1beta/openai
 *   - Together AI:      https://api.together.xyz/v1
 *   - OpenRouter:       https://openrouter.ai/api/v1
 *   - Local (vLLM, LM Studio, etc.)
 *
 * Uses the standard OpenAI chat completions API with tool calling support.
 * No SDK dependency — uses native fetch for maximum compatibility.
 *
 * Key exports:
 *   - OpenAICompatibleProvider class: Main provider implementation
 *   - Methods: chatStream(), chatWithRetry(), listModels(), formatTools()
 *
 * Dependencies: ./base.js, ./errors.js, ../constants.js
 * Depended on by: src/providers/index.js, test/unit/providers.test.js,
 *                  test/unit/vision-support.test.js
 */

import { BaseLLMProvider, MAX_RETRIES } from "./base.js";
import { formatAPIError } from "./errors.js";
import { DEFAULT_MAX_TOKENS } from "../constants.js";

export class OpenAICompatibleProvider extends BaseLLMProvider {
  /**
   * @param {object} options
   * @param {string} options.apiKey     - API key (or set via env)
   * @param {string} options.baseURL    - API base URL
   * @param {string} options.model      - Model name (e.g. "gpt-4o", "grok-3")
   * @param {string} [options.providerName] - Display name for this provider
   * @param {object} [options.rateLimitConfig]
   */
  constructor({ apiKey, baseURL, model, providerName, rateLimitConfig } = {}) {
    super({
      model,
      rateLimitConfig: rateLimitConfig || {
        requestsPerMinute: 60,
        requestsPerSecond: 5,
        maxConcurrent: 1,
        rateLimitBackoffMs: 5000,
      },
    });

    this.apiKey = apiKey;
    this.baseURL = (baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");

    // Special handling for Gemini's OpenAI-compatible endpoint
    if (this._providerName === "gemini") {
      this.baseURL = (baseURL || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/+$/, "");
    }
    this._providerName = providerName || "openai";

    // Warn if API key is missing for providers that require it
    if (!this.apiKey && this._providerName !== "ollama") {
      const envVar = this._envVar();
      console.error(`⚠️  No ${envVar} found. Set it via:`);
      console.error(`   export ${envVar}=your-key-here`);
      console.error(`   or use --api-key option`);
    }
  }

  get name() {
    return this._providerName;
  }

  /**
   * Get the environment variable name for this provider's API key.
   */
  _envVar() {
    switch (this._providerName) {
      case "openai":
        return "OPENAI_API_KEY";
      case "anthropic":
        return "ANTHROPIC_API_KEY";
      case "grok":
        return "XAI_API_KEY";
      case "groq":
        return "GROQ_API_KEY";
      case "gemini":
        return "GEMINI_API_KEY";
      default:
        return `${this._providerName.toUpperCase()}_API_KEY`;
    }
  }

  _headers() {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  /**
   * Convert tool calls from the OpenAI response format to our normalized format.
   */
  _normalizeToolCalls(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) return [];
    return toolCalls.map(tc => {
      let args = tc.function.arguments;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch (e) {
          console.warn(
            `[${this._providerName}] Failed to parse tool call arguments as JSON:`,
            e && e.message ? e.message : e,
            "Raw arguments:", tc.function.arguments
          );
          args = {};
        }
      }
      return {
        id: tc.id,
        function: {
          name: tc.function.name,
          arguments: args,
        },
      };
    });
  }

  /**
   * Adapt internal agent messages to OpenAI-compatible format.
   *
   * Assigns stable IDs to tool calls in assistant messages and adds the
   * matching `tool_call_id` to subsequent tool result messages so cloud
   * providers don't reject the request.
   *
   * @param {Array<object>} messages
   * @returns {Array<object>}
   */
  _adaptMessagesForOpenAI(messages) {
    if (!Array.isArray(messages)) return messages;

    const adapted = [];
    // Ordered list of tool call IDs from the most recent assistant message
    let pendingIds = [];
    // Map from tool name → queue of IDs (for name-based correlation)
    let pendingByName = {};

    for (const msg of messages) {
      if (msg && msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        pendingIds = [];
        pendingByName = {};
        const adaptedToolCalls = msg.tool_calls.map((tc, i) => {
          const id = tc.id || `call_${Date.now()}_${i}`;
          pendingIds.push(id);
          const fnName = tc.function && tc.function.name;
          if (fnName) {
            if (!pendingByName[fnName]) pendingByName[fnName] = [];
            pendingByName[fnName].push(id);
          }
          // OpenAI-compatible APIs require arguments as a JSON string
          let args = tc.function && tc.function.arguments;
          if (typeof args !== "string") {
            args = JSON.stringify(args || {});
          }
          return {
            id,
            type: "function",
            function: {
              name: tc.function.name,
              arguments: args,
            },
          };
        });
        adapted.push({ ...msg, tool_calls: adaptedToolCalls });
        continue;
      }

      if (msg && msg.role === "tool" && !msg.tool_call_id) {
        const toolName = msg.name;
        let chosenId;

        if (toolName && pendingByName[toolName] && pendingByName[toolName].length > 0) {
          chosenId = pendingByName[toolName].shift();
          // Also remove from ordered queue
          const idx = pendingIds.indexOf(chosenId);
          if (idx !== -1) pendingIds.splice(idx, 1);
        } else if (pendingIds.length > 0) {
          chosenId = pendingIds.shift();
        }

        if (chosenId) {
          adapted.push({ ...msg, tool_call_id: chosenId });
          continue;
        }
      }

      adapted.push(msg);
    }

    return adapted;
  }

  async *chatStream(messages, tools, signal, _maxTokens = DEFAULT_MAX_TOKENS, onRetry) {
    const adaptedMessages = this._adaptMessagesForOpenAI(messages);
    const body = {
      model: this._model,
      messages: adaptedMessages,
      stream: true,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const response = await this._withRetry(async () => {
      const resp = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal,
      });
      if (!resp.ok) {
        let errorBody = "";
        try { errorBody = await resp.text(); } catch { /* ignore */ }
        const { message, actionable } = formatAPIError(resp.status, errorBody, this._providerName, this._envVar());
        const err = new Error(actionable ? `${message}\n  → ${actionable}` : message);
        err.status = resp.status;
        err.body = errorBody;
        throw err;
      }
      return resp;
    }, MAX_RETRIES, onRetry);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolCallsById = new Map();
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          let data;
          try { data = JSON.parse(trimmed.slice(6)); } catch { continue; }

          const choice = data.choices?.[0];
          if (!choice) continue;

          const delta = choice.delta;
          if (delta?.content) {
            yield { type: "token", content: delta.content };
          }

          // Accumulate streamed tool calls
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallsById.has(idx)) {
                toolCallsById.set(idx, { id: tc.id || null, function: { name: "", arguments: "" } });
              }
              const existing = toolCallsById.get(idx);
              if (tc.id && !existing.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
            }
          }

          // Capture usage from the final chunk
          if (data.usage) {
            promptTokens = data.usage.prompt_tokens || 0;
            completionTokens = data.usage.completion_tokens || 0;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Parse accumulated tool call arguments — always produce an object
    const toolCalls = [...toolCallsById.values()].map(tc => {
      const rawArgs = tc.function.arguments;
      let args = {};
      if (rawArgs && typeof rawArgs === "string") {
        try {
          const parsed = JSON.parse(rawArgs);
          if (parsed && typeof parsed === "object") {
            args = parsed;
          }
        } catch {
          // Malformed JSON from provider — fall back to empty object
        }
      } else if (rawArgs && typeof rawArgs === "object") {
        args = rawArgs;
      }
      return { id: tc.id || undefined, function: { name: tc.function.name, arguments: args } };
    });

    yield {
      type: "done",
      toolCalls,
      tokenUsage: { promptTokens, completionTokens },
    };
  }

  async chatWithRetry(messages, tools, signal, _maxTokens = DEFAULT_MAX_TOKENS, onRetry) {
    const adaptedMessages = this._adaptMessagesForOpenAI(messages);
    const body = {
      model: this._model,
      messages: adaptedMessages,
      stream: false,
    };
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const data = await this._withRetry(async () => {
      const resp = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: this._headers(),
        body: JSON.stringify(body),
        signal,
      });
      if (!resp.ok) {
        let errorBody = "";
        try { errorBody = await resp.text(); } catch { /* ignore */ }
        const { message, actionable } = formatAPIError(resp.status, errorBody, this._providerName, this._envVar());
        const err = new Error(actionable ? `${message}\n  → ${actionable}` : message);
        err.status = resp.status;
        err.body = errorBody;
        throw err;
      }
      return resp.json();
    }, MAX_RETRIES, onRetry);

    const choice = data.choices?.[0];
    return {
      message: {
        content: choice?.message?.content || "",
        tool_calls: this._normalizeToolCalls(choice?.message?.tool_calls),
      },
    };
  }

  async listModels() {
    try {
      const resp = await fetch(`${this.baseURL}/models`, {
        headers: this._headers(),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.data || []).map(m => m.id);
    } catch {
      return [];
    }
  }

  /**
   * Check if this model supports vision (image inputs).
   * Vision-capable models for OpenAI-compatible providers include:
   *   - OpenAI: gpt-4o, gpt-4-turbo, gpt-4-vision, gpt-4.1, o1
   *   - Grok: all grok models support vision
   *   - Gemini: all gemini models support vision
   */
  supportsVision() {
    const model = this._model.toLowerCase();
    // Gemini models all support vision
    if (this._providerName === 'gemini' || model.includes('gemini')) {
      return true;
    }
    // Grok models all support vision
    if (this._providerName === 'grok' || model.includes('grok')) {
      return true;
    }
    // OpenAI vision models
    if (model.includes('gpt-4o') || model.includes('gpt-4-turbo') || 
        model.includes('gpt-4-vision') || model.includes('gpt-4.1') ||
        model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4')) {
      return true;
    }
    // Claude models via OpenAI-compatible endpoints support vision
    if (model.includes('claude')) {
      return true;
    }
    return false;
  }
}
