import { register } from "./registry.js";

let _client = null;

/**
 * Set the Ollama client instance for web search.
 * Called by the agent during initialization.
 */
export function setOllamaClient(client) {
  _client = client;
}

register("web_search", {
  description:
    "Search the web using Ollama's web search API and return a list of result titles, URLs, and content snippets. Use this to look up documentation, find solutions to errors, research libraries, or get up-to-date information that you don't already know.",
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description: "The search query string.",
      },
      max_results: {
        type: "number",
        description:
          "Maximum number of results to return (1-10, default 5).",
      },
    },
  },
  async execute({ query, max_results }) {
    if (!_client) {
      return { error: "Ollama client not initialized." };
    }

    const response = await _client.webSearch({
      query,
      max_results: max_results || 5,
    });

    if (!response.results || response.results.length === 0) {
      return { results: [], message: "No results found." };
    }

    return { results: response.results };
  },
});
