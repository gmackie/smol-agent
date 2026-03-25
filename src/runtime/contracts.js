const REQUIRED_HOST_KEYS = [
  "sessionStore",
  "memoryStore",
  "messageTransport",
  "toolProvider",
  "eventSink",
];

const REQUIRED_METHODS = {
  sessionStore: ["create", "load", "save"],
  memoryStore: ["read", "write"],
  messageTransport: ["send", "listThreads"],
  toolProvider: ["getTools", "execute"],
  eventSink: ["emit"],
};

function validateInterfaceMethods(name, value, methodNames) {
  if (!value || typeof value !== "object") {
    throw new Error(`Agent host missing required property: ${name}`);
  }

  for (const method of methodNames) {
    if (typeof value[method] !== "function") {
      throw new Error(`Agent host ${name} must provide function: ${method}`);
    }
  }
}

export function validateAgentHost(host) {
  if (!host || typeof host !== "object") {
    throw new Error("Agent host must be an object");
  }

  for (const key of REQUIRED_HOST_KEYS) {
    if (!host[key]) {
      throw new Error(`Agent host missing required property: ${key}`);
    }
    validateInterfaceMethods(key, host[key], REQUIRED_METHODS[key]);
  }
}
