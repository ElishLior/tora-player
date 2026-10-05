# Tora Player — Android Chromium research

Date: 2026-10-04. Assignment: `research:chromium`. Read-only research, no nested delegation.

## Evidence and limits

The checkout `/Users/liorelisha/tora-playback-reliability` is clean at `7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a`, branch `codex/playback-reliability`. I read the main checkout's `AGENTS.md`, `CLAUDE.md`, the supplied Astra/Sol handoff, and relevant playback code. 

The assigned prior transcript, `agent-ac4bee46c1e5f6ec1.jsonl`, contains a session-limit message, not research findings.

Chromium source below uses revision `102d0d1a9b57dae89fe712fc79b66cf9272309a8`, main, committed 2026-10-04. This is source evidence, **not proof about an installed Stable build**. Record the device's exact browser version before comparison. Feature flags and OEM behavior can differ.

No app, unit, emulator, or hardware tests ran in this assignment. No production data reads or writes occurred. Only this report was saved. Prior duration failures use supplied media events. They do not prove that Android emits those events. 

This report makes no iOS behavior claim. Apply its app-code findings to iOS only after separate WebKit research and hardware tests.

## Findings

### 1. Spotify takeover requires a distinction between permanent and transient focus loss

**High confidence in source. Device cause unverified.** Chromium maps permanent `AUDIOFOCUS_LOSS` to focus abandonment and session suspension. Transient loss suspends without that abandonment. Focus gain can resume a suspended session. See [AudioFocusDelegate.java, lines 89–95, 181–204][C1] and [native delegate, lines 89–103][C2]. 

Android's guidance requires explicit user action after permanent loss. Its Android 12 fade and Android 15 focus restrictions have conditions, such as the host app's target SDK and foreground/service state. These are not unconditional rules for every PWA. [Android audio focus][A1]

Tora checkpoints native pause/error and reflects native pause/play: `src/lib/audio-controller.ts:302–345`, `src/lib/audio-lifecycle.ts:39–43`. Loaded-track resume calls play without a seek: `src/lib/audio-resume.ts:31–45`, `audio-controller.ts:132–136,457–470`.

**Counterevidence:** these safeguards already exist. Spotify failure does not establish a missing pause handler. Chromium's transient focus resume can start sound outside a JavaScript play handler. The page cannot directly select Android `AudioAttributes` through the Media Session API.

**Hypothesis H1:** the failed resume concerns native session ownership, rejected play, or stale state after suspension, rather than a lost lesson. Falsify with T1/T2. Do not add autoplay on visibility change.

### 2. Missing OS controls and missing app lesson are separate defects

**High confidence in code. Trigger unverified.** `src/components/player/audio-player.tsx:16–25` hides the player only when `currentTrack` is null. The persisted state includes track, queue, and resume position, but excludes play intent: `src/stores/audio-store.ts:269–297`. A reload therefore restores a paused lesson if storage remains intact. 

Checkpoints occur on periodic media updates, native pause, hidden state, and pagehide: `audio-controller.ts:199–212,315–317,349–355,390–398`.

Chromium hides its notification when the session becomes uncontrollable. It can hide immediately when locked. This does not clear Tora's Zustand/localStorage state. [MediaSessionHelper.java, lines 303–324][C3] The web standard leaves active-session selection to the browser. Declared `playbackState` does not force session ownership. [Media Session §4.2][W1]

**Counterevidence:** an ordinary pause does not necessarily make the session uncontrollable. The source does not establish a universal pause timeout. Tora already calls `audioEngine.refresh()` on visibility return without play: `audio-controller.ts:390–394`.

**Hypothesis H2:** “lost lesson” describes an absent native widget, process reload, or storage overwrite. T1/T3 distinguish these. An app player that disappears while `currentTrack` stays non-null requires a separate render/navigation investigation.

### 3. Browser and installed PWA share an engine, but not necessarily one live player

**High confidence in documented Chrome WebAPK model. Cross-context defect unverified.** Tora requests standalone display: `src/app/manifest.ts:17–26`. 

Chrome's WebAPK documentation states that Chrome hosts the site and shares profile storage with the browser. It does not promise identical lifecycle outcomes. The document dates from 2017. Confirm the actual installation type and browser on the device. [WebAPKs][P1]

Chrome's lifecycle guide permits freeze/discard of hidden pages. Active audio protects against ordinary discard, with exceptions under extreme resource pressure. Mobile termination does not guarantee final callbacks. [Page Lifecycle API][P2]

**Counterevidence:** an install does not create native Media3 playback or a permanent background-service contract for Tora. Shared localStorage also does not imply shared in-memory Zustand/audio elements.

