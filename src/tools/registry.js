import path from 'node:path';
import { logger } from '../logger.js';

/** 
 * Tool registry — registers tools and provides them in Ollama's tool-call format. 
 */

const tools = new Map();

// Tools that modify files or run commands (blocked in planning/preplan modes)
const WRITE_TOOLS = new Set(["run_command"]);

// Tools that spawn sub-agents (blocked for child agents)
const SPAWN_TOOLS = new Set(["spawn_agent", "agent_coordinator"]);

/**
 * Validate and sanitize a file path to prevent jail escape
 * @param {string} filePath - The file path to validate
 * @param {string} cwd - The current working directory (jail boundary)
 * @returns {{ valid: boolean, sanitizedPath?: string, error?: string }}
 */
export function validateFilePath(filePath, cwd) {
  if (typeof filePath !== 'string') {
    return { valid: false, error: 'File path must be a string' };
  }

  // Remove null bytes and other dangerous characters
  if (filePath.includes('\0')) {
    return { valid: false, error: 'Invalid characters in file path' };
  }

  // Resolve the path relative to cwd
  const resolvedPath = path.resolve(cwd, filePath);

  // Check if path is within cwd (jail check)
  const normalizedCwd = path.resolve(cwd);
  if (!resolvedPath.startsWith(normalizedCwd + path.sep) && resolvedPath !== normalizedCwd) {
    return { valid: false, error: `Access denied: path escapes jail directory (${normalizedCwd})` };
  }

  // Check for path traversal attacks
  if (filePath.startsWith('..') || filePath.includes('../') || filePath.includes('..\\')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  return { valid: true, sanitizedPath: resolvedPath };
}

/**
 * Validate tool arguments based on expected parameters schema
 * @param {string} toolName - Name of the tool
 * @param {Object} args - Arguments to validate
 * @param {Object} parameters - Expected parameter schema
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateToolArgs(toolName, args, parameters) {
  const errors = [];

  if (!args || typeof args !== 'object') {
    errors.push(`Tool arguments must be an object`);
    return { valid: false, errors };
  }

  // Check required properties
  if (parameters && parameters.required) {
    for (const required of parameters.required) {
      if (args[required] === undefined) {
        errors.push(`Missing required argument: ${required}`);
      }
    }
  }

  // Validate string properties for file operations

  // Validate search patterns (regex)
  if (toolName === 'grep') {
    if (args.pattern) {
      try {
        new RegExp(args.pattern);
      } catch (err) {
        errors.push(`Invalid regex pattern: ${err.message}`);
      }
    }
  }

  // Validate run_command commands
  if (toolName === 'run_command') {
    if (args.command) {
      if (typeof args.command !== 'string') {
        errors.push('Shell command must be a string');
      } else if (args.command.length > 10000) {
        errors.push('Command too long (max 10000 characters)');
      }
    }
  }

  if (errors.length > 0) {
    logger.warn(`Tool validation failed for ${toolName}:`, { errors });
    return { valid: false, errors };
  }

  return { valid: true };
}

export function register(name, { description, parameters, execute }) {
  tools.set(name, { description, parameters, execute });
}

/**
 * Return the tools array in the format Ollama expects.
 * @param {boolean} planningMode - If true, exclude write tools
 * @param {boolean} preplanMode - If true, exclude write tools
 * @param {boolean} isChildAgent - If true, exclude spawn tools
 */
export function ollamaTools(planningMode = false, preplanMode = false, isChildAgent = false) {
  const out = [];
  for (const [name, tool] of tools) {
    // In planning/preplan modes, skip tools that modify files or run commands
    if ((planningMode || preplanMode) && WRITE_TOOLS.has(name)) continue;
    // Child agents cannot spawn sub-agents
    if (isChildAgent && SPAWN_TOOLS.has(name)) continue;
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
 * Includes validation, logging, and error handling.
 */
export async function execute(name, args, { cwd = process.cwd() } = {}) {
  const tool = tools.get(name);
  if (!tool) {
    logger.error(`Unknown tool: ${name}`);
    return { error: `Unknown tool: ${name}` };
  }

  // Validate arguments
  if (tool.parameters) {
    const validation = validateToolArgs(name, args, tool.parameters);
    if (!validation.valid) {
      logger.error(`Tool execution failed - validation error for ${name}`, { errors: validation.errors });
      return { error: `Validation failed: ${validation.errors.join(', ')}` };
    }
  }

  logger.debug(`Executing tool: ${name}`, { args: Object.keys(args || {}) });

  try {
    const result = await tool.execute(args);
    logger.info(`Tool ${name} completed successfully`);
    return result;
  } catch (err) {
    logger.error(`Tool ${name} failed`, { 
      error: err.message, 
      stack: err.stack 
    });
    return { error: err.message };
  }
}

export function list() {
  return [...tools.keys()];
}

export default {
  register,
  ollamaTools,
  execute,
  list,
  validateToolArgs,
  validateFilePath,
};
