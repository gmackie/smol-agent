import { Agent } from "../agent.js";

export interface InteractiveAgentOptions {
  jailDirectory: string;
  provider?: string;
  model?: string;
  host?: string;
  apiKey?: string;
  contextSize?: number;
  approvedCategories?: string[];
  programmaticToolCalling?: boolean;
  sessionId?: string;
}

export async function createSessionAgent({
  jailDirectory,
  provider,
  model,
  host,
  apiKey,
  contextSize,
  approvedCategories,
  programmaticToolCalling,
  sessionId,
}: InteractiveAgentOptions) {
  const agent = new Agent({
    provider,
    model,
    host,
    apiKey,
    contextSize,
    jailDirectory,
    approvedCategories,
    programmaticToolCalling,
  });

  let resumed = false;
  if (sessionId) {
    resumed = await agent.resumeSession(sessionId);
  }

  return { agent, resumed };
}

export const createInteractiveAgent = createSessionAgent;
