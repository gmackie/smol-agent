/**
 * Simple test utilities for smol-agent.
 * Uses Node.js built-in assert module - no external dependencies needed.
 */

import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

let testCount = 0;
let passCount = 0;
let failCount = 0;
const failures = [];

/**
 * Run a single test case
 */
export async function test(name, fn) {
  testCount++;
  try {
    await fn();
    passCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failCount++;
    failures.push({ name, error: err });
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    if (err.stack) {
      const stackLines = err.stack.split('\n').slice(1, 3);
      stackLines.forEach(line => console.log(`    ${line.trim()}`));
    }
  }
}

/**
 * Create a test suite with a description
 */
export async function describe(name, fn) {
  console.log(`\n${name}`);
  console.log('─'.repeat(name.length));
  await fn();
}

/**
 * Assert equality with detailed diff
 */
export function assertEqual(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
}

/**
 * Assert that a value is truthy
 */
export function assertTrue(value, message) {
  assert.ok(value, message);
}

/**
 * Assert that a value is falsy
 */
export function assertFalse(value, message) {
  assert.ok(!value, message);
}

/**
 * Assert that a function throws
 */
export async function assertThrows(fn, expectedMessage) {
  let threw = false;
  let error;
  try {
    await fn();
  } catch (err) {
    threw = true;
    error = err;
  }
  if (!threw) {
    throw new Error('Expected function to throw, but it did not');
  }
  if (expectedMessage && !error.message.includes(expectedMessage)) {
    throw new Error(`Expected error message to include "${expectedMessage}", got "${error.message}"`);
  }
  return error;
}

/**
 * Assert that a string contains a substring
 */
export function assertContains(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(message || `Expected "${str}" to contain "${substr}"`);
  }
}

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

/**
 * Print test summary and exit with appropriate code
 */
export function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log(`Tests: ${testCount} | Passed: ${passCount} | Failed: ${failCount}`);
  
  if (failures.length > 0) {
    console.log('\nFailures:');
    failures.forEach((f, i) => {
      console.log(`\n${i + 1}. ${f.name}`);
      console.log(`   ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  }
}

/**
 * Run all tests and print summary
 */
export async function runTests(suites) {
  for (const suite of suites) {
    await suite();
  }
  printSummary();
}