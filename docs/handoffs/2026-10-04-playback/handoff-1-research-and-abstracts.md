# Tora Player: session handoff

## Latest implementation status

The user authorized implementation of L1 and L3 after the research phase. Both fixes and regression tests now exist as an uncommitted patch in `/Users/liorelisha/.t3/worktrees/Tora player/codex-playback-reliability-fixes`, branch `codex/playback-reliability-fixes`. Parent review and canonical CI-equivalent checks passed: typegen, type-check, lint, 303 tests, and production build with placeholders. See `docs/handoffs/2026-10-04-playback/two-fixes-implementation.md`. No deployment, PR, production-data change, or hardware verification occurred. Earlier preparation-only instructions below describe the prior stage and do not undo this authorization.

## Current research status — all five restarted branches complete

This status supersedes earlier pending-status notes below. All five replacement Sol 6.1 research tasks completed. Claude retries failed with API rate limits. No implementation or production-data changes occurred. Research includes source review, scratch tests, file decodes, and desktop metadata probes. Real mobile playback remains unverified.

Read these reports as the evidence packet:

- `docs/handoffs/2026-10-04-playback/research-lifecycle.md`: two failing modeled regressions, stale retry reload and stale Media Session position.
- `docs/handoffs/2026-10-04-playback/research-audio-data.md`: six complete file decodes, current public metadata checks, prior WebKit and fresh Chromium metadata probes.
- `docs/handoffs/2026-10-04-playback/research-webkit.md`: pinned WebKit/API evidence and device tests.
- `docs/handoffs/2026-10-04-playback/research-chromium.md`: Android focus/control paths and device tests.
- `docs/handoffs/2026-10-04-playback/research-field-reports.md`: versioned external reports and the diagnostic matrix.

Recommended preparation order: convert the concrete lifecycle regressions into focused worker prompts, define duration investigation around measured files, then finish the holiday-title prompt. Preserve the separate evidence gaps and open product decisions. Do not start development until the user authorizes that stage.


## Start prompt

You are the Tora Player orchestrator. Use GPT-6-Astra with ultra reasoning for orchestration and GPT-6.1-Sol as the development worker. These roles replace the earlier Opus/Fable arrangement. Do not assume that prompt text changes the active model or reasoning level. Verify the session configuration and the live model catalog. Report any mismatch. Do not silently substitute another model.

This session is for abstracts, investigation briefs, and copy-ready development prompts only. The user explicitly said: “make sure we are just working on defining the abstracts, not the actual development”. Do not start implementation, launch development workers, push branches, open PRs, or deploy during this preparation session. Read-only investigation is in scope. Sol is the designated worker for the later development session, after the user starts or authorizes it.

Read this handoff and the project instructions. Recover useful results from the previous investigation. Then deliver one overview abstract and one abstract plus a complete worker prompt for each session below. Include acceptance criteria, evidence requirements, open decisions, dependencies, and a recommended execution order. Keep the prompts usable without access to this conversation. Do not ask again about decisions the user already made.

## Workspace and current evidence

- Main checkout: `/Users/liorelisha/Tora player`.
- Read `AGENTS.md` and `CLAUDE.md` there. Read the instructions in the actual implementation checkout again before development.
- Existing worktree: `/Users/liorelisha/tora-playback-reliability`, branch `codex/playback-reliability`.
- On 2026-10-04, this worktree was clean at `7c51a08`, with upstream `origin/dev`. Recheck before use.
- The main checkout has a modified `CLAUDE.md` and untracked local instruction/configuration files. Preserve them. Do not copy or commit them without review.
- The previous agent created the worktree and installed dependencies before the user clarified the preparation-only scope. Its npm log reported success. This is not evidence of tests or fixes.
- No implementation changes, passing regression tests, or real-device verification were established by this handoff.
- `src/lib/hebrew-date.ts` currently adds `פרשת` to a nonempty Friday parsha result. This code path needs holiday-specific reproduction. Do not treat every holiday/date claim from the interrupted session as verified.

## Required session briefs

### 1. Playback lifecycle and external controls

Abstract: Make explicit playback resume reliable across iOS and Android, in browser tabs and installed PWAs. Preserve the selected lesson and position across pauses, lock/unlock, background transitions, and return from the home screen. Keep on-screen, lock-screen, and headphone controls synchronized.

The worker prompt must cover:

