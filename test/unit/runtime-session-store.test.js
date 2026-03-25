import { beforeEach, describe, expect, it } from "@jest/globals";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildSessionMetadata } from "../../src/runtime/session-metadata.js";
import { createSession, loadSession, saveSession } from "../../src/sessions.js";

describe("buildSessionMetadata", () => {
  it("includes fixed tiered-router workflow context", () => {
    const metadata = buildSessionMetadata({
      name: "legal reviewer",
      tieredRouter: {
        baseUrl: "https://router.example/v1",
        workflowId: 42,
        protectionLevel: "protected",
      },
    });

    expect(metadata.name).toBe("legal reviewer");
    expect(metadata.runtimeContext.tieredRouter.workflowId).toBe(42);
    expect(metadata.runtimeContext.tieredRouter.protectionLevel).toBe("protected");
  });
});

describe("session persistence with runtime context", () => {
  let cwd;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), "smol-agent-session-"));
  });

  it("preserves runtimeContext through save and load", async () => {
    const session = createSession("legal reviewer", {
      tieredRouter: {
        baseUrl: "https://router.example/v1",
        workflowId: 42,
        protectionLevel: "protected",
      },
    });

    const messages = [
      { role: "user", content: "Summarize the workflow." },
      { role: "assistant", content: "Here is the summary." },
    ];

    const saved = await saveSession(cwd, session, messages);
    const loaded = await loadSession(cwd, session.id);

    expect(saved.runtimeContext.tieredRouter.workflowId).toBe(42);
    expect(saved.name).toBe("legal reviewer");
    expect(saved.messageCount).toBe(2);
    expect(loaded.runtimeContext.tieredRouter.baseUrl).toBe("https://router.example/v1");
    expect(loaded.runtimeContext.tieredRouter.protectionLevel).toBe("protected");
    expect(loaded.name).toBe("legal reviewer");
  });
});
