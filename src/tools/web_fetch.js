import { register } from "./registry.js";

let _client = null;

/**
 * Set the Ollama client instance for web fetch.
 * Called by the agent during initialization.
 */
export function setOllamaClient(client) {
  _client = client;
}

register("web_fetch", {
  description:
    "Fetch a web page by URL using Ollama's web fetch API and return its content as readable text. Use this to read documentation pages, API references, blog posts, or any URL found via web_search.",
  parameters: {
    type: "object",
    required: ["url"],
    properties: {
      url: {
        type: "string",
        description:
          "The full URL to fetch (must start with http:// or https://).",
      },
    },
  },
  async execute({ url }) {
    if (!_client) {
      return { error: "Ollama client not initialized." };
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return { error: "URL must start with http:// or https://" };
    }

    const response = await _client.webFetch({ url });

    let content = response.content || "";

    // Truncate to ~12k chars to avoid blowing up the context window
    const MAX = 12_000;
    if (content.length > MAX) {
      content = content.slice(0, MAX) + "\n\n...(truncated)";
    }

    return {
      url,
      title: response.title || "",
      content,
    };
  },
});
