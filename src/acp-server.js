import * as acp from "@agentclientprotocol/sdk";
import { Readable, Writable } from "node:stream";
import crypto from "node:crypto";
import { Agent } from "./agent.js";
import { setAskHandler } from "./tools/ask_user.js";
import { loadSettings } from "./settings.js";
import { logger } from "./logger.js";
import * as registry from "./tools/registry.js";

// ── Tool kind mapping ───────────────────────────────────────────────

const TOOL_KIND_MAP = {
  read_file: "read",
  list_files: "read",
  grep: "search",
  write_file: "edit",
  replace_in_file: "edit",
  run_command: "execute",
  web_search: "fetch",
  web_fetch: "fetch",
  reflect: "think",
  remember: "think",
  recall: "think",
  delegate: "other",
  ask_user: "other",
  save_plan: "think",
  get_current_plan: "think",
  complete_plan_step: "think",
  load_plan_progress: "think",
  update_plan_status: "think",
};

function toolKind(name) {
  return TOOL_KIND_MAP[name] || "other";
}

// ── ACP Agent implementation ────────────────────────────────────────

class SmolACPAgent {
  constructor(connection) {
    this.connection = connection;
    this.sessions = new Map(); // sessionId → { agent, callCounter }
  }

  async initialize(params) {
    const clientInfo = params.clientInfo;
    logger.info(`[ACP] initialize — client: ${clientInfo?.name || "unknown"} ${clientInfo?.version || ""}, protocol: ${params.protocolVersion}`);
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        loadSession: false,
      },
      agentInfo: {
        name: "smol-agent",
        version: "1.0.0",
      },
    };
  }

  async newSession(params) {
    const sessionId = crypto.randomUUID();
    const cwd = params.cwd || process.cwd();

    const agent = new Agent({
      host: this._host,
      model: this._model,
      contextSize: this._contextSize,
      jailDirectory: cwd,
      coreToolsOnly: this._coreToolsOnly,
    });

    // Load persisted settings
    const settings = await loadSettings(cwd);
    if (this._autoApprove || settings.autoApprove) {
      agent._approveAll = true;
    }

    this.sessions.set(sessionId, { agent, callCounter: 0 });
    logger.info(`[ACP] session/new — id: ${sessionId}, cwd: ${cwd}, model: ${this._model || "default"}, autoApprove: ${agent._approveAll}`);
    return { sessionId };
  }

  async authenticate(_params) {
    return {};
  }

  async prompt(params) {
    const { sessionId, prompt: contentBlocks } = params;
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new acp.RequestError(-32602, `Unknown session: ${sessionId}`);
    }

    const { agent } = session;

    // Extract text from content blocks
    const text = contentBlocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const promptPreview = text.length > 100 ? text.slice(0, 100) + "…" : text;
    logger.info(`[ACP] prompt — session: ${sessionId.slice(0, 8)}…, text: "${promptPreview}"`);

    if (!text) {
      logger.info(`[ACP] prompt — empty text, returning end_turn`);
      return { stopReason: "end_turn" };
    }

    // Wire up event listeners for this prompt turn
    const cleanup = this._attachListeners(sessionId, session);
    const startTime = Date.now();

    try {
      await agent.run(text);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[ACP] prompt complete — session: ${sessionId.slice(0, 8)}…, elapsed: ${elapsed}s, stopReason: end_turn`);
      return { stopReason: "end_turn" };
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      if (
        err.name === "AbortError" ||
        err.message === "Operation cancelled"
      ) {
        logger.info(`[ACP] prompt cancelled — session: ${sessionId.slice(0, 8)}…, elapsed: ${elapsed}s`);
        return { stopReason: "cancelled" };
      }
      logger.error(`[ACP] prompt error — session: ${sessionId.slice(0, 8)}…, elapsed: ${elapsed}s, error: ${err.message}`);
      // Send final error as agent message, then end
      this.connection.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `Error: ${err.message}` },
        },
      });
      return { stopReason: "end_turn" };
    } finally {
      cleanup();
    }
  }

  async cancel(params) {
    logger.info(`[ACP] cancel — session: ${params.sessionId.slice(0, 8)}…`);
    const session = this.sessions.get(params.sessionId);
    if (session) {
      session.agent.cancel();
    }
  }

  // ── Internal helpers ──────────────────────────────────────────────

  _nextCallId(session) {
    return `call_${++session.callCounter}`;
  }

  _attachListeners(sessionId, session) {
    const { agent } = session;
    const conn = this.connection;

    // Track active tool calls so we can map tool_result back to its ID
    const pendingToolCalls = new Map(); // "name|argsHash" → callId

    const onToken = ({ content }) => {
      conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: content },
        },
      });
    };

    const onThinking = ({ content }) => {
      const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
      logger.debug(`[ACP] thinking — ${preview}`);
      conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: content },
        },
      });
    };

    const onToolCall = ({ name, args }) => {
      const callId = this._nextCallId(session);
      const key = `${name}|${JSON.stringify(args)}`;
      pendingToolCalls.set(key, callId);

      // Log full params, but redact file content to keep logs readable
      const CONTENT_KEYS = new Set(["content", "newText", "oldText"]);
      const logArgs = {};
      for (const [k, v] of Object.entries(args || {})) {
        if (CONTENT_KEYS.has(k) && typeof v === "string") {
          logArgs[k] = `<${v.length} chars>`;
        } else {
          logArgs[k] = v;
        }
      }
      logger.info(`[ACP] tool_call — ${callId}: ${name} ${JSON.stringify(logArgs)}, kind: ${toolKind(name)}`);

      const locations = [];
      if (args?.filePath) {
        locations.push({ path: args.filePath });
      }

      conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call",
          toolCallId: callId,
          title: `${name}(${Object.keys(args || {}).join(", ")})`,
          kind: toolKind(name),
          status: "in_progress",
          locations: locations.length > 0 ? locations : undefined,
          rawInput: args,
        },
      });
    };

    const onToolResult = ({ name, result }) => {
      // Find the matching pending call — check all entries for this tool name
      let callId = null;
      for (const [key, id] of pendingToolCalls) {
        if (key.startsWith(`${name}|`)) {
          callId = id;
          pendingToolCalls.delete(key);
          break;
        }
      }

      if (!callId) {
        // Tool result without a matching call — shouldn't happen, but handle gracefully
        callId = this._nextCallId(session);
      }

      const status = result?.error ? "failed" : "completed";
      const resultPreview = result?.error
        ? `error: ${result.error.slice(0, 80)}`
        : JSON.stringify(result).slice(0, 100);
      logger.info(`[ACP] tool_result — ${callId}: ${name} → ${status} (${resultPreview})`);

      conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: callId,
          status,
          rawOutput: result,
        },
      });
    };

    // Approval handler — use ACP requestPermission
    const prevApproveAll = agent._approveAll;
    if (!agent._approveAll) {
      agent.setApprovalHandler(async (name, args) => {
        const callId = this._nextCallId(session);
        const key = `${name}|${JSON.stringify(args)}`;
        pendingToolCalls.set(key, callId);

        logger.info(`[ACP] permission request — ${callId}: ${name}(${Object.keys(args || {}).join(", ")})`);

        try {
          const response = await conn.requestPermission({
            sessionId,
            toolCall: {
              toolCallId: callId,
              title: `${name}(${Object.keys(args || {}).join(", ")})`,
              kind: toolKind(name),
              status: "pending",
              rawInput: args,
              locations: args?.filePath
                ? [{ path: args.filePath }]
                : undefined,
            },
            options: [
              {
                optionId: "allow_once",
                name: "Allow",
                kind: "allow_once",
              },
              {
                optionId: "allow_always",
                name: "Allow always",
                kind: "allow_always",
              },
              {
                optionId: "reject",
                name: "Deny",
                kind: "reject_once",
              },
            ],
          });

          if (response.outcome.outcome === "cancelled") {
            logger.info(`[ACP] permission result — ${callId}: cancelled`);
            return { approved: false };
          }

          const selected = response.outcome.optionId;
          logger.info(`[ACP] permission result — ${callId}: ${selected}`);
          if (selected === "allow_always") {
            return { approved: true, approveAll: true };
          }
          return { approved: selected === "allow_once" };
        } catch (err) {
          logger.warn(`Permission request failed: ${err.message}`);
          return { approved: false };
        }
      });
    }

    // ask_user handler — complete the turn with the question as response,
    // client sends the answer as the next prompt
    const askHandler = async (question) => {
      // Send the question as an agent message so the client sees it
      conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: question },
        },
      });
      // We can't block for a response in the prompt flow, so return a placeholder
      return "(waiting for user response — please send your answer as the next prompt)";
    };
    setAskHandler(askHandler);

    // Attach listeners
    agent.on("token", onToken);
    agent.on("thinking", onThinking);
    agent.on("tool_call", onToolCall);
    agent.on("tool_result", onToolResult);

    // Return cleanup function
    return () => {
      agent.off("token", onToken);
      agent.off("thinking", onThinking);
      agent.off("tool_call", onToolCall);
      agent.off("tool_result", onToolResult);
      agent._approveAll = prevApproveAll;
      agent.setApprovalHandler(null);
    };
  }
}

// ── Start the ACP server ────────────────────────────────────────────

export function startACPServer(options = {}) {
  const output = Writable.toWeb(process.stdout);
  const input = Readable.toWeb(process.stdin);
  const stream = acp.ndJsonStream(output, input);

  const connection = new acp.AgentSideConnection((conn) => {
    const agent = new SmolACPAgent(conn);
    // Pass config through to agent creation
    agent._host = options.host;
    agent._model = options.model;
    agent._contextSize = options.contextSize;
    agent._coreToolsOnly = options.coreToolsOnly;
    agent._autoApprove = options.autoApprove;
    return agent;
  }, stream);

  // Log to file (stdout is reserved for JSON-RPC)
  logger.info(`[ACP] server started — model: ${options.model || "default"}, host: ${options.host || "default"}, coreToolsOnly: ${options.coreToolsOnly}, autoApprove: ${options.autoApprove}`);

  // Keep process alive until connection closes
  connection.closed.then(() => {
    logger.info("ACP connection closed");
    process.exit(0);
  });

  return connection;
}
