/**
 * Unit tests for context docs (save_context tool + loadContextDocs)
 */

import { describe, test, assertEqual, assertTrue, assertContains, createTempDir, cleanupTempDir, readTestFile } from '../test-utils.js';
import fs from 'node:fs';
import path from 'node:path';
import registry from '../../src/tools/registry.js';
import { loadContextDocs } from '../../src/tools/context_docs.js';

export default async function runContextDocsTests() {
  // save_context uses the global jail directory, so we must set it per test
  const savedJail = registry.getJailDirectory();

  await describe('save_context tool', async () => {
    await test('creates doc file with sanitized name', async () => {
      const tmp = createTempDir();
      registry.setJailDirectory(tmp);
      const result = await registry.execute('save_context', {
        path: 'src/tools',
        summary: '# Tools\n- registry.js: tool dispatch',
      });

      assertTrue(result.success, 'Should succeed');
      const content = readTestFile(path.join(tmp, '.smol-agent', 'docs'), 'src-tools.md');
      assertContains(content, '<!-- path: src/tools');
      assertContains(content, '# Tools');
      assertContains(content, 'registry.js: tool dispatch');
      cleanupTempDir(tmp);
    });

    await test('overwrites existing doc for same path', async () => {
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

      const content = readTestFile(path.join(tmp, '.smol-agent', 'docs'), 'src-agent.js.md');
      assertContains(content, 'Version 2');
      assertTrue(!content.includes('Version 1'), 'Should not contain old content');
      cleanupTempDir(tmp);
    });

    await test('strips leading slashes and dots from path', async () => {
      const tmp = createTempDir();
      registry.setJailDirectory(tmp);
      await registry.execute('save_context', {
        path: '/./src/utils/',
        summary: 'Utils',
      });

      const files = fs.readdirSync(path.join(tmp, '.smol-agent', 'docs'));
      assertTrue(files.includes('src-utils.md'), `Expected src-utils.md, got ${files}`);
      cleanupTempDir(tmp);
    });

    await test('returns error for empty path', async () => {
      const tmp = createTempDir();
      registry.setJailDirectory(tmp);
      const result = await registry.execute('save_context', {
        path: '///',
        summary: 'Bad',
      });

      assertTrue(result.error, 'Should return error for empty sanitized path');
      cleanupTempDir(tmp);
    });

    await test('does not require approval', async () => {
      assertTrue(!registry.requiresApproval('save_context'), 'save_context should not require approval');
    });
  });

  await describe('loadContextDocs', async () => {
    await test('lists available docs without .md extension', async () => {
      const tmp = createTempDir();
      const docsDir = path.join(tmp, '.smol-agent', 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'src-tools.md'), 'doc1');
      fs.writeFileSync(path.join(docsDir, 'src-agent.md'), 'doc2');

      const docs = await loadContextDocs(tmp);
      assertTrue(docs.includes('src-tools'), 'Should include src-tools');
      assertTrue(docs.includes('src-agent'), 'Should include src-agent');
      assertEqual(docs.length, 2);
      cleanupTempDir(tmp);
    });

    await test('ignores non-.md files', async () => {
      const tmp = createTempDir();
      const docsDir = path.join(tmp, '.smol-agent', 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'src-tools.md'), 'doc');
      fs.writeFileSync(path.join(docsDir, 'notes.txt'), 'ignored');

      const docs = await loadContextDocs(tmp);
      assertEqual(docs.length, 1);
      assertEqual(docs[0], 'src-tools');
      cleanupTempDir(tmp);
    });

    await test('returns empty array when dir missing', async () => {
      const tmp = createTempDir();
      const docs = await loadContextDocs(tmp);
      assertEqual(docs.length, 0);
      cleanupTempDir(tmp);
    });
  });

  // Restore original jail directory
  registry.setJailDirectory(savedJail);
}
