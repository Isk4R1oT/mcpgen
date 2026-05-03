# Phase M-2 — Logic Quarantine Report

## Status: YELLOW

Logic-layer leaks exist in `apps/web/src/lib/jsx-bridge/` (which itself is a
bridge module — see explanation below). Baselines (typecheck + 118 unit tests)
are green. M-3 must remove or rewire the leak files at the same time it deletes
the doomed components, otherwise typecheck breaks the moment M-3 lands.

## Logic-layer UI imports found

The `grep` over `src/lib`, `src/providers`, `src/middleware.ts`, `src/app/api`
returned 5 hits, ALL inside `apps/web/src/lib/jsx-bridge/`:

| File | Line | Import |
|---|---|---|
| `src/lib/jsx-bridge/wrapper.tsx` | 31 | `import { AnonBanner } from '@/components/anon-banner';` |
| `src/lib/jsx-bridge/wrapper.tsx` | 32 | `import { AnonCacheHitBadge, type CacheHitMetadata } from '@/components/anon-cache-hit-badge';` |
| `src/lib/jsx-bridge/wrapper.tsx` | 33 | `import { AnonDeployCta } from '@/components/anon-deploy-cta';` |
| `src/lib/jsx-bridge/wrapper.tsx` | 34 | `import { AnonSignupCta } from '@/components/anon-signup-cta';` |
| `src/lib/jsx-bridge/screens.tsx` | 29 | `import LiveStreamLog from '@/components/live-stream-log';` |

**Context.** `lib/jsx-bridge/` is intentionally a bridge layer: contract §6
(line 389) says "Сохранить, расширить под новые screens". It is not pure
business logic — it has `'use client'` files that compose React components.
However, contract M-2 §1 still mandates that `lib/` never import from
`screen-*.jsx`. These imports are NOT from `screen-*.jsx`, but they ARE from
`@/components/anon-*` and `@/components/live-stream-log`, which Phase M-3 §1
deletes. So while these are not strictly "screen-*.jsx" leaks, they will break
typecheck the moment M-3 deletes the targeted components.

**Outside jsx-bridge: zero leaks.** `src/lib/{api,sse,claude-desktop,...}`,
`src/providers/`, `src/middleware.ts`, and `src/app/api/v1/**` have no UI
imports.

## API-route UI imports found

NONE. `grep` over `src/app/api` for `*.jsx`/`*.tsx` imports or any
`screen-*` / `components/anon-*` / `live-stream` / `mode-banner` paths
returned empty. API routes are clean BFF proxies, as expected.

## Baseline typecheck

PASS. `pnpm typecheck` exits 0 with no errors.

## Baseline tests

PASS. `pnpm test` reports **118 / 118 passing across 15 test files** (1.6s).

Notable suites:
- `tests/middleware-route-gate.test.ts` (9)
- `tests/unit/lib/api/dashboard-client.test.ts` (14)
- `tests/unit/lib/jsx-bridge/loader.test.ts` (2)
- `tests/unit/lib/sse/use-generation-sse.test.ts` (5)
- `tests/unit/lib/quality-badge.test.ts` (10)
- plus 10 others.

## components/ to delete in M-3 + their importers

Importer scan over all of `apps/web/src/`:

| File slated for deletion (M-3 §1) | Importers |
|---|---|
| `components/mode-banner.tsx` | NONE — confirmed dead code (only its own self-reference). Safe to delete. |
| `components/anon-banner.tsx` | `src/lib/jsx-bridge/wrapper.tsx` (line 31) |
| `components/anon-cache-hit-badge.tsx` | `src/lib/jsx-bridge/wrapper.tsx` (line 32) **+** `src/app/generate/[jobId]/quality/_quality-client.tsx` (line 10, type-only `CacheHitMetadata`) |
| `components/anon-deploy-cta.tsx` | `src/lib/jsx-bridge/wrapper.tsx` (line 33) |
| `components/anon-signup-cta.tsx` | `src/lib/jsx-bridge/wrapper.tsx` (line 34) |
| `components/live-stream-log.tsx` | `src/lib/jsx-bridge/screens.tsx` (line 29) |

**One additional surface**: `_quality-client.tsx` re-exports `CacheHitMetadata`
as a type-only import from `anon-cache-hit-badge.tsx`. This is technically a
type leak in a route client (not in `lib/`), but the type will vanish with M-3
and needs to be either rehomed (e.g. into `lib/jsx-bridge/index.ts` or a new
`lib/anon-state/types.ts`) or replaced with an inline type before/during M-3.

## Concerns for M-3

1. **`wrapper.tsx` will fail to typecheck** the moment the four `anon-*`
   components are deleted. M-3 must either:
   - delete `wrapper.tsx` as part of M-3 (it is a bridge to anon-state chrome
     which the new design replaces — likely the right call), OR
   - rewrite `wrapper.tsx` to no-op pass-through during M-3 and let M-4 wire
     real anon chrome from the new zip into it.
   The contract plan M-3 says "не пытаться чинить тесты" — fine — but it does
   need to either remove `wrapper.tsx` or stub it; otherwise even the Next.js
   build itself breaks before tests run.

2. **`screens.tsx` references `LiveStreamLog`.** Same situation. M-3 must
   delete the import (and likely the call site within `screens.tsx`); M-4 will
   wire a new stream surface from the new design.

3. **`_quality-client.tsx` `CacheHitMetadata` type import** must be relocated
   or inlined before deleting `anon-cache-hit-badge.tsx`. Easiest fix: move
   the type into `lib/jsx-bridge/index.ts` or a new shared types module — this
   can be a small commit either at the tail of M-2 or the head of M-3.

4. **`mode-banner.tsx` confirmed dead** — zero importers. Pure delete in M-3.

5. **No leaks in API routes / providers / middleware / rest of `lib/`.** These
   are safe.

## Go / No-go for M-3

**HOLD with a small tactical fix, OR proceed if M-3 author commits to
deleting/stubbing `wrapper.tsx` + `screens.tsx` (LiveStreamLog usage) + relocating
`CacheHitMetadata` type IN THE SAME PR as the component deletes.**

Recommendation: extend M-3's deletion list to include
- `apps/web/src/lib/jsx-bridge/wrapper.tsx` (or rewrite to stub)
- the `LiveStreamLog` import + usage in `apps/web/src/lib/jsx-bridge/screens.tsx`
- relocate `CacheHitMetadata` from `anon-cache-hit-badge.tsx` into
  `lib/jsx-bridge/index.ts` (or inline at the `_quality-client.tsx` call site)

With those covered, M-3 can proceed without violating M-2's quarantine
guarantee. Baselines (typecheck green + 118 tests green) are confirmed and
ready as the pre-M-3 reference point.
