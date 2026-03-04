/**
 * Unit tests for path-utils module
 * Tests the jail boundary security logic
 */

import { describe, test, assertEqual, assertTrue, assertThrows, createTempDir, cleanupTempDir, createTestFile } from '../test-utils.js';
import { resolveJailedPath, validateJailedPath } from '../../src/path-utils.js';
import fs from 'node:fs';
import path from 'node:path';

export default async function runPathUtilsTests() {
  let tempDir;
  
  await describe('resolveJailedPath', async () => {
    await test('resolves simple relative paths', async () => {
      tempDir = createTempDir();
      const result = resolveJailedPath(tempDir, 'test.txt');
      assertEqual(result, path.join(tempDir, 'test.txt'));
      cleanupTempDir(tempDir);
    });

    await test('resolves nested relative paths', async () => {
      tempDir = createTempDir();
      const result = resolveJailedPath(tempDir, 'subdir/nested/file.txt');
      assertEqual(result, path.join(tempDir, 'subdir', 'nested', 'file.txt'));
      cleanupTempDir(tempDir);
    });

    await test('handles absolute paths within jail', async () => {
      tempDir = createTempDir();
      const absolutePath = path.join(tempDir, 'file.txt');
      const result = resolveJailedPath(tempDir, absolutePath);
      assertEqual(result, absolutePath);
      cleanupTempDir(tempDir);
    });

    await test('throws on path traversal with ..', async () => {
      tempDir = createTempDir();
      await assertThrows(
        () => resolveJailedPath(tempDir, '../outside.txt'),
        'escapes'
      );
      cleanupTempDir(tempDir);
    });

    await test('throws on deep path traversal', async () => {
      tempDir = createTempDir();
      await assertThrows(
        () => resolveJailedPath(tempDir, 'subdir/../../outside.txt'),
        'escapes'
      );
      cleanupTempDir(tempDir);
    });

    await test('throws on absolute path outside jail', async () => {
      tempDir = createTempDir();
      await assertThrows(
        () => resolveJailedPath(tempDir, '/etc/passwd'),
        'escapes'
      );
      cleanupTempDir(tempDir);
    });
  });

  await describe('resolveJailedPath symlink handling', async () => {
    await test('handles symlinks pointing inside jail', async () => {
      tempDir = createTempDir();
      const targetDir = path.join(tempDir, 'target');
      const linkDir = path.join(tempDir, 'link');
      fs.mkdirSync(targetDir);
      createTestFile(targetDir, 'file.txt', 'content');
      
      try {
        fs.symlinkSync(targetDir, linkDir, 'dir');
        const result = resolveJailedPath(linkDir, 'file.txt');
        assertTrue(result.includes('file.txt'));
      } catch (err) {
        // Symlinks may not be supported on this platform
        if (err.code !== 'EPERM' && err.code !== 'ENOSYS') {
          throw err;
        }
      }
      cleanupTempDir(tempDir);
    });

    await test('blocks symlinks pointing outside jail', async () => {
      tempDir = createTempDir();
      const outsideDir = createTempDir('outside-');
      const linkPath = path.join(tempDir, 'escape');
      
      try {
        fs.symlinkSync(outsideDir, linkPath, 'dir');
        await assertThrows(
          () => resolveJailedPath(tempDir, 'escape/file.txt'),
          'escapes'
        );
      } catch (err) {
        // Symlinks may not be supported
        if (err.code !== 'EPERM' && err.code !== 'ENOSYS') {
          throw err;
        }
      }
      cleanupTempDir(tempDir);
      cleanupTempDir(outsideDir);
    });
  });

  await describe('validateJailedPath', async () => {
    await test('validates existing files', async () => {
      tempDir = createTempDir();
      createTestFile(tempDir, 'exists.txt', 'content');
      const result = validateJailedPath(tempDir, 'exists.txt');
      assertEqual(result, path.join(tempDir, 'exists.txt'));
      cleanupTempDir(tempDir);
    });

    await test('throws for non-existent files', async () => {
      tempDir = createTempDir();
      await assertThrows(
        () => validateJailedPath(tempDir, 'nonexistent.txt'),
        'does not exist'
      );
      cleanupTempDir(tempDir);
    });

    await test('throws for path traversal attempts', async () => {
      tempDir = createTempDir();
      await assertThrows(
        () => validateJailedPath(tempDir, '../outside.txt'),
        'escapes'
      );
      cleanupTempDir(tempDir);
    });
  });
}