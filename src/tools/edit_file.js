import fs from "node:fs/promises";
import { register } from "./registry.js";

register("edit_file", {
  description:
    "Perform a find-and-replace edit in a file. Finds the first occurrence of `old_string` and replaces it with `new_string`. The old_string must match exactly (including whitespace/indentation). Read the file first to get the exact text.",
  parameters: {
    type: "object",
    required: ["path", "old_string", "new_string"],
    properties: {
      path: {
        type: "string",
        description: "Path to the file to edit.",
      },
      old_string: {
        type: "string",
        description:
          "The exact string to find in the file. Must match file content exactly.",
      },
      new_string: {
        type: "string",
        description: "The replacement string.",
      },
    },
  },
  async execute({ path, old_string, new_string }) {
    const content = await fs.readFile(path, "utf-8");
    if (!content.includes(old_string)) {
      return {
        error: `old_string not found in ${path}. Read the file first to get the exact text.`,
      };
    }
    const updated = content.replace(old_string, new_string);
    await fs.writeFile(path, updated, "utf-8");
    return { status: "ok", path };
  },
});
