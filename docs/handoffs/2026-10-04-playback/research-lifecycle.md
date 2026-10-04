# Tora Player: lifecycle code research

Date: 2026-10-04. Assignment: `investigate:lifecycle-code`. Read-only research. No implementation or production operations.

## Evidence boundary

- Worktree: `/Users/liorelisha/tora-playback-reliability`, branch `codex/playback-reliability`, upstream `origin/dev`.
- Verified HEAD: `7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a`. Worktree status was clean before research.
- Read the main checkout's `AGENTS.md` and full `CLAUDE.md`, plus the specified Astra/Sol handoff. The relevant prior transcript, `agent-a4ea3208502923ad8.jsonl`, contains an orientation message and a session-limit message. It provides no completed lifecycle evidence.
- All source references below use this worktree and revision. Scratch tests import its unchanged modules. These tests supply media events. They do not establish which events an actual phone emits.
- No browser, simulator, or real-device playback verification occurred. The prior duration result remains modeled evidence, not hardware proof.

## Main findings

### L1. An old retry can reload audio after explicit resume succeeds

**Confidence:** High for code behavior. Hardware incidence remains untested.

An error schedules a retry at 1, 2, or 4 seconds. Pause, explicit play, and a successful `playing` status do not cancel that timer. Its callback checks the track and play intent, but not whether recovery already succeeded. It calls `reload()` even while sound plays normally.

Sources: [retry callback](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:273>), [playing reaction](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:310>), [intent subscriber](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:384>), [reload](</Users/liorelisha/tora-playback-reliability/src/lib/audio-engine.ts:126>).

**Exact modeled reproduction:** Start A at 100 seconds. Supply a media error while online. Capture the 1000 ms retry callback. Pause, then explicitly play A. Supply metadata and `playing`.

Move to 105 seconds. Execute the old callback. The media element performs an extra `load()`.

**Counterevidence:** A callback that executes while intent is paused does nothing. A track switch cancels the timer. Reload preserves the current position through `pendingPosition`. This defect establishes an unnecessary reload, not a proven reset to zero or lost lesson.

**Regression:** After successful resume, execute the old retry callback. Assert no additional `load()` or `play()`. The scratch assertion fails: expected 2 load calls, received 3.

### L2. Network restoration can resume audio without a new user action

**Confidence:** High for code behavior. Treat the intended network recovery policy as an open decision.

An offline media failure sets `resumeWhenOnline`, pauses intent, and sets issue `failed`. The next `online` event clears recovery attempts and calls `play()` when the issue still equals `failed`.

Sources: [failure reaction](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:341>), [online handler](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:400>).

**Exact modeled reproduction:** Play A at 120 seconds. Set `navigator.onLine=false`. Supply a media error. Confirm intent is paused and issue is `failed`. Set online true and dispatch `online`. The controller invokes another element `play()` without a fresh resume action.

**Counterevidence:** An ordinary external pause does not set this flag. Explicit pause clears the issue, which prevents this online resume. Thus this is not proof that Spotify takeover or headset disconnect causes autoplay. A possible interaction requires both a media failure that qualifies for this path and network restoration.

**Later decision/test:** Define whether automatic recovery remains valid after a terminal offline failure, especially after an OS interruption. Independently retain the confirmed rule: visibility return alone must not reclaim playback.

### L3. A new track with unknown duration retains the previous Media Session position

**Confidence:** High for code behavior. The visible OS result remains untested.

The hook returns without a position update when duration is zero. A transition from A (`duration=600`, `position=120`) to B (`duration=0`) updates metadata but leaves A's last position state in the session. The scratch hook test confirms no clear call. The regression expects `setPositionState({})` and fails.

