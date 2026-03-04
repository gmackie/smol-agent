/**
 * Unit tests for skills module (parseFrontmatter + loadSkills)
 */

import { describe, test, assertEqual, assertTrue, assertContains, createTempDir, cleanupTempDir } from '../test-utils.js';
import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter, loadSkills } from '../../src/skills.js';

export default async function runSkillsTests() {
  await describe('parseFrontmatter', async () => {
    await test('parses name and description', async () => {
      const text = `---
name: debugging
description: Node.js debugging patterns
---

## Steps
1. Add breakpoints`;

      const { data, content } = parseFrontmatter(text);
      assertEqual(data.name, 'debugging');
      assertEqual(data.description, 'Node.js debugging patterns');
      assertContains(content, '## Steps');
    });

    await test('handles colons in values', async () => {
      const text = `---
name: deploy
description: Deploy to prod: use caution
---
Body`;

      const { data } = parseFrontmatter(text);
      assertEqual(data.name, 'deploy');
      assertEqual(data.description, 'Deploy to prod: use caution');
    });

    await test('returns empty data when no frontmatter', async () => {
      const text = '# Just a heading\nSome content';
      const { data, content } = parseFrontmatter(text);
      assertEqual(Object.keys(data).length, 0);
      assertEqual(content, text);
    });

    await test('handles empty frontmatter block', async () => {
      const text = `---
---
Body only`;

      const { data, content } = parseFrontmatter(text);
      assertEqual(Object.keys(data).length, 0);
      assertContains(content, 'Body only');
    });

    await test('handles extra whitespace in keys and values', async () => {
      const text = `---
  name  :  testing
  description  :  Run tests
---
Body`;

      const { data } = parseFrontmatter(text);
      assertEqual(data.name, 'testing');
      assertEqual(data.description, 'Run tests');
    });

    await test('handles windows line endings', async () => {
      const text = "---\r\nname: test\r\ndescription: desc\r\n---\r\nBody";
      const { data, content } = parseFrontmatter(text);
      assertEqual(data.name, 'test');
      assertEqual(data.description, 'desc');
      assertContains(content, 'Body');
    });
  });

  await describe('loadSkills', async () => {
    await test('loads skills from .smol-agent/skills/', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      fs.writeFileSync(path.join(skillsDir, 'debugging.md'), `---
name: debugging
description: Debug Node.js apps
---
Use node --inspect`);

      fs.writeFileSync(path.join(skillsDir, 'testing.md'), `---
name: testing
description: Run and write tests
---
npm test`);

      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 2);

      const names = skills.map(s => s.name).sort();
      assertTrue(names.includes('debugging'), 'Should include debugging');
      assertTrue(names.includes('testing'), 'Should include testing');

      const debug = skills.find(s => s.name === 'debugging');
      assertEqual(debug.description, 'Debug Node.js apps');
      assertEqual(debug.file, 'debugging.md');
      cleanupTempDir(tmp);
    });

    await test('uses filename as fallback name', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      fs.writeFileSync(path.join(skillsDir, 'my-workflow.md'), `---
description: A workflow without a name field
---
Steps here`);

      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 1);
      assertEqual(skills[0].name, 'my-workflow');
      assertEqual(skills[0].description, 'A workflow without a name field');
      cleanupTempDir(tmp);
    });

    await test('handles files without frontmatter', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      fs.writeFileSync(path.join(skillsDir, 'plain.md'), '# Just markdown\nNo frontmatter');

      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 1);
      assertEqual(skills[0].name, 'plain');
      assertEqual(skills[0].description, '');
      cleanupTempDir(tmp);
    });

    await test('ignores non-.md files', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      fs.writeFileSync(path.join(skillsDir, 'skill.md'), '---\nname: real\n---\n');
      fs.writeFileSync(path.join(skillsDir, 'notes.txt'), 'ignored');

      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 1);
      assertEqual(skills[0].name, 'real');
      cleanupTempDir(tmp);
    });

    await test('returns empty array when skills dir missing', async () => {
      const tmp = createTempDir();
      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 0);
      cleanupTempDir(tmp);
    });

    await test('returns empty array when skills dir is empty', async () => {
      const tmp = createTempDir();
      const skillsDir = path.join(tmp, '.smol-agent', 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });

      const skills = await loadSkills(tmp);
      assertEqual(skills.length, 0);
      cleanupTempDir(tmp);
    });
  });
}
