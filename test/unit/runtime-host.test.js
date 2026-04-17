import { describe, expect, it } from "@jest/globals";

import { createLocalHost } from "../../src/runtime/local-host.js";
import * as registry from "../../src/tools/registry.js";

describe("LocalHost parity", () => {
  it("toolProvider.getTools returns same as registry.getTools", () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });
    const hostTools = localHost.toolProvider.getTools(true);
    const registryTools = registry.getTools(true);

    expect(hostTools).toEqual(registryTools);
  });

  it("toolProvider.execute wraps registry.execute", async () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });

    const hostResult = await localHost.toolProvider.execute("list_files", { pattern: "package.json" }, { cwd: process.cwd() });
    const registryResult = await registry.execute("list_files", { pattern: "package.json" }, { cwd: process.cwd() });

    expect(hostResult).toEqual(registryResult);
  });

  it("sessionStore.create produces valid session with runtime context", async () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });
    const session = await localHost.sessionStore.create("test", {
      tieredRouter: { workflowId: 7, protectionLevel: "protected" },
    });

    expect(session).toBeDefined();
    expect(typeof session.id).toBe("string");
    expect(session.runtimeContext.tieredRouter.workflowId).toBe(7);
  });

  it("eventSink.emit is a no-op that does not throw", () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });

    expect(() => {
      localHost.eventSink.emit({ type: "test", data: "anything" });
    }).not.toThrow();
  });

  it("memoryStore.read returns a string", async () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });
    const result = await localHost.memoryStore.read();

    expect(typeof result).toBe("string");
  });
});
