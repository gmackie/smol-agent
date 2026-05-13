import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { createGenTrellisHost } from "../../src/runtime/gentrellis-host.js";

function makeTool(name, description = `${name} description`) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: {} },
    },
  };
}

describe("GenTrellisHost eventSink", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("posts events to run-specific endpoint with correct payload", async () => {
    const fetchCalls = [];
    global.fetch = jest.fn(async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ status: "accepted" }),
      };
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8080",
      runId: 42,
      token: "test-token",
    });

    host.eventSink.emit({
      type: "tool.call.started",
      body: { name: "write_file", args: { filePath: "test.txt" } },
    });

    // Give the fire-and-forget promise a tick to resolve
    await new Promise((r) => setTimeout(r, 50));

    const call = fetchCalls.find((c) => c.url.includes("/events"));
    expect(call).toBeDefined();
    expect(call.url).toBe(
      "http://localhost:8080/api/admin/agents/runs/42/events",
    );
    const body = JSON.parse(call.opts.body);
    expect(body).toMatchObject({
      type: "tool.call.started",
      body: { name: "write_file" },
    });
    expect(body.sender).toBe("smol-agent");
    expect(call.opts.headers.Authorization).toBe("Bearer test-token");
  });

  it("skips event posting when runId is not set", async () => {
    const fetchCalls = [];
    global.fetch = jest.fn(async (url, opts) => {
      fetchCalls.push({ url, opts });
      return {
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ status: "accepted" }),
      };
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8080",
    });

    host.eventSink.emit({ type: "tool.call.started", body: {} });
    await new Promise((r) => setTimeout(r, 50));

    const call = fetchCalls.find((c) => c.url.includes("/events"));
    expect(call).toBeUndefined();
  });
});

describe("GenTrellisHost tool governance", () => {
  const originalFetch = global.fetch;
  const originalRegistry = globalThis.__smolAgentRegistry;

  afterEach(() => {
    global.fetch = originalFetch;
    globalThis.__smolAgentRegistry = originalRegistry;
    jest.restoreAllMocks();
  });

  it("does not fall back to the local registry when no governed tool catalog is available", () => {
    globalThis.__smolAgentRegistry = {
      getTools: jest.fn(() => [makeTool("run_command")]),
    };

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 42,
    });

    expect(host.toolProvider.getTools(false)).toEqual([]);
    expect(globalThis.__smolAgentRegistry.getTools).not.toHaveBeenCalled();
  });

  it("uses the provided governed tool cache synchronously", () => {
    const governedTools = [makeTool("read_file"), makeTool("list_files")];

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 42,
      initialTools: governedTools,
    });

    expect(host.toolProvider.getTools(true)).toEqual(governedTools);
  });

  it("refreshes the governed tool cache from GenTrellis", async () => {
    const governedTools = [makeTool("read_file"), makeTool("grep")];
    global.fetch = jest.fn(async () => ({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({ tools: governedTools }),
    }));

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 7,
      protectionLevel: "controlled",
    });

    await host.refreshTools();

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/api/agents/tools?workflowId=7&protectionLevel=controlled",
      expect.objectContaining({ method: "GET" }),
    );
    expect(host.toolProvider.getTools(false)).toEqual(governedTools);
  });
});
