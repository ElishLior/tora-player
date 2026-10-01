# Tora Player feature map

Baseline for every feature: Launch, Doctor and the "Do not drive" list in `../SKILL.md`. Drive as a guest. Report each feature as pass, fail, or skipped with the reason (for example "no catalog data in a UI-only run").

| Feature | File | Spec | Preconditions |
|---|---|---|---|
| Catalog and navigation | `catalog.md` | `tests/e2e/smoke.spec.ts` | catalog data for the lessons-list test |
| Playback | `playback.md` | `tests/e2e/player-behavior.spec.ts` | catalog data |
| Offline downloads | `offline.md` | `tests/e2e/offline-download.spec.ts` | a deployed URL for the device-file test |

Not mapped yet: the guest library (bookmarks, notes, `/he/me`) has no spec, so drive it with the browser tool. Admin upload and publishing need an isolated Supabase project and R2 bucket, which do not exist, so they cannot be verified without touching production.

A feature file says what the feature is, how a listener reaches it, how to drive it, and what goes wrong.
