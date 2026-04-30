import { describe, expect, it } from "@jest/globals";

import { Agent } from "../../src/agent.js";
import { createLocalHost } from "../../src/runtime/local-host.js";

function makeTool(name) {
  return {
    type: "function",
    function: {
      name,
      description: `${name} description`,
      parameters: { type: "object", properties: {} },
    },
  };
}

describe("Agent host-governed tool filtering", () => {
  it("filters progressive-discovery tools against the host's allowed catalog", () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });
    const host = {
      ...localHost,
      toolProvider: {
        ...localHost.toolProvider,
        getTools: () => [makeTool("discover_tools"), makeTool("read_file"), makeTool("list_files")],
      },
    };

    const agent = new Agent({
      agentHost: host,
      jailDirectory: process.cwd(),
      coreToolsOnly: false,
      llmProvider: { model: "test-model" },
    });

    agent._activeToolGroups = new Set(["explore", "edit", "execute", "plan", "web", "multi_agent", "memory"]);
    const tools = agent._getCurrentTools();
    const toolNames = tools.map((tool) => tool.function.name);

    expect(toolNames).toContain("discover_tools");
    expect(toolNames).toContain("read_file");
    expect(toolNames).toContain("list_files");
    expect(toolNames).not.toContain("run_command");
    expect(toolNames).not.toContain("web_search");
    expect(toolNames).not.toContain("delegate");
  });

  it("only advertises inactive groups and extended tools that the host allows", () => {
    const localHost = createLocalHost({ jailDirectory: process.cwd() });
    const host = {
      ...localHost,
      toolProvider: {
        ...localHost.toolProvider,
        getTools: () => [makeTool("discover_tools"), makeTool("read_file"), makeTool("list_files"), makeTool("web_search")],
      },
    };

    const agent = new Agent({
      agentHost: host,
      jailDirectory: process.cwd(),
      coreToolsOnly: false,
      llmProvider: { model: "test-model" },
    });

    const visibleExtended = agent._getVisibleExtendedToolNames();
    const visibleInactiveGroups = agent._getVisibleInactiveGroups();

    expect(visibleExtended).toContain("web_search");
    expect(visibleExtended).not.toContain("delegate");
    expect(visibleExtended).not.toContain("save_plan");
    expect(visibleInactiveGroups).toContain("web");
    expect(visibleInactiveGroups).not.toContain("plan");
    expect(visibleInactiveGroups).not.toContain("multi_agent");
  });
});
