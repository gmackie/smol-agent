/**
 * Unit tests for tool argument validation.
 *
 * Verifies that validateToolArgs() correctly validates parsed tool call
 * arguments against a tool's parameter schema — checking required fields,
 * type correctness, and edge cases (no schema, non-object args).
 *
 * Dependencies: @jest/globals, ../../src/tool-arg-validator.js
 */
import { describe, test, expect } from "@jest/globals";
import { validateToolArgs } from "../../src/tool-arg-validator.js";

describe("validateToolArgs", () => {
  const writeFileSchema = {
    type: "object",
    required: ["filePath", "content"],
    properties: {
      filePath: { type: "string" },
      content: { type: "string" },
    },
  };

  test("accepts valid args", () => {
    const result = validateToolArgs({ filePath: "test.txt", content: "hello" }, writeFileSchema);
    expect(result.valid).toBe(true);
  });

  test("rejects missing required field", () => {
    const result = validateToolArgs({ filePath: "test.txt" }, writeFileSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/content/);
  });

  test("rejects wrong type", () => {
    const result = validateToolArgs({ filePath: 123, content: "hello" }, writeFileSchema);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/filePath/);
  });

  test("accepts when no schema provided", () => {
    const result = validateToolArgs({ anything: true }, undefined);
    expect(result.valid).toBe(true);
  });

  test("rejects non-object args", () => {
    const result = validateToolArgs("not an object", writeFileSchema);
    expect(result.valid).toBe(false);
  });
});
