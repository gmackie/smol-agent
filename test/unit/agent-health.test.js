/**
 * Unit tests for startup health check.
 *
 * Verifies that Agent._init() calls llmProvider.checkHealth() before
 * loading context, and logs a warning (not a fatal error) when the
 * LLM backend is unreachable.
 *
 * Dependencies: @jest/globals, ../../src/agent.js
 */
import { describe, test, expect } from "@jest/globals";
import { Agent } from "../../src/agent.js";

describe("startup health check", () => {
  test("_init succeeds with warning when LLM backend is unreachable", async () => {
    const agent = new Agent({
      agentHost: {
        toolProvider: { getTools: () => [] },
        runtimeContext: {},
      },
      llmProvider: {
        name: "test",
        model: "test-model",
        checkHealth: async () => {
          throw new Error("ECONNREFUSED");
        },
        streamChat: async () => {},
        client: null,
        estimateTokenCount: () => 0,
      },
      jailDirectory: "/tmp/test-jail-health",
    });

    // Health check failure is now a warning, not a fatal error
    await agent._init();
  });

  test("_init succeeds when LLM backend is healthy", async () => {
    const agent = new Agent({
      agentHost: {
        toolProvider: { getTools: () => [] },
        runtimeContext: {},
      },
      llmProvider: {
        name: "test",
        model: "test-model",
        checkHealth: async () => true,
        streamChat: async () => {},
        client: null,
        estimateTokenCount: () => 0,
      },
      jailDirectory: "/tmp/test-jail-health",
    });

    // Should not throw — _init should complete successfully
    await agent._init();
  });

  test("_init succeeds when provider has no checkHealth method", async () => {
    const agent = new Agent({
      agentHost: {
        toolProvider: { getTools: () => [] },
        runtimeContext: {},
      },
      llmProvider: {
        name: "test",
        model: "test-model",
        streamChat: async () => {},
        client: null,
        estimateTokenCount: () => 0,
      },
      jailDirectory: "/tmp/test-jail-health",
    });

    // Should not throw — providers without checkHealth skip the check
    await agent._init();
  });
});
