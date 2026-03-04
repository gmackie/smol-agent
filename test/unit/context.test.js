/**
 * Unit tests for context gathering (gatherContext)
 * Tests that memories, context docs, and skills are included in output
 */

import { describe, test, assertTrue, assertContains, createTempDir, cleanupTempDir } from '../test-utils.js';
import fs from 'node:fs';
import path from 'node:path';
import { gatherContext } from '../../src/context.js';

export default async function runContextTests() {
  await describe('gatherContext — context docs', async () => {
    await test('includes context docs section when docs exist', async () => {
      const tmp = createTempDir();
      const docsDir = path.join(tmp, '.smol-agent', 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(path.join(docsDir, 'src-tools.md'), '<!-- path: src/tools -->\n\nSummary');

      const ctx = await gatherContext(tmp);
      assertContains(ctx, '## Codebase context docs');
      assertContains(ctx, 'src-tools');
      cleanupTempDir(tmp);
    });

    await test('omits context docs section when no docs', async () => {
      const tmp = createTempDir();
      const ctx = await gatherContext(tmp);
      assertTrue(!ctx.includes('Codebase context docs'), 'Should not include context docs section');
      cleanupTempDir(tmp);
    });
  });

  await describe('gatherContext — skills', async () => {
    await test('includes skills section when skills exist', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'testing.md'), '---\nname: testing\ndescription: How to run tests\n---\nnpm test');

      const ctx = await gatherContext(tmp);
      assertContains(ctx, '## Skills');
      assertContains(ctx, '**testing**');
      assertContains(ctx, 'How to run tests');
      cleanupTempDir(tmp);
    });

    await test('omits skills section when no skills', async () => {
      const tmp = createTempDir();
      const ctx = await gatherContext(tmp);
      assertTrue(!ctx.includes('## Skills'), 'Should not include skills section');
      cleanupTempDir(tmp);
    });

    await test('includes multiple skills', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'debug.md'), '---\nname: debug\ndescription: Debugging\n---\n');
      fs.writeFileSync(path.join(skillsDir, 'deploy.md'), '---\nname: deploy\ndescription: Deployment\n---\n');

      const ctx = await gatherContext(tmp);
      assertContains(ctx, '**debug**');
      assertContains(ctx, '**deploy**');
      cleanupTempDir(tmp);
    });
  });

  await describe('gatherContext — memories', async () => {
    await test('includes memories section when memories exist', async () => {
      const tmp = createTempDir();
      const agentDir = path.join(tmp, '.smol-agent');
      fs.mkdirSync(agentDir, { recursive: true });
      fs.writeFileSync(path.join(agentDir, 'memory.json'), JSON.stringify({
        test_cmd: { value: 'npm test', category: 'project', savedAt: new Date().toISOString() },
      }));

      const ctx = await gatherContext(tmp);
      assertContains(ctx, '## Memories');
      assertContains(ctx, 'test_cmd');
      assertContains(ctx, 'npm test');
      cleanupTempDir(tmp);
    });
  });
}
