# Tora Player continuation prompt — 2026-10-04

## Start here

Continue Tora Player’s mobile playback reliability work from the checkpoint below. Read this document before any edits. The previous agent stopped at the user’s explicit request so another agent can continue. Do not restart broad research. Use the evidence packet, inspect the current code, and advance the unfinished work with focused reproductions and fixes.

The user wants concrete implementation and clear progress. They became frustrated because research and repeated status messages took too long, and the original abstract remained incomplete. State exactly what you change and test. Never call the full task complete based on a few code fixes or desktop tests.

Preferred roles: GPT-6-Astra with ultra reasoning as orchestrator, GPT-6.1-Sol as development worker. Verify the actual session settings. The prior parent ran Astra at medium despite the requested ultra preference; a prompt does not change that setting. Sol implementation tasks used high reasoning. Claude research retries repeatedly returned API rate limits even after the user added credit. All replacement Sol research tasks completed. No delegated work remains active from this task.

## Verified stopping checkpoint

- Workspace: `/Users/liorelisha/.t3/worktrees/Tora player/codex-playback-reliability-fixes`.
- Branch: `codex/playback-reliability-fixes`.
- HEAD: `2d972994e19155da08024bb0e3278118bbf627b1`.
- Working tree is clean and matches the pushed branch.
- PR: https://github.com/ElishLior/tora-player/pull/31
- Title: `Fix playback recovery, progress, and equal 15-second skips`.
- Base: `dev`. PR was OPEN, not draft, merge state CLEAN at this check.
- GitHub CI completed successfully at 2026-10-04 11:50:07 UTC. CodeRabbit status also reported SUCCESS. This is not a claim that every review comment is resolved.
- No merge or production deployment occurred in this session. No production database/R2/env changes occurred.
- Commits: `d7f534f` fixes retries and system progress; `2d97299` adds equal 15-second skips.
- Repository: https://github.com/ElishLior/tora-player

Recheck PR state and HEAD before further work. The user requested the GitHub link so they can merge it. Do not assume it remains unmerged or merge it on their behalf without a clear instruction. Link PR #31 to the new T3 thread with `link_pull_request` when you start work on it.

## Original objective and latest product decision

Tora is a browser application and installed PWA, not a native app. Cover iOS and Android in both modes. Preserve the selected lesson, part, and position across lock-screen pause, background, lock/unlock, home-screen return, headphone disconnect/reconnect, and Spotify takeover.

One explicit resume must continue the same lesson. Visibility return must not autoplay or reclaim audio focus from another app. Headphone, lock-screen, and on-screen controls must stay synchronized. Each supported delivered action must cause one application action. Distinguish physical presses, OS delivery, and application handling.

The latest user decision resolves the former seek-policy question: backward AND forward jumps must be 15 seconds, in-app AND in Media Session interval actions. Ignore supplied OS relative seek offsets for these actions. Preserve absolute seekto and queue next/previous navigation. Native icon labels are OS-controlled; do not promise that every OS label will display 15.

Also fix inaccurate duration/progress/completion and the exact lesson title “פרשת סוכות” → “חג הסוכות”. Keep AI learning, OCR, and knowledge-graph work outside scope.

## What PR #31 actually implements

Read the PR and diff rather than reconstructing code from this summary.

1. L1: successful current-track playback clears a pending error-retry timer. Previously, an old retry could reload an already recovered element. Tests cover the red/green failure, valid bounded retry/backoff, paused intent, and track switches.
2. L3: an unknown-duration track clears the previous Media Session position through `setPositionState({})`. A later known duration publishes correct state. Missing/throwing APIs remain safe.
3. Equal skips: forward changed from 30 to 15. Media Session seekbackward/seekforward call the shared controller actions and ignore supplied relative offsets. English/Hebrew labels and the documented policy now match. Absolute seeks, bounds, and queue navigation have regression coverage.

This is a partial delivery. It does not prove reliable phone resume, headphone behavior, or Spotify recovery. It does not fix the main duration/completion issue or change the production title.

## Validation already completed

Final canonical command: `bash .factory/checks.sh`.

It passed dependency installation, Next type generation, TypeScript checking, full ESLint, 316 unit tests across 41 files, and the production build with isolated CI placeholder values. The same pushed revision passed GitHub CI. The local log is `/private/tmp/tora-equal-skips-checks.log`.

Earlier two-fix evidence: `docs/handoffs/2026-10-04-playback/two-fixes-implementation.md` and `/private/tmp/tora-two-fixes-full-checks-20261004.log`. That earlier suite had 303 tests. Do not confuse it with the final 316-test result.