**Hypothesis H3:** a tab and installed app each hold a player, and the older context overwrites the same `tora-player-audio` entry. Code permits each context to persist its own snapshot: `audio-store.ts:143–153,269–280`. T3 must establish the overwrite. Do not assume a single global player across separate documents.

### 4. Headset buttons and disconnect travel through native paths

**High confidence in source. Accessory behavior unverified.** Chromium receives native media callbacks and maps play/pause, previous/next, and fast-forward/rewind separately. It delegates generic media-button interpretation to MediaSessionCompat. [MediaNotificationController.java, lines 342–405][C4] A noisy-output event suspends active playback on Android phones. The receiver listens for `ACTION_AUDIO_BECOMING_NOISY`. [MediaSessionHelper.java, lines 168–194][C3], [receiver, lines 74–81][C5]

Tora registers explicit play and pause handlers, not a custom button toggle decoder: `src/hooks/use-media-session.ts:90–105`. Next/previous use a queue neighbor, else +30/−15 seconds: `audio-controller.ts:529–540`.

**Counterevidence:** this does not prove every Bluetooth disconnect emits a noisy event or every headset sends the same key. Reconnect is not a web “play” command by definition. The inspected noisy handler supplies no reconnect-play rule.

**Hypothesis H4:** duplicate/missed presses occur before the app callback, during session ownership changes, or after a stale paused state. Count native keys, callbacks, and element transitions separately in T4. Preserve queue navigation.

### 5. Seek offset, control label, and track navigation require separate measurements

**High confidence in inspected path. Actual UI unverified.** Tora's constants are −15/+30 seconds: `src/lib/player-track-actions.ts:76–78`. Its Media Session handlers prefer nonzero `details.seekOffset`, else these constants: `use-media-session.ts:94–95`. 

The standard defines optional positive offsets and leaves the default to the site. It exposes no interval/icon-label setter in `setActionHandler`. [Media Session §§5,10][W1]

Chromium's Android notification sends a seek action through `didReceiveAction(action)`. Browser code passes null details, and Blink creates details with only the action. Thus **this inspected path omits `seekOffset`** and selects Tora's fallbacks. See [helper, lines 237–243][C3], [browser session, lines 1700–1707][C6], [Blink conversion, lines 27–48][C7]. This does not establish every remote controller path.

Chrome supplies generic fast-forward/rewind artwork and text resources. Its compact notification prefers previous/next when both exist: [controller, lines 583–596,1308–1335][C4]. Tora always registers both. 

Android 13+ can derive OS buttons from native PlaybackState, conditional on target SDK. [Android 13 controls][A2]

**Counterevidence:** no inspected Android source proves a universal “10 seconds” icon. Native surfaces can differ. A next-track button can change the part instead of an interval. T5 must record the visible surface, action, details, and actual jump. The external interval policy remains an open product decision.

### 6. Duration defects can imitate an OS progress or resume problem

**High confidence in deterministic code conditions. Real-file cause unverified.** `use-media-session.ts:68–78` clamps OS position to app duration. For duration ≤0, it returns without a reset of prior position state. `audio-engine.ts:168–170,232–235` maps non-finite duration to zero and only publishes positive duration changes. A prior known duration can therefore remain in app state when a later value becomes unknown.

Completion and resume depend on duration: `lesson-progress.ts:37–40,55–67`, `audio-controller.ts:184–195`. Seek/restore clamps also depend on duration: `audio-controller.ts:483–495`, `audio-engine.ts:112–123,239–253`.

**Counterevidence:** positive media duration updates replace catalog values. Accurate media duration produces expected boundary behavior. Code alone does not prove a truncated response becomes a natural end. An OS timer is not an independent duration measurement.

**Hypothesis H5:** an underestimated duration causes early completion, an incorrect OS end position, or an incorrect resumed part. T6 must compare actual file length, element duration, catalog duration, and saved progress. Do not adopt `max(catalog, element)` without evidence.

## Exact proposed tests — none executed

Use an authorized local fixture or approved test environment. Avoid production account progress/statistic writes. Capture only playback fields, not cookies, tokens, signed URLs, or full storage dumps.

**Common record:** device/model, Android version/build, browser/version, battery mode, installation type, app revision/build, lesson/part IDs, source type, and headset/model. Log wall time, `visibilityState`, `document.wasDiscarded` when available, action/details, media events, `paused`, `ended`, `readyState`, `networkState`, error code, time/duration, store track/queue/time/status/intent, and persisted resume position. Log callback and `play()` counts in a later diagnostic build. Use actual audible output or an independent recorder as the sound check.

