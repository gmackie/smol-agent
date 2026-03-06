/**
 * Unit tests for settings module
 * Tests loading and saving settings with security restrictions
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { loadSettings, saveSettings, saveSetting } from '../../src/settings.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

describe('loadSettings', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('returns defaults when no settings file exists', async () => {
    const settings = await loadSettings(tempDir);
    expect(settings.autoApprove).toBe(false);
  });

  test('loads settings from file', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ customSetting: 'value' })
    );

    const settings = await loadSettings(tempDir);
    expect(settings.customSetting).toBe('value');
  });

  test('strips autoApprove from file (security)', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ autoApprove: true, otherSetting: 'value' })
    );

    const settings = await loadSettings(tempDir);
    // autoApprove should be stripped (security: only CLI can set it)
    expect(settings.autoApprove).toBe(false);
    expect(settings.otherSetting).toBe('value');
  });

  test('merges with defaults', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ newKey: 'newValue' })
    );

    const settings = await loadSettings(tempDir);
    expect(settings.autoApprove).toBe(false); // From defaults
    expect(settings.newKey).toBe('newValue'); // From file
  });

  test('handles malformed JSON', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      '{ invalid json }'
    );

    const settings = await loadSettings(tempDir);
    // Should return defaults on error
    expect(settings.autoApprove).toBe(false);
  });
});

describe('saveSettings', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('creates settings directory if missing', async () => {
    // No .smol-agent directory exists
    await saveSettings(tempDir, { test: 'value' });

    const settingsPath = path.join(tempDir, '.smol-agent', 'settings.json');
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  test('writes settings to file', async () => {
    await saveSettings(tempDir, { myKey: 'myValue' });

    const content = fs.readFileSync(
      path.join(tempDir, '.smol-agent', 'settings.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed.myKey).toBe('myValue');
  });

  test('merges with existing settings', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ existing: 'kept', override: 'old' })
    );

    await saveSettings(tempDir, { override: 'new', added: 'extra' });

    const content = fs.readFileSync(
      path.join(tempDir, '.smol-agent', 'settings.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed.existing).toBe('kept');
    expect(parsed.override).toBe('new');
    expect(parsed.added).toBe('extra');
  });

  test('returns merged settings', async () => {
    const result = await saveSettings(tempDir, { key: 'value' });
    expect(result.key).toBe('value');
  });
});

describe('saveSetting', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  test('saves single key-value pair', async () => {
    await saveSetting(tempDir, 'singleKey', 'singleValue');

    const content = fs.readFileSync(
      path.join(tempDir, '.smol-agent', 'settings.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed.singleKey).toBe('singleValue');
  });

  test('preserves existing settings', async () => {
    const settingsDir = path.join(tempDir, '.smol-agent');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify({ otherKey: 'otherValue' })
    );

    await saveSetting(tempDir, 'newKey', 'newValue');

    const content = fs.readFileSync(
      path.join(tempDir, '.smol-agent', 'settings.json'),
      'utf-8'
    );
    const parsed = JSON.parse(content);
    expect(parsed.otherKey).toBe('otherValue');
    expect(parsed.newKey).toBe('newValue');
  });
});