- Reproduce the disappearing player or lost lesson after short and long pauses. Distinguish an absent OS media widget from lost application state.
- Recover from Spotify or another audio app with one explicit resume action. Do not autoplay or reclaim audio focus merely on visibility change.
- Exercise repeated play/pause through Bluetooth and supported wired headsets. Each supported press must trigger exactly one action.
- Exercise headphone disconnect/reconnect without unexpected playback. Explicit resume must retain the lesson and position.
- Compare both seek directions, labels, callback offsets, and actual jumps, including boundaries near zero and the end.
- Current project instructions specify in-app back −15 seconds and forward +30 seconds. The reported lock-screen icons show 10 seconds. The user did not choose a new interval policy. Verify platform capabilities and present the unresolved product decision before a semantic change.
- Preserve next/previous queue behavior and distinguish track navigation from interval seeks.
- Avoid duplicate audio, stale play/pause state, unwanted seeks, resets, and unsolicited playback.

### 2. Duration, progress, and completion

Abstract: Make elapsed time, remaining time, progress, and completion agree with actual audio playback, including multipart lessons and offline copies.

The worker prompt must compare stored duration, media-element duration, and independently measured file duration where useful. Investigate incorrect estimates, stream truncation, seeks, part boundaries, and actual end events. Treat these as hypotheses until evidence supports them. Do not mark a lesson complete only because playback reaches an inaccurate estimate. Preserve the documented near-end completion policy unless evidence requires a focused correction. Include short clips, final versus earlier parts, and offline subsets with unknown total part counts.

### 3. Holiday titles

Abstract: Correct the identified Sukkot lesson from “פרשת סוכות” to “חג הסוכות” and prevent incorrect holiday prefixes in future generated titles.

Identify the exact lesson by stable ID before any data write. A historical read found a 2026-09-25 lesson with the title “ליל שישי - י״ד תשרי תשפ״ז | פרשת סוכות”. Recheck its current ID and fields. Do not choose whichever lesson is newest.

Prepare exact before/after values for review. Check the lesson list, lesson page, player, and Media Session metadata. Test ordinary weekly portions as well as holidays under the Israel calendar. A separate historical read found a Rosh Hashanah title on 2025-09-19. Earlier prose gave a conflicting date. Treat that as a candidate for review, not an approved additional rename. Production writes need explicit approval for the exact proposed changes.

### 4. Independent bug discovery

Abstract: Find additional defects in playback and closely related behavior, and add only evidence-backed findings to the development briefs.

Review player state, progress/account sync, offline storage/service worker behavior, mobile RTL controls, title metadata, and audio streaming. For each candidate, record the trigger, impact, source location, reproduction or failing test, confidence, and an attempt to disprove it. Merge confirmed findings into the relevant session. Give unrelated findings a separate backlog entry. Do not expand into the AI learning, OCR, or knowledge-graph roadmap.

## Verification requirements for the later development session

Record device, OS version, browser/version, browser or installed PWA mode, lesson/part, and exact reproduction steps. Cover iOS and Android in both web modes. There is no native Tora Player app.

Use available emulators/simulators for supported scenarios. Verify hardware buttons and actual lock-screen/background/audio-focus behavior on real devices. Separate automated, emulated, hardware-verified, and untested results. Desktop tests do not prove a mobile fix. If hardware is unavailable, complete independent work and provide a concise device checklist without claiming success.

Reproduce failures before code changes where possible. Separate confirmed causes from hypotheses. Add meaningful regression tests for confirmed failure paths. Run relevant tests and the required project checks. Report reproduction evidence, causes, changed files, commands/results, hardware results, and remaining limitations.

## Architecture and authority

Use the current project guides as the detailed source of truth. Keep one HTMLAudioElement in `src/lib/audio-engine.ts`, driven only by `src/lib/audio-controller.ts`, with Zustand state in `src/stores/audio-store.ts`. Inspect lifecycle/resume helpers and Media Session integration. Keep the lesson page client boundary intact. Follow Hebrew RTL and both-locale string rules. Prefer Effect for new logic where it fits the existing architecture, without an unrelated rewrite.

For later implementation, use a `codex/<topic>` branch and target `dev`. Do not deploy/promote to main, change production environment variables, or write production database/R2 data without the owner's explicit approval. Keep unapproved title changes as reviewable proposals.

Astra owns scope, evidence review, task boundaries, integration, and final verification. Sol owns the assigned implementation and regression tests. Discover model/provider IDs through `orchestrator_capabilities`. Use T3 `delegate_task` when the native subagent tool cannot select the requested model. Retain task IDs. T3 delegates inherit the caller's workspace: a shell `cd` does not change that binding. Do not create top-level threads unless the user requests them. Resolve workspace binding before implementation. Do not assign simultaneous edits to overlapping audio files.

