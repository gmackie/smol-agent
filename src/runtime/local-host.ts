import * as registry from "../tools/registry.js";
import "../tools/run_command.js";
import "../tools/file_tools.js";
import "../tools/list_files.js";
import "../tools/grep.js";
import "../tools/ask_user.js";
import "../tools/plan_tools.js";
import "../tools/reflection.js";
import "../tools/memory.js";
import "../tools/context_docs.js";
import "../tools/git.js";
import "../tools/session_tools.js";
import "../tools/code_execution.js";

import { createFilesystemMessageTransport } from "./message-transport.js";
import { createSession, loadSession, saveSession, type Session, type SessionMessage } from "../sessions.js";
import { loadMemoryBank, writeBankFile } from "../memory-bank.js";

export interface LocalHost {
  sessionStore: {
    create(name?: string | null, runtimeContext?: Record<string, unknown>): Promise<Session>;
    load(sessionId: string): Promise<unknown>;
    save(session: Session, messages: SessionMessage[]): Promise<unknown>;
  };
  memoryStore: {
    read(): Promise<string>;
    write(content: string, section?: string): Promise<void>;
  };
  messageTransport: ReturnType<typeof createFilesystemMessageTransport>;
  toolProvider: {
    getTools(coreOnly?: boolean): unknown;
    execute(name: string, args: Record<string, unknown>, options?: { cwd?: string; eventEmitter?: unknown; allowedTools?: Set<string> }): Promise<unknown>;
  };
  eventSink: {
    emit(event: Record<string, unknown>): void;
  };
}

export function createLocalHost({ jailDirectory }: { jailDirectory: string }): LocalHost {
  registry.setJailDirectory(jailDirectory);

  return {
    sessionStore: {
      async create(name?: string | null, runtimeContext: Record<string, unknown> = {}) {
        return createSession(name, runtimeContext);
      },

      async load(sessionId: string) {
        return loadSession(jailDirectory, sessionId);
      },

      async save(session: Session, messages: SessionMessage[]) {
        return saveSession(jailDirectory, session, messages);
      },
    },

    memoryStore: {
      async read() {
        return (await loadMemoryBank(jailDirectory)) || "";
      },

      async write(content: string, section = "progress") {
        await writeBankFile(jailDirectory, section, content);
      },
    },

    messageTransport: createFilesystemMessageTransport(),

    toolProvider: {
      getTools(coreOnly = true) {
        return registry.getTools(coreOnly);
      },

      async execute(name: string, args: Record<string, unknown>, options: { cwd?: string; eventEmitter?: unknown; allowedTools?: Set<string> } = {}) {
        registry.setJailDirectory(jailDirectory);
        return registry.execute(name, args, options);
      },
    },

    eventSink: {
      emit(_event: Record<string, unknown>) {},
    },
  };
}
