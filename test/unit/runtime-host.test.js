import { describe, expect, it } from "@jest/globals";

import { validateAgentHost } from "../../src/runtime/contracts.js";

describe("validateAgentHost", () => {
  it("accepts a host with required contracts", () => {
    const host = {
      sessionStore: { create: async () => {}, load: async () => {}, save: async () => {} },
      memoryStore: { read: async () => "", write: async () => {} },
      messageTransport: { send: async () => {}, listThreads: async () => [] },
      toolProvider: { getTools: () => [], execute: async () => ({ ok: true }) },
      eventSink: { emit: () => {} },
    };

    expect(() => validateAgentHost(host)).not.toThrow();
  });

  it("rejects a host missing message transport", () => {
    const host = {
      sessionStore: { create: async () => {}, load: async () => {}, save: async () => {} },
      memoryStore: { read: async () => "", write: async () => {} },
      toolProvider: { getTools: () => [], execute: async () => ({ ok: true }) },
      eventSink: { emit: () => {} },
    };

    expect(() => validateAgentHost(host)).toThrow(/messageTransport/i);
  });

  it("rejects a host with malformed interface shapes", () => {
    const host = {
      sessionStore: { create: async () => {}, load: async () => {}, save: async () => {} },
      memoryStore: { read: async () => "", write: async () => {} },
      messageTransport: {},
      toolProvider: { getTools: "not-a-function", execute: async () => ({ ok: true }) },
      eventSink: { emit: () => {} },
    };

    expect(() => validateAgentHost(host)).toThrow(/messageTransport|toolProvider/i);
  });
});
