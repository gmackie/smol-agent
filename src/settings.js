import fs from "node:fs/promises";
import path from "node:path";

const SETTINGS_DIR = ".smol-agent";
const SETTINGS_FILE = "settings.json";

const DEFAULTS = {
  autoApprove: false,
};

/**
 * Load settings from .smol-agent/settings.json in the given directory.
 * Returns defaults for any missing keys.
 */
export async function loadSettings(cwd) {
  try {
    const filepath = path.join(cwd, SETTINGS_DIR, SETTINGS_FILE);
    const data = await fs.readFile(filepath, "utf-8");
    return { ...DEFAULTS, ...JSON.parse(data) };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Save settings to .smol-agent/settings.json in the given directory.
 * Merges with existing settings.
 */
export async function saveSettings(cwd, settings) {
  const dir = path.join(cwd, SETTINGS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const filepath = path.join(dir, SETTINGS_FILE);

  let existing = {};
  try {
    existing = JSON.parse(await fs.readFile(filepath, "utf-8"));
  } catch { /* no existing file */ }

  const merged = { ...existing, ...settings };
  await fs.writeFile(filepath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
  return merged;
}

/**
 * Save a single setting key.
 */
export async function saveSetting(cwd, key, value) {
  return saveSettings(cwd, { [key]: value });
}
