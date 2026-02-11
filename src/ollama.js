import { Ollama } from "ollama";

const DEFAULT_MODEL = "qwen2.5-coder:7b";

export function createClient(host) {
  const ollama = new Ollama({ host: host || "http://127.0.0.1:11434" });
  return ollama;
}

export async function chat(ollama, model, messages, tools) {
  const response = await ollama.chat({
    model: model || DEFAULT_MODEL,
    messages,
    tools,
    stream: false,
  });
  return response;
}

export { DEFAULT_MODEL };
