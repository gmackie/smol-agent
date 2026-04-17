import { describe, expect, it, jest as jestObj } from "@jest/globals";

import { AgentRuntime } from "../../src/runtime/agent-runtime.js";

function createMockHost(overrides = {}) {
  const events = [];
  return {
    host: {
      sessionStore: {
        create: jestObj.fn(async (name) => ({ id: "test-id", name, createdAt: new Date().toISOString() })),
        load: jestObj.fn(async (id) => ({ id, name: "test", messages: [], createdAt: new Date().toISOString() })),
        save: jestObj.fn(async (session, messages) => ({ ...session, updatedAt: new Date().toISOString(), messageCount: messages.length })),
        ...overrides.sessionStore,
      },
      memoryStore: {
        read: jestObj.fn(async () => JSON.stringify({ test_key: { value: "test_value", category: "general" } })),
        write: jestObj.fn(async () => {}),
        ...overrides.memoryStore,
      },
      messageTransport: {
        send: jestObj.fn(async () => ({ sent: true })),
        receive: jestObj.fn(async () => null),
        listThreads: jestObj.fn(async () => []),
        updateStatus: jestObj.fn(async () => ({ ok: true })),
        ...overrides.messageTransport,
      },
      toolProvider: {
        getTools: jestObj.fn(() => [{ type: "function", function: { name: "test_tool", description: "test", parameters: {} } }]),
        execute: jestObj.fn(async (name, args) => ({ result: "ok", name, args })),
        ...overrides.toolProvider,
      },
      eventSink: {
        emit: jestObj.fn((event) => events.push(event)),
        ...overrides.eventSink,
      },
    },
    events,
  };
}

describe("Host Contract Conformance", () => {
  it("host can deny a tool call via toolProvider.execute()", async () => {
    const { host } = createMockHost({
      toolProvider: {
        getTools: () => [],
        execute: async (name) => ({ error: `Tool "${name}" denied by host policy` }),
      },
    });

    const result = await host.toolProvider.execute("run_command", { command: "rm -rf /" });
    expect(result).toEqual({ error: 'Tool "run_command" denied by host policy' });
  });

  it("create/save/load round-trips correctly through sessionStore", async () => {
    const sessions = {};
    const { host } = createMockHost({
      sessionStore: {
        create: async (name) => {
          const session = { id: "sess-1", name, createdAt: new Date().toISOString() };
          sessions[session.id] = { ...session, messages: [] };
          return session;
        },
        load: async (id) => sessions[id] || null,
        save: async (session, messages) => {
          sessions[session.id] = { ...session, messages, messageCount: messages.length, updatedAt: new Date().toISOString() };
          return sessions[session.id];
        },
      },
    });

    const created = await host.sessionStore.create("test-session");
    const messages = [{ role: "user", content: "hello" }];
    const saved = await host.sessionStore.save(created, messages);
    const loaded = await host.sessionStore.load("sess-1");

    expect(created.id).toBe("sess-1");
    expect(saved.messageCount).toBe(1);
    expect(loaded.messages).toEqual(messages);
    expect(loaded.name).toBe("test-session");
  });

  it("emitRuntimeEvent sends events to eventSink and EventEmitter", () => {
    const { host, events } = createMockHost();
    const runtime = new AgentRuntime({ host });

    const receivedEvents = [];
    runtime.on("tool_call", (payload) => receivedEvents.push({ type: "tool_call", ...payload }));

    runtime.emitRuntimeEvent("tool_call", { name: "read_file", args: { filePath: "test.js" } });

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("tool_call");
    expect(events[0].name).toBe("read_file");
    expect(events[0].timestamp).toBeDefined();

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0].name).toBe("read_file");
  });

  it("eventSink failure does not crash the runtime", () => {
    const { host } = createMockHost({
      eventSink: {
        emit: () => { throw new Error("eventSink exploded"); },
      },
    });
    const runtime = new AgentRuntime({ host });

    expect(() => {
      runtime.emitRuntimeEvent("tool_call", { name: "test" });
    }).not.toThrow();
  });
});
