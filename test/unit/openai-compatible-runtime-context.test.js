import { afterEach, describe, expect, it, jest } from "@jest/globals";

import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import { buildRuntimeHeaders } from "../../src/runtime/request-context.js";

describe("buildRuntimeHeaders", () => {
  it("maps fixed tiered-router runtime context into request headers", () => {
    const headers = buildRuntimeHeaders({
      tieredRouter: {
        workflowId: 42,
        protectionLevel: "protected",
      },
    });

    expect(headers["X-Workflow-Id"]).toBe("42");
    expect(headers["X-Protection-Level"]).toBe("protected");
  });
});

describe("OpenAICompatibleProvider runtime headers", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends workflow and protection headers", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          releaseLock: () => {},
        }),
      },
    });

    const provider = new OpenAICompatibleProvider({
      apiKey: "gt-test",
      baseURL: "https://router.example/v1",
      model: "gentrellis-default",
      defaultHeaders: {
        "X-Workflow-Id": "42",
        "X-Protection-Level": "protected",
      },
    });

    const iterator = provider.chatStream([{ role: "user", content: "hi" }], []);
    await iterator.next();

    const call = fetchMock.mock.calls[0];
    expect(call[1].headers["X-Workflow-Id"]).toBe("42");
    expect(call[1].headers["X-Protection-Level"]).toBe("protected");
  });

  it("lets runtime context override conflicting default headers", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: async () => ({ done: true }),
          releaseLock: () => {},
        }),
      },
    });

    const provider = new OpenAICompatibleProvider({
      apiKey: "gt-test",
      baseURL: "https://router.example/v1",
      model: "gentrellis-default",
      defaultHeaders: {
        "X-Workflow-Id": "override-me",
        "X-Protection-Level": "standard",
      },
      runtimeContext: {
        tieredRouter: {
          workflowId: 42,
          protectionLevel: "protected",
        },
      },
    });

    const iterator = provider.chatStream([{ role: "user", content: "hi" }], []);
    await iterator.next();

    const call = fetchMock.mock.calls[0];
    expect(call[1].headers["X-Workflow-Id"]).toBe("42");
    expect(call[1].headers["X-Protection-Level"]).toBe("protected");
  });
});
