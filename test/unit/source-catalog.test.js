import { describe, test, expect } from '@jest/globals';
import { resolveSourceReference } from '../../src/source-catalog.js';

describe('resolveSourceReference', () => {
  test('resolves a built-in alias', () => {
    const resolved = resolveSourceReference('vercel');

    expect(resolved.alias).toBe('vercel');
    expect(resolved.url).toBe('https://github.com/vercel-labs/agent-skills');
    expect(resolved.id).toBe('src_vercel');
  });

  test('resolves a user-defined alias from sourceCatalog', () => {
    const resolved = resolveSourceReference('design-team', {
      sourceCatalog: {
        'design-team': {
          url: 'git@github.com:acme/design-agent-skills.git',
          label: 'Design Team Skills',
        },
      },
    });

    expect(resolved.alias).toBe('design-team');
    expect(resolved.url).toBe('git@github.com:acme/design-agent-skills.git');
    expect(resolved.id).toBe('src_design_team');
  });

  test('treats a direct git url as a source reference', () => {
    const resolved = resolveSourceReference('https://github.com/acme/custom-skills.git');

    expect(resolved.alias).toBeNull();
    expect(resolved.url).toBe('https://github.com/acme/custom-skills.git');
    expect(resolved.id.startsWith('src_')).toBe(true);
  });
});
