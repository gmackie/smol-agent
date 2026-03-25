/**
 * Unit tests for context docs (save_context tool + loadContextDocs).
 *
 * Tests the context documentation system:
 * - save_context: Persisting summaries of code areas
 * - loadContextDocs: Loading saved context docs into gatherContext
 * - .smol-agent/docs directory management
 * - Context doc format and parsing
 *
 * Dependencies: @jest/globals, node:fs, node:path,
 *               ../../src/tools/registry.js, ../../src/tools/context_docs.js,
 *               ../test-utils.js
 */
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import registry from '../../src/tools/registry.js';
import { loadContextDocs } from '../../src/tools/context_docs.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

describe('save_context tool', () => {
  let savedJail;

  beforeEach(() => {
    savedJail = registry.getJailDirectory();
  });

  afterEach(() => {
    registry.setJailDirectory(savedJail);
  });

  test('creates doc file with sanitized name', async () => {
    const tmp = createTempDir();
    registry.setJailDirectory(tmp);
    const result = await registry.execute('save_context', {
      path: 'src/tools',
      summary: '# Tools\n- registry.js: tool dispatch',
    });

    expect(result.success).toBe(true);
    const content = fs.readFileSync(path.join(tmp, '.smol-agent', 'docs', 'src-tools.md'), 'utf-8');
    expect(content).toContain('<!-- path: src/tools');
    expect(content).toContain('# Tools');
    expect(content).toContain('registry.js: tool dispatch');
    cleanupTempDir(tmp);
  });

  test('overwrites existing doc for same path', async () => {
    const tmp = createTempDir();
    registry.setJailDirectory(tmp);
    await registry.execute('save_context', {
      path: 'src/agent.js',
      summary: 'Version 1',
    });

    await registry.execute('save_context', {
      path: 'src/agent.js',
      summary: 'Version 2',
    });

    const content = fs.readFileSync(path.join(tmp, '.smol-agent', 'docs', 'src-agent.js.md'), 'utf-8');
    expect(content).toContain('Version 2');
    expect(content).not.toContain('Version 1');
    cleanupTempDir(tmp);
  });

  test('strips leading slashes and dots from path', async () => {
    const tmp = createTempDir();
    registry.setJailDirectory(tmp);
    await registry.execute('save_context', {
      path: '/./src/utils/',
      summary: 'Utils',
    });

    const files = fs.readdirSync(path.join(tmp, '.smol-agent', 'docs'));
    expect(files).toContain('src-utils.md');
    cleanupTempDir(tmp);
  });

  test('returns error for empty path', async () => {
    const tmp = createTempDir();
    registry.setJailDirectory(tmp);
    const result = await registry.execute('save_context', {
      path: '///',
      summary: 'Bad',
    });

    expect(result.error).toBeDefined();
    cleanupTempDir(tmp);
  });

  test('does not require approval', () => {
    expect(registry.requiresApproval('save_context')).toBe(false);
  });
});

describe('loadContextDocs', () => {
  test('lists available docs without .md extension', async () => {
    const tmp = createTempDir();
    const docsDir = path.join(tmp, '.smol-agent', 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'src-tools.md'), 'doc1');
    fs.writeFileSync(path.join(docsDir, 'src-agent.md'), 'doc2');

    const docs = await loadContextDocs(tmp);
    expect(docs).toContain('src-tools');
    expect(docs).toContain('src-agent');
    expect(docs.length).toBe(2);
    cleanupTempDir(tmp);
  });

  test('ignores non-.md files', async () => {
    const tmp = createTempDir();
    const docsDir = path.join(tmp, '.smol-agent', 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(path.join(docsDir, 'src-tools.md'), 'doc');
    fs.writeFileSync(path.join(docsDir, 'notes.txt'), 'ignored');

    const docs = await loadContextDocs(tmp);
    expect(docs.length).toBe(1);
    expect(docs[0]).toBe('src-tools');
    cleanupTempDir(tmp);
  });

  test('returns empty array when dir missing', async () => {
    const tmp = createTempDir();
    const docs = await loadContextDocs(tmp);
    expect(docs.length).toBe(0);
    cleanupTempDir(tmp);
  });
});