// apps/web/src/components/admin-ui/__tests__/index.test.tsx
//
// Phase 3 / C1 — barrel exports smoke-test. Asserts the kit re-exports
// every primitive C2/C3/C4 will import. If a primitive is renamed or
// removed by accident, this test fails loudly.

import { describe, it, expect } from 'vitest';

import * as kit from '../index';

describe('admin-ui barrel', () => {
  it('exports the full primitive set', () => {
    const expected = [
      // Re-exports of canon main kit.
      'Btn',
      'Card',
      'Badge',
      'Icon',
      'SectionLabel',
      // Admin-specific.
      'Pill',
      'Sparkline',
      'Toggle',
      'PageHead',
      'KPI',
      'EmptyState',
      'IncidentBanner',
      'Table',
      'Tabs',
      'FilterBar',
      'AdminTopBar',
      'RowAction',
      'Toolbar',
      'Kbd',
      'StatusPill',
    ];
    for (const name of expected) {
      expect((kit as unknown as Record<string, unknown>)[name]).toBeDefined();
    }
  });
});
