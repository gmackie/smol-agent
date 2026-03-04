/**
 * Unit tests for plan-tracker module
 * Tests plan progress tracking functionality
 */

import { describe, test, assertEqual, assertTrue, assertFalse } from '../test-utils.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { getCurrentPlan, hasActivePlan, updatePlanStatus } from '../../src/plan-tracker.js';

// plan-tracker uses hardcoded path, so we need to work in a directory with .smol-agent
export default async function runPlanTrackerTests() {
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'plan-tracker-test-'));
  
  // Create .smol-agent/state directory
  await fs.mkdir(path.join(tempDir, '.smol-agent', 'state'), { recursive: true });
  process.chdir(tempDir);

  await describe('getCurrentPlan', async () => {
    await test('returns null when no plans exist', async () => {
      const result = await getCurrentPlan();
      assertEqual(result, null);
    });

    await test('returns in-progress plan', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': {
          status: 'completed',
          updatedAt: Date.now() - 1000,
        },
        'plan-2.md': {
          status: 'in-progress',
          updatedAt: Date.now(),
          filepath: path.join(tempDir, 'plan-2.md'),
        },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      // Create the plan file for summary extraction
      await fs.writeFile(path.join(tempDir, 'plan-2.md'), `# Plan: Test Plan
## Overview
This is a test plan.
## Implementation Steps
### Step 1: First step
### Step 2: Second step
`);
      
      const result = await getCurrentPlan();
      assertTrue(result !== null);
      assertEqual(result.filename, 'plan-2.md');
      assertEqual(result.details.status, 'in-progress');
    });

    await test('returns pending plan if no in-progress', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': {
          status: 'completed',
          updatedAt: Date.now() - 2000,
        },
        'plan-2.md': {
          status: 'pending',
          updatedAt: Date.now() - 1000,
        },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await getCurrentPlan();
      assertTrue(result !== null);
      assertEqual(result.filename, 'plan-2.md');
    });

    await test('returns most recent completed if no active', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-old.md': {
          status: 'completed',
          updatedAt: Date.now() - 5000,
        },
        'plan-new.md': {
          status: 'completed',
          updatedAt: Date.now(),
        },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await getCurrentPlan();
      assertTrue(result !== null);
      assertEqual(result.filename, 'plan-new.md');
    });
  });

  await describe('hasActivePlan', async () => {
    await test('returns false when no plans exist', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      await fs.writeFile(progressFile, '{}');
      
      const result = await hasActivePlan();
      assertFalse(result);
    });

    await test('returns true when in-progress plan exists', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': { status: 'in-progress', updatedAt: Date.now() },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await hasActivePlan();
      assertTrue(result);
    });

    await test('returns true when pending plan exists', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': { status: 'pending', updatedAt: Date.now() },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await hasActivePlan();
      assertTrue(result);
    });

    await test('returns false when only completed plans exist', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': { status: 'completed', updatedAt: Date.now() },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await hasActivePlan();
      assertFalse(result);
    });
  });

  await describe('updatePlanStatus', async () => {
    await test('returns error for non-existent plan', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      await fs.writeFile(progressFile, '{}');
      
      const result = await updatePlanStatus('nonexistent.md', 'in-progress');
      assertEqual(result.success, false);
      assertEqual(result.error, 'Plan not found');
    });

    await test('updates plan status', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': { status: 'pending', updatedAt: Date.now() - 1000 },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await updatePlanStatus('plan-1.md', 'in-progress');
      assertEqual(result.success, true);
      assertEqual(result.status, 'in-progress');
      
      // Verify persisted
      const content = await fs.readFile(progressFile, 'utf-8');
      const updated = JSON.parse(content);
      assertEqual(updated['plan-1.md'].status, 'in-progress');
    });

    await test('merges additional details', async () => {
      const progressFile = path.join(tempDir, '.smol-agent', 'state', 'plan-progress.json');
      const progress = {
        'plan-1.md': { status: 'in-progress', updatedAt: Date.now() },
      };
      await fs.writeFile(progressFile, JSON.stringify(progress, null, 2));
      
      const result = await updatePlanStatus('plan-1.md', 'completed', { 
        completedAt: '2024-01-01',
        stepsTotal: 5 
      });
      assertEqual(result.success, true);
      
      const content = await fs.readFile(progressFile, 'utf-8');
      const updated = JSON.parse(content);
      assertEqual(updated['plan-1.md'].details.completedAt, '2024-01-01');
      assertEqual(updated['plan-1.md'].details.stepsTotal, 5);
    });
  });

  // Cleanup
  process.chdir(originalCwd);
  await fs.rm(tempDir, { recursive: true });
}