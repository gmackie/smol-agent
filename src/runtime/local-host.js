import * as registry from "../tools/registry.js";
import {
  createSession,
  saveSession as persistSession,
  loadSession as fetchSession,
} from "../sessions.js";
import { getMessageTransport } from "../cross-agent.js";

export function createLocalHost({ jailDirectory } = {}) {
  const transport = getMessageTransport();

  return {
    sessionStore: {
      create: async (name, runtimeContext) => createSession(name, runtimeContext),
      load: async (sessionId) => fetchSession(jailDirectory || process.cwd(), sessionId),
      save: async (session, messages) => persistSession(jailDirectory || process.cwd(), session, messages),
    },
    memoryStore: {
      read: async () => "",
      write: async () => {},
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