Tests use a fake audio element and simulated Media Session APIs. The hook fixture simulates effect mount/cleanup in Node, not real React rendering. Research also includes desktop metadata probes and complete audio-file decodes. No real mobile playback, phone lock screen, Bluetooth/wired buttons, Spotify takeover, or mobile simulator/emulator verification occurred. E2E was not run for this patch.

Local Next reported a workspace-root warning from multiple lockfiles. Lint reported eight warnings in untouched files, with no errors. Builds still passed. No unrelated configuration or dependency remediation occurred.

## Remaining work, in practical order

### 1. Review current delivery without repeating it

Check PR review comments and current CI once. Preserve the three completed behaviors. If PR merged, start the next focused branch from current dev. If still open, avoid adding unrelated large changes to it without explaining the scope.

### 2. Duration and completion — strongest unfinished evidence

Read the audio-data and lifecycle reports below. Start with the measured September 25 final part, ID `43bf8dcc-e00f-4737-8da1-b537fdf35740`, lesson `fb296bdf-9d25-4832-a2d9-262875d48a29`.

Decoded duration is 3819.0535 seconds; catalog is 3819. A retained prior desktop WebKit metadata probe gave 3712.2 seconds, about 106.85 seconds short. Another part was overestimated. Fresh desktop Chromium metadata matched ffprobe. Six complete files decoded successfully, with positive catalog durations within 0.41 seconds. Some public parts have zero duration despite substantial audio.

A modeled execution of progress rules shows that a short element duration can move near-end completion about 107 seconds early, then change resume behavior. Establish whether a real affected browser retains the estimate until the checkpoint. Metadata-only probes do not prove playback, seek timing, or premature ended events.

Inspect `audio-controller.ts`, `audio-engine.ts`, `lesson-progress.ts`, store duration, UI progress, and Media Session state together. Preserve the intended final-minute/final-5% policy for accurate files and the original multipart count rules. Do not blindly use max(catalog, element), reject all duration decreases, or change end clamps. Both sources can be wrong. Unknown-duration display and completion need explicit treatment.

Four sampled Ogg files lacked an EOS-marked final page but decoded successfully. That is not an established cause. Any local remux experiment must compare packet/sample counts and timestamps. Never overwrite production audio as an experiment. The proxy-timeout-to-natural-end explanation remains unproven.

### 3. Lifecycle/device verification

Use the reports’ existing matrix and minimal diagnostics. Separate absent OS widget, wrong active session, lost application state, document reload, and stale element state. Record device/OS/browser/build, web mode, document identity, lesson/part, source, accessory, actual sound, callbacks, play promises, duration changes, and checkpoint writes.

Reproduce pause lengths, background/lock transitions, Spotify active and paused, repeated buttons, disconnect/reconnect, and actual seek deltas. Record OS labels separately from callback offsets. Use isolated fixtures or stub progress/listen/account writes before browser playback tests; ordinary application playback can write production statistics.

Network restoration can currently resume after a terminal offline failure. Research demonstrated this behavior but did not establish it as the Spotify bug. Explicit pause prevents that path. Do not change network or transient-interruption recovery policy casually.

Hardware unavailability must not block independent code fixes. Provide exact remaining device checks and mark them untested. Never claim desktop/simulator success proves real lock-screen or headset behavior.

### 4. Holiday title

Inspect `src/lib/hebrew-date.ts`: the Friday title generator prefixes a nonempty parsha result with “פרשת”, including holiday readings. Reproduce the generator behavior with ordinary and holiday dates under the Israel calendar, then fix the classification with regression tests.

Identify the current exact Sukkot row and both title fields before proposing a data update. Prior public reads found the September 25 lesson title “ליל שישי - י״ד תשרי תשפ״ז | פרשת סוכות”. The measured lesson ID above is the September 25 candidate; verify title identity live before a write. Do not select whichever lesson is newest.

Prepare exact before/after values and a reversible update for owner approval. A Rosh Hashanah title was another candidate, not an approved rename. No production title write is authorized by the existing patch approvals.

## Evidence packet — reference, do not duplicate

