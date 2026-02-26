import { register } from "./registry.js";
import { getCurrentPlan } from "../plan-tracker.js";

// The ask_user tool resolves through a callback that the UI layer sets.
// When the agent calls ask_user, it emits a pending question; the UI
// collects the answer and resolves the promise via setAskHandler.

let _askHandler = null;

/**
 * The UI layer calls this once to install its handler.
 * handler: (question: string) => Promise<string>
 */
export function setAskHandler(handler) {
  _askHandler = handler;
}

/**
 * Get current task context for ask_user questions
 */
async function getCurrentTaskContext() {
  const context = {
    mode: process.env.SMOL_AGENT_MODE || "coding",
    currentPlan: null,
  };
  
  try {
    const current = await getCurrentPlan();
    if (current) {
      context.currentPlan = {
        filename: current.filename,
        status: current.details?.status || "unknown",
      };
    }
  } catch {
    // Ignore plan tracker errors
  }
  
  return context;
}

/**
 * Format a question with additional context
 */
function formatQuestion(question, context) {
  const parts = [];
  
  // Add current mode
  parts.push(`Mode: ${context.mode}`);
  
  // Add current plan info if available
  if (context.currentPlan?.filename) {
    parts.push(`Current Plan: ${context.currentPlan.filename} (${context.currentPlan.status})`);
  }
  
  // Add the question
  parts.push(`\nQuestion: ${question}`);
  
  return parts.join('\n');
}

register("ask_user", {
  description:
    "Ask the user a question and wait for their response. Use this when you need clarification, want to confirm a destructive action, or need the user to choose between options. The agent will include context about current mode and active plans.",
  parameters: {
    type: "object",
    required: ["questions"],
    properties: {
      questions: {
        type: "array",
        items: { type: "string" },
        description: "Array of questions to ask the user",
      },
      context: {
        type: "string",
        description: "Optional context about the current task",
      },
    },
  },
  async execute({ questions, context }) {
    if (!_askHandler) {
      return { answer: "(no UI handler registered — cannot ask user)" };
    }
    
    // Get additional context for the questions
    const taskContext = await getCurrentTaskContext();
    
    // Format each question with context
    const formattedQuestions = questions.map(q => 
      formatQuestion(q, { ...taskContext, context })
    );
    
    // Join multiple questions with a blank line between them
    const combinedQuestion = formattedQuestions.join('\n\n');
    
    const answer = await _askHandler(combinedQuestion);
    return { 
      answer: answer.trim(),
      context: taskContext,
    };
  },
});
