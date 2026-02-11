import readline from "node:readline";
import { register } from "./registry.js";

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // use stderr so stdout stays clean for piping
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

register("ask_user", {
  description:
    "Ask the user a question and wait for their response. Use this when you need clarification, want to confirm a destructive action, or need the user to choose between options. The question is displayed to the user in the terminal and their typed response is returned.",
  parameters: {
    type: "object",
    required: ["question"],
    properties: {
      question: {
        type: "string",
        description: "The question to ask the user.",
      },
    },
  },
  async execute({ question }) {
    const answer = await prompt(`\n🤖 Agent asks: ${question}\n> `);
    return { answer: answer.trim() };
  },
});
