/**
 * Unit tests for pending injection behavior during the tool loop.
 *
 * Verifies that user messages (injections) sent while the agent is running
 * are picked up at multiple points during execution:
 *   1. Before tool execution starts (skips all pending tool calls)
 *   2. Between sequential tool calls (skips remaining tool calls)
 *   3. After tool execution completes (flushed immediately)
 */

import { describe, test, expect, jest } from "@jest/globals";
import { Agent } from "../../src/agent.js";

/**
 * Create a mock LLM provider that yields scripted responses.
 * Each call to chatStream() shifts the next response from the queue.
 */
function createMockProvider(responses) {
  const queue = [...responses];
  return {
    _model: "mock-model",
    get name() { return "mock"; },
    get model() { return this._model; },
    set model(v) { this._model = v; },
    formatTools(tools) { return tools; },
    client: null,
    async *chatStream() {
      const response = queue.shift();
      if (!response) {
        yield { type: "token", content: "(no more responses)" };
        yield { type: "done", toolCalls: [], tokenUsage: { promptTokens: 10, completionTokens: 5 } };
        return;
      }
      if (response.content) {
        yield { type: "token", content: response.content };
      }
      yield {
        type: "done",
        toolCalls: response.toolCalls || [],
        tokenUsage: { promptTokens: 10, completionTokens: 5 },
      };
    },
  };
}

/**
 * Create a test agent with a mock provider. Disables features that
 * require filesystem or complex initialization.
 */
function createTestAgent(mockProvider) {
  const agent = new Agent({ llmProvider: mockProvider });
  agent._approveAll = true;
  // Skip initialization steps that need filesystem
  agent._initialized = true;
  agent.messages = [{ role: "system", content: "Test system prompt" }];
  return agent;
}

// ── _flushPendingInjections() ─────────────────────────────────────────

describe("_flushPendingInjections", () => {
  test("returns 0 when no pending injections", () => {
    const agent = createTestAgent(createMockProvider([]));
    expect(agent._flushPendingInjections()).toBe(0);
    expect(agent.messages).toHaveLength(1); // only system prompt
  });

  test("flushes all pending injections into messages", () => {
    const agent = createTestAgent(createMockProvider([]));
    agent._pendingInjections = ["message 1", "message 2", "message 3"];

    const count = agent._flushPendingInjections();

    expect(count).toBe(3);
    expect(agent._pendingInjections).toHaveLength(0);
    expect(agent.messages).toHaveLength(4); // system + 3 injections
    expect(agent.messages[1]).toEqual({ role: "user", content: "message 1" });
    expect(agent.messages[2]).toEqual({ role: "user", content: "message 2" });
    expect(agent.messages[3]).toEqual({ role: "user", content: "message 3" });
  });

  test("emits injection event for each flushed message", () => {
    const agent = createTestAgent(createMockProvider([]));
    const injections = [];
    agent.on("injection", (e) => injections.push(e.content));

    agent._pendingInjections = ["nudge A", "nudge B"];
    agent._flushPendingInjections();

    expect(injections).toEqual(["nudge A", "nudge B"]);
  });

  test("is idempotent — second call returns 0", () => {
    const agent = createTestAgent(createMockProvider([]));
    agent._pendingInjections = ["only once"];

    expect(agent._flushPendingInjections()).toBe(1);
    expect(agent._flushPendingInjections()).toBe(0);
    expect(agent.messages).toHaveLength(2); // system + 1 injection
  });
});

// ── inject() ──────────────────────────────────────────────────────────

describe("inject", () => {
  test("queues message when agent is running", () => {
    const agent = createTestAgent(createMockProvider([]));
    agent.running = true;

    agent.inject("redirect message");

    expect(agent._pendingInjections).toEqual(["redirect message"]);
  });

  test("ignores message when agent is not running", () => {
    const agent = createTestAgent(createMockProvider([]));
    agent.running = false;

    agent.inject("should be ignored");

    expect(agent._pendingInjections).toHaveLength(0);
  });
});

