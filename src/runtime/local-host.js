import * as registry from "../tools/registry.js";
import {
  createSession,
  saveSession as persistSession,
  loadSession as fetchSession,
} from "../sessions.js";
import { getMessageTransport } from "../cross-agent.js";
import { loadMemories } from "../tools/memory.js";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveJailedPath } from "../path-utils.js";

export function createLocalHost({ jailDirectory } = {}) {
  const transport = getMessageTransport();
  const cwd = jailDirectory || process.cwd();

  return {
    sessionStore: {
      create: async (name, runtimeContext) => createSession(name, runtimeContext),
      load: async (sessionId) => fetchSession(cwd, sessionId),
      save: async (session, messages) => persistSession(cwd, session, messages),
    },
    memoryStore: {
      read: async () => {
        const memories = await loadMemories(cwd);
        return JSON.stringify(memories);
      },
      write: async (data) => {
        const dirPath = resolveJailedPath(cwd, ".smol-agent");
        await fs.mkdir(dirPath, { recursive: true });
        const filepath = path.join(dirPath, "memory.json");
        await fs.writeFile(filepath, typeof data === "string" ? data : JSON.stringify(data, null, 2), "utf-8");
      },
    },
    messageTransport: {
      send: async (payload) => {
        if (payload?.originalLetter) {
          return transport.sendReply(payload);
        }
        return transport.sendLetter(payload);
      },
      listThreads: async () => [],
      ...transport,
    },
    toolProvider: {
      getTools: (coreOnly) => registry.getTools(coreOnly),
      execute: (name, args, context) => registry.execute(name, args, context),
    },
    eventSink: {
      emit: () => {},
    },
  };
}
