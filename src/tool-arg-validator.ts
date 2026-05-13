/**
 * Lightweight schema validator for text-parsed tool call arguments.
 *
 * Text-parsed tool calls (extracted from LLM content via regex) bypass
 * the provider's native tool-calling validation. This module checks
 * that parsed arguments satisfy the tool's declared parameter schema
 * before the agent attempts execution.
 *
 * Dependencies: none
 * Depended on by: src/agent.js (text-parsed tool call filter)
 *
 * @module tool-arg-validator
 */

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

interface ToolParameterProperty {
  type: string;
}

interface ToolParametersSchema {
  type: string;
  required?: string[];
  properties?: Record<string, ToolParameterProperty>;
}

export function validateToolArgs(
  args: unknown,
  schema: ToolParametersSchema | undefined,
): ValidationResult {
  if (!schema) return { valid: true };

  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return { valid: false, reason: "Arguments must be an object" };
  }

  const obj = args as Record<string, unknown>;

  // Check required fields
  for (const field of schema.required || []) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      return { valid: false, reason: `Missing required field: ${field}` };
    }
  }

  // Check types for declared properties
  if (schema.properties) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key in obj && obj[key] !== undefined && obj[key] !== null) {
        const actual = typeof obj[key];
        if (prop.type === "string" && actual !== "string") {
          return { valid: false, reason: `Field '${key}' must be string, got ${actual}` };
        }
        if (prop.type === "number" && actual !== "number") {
          return { valid: false, reason: `Field '${key}' must be number, got ${actual}` };
        }
        if (prop.type === "boolean" && actual !== "boolean") {
          return { valid: false, reason: `Field '${key}' must be boolean, got ${actual}` };
        }
        if (prop.type === "array" && !Array.isArray(obj[key])) {
          return { valid: false, reason: `Field '${key}' must be array, got ${actual}` };
        }
      }
    }
  }

  return { valid: true };
}