## Previous investigation sources

T3 thread: `356e16c4-e816-43e8-9775-7410418ecac3`. Use `t3_thread_read` with activity view and pagination when more context is necessary. The scope correction and bug-discovery request are at positions 75–76. The latest user role choice overrides older Opus/Fable references.

Two read-only Claude workflows left local artifacts under:
`/Users/liorelisha/.claude/projects/-Users-liorelisha-Tora-player/c41b386e-7774-48f5-b43b-3ab82cbda9e1/subagents/workflows/`

- `wf_ce052562-105`: platform/lifecycle/duration research.
- `wf_23632985-c1e`: independent bug discovery.

Read useful final text and journals if present. Their existence or UI completion status does not prove validated findings. Do not repeat unfinished research as a confirmed cause. Redact credentials and personal data from all deliverables.

Existing historical plans are references, not the current task contract. In particular, inspect `docs/superpowers/plans/2026-05-10-mobile-background-playback-hardening.md` only for prior work. Verify whether its assumptions still apply to the current single-controller architecture.

## Suggested skills

Use the Skill tool where available. Otherwise, read the corresponding SKILL.md with the harness's file tool.

- `handoff`: concise continuation document with artifact references.
- `simplified-technical-english`: clear prompts and reports.
- `writing-for-agents`: self-contained worker instructions.
- `diagnosing-bugs`: evidence-led investigation in the development session.
- `tdd`: regression tests in the development session.
- `code-review`: independent review after implementation.

Check availability in the active harness. Do not assume that Claude-only tools or advisor configuration carry into Codex. For T3 browser/device work, use the native preview/device tools when available.

## Open inputs

Actual affected devices and OS versions, exact duration examples, the external seek policy, hardware access, preview publication permission, and additional holiday renames remain unresolved. Collect only inputs that block the current stage. Do not treat unanswered multiple-choice questions as approval.


## Research completion update

The platform/duration workflow reported completion after this handoff was first written. Inspection of its journal found five failed branches and one duration-code result. The failed branches covered WebKit, Chromium, field reports, lifecycle code, and audio-data investigation. Their transcripts report session limits. Workflow completion does not mean the full research succeeded.

The duration-code result reports scratch failing tests in `/private/tmp/bug4/pure.test.ts`, `controller.test.ts`, and `media.test.ts`. Its proposed command is `npx vitest run --config /private/tmp/bug4/vitest.config.mjs` from the playback worktree. This handoff session did not rerun these tests. Inspect their assertions and fixtures before treating them as valid regressions. A fake media element demonstrates application behavior under supplied events, not that a real browser emits those events.

Prioritize these reported findings in Session 2:

- Underestimated durations can trigger near-end completion and make resume restart or skip an unfinished part. Examine `isNearPartEnd`, `getResumePoint`, and controller checkpoints.
- UI and Media Session progress can reach the displayed end while the supplied current position exceeds an inaccurate duration.
- An unknown-duration track can leave the previous track's Media Session position state in place. Examine the early return in `updatePositionState`.
- An end event with non-finite duration can save position zero or advance a part. Verify natural-end versus premature-end assumptions before changing recovery.
- A queue transition after an unknown-duration end can overwrite local completion and diverge from the server value.
- Seek and restored-position clamps can use inaccurate duration values. Preserve expected boundary behavior for files with accurate durations.

Additional candidates for Session 4 include a multipart lesson-total fallback for a part with unknown duration, incorrect offline total metadata, and an unused fallback audio source. These remain candidates pending focused verification.

Do not adopt the research's proposed `max(catalog, element)` duration rule, blanket rejection of shrinking durations, or one-second seek clamp without analysis. Catalog values can also be wrong. Such changes can cause retry loops, incorrect totals, or altered end behavior. Preserve the existing near-end policy and real end-of-part behavior where valid.

The proxy-timeout explanation remains low-confidence. The research did not establish that a real browser treats a truncated stream as a natural end. It also did not establish current platform seek-icon behavior or the Spotify/headphone root cause. Complete those evidence gaps during the later investigation.

The full result and source traces remain in the workflow journal referenced above. Use them instead of duplicating the long research report here.


## Completed Sol WebKit research