Source: [position update](</Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:68>), [track sync](</Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:115>). An empty dictionary clears position state in the [Media Session draft, setPositionState](https://www.w3.org/TR/mediasession/#dom-mediasession-setpositionstate).

**Counterevidence:** A later positive duration triggers an update. A browser can omit the OS progress display. This proves stale API state, not a particular lock-screen display.

### L4. Source trace does not establish a lost-lesson defect after normal pause

**Confidence:** High for the stated code paths. Low for the reported device cause.

The audio store persists `currentTrack`, queue, index, and `resumePosition`. It deliberately excludes play intent. Reload restores the position and starts paused. Checkpoints use the live element position every five seconds of time updates, plus external pause/error, hidden visibility, and `pagehide`. A checkpoint requires that this track previously reached `playing`.

Sources: [persistence](</Users/liorelisha/tora-playback-reliability/src/stores/audio-store.ts:268>), [checkpoint](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:199>), [time updates](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:349>), [lifecycle](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:390>).

Visibility return calls `refresh()`, not `play()`. External pause sets paused intent. Explicit resume of the loaded key calls element `play()` without a seek. Root layout contains the player, so ordinary client navigation retains the owner. The mini player requires a track, not active sound.

Sources: [resume plan](</Users/liorelisha/tora-playback-reliability/src/lib/audio-resume.ts:31>), [external pause rule](</Users/liorelisha/tora-playback-reliability/src/lib/audio-lifecycle.ts:39>), [engine refresh](</Users/liorelisha/tora-playback-reliability/src/lib/audio-engine.ts:157>), [root player](</Users/liorelisha/tora-playback-reliability/src/app/[locale]/layout.tsx:69>), [render condition](</Users/liorelisha/tora-playback-reliability/src/components/player/audio-player.tsx:23>).

**Counter-tests passed:** An external pause at 145 seconds retains the lesson and checkpoint. Visibility return makes no play call. If the element becomes paused without a pause event, visibility refresh detects it and saves 170 seconds. Explicit resume retains 170 seconds.

**Remaining uncertainty:** Document replacement, unavailable storage, another browser/PWA context, element resource loss, or OS media-session selection can explain different symptoms. No current trace distinguishes them. Chrome documents that discard can occur without a final observable event. That is a possibility, not evidence of this incident. [Chrome lifecycle guidance](https://developer.chrome.com/docs/web-platform/page-lifecycle-api#discarded).

### L5. In-app seek labels match code. External offsets can differ

**Confidence:** High for handlers and labels. Actual platform labels/offsets remain unverified.

In-app back is −15 seconds and forward is +30 seconds. Both locale labels agree. RTL mirrors the icon and retains its handler. Media Session honors a supplied nonzero `seekOffset`. Otherwise it uses −15/+30. The scratch callback test returns `[-15, 30, -10, 10]` for absent offsets, then supplied 10-second offsets.

Sources: [constants](</Users/liorelisha/tora-playback-reliability/src/lib/player-track-actions.ts:77>), [labels](</Users/liorelisha/tora-playback-reliability/messages/en.json:195>), [Hebrew labels](</Users/liorelisha/tora-playback-reliability/messages/he.json:195>), [control](</Users/liorelisha/tora-playback-reliability/src/components/player/player-controls.tsx:32>), [external handlers](</Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:90>).

The draft permits an optional seek offset and gives the browser control over the active session. These rules do not verify a phone's icon. [Media Session draft: action details](https://www.w3.org/TR/mediasession/#dictdef-mediasessionactiondetails), [routing](https://www.w3.org/TR/mediasession/#routing).

Next/previous are separate actions. They select a queue neighbor, or apply an interval seek at the queue boundary. Each registered callback calls one controller action. The hook unregisters callbacks on cleanup. No additional headset key listener appears in the playback path. [Queue actions](</Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:529>), [cleanup](</Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:147>).

**Open decision:** Preserve −15/+30 in-app. Measure external icon, callback offset, and actual jump before any external interval change. Do not infer the offset from the icon alone.

## Other conditional risks

| Hypothesis | Source and counterevidence | Falsifiable test |
|---|---|---|
| An explicit tap remains silent when a resource stalls without an error. | `audio-lifecycle.ts:55` returns no recovery for buffering. `audio-engine.ts:91` reloads only with `element.error`. A loaded element normally resumes directly. | Interrupt transfer without an error. Record play-promise settlement, `paused`, `readyState`, `networkState`, `error`, and current time. Fail only if one explicit tap cannot restore progress despite a usable source. |
| An offline lookup delays play beyond a usable activation window. | `audio-controller.ts:68-75,143-152` uses an async lookup with a 3-second fallback. Cached sources and known unsaved lessons use a synchronous load. `audio-resume.ts:38-45`. | Cold-open a saved lesson. Repeat with lookup resolution before/after the tap and with a 3-second timeout. Capture actual play rejection. Do not assume a platform rejects async play. |
| A late blocked-play result cancels a newer same-track attempt. | `audio-engine.ts:96-104` guards only track identity, not request identity. `audio-controller.ts:422-426` pauses on the callback. No browser sequence proves the race. | Model two same-key calls and a delayed old rejection. Then reproduce with actual browser promise order before promotion to a confirmed device defect. The HTML standard returns an already-rejected promise for ordinary policy refusal, which limits this hypothesis. [HTML play algorithm](https://html.spec.whatwg.org/multipage/media.html#dom-media-play). |
| Two app documents compete for playback or persisted state. | Singleton ownership is per document. The reviewed playback files contain no cross-document lock or storage-event reconciliation. OS focus can prevent overlap. | Open two tabs, then tab plus installed PWA. Record each document identity and storage key. Resume each explicitly. Count audible sources and compare checkpoint writes. Do not assume the contexts share storage. |

## Duration/completion intersection

These code paths support the duration brief without hardware claims:

- The store starts with catalog duration. Positive media-element duration replaces the live value. Checkpoints calculate completion from element duration. `audio-store.ts:126-135`, `audio-engine.ts:168-170,232-235`, `audio-controller.ts:184-195,419-420`.
- Resume prefers a positive catalog part duration over the saved observed duration. A falsely short catalog duration can select the next part or restart. Near-end completion is intentional: final minute or final 5%, whichever is shorter. Preserve that policy. `lesson-progress.ts:37-40,55-67`.
- Seek clamps use element duration, then store duration. Restored positions also clamp to positive element duration. Incorrect positive values can limit seeks. `audio-controller.ts:483-494`, `audio-engine.ts:239-252`.
- Non-finite element duration becomes zero. An `ended` state with zero duration qualifies for advance, and finish records position zero. This is conditional behavior, not evidence that a real browser emits premature `ended`. `audio-lifecycle.ts:44-50`, `audio-controller.ts:215-221`.
- The seek bar caps visual progress and remaining time but displays uncapped elapsed time. Thus position beyond an inaccurate duration can disagree with a full bar. `components/player/seek-bar.tsx:61-75,100-102`.

The HTML standard defines natural end in relation to the media resource. A supplied `ended` flag in a fake element does not prove proxy truncation or browser natural-end behavior. [HTML end-of-playback rules](https://html.spec.whatwg.org/multipage/media.html#ended-playback).

## Reproducible scratch evidence

Directory: `/private/tmp/tora-lifecycle-20261004-ehx2tzyp`.

Run from that directory:

```sh
node /Users/liorelisha/tora-playback-reliability/node_modules/vitest/vitest.mjs run --config /private/tmp/tora-lifecycle-20261004-ehx2tzyp/vitest.config.mjs
node /Users/liorelisha/tora-playback-reliability/node_modules/vitest/vitest.mjs run --config /private/tmp/tora-lifecycle-20261004-ehx2tzyp/vitest.regression.config.mjs
```

First command: **53 passed**. Includes 46 original focused tests and seven research observations.

Second command: **two failed, 26 passed**. Failures are L1 and L3. See `regression-result.txt` for exact assertions.

Fixtures mock browser globals, storage, fetch, offline lookup, and selected hook dependencies. They invoke captured timers and Media Session callbacks directly.

The media hook fixture calls the effect without a React render. It verifies application callback logic, not browser routing or React integration. All fetches are mocked. Cache files stay in scratch.

Initial media-fixture runs failed on a Next import, before tests ran. Narrow mocks resolved that harness issue.

## Exact device tests for later work

Use real iOS Safari and its installed PWA, plus Android Chrome and its installed PWA. Record device, OS, browser version, mode, revision, lesson ID, part ID, source type, and headset model. Use a measured short file and a multipart lesson. Repeat the key cases with an offline copy.

1. Play to 120 seconds. Pause through the lock screen. Leave for 30 seconds, 5 minutes, then 30 minutes. Return. Confirm the lesson remains selected. One explicit resume must continue at the pause point within 2 seconds. No seek or autoplay on visibility return.
2. Repeat with pause through the page and headset. Capture document identity before/after. If the OS widget disappears, inspect application state separately. If the document changes, inspect the persisted checkpoint and paused restoration.
3. Play Tora, start Spotify, wait 30 seconds and 5 minutes, then return. Confirm no automatic focus reclamation. Press Tora Play once. Record the controller action, element play promise, actual sound, selected part, and position. Repeat with Spotify still active and after Spotify pause.
4. Perform ten headset presses that alternate play and pause at two-second intervals. Count delivered Media Session callbacks and state transitions per press. Repeat locked, background, and after Spotify takeover. Record unsupported hardware actions explicitly.
5. Disconnect Bluetooth and supported wired/USB audio during playback. Wait 30 seconds. Reconnect. Require no unexpected resume. One explicit play must retain lesson and position. Record the actual DOM events rather than assume disconnect emits pause.
6. On a measured file of length D, pause at 100 seconds. Verify in-app 85/130 targets. Verify back from 5 reaches zero and forward from D−5 reaches D. For external seek, record icon, `seekOffset`, callback target, settled `currentTime`, and sound. Test both languages. Verify queue next/previous separately from interval seeks.
7. Cause a recoverable failure. Resume before the scheduled retry. Require no stale timer reload after recovery. Also exercise offline failure followed by online restoration and document the selected policy.
8. Transition from known duration to unknown duration. Compare page, mini/full player, and OS metadata/position. For duration complaints, compare catalog, element, and independently measured duration at start, seek, pause, part transition, and actual end.

Collect a timestamped local trace of element flags/events, controller actions, store intent/status/key/position, Media Session callbacks/offsets, visibility, document identity, and storage availability. Exclude credentials and unrelated personal data. Desktop or simulator success does not close the Spotify, hardware-button, disconnect, or physical lock-screen gaps.

## Handoff recommendation

Use L1 and L3 as concrete regression candidates. Treat L2 as a demonstrated behavior with an unresolved recovery policy. Preserve the verified pause/refresh/resume paths as counter-tests. Keep the reported lost lesson, Spotify cause, headset delivery, and 10-second icons as hardware questions until traces establish them. No fix, deployment, or production-data change follows from this report.
