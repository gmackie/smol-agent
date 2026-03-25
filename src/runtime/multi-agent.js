function missing(name) {
  return async () => {
    throw new Error(`Multi-agent runtime missing required handler: ${name}`);
  };
}

export function createMultiAgentRuntime({
  spawnChild,
  sendMessageImpl,
  receiveMessageImpl,
  replyMessageImpl,
  listThreadsImpl,
  awaitResultImpl,
  terminateAgentImpl,
} = {}) {
  return {
    spawnAgent(spec) {
      return (spawnChild || missing("spawnChild"))(spec);
    },
    sendMessage(payload) {
      return (sendMessageImpl || missing("sendMessageImpl"))(payload);
    },
    receiveMessage(payload) {
      return (receiveMessageImpl || missing("receiveMessageImpl"))(payload);
    },
    replyMessage(payload) {
      return (replyMessageImpl || missing("replyMessageImpl"))(payload);
    },
    listThreads(payload) {
      return (listThreadsImpl || (async () => []))(payload);
    },
    awaitResult(payload) {
      return (awaitResultImpl || missing("awaitResultImpl"))(payload);
    },
    terminateAgent(payload) {
      return (terminateAgentImpl || (async () => ({ terminated: false })))(payload);
    },
  };
}
