# Friday Demo Cadence (OPS-01)

**Decision drivers:** OPS-01, RESEARCH §Pitfall #23 (velocity death spiral),
implementation-plan §11.1 ("Demo-driven development. Каждую пятницу EOD —
5-минутное демо новой capability. Нельзя записать → не done").

## Why this exists

Solo founders without external accountability drift. Friday demos are a
forcing function: **"if I can't show what shipped this week, I haven't
shipped."** Demos are not optional and not negotiable.

## Cadence (W1–W10 sprint plan)

| Day        | Activity                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------- |
| Mon–Thu    | Record a 1-min Loom of the latest capability landed. Raw clips into `demos/raw/$(date +%Y-%m-%d)/`. |
| Friday EOD (16:00) | Edit clips into a 5-min weekly demo video. Friday is **editing-only**, not feature work — that's how the cadence stays sustainable. |
| Saturday   | Post the demo video to Discord MCP server. Post-launch (W9+): public on YouTube + Twitter.        |

## What counts as a demo

- ✅ A new feature working end-to-end (paste URL → see result).
- ✅ A new internal capability (a Pass passing on a real spec, a runtime metric
  improving, a measurable quality-score uplift) — internal-week demos count.
- ❌ "I rebuilt the same thing differently" does NOT count.
- ❌ "Almost works" does NOT count. Show the working path or show nothing.

## When demos slip

Per Pitfall #23, the velocity death spiral starts when "I'll just push this
one feature first" wins three weeks in a row.

- **Missing 1 Friday:** yellow flag. Note the reason in the next-week plan.
- **Missing 2 Fridays in a row:** red flag → trigger a 24h pause + retro
  before continuing. Identify the structural cause; do not just push harder.

## Recording setup

- Loom or QuickTime screen recording (no editing tools required).
- Voice-over OK; written subtitle overlay OK (for non-voice clips).
- 1080p; landscape; 30fps.
- Background tabs / chats / personal info closed before recording.

## Outputs storage

| Path                          | Lifetime                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `demos/raw/YYYY-MM-DD/*.mov`  | Gitignored. Only the final cut is kept; raw clips deleted after weekly edit.   |
| `demos/weekly/YYYY-WW.mp4`    | Final 5-min cut. Committed to repo via `git lfs` if > 50 MB; otherwise direct. |

## Post-launch evolution (W10+)

After public launch, the demo cadence transitions to:

- Public Friday changelog post (Discord + Twitter) — keeps the cadence even
  when individual weeks have less to show on video.
- The internal 5-min Friday cut becomes optional but recommended for
  retrospective use ("what did we ship in Q3?").
