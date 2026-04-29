// apps/cli/tests/inspector.e2e.test.ts
//
// T-2-F3 (Phase 3) RETIRED in Phase 4 D-37.
//
// The Phase 3 hand-rolled `renderServerTs` is gone. Stage E now emits the
// generated server.ts directly via the codegen-templates pipeline, and the
// CLI fetches it through the new `GET /api/v1/generate/{job_id}/output/{relative_path}`
// endpoint (`writeStageEOutput`). The MCP Inspector contract is now covered
// by:
//   - the engine's Stage E `tsc --noEmit` clean gate (plan 04-12 Task 3),
//   - plan 04-13's manual MCP Inspector verification gate.
//
// Keep the file present so test discovery is stable; the only test inside
// is a `test.skip` so the suite reports a clean "skipped" rather than
// missing-test red. Remove cleanly when the test plan catches up.

import { describe, test } from 'bun:test';

describe('Inspector E2E (T-2-F3)', () => {
  test.skip(
    'RETIRED — covered by Stage E tsc gate + plan 04-13 manual gate',
    () => {
      // intentionally empty
    },
  );
});
