import { afterEach, describe, expect, it, jest } from "@jest/globals";

// Mock the registry module so local execution works in tests
jest.unstable_mockModule("../../src/tools/registry.js", () => ({
  getTools: jest.fn(() => []),
  setJailDirectory: jest.fn(),
  execute: jest.fn(async (name, args) => {
    return { content: `executed ${name}` };
  }),
}));

const { createGenTrellisHost } = await import("../../src/runtime/gentrellis-host.js");

// Mock global fetch
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GenTrellis host approval polling", () => {
  it("polls until approval is decided, then executes locally", async () => {
    let pollCount = 0;
    globalThis.fetch = jest.fn(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/api/agents/tools/execute")) {
        return new Response(
          JSON.stringify({
            status: "pending_approval",
            approval_id: 42,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (urlStr.includes("/api/agents/approvals/42")) {
        pollCount++;
        if (pollCount < 3) {
          return new Response(JSON.stringify({ status: "pending" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(
          JSON.stringify({ status: "approved" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 1,
      approvalPollIntervalMs: 10,
    });

    const result = await host.toolProvider.execute(
      "write_file",
      { filePath: "test.txt", content: "hello" },
      { cwd: "/tmp" },
    );

    expect(result).toEqual({ content: "executed write_file" });
    expect(pollCount).toBe(3);
  });

  it("returns error when approval is denied", async () => {
    globalThis.fetch = jest.fn(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/api/agents/tools/execute")) {
        return new Response(
          JSON.stringify({
            status: "pending_approval",
            approval_id: 99,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (urlStr.includes("/api/agents/approvals/99")) {
        return new Response(
          JSON.stringify({
            status: "denied",
            reason: "operator denied",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 1,
      approvalPollIntervalMs: 10,
    });

    const result = await host.toolProvider.execute(
      "run_command",
      { command: "rm -rf /" },
      { cwd: "/tmp" },
    );

    expect(result).toEqual({
      error: "Tool call denied by operator: operator denied",
    });
  });

  it("executes locally when governance auto-approves", async () => {
    globalThis.fetch = jest.fn(async (url) => {
      const urlStr = typeof url === "string" ? url : url.toString();

      if (urlStr.includes("/api/agents/tools/execute")) {
        return new Response(
          JSON.stringify({ status: "approved" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      return new Response("not found", { status: 404 });
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 1,
    });

    const result = await host.toolProvider.execute(
      "list_files",
      { path: "." },
      { cwd: "/tmp" },
    );

    expect(result).toEqual({ content: "executed list_files" });
  });

  it("falls back to local execution when governance is unavailable", async () => {
    globalThis.fetch = jest.fn(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 1,
      maxRetries: 0,
    });

    const result = await host.toolProvider.execute(
      "read_file",
      { path: "test.txt" },
      { cwd: "/tmp" },
    );

    expect(result).toEqual({ content: "executed read_file" });
  });
});
