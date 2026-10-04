# Tora playback: two authorized fixes

Date: 2026-10-04. Reviewable, uncommitted working-tree patch.

## Workspace and scope

- Verified cwd: `/Users/liorelisha/.t3/worktrees/Tora player/codex-playback-reliability-fixes`.
- Verified branch: `codex/playback-reliability-fixes`.
- Initial status was clean. Initial and final HEAD: `7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a`.
- Read this worktree's full `CLAUDE.md`, main checkout's `AGENTS.md`, TDD skill and its `tests.md`/`mocking.md`, research report and scratch regression fixtures.
- No nested delegation. All code/test writes and dependency installation occurred in the inherited worktree. Main checkout received no writes.
- Only L1 and L3 changed. No duration/completion policy, skip interval, network autorecovery policy, holiday title, production environment/data, or deployment changes.
- No extraction, new dependency, lockfile edit, commit, push, or PR.

## Files changed

1. `src/lib/audio-controller.ts:311`: cancel a pending retry when the current engine reports `playing`. Keep recovery attempt accounting and the existing ten-second recovery threshold.
2. `src/lib/audio-controller.test.ts:146`: fake retry clock helper and four behavior tests through the public controller and real engine/store.
3. `src/hooks/use-media-session.ts:68`: for duration <= 0, call `setPositionState({})` inside the existing try/catch. Positive duration follows the existing position update path.
4. `src/hooks/use-media-session.test.ts`: new isolated tests through `useMediaSession()` and real store actions/subscriptions. Cover clear/restore, missing or throwing position API, absent Media Session, and effect cleanup.

The empty dictionary clears position state in the W3C Media Session draft, section 5: https://www.w3.org/TR/mediasession/#dom-mediasession-setpositionstate. Verified the source during implementation.

## Test-first evidence

### L1 vertical slice

Command: `env -i PATH="$PATH" CI=true npm test -- src/lib/audio-controller.test.ts -t 'keeps successful explicit resume'`.

- RED, exit 1: one failed, 21 skipped. `keeps successful explicit resume uninterrupted when an old error retry is due` expected `load()` call count 1, received 2 after the 1000 ms deadline.
- Sequence: play at 100 seconds, media error, pause, explicit play, successful metadata/playback, live position 105 seconds, advance the fake clock.
- Minimal fix: one `clearRetry()` call in the successful current-track playback branch.
- GREEN command: `env -i PATH="$PATH" CI=true npm test -- src/lib/audio-controller.test.ts`. Exit 0, 22 passed immediately after the fix.
- Assertions also preserve the live position, play-call count, selected lesson, audible intent, and one audio element.

### L3 vertical slice

Command: `env -i PATH="$PATH" CI=true npm test -- src/hooks/use-media-session.test.ts`.

- Initial harness attempt failed before any test: Next Intl navigation's ESM import could not resolve `next/navigation`. This was a harness error, not RED behavior evidence.
- Added a narrow external `next-intl/navigation` mock. Application modules, site identity, controller, store, and subscription remain real.
- RED, exit 1: one failed. The regression expected the last `setPositionState` argument `{}`. It received the old `{ duration: 600, playbackRate: 1, position: 120 }` instead.
- Minimal fix: clear unknown-duration position state inside the API exception guard.
- GREEN with the same command: exit 0, one passed immediately after the fix. After duration becomes 900, the session receives position 45 and playback rate 1.

### Preservation tests

- Valid errors still retry at 1000/2000/4000 ms, restore position 100, and stop after three retries. Brief successful playback does not reset the budget.
- A due retry does not resume paused intent or reload a newly selected track.
- Missing/throwing `setPositionState` does not stop metadata or duration updates. Absent Media Session is safe. Effect cleanup stops later position updates.
- One initial preservation-test run had 68 passed and one failed because it reused the previous test's track identity and recovery budget. Gave that case its own track identity. No additional production change was necessary.

## Final checks

Dependencies were absent. `env -i PATH="$PATH" CI=true NEXT_TELEMETRY_DISABLED=1 npm ci` succeeded: 613 packages installed. It reported 29 existing audit findings (3 low, 5 moderate, 19 high, 2 critical). No dependency remediation or lockfile change.

Focused command:

```sh
env -i PATH="$PATH" CI=true npm test -- src/lib/audio-controller.test.ts src/hooks/use-media-session.test.ts src/lib/audio-engine.test.ts src/lib/audio-lifecycle.test.ts src/lib/audio-resume.test.ts src/stores/audio-store.test.ts
```

Final result: exit 0, **69 passed across six files** (controller 25, Media Session 5, engine 10, lifecycle 9, resume 6, store 14).

- `env -i PATH="$PATH" CI=true NEXT_TELEMETRY_DISABLED=1 npx next typegen`: passed. Warning: Next inferred `/Users/liorelisha` as workspace root due to multiple lockfiles. No config or main-checkout edits.
- `env -i PATH="$PATH" CI=true npm run type-check`: passed, including the final test fixture.
- `env -i PATH="$PATH" CI=true npx eslint src/lib/audio-controller.ts src/lib/audio-controller.test.ts src/hooks/use-media-session.ts src/hooks/use-media-session.test.ts`: passed, no diagnostics.
- Formatted the new test file and added test sections with Prettier while preserving the surrounding double-quote style. Removed unrelated whole-file formatter changes.
- `git diff --check`: passed. Final status contains only the four files listed above (the new hook test is untracked).
- Full canonical `.factory/checks.sh`, full unit suite, and full build were left for the parent as requested.

## Risks and verification gaps

- Controller tests use a fake browser audio element and fake timers with the real controller, engine, and stores. They prove supplied event-sequence behavior, not actual phone event delivery.
- Hook tests simulate React's effect mount/cleanup and browser Media Session APIs in Node. They prove application subscription and API behavior, not real React rendering or native OS presentation.
- No browser, simulator, physical iOS Safari/PWA, Android Chrome/PWA, headset, Bluetooth disconnect, Spotify takeover, or physical lock-screen verification occurred.
- When position API support is absent or rejects an update, the app continues safely but cannot guarantee that the OS clears its display.
- Valid retry accounting, paused intent, track-switch cancellation, one element/controller ownership, and warm resume without a seek remain intact in the focused model tests. Hardware validation remains open.

## Parent review and full verification

The parent reviewed all four changed files and found no blocking issue. The canonical `bash .factory/checks.sh` completed with exit 0 on 2026-10-04. It performed a clean dependency install, Next route type generation, TypeScript checking, full ESLint, all 303 unit tests across 41 files, and the production build with isolated CI placeholder values. `git diff --check` passed. No production secrets or deployment were used.

Full log: `/private/tmp/tora-two-fixes-full-checks-20261004.log`. Next warned about inferred workspace root from multiple lockfiles; the build still passed. The patch remains uncommitted in `codex/playback-reliability-fixes`, limited to the four documented files. No PR or deployment exists. Hardware verification remains open.
