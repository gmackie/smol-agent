import { describe, expect, it } from "@jest/globals";

import { AgentRuntime } from "../../src/runtime/agent-runtime.js";

describe("AgentRuntime", () => {
  it("emits run.start and run.complete events", async () => {
    const events = [];
    const runtime = new AgentRuntime({
      host: {
        sessionStore: { create: async () => ({}), load: async () => null, save: async () => {} },
        memoryStore: { read: async () => "", write: async () => {} },
        messageTransport: {
          send: async () => {},
          receive: async () => null,
          listThreads: async () => [],
          updateStatus: async () => ({ ok: true }),
        },
        toolProvider: { getTools: () => [], execute: async () => ({}) },
        eventSink: { emit: (event) => events.push(event) },
      },
    });

    await runtime.emitLifecycleForTest();

    expect(events.map((event) => event.type)).toEqual(["run.start", "run.complete"]);
  });
});
