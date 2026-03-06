/**
 * Test utilities for smol-agent.
 * Re-exports Jest globals and provides helper functions.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// Re-export Jest globals for convenience
export { describe, test, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';

/**
 * Create a temporary directory for tests
 */
export function createTempDir(prefix = 'smol-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return dir;
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a test file in a directory
 */
export function createTestFile(dir, filename, content) {
  const filePath = path.join(dir, filename);
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Read a test file
 */
export function readTestFile(dir, filename) {
  return fs.readFileSync(path.join(dir, filename), 'utf-8');
}