/**
 * Unit tests for loop detection in the agent.
 */

import { describe, test, expect } from '@jest/globals';
import { detectToolLoop } from '../../src/agent.js';

describe('detectToolLoop', () => {
  test('returns 0 for too few signatures', () => {
    expect(detectToolLoop(['a', 'b', 'c'], 0)).toBe(0);
  });

  test('returns 0 for diverse tool calls', () => {
    const sigs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(detectToolLoop(sigs, 0)).toBe(0);
  });

  test('returns 1 when same call appears 4+ times', () => {
    const sigs = ['ls', 'ls', 'ls', 'ls', 'read', 'grep'];
    expect(detectToolLoop(sigs, 0)).toBe(1);
  });

  test('returns 1 for low diversity (< 30% unique)', () => {
    // 2 unique out of 8 = 25%
    const sigs = ['ls', 'read', 'ls', 'read', 'ls', 'read', 'ls', 'read'];
    expect(detectToolLoop(sigs, 0)).toBe(1);
  });

  test('returns 2 when same call appears 7+ times', () => {
    const sigs = ['ls', 'ls', 'ls', 'ls', 'ls', 'ls', 'ls', 'read'];
    expect(detectToolLoop(sigs, 0)).toBe(2);
  });

  test('returns 2 for low diversity after a nudge', () => {
    // < 20% unique (1 out of 6) and already nudged once
    const sigs = ['ls', 'ls', 'ls', 'ls', 'ls', 'ls'];
    expect(detectToolLoop(sigs, 1)).toBe(2);
  });

  test('returns 0 after nudge if calls become diverse', () => {
    const sigs = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(detectToolLoop(sigs, 1)).toBe(0);
  });

  test('handles the exact scenario from user report', () => {
    // Simulate: ls repeated many times with a few read_file calls
    const lsSig = JSON.stringify({ n: 'run_command', a: { command: 'ls' } });
    const readSig = JSON.stringify({ n: 'read_file', a: { filePath: 'package.json' } });
    // Window of 12 recent calls, mostly ls
    const sigs = [
      lsSig, lsSig, readSig, lsSig, lsSig, lsSig,
      lsSig, lsSig, lsSig, lsSig, readSig, lsSig,
    ];
    // First check with no prior nudges — should be severity 2 (ls appears 10/12 times)
    expect(detectToolLoop(sigs, 0)).toBe(2);
  });
});