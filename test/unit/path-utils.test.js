/**
 * Unit tests for path-utils module.
 *
 * Tests the jail boundary security logic:
 * - resolveJailedPath: Resolving paths within jail
 * - validateJailedPath: Validating paths don't escape jail
 * - Security: Detecting traversal attacks (../, symlinks)
 *
 * Dependencies: @jest/globals, ../../src/path-utils.js, ../test-utils.js,
 *               node:fs, node:path
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { resolveJailedPath, validateJailedPath } from '../../src/path-utils.js';
import { createTempDir, cleanupTempDir, createTestFile } from '../test-utils.js';
import fs from 'node:fs';
import path from 'node:path';

describe('resolveJailedPath', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('resolves simple relative paths', () => {
    const result = resolveJailedPath(tempDir, 'test.txt');
    expect(result).toBe(fs.realpathSync(tempDir) + path.sep + 'test.txt');
  });

  test('resolves nested relative paths', () => {
    const result = resolveJailedPath(tempDir, 'subdir/nested/file.txt');
    expect(result).toBe(path.join(fs.realpathSync(tempDir), 'subdir', 'nested', 'file.txt'));
  });

  test('resolves non-existent nested paths inside the jail', () => {
    const result = resolveJailedPath(tempDir, '.smol-agent/skills');
    expect(result.endsWith(path.join('.smol-agent', 'skills'))).toBe(true);
  });

  test('handles absolute paths within jail', () => {
    const absolutePath = path.join(tempDir, 'file.txt');
    const result = resolveJailedPath(tempDir, absolutePath);
    expect(result).toBe(path.join(fs.realpathSync(tempDir), 'file.txt'));
  });

  test('throws on path traversal with ..', () => {
    expect(() => resolveJailedPath(tempDir, '../outside.txt')).toThrow('escapes');
  });

  test('throws on deep path traversal', () => {
    expect(() => resolveJailedPath(tempDir, 'subdir/../../outside.txt')).toThrow('escapes');
  });

  test('throws on absolute path outside jail', () => {
    expect(() => resolveJailedPath(tempDir, '/etc/passwd')).toThrow('escapes');
  });
});

describe('resolveJailedPath symlink handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('handles symlinks pointing inside jail', () => {
    const targetDir = path.join(tempDir, 'target');
    const linkDir = path.join(tempDir, 'link');
    fs.mkdirSync(targetDir);
    createTestFile(targetDir, 'file.txt', 'content');

    try {
      fs.symlinkSync(targetDir, linkDir, 'dir');
      const result = resolveJailedPath(linkDir, 'file.txt');
      expect(result).toContain('file.txt');
    } catch (err) {
      // Symlinks may not be supported on this platform
      if (err.code !== 'EPERM' && err.code !== 'ENOSYS') {
        throw err;
      }
    }
  });

  test('blocks symlinks pointing outside jail', () => {
    const outsideDir = createTempDir('outside-');
    const linkPath = path.join(tempDir, 'escape');

    try {
      fs.symlinkSync(outsideDir, linkPath, 'dir');
      expect(() => resolveJailedPath(tempDir, 'escape/file.txt')).toThrow('escapes');
    } catch (err) {
      // Symlinks may not be supported
      if (err.code !== 'EPERM' && err.code !== 'ENOSYS') {
        throw err;
      }
    } finally {
      cleanupTempDir(outsideDir);
    }
  });
});

describe('validateJailedPath', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('validates existing files', () => {
    createTestFile(tempDir, 'exists.txt', 'content');
    const result = validateJailedPath(tempDir, 'exists.txt');
    expect(result).toBe(path.join(fs.realpathSync(tempDir), 'exists.txt'));
  });

  test('throws for non-existent files', () => {
    expect(() => validateJailedPath(tempDir, 'nonexistent.txt')).toThrow('does not exist');
  });

  test('throws for path traversal attempts', () => {
    expect(() => validateJailedPath(tempDir, '../outside.txt')).toThrow('escapes');
  });
});
