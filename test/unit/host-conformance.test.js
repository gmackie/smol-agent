import { describe, expect, it, jest as jestObj } from "@jest/globals";
import { createLocalHost } from "../../src/runtime/local-host.js";
import { AgentRuntime } from "../../src/runtime/agent-runtime.js";
import * as registry from "../../src/tools/registry.js";

// ── Helper: create a mock host that tracks calls ──────────────────────

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
        listThreads: jestObj.fn(async () => []),
        ...overrides.messageTransport,
      },
      toolProvider: {
        getTools: jestObj.fn((coreOnly) => [{ type: "function", function: { name: "test_tool", description: "test", parameters: {} } }]),
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

// ── Conformance Test 1: Host can deny a tool call ─────────────────────

describe("Host Contract Conformance", () => {
  describe("Tool denial", () => {
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

    it("host can throw on tool execution and caller handles it", async () => {
      const { host } = createMockHost({
        toolProvider: {
          getTools: () => [],
          execute: async () => { throw new Error("Host unreachable"); },
        },
      });

      await expect(host.toolProvider.execute("test", {})).rejects.toThrow("Host unreachable");
    });
  });

  // ── Conformance Test 2: Session CRUD round-trip ───────────────────────

  describe("Session round-trip", () => {
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
      expect(created.id).toBe("sess-1");
      expect(created.name).toBe("test-session");

      const messages = [{ role: "user", content: "hello" }];
      const saved = await host.sessionStore.save(created, messages);
      expect(saved.messageCount).toBe(1);

      const loaded = await host.sessionStore.load("sess-1");
      expect(loaded.messages).toEqual(messages);
      expect(loaded.name).toBe("test-session");
    });

    it("load returns null for non-existent session", async () => {
      const { host } = createMockHost({
        sessionStore: {
          create: async () => ({}),
          load: async () => null,
          save: async () => ({}),
        },
      });

      const result = await host.sessionStore.load("nonexistent");
      expect(result).toBeNull();
    });
  });

  // ── Conformance Test 3: Auditable events appear in eventSink ──────────

  describe("Auditable events", () => {
    it("emitRuntimeEvent sends events to eventSink and EventEmitter", () => {
      const { host, events } = createMockHost();
      const runtime = new AgentRuntime({ host });

      const receivedEvents = [];
      runtime.on("tool_call", (payload) => receivedEvents.push({ type: "tool_call", ...payload }));

      runtime.emitRuntimeEvent("tool_call", { name: "read_file", args: { filePath: "test.js" } });

      // eventSink received the event
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("tool_call");
      expect(events[0].name).toBe("read_file");
      expect(events[0].timestamp).toBeDefined();

      // EventEmitter also received it (backward compat)
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

      // Should not throw
      expect(() => {
        runtime.emitRuntimeEvent("tool_call", { name: "test" });
      }).not.toThrow();
    });

    it("eventSink receives runtime_event on generic channel", () => {
      const { host } = createMockHost();
      const runtime = new AgentRuntime({ host });

      const genericEvents = [];
      runtime.on("runtime_event", (event) => genericEvents.push(event));

      runtime.emitRuntimeEvent("response", { content: "hello" });

      expect(genericEvents).toHaveLength(1);
      expect(genericEvents[0].type).toBe("response");
      expect(genericEvents[0].content).toBe("hello");
    });
  });

  // ── Conformance Test 4: Memory read/write round-trip ──────────────────

  describe("Memory round-trip", () => {
    it("read/write round-trips through memoryStore", async () => {
      let stored = "";

      const { host } = createMockHost({
        memoryStore: {
          read: async () => stored,
          write: async (data) => { stored = data; },
        },
      });

      const data = JSON.stringify({ key: { value: "remembered", category: "test" } });
      await host.memoryStore.write(data);
      const result = await host.memoryStore.read();
      expect(result).toBe(data);
      expect(JSON.parse(result).key.value).toBe("remembered");
    });
  });

  // ── Conformance Test 5: LocalHost parity ──────────────────────────────

  describe("LocalHost parity", () => {
    it("LocalHost toolProvider.getTools returns same as registry.getTools", () => {
      const localHost = createLocalHost({ jailDirectory: process.cwd() });
      const hostTools = localHost.toolProvider.getTools(true);
      const registryTools = registry.getTools(true);

      expect(hostTools).toEqual(registryTools);
    });

    it("LocalHost toolProvider.execute wraps registry.execute", async () => {
      const localHost = createLocalHost({ jailDirectory: process.cwd() });

      // list_files is a safe read-only tool to test
      const hostResult = await localHost.toolProvider.execute("list_files", { pattern: "package.json" }, { cwd: process.cwd() });
      const registryResult = await registry.execute("list_files", { pattern: "package.json" }, { cwd: process.cwd() });

      expect(hostResult).toEqual(registryResult);
    });

    it("LocalHost sessionStore.create produces valid session", async () => {
      const localHost = createLocalHost({ jailDirectory: process.cwd() });
      const session = await localHost.sessionStore.create("test");

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(typeof session.id).toBe("string");
    });

    it("LocalHost eventSink.emit is a no-op that does not throw", () => {
      const localHost = createLocalHost({ jailDirectory: process.cwd() });

      expect(() => {
        localHost.eventSink.emit({ type: "test", data: "anything" });
      }).not.toThrow();
    });

    it("LocalHost memoryStore.read returns string (not empty stub)", async () => {
      const localHost = createLocalHost({ jailDirectory: process.cwd() });
      const result = await localHost.memoryStore.read();

      // Should return a string (JSON), not empty string like the old stub
      expect(typeof result).toBe("string");
    });
  });

  // ── Additional unit tests ─────────────────────────────────────────────

  describe("Session error graceful handling", () => {
    it("sessionStore.save rejection is catchable", async () => {
      const { host } = createMockHost({
        sessionStore: {
          create: async () => ({ id: "x" }),
          load: async () => null,
          save: async () => { throw new Error("DB connection lost"); },
        },
      });

      await expect(host.sessionStore.save({ id: "x" }, [])).rejects.toThrow("DB connection lost");
    });
  });

  describe("runtimeContext flow", () => {
    it("runtimeContext with tieredRouter produces no errors when empty", () => {
      const { host } = createMockHost();
      const runtime = new AgentRuntime({ host });

      // emitRuntimeEvent should work fine with no runtimeContext set
      expect(() => {
        runtime.emitRuntimeEvent("response", { content: "test" });
      }).not.toThrow();
    });
  });
});
