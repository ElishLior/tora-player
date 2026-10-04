# Tora Player field reports: playback lifecycle and duration

Research date: 2026-10-04. Research branch label: `research:field-reports`.

## Scope and revision

This report supports abstracts and later development prompts. It proposes investigation steps, not fixes.

The inspected checkout is `/Users/liorelisha/tora-playback-reliability`. Its branch is `codex/playback-reliability`. HEAD is `7c51a08c7ff4e3bdb023c8e8e7ab17bea2681c1a`, dated 2026-10-01. The commit subject is `docs(skills): add verify-tora verification skill (#29)`. `git status --porcelain=v1` returned no entries before report creation. This revision is a local source baseline, not evidence of the deployed production revision.

I read `/Users/liorelisha/Tora player/AGENTS.md`, its full `CLAUDE.md`, the implementation checkout's `CLAUDE.md`, and the supplied Astra/Sol handoff. The handoff path is `docs/handoffs/2026-10-04-playback/handoff-1-research-and-abstracts.md`.

I made no repository edits, commits, pushes, PRs, deployments, or production DB/R2 writes. I did not open the production player. No nested delegation occurred. The requested Markdown report is the only file written by this research.

## Result and evidence limits

Versioned browser reports corroborate several symptom classes. None establishes Tora's cause. The strongest matches concern long pauses with headphones, PWA lock-screen resume, Android Bluetooth command translation, and Ogg/Opus duration.

The current code already retains the selected track and a resume checkpoint. It reflects external pauses and uses the loaded element for warm resume. A missing OS media widget therefore does not establish lost Tora state.

No real device, simulator, browser reproduction, file decode, or test execution occurred in this research. Source inspection is **static evidence**. Numeric examples below are **modeled consequences**. External reports are **reporter device evidence**, not device evidence from Tora. Current fake-element tests are not mobile browser tests.

Confidence labels:

- **High:** directly inspected code behavior, source status, or a maintainer's stated resolution.
- **Medium:** a specific external reproduction with versions and artifacts, without independent reproduction here.
- **Low:** a proposed connection between those reports and an unidentified Tora failure.

An open issue proves that the tracker lacks a recorded resolution. It does not prove that every current release remains affected.

## Recovery of the interrupted branch

The prior workflow directory is `/Users/liorelisha/.claude/projects/-Users-liorelisha-Tora-player/c41b386e-7774-48f5-b43b-3ab82cbda9e1/subagents/workflows/wf_ce052562-105`.

`agent-a34d1c1d9dda652e1.meta.json` identifies `workflow-subagent` with description `research:field-reports`. In its transcript, lines 157–159 contain web searches. Lines 169–170 request the Apple forum and Foray PR examined below. Line 278 ends with a session-limit message. There is no usable final field-report answer in the inspected assistant text. I verified those leads independently and did not treat the interrupted work as a conclusion.

The supplied handoff reports scratch duration tests in `/private/tmp/bug4`. I did not rerun them or adopt their proposed duration rules. The latest Claude retry's API rate limit is task context, not a new research result.

## Primary reports and resolution evidence

### F1. iOS standalone background audio: historical resolved defect

**Versions and reproduction:** WebKit 198277 describes a home-screen standalone app with an HTML audio element. Start audio, then leave the app. Audio stops, while a Safari tab continues. Its history includes reports through iOS 15.3 and reduced display-mode cases.

**Resolution:** The issue is `RESOLVED DUPLICATE` of 232909. Maintainers confirm the change shipped in **iOS 15.4**, not 15.4.1. The target issue is `RESOLVED FIXED`, with landed platform patches.

**Counterevidence:** Early beta confirmations conflict with other beta results. This is a historical fixed defect, not a current blanket PWA restriction.

**Confidence:** High for documented resolution. Low for Tora causation. Compare tab and true standalone mode on the same affected phone.

