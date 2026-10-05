# Playback reliability session: 2026-10-04

Notes from the October 4, 2026 work on mobile playback reliability, lesson duration and holiday titles. They were saved from temporary folders so the next session can pick them up.

## State at the end of the session

Merged into `dev` (head `b15324a`). CI passed on each PR. Not on `main`, and production is still the September 25 release.

| PR | Change |
|---|---|
| #31 | Cancels a stale retry after playback recovers, clears the previous lesson's lock-screen progress when the next duration is unknown, and makes both skips 15 seconds. |
| #32 | Holiday Fridays are titled by the holiday ("חג הסוכות", not "פרשת סוכות"). Chol HaMoed Fridays read "שבת חול המועד סוכות" / "שבת חול המועד פסח". |
| #33 | A lesson is no longer marked heard, or shown as finished, from a browser length that is too short (`trustedPartDuration`, `src/lib/part-duration.ts`). |
| #34 | Opt-in on-device playback log at `/he/diagnostics` (`src/lib/playback-diagnostics.ts`) and `docs/agents/abstractions.md`. |

A Fable review of #31 to #33 found three problems. All were fixed with failing tests first, before merging (`7eee8e5`, `d843c89`).

## Still open

- **Title rename (production data, needs owner approval).** Lesson `fb296bdf-9d25-4832-a2d9-262875d48a29` still ends in "פרשת סוכות" in both title fields. The before and after values are in #32. The admin edit page is the safest place to change it, because it refreshes the cached catalog.
- **Six parts with no catalog length (production data, needs owner approval).** The measured lengths are in the #33 body. Until they are written, the browser estimate is their only length.
- **Real-device checks.** None of the lock-screen, Spotify takeover, headphone or background scenarios has run on a phone. Turn on the log at `/he/diagnostics`, then try:
  - pausing from the lock screen and waiting
  - letting Spotify take over, then returning
  - headphone button presses
  - disconnecting and reconnecting headphones
  - playing the 25 Sep lesson to its end

  Paste the copied log back. This needs a build the phone can reach: a preview deploy of `dev`, or a release to production with owner approval.
- **Known limit left alone.** On a part whose browser length is short, seeking into the last stretch the browser doesn't know about (about 107s on the 25 Sep lesson) snaps back.
- **Open design decision (L2).** After a total offline failure, the app resumes by itself when the network returns. The research didn't tie this to the Spotify bug, so it was not changed.
- **Proposed follow-up.** Measure a part's length on the server at upload. Today it is measured in the admin's browser, where a timeout stores 0 and WebKit can store a wrong value.

## Files

The two handoffs were written before the merges above. Where they disagree with this README, this README is current.

| File | What it is |
|---|---|
| `handoff-1-research-and-abstracts.md` | First handoff: scope, the abstracts, and the research plan and results. |
| `handoff-2-continuation.md` | Continuation handoff written when only #31 was open. |
| `research-lifecycle.md` | Player lifecycle code review: the stale retry (L1), stale Media Session progress (L3) and the open L2 question. |
| `research-webkit.md` | WebKit/iOS source research: who owns the lock-screen controls, headset paths, seek offsets vs OS labels. |
| `research-chromium.md` | Android Chromium source research: Spotify and audio focus, browser vs installed app, headset paths, seek offsets. |
| `research-field-reports.md` | Public bug reports and fixes from browser projects, with a real-device test matrix. |
| `research-audio-data.md` | Catalog vs browser vs decoded durations for sample files, including WebKit's 3712s reading of the 25 Sep final part, which really lasts 3819s. |
| `two-fixes-implementation.md` | Implementation report for the first two fixes (#31). |

Some files mention scratch fixtures and logs under `/private/tmp` (`tora-lifecycle-20261004-*`, `bug4`, check logs). Those were not kept. The regression tests on `dev` replace the fixtures.
