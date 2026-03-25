/**
 * Trace export — serializes agent run events to a human-readable Markdown file.
 *
 * When running under a governed host (non-LocalHost), the eventSink captures
 * all auditable events. This module serializes those events into a .trace.md
 * file that compliance officers, operators, or developers can review.
 *
 * Key exports:
 *   - exportTrace(events, options): Write a .trace.md file
 *
 * Dependencies: node:fs/promises, node:path
 * Depended on by: src/agent.js (post-run hook)
 *
 * @module trace-export
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * Format a timestamp for display.
 */
function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Format a single event as Markdown.
 */
function formatEvent(event, index) {
  const time = formatTime(event.timestamp);
  const timeStr = time ? ` *(${time})*` : "";

  switch (event.type) {
    case "tool_call":
      return `### ${index + 1}. Tool Call: \`${event.name}\`${timeStr}\n\n` +
        "```json\n" + JSON.stringify(event.args || {}, null, 2) + "\n```\n";

    case "tool_result": {
      const success = !event.result?.error;
      const icon = success ? "+" : "!";
      const label = success ? "Result" : "Error";
      let body;
      if (event.result?.error) {
        body = `**Error:** ${event.result.error}`;
      } else {
        const str = JSON.stringify(event.result, null, 2);
        body = str.length > 500
          ? "```json\n" + str.slice(0, 500) + "\n[truncated]\n```"
          : "```json\n" + str + "\n```";
      }
      return `### ${index + 1}. Tool ${label} [${icon}]${timeStr}\n\n${body}\n`;
    }

    case "response":
      return `### ${index + 1}. Agent Response${timeStr}\n\n` +
        (event.content || "(empty)") + "\n";

    case "error":
      return `### ${index + 1}. Error${timeStr}\n\n` +
        `**${event.message || "Unknown error"}**\n`;

    case "run.start":
      return `### ${index + 1}. Run Started${timeStr}\n`;

    case "run.complete":
      return `### ${index + 1}. Run Completed${timeStr}\n`;

    default:
      return `### ${index + 1}. ${event.type}${timeStr}\n\n` +
        "```json\n" + JSON.stringify(event, null, 2) + "\n```\n";
  }
}

/**
 * Export agent run events as a Markdown trace file.
 *
 * @param {Array} events - Array of event objects from eventSink
 * @param {object} options
 * @param {string} options.outputDir - Directory to write trace file
 * @param {string} [options.sessionId] - Session ID for filename
 * @param {string} [options.protectionLevel] - Protection level label
 * @param {number} [options.workflowId] - Workflow ID
 * @returns {Promise<string>} Path to the written trace file
 */
export async function exportTrace(events, {
  outputDir,
  sessionId = "unknown",
  protectionLevel,
  workflowId,
} = {}) {
  if (!events || events.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
  const filename = `${sessionId}-${timestamp}.trace.md`;
  const traceDir = path.join(outputDir, ".smol-agent", "traces");
  await fs.mkdir(traceDir, { recursive: true });
  const filepath = path.join(traceDir, filename);

  const toolCalls = events.filter(e => e.type === "tool_call").length;
  const errors = events.filter(e => e.type === "error" || e.result?.error).length;

  let md = `# Agent Run Trace\n\n`;
  md += `- **Session:** ${sessionId}\n`;
  if (protectionLevel) md += `- **Protection Level:** ${protectionLevel}\n`;
  if (workflowId) md += `- **Workflow:** ${workflowId}\n`;
  md += `- **Events:** ${events.length}\n`;
  md += `- **Tool Calls:** ${toolCalls}\n`;
  if (errors > 0) md += `- **Errors:** ${errors}\n`;
  md += `- **Generated:** ${new Date().toISOString()}\n`;
  md += `\n---\n\n## Event Log\n\n`;

  for (let i = 0; i < events.length; i++) {
    md += formatEvent(events[i], i) + "\n";
  }

  await fs.writeFile(filepath, md, "utf-8");
  return filepath;
}
