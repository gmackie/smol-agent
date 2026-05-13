import { logger } from "../logger.js";
import * as registry from "../tools/registry.js";

async function apiCall(baseUrl, resourcePath, { method = "GET", body = null, token = null } = {}) {
  const url = `${baseUrl}${resourcePath}`;
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
    throw new Error(`GenTrellis API ${method} ${resourcePath} returned ${response.status}: ${text.slice(0, 200)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return { text: await response.text() };
}

const SAFE_TO_RETRY = new Set([
  "read_file",
  "list_files",
  "grep",
  "ask_user",
  "recall",
  "memory_bank_read",
  "get_current_plan",
  "load_plan_progress",
  "web_search",
  "web_fetch",
  "list_agents",
  "find_agent_for_task",
  "check_reply",
  "read_inbox",
  "read_outbox",
]);

export function createGenTrellisHost({
  baseUrl,
  workflowId,
  protectionLevel = "standard",
  token,
  maxRetries = 3,
  initialTools = [],
  approvalPollIntervalMs,
  runId,
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
    llmHeaders: {
      ...(workflowId !== undefined ? { "X-Workflow-Id": String(workflowId) } : {}),
      "X-Protection-Level": protectionLevel,
    },
  };

  const eventLog = [];
  let governedTools = Array.isArray(initialTools) ? [...initialTools] : [];

  async function refreshTools({ coreOnly } = {}) {
    const params = new URLSearchParams();
    if (workflowId !== undefined) params.set("workflowId", String(workflowId));
    if (protectionLevel) params.set("protectionLevel", protectionLevel);
    if (coreOnly !== undefined) params.set("coreOnly", String(coreOnly));

    const query = params.toString();
    const result = await apiCall(
      baseUrl,
      `/api/agents/tools${query ? `?${query}` : ""}`,
      { token },
    );

    governedTools = Array.isArray(result)
      ? result
      : Array.isArray(result?.tools)
        ? result.tools
        : [];

    return [...governedTools];
  }

  return {
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

      receive: async (payload) => {
        try {
          return await apiCall(baseUrl, "/api/agents/messages/receive", {
            method: "POST",
            body: { workflowId, ...payload },
            token,
          });
        } catch (err) {
          logger.warn(`GenTrellis receive failed: ${err.message}`);
          return payload?.mailbox === "outbox" || payload?.mailbox === "inbox" ? [] : null;
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

      updateStatus: async (payload) => {
        try {
          return await apiCall(baseUrl, "/api/agents/messages/status", {
            method: "POST",
            body: { workflowId, ...payload },
            token,
          });
        } catch (err) {
          logger.warn(`GenTrellis status update failed: ${err.message}`);
          return { ok: false, error: err.message };
        }
      },
    },

    toolProvider: {
      getTools: (coreOnly) => {
        if (governedTools.length > 0) {
          return [...governedTools];
        }
        return registry.getTools(coreOnly);
      },

      execute: async (name, args, context) => {
        const isSafe = SAFE_TO_RETRY.has(name);

        const executeLocally = () => {
          registry.setJailDirectory(context?.cwd);
          return registry.execute(name, args, context);
        };

        let response;
        for (let attempt = 0; attempt <= (isSafe ? maxRetries : 0); attempt++) {
          try {
            response = await apiCall(baseUrl, "/api/agents/tools/execute", {
              method: "POST",
              body: { name, args, context: { cwd: context?.cwd }, workflowId, protectionLevel },
              token,
            });
            break;
          } catch (err) {
            if (attempt < (isSafe ? maxRetries : 0)) {
              const delay = Math.min(1000 * 2 ** attempt, 10000);
              logger.warn(`GenTrellis tool execute retry ${attempt + 1}/${maxRetries}: ${err.message}`);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            logger.warn(`GenTrellis governance unavailable, executing locally: ${err.message}`);
            return executeLocally();
          }
        }

        if (!response) {
          return executeLocally();
        }

        // If the tool requires approval, poll until decided
        if (response.status === "pending_approval" && response.approval_id) {
          const pollInterval = approvalPollIntervalMs || 3000;
          const maxPollTime = 3600000; // 1 hour
          const start = Date.now();

          logger.info(`Tool "${name}" requires approval (id=${response.approval_id}), waiting...`);

          while (Date.now() - start < maxPollTime) {
            await new Promise((resolve) => setTimeout(resolve, pollInterval));

            try {
              const status = await apiCall(
                baseUrl,
                `/api/agents/approvals/${response.approval_id}`,
                { token },
              );

              if (status.status === "approved") {
                logger.info(`Tool "${name}" approved (id=${response.approval_id})`);
                return executeLocally();
              }

              if (status.status === "denied") {
                const reason = status.reason || "denied by operator";
                logger.info(`Tool "${name}" denied (id=${response.approval_id}): ${reason}`);
                return { error: `Tool call denied by operator: ${reason}` };
              }

              // Still pending — continue polling
            } catch (err) {
              logger.warn(`Approval poll error (will retry): ${err.message}`);
            }
          }

          return { error: "Tool approval timed out after 1 hour" };
        }

        // Governance approved — execute locally
        if (response.status === "approved") {
          return executeLocally();
        }

        return response;
      },
    },

    eventSink: {
      emit: (event) => {
        eventLog.push(event);
        if (!runId) {
          logger.debug("eventSink: no runId, skipping remote post");
          return;
        }
        apiCall(baseUrl, `/api/admin/agents/runs/${runId}/events`, {
          method: "POST",
          body: {
            type: event.type || "tool.call.started",
            event_id: event.event_id || undefined,
            sender: event.sender || "smol-agent",
            body: event.body || event,
          },
          token,
        }).catch((err) => {
          logger.debug(`GenTrellis event post failed (non-blocking): ${err.message}`);
        });
      },
    },

    getEventLog: () => [...eventLog],
    clearEventLog: () => {
      eventLog.length = 0;
    },
    refreshTools,
  };
}