Read `docs/handoffs/2026-10-04-playback/research-webkit.md` for the full source-linked report and seven proposed tests. Sol reports a clean worktree at `7c51a08`. No hardware or browser verification occurred.

Use these refinements in the playback brief:

- Separate OS widget disappearance, actual loss of application track state, document reload, and command ownership after Spotify. They need different reproductions.
- Retain one-action explicit resume as an app acceptance criterion. Do not promise permanent OS widget presence or headset command delivery to an inactive session.
- The inspected WebKit source uses a 15-second default callback offset. This does not prove the labels or offsets on the user's device. Keep the reported 10-second icons unresolved pending photographs and callback logs. Preserve the current in-app −15/+30 policy until a product decision changes it.
- Log physical headphone presses separately from OS callbacks and controller commands. Route disconnection can pause the element without a Media Session pause callback.
- The report corroborates the unknown-duration Media Session state-clear gap through app and WebKit source. Validate it with a focused regression test and a device observation before claiming a native-display fix.
- Current source, Safari branch source, shipped binaries, and historical resolved bugs are different evidence. Use the report's pinned source references and version caveats. Do not infer a released fix from a main-branch commit.

The report supplies exact long-pause, Spotify, headset, disconnect, seek-offset, stale-position, and duration test procedures. Include document identity and service-worker revision in diagnostic records. Repeat key hardware tests without a remote inspector.

Claude retry status: both restarted Claude branches failed with the same API rate-limit error. Replacement Sol tasks now cover audio-data and field reports. Android and lifecycle Sol results remain pending at this update.


## Completed Sol Android/Chromium research

Read `docs/handoffs/2026-10-04-playback/research-chromium.md` for pinned sources, counterevidence, and six proposed tests. No unit, emulator, browser, or hardware tests ran. The report's Chromium main revision does not establish behavior in the user's installed Chrome build.

Refine the later prompts as follows:

- Distinguish permanent audio-focus loss from transient interruption. Capture whether Tora receives a callback, requests play, receives a rejection, and produces audible output. Do not infer focus behavior from UI state alone.
- The inspected Android notification path omits seekOffset, so Tora uses its −15/+30 defaults. This differs from the inspected WebKit callback path. Measure labels, callback details, actual jumps, and queue index on each native surface before a product decision.
- Next/previous and interval controls are distinct. Native compact controls can prioritize track navigation. Preserve existing queue behavior.
- Add a browser-tab plus installed-PWA concurrent-context test. Shared persistent storage with independent players can permit stale snapshot overwrites. This is a candidate, not a reproduced defect.
- Record installation type, browser version, OEM device, battery policy, and accessory model. A PWA is not proof of a native background-service contract. Android SDK-specific rules need host-browser evidence.
- The report independently identifies the unknown-duration Media Session reset gap. It does not establish a real premature end event or a Spotify root cause.

Keep native widget disappearance separate from app track loss. Existing fake-media unit/e2e tests do not establish Android lock-screen behavior. Lifecycle, audio-data, and field-report Sol results remain pending at this update.


## Completed Sol lifecycle research

Read `docs/handoffs/2026-10-04-playback/research-lifecycle.md`. The worker reports 53 passing focused checks, plus a separate regression run with two failures and 26 passes. These runs import unchanged application modules and mock media events. They are not hardware reproductions. Full commands, assertions, and scratch fixtures are in `/private/tmp/tora-lifecycle-20261004-ehx2tzyp` and the report. The parent reviewed the report but did not independently rerun these checks.

Promote two findings to concrete regression candidates for the later development session:

1. **Stale recovery timer (L1):** An error schedules a retry. Pause and successful explicit resume do not cancel it. When the old callback executes with play intent true, it unnecessarily reloads the now-playing element. The regression observes an extra load call. Position preservation means this does not prove a reset or lost lesson. Require timer invalidation after successful recovery, with counter-tests for valid retries, paused intent, and track switches.
2. **Stale Media Session position (L3):** Known-duration A followed by unknown-duration B does not clear A's position state. The callback regression fails. Require a clear-state operation for the relevant transition, browser-safe error handling, and correct updates after B gains a valid duration. Actual native display remains unverified.

**Demonstrated behavior, policy unresolved (L2):** A terminal offline media failure followed by an online event can invoke play without a new user action. Ordinary external pause does not set this flag, and explicit pause prevents the resume. Decide the intended network recovery policy before changing it. Do not label this as proven Spotify/headphone autoplay.

