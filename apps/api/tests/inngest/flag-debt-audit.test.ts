// Unit tests for the flag-debt-audit pure helpers (loadManifest, findOverdue).
// Live GitHub calls are not exercised — covered by manual invoke from the
// Inngest dev server.
import { describe, it, expect } from 'vitest';
import { findOverdue } from '../../src/inngest/functions/flag-debt-audit.js';

describe('findOverdue', () => {
  const today = new Date('2026-08-15T00:00:00Z');

  it('skips kill / perm / ops categories', () => {
    const r = findOverdue(
      {
        flags: [
          { key: 'a_kill', category: 'kill', owner: 'i', created_at: '2026-01-01' },
          { key: 'b_perm', category: 'perm', owner: 'i', created_at: '2026-01-01' },
          { key: 'c_ops', category: 'ops', owner: 'i', created_at: '2026-01-01' },
        ],
      },
      today,
    );
    expect(r).toEqual([]);
  });

  it('flags rollout/exp past expected_removal_at', () => {
    const r = findOverdue(
      {
        flags: [
          {
            key: 'a_rollout',
            category: 'rollout',
            owner: 'i',
            created_at: '2026-01-01',
            expected_removal_at: '2026-08-01', // 14 days ago
          },
          {
            key: 'b_exp',
            category: 'exp',
            owner: 'i',
            created_at: '2026-01-01',
            expected_removal_at: '2026-09-01', // future, ignored
          },
        ],
      },
      today,
    );
    expect(r).toHaveLength(1);
    expect(r[0]?.key).toBe('a_rollout');
    expect(r[0]?.daysOverdue).toBe(14);
  });

  it('skips entries without expected_removal_at', () => {
    const r = findOverdue(
      {
        flags: [
          { key: 'a_rollout', category: 'rollout', owner: 'i', created_at: '2026-01-01' },
        ],
      },
      today,
    );
    expect(r).toEqual([]);
  });
});
