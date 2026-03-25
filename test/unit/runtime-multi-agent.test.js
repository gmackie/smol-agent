import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const registerCalls = [];

jest.unstable_mockModule("../../src/tools/registry.js", () => ({
  register: jest.fn((name, definition) => {
    registerCalls.push({ name, definition });
  }),
  getTools: jest.fn(() => []),
  execute: jest.fn(async () => ({})),
}));

jest.unstable_mockModule("../../src/logger.js", () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.unstable_mockModule("../../src/errors.js", () => ({
  isContextOverflowError: jest.fn(() => false),
}));

jest.unstable_mockModule("../../src/tool-call-parser.js", () => ({
  parseToolCallsFromContent: jest.fn(() => []),
}));

describe("multi-agent runtime", () => {
  beforeEach(() => {
    registerCalls.length = 0;
    jest.resetModules();
  });

  it("spawns an ephemeral task agent with inherited workflow context", async () => {
    const { createMultiAgentRuntime } = await import("../../src/runtime/multi-agent.js");

    const runtime = createMultiAgentRuntime({
      spawnChild: async (spec) => ({ id: "child-1", spec }),
      sendMessageImpl: async () => ({}),
      awaitResultImpl: async () => ({}),
    });

    const child = await runtime.spawnAgent({
      mode: "ephemeral",
      workflowId: 42,
      task: "inspect routing policy",
    });

    expect(child.spec.workflowId).toBe(42);
    expect(child.spec.mode).toBe("ephemeral");
  });

  it("routes the delegate tool through the configured multi-agent runtime", async () => {
    const { setMultiAgentRuntime } = await import("../../src/tools/sub_agent.js");

    const delegateDefinition = registerCalls.find(({ name }) => name === "delegate")?.definition;
    expect(delegateDefinition).toBeDefined();

    const spawnAgent = jest.fn(async () => ({ result: "delegated result" }));
    setMultiAgentRuntime({ spawnAgent });

    const result = await delegateDefinition.execute({
      task: "inspect routing policy",
      context: "workflow 42",
    });

    expect(spawnAgent).toHaveBeenCalledWith({
      task: "inspect routing policy",
      context: "workflow 42",
      cwd: process.cwd(),
      llmProvider: null,
      maxTokens: 32768,
      signal: null,
      onProgress: null,
    });
    expect(result).toEqual({ result: "delegated result" });
  });
});
