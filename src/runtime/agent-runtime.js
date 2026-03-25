import { EventEmitter } from "node:events";

import { validateAgentHost } from "./contracts.js";

export class AgentRuntime extends EventEmitter {
  constructor({ host } = {}) {
    super();
    validateAgentHost(host);
    this.host = host;
  }

  emitRuntimeEvent(type, payload = {}) {
    const event = { type, ...payload, timestamp: Date.now() };
    // Send to host event sink (audit trail for external hosts, no-op for LocalHost)
    try {
      this.host.eventSink.emit(event);
    } catch {
      // eventSink failure must never crash the agent
    }
    // Emit on the specific event type for backward-compatible listeners (e.g. terminal UI)
    this.emit(type, payload);
    // Also emit on the generic channel for runtime-level listeners
    this.emit("runtime_event", event);
    return event;
  }

  async emitLifecycleForTest() {
    this.emitRuntimeEvent("run.start");
    this.emitRuntimeEvent("run.complete");
  }
}
