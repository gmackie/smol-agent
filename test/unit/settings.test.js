/**
 * Unit tests for settings module
 * Tests settings load/save functionality
 */

import { describe, test, assertEqual, assertTrue } from '../test-utils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { loadSettings, saveSettings, saveSetting } from '../../src/settings.js';

export default async function runSettingsTests() {
  await describe('loadSettings', async () => {
    await test('returns defaults when no settings file exists', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        const settings = await loadSettings(tempDir);
        assertEqual(settings.autoApprove, false);
        assertTrue(typeof settings === 'object');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    await test('loads settings from file', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        const settingsDir = path.join(tempDir, '.smol-agent');
        await fs.mkdir(settingsDir, { recursive: true });
        await fs.writeFile(
          path.join(settingsDir, 'settings.json'),
          JSON.stringify({ autoApprove: true, customSetting: 'value' })
        );
        
        const settings = await loadSettings(tempDir);
        assertEqual(settings.autoApprove, true);
        assertEqual(settings.customSetting, 'value');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    await test('merges with defaults for partial settings', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        const settingsDir = path.join(tempDir, '.smol-agent');
        await fs.mkdir(settingsDir, { recursive: true });
        await fs.writeFile(
          path.join(settingsDir, 'settings.json'),
          JSON.stringify({ customSetting: 42 })
        );
        
        const settings = await loadSettings(tempDir);
        assertEqual(settings.autoApprove, false); // default
        assertEqual(settings.customSetting, 42);   // from file
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });
  });

  await describe('saveSettings', async () => {
    await test('creates settings directory if needed', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        await saveSettings(tempDir, { autoApprove: true });
        
        const stat = await fs.stat(path.join(tempDir, '.smol-agent'));
        assertTrue(stat.isDirectory());
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    await test('writes settings file', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        await saveSettings(tempDir, { autoApprove: true, theme: 'dark' });
        
        const content = await fs.readFile(
          path.join(tempDir, '.smol-agent', 'settings.json'),
          'utf-8'
        );
        const parsed = JSON.parse(content);
        assertEqual(parsed.autoApprove, true);
        assertEqual(parsed.theme, 'dark');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    await test('merges with existing settings', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        // Write initial settings
        await saveSettings(tempDir, { settingA: 'a', settingB: 'b' });
        // Update one setting
        await saveSettings(tempDir, { settingB: 'updated' });
        
        const content = await fs.readFile(
          path.join(tempDir, '.smol-agent', 'settings.json'),
          'utf-8'
        );
        const parsed = JSON.parse(content);
        assertEqual(parsed.settingA, 'a');        // preserved
        assertEqual(parsed.settingB, 'updated');  // updated
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });
  });

  await describe('saveSetting', async () => {
    await test('saves single setting', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        await saveSetting(tempDir, 'myKey', 'myValue');
        
        const content = await fs.readFile(
          path.join(tempDir, '.smol-agent', 'settings.json'),
          'utf-8'
        );
        const parsed = JSON.parse(content);
        assertEqual(parsed.myKey, 'myValue');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });

    await test('preserves existing settings when saving single key', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'settings-test-'));
      try {
        await saveSettings(tempDir, { existingKey: 'existing' });
        await saveSetting(tempDir, 'newKey', 'newValue');
        
        const content = await fs.readFile(
          path.join(tempDir, '.smol-agent', 'settings.json'),
          'utf-8'
        );
        const parsed = JSON.parse(content);
        assertEqual(parsed.existingKey, 'existing');
        assertEqual(parsed.newKey, 'newValue');
      } finally {
        await fs.rm(tempDir, { recursive: true });
      }
    });
  });
}