/**
 * GenTrellis host adapter — implements the host contract for GenTrellis appliance.
 *
 * Routes all host operations (tools, sessions, memory, events) through HTTP
 * to a GenTrellis API server. This enables governed agent execution where
 * GenTrellis controls tool availability, enforces protection levels, and
 * captures audit trails.
 *
 * Auth: API token via GENTRELLIS_API_KEY env var or passed directly.
 * Transport: HTTP REST to GenTrellis API endpoints.
 *
 * Key exports:
 *   - createGenTrellisHost(options): Create a governed host adapter
 *
 * Dependencies: node:http, node:https
 * Depended on by: src/index.js (via --agent-host flag)
 *
 * @module gentrellis-host
 */

import { logger } from "../logger.js";

/**
 * Make an HTTP request to the GenTrellis API.
 * @param {string} baseUrl - GenTrellis API base URL (e.g. http://localhost:8000)
 * @param {string} path - API path (e.g. /api/agents/tools)
 * @param {object} options - { method, body, token }
 * @returns {Promise<object>} Parsed JSON response
 */
async function apiCall(baseUrl, path, { method = "GET", body = null, token = null } = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const fetchOptions = { method, headers };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GenTrellis API ${method} ${path} returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return { text: await response.text() };
}

/**
 * Classify whether a tool call is safe to auto-retry.
 * Read-only tools can be retried; write/command tools cannot.
 */
const SAFE_TO_RETRY = new Set([
  "read_file", "list_files", "grep", "ask_user",
  "recall", "memory_bank_read", "get_current_plan",
  "load_plan_progress", "web_search", "web_fetch",
  "list_agents", "find_agent_for_task", "check_reply",
  "read_inbox", "read_outbox",
]);

/**
 * Create a GenTrellis host adapter.
 *
 * @param {object} options
 * @param {string} options.baseUrl - GenTrellis API base URL
 * @param {number} [options.workflowId] - Workflow ID to bind this agent to
 * @param {string} [options.protectionLevel] - Protection level (standard/protected/controlled/locked)
 * @param {string} [options.token] - API token for authentication
 * @param {number} [options.maxRetries=3] - Max retries for safe (read-only) operations
 * @returns {object} Host contract implementation
 */
export function createGenTrellisHost({
  baseUrl,
  workflowId,
  protectionLevel = "standard",
  token,
  maxRetries = 3,
} = {}) {
  if (!baseUrl) {
    throw new Error("GenTrellis host requires a baseUrl");
  }

  const runtimeContext = {
    tieredRouter: {
      baseUrl,
      workflowId,
      protectionLevel,
    },
  };

  // Collect events for trace export
  const eventLog = [];

  return {
    // Expose runtimeContext so Agent can pass it to createProvider
    runtimeContext,

    sessionStore: {
      create: async (name) => {
        try {
          return await apiCall(baseUrl, "/api/agents/sessions", {
            method: "POST",
            body: { name, workflowId },
            token,
          });
        } catch (err) {
          logger.error(`GenTrellis session create failed: ${err.message}`);
          throw err;
        }
      },

      load: async (sessionId) => {
        try {
          return await apiCall(baseUrl, `/api/agents/sessions/${sessionId}`, { token });
        } catch (err) {
          if (err.message.includes("404")) return null;
          logger.error(`GenTrellis session load failed: ${err.message}`);
          throw err;
        }
      },

      save: async (session, messages) => {
        try {
          return await apiCall(baseUrl, `/api/agents/sessions/${session.id}`, {
            method: "PUT",
            body: { ...session, messages, messageCount: messages.length },
            token,
          });
        } catch (err) {
          logger.error(`GenTrellis session save failed: ${err.message}`);
          throw err;
        }
      },
    },

    memoryStore: {
      read: async () => {
        try {
          const result = await apiCall(baseUrl, `/api/agents/workflows/${workflowId}/memory`, { token });
          return typeof result === "string" ? result : JSON.stringify(result);
        } catch (err) {
          logger.warn(`GenTrellis memory read failed: ${err.message}`);
          return "{}";
        }
      },

      write: async (data) => {
        try {
          await apiCall(baseUrl, `/api/agents/workflows/${workflowId}/memory`, {
            method: "PUT",
            body: typeof data === "string" ? JSON.parse(data) : data,
            token,
          });
        } catch (err) {
          logger.warn(`GenTrellis memory write failed: ${err.message}`);
        }
      },
    },

    messageTransport: {
      send: async (payload) => {
        try {
          return await apiCall(baseUrl, "/api/agents/messages", {
            method: "POST",
            body: payload,
            token,
          });
        } catch (err) {
          logger.error(`GenTrellis message send failed: ${err.message}`);
          throw err;
        }
      },

      listThreads: async () => {
        try {
          const result = await apiCall(baseUrl, "/api/agents/messages/threads", { token });
          return result.threads || [];
        } catch (err) {
          logger.warn(`GenTrellis listThreads failed: ${err.message}`);
          return [];
        }
      },
    },

    toolProvider: {
      getTools: (coreOnly) => {
        // For now, delegate to a cached tool list fetched at init.
        // Full implementation would call GET /api/agents/tools?workflow_id=X&protection_level=Y
        // and return only tools allowed by the workflow's protection policy.
        //
        // TODO: Fetch governed tool list from GenTrellis API
        // This requires async getTools which is a contract change.
        // For now, log a warning and fall back to local registry.
        logger.debug("GenTrellisHost: getTools falling back to local registry (async fetch not yet supported)");
        // Import dynamically to avoid circular dependency at module level
        const registry = globalThis.__smolAgentRegistry;
        if (registry) {
          return registry.getTools(coreOnly);
        }
        return [];
      },

      execute: async (name, args, context) => {
        const isSafe = SAFE_TO_RETRY.has(name);

        for (let attempt = 0; attempt <= (isSafe ? maxRetries : 0); attempt++) {
          try {
            const result = await apiCall(baseUrl, "/api/agents/tools/execute", {
              method: "POST",
              body: { name, args, context: { cwd: context?.cwd }, workflowId, protectionLevel },
              token,
            });
            return result;
          } catch (err) {
            if (attempt < (isSafe ? maxRetries : 0)) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
              logger.warn(`GenTrellis tool execute retry ${attempt + 1}/${maxRetries}: ${err.message}`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            logger.error(`GenTrellis tool execute failed after ${attempt + 1} attempts: ${err.message}`);
            return { error: `GenTrellis host error: ${err.message}` };
          }
        }
      },
    },

    eventSink: {
      emit: (event) => {
        eventLog.push(event);

        // Fire-and-forget POST to GenTrellis events API
        apiCall(baseUrl, "/api/agents/events", {
          method: "POST",
          body: event,
          token,
        }).catch((err) => {
          logger.debug(`GenTrellis event post failed (non-blocking): ${err.message}`);
        });
      },
    },

    // ── Non-contract helpers ──

    /** Get the collected event log (for trace export) */
    getEventLog: () => [...eventLog],

    /** Clear the event log */
    clearEventLog: () => { eventLog.length = 0; },
  };
}
