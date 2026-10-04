# Tora Player: WebKit and iOS research

Date: 2026-10-04. Read-only research for abstracts and later development prompts.

## Evidence boundary

- Tora worktree: `/Users/liorelisha/tora-playback-reliability`, branch `codex/playback-reliability`, clean at `7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a`.
- Read the main checkout's `AGENTS.md`, `CLAUDE.md`, and the supplied `tora-player-astra-sol-handoff.md`.
- Read only the assigned prior transcript, `agent-a751bf1dd60d454bb.jsonl`. It ends with a session limit, without a final report. Rechecked useful source paths independently.
- Reused its WebKit clone without changes. Verified source revision `f61e4bfbb6a7962713e291931fa7f48d2ee824e0`, dated October 4, 2026.
- Also fetched source in memory at `d60793ae18be892cdc16459584a7b00283ffefbd`, the current head of `safari-7625.1.29.18-branch`.
- A Safari branch name is source provenance, not proof of the exact binary on a phone. Main can contain unshipped changes.
- No implementation, repository writes, tests, browser interaction, hardware verification, production reads, or production writes occurred. Only this report was saved.
- Earlier duration tests use supplied events and fake elements. They establish modeled application behavior, not actual browser event sequences.

## Findings

### 1. Media Session does not give Tora permanent ownership of OS controls

