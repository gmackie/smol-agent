#!/usr/bin/env node

import readline from "node:readline";
import { Agent } from "./agent.js";

// ── CLI argument parsing ─────────────────────────────────────────────
const args = process.argv.slice(2);
let host = undefined;
let model = undefined;
let promptText = undefined;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if ((a === "--host" || a === "-h") && args[i + 1]) {
    host = args[++i];
  } else if ((a === "--model" || a === "-m") && args[i + 1]) {
    model = args[++i];
  } else if (a === "--help") {
    printUsage();
    process.exit(0);
  } else if (!a.startsWith("-")) {
    // Everything from here on is the prompt
    promptText = args.slice(i).join(" ");
    break;
  }
}

function printUsage() {
  console.log(`smol-agent — a small coding agent powered by Ollama

Usage:
  smol-agent [options] [prompt]

Options:
  -m, --model <name>   Ollama model to use (default: qwen2.5-coder:7b)
  -h, --host <url>     Ollama server URL (default: http://127.0.0.1:11434)
      --help           Show this help message

Examples:
  smol-agent "add error handling to src/index.js"
  smol-agent -m codellama "refactor the auth module"
  smol-agent                                         # interactive mode`);
}

// ── Main ─────────────────────────────────────────────────────────────
const agent = new Agent({ host, model });

if (promptText) {
  // One-shot mode: run the prompt and exit
  try {
    const answer = await agent.run(promptText);
    console.log(answer);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
} else {
  // Interactive REPL mode
  console.log(
    `smol-agent interactive mode (model: ${agent.model})\nType your request, or "exit" / Ctrl-C to quit.\n`
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "you> ",
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }
    if (input === "exit" || input === "quit") {
      console.log("Bye!");
      process.exit(0);
    }
    if (input === "/reset") {
      agent.reset();
      console.log("(conversation reset)");
      rl.prompt();
      return;
    }

    try {
      const answer = await agent.run(input);
      console.log(`\nagent> ${answer}\n`);
    } catch (err) {
      console.error(`Error: ${err.message}\n`);
    }
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nBye!");
    process.exit(0);
  });
}