| Test | Procedure and falsifiable result |
| --- | --- |
| T1: pause/lock | Use a known file longer than 10 minutes. Pause at 120 seconds through lock controls. Wait 30 seconds, 5 minutes, then 30 minutes in separate runs. Try one lock/headset resume first. Return to the app and try one explicit Play if native controls are absent. Repeat browser and installed modes. Same lesson/part must remain. A warm resume must not write a new seek or reset time. Record native-widget disappearance separately from app state loss. |
| T2: Spotify | Play Tora at 120 seconds. Start Spotify for 30 seconds. Return to Tora without Play and confirm no focus reclaim/autoplay. Tap Play once. Repeat while locked, with Spotify paused, and with Spotify still active. Record whether a callback reaches Tora and whether its play request rejects. One explicit app resume must retain the lesson/part and position. Compare a transient notification/call separately, without treating it as permanent Spotify focus loss. |
| T3: reload/contexts | Pause at 120 seconds and confirm the persisted checkpoint. Reload and reopen from the launcher separately. Confirm paused restoration with the same track. For browser tabs, use `chrome://discards` only where available. Then open tab A and installed context B, select different lessons, change A's persisted fields, and reload B. An observed stale overwrite supports H3. A normal reload does not prove actual OS process eviction. |
| T4: headset | In each mode, do 20 isolated play/pause presses, each two seconds apart, first foreground then locked. Compare physical presses, native events where accessible, callbacks, and audible transitions. Do supported next/previous with and without queue neighbors. Disconnect while playing and while paused. Reconnect after 10 seconds, without a press. Record any sound or callback. Explicit resume must keep the part/time. Treat accessory-generated auto-play as a separate cause. |
| T5: seeks | Pause at 120 seconds on an accurate 600-second fixture. Photograph each available lock/notification/expanded control. Press each direction once. Capture action, offset, time before/after, and queue index. Repeat near 5 and 590 seconds, plus in-app Hebrew/English controls. Undefined offsets predict −15/+30 on the inspected path. Supplied offset 10 predicts −10/+10 in an application-handler test. Next/previous must use queue neighbors when available. |
| T6: durations | Compare one accurate file, an affected file, multipart final/earlier parts, and offline subsets with unknown totals. Measure file length independently. Record duration events and natural end. Pause/resume before the actual end, around the displayed near-end threshold, and after a seek. In a model test, set duration 300 and position 290 with actual fixture length 600: current near-end rules predict completion. Then demonstrate the condition with real media before claiming a browser cause. Also transition from known duration to unknown and inspect stale OS position state. |

## Historical evidence and hardware gaps

[GoogleChrome/android-browser-helper issue #305][I1] reports Android 11/Chrome 91 background cutoff on Huawei P40 and Moto Power G in 2021. It is closed. The report also describes a native timer that advances despite absent sound. 

This supports separate sound/state measurements. It does not prove a current Chromium defect, a known fix, or an installed WebAPK failure. Tora has no established TWA/native app. A bounded Chromium issue search did not establish a current root cause for these symptoms.

All real Android lock/focus/button results remain open. Cover a current Pixel-class phone and the reported user's OEM device. Use both web modes, default battery policy, Bluetooth, and a supported wired headset. Record the host browser package/target SDK before an Android 15 focus explanation. Simulated media keys, fake elements, and desktop lifecycle controls do not prove hardware behavior. 

`tests/e2e/player-behavior.spec.ts:13–65` replaces media methods/state. `src/lib/audio-controller.test.ts:175–188` supplies the interruption itself. Neither is a lock-screen hardware test.

Separate WebKit/iOS research and iPhone hardware remain outside this branch's evidence. The abstracts must retain those gaps. Later development must preserve explicit resume, one player per document, current queue behavior, and the near-end completion policy unless a focused reproduction supports a change.

## Primary sources


[C1]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/content/public/android/java/src/org/chromium/content/browser/AudioFocusDelegate.java

[C2]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/content/browser/media/session/audio_focus_delegate_android.cc

[C3]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/components/browser_ui/media/android/java/src/org/chromium/components/browser_ui/media/MediaSessionHelper.java

[C4]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/components/browser_ui/media/android/java/src/org/chromium/components/browser_ui/media/MediaNotificationController.java

[C5]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/components/browser_ui/media/android/java/src/org/chromium/components/browser_ui/media/AudioBecomingNoisyReceiver.java

[C6]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/content/browser/media/session/media_session_impl.cc

[C7]: https://chromium.googlesource.com/chromium/src/+/102d0d1a9b57dae89fe712fc79b66cf9272309a8/third_party/blink/renderer/modules/mediasession/media_session_type_converters.cc

[A1]: https://developer.android.com/media/optimize/audio-focus

[A2]: https://developer.android.com/about/versions/13/behavior-changes-13#playback-controls

[W1]: https://w3c.github.io/mediasession/

[P1]: https://web.dev/articles/webapks

[P2]: https://developer.chrome.com/docs/web-platform/page-lifecycle-api

[I1]: https://github.com/GoogleChrome/android-browser-helper/issues/305
