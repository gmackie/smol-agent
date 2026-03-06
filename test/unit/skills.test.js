/**
 * Unit tests for skills module (SKILL.md format)
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseFrontmatter,
  validateSkillName,
  validateSkillDescription,
  loadSkills,
  loadSkillResource
} from '../../src/skills.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

describe('validateSkillName', () => {
  test('accepts valid names', () => {
    expect(validateSkillName('debugging').valid).toBe(true);
    expect(validateSkillName('pdf-processing').valid).toBe(true);
    expect(validateSkillName('test123').valid).toBe(true);
    expect(validateSkillName('a').valid).toBe(true);
    expect(validateSkillName('abc-123-xyz').valid).toBe(true);
  });

  test('rejects names with uppercase', () => {
    const result = validateSkillName('Debugging');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('lowercase');
  });

  test('rejects names starting with hyphen', () => {
    const result = validateSkillName('-debugging');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('start');
  });

  test('rejects names ending with hyphen', () => {
    const result = validateSkillName('debugging-');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('end');
  });

  test('rejects names with consecutive hyphens', () => {
    const result = validateSkillName('debug--mode');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('consecutive');
  });

  test('rejects names over 64 chars', () => {
    const longName = 'a'.repeat(65);
    const result = validateSkillName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('64');
  });

  test('rejects empty name', () => {
    const result = validateSkillName('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });
});

describe('validateSkillDescription', () => {
  test('accepts valid descriptions', () => {
    expect(validateSkillDescription('A simple description').valid).toBe(true);
    expect(validateSkillDescription('a').valid).toBe(true);
  });

  test('rejects empty description', () => {
    const result = validateSkillDescription('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('required');
  });

  test('rejects description over 1024 chars', () => {
    const longDesc = 'a'.repeat(1025);
    const result = validateSkillDescription(longDesc);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('1024');
  });
});

describe('parseFrontmatter', () => {
  test('parses name and description', () => {
    const text = `---
name: debugging
description: Node.js debugging patterns
---

## Steps
1. Add breakpoints`;

    const { data, content } = parseFrontmatter(text);
    expect(data.name).toBe('debugging');
    expect(data.description).toBe('Node.js debugging patterns');
    expect(content).toContain('## Steps');
  });

  test('handles colons in values', () => {
    const text = `---
name: deploy
description: Deploy to prod: use caution
---
Body`;

    const { data } = parseFrontmatter(text);
    expect(data.name).toBe('deploy');
    expect(data.description).toBe('Deploy to prod: use caution');
  });

  test('strips quotes from values', () => {
    const text = `---
name: "my-skill"
description: 'A quoted description'
---
Body`;

    const { data } = parseFrontmatter(text);
    expect(data.name).toBe('my-skill');
    expect(data.description).toBe('A quoted description');
  });

  test('parses allowed-tools as array', () => {
    const text = `---
name: test
description: Testing
allowed-tools: Bash(python:*) Read Write
---
Body`;

    const { data } = parseFrontmatter(text);
    expect(data.name).toBe('test');
    expect(Array.isArray(data['allowed-tools'])).toBe(true);
    expect(data['allowed-tools'].join(' ')).toContain('Bash');
  });

  test('parses nested metadata', () => {
    const text = `---
name: pdf-processing
description: PDF processing skill
metadata:
  author: acme-corp
  version: "1.0"
---
Body`;

    const { data } = parseFrontmatter(text);
    expect(data.name).toBe('pdf-processing');
    expect(data.metadata.author).toBe('acme-corp');
    expect(data.metadata.version).toBe('1.0');
  });

  test('returns empty data when no frontmatter', () => {
    const text = '# Just a heading\nSome content';
    const { data, content } = parseFrontmatter(text);
    expect(Object.keys(data).length).toBe(0);
    expect(content).toBe(text);
  });

  test('handles empty frontmatter block', () => {
    const text = `---
---
Body only`;

    const { data, content } = parseFrontmatter(text);
    expect(Object.keys(data).length).toBe(0);
    expect(content).toContain('Body only');
  });
});

describe('loadSkills (SKILL.md format)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('loads SKILL.md from subdirectories', async () => {
    // Create skill in standard format: skills/debugging/SKILL.md
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    const skillDir = path.join(skillsDir, 'debugging');
    fs.mkdirSync(skillDir, { recursive: true });

    const skillContent = `---
name: debugging
description: Debug Node.js applications
license: MIT
---

# Debugging Skill

Use these patterns for debugging Node.js apps.`;

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillContent);

    const skills = await loadSkills(tempDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('debugging');
    expect(skills[0].description).toBe('Debug Node.js applications');
    expect(skills[0].license).toBe('MIT');
    expect(skills[0].source).toBe('local');
    expect(skills[0].path).toContain('debugging');
  });

  test('detects resource subdirectories', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    const skillDir = path.join(skillsDir, 'testing');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });

    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: testing
description: Test skill with resources
---
Body`);
    fs.writeFileSync(path.join(skillDir, 'scripts', 'run.sh'), '#!/bin/bash');
    fs.writeFileSync(path.join(skillDir, 'references', 'guide.md'), '# Guide');

    const skills = await loadSkills(tempDir);
    expect(skills.length).toBe(1);
    expect(skills[0].hasScripts).toBe(true);
    expect(skills[0].hasReferences).toBe(true);
    expect(skills[0].hasAssets).toBe(false);
  });

  test('uses directory name as default name', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    const skillDir = path.join(skillsDir, 'my-custom-skill');
    fs.mkdirSync(skillDir, { recursive: true });

    // SKILL.md without explicit name field
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
description: A skill without explicit name
---
Body`);

    const skills = await loadSkills(tempDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('my-custom-skill');
  });

  test('loads legacy flat .md files', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Create legacy format skill (flat .md file)
    fs.writeFileSync(path.join(skillsDir, 'legacy-skill.md'), `---
name: legacy-skill
description: A legacy format skill
---
Body`);

    const skills = await loadSkills(tempDir);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe('legacy-skill');
  });

  test('prefers standard format over legacy', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    // Standard format
    const skillDir = path.join(skillsDir, 'my-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: my-skill
description: Standard format
---
Standard body`);

    // Legacy format
    fs.writeFileSync(path.join(skillsDir, 'my-skill.md'), `---
name: my-skill
description: Legacy format
---
Legacy body`);

    const skills = await loadSkills(tempDir);
    expect(skills.length).toBe(1);
    // Standard format should win
    expect(skills[0].description).toBe('Standard format');
  });
});

describe('loadSkillResource', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('loads resource from skill directory', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-skill
description: Test
---
Body`);
    fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'scripts', 'run.sh'), '#!/bin/bash\necho "test"');

    const resource = await loadSkillResource(tempDir, 'test-skill', 'scripts/run.sh');
    expect(resource).toContain('echo');
  });

  test('returns null for missing resource', async () => {
    const skillsDir = path.join(tempDir, '.smol-agent', 'skills');
    const skillDir = path.join(skillsDir, 'test-skill');
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---
name: test-skill
description: Test
---
Body`);

    const resource = await loadSkillResource(tempDir, 'test-skill', 'missing/file.txt');
    expect(resource).toBeNull();
  });
});