Sources: [198277, description and comments 65–76](https://bugs.webkit.org/show_bug.cgi?id=198277), [232909, patches and resolution](https://bugs.webkit.org/show_bug.cgi?id=232909).

### F2. Safari loses controls after a long pause and headphone resume

**Version:** **iOS 15.6**, Safari, iPhone. The reporter used AirPods Pro and a Jabra Bluetooth headset.

**Reproduction:** Open Google's Media Session audio sample. Play, pause through Notification Center or headphones, switch apps, wait two minutes, then resume through headphones. The controls change to “Not Playing” and disappear. The report includes a screen capture.

**Resolution:** WebKit 243256 remains `NEW` in the inspected page. No patch or fixed release appears.

**Counterevidence:** The report does not measure Tora state or establish that the element unloads. It predates the unknown affected Tora device version.

**Confidence:** Medium for the reported device failure. Low for Tora cause. Record widget presence, audible sound, element position, and retained track separately.

Source: [243256, description and attachment 461252](https://bugs.webkit.org/show_bug.cgi?id=243256).

### F3. PWA lock-screen resume fails after a 30-second pause

**Version limitation:** Apple's developer forum thread dates to **August 2024**, but gives no exact iOS build, browser version, or phone model.

**Reproduction:** Use an HTML audio element in an iOS PWA with Media Session play/pause handlers. Pause for 30 seconds, then press lock-screen Play. Resume fails until the PWA returns to the foreground. The same reporter says Android does not fail under those steps.

**Resolution:** No Apple engineer diagnosis, accepted fix, or fixed OS release appears. Both replies come from the original author.

**Counterevidence:** This is a concrete first-person report, but it is not version-specific enough for a release claim. The author's unrelated policy and Wake Lock claims are not technical evidence here.

**Confidence:** Medium-low for corroboration. Low for Tora cause.

Source: [Apple developer forum 762582, original reproduction](https://developer.apple.com/forums/thread/762582).

### F4. Background next-track failures: similar symptoms, different paths

**Historical report:** WebKit 221413 starts with iOS 14/Safari 14 FairPlay playback. Comment 4 supplies a non-DRM audio reproduction: after source replacement in the background, `paused` is false but `currentTime` remains zero and no sound occurs. Another commenter reports success after an update from 15.5x to **15.7.2**. The tracker remains `NEW`.

**Later report:** WebKit 261554 has an AudioContext-focused title. Its comments also report plain single-element next-track failure on **17.2.1**, failures through **17.3.1**, and success on **17.5**. A fix landed at `275558@main` on March 1, 2024.

**Counterevidence:** Commenters mix AudioContext and plain-element cases. One 221413 commenter already had a functional playlist and asked about asynchronous work. Tora's current path uses a plain element and source prefetch. The 17.5 success is a reporter result, not universal release proof.

**Confidence:** Medium for the reported cases. Low for Tora cause. Observe next-part boundaries and the next `play()` outcome while locked.

Sources: [221413, comments 4–6](https://bugs.webkit.org/show_bug.cgi?id=221413), [261554, comments 7–19](https://bugs.webkit.org/show_bug.cgi?id=261554).

### F5. Android Bluetooth pause/resume dead zone and command translation

**Browser-owned code evidence:** Chromium commit `40b3198`, November 19, 2025, describes a roughly five-second dead zone after pause. It links bug 425993404 and attributes the problem to Chrome/Android AVRCP synchronization. Its change interprets certain redundant pause commands as resume.

A later commit, `f410bcd`, March 16, 2026, links bug 483553585. It narrows that behavior to an already-paused session with `KEYCODE_MEDIA_PAUSE`, `ACTION_DOWN`, and event time zero. It also adds tests for system events.

**Resolution limit:** Both changes landed in Chromium source. I did not establish their first released Chrome milestones. The linked issue 425993404 was inaccessible through the web tool. Do not label an affected Chrome version from commit dates alone.

**Counterevidence:** Native command translation can differ from the JavaScript action received by Tora. Neither commit reports Tora or installed-PWA behavior.

**Confidence:** High for the inspected source history. Low for Tora cause.

Sources: [40b3198, description and tests](https://github.com/chromium/chromium/commit/40b319892834bd2bf86cc637551af64464102cab), [f410bcd, description and diff](https://github.com/chromium/chromium/commit/f410bcdf59d5e26881961132bc6fc5432f269bfe).

### F6. Android multipoint headset sends pause, browser resumes

**Versioned field report:** Brave issue 57896 reports **Brave 1.93.130 / Chromium 151.0.7922.71** on Pixel 8a build `CP2A.260705.006`. Accessories include Soundcore Liberty 5 firmware `03.90` and a Fedora 44 laptop.

**Reproduction:** Enable Bluetooth dual connections. Play YouTube on the phone, pause it, then play on the laptop. Around three seconds later, the phone receives pause and Brave resumes and reclaims the audio route. The report includes timestamp sequences.

**Resolution:** The issue remains open. Its checkbox for reproduction in current Chrome is unchecked. The reporter cannot confirm the native event-time-zero condition.

**Independent source check:** At Chromium revision `0577f09cf0153cbf386066b83dbb1cf727e00144`, `MediaNotificationController.java:340–354` contains the conditional path described in F5.

**Counterevidence:** This is Brave/YouTube/multipoint evidence, not Chrome/PWA/Tora proof.

**Confidence:** Medium for the reporter sequence. High for the source branch. Low for attribution.

Sources: [Brave 57896](https://github.com/brave/brave-browser/issues/57896), [pinned Chromium source](https://chromium.googlesource.com/chromium/src/+/0577f09cf0153cbf386066b83dbb1cf727e00144/components/browser_ui/media/android/java/src/org/chromium/components/browser_ui/media/MediaNotificationController.java).

### F7. Ogg/Opus duration and timeline errors in Safari

**Versions:** WebKit 293310 reports **Safari 18.5 (20621.2.5.11.8)** on macOS Sequoia. An Ogg/Opus file shows 7:58:26 instead of ffprobe's 7:32:36.61. Container and codec controls report the expected duration.

Later comments report persistence in **Safari 26.1**, macOS 27 beta/release, and an independent **iOS 26.6.1** case. The September 1, 2026 reproduction uses local files, identical Opus data in different containers, ffprobe, and Ogg granule checks. It reports altered wall duration and timestamp seeks, not only display metadata.

**Resolution:** `NEW`. The byte-size/bitrate explanation is the commenter's hypothesis, not a maintainer-confirmed root cause.

**Counterevidence:** The principal examples overestimate duration. They do not prove Tora's reported underestimates. Locally loaded bytes exclude HTTP as the cause of those examples only.

**Confidence:** Medium for external reproducibility. Low for a Tora file match. This is the most relevant format-specific lead.

Source: [293310, description and comments 1–6](https://bugs.webkit.org/show_bug.cgi?id=293310).

### F8. Safari MP4 duration selects a shorter stream

**Version:** **Safari 18.2 (20620.1.16.11.8)**, macOS 15. WebKit 287435 supplies a sample webpage and screenshot. A two-stream MP4 reports **5.280 seconds** instead of **5.312 seconds**. Chrome 131 and Firefox 128.5.2 ESR report the longer value. A follow-up confirms WebKit `290264@main`.

**Resolution:** `NEW` in the inspected tracker.

**Counterevidence:** This is desktop video with AVC and AAC streams. Its 32-millisecond difference cannot explain a large audio-only Tora discrepancy without new evidence.

**Confidence:** Medium for the reported case. Very low for Tora cause.

Source: [287435, description and comments 2–4](https://bugs.webkit.org/show_bug.cgi?id=287435).

### F9. An apparent truncated MP3 report did not establish a browser fix

**Version:** Safari 14, iPhone. WebKit 219167 describes MP3 playback that stops or restarts after 30–45 seconds and shows a live-stream label.

**Resolution:** `RESOLVED WORKSFORME`. The reporter first attributed the issue to headers, then reported that those changes failed. Finally, an absolute source path allowed full playback. The live-stream label remained.

**Counterevidence:** The report lacks a robust reduced case and a confirmed platform defect. It does not validate the header workaround, a Vercel timeout, or Tora's stream behavior.

**Confidence:** Low as cause evidence. Useful evidence that similar symptoms can have different causes.

Source: [219167, comments 1–4](https://bugs.webkit.org/show_bug.cgi?id=219167).

### F10. Spotify/car report from a native wrapper: architecture mismatch

Foray PR 746 reports an **iPhone app build 2026092326**, without an exact iOS version. After pause, lock, and car connection, car Play resumes Spotify. It also reports external 10-second skips versus in-app 15/30.

The PR merged September 23, 2026. Its description includes Swift/Capacitor audio-session code and a replaced Media Session object. It reports modeled tests but explicitly leaves phone/car behavior unverified in that work.

**Counterevidence:** Tora has no native wrapper, Swift plugin, native audio-session API, or second command bridge. The PR's app-specific cause and code changes do not transfer to Tora. A merged PR does not prove hardware resolution.

**Confidence:** Medium-low as symptom corroboration. Very low as cause or fix evidence. No versioned primary report found here proves that a Spotify takeover forces Tora's later explicit foreground resume to fail.

Source: [Foray PR 746, description and device-verification limits](https://github.com/JW-Incorporated/foray/pull/746).

## Platform contracts and boundaries

WebKit's Safari 18.4 release notes introduce Ogg/Opus and Ogg/Vorbis support on **iOS/iPadOS 18.4 and macOS 15.4**. Unsupported-format failure on an older device is a separate class from lifecycle failure. Verify actual bytes and browser support. A filename alone does not establish the container. [Safari 18.4 media notes](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/).

The Media Session specification defines optional positive `seekOffset` for interval actions. It distinguishes interval seeks from next/previous track. It treats declared `playbackState` as a hint and defines an empty `setPositionState` dictionary as a clear operation. It does not guarantee a persistent lock-screen widget or expose a portable hardware-source identifier. The inspected interface does not offer native `preferredIntervals`. [Media Session specification, sections 5 and 10](https://w3c.github.io/mediasession/).

The HTML specification permits unknown/unbounded duration values and requires `durationchange` when the known length changes. Duration is a timeline value, not an independently measured wall duration. Preserve raw NaN/Infinity in evidence instead of the same zero value. [HTML media duration contract](https://html.spec.whatwg.org/multipage/media.html#dom-media-duration).

Android documents audio-focus behavior that differs by OS version. Android 12 adds system-enforced fade/mute conditions. Native APIs and foreground-service rules describe the browser's environment. They are not JavaScript APIs for Tora. [Android audio focus](https://developer.android.com/media/optimize/audio-focus).

Do not import AudioContext workarounds into a plain HTMLAudioElement diagnosis. For example, WebKit 270352 fixes resume through AudioContext at `278859@main`, with no exact released version stated. WebKit 276016 reports AudioContext behavior on 17.5.1/17.6. Those paths differ from Tora's playback engine. [270352](https://bugs.webkit.org/show_bug.cgi?id=270352), [276016](https://bugs.webkit.org/show_bug.cgi?id=276016).

## Current Tora code evidence

All code references below use the verified checkout and revision above. These are observed source facts, not device results.

| ID | Source | Fact and investigation consequence |
| --- | --- | --- |
| C1 | [audio-engine.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-engine.ts:77), lines 77–105, 190–205 | Warm load of the same track/source does nothing. One playback element is reused. `play()` reloads only when the element has an error. It reports `NotAllowedError` but otherwise suppresses rejection details. Record every promise outcome before attributing silent failure. |
| C2 | [audio-resume.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-resume.ts:31), lines 31–54. [audio-controller.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:110), lines 110–153 | Warm resume calls play without a seek. A cold or unresolved offline source uses asynchronous lookup. Separate warm resume, cold restore, and unknown-download-state cases. |
| C3 | [audio-controller.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:302), lines 302–345, 390–405 | External pauses synchronize intent. Foreground visibility refreshes state and does not directly invoke play. The distinct online-recovery handler can invoke play after an offline failure. Record event order instead of treating every unsolicited resume as a visibility action. |
| C4 | [audio-store.ts](/Users/liorelisha/tora-playback-reliability/src/stores/audio-store.ts:269), lines 269–297. [audio-controller.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:199), lines 199–212, 349–355 | Track, queue, and resume checkpoint persist. Play intent does not persist. Checkpoint updates occur about every five seconds when time updates arrive, plus pause/hidden/pagehide paths. Timer suspension or process termination can affect checkpoint freshness. |
| C5 | [use-media-session.ts](/Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:90), lines 90–112, 123–140 | One effect registers play/pause/stop, seek, and track actions. Registration errors are swallowed. Metadata reasserts when playback starts. OS seekOffset wins over in-app constants. There is no inspected app-native duplicate command bridge. |
| C6 | [audio-engine.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-engine.ts:168), lines 168–170, 232–250. [audio-controller.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:419), lines 419–420 | Non-finite media duration becomes zero. Positive element duration updates the store. Seek and restored position clamp to the element duration. Preserve raw element duration and its source chronology. |
| C7 | [lesson-progress.ts](/Users/liorelisha/tora-playback-reliability/src/lib/lesson-progress.ts:37), lines 37–67. [audio-controller.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.ts:184), lines 184–238 | Near-end threshold uses the smaller of 60 seconds and 5%. Completion on checkpoints uses observed duration. Resume uses positive catalog duration before saved observed duration. Finishing a track saves engine duration as position. Wrong durations can affect both progress and resume. |
| C8 | [use-media-session.ts](/Users/liorelisha/tora-playback-reliability/src/hooks/use-media-session.ts:68), lines 68–78. [seek-bar.tsx](/Users/liorelisha/tora-playback-reliability/src/components/player/seek-bar.tsx:61), lines 61–63 | Position state clamps currentTime to store duration and skips writes for duration ≤ 0. The seek bar caps progress and remaining time. These display rules can hide a duration mismatch. |
| C9 | [audio-lifecycle.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-lifecycle.ts:35), lines 35–54 | An ended state retries only if positive duration exceeds position by more than two seconds. Unknown duration advances. A fake end demonstrates this rule, not real stream-truncation behavior. |
| C10 | [stream route](/Users/liorelisha/tora-playback-reliability/src/app/api/audio/stream/[fileKey]/route.ts:9), lines 9, 40–68. [sw.js](/Users/liorelisha/tora-playback-reliability/public/sw.js:196) | The route sets maxDuration 300, forwards Range, and passes upstream length/range headers. The service worker excludes API paths. No request trace proves timeout or truncation here. Network caching and deploy configuration still require measurement. |
| C11 | [audio-utils.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-utils.ts:51), lines 51–69. [audio-download.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-download.ts:1) | Metadata extraction uses a separate temporary decoder element and rounds finite positive duration. Unknown values return zero. The MIME map labels `.opus` as `audio/ogg`. Playback still uses one engine element. Catalog provenance requires separate inspection. |
| C12 | [audio-engine.test.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-engine.test.ts:5), [audio-controller.test.ts](/Users/liorelisha/tora-playback-reliability/src/lib/audio-controller.test.ts:16) | Existing tests define fake audio elements and inject events. I inspected their structure but did not run them. They cannot establish OS command delivery or sound output. |

## Falsifiable hypotheses for later investigation

| Hypothesis | Current confidence | Disproof or decisive test |
| --- | --- | --- |
| H1. The OS drops or changes the active media session while Tora retains its track. | Low cause confidence. F2/F3 corroborate the class. C4 argues against assuming state loss. | Pause at a known time. Inspect widget and Tora callback logs before foreground return. Record a stable document ID and retained track. A new document, missing persisted track, or a delivered callback with an app-side failure points elsewhere. |
| H2. Cold resume crosses asynchronous source lookup and loses required activation. | Low. C2 proves an async path, not a browser rejection. Warm resume is counterevidence. | Compare loaded resume, restored stream, resolved offline Blob, and unresolved offline lookup. Capture handler time, load time, play-call time, user activation, and promise outcome. No rejection or no path-dependent difference weakens this hypothesis. |
| H3. Android translates or drops a headset command before Tora receives it. | Low for Tora. F5/F6 provide browser-level mechanisms. | Compare physical presses at 1, 3, and 6 seconds after pause. Correlate native logs and JavaScript callbacks. A correct single callback followed by wrong controller behavior places the failure in Tora. |
| H4. The decoder reports a wrong duration or timeline for a specific asset. | Low for a Tora file. F7 is a relevant format lead. | Compare identical bytes through proxy, complete local Blob, and a plain audio control. Record decoded sample duration, wall duration, raw duration history, and timestamp seeks. A proxy-only discrepancy argues against a container-only cause. |
| H5. An underestimated duration makes near-end completion or resume incorrect. | High conditional source confidence. Unknown occurrence on real assets. | Use a test asset with verified length and a separately varied catalog value. Compare normal element duration versus an injected underestimated element value. Observe saved completion and subsequent resume. Accurate real values with unchanged behavior disprove this explanation for that incident. |
| H6. An unknown-duration track retains the previous Media Session position state. | High conditional source confidence. Unknown OS display effect. | First load a known-duration track, then an unknown-duration track. Observe position writes, current metadata, and OS display. A browser clear independent of the app means there is no stale visible widget on that device. |
| H7. An interrupted byte response produces a premature ended state that Tora misclassifies. | Low. C9 proves classification only. No device/network evidence. | Use a controlled non-production server with valid and deliberately incomplete responses. Capture byte ranges, error/ended order, raw duration, position, and recovery. A media error rather than ended falsifies the stated end-event path. |
| H8. Reload/process eviction changes the symptom from warm resume to persisted restore. | Low incident confidence. C4 proves restoration design. | Compare document boot IDs, page lifecycle, storage read result, selected track, and last checkpoint before/after a long pause. A stable document and intact live element argue against eviction. |

Modeled example for H5: if actual content lasts 1,800 seconds but the engine reports 1,000, position 950 satisfies the 50-second near-end threshold. This is arithmetic over C7, not a Tora file measurement. A wrong catalog value alone does not prove that the engine reports the same value.

An overestimate does not automatically prove premature-end retries. C9 requires an end position that remains below reported duration by more than two seconds. A scaled timeline that ends at its reported duration does not meet that condition. Record both timeline and wall time.

## Practical real-device matrix

### Environment rows

Assign physical devices before execution. Record exact versions at run time. Do not invent the affected device or substitute “latest” for a version.

| Row | Physical environment | Required modes | Purpose |
| --- | --- | --- | --- |
| I-A | The affected iPhone, exact model, iOS version/build, Safari UA/version | Safari tab and installed standalone PWA | Primary reproduction. Keep the original OS before any update. |
| A-A | The affected Android phone, exact model, OS/build, Chrome full version | Chrome tab and installed PWA | Primary reproduction and browser/PWA comparison. |
| I-B | A second available iPhone on a different supported OS build | Safari tab and standalone PWA | Version control. Use Ogg-capable iOS ≥ 18.4 when that format is under test. |
| A-B | A second Android device, preferably a different OEM, with exact Chrome version | Chrome tab and PWA | Separate browser effects from OEM power/route behavior. Record battery restrictions. |

The minimum hardware set is I-A plus A-A: four mode rows. I-B/A-B strengthen diagnosis and release confidence. If the reported Android browser is Brave, Samsung Internet, or Firefox, add that exact browser and its supported installed mode. Chrome alone cannot close that report.

Historical versions in F1–F8 are research anchors, not installation instructions. Do not downgrade a personal device. Use an already available historical device only when it adds evidence.

### Assets and setup

Use isolated fixtures or an authorized preview with non-production data. Tora normally sends progress and listen requests during playback. Stub or isolate `/api/progress`, `/api/listen`, and account sync before hardware runs. Do not silently write production data through ordinary playback.

Prepare these assets in the later authorized session:

- L1: verified single-part speech, at least 20 minutes, with an exact decoded duration and audible time markers.
- L2: a short clip of 60–90 seconds, with an identifiable final phrase.
- L3: a three-part lesson with original part IDs and counts. Include an earlier and a final part.
- L4: the same L3 with an offline subset that omits the real final part. Include legacy unknown-count metadata as a separate case.
- L5: a real affected file, when identified, plus its unchanged complete offline copy. Record hash, codec, container, sample rate, and size.
- L6: a controlled duration fixture with correct, underestimated, overestimated, and unknown catalog metadata. Label every modeled decoder value separately.

Use 1× speed and speaker output for the baseline. Repeat the selected seek/duration cases at 1.5×. Keep the sleep timer off except for its explicit control case. Record online state, Wi-Fi/cellular, volume, power mode, Spotify version, headset model/firmware, wear detection, and multipoint state.

### Core scenarios and exact steps

Execute P1–P7 in all four minimum mode rows. Run each short case three times. Run long cases once initially. Repeat a failure three times before cause attribution.

| ID | Procedure | Measurements and expected behavior |
| --- | --- | --- |
| P1: pause duration | Play L1 to 90 seconds. Pause in the app. Lock for 5, 30, 120, and 900 seconds in separate runs. Resume once through the available lock-screen control. Repeat 30/120 seconds with headset pause/resume. | Record widget presence and selected app before the press. If no Tora control exists, mark that surface unavailable. Then return to Tora and press Play once. Warm resume retains part/time, with no reload seek or duplicate audio. |
| P2: background without pause | Play L1. Go Home for 120 seconds. Repeat with the phone locked for 900 seconds. Return without a play action. | Record audible continuity, elapsed time, and document identity. Return alone must not initiate new playback. Use an external clock. A missing JavaScript tick does not establish silent audio. |
| P3: Spotify takeover | Play L1 to 90 seconds. Start Spotify playback. Leave it active for 30 seconds. Return to Tora and wait 10 seconds without a tap. Press Tora Play once. Repeat with Spotify paused before return. | No focus reclaim merely from return. One explicit foreground action resumes the selected Tora part near the interruption time. Check both sound sources and callback/promise order. Test OS/headset Play separately and record which app receives it. |
| P4: repeated headset commands | Pair the headset to one device. Play L1. Alternate pause/play for ten cycles with ≥6-second spacing. Then do separate pause/resume trials at 1, 3, and 6 seconds. Repeat locked. | One supported physical press produces one logical action. Record zero, one, and multiple callback cases. Preserve deliberate repeated presses. Do not infer native key identity from a JavaScript play action. |
| P5: disconnect/reconnect | While L1 plays through Bluetooth, disconnect. Wait 10 seconds. Reconnect. Wait another 10 seconds without a press. Then explicitly resume. Repeat while paused. Repeat with a supported wired remote and adapter. | Record route, sound, retained time, and auto-resume. Reconnection alone must not start playback. Mark unsupported wired buttons N/A. Test multipoint separately with the second device active. |
| P6: seek and track actions | On L1 at 90 seconds, invoke each in-app interval button once. Invoke both OS interval controls once. Repeat at 5 seconds and 10 seconds before verified end. Use L3 for next/previous track. Repeat selected cases in Hebrew RTL and English. | In-app offsets remain −15/+30. Record OS icon/label, action, supplied seekOffset, requested target, landed element time, and audible marker. Next/previous with queue neighbours remains track navigation. Without neighbours, record the documented interval fallback. |
| P7: duration and completion | Play L2 naturally to its final phrase. Play L3 across a real part boundary, including one locked boundary. Replay L5 online and from a complete Blob. Use L4 to reach the last available offline part. | Compare catalog, raw element, store, OS position, independent duration, and wall duration. Preserve near-end policy with accurate lengths. An earlier part or incomplete subset must not mark the full lesson complete. |

Additional targeted cases:

1. **P8, cold restore:** Pause at 90 seconds, close normally, then reopen. Observe retained part/checkpoint before one explicit Play. Repeat after a controlled process termination. Distinguish checkpoint tolerance from warm live-position retention.
2. **P9, duration path isolation:** Load identical bytes through the normal proxy, a complete Blob, and a plain audio element. Repeat only a discrepant asset. Compare seekable ranges and hashes before attribution.
3. **P10, interruption control:** While active, take a short call or invoke and dismiss the voice assistant. Record the return state. Repeat while already paused. No unsolicited resume is the task requirement.
4. **P11, network fault:** Use controlled slow/incomplete responses outside production. Observe real end/error behavior. Do not simulate an event and call it a browser reproduction.
5. **P12, timer control:** Repeat a known case with the sleep timer set intentionally. Record its deadline. This separates an expected timer pause from a lifecycle defect.

Use a plain HTMLAudioElement with the same fixture as a control for a failure. Compare the Google Media Session sample for control-delivery failures. A control failure supports a platform/accessory explanation. A control pass weakens it but does not alone prove Tora's cause.

## Minimal diagnostic record for later development

This is a requirements list, not an implemented logger. Keep the record local and bounded. Use an explicit diagnostic export. Do not send it to production analytics.

### Run header

Record run ID, build/commit ID, document boot ID, exact physical model, OS/build, browser/version, UA, display mode, and service-worker controller/build. Record locale, source class (`proxy`, `blob`, or control), fixture/part IDs, original part count, content hash, MIME, codec/container, and catalog duration. Include the manual accessories and power/network settings above.

Use pseudonymous fixture IDs in shared exports. Exclude titles, personal notes, account IDs, and private object paths unless needed and approved.

### Event and command rows

Record sequence number, wall timestamp, `performance.now()`, visibility, and document ID on every relevant row. A new boot ID identifies a reload. A clock gap alone does not identify an OS suspend cause.

Capture these rows:

- UI action and Media Session callback entry, with a logical command ID and action details (`seekOffset`, `seekTime`, `fastSeek`). Link controller calls to that ID.
- Audio element creation, source-class/track change, load/reload, seek request, play call, pause call, and pending-position application.
- Every play promise resolution/rejection, with name and sanitized error message. Distinguish `NotAllowedError`, `AbortError`, network/media errors, and an unresolved promise.
- `loadstart`, `emptied`, `loadedmetadata`, `durationchange`, `play`, `playing`, `pause`, `waiting`, `stalled`, `canplay`, `seeking`, `seeked`, `ended`, `error`, and sampled `timeupdate`.
- Store intent/status/issue changes, current track/part, queue index, pending-load key, recovery attempt/reaction, sleep deadline, and persisted checkpoint/completed writes.
- Media Session handler registration success/error, metadata identity, playbackState write, and position-state write or skip/error.
- `visibilitychange`, `pagehide/pageshow` with `persisted`, `online/offline`, and supported freeze/resume events. Record unavailable APIs. Do not invent event rows.

At each transition, snapshot raw `currentTime`, raw `duration`, `paused`, `ended`, `seeking`, `readyState`, `networkState`, `playbackRate`, media error code, and buffered/seekable range endpoints. Snapshot store currentTime/duration separately.

Encode non-finite numbers as explicit strings such as `NaN` and `Infinity`. JSON converts numeric NaN/Infinity to null and destroys the distinction. Sample time at most once per second plus transitions. Do not add an artificial background keep-alive loop.

The portable Media Session callback does not identify headset, car, notification, or native key source. Mark that origin **unknown** unless a manual press marker or platform trace supplies it. A single press with zero callbacks differs from two callbacks for one press.

### Byte-response and hardware evidence

For a duration/stream failure, capture sanitized request IDs, request Range, status, MIME, Content-Length, Content-Range, transferred byte count, start/end times, and failure reason. Compare complete-file hash and independently decoded duration. Do not log presigned query strings, Authorization/Cookie headers, Supabase keys, email codes, or account tokens.

Chrome's media inspection and Android media-session/audio-focus traces can add evidence when available. Export only the relevant sanitized trace. iOS Safari's remote inspector can add element evidence but cannot replace actual headphone or OS behavior.

For the core runs, keep the debugger detached. Repeat a failed run with the debugger attached afterward. DevTools, USB power, or screen capture can alter lifecycle, routes, or suspension. Use an external camera/clock and a manual sound observation where internal capture fails to record audio.

For each result, include the exact action sequence, observed audible output, widget screenshot, callback count, element/store state, reload identity, and artifact reference. Label results `real-device`, `simulator`, `desktop-browser`, `modeled`, or `not-run`.

## Evidence gates for abstracts and later prompts

The lifecycle abstract can promise an investigation of explicit resume across pause, background, audio takeover, and accessories. It cannot state that WebKit suspension, Android audio focus, duplicate handlers, or Spotify caused Tora's failure.

The duration abstract can state that duration source and timeline agreement require investigation. It cannot prescribe `max(catalog, element)`, reject every duration decrease, change seek clamps, transcode everything, or treat every end as premature.

Before a cause-specific development prompt:

1. Identify an affected physical device, exact software versions, and stable lesson/part IDs.
2. Obtain a repeatable failure and a control result on the verified revision or identified deploy.
3. Capture the raw event/command/duration record before a change.
4. State a cause that explains the failure and the counterexample.
5. Define regression evidence for that exact failure path.
6. Preserve one playback engine/controller, no visibility-triggered focus reclaim, current queue semantics, and the documented completion policy.

The external seek policy remains open. Tora currently honors a supplied OS seekOffset. In-app controls use −15/+30. Report label/callback/actual-jump evidence before a product decision. Do not claim that JavaScript can set the OS icon interval on every platform.

Remaining inputs are the affected devices/builds, an exact discrepant file, hardware access, and an isolated test endpoint. These do not block the completed read-only research. All matrix results remain **not-run**.
