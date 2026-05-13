import { describe, expect, test } from "@jest/globals";

import { createGenTrellisHost } from "../../src/runtime/gentrellis-host.js";

describe("GenTrellis LLM proxy headers", () => {
  test("runtimeContext includes llmHeaders with workflow and protection level", () => {
    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 42,
      protectionLevel: "controlled",
    });

    expect(host.runtimeContext.llmHeaders).toEqual({
      "X-Workflow-Id": "42",
      "X-Protection-Level": "controlled",
    });
  });

  test("runtimeContext.llmHeaders omits workflow header when no workflowId", () => {
    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      protectionLevel: "standard",
    });

    expect(host.runtimeContext.llmHeaders).toEqual({
      "X-Protection-Level": "standard",
    });
  });

  test("llmHeaders uses default protectionLevel when not specified", () => {
    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
    });

    expect(host.runtimeContext.llmHeaders).toEqual({
      "X-Protection-Level": "standard",
    });
  });

  test("tieredRouter and llmHeaders are consistent", () => {
    const host = createGenTrellisHost({
      baseUrl: "http://localhost:8000",
      workflowId: 7,
      protectionLevel: "controlled",
    });

    const { tieredRouter, llmHeaders } = host.runtimeContext;

    expect(llmHeaders["X-Workflow-Id"]).toBe(String(tieredRouter.workflowId));
    expect(llmHeaders["X-Protection-Level"]).toBe(tieredRouter.protectionLevel);
  });
});
