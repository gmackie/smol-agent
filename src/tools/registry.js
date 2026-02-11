/**
 * Tool registry — registers tools and provides them in Ollama's tool-call format.
 */

const tools = new Map();

export function register(name, { description, parameters, execute }) {
  tools.set(name, { description, parameters, execute });
}

/**
 * Return the tools array in the format Ollama expects.
 */
export function ollamaTools() {
  const out = [];
  for (const [name, tool] of tools) {
    out.push({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return out;
}

/**
 * Execute a tool call by name with the given arguments.
 */
export async function execute(name, args) {
  const tool = tools.get(name);
  if (!tool) {
    return { error: `Unknown tool: ${name}` };
  }
  try {
    const result = await tool.execute(args);
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

export function list() {
  return [...tools.keys()];
}
