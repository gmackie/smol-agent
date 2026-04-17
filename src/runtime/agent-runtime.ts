import { EventEmitter } from "node:events";

import { validateAgentHost } from "./contracts.js";

export class AgentRuntime extends EventEmitter {
  host: Record<string, any>;

  constructor({ host }: { host: Record<string, any> }) {
    super();
    validateAgentHost(host);
    this.host = host;
  }

  emitRuntimeEvent(type: string, payload: Record<string, unknown> = {}) {
    const event = { type, ...payload, timestamp: Date.now() };
    try {
      this.host.eventSink.emit(event);
    } catch {
      // eventSink failures must never crash the runtime
    }
    this.emit(type, payload);
    this.emit("runtime_event", event);
    return event;
  }

  async emitLifecycleForTest(): Promise<void> {
    this.emitRuntimeEvent("run.start");
    this.emitRuntimeEvent("run.complete");
  }
}