// ── Pre-tool-execution injection check ────────────────────────────────

describe("pre-tool-execution injection check", () => {
  test("skips all tool calls when injection arrives during streaming", async () => {
    // Set up: LLM responds with 2 tool calls, then a final response
    const mockProvider = createMockProvider([
      {
        content: "I'll read both files",
        toolCalls: [
          { function: { name: "read_file", arguments: { filePath: "a.js" } } },
          { function: { name: "read_file", arguments: { filePath: "b.js" } } },
        ],
      },
      {
        content: "OK, I see the user wants something different.",
        toolCalls: [],
      },
    ]);

    const agent = createTestAgent(mockProvider);
    const events = [];
    agent.on("tool_call", (e) => events.push({ type: "tool_call", name: e.name }));
    agent.on("tool_result", (e) => events.push({ type: "tool_result", name: e.name, result: e.result }));
    agent.on("injection", (e) => events.push({ type: "injection", content: e.content }));

    // Inject a message before run starts — it will be pending when
    // the first iteration finishes streaming and reaches tool execution.
    // We do this by injecting right after the agent starts running.
    const originalChatStream = mockProvider.chatStream;
    mockProvider.chatStream = async function* (...args) {
      // Simulate user sending a message during streaming
      agent._pendingInjections.push("Actually, search for the function first");
      yield* originalChatStream.call(this, ...args);
    };

    const result = await agent.run("Read a.js and b.js");

    // Both tool calls should have been skipped
    const toolResults = events.filter(e => e.type === "tool_result");
    expect(toolResults).toHaveLength(2);
    expect(toolResults[0].result).toEqual({ skipped: true, reason: "User sent a new message" });
    expect(toolResults[1].result).toEqual({ skipped: true, reason: "User sent a new message" });

    // The injection should have been flushed
    const injections = events.filter(e => e.type === "injection");
    expect(injections).toHaveLength(1);
    expect(injections[0].content).toBe("Actually, search for the function first");

    // The conversation should contain the skipped tool results and the injection
    const toolMsgs = agent.messages.filter(m => m.role === "tool");
    expect(toolMsgs).toHaveLength(2);
    expect(JSON.parse(toolMsgs[0].content)).toEqual({ skipped: true, reason: "User sent a new message" });

    const userMsgs = agent.messages.filter(m => m.role === "user");
    expect(userMsgs.some(m => m.content === "Actually, search for the function first")).toBe(true);
  });
});

// ── Post-tool-execution injection flush ───────────────────────────────

describe("post-tool-execution injection flush", () => {
  test("flushes injections that arrive during tool execution", async () => {
    let toolCallCount = 0;
    const mockProvider = createMockProvider([
      {
        content: "Reading file",
        toolCalls: [
          { function: { name: "read_file", arguments: { filePath: "test.js" } } },
        ],
      },
      {
        content: "Got the user's new message, changing direction.",
        toolCalls: [],
      },
    ]);

    const agent = createTestAgent(mockProvider);
    const injections = [];
    agent.on("injection", (e) => injections.push(e.content));

    // Intercept tool execution to inject a message mid-execution
    const origRun = agent.run.bind(agent);
    // We'll monkey-patch the tool registry to inject during execution
    const originalEmit = agent.emit.bind(agent);
    agent.emit = function (event, ...args) {
      if (event === "tool_call") {
        toolCallCount++;
        // Simulate user sending a message while tool is executing
        agent._pendingInjections.push("Change direction please");
      }
      return originalEmit(event, ...args);
    };

    await agent.run("Read test.js");

    // The injection should have been flushed (either by post-execution
    // flush or by the top-of-loop flush on the next iteration)
    expect(injections).toContain("Change direction please");

    // Verify the injection appears in the message history
    const userMsgs = agent.messages.filter(m => m.role === "user");
    expect(userMsgs.some(m => m.content === "Change direction please")).toBe(true);
  });
});
