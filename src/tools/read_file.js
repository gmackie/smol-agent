import fs from "node:fs/promises";
import { register } from "./registry.js";

register("read_file", {
  description:
    "Read the contents of a file at the given path. Returns the file content as a string. Use this before editing a file to understand its current contents.",
  parameters: {
    type: "object",
    required: ["path"],
    properties: {
      path: {
        type: "string",
        description: "Absolute or relative path to the file to read.",
      },
      offset: {
        type: "number",
        description: "Optional 1-based line number to start reading from.",
      },
      limit: {
        type: "number",
        description: "Optional maximum number of lines to return.",
      },
    },
  },
  async execute({ path, offset, limit }) {
    const raw = await fs.readFile(path, "utf-8");
    let lines = raw.split("\n");

    if (offset && offset > 1) {
      lines = lines.slice(offset - 1);
    }
    if (limit) {
      lines = lines.slice(0, limit);
    }

    // Number the lines for easy reference
    const startLine = offset && offset > 1 ? offset : 1;
    const numbered = lines.map((l, i) => `${startLine + i}: ${l}`);
    return { content: numbered.join("\n") };
  },
});
