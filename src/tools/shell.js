import { execSync } from "node:child_process";
import { register } from "./registry.js";

register("shell", {
  description:
    "Execute a shell command and return its stdout/stderr. Use for running builds, tests, git commands, installing packages, etc. Commands run in the current working directory.",
  parameters: {
    type: "object",
    required: ["command"],
    properties: {
      command: {
        type: "string",
        description: "The shell command to execute.",
      },
      cwd: {
        type: "string",
        description: "Optional working directory for the command.",
      },
      timeout: {
        type: "number",
        description: "Timeout in milliseconds (default: 30000).",
      },
    },
  },
  async execute({ command, cwd, timeout }) {
    try {
      const stdout = execSync(command, {
        cwd: cwd || process.cwd(),
        timeout: timeout || 30_000,
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return { stdout: stdout.trim() };
    } catch (err) {
      return {
        exit_code: err.status,
        stdout: (err.stdout || "").trim(),
        stderr: (err.stderr || "").trim(),
      };
    }
  },
});