- `docs/handoffs/2026-10-04-playback/research-lifecycle.md`: reproduced retry/position defects, counter-tests, other conditional risks.
- `docs/handoffs/2026-10-04-playback/research-audio-data.md`: stable IDs/hashes, measurements, desktop observations, duration provenance, focused experiments.
- `docs/handoffs/2026-10-04-playback/research-webkit.md`: pinned source and version caveats, OS ownership and seek control limits.
- `docs/handoffs/2026-10-04-playback/research-chromium.md`: focus behavior, native command paths, browser/PWA context hypotheses.
- `docs/handoffs/2026-10-04-playback/research-field-reports.md`: version-specific external reports, hardware matrix, diagnostic fields.
- `/private/tmp/tora-lifecycle-20261004-ehx2tzyp`: scratch reproductions for L1/L3. Main regressions are now in the repository.
- `/private/tmp/bug4`: earlier scratch duration tests. Inspect assertions before trusting them; fake events are not browser evidence.
- `docs/handoffs/2026-10-04-playback/handoff-1-research-and-abstracts.md`: older chronological handoff. It contains superseded preparation-only and pending-state notes. This document and current user instructions take precedence.
- Original T3 thread: `356e16c4-e816-43e8-9775-7410418ecac3`. Recover only needed history through `t3_thread_read` with pagination.

Temporary files can disappear. If evidence is missing, state that and reproduce only what is needed. Do not invent results from filenames or workflow completion notices.

## Architecture, safety, and workflow

Read actual checkout `CLAUDE.md` and applicable instructions. Main checkout `/Users/liorelisha/Tora player` has user-local changes and untracked configuration. Leave it untouched. Research checkout `/Users/liorelisha/tora-playback-reliability` is a separate older branch, not the implementation location.

Keep one HTMLAudioElement in `audio-engine.ts`, driven only by `audio-controller.ts`. UI and Media Session use store/controller actions. Preserve lesson-client boundary, Hebrew RTL, both-locale strings, offline part identity/counts, sleep timers, and account progress rules. Prefer Effect for suitable new logic but do not force it into tiny fixes or rewrite the architecture.

Use codex branches and PRs into dev. Production deploy/promotion, environment changes, and DB/R2 writes require explicit owner approval. No destructive operations. Do not expose secrets or signed URLs in logs/reports. No approval is needed to continue authorized reversible local investigation, tests, and focused fixes once the user resumes this handoff.

For T3 delegation, discover providers/models with `orchestrator_capabilities`. Delegate Sol through `delegate_task` with stable per-task request IDs; retain task IDs. Each delegate inherits the caller’s workspace. A shell cd does not change its T3 binding. Do not create top-level threads unless requested. Do not assign overlapping edits concurrently. Async results wake the parent; avoid polling loops. For new review rounds, create a new delegated task with the complete brief and unresolved findings.

Prefer T3 preview tools for browser work. For mobile verification use device_list, then device_open and the returned agent-device launcher. Record unsupported tools/devices accurately. Register every PR worked on with link_pull_request. If asked to monitor a PR, use watch_pull_request and yield.

## Suggested skills

Use the Skill tool when available; otherwise read each SKILL.md with the file tool. Check the active environment’s catalog rather than assuming Claude tools exist.

- `diagnosing-bugs` — `/Users/liorelisha/.agents/skills/diagnosing-bugs/SKILL.md`: focused reproductions, competing hypotheses, and evidence-led fixes.
- `tdd` — `/Users/liorelisha/.agents/skills/tdd/SKILL.md`: one failing behavior test, minimal fix, then the next case. The user already authorized regression tests for confirmed failures; avoid repeated permission questions for the same seams.
- `test` — `/Users/liorelisha/.agents/skills/test/SKILL.md`: appropriate unit/integration checks. Use `.factory/checks.sh` as project CI authority.
- `review` — `/Users/liorelisha/.agents/skills/review/SKILL.md`: review the final focused diff for correctness and regressions.
- `pr` — `/Users/liorelisha/.agents/skills/pr/SKILL.md`: concise PR summary, before/after evidence, and merge risk. Rewrite the title/body around the final scope.
- `simplified-technical-english` — `/Users/liorelisha/.agents/skills/simplified-technical-english/SKILL.md`: clear user updates and final reports.
- `writing-for-agents` — `/Users/liorelisha/.agents/skills/writing-for-agents/SKILL.md`: self-contained Sol task briefs and acceptance evidence.
- `handoff` — `/Users/liorelisha/.agents/skills/handoff/SKILL.md`: continuation notes stored in the OS temporary directory.

Do not invoke deployment skills or workflows until deployment is explicitly authorized. Do not follow historical Superpowers/OMP routes when unavailable in Codex.

## Final reporting contract

Report what was fixed, what remains, reproduction evidence, changed files/PRs, exact automated results, and a scenario matrix labeled modeled, desktop, emulated, real-device, or untested. State OS limits without presenting hypotheses as confirmed causes. Never describe PR #31 as full completion of the original abstract.
