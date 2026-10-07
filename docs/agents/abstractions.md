# Abstractions catalog

Building blocks to compose before writing new code. Each has a small interface, real behavior behind it, tests at its interface, and more than one caller (or a clear reason to be shared). Add an entry when you create one.

## Playback

| Block | Where | Interface | Use it for |
|---|---|---|---|
| Audio controller actions | `src/lib/audio-controller.ts` | `play`, `pause`, `togglePlay`, `seekTo`, `skipBackward`, `skipForward`, `playTrack`, `nextTrackOrSkip`, `previousTrackOrSkip` | The only way UI, lock screen and headsets change playback. Never touch the element. |
| `playLesson` / `playLessons` | `src/lib/play-lesson.ts` | lesson tracks in, playback started with the right resume point | Starting a lesson from any surface. |
| Track builders | `src/lib/lesson-tracks.ts` | `getLessonTracks(lesson)`, `getOfflineLessonTracks(meta)` | Building queues: one track per part with `partIndex`/`partCount`. |
| `trustedPartDuration` | `src/lib/part-duration.ts` | `({ catalog, element }) => seconds` (0 = unknown) | Which length of a part to believe for "heard by position" and the shown length. Keeps the longer known value; a natural end still finishes the part. Read its header comment before changing the rule. |
| Progress rules | `src/lib/lesson-progress.ts` | `isNearPartEnd`, `isLastPart`, `getResumePoint`, `getListenedFraction` | Heard / resume / progress-bar decisions. Pure. |
| `PlayerShareButton` | `src/components/player/player-share-button.tsx` | `<PlayerShareButton compact? />`; `sharePlayingLesson(track)` (`src/lib/player-share.ts`) | Sharing the loaded lesson from any player surface: native sheet, clipboard, manual-copy fallback. Never touches playback. |
| `getTransportState` | `src/stores/audio-store.ts` | store state in, `"playing" \| "loading" \| "paused"` | Every play/pause icon. Do not read `isPlaying`. |

## Diagnostics

| Block | Where | Interface | Use it for |
|---|---|---|---|
| Playback log | `src/lib/playback-diagnostics.ts` | `diag(type, data?)`, `diagnostics()` (`isEnabled`, `setEnabled`, `entries`, `format`, `clear`, `flush`), `attachElementDiagnostics(el)`, `startLifecycleDiagnostics()`, `environmentInfo()` | Evidence from a real phone (lock screen, Spotify takeover, headsets, background kills). Opt-in at `/diagnostics`, device-only, no URLs, survives reloads, no-op while off. To trace something new, call `diag("area:event", { small, values })`; do not add ad-hoc `console.log`. |

## Content

| Block | Where | Interface | Use it for |
|---|---|---|---|
| `generateLessonMetadata(date)` | `src/lib/hebrew-date.ts` | date string in, `title`, `hebrewDate`, `parsha`, `isHolidayReading`, `readingLabel`, ... | Every lesson title and Hebrew date. Holiday wording lives in `HOLIDAY_TITLES` / `holidayTitleFor`. |
| `parshaLabel(parsha)` | `src/lib/parsha-label.ts` | stored `lessons.parsha` in, display text out | Showing any stored reading name (cards, lesson page, SEO text). Puts the Chol HaMoed Shabbat first; no calendar import, so client components can use it. |
| Tag and date helpers | `src/lib/tags.ts`, `src/lib/tag-links.ts` | `normalizeTags`, `tagPath`, `lessonsHref({ q, type, cat, tag, date })`, `dateFromSearchParam` | Every tag write and every tag/date link or filter. |
| Lesson browse links | `src/components/lessons/lesson-browse-links.tsx` | `<LessonDateLink date hebrewDate? onClick? />`, `<LessonTagLink tag />` | Showing a lesson's date or tag anywhere: an accessible link to its list, safe beside a card's stretched link. |
| Part types | `src/lib/part-types.ts`, `src/components/lessons/part-type-field.tsx`, `getCachedPartTypes` (`src/lib/supabase/anon.ts`) | `normalizePartType`, `partTypeOptions(used)`; `<PartTypeField value onChange />` (commits a whole value, never per keystroke) | Any place that sets or lists a part's type (סידור / עץ חיים / admin-added types). |
| Site identity | `src/config/site.ts` | `SITE_URL`, `localePath`, `pageUrl`, `lessonPath`, ... | Any origin, name or URL. Never hardcode them. |

## Verification

| Block | Where | Use it for |
|---|---|---|
| CI script | `.factory/checks.sh` | The canonical local run: install, type-check, lint, unit tests, build. |
| Controller test harness | `src/lib/audio-controller.test.ts` (fake audio element, `becomePlaying`, `endCurrentFile`) | Modeled playback scenarios. Results are "modeled", never "device verified". |