**Confidence: high for API limits, low for the reported Spotify root cause.** The browser chooses the active Media Session. `playbackState` does not control routing. Metadata is a presentation input, not a focus request. See the [Media Session model](https://w3c.github.io/mediasession/#mediasession-model).

Tora registers play, pause, stop, seek, and track actions once. It renews metadata when a track changes or playback starts: `src/hooks/use-media-session.ts:85–145`. It uses explicit controller actions. 

Visible-page return only calls `audioEngine.refresh()`: `src/lib/audio-controller.ts:390–398`. This is suitable for state reconciliation without an app-issued automatic play request.

WebKit itself can suspend and later resume media. Resume depends on interruption flags and previous state: [Safari branch PlatformMediaSession.cpp:204–251](https://github.com/WebKit/WebKit/blob/d60793ae18be892cdc16459584a7b00283ffefbd/Source/WebCore/platform/audio/PlatformMediaSession.cpp#L204). Native [Apple interruption guidance](https://developer.apple.com/documentation/avfaudio/handling-audio-interruptions) explains OS sessions. It does not expose those native notifications directly to web JavaScript.

**Counterevidence:** Tora already preserves the loaded source and avoids a seek on ordinary resume. `audio-engine.ts:76–105` and `audio-controller.ts:132–136` support this. A Spotify widget after takeover does not prove that Tora lost its lesson. Neither metadata renewal nor the single-element design guarantees that the OS returns controls after a long pause.

**App control:** retain track and position, reconcile element state, make one explicit play request, handle rejection, renew metadata after actual playback. The app cannot guarantee widget persistence, activate Spotify, or force a headset command to target Tora.

### 2. Distinguish a missing OS widget from a missing app player or document reload

**Confidence: high for code behavior, low for the observed failure path.** Tora persists `currentTrack`, queue, queue index, and `resumePosition`. It restores paused intent and restores time from the checkpoint: `src/stores/audio-store.ts:269–297`. A pause changes intent, not the selected track: lines 250–255.

The mini player disappears when `currentTrack` is absent: `src/components/player/mini-player.tsx:23`.

Checkpoints occur from time updates, pause/error, hidden state, and pagehide: `audio-controller.ts:199–213,302–317,349–355,390–398`. The nominal five-second interval depends on event delivery. It is not an independent guarantee during suspension.

The historic claim that installed iOS web apps cannot play background audio is too broad. [Bug 198277](https://bugs.webkit.org/show_bug.cgi?id=198277) is RESOLVED DUPLICATE of [232909](https://bugs.webkit.org/show_bug.cgi?id=232909), which is RESOLVED FIXED. The issue includes a report of background audio in iOS 15.4 standalone/fullscreen apps, with simulator lock-screen uncertainty.

The [Safari branch restriction code](https://github.com/WebKit/WebKit/blob/d60793ae18be892cdc16459584a7b00283ffefbd/Source/WebCore/platform/audio/ios/MediaSessionManagerIOS.mm#L74) distinguishes Audio, WebAudio, and VideoAudio. It does not establish identical process lifetime for Safari and installed PWAs. Audio-only HTMLAudioElement playback must not inherit AudioContext/video conclusions without a reproduction.

**Counterevidence:** an unchanged track after unlock disproves actual lesson loss in that run. A document reload with intact storage can restore paused playback. These are different outcomes from a live document with stale UI.

**App control:** durable checkpoints and correct hydration. No web API guarantees that a paused document stays alive or remains the OS control target indefinitely.

### 3. Headset toggles and disconnects have separate paths

**Confidence: high for the source command path, unverified on hardware.** WebKit maps a toggle command to play or pause from the media element's `paused()` state: [MediaElementSession.cpp:1567–1569](https://github.com/WebKit/WebKit/blob/f61e4bfbb6a7962713e291931fa7f48d2ee824e0/Source/WebCore/html/MediaElementSession.cpp#L1567). Tora uses separate idempotent play/pause handlers rather than a second toggle: `use-media-session.ts:90–105`.

WebKit treats `OldDeviceUnavailable` as a reason to pause: [MediaSessionHelperIOS.mm:588–600](https://github.com/WebKit/WebKit/blob/f61e4bfbb6a7962713e291931fa7f48d2ee824e0/Source/WebCore/platform/audio/ios/MediaSessionHelperIOS.mm#L588). Its [route handler](https://github.com/WebKit/WebKit/blob/f61e4bfbb6a7962713e291931fa7f48d2ee824e0/Source/WebCore/platform/audio/ios/MediaSessionManagerIOS.mm#L188) pauses eligible audio sessions. This is an internal OS route path, not necessarily a JavaScript Media Session `pause` callback.

Tora reads the element on pause/status events, saves progress, and clears play intent: `audio-engine.ts:40–51,208–224`, `audio-controller.ts:302–334`, `audio-lifecycle.ts:39–50`. Next/previous moves within the queue, else seeks −15/+30: `audio-controller.ts:529–540`.

**Counterevidence:** these paths already exist. No evidence establishes duplicate headset handlers or a reconnect autoplay defect. Button gesture mappings differ by accessory and OS. Do not assume that one physical gesture always means `nexttrack`.

**App control:** respond once per delivered action and preserve position after the element pauses. Record OS delivery separately from physical press counts. The app cannot guarantee delivery to a suspended page or one OS callback per arbitrary accessory gesture.

### 4. Seek callback offsets and OS labels are different evidence

**Confidence: high for code/API/source, unverified for actual labels.** Tora uses supplied `seekOffset`, else −15/+30: `use-media-session.ts:94–95`, `player-track-actions.ts:77–78`. The [action-details contract](https://w3c.github.io/mediasession/#dictdef-mediasessionactiondetails) defines an optional positive offset. It offers no setter for a preferred interval or OS icon number.

Both inspected WebKit revisions use 15 seconds for skip commands. The [Safari branch implementation](https://github.com/WebKit/WebKit/blob/d60793ae18be892cdc16459584a7b00283ffefbd/Source/WebCore/platform/cocoa/RemoteCommandListenerCocoa.mm#L124) supplies a default and reads the OS callback interval at lines 198–211. [MediaElementSession.cpp:1584–1592](https://github.com/WebKit/WebKit/blob/f61e4bfbb6a7962713e291931fa7f48d2ee824e0/Source/WebCore/html/MediaElementSession.cpp#L1584) transfers it to `seekOffset`.

The [August 2025 commit](https://github.com/WebKit/WebKit/commit/2d26a621c91c7305c8e005842a69a0ab1a0bb07c) explicitly separates a default callback amount from a numeric Now Playing label. It retains the default but deliberately avoids a preferred-label option because page code can override the request.

**Counterevidence:** these sources do not establish the reported 10-second icons. A callback of 15 can correctly produce +15 externally while the in-app control produces +30. A boundary clamp can also make the actual jump smaller than the callback amount.

**App control:** callback response, fallback policy, and in-app labels. The app cannot set native numeric labels through the standard API. Keep the external interval policy open. Do not silently change the documented in-app intervals.

### 5. Stale/incorrect position state can affect native progress independently of audio

**Confidence: high for code path, medium for WebKit consequence, unverified on phones.** `use-media-session.ts:68–78` returns for duration ≤0 without a call to clear prior position state. A known-duration track followed by an unknown-duration track can retain the prior state. An underestimated duration also clamps the reported position to the wrong end.

WebKit's [MediaSession.cpp:599–606](https://github.com/WebKit/WebKit/blob/f61e4bfbb6a7962713e291931fa7f48d2ee824e0/Source/WebCore/Modules/mediasession/MediaSession.cpp#L599) uses supplied position state to override Now Playing duration/rate/position. Empty state clears it in lines 424–434. This supports a native-progress hypothesis, not proof of an OS screenshot.

Completion uses the element duration: `audio-controller.ts:184–195`. `lesson-progress.ts:37–40,55–67` can classify a position as near the end of an underestimated file. 

The actual end path uses that duration too: `audio-lifecycle.ts:44–50`, `audio-controller.ts:215–238`. An unknown-duration end can take the advance path. These are modeled application risks, not evidence that WebKit emitted a premature `ended` event.

**Counterevidence:** finite, correct metadata updates can replace stale state. Correct-duration files use the intended last-minute/last-5% policy. A browser can also report a real natural end correctly. Do not adopt a blanket duration maximum, shrinking-duration rejection, or end rejection.

## Version and historical-bug caveats

- The official [Safari 27.0 announcement](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/) is dated September 17, 2026. Use iOS/Safari 27 as a current comparison, alongside the exact affected build. The user's build remains unknown.
- [October 2 commit e4b84cf](https://github.com/WebKit/WebKit/commit/e4b84cf548cfaa58b906f9709b96c382821f3154) fixes seek command registration after seekability changes with site isolation. The inspected Safari branch lacks this change. The added test targets macOS WKWebView. No released iOS fix or Tora cause follows from this evidence. Bug 326021 was inaccessible through the web reader. The public commit supplies the evidence.
- [261554](https://bugs.webkit.org/show_bug.cgi?id=261554) is RESOLVED FIXED. It concerns AudioContext suspension, with additional HTMLAudioElement reports on iOS 17.2–17.3 and a reporter's 17.5 success. It does not prove a current Tora defect or justify a silent second element.
- [308083](https://bugs.webkit.org/show_bug.cgi?id=308083) is RESOLVED FIXED, landed February 18, 2026. It concerns media that starts muted and later pauses. No evidence matches that trigger in Tora's normal unmuted path. Release inclusion remains unverified.
- Safari 27 notes mention a `setActionHandler` exception fix. The [actual commit](https://github.com/WebKit/WebKit/commit/7503ebe002c0a59ad64c4844e0458d363cbf6df9) concerns hangup/slides/PiP actions. Tora does not register those actions. It is counterevidence to a blanket claim that this fix resolves Tora controls.
- [Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/#media) added Ogg Opus/Vorbis support on iOS 18.4. Compatibility depends on container and OS version. This does not certify each lesson's duration or byte stream.
- The separate [Audio Session draft](https://w3c.github.io/audio-session/#htmlmediaelement) assigns HTMLMediaElement a playback default. A feature-detected `navigator.audioSession` experiment can compare focus behavior. It does not guarantee page lifetime or native control ownership. Do not select `transient` or mixed audio for long lessons from anecdotal workarounds.

## Falsifiable hypotheses and exact later tests

Use an anonymous diagnostic build with progress/listen requests disabled or redirected locally. Do not alter production DB/R2. Keep fixture files and diagnostic code outside the repository until implementation authorization.

Record device, OS build, browser version, mode, app revision, service-worker revision, accessory/firmware, lesson/part, source type, and sleep-timer state. Use the same verified file in each mode. First run with sleep timers off.

| Hypothesis | Exact test and disproof condition |
|---|---|
| H1: OS controls disappear but the app retains the lesson. | Start at 120s. Lock, pause from OS UI, wait 10s/2min/15min, then unlock. Repeat after home-screen background. Record widget, boot/document ID, current track, queue, live time, checkpoint, and audio identity. One explicit in-app Play must retain track and advance from the pause position. A null track or new document identifies a separate path. |
| H2: Spotify changes command ownership rather than deleting Tora state. | Play Tora to 120s. Start Spotify for 30s. Pause Spotify. Try one headset press while Tora is hidden, then one in-app Play after return. Capture recipient, callback counts, play promise/result, element events, track, and time. Repeat Safari/PWA. If a Tora callback arrives but play fails, ownership alone is insufficient. |
| H3: a physical press causes duplicate actions in the app. | Perform 20 alternating single play/pause presses, two seconds apart, foreground and locked. Log each physical press and delivered action. Repeat with BT and supported wired controls. Each delivered action must produce one controller command. Multiple OS deliveries are distinct from app duplication. |
| H4: route loss bypasses Media Session but pauses the element correctly. | Disconnect at 120s while audible. Reconnect after 10s. Capture pause/status events, action callbacks, time and intent. Wait 10s without a command. Require silence. Explicit Play must retain position. No pause/status change, or unsolicited reconnect audio, rejects the expected path. |
| H5: native interval mismatch comes from callback/default behavior. | At 120s in a ≥300s file, photograph both OS controls. Press each once while paused. Record action, offset presence/value, before/after currentTime. Repeat at 5s and duration−5s, then repeat while audible with timestamps. Compare in-app −15/+30 and external offset-based deltas. A label mismatch alone does not establish callback failure. |
| H6: stale position state survives an unknown-duration transition. | In a local fixture, register the captured app handlers and intercept setPositionState calls. Play A with duration 300. Select B with duration 0. Observe metadata B and position state calls. Then allow B's finite metadata. Compare WebKit native display if available. A clear-state call or immediate correct B state disproves persistence for that run. |
| H7: duration error causes wrong completion/resume. | Use a complete known-length file plus an intentionally inaccurate catalog fixture. Record catalog, element duration changes, time, ended/error, local completion, and resume part. Compare full-download playback with stream and offline Blob. Separately interrupt a local HTTP response. Require observed events before any claim of premature natural end. Correct element duration and correct completion disprove the catalog-only cause. |

Log `play`, `playing`, `pause`, `waiting`, `stalled`, `suspend`, `error`, `ended`, `loadedmetadata`, `durationchange`, `seeking`, `seeked`, visibility and pagehide. Capture `paused`, `ended`, error code, readyState, networkState, currentTime, duration and seekable ranges. Redact signed URLs and user identifiers. An HTMLMediaElement `suspend` event alone is not proof of document suspension. A resolved `play()` promise is not proof of audible output.

## Open hardware gaps and prompt requirements

No physical iPhone, Android phone, headset, lock-screen screenshot, Spotify takeover trace, or long-pause result exists from this research. All H1–H7 tests remain proposals.

Run Safari tab and installed PWA separately on the affected iOS build and a current iOS 27 device. Repeat the common behavioral tests on Android Chrome tab and installed PWA. WebKit source provides no Android behavioral proof. Android engine analysis belongs to its separate research branch.

Browser automation can check local state, modeled callbacks, and fixture duration behavior. Real hardware must establish OS focus, headset delivery, disconnect routing, audible output, and document lifetime. Repeat key runs without a remote inspector, which can change background lifetime.

Later prompts must require: one explicit resume, retained lesson/part/position, no visibility-triggered reclaim, no duplicate actions, documented seek policy, accurate local completion, and separate hardware outcomes. Native widget persistence remains a platform-dependent observation, not an unconditional app acceptance promise.
