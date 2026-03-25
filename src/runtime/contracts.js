const REQUIRED_HOST_KEYS = [
  "sessionStore",
  "memoryStore",
  "messageTransport",
  "toolProvider",
  "eventSink",
];

export function validateAgentHost(host) {
  if (!host || typeof host !== "object") {
    throw new Error("Agent host must be an object");
  }

  for (const key of REQUIRED_HOST_KEYS) {
    if (!host[key]) {
      throw new Error(`Agent host missing required property: ${key}`);
    }
  }
}
