import fs from "node:fs/promises";
import path from "node:path";

const STATE_DIR = ".smol-agent/state";
const PROGRESS_FILE = path.join(STATE_DIR, "plan-progress.json");

/**
 * Ensure the state directory exists
 */
async function ensureStateDir() {
  await fs.mkdir(STATE_DIR, { recursive: true });
}

/**
 * Save a plan to a markdown file
 * @returns {{ filename: string, filepath: string }}
 */
export async function savePlan(description, planContent) {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const filename = `PLAN-${slug}-${Date.now()}.md`;
  const filepath = path.resolve(filename);

  await fs.writeFile(filepath, planContent, "utf-8");

  return { filename, filepath };
}

/**
 * Save/update plan progress tracking
 */
export async function savePlanProgress(filename, currentStep, status, details = {}) {
  await ensureStateDir();
  const progress = await loadPlanProgress();

  progress[filename] = {
    ...(progress[filename] || {}),
    currentStep,
    status,
    details: { ...(progress[filename]?.details || {}), ...details },
    updatedAt: Date.now(),
  };

  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
  return progress[filename];
}

/**
 * Load plan progress from file
 */
export async function loadPlanProgress() {
  try {
    const content = await fs.readFile(PROGRESS_FILE, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Get the current active plan
 */
export async function getCurrentPlan() {
  const progress = await loadPlanProgress();
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
export async function markPlanCompleted(filename, message) {
  return updatePlanStatus(filename, "completed", { message });
}

/**
 * Update plan status
 */
export async function updatePlanStatus(planFilename, status, details = {}) {
  await ensureStateDir();
  const progress = await loadPlanProgress();

  if (!progress[planFilename]) {
    return { success: false, error: "Plan not found" };
  }

  progress[planFilename].status = status;
  progress[planFilename].details = {
    ...(progress[planFilename].details || {}),
    ...details,
  };
  progress[planFilename].updatedAt = Date.now();

  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2), "utf-8");
  return { success: true, planFilename, status };
}
