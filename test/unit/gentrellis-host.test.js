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
