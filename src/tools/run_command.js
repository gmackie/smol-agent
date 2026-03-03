import { exec } from "node:child_process";
import { register } from "./registry.js";
import { resolveJailedPath } from "../path-utils.js";

// Dangerous command patterns that should be blocked
const FORBIDDEN_PATTERNS = [
  // Remote code execution
  /curl\s+.*\|\s*(bash|sh|zsh|ksh|fish)/i,
  /wget\s+.*\|\s*(bash|sh|zsh|ksh|fish)/i,
  /curl\s+.*>\s*\/(tmp|var|etc|root|home)/i,
  /wget\s+.*>\s*\/(tmp|var|etc|root|home)/i,
  
  // System destruction
  /rm\s+(-[rf]+\s+|-[a-z]*r[a-z]*\s+|-[a-z]*f[a-z]*\s+)*\//i,
  /rm\s+(-[rf]+\s+|-[a-z]*r[a-z]*\s+|-[a-z]*f[a-z]*\s+)*\*/i,
  /mkfs/i,
  /dd\s+.*of=\/dev\//i,
  />\/dev\/(sda|hda|nvme|mmcblk)/i,
  
  // Writing to system directories
  />\s*\/etc\//i,
  />\s*\/root\//i,
  />\s*\/boot\//i,
  />\s*\/lib\//i,
  />\s*\/lib64\//i,
  />\s*\/usr\//i,
  />\s*\/bin\//i,
  />\s*\/sbin\//i,
  
  // Privilege escalation
  /chmod\s+[0-7]*777\s+\//i,
  /chown\s+.*\s+\//i,
  
  // Named pipes (can be used for exploitation)
  /mkfifo/i,
  
  // Shell execution from curl/wget output
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,
  
  // Environment/shadow file access
  /cat\s+\/etc\/shadow/i,
  /cat\s+\/etc\/gshadow/i,
  /less\s+\/etc\/shadow/i,
  /more\s+\/etc\/shadow/i,
];

// Maximum command length to prevent DoS
const MAX_COMMAND_LENGTH = 10000;

/**
 * Validate a shell command for dangerous patterns
 * @param {string} command - The command to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateCommand(command) {
  if (typeof command !== 'string') {
    return { valid: false, error: 'Command must be a string' };
  }
  
  if (command.length > MAX_COMMAND_LENGTH) {
    return { valid: false, error: `Command too long (max ${MAX_COMMAND_LENGTH} characters)` };
  }
  
  // Check for forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(command)) {
      return { valid: false, error: `Command contains forbidden pattern: ${pattern.source}` };
    }
  }
  
  return { valid: true };
}

register("run_command", {
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
  async execute({ command, cwd: argCwd, timeout }, { cwd: baseCwd = process.cwd() } = {}) {
    // Validate command for dangerous patterns
    const validation = validateCommand(command);
    if (!validation.valid) {
      return { error: validation.error };
    }
    
    const resolvedCwd = argCwd
      ? resolveJailedPath(baseCwd, argCwd)
      : baseCwd;

    return new Promise((resolve) => {
      exec(
        command,
        {
          cwd: resolvedCwd,
          timeout: timeout || 30_000,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            resolve({
              exit_code: err.code,
              stdout: (stdout || "").trim(),
              stderr: (stderr || "").trim(),
            });
          } else {
            resolve({ stdout: (stdout || "").trim() });
          }
        },
      );
    });
  },
});
