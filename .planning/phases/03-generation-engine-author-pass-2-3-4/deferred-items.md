# Phase 03 — Deferred Items

Items discovered during Plan 03-09 execution that are out of scope per the
GSD scope-boundary rule (only auto-fix issues directly caused by the
current task's changes).

## Pre-existing pass_2 authoring test failures

The following tests in `apps/generation-engine/tests/passes/pass_2/test_authoring.py`
fail with `openai.APITimeoutError` — they retry through the transient-HTTP
backoff loop and the second HTTP call appears to escape pytest-httpx mocking,
hitting the real OpenAI client and timing out:

- `test_author_one_happy_path`
- `test_author_one_forbidden_phrase_then_recovers`
- `test_author_one_examples_hallucination_then_recovers`
- `test_author_one_retry_uses_build_retry_user_prompt`
- `test_author_one_uses_universal_agent_for_universal_tool`

These failures pre-date Plan 03-09 (they were present in the squashed
`a7f3109 feat(engine): ship Phase 2 architect Pass 0+1 (squash 56 commits)`
baseline). Plan 03-09 does NOT modify any pass_2 source or test files;
verified via `git log 8338242..HEAD -- apps/generation-engine/.../pass_2/`.

Suggested follow-up: separate plan to either (a) make pytest-httpx mock the
retry attempts more aggressively, or (b) inject a fake transport that
short-circuits before the openai client falls back to its real HTTP layer.

All 240 Pass 3 tests pass; all 122 non-authoring Pass 2 tests pass.
