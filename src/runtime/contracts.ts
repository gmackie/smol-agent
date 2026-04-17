const REQUIRED_HOST_KEYS = [
  "sessionStore",
  "memoryStore",
  "messageTransport",
  "toolProvider",
  "eventSink",
] as const;

const REQUIRED_METHODS: Record<(typeof REQUIRED_HOST_KEYS)[number], string[]> = {
  sessionStore: ["create", "load", "save"],
  memoryStore: ["read", "write"],
  messageTransport: ["send", "receive", "listThreads", "updateStatus"],
  toolProvider: ["getTools", "execute"],
  eventSink: ["emit"],
};

function validateInterfaceMethods(name: string, value: unknown, methodNames: string[]): void {
  if (!value || typeof value !== "object") {
    throw new Error(`Agent host missing required property: ${name}`);
  }

  for (const method of methodNames) {
    if (typeof (value as Record<string, unknown>)[method] !== "function") {
      throw new Error(`Agent host ${name} must provide function: ${method}`);
    }
  }
}

export function validateAgentHost(host: unknown): void {
  if (!host || typeof host !== "object") {
    throw new Error("Agent host must be an object");
  }

  for (const key of REQUIRED_HOST_KEYS) {
    if (!(host as Record<string, unknown>)[key]) {
      throw new Error(`Agent host missing required property: ${key}`);
    }
    validateInterfaceMethods(key, (host as Record<string, unknown>)[key], REQUIRED_METHODS[key]);
  }
}
