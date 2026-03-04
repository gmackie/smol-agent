/**
 * Unit tests for loop detection in the agent.
 */

import { describe, test, assertEqual } from '../test-utils.js';
import { detectToolLoop } from '../../src/agent.js';

export default async function runLoopDetectionTests() {
  await describe('detectToolLoop', async () => {
    await test('returns 0 for too few signatures', async () => {
      assertEqual(detectToolLoop(['a', 'b', 'c'], 0), 0);
    });

    await test('returns 0 for diverse tool calls', async () => {
      const sigs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      assertEqual(detectToolLoop(sigs, 0), 0);
    });

    await test('returns 1 when same call appears 4+ times', async () => {
      const sigs = ['ls', 'ls', 'ls', 'ls', 'read', 'grep'];
      assertEqual(detectToolLoop(sigs, 0), 1);
    });

    await test('returns 1 for low diversity (< 30% unique)', async () => {
      // 2 unique out of 8 = 25%
      const sigs = ['ls', 'read', 'ls', 'read', 'ls', 'read', 'ls', 'read'];
      assertEqual(detectToolLoop(sigs, 0), 1);
    });

    await test('returns 2 when same call appears 7+ times', async () => {
      const sigs = ['ls', 'ls', 'ls', 'ls', 'ls', 'ls', 'ls', 'read'];
      assertEqual(detectToolLoop(sigs, 0), 2);
    });

    await test('returns 2 for low diversity after a nudge', async () => {
      // < 20% unique (1 out of 6) and already nudged once
      const sigs = ['ls', 'ls', 'ls', 'ls', 'ls', 'ls'];
      assertEqual(detectToolLoop(sigs, 1), 2);
    });

    await test('returns 0 after nudge if calls become diverse', async () => {
      const sigs = ['a', 'b', 'c', 'd', 'e', 'f'];
      assertEqual(detectToolLoop(sigs, 1), 0);
    });

    await test('handles the exact scenario from user report', async () => {
      // Simulate: ls repeated many times with a few read_file calls
      const lsSig = JSON.stringify({ n: 'run_command', a: { command: 'ls' } });
      const readSig = JSON.stringify({ n: 'read_file', a: { filePath: 'package.json' } });
      // Window of 12 recent calls, mostly ls
      const sigs = [
        lsSig, lsSig, readSig, lsSig, lsSig, lsSig,
        lsSig, lsSig, lsSig, lsSig, readSig, lsSig,
      ];
      // First check with no prior nudges — should be severity 2 (ls appears 10/12 times)
      assertEqual(detectToolLoop(sigs, 0), 2);
    });
  });
}

// Run directly
runLoopDetectionTests();
