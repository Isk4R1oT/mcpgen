// apps/web/src/stores/__tests__/error-mode.test.ts
//
// Foundation Phase 0 — Smoke test for the error-mode Zustand store.
// Verifies the canon `useErrorMode()` semantics: default 'none', `setMode`
// updates state, all 5 ErrorMode variants are accepted.

import { beforeEach, describe, expect, it } from 'vitest';

import { useErrorMode, type ErrorMode } from '@/stores/error-mode';

describe('stores/error-mode', () => {
  beforeEach(() => {
    // Reset the store between tests — Zustand keeps state across describe blocks.
    useErrorMode.setState({ mode: 'none' });
  });

  it('defaults to "none"', () => {
    expect(useErrorMode.getState().mode).toBe('none');
  });

  it('setMode updates state', () => {
    const { setMode } = useErrorMode.getState();
    setMode('spec-fail');
    expect(useErrorMode.getState().mode).toBe('spec-fail');
  });

  it('accepts all canon error modes', () => {
    const modes: ErrorMode[] = [
      'none',
      'spec-fail',
      'auth-fail',
      'deploy-fail',
      'rate-limit',
    ];
    const { setMode } = useErrorMode.getState();
    for (const m of modes) {
      setMode(m);
      expect(useErrorMode.getState().mode).toBe(m);
    }
  });

  it('setMode is stable (referentially identical across reads)', () => {
    const a = useErrorMode.getState().setMode;
    const b = useErrorMode.getState().setMode;
    expect(a).toBe(b);
  });
});