Counter-tests support the existing normal path: external pause retains lesson/checkpoint, visibility refresh does not play, refresh detects a missed pause event, and explicit loaded-track resume preserves position. Preserve these paths during later fixes.

Other candidates, including delayed same-track play rejection, stalled resources, async offline lookup, and cross-document persistence, remain hypotheses. The original lost-lesson, Spotify, headset, and native seek-label complaints still need hardware traces. Audio-data and field-report results remain pending at this update.


## Completed Sol field-report research

Read `docs/handoffs/2026-10-04-playback/research-field-reports.md` for version-specific primary reports, counterevidence, the device matrix, and diagnostic requirements. This branch performed no Tora playback tests. External reports corroborate symptom classes, not Tora root causes. A tracker marked NEW does not establish that every current release is affected.

Useful leads for the later briefs:

- WebKit report 243256 describes iOS 15.6 controls disappearing after a two-minute pause and headphone resume. It supports the long-pause test, not a current-version diagnosis.
- Chromium source history describes Bluetooth pause/resume command translation and a short dead zone. First shipped milestones remain unverified. Include separate 1-, 3-, and 6-second pause/resume trials, plus accessory multipoint on/off controls.
- A Brave multipoint report is not Chrome/PWA/Tora proof. Record the actual browser and accessory configuration rather than generalizing to all Android devices.
- WebKit report 293310 supplies Ogg/Opus duration and seek-timeline discrepancies with specific versions and format controls. Its principal examples overestimate duration, unlike the suspected Tora underestimate. Compare a real affected file's decoded length, wall playback time, seek landing, and container before attribution.

Use the report's matrix as a proposed checklist, not completed verification. Prioritize the affected iPhone and Android phone in browser and installed modes. Compare a plain HTMLAudioElement using identical bytes when a failure occurs. Keep all results explicitly labeled as real-device, simulator, desktop-browser, modeled, or not-run.

Diagnostic details worth retaining: separate raw element and store duration, preserve NaN/Infinity as explicit strings, assign document and logical-command IDs, record play promise outcomes, and compare callback counts with physical presses. Capture sanitized response headers and byte counts for actual stream failures. Keep diagnostics bounded and local, without a background keep-alive. Isolate production progress/listen/account writes before playback verification.

Do not expand the no-autoplay rule into a blanket ban on every transient interruption recovery without a product decision. The established requirements cover visibility return, Spotify focus reclaim, and unexpected reconnect playback. Network and transient-interruption policies need explicit treatment. Likewise, hardware evidence gaps do not block later fixes for independently reproduced code defects L1/L3.

Only the audio-data Sol result remains pending at this update. No implementation changes occurred.


## Completed Sol audio-data research

Read `docs/handoffs/2026-10-04-playback/research-audio-data.md` for stable lesson/part IDs, hashes, methods, measurements, and exact later tests. The parent reviewed the report; it did not independently repeat the decodes.

Six complete public files decoded successfully. Positive catalog durations in this sample matched decoded audio within 0.41 seconds. Selected public metadata still contains zero-duration entries for substantial audio. This supports targeted unknown-duration work, not a broad catalog rewrite.

For the September 25 final part (part ID `43bf8dcc-e00f-4737-8da1-b537fdf35740`), decoded duration is 3819.0535 seconds and catalog duration is 3819. A retained prior desktop WebKit probe reports 3712.2 seconds, approximately 106.85 seconds short. The other measured part's WebKit estimate is too long. Fresh desktop Chromium probes match ffprobe. These are metadata observations, not actual mobile playback or natural-end evidence.

Pure progress-rule execution with the short estimate shifts the near-end completion threshold about 106.85 seconds earlier. This gives the duration brief a concrete file and falsifiable condition: determine whether the affected device retains that estimate until a checkpoint. A correction during playback could remove the trigger. Do not claim end-to-end reproduction from the modeled rule.

Four measured Ogg/Opus files lack an EOS-marked final page but decode successfully. The causal connection to duration estimates remains unproven. Any local remux comparison must verify timestamps and sample counts; it does not isolate the EOS flag alone. Do not replace production audio or prescribe bulk transcoding.

The sampled MP3 that triggered a bitrate-estimation warning differed from full decode by only 0.028 seconds. The proxy-timeout experiment still has no usable browser-end evidence. These are counterevidence to broad MP3 or transport diagnoses.

All five restarted research branches are now complete. The next authorized preparation step is to use this packet for final abstracts and self-contained development prompts. Hardware verification, product decisions, fixes, and any approved production title correction remain future work.
