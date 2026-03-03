import fs from "node:fs/promises";
import path from "node:path";
import { resolveJailedPath } from "../path-utils.js";

const STATE_DIR = ".smol-agent/state";
const PROGRESS_FILE = "plan-progress.json";

/**
 * Ensure the state directory exists within the jail
 */
async function ensureStateDir(cwd) {
  const statePath = resolveJailedPath(cwd, STATE_DIR);
  await fs.mkdir(statePath, { recursive: true });
  return statePath;
}

/**
 * Save a plan to a markdown file within the jail directory
 * @param {string} description - Plan description for filename
 * @param {string} planContent - Markdown content
 * @param {string} cwd - Jail directory
 * @returns {{ filename: string, filepath: string }}
 */
export async function savePlan(description, planContent, cwd = process.cwd()) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `PLAN-${slug}-${Date.now()}.md`;
  const filepath = resolveJailedPath(cwd, filename);

  await fs.writeFile(filepath, planContent, "utf-8");

  return { filename, filepath };
}

/**
 * Save/update plan progress tracking
 */
export async function savePlanProgress(filename, currentStep, status, details = {}, cwd = process.cwd()) {
  const statePath = await ensureStateDir(cwd);
  const progressFile = path.join(statePath, PROGRESS_FILE);
  const progress = await loadPlanProgress(cwd);

  progress[filename] = {
    ...(progress[filename] || {}),
    currentStep,
    status,
    details: { ...(progress[filename]?.details || {}), ...details },
    updatedAt: Date.now(),
  };

  await fs.writeFile(progressFile, JSON.stringify(progress, null, 2), "utf-8");
  return progress[filename];
}

/**
 * Load plan progress from file
 */
export async function loadPlanProgress(cwd = process.cwd()) {
  try {
    const statePath = resolveJailedPath(cwd, STATE_DIR);
    const progressFile = path.join(statePath, PROGRESS_FILE);
    const content = await fs.readFile(progressFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Get the current active plan
 */
export async function getCurrentPlan(cwd = process.cwd()) {
  const progress = await loadPlanProgress(cwd);
  const filenames = Object.keys(progress);

  for (const filename of filenames) {
    const status = progress[filename].status;
    if (status === "in-progress" || status === "pending") {
      return { filename, details: progress[filename] };
    }
  }

  if (filenames.length > 0) {
    const mostRecent = filenames.sort(
      (a, b) => progress[b].updatedAt - progress[a].updatedAt
    )[0];
    return { filename: mostRecent, details: progress[mostRecent] };
  }

  return null;
}

/**
 * Mark a plan as completed
 */
export async function markPlanCompleted(filename, message, cwd = process.cwd()) {
  return updatePlanStatus(filename, "completed", { message }, cwd);
}

/**
 * Update plan status
 */
export async function updatePlanStatus(planFilename, status, details = {}, cwd = process.cwd()) {
  const statePath = await ensureStateDir(cwd);
  const progressFile = path.join(statePath, PROGRESS_FILE);
  const progress = await loadPlanProgress(cwd);

  if (!progress[planFilename]) {
    return { success: false, error: "Plan not found" };
  }

  progress[planFilename].status = status;
  progress[planFilename].details = {
    ...(progress[planFilename].details || {}),
    ...details,
  };
  progress[planFilename].updatedAt = Date.now();

  await fs.writeFile(progressFile, JSON.stringify(progress, null, 2), "utf-8");
  return { success: true, planFilename, status };
}