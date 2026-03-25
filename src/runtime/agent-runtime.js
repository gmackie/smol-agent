import { EventEmitter } from "node:events";

import { validateAgentHost } from "./contracts.js";

export class AgentRuntime extends EventEmitter {
  constructor({ host } = {}) {
    super();
    validateAgentHost(host);
    this.host = host;
  }

  emitRuntimeEvent(type, payload = {}) {
    const event = { type, ...payload };
    this.host.eventSink.emit(event);
    this.emit("runtime_event", event);
    return event;
  }

  async emitLifecycleForTest() {
    this.emitRuntimeEvent("run.start");
    this.emitRuntimeEvent("run.complete");
  }
}
