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

  it("routes reply_to_letter and read_outbox through the configured cross-agent runtime", async () => {
    const { setCrossAgentRuntime } = await import("../../src/tools/cross_agent.js");

    const replyDefinition = registerCalls.find(({ name }) => name === "reply_to_letter")?.definition;
    const outboxDefinition = registerCalls.find(({ name }) => name === "read_outbox")?.definition;
    expect(replyDefinition).toBeDefined();
    expect(outboxDefinition).toBeDefined();

    const receiveMessage = jest.fn(async ({ mailbox, letterId }) => {
      if (mailbox === "request" && letterId === "letter-9") {
        return {
          id: "letter-9",
          from: "/tmp/requester",
          title: "Need help",
          verificationSteps: [],
        };
      }
      if (mailbox === "outbox") {
        return [
          {
            id: "letter-9",
            title: "Need help",
            to: "/tmp/worker",
            priority: "medium",
            createdAt: "2026-03-25T10:00:00.000Z",
          },
        ];
      }
      if (mailbox === "reply" && letterId === "letter-9") {
        return {
          status: "completed",
          title: "Need help",
        };
      }
      return null;
    });
    const replyMessage = jest.fn(async (payload) => ({
      id: "response-9",
      responsePath: `${payload.repoPath}/.smol-agent/inbox/letter-9.response.md`,
    }));
    setCrossAgentRuntime({
      receiveMessage,
      replyMessage,
      sendMessage: jest.fn(),
      awaitResult: jest.fn(),
    });

    const replyResult = await replyDefinition.execute({
      letter_id: "letter-9",
      changes_made: "Updated workflow logic",
    }, {
      cwd: "/tmp/worker",
    });

    expect(receiveMessage).toHaveBeenCalledWith({
      repoPath: "/tmp/worker",
      mailbox: "request",
      letterId: "letter-9",
    });
    expect(replyMessage).toHaveBeenCalledWith(expect.objectContaining({
      repoPath: "/tmp/worker",
      letterId: "letter-9",
      originalLetter: expect.objectContaining({ id: "letter-9" }),
      changesMade: "Updated workflow logic",
    }));
    expect(replyResult).toEqual({
      success: true,
      response_id: "response-9",
      message: "Reply sent for letter letter-9. Response delivered to /tmp/requester.",
    });

    const outboxResult = await outboxDefinition.execute({}, {
      cwd: "/tmp/worker",
    });

    expect(receiveMessage).toHaveBeenCalledWith({
      repoPath: "/tmp/worker",
      mailbox: "outbox",
    });
    expect(receiveMessage).toHaveBeenCalledWith({
      repoPath: "/tmp/worker",
      mailbox: "reply",
      letterId: "letter-9",
    });
    expect(outboxResult).toEqual({
      count: 1,
      letters: [
        {
          id: "letter-9",
          title: "Need help",
          to: "/tmp/worker",
          priority: "medium",
          created_at: "2026-03-25T10:00:00.000Z",
          reply_received: true,
          reply_status: "completed",
        },
      ],
    });
  });
});
