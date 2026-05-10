# Player Experience Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tora Player feel like a dedicated audio app, not just a page with playback controls, by upgrading mini-player, now-playing, queue/history, offline confidence, and small recovery states.

**Architecture:** Build on the existing Howler singleton, Zustand audio store, progress store, offline IndexedDB cache, and player components. Keep this as product polish layered on top of the background-playback hardening work; do not introduce native-only assumptions or a large redesign. Local-first history/queue state stays in persisted Zustand, with server sync remaining best-effort where it already exists.

**Tech Stack:** Next.js 15 App Router, TypeScript, Zustand, Tailwind CSS, lucide-react, next-intl, Vitest, Playwright, manual mobile QA.

---

## Inspiration Notes

This plan adapts patterns from mature audio apps without copying them blindly:

- Apple Music teaches a clear two-level model: MiniPlayer for always-visible context and Now Playing for immersive controls.
- Spotify's design team describes the Now Playing Bar as valuable product real estate; small changes there can unlock larger product improvements by reducing clutter and making the current media state more discoverable.
- iOS lock-screen/live media patterns reinforce that playback controls should expose only essential actions, especially play/pause/seek/resume.

References:

- [Apple Support: iPhone music player controls](https://support.apple.com/en-mide/guide/iphone/iph676daac9b/ios)
- [Spotify Design: Now Playing Bar changes](https://spotify.design/article/small-but-mighty-weve-rolled-out-changes-to-the-now-playing-bar)
- [Apple HIG: Live Activities](https://developer.apple.com/design/human-interface-guidelines/live-activities)

## Current State

- `src/components/player/mini-player.tsx` already shows title, series, progress, bookmark, cast, and play/pause. Tapping opens the full player.
- `src/components/player/full-player.tsx` already has a full-screen Now Playing view, bookmark markers, speed, skip, share clip, driving mode, file download, and cast.
- `src/components/player/full-player.tsx` renders a queue icon, but it does not open a queue view yet.
- `src/stores/audio-store.ts` already has `queue`, `queueIndex`, `addToQueue`, and `removeFromQueue`, but the UI barely exposes queue management.
- `src/stores/progress-store.ts` already powers continue-listening from local persisted progress, but there is no richer listening history.
- `src/app/[locale]/offline/page.tsx` already lists saved lessons and can start offline playback.
- `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx` already supports saving whole lessons or individual files offline, plus raw device file downloads.

## Product Principles

- **Always know what is happening:** the user can see what is playing, whether it is truly playing, what is next, and whether the lesson is saved offline.
- **Fast return:** from any page, one tap gets back to Now Playing; after refresh, one tap resumes the last lesson without phantom autoplay.
- **Audio app muscle memory:** mini player opens full player, full player collapses, queue/history are near Now Playing, and the bottom controls feel predictable.
- **Lesson-first, not song-first:** prioritize parts, bookmarks, notes, long-form progress, offline driving, and resume decisions over music-only features like shuffle, lyrics, or crossfade.
- **No clutter tax:** every new control must earn its space on mobile. Secondary actions live behind a sheet, tab, or long press.

## Not In Scope

- Native Live Activities, Dynamic Island, CarPlay, Android Auto, or OS-level audio session controls.
- Social sharing feeds, comments, algorithmic recommendations, or a Spotify-style discovery engine.
- Crossfade, shuffle, repeat-one, or radio/autoplay algorithms unless requested later.
- Full visual rebrand. This is interaction polish and information architecture.

## Recommended PR Sequence

1. **PR UX-1: Mini Player 2.0 and status chips**
   - Floating/tappable mini player polish.
   - Better progress/metadata/offline/recovery state.
   - Safer spacing with bottom navigation.
2. **PR UX-2: Queue, Up Next, and Listening History**
   - Queue sheet/tab in full player.
   - Local listening history store.
   - Play next/add later/replay/resume actions.
3. **PR UX-3: Continuity, Offline Confidence, and Sleep Timer**
   - Resume-last-session pill.
   - Offline confidence prompts.
   - Sleep timer for long lessons.
4. **PR UX-4: QA polish and mobile interaction pass**
   - Gesture/accessibility tests.
   - Mobile visual QA.
   - Browser E2E for queue/history/offline confidence.

## File Structure

- Modify `src/components/player/mini-player.tsx`
  - Mini Player 2.0: richer status, better touch target, recovery/offline chips, quick actions.
- Modify `src/components/player/full-player.tsx`
  - Add Now Playing sections/tabs for `now`, `queue`, `history`, and `bookmarks`.
- Modify `src/components/player/audio-player.tsx`
  - Keep full/mini orchestration, optionally handle focus restoration after close.
- Modify `src/components/layout/bottom-nav.tsx`
  - Ensure mini player and nav do not overlap, especially with safe-area insets.
- Modify `src/stores/audio-store.ts`
  - Add queue helper actions: `playNext`, `moveQueueItem`, `clearQueue`, and `peekNextTrack`.
- Create `src/stores/listening-history-store.ts`
  - Persist last played tracks, last completed tracks, and replay metadata locally.
- Create `src/stores/sleep-timer-store.ts`
  - Persist active sleep timer state and expose timer actions.
- Modify `src/hooks/use-audio-player.ts`
  - Record history events, update sleep timer, and expose player continuity helpers.
- Modify `src/components/home/continue-listening-section.tsx`
  - Add stronger resume context from history/progress.
- Modify `src/app/[locale]/offline/page.tsx`
  - Add confidence messaging and quick resume from saved lessons.
- Modify `src/app/[locale]/driving/page.tsx`
  - Reuse offline confidence and recovery state from the playback hardening plan.
- Modify `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`
  - Add queue actions for lesson parts and clarify save-offline/device-download split.
- Modify `messages/he.json`
  - Add Hebrew player UX strings.
- Modify `messages/en.json`
  - Add English fallback strings.
- Create `tests/e2e/player-experience.spec.ts`
  - Browser coverage for mini/full transitions, queue/history, sleep timer, and offline confidence.

## Experience Specs

### Mini Player 2.0

The mini player remains persistent above the bottom nav when a track exists.

Required behavior:

- Tap anywhere on track metadata opens full Now Playing.
- Play/pause remains a distinct button and does not accidentally open the full player.
- Progress is visible as a thin top bar; if duration is known, also expose accessible progress text.
- Show exactly one compact status chip when useful:
  - `Offline` when the active file is saved locally.
  - `Recovering` when background playback recovery is active.
  - `Tap to resume` when browser policy blocks autoplay/recovery.
  - `Next: ...` only when there is a real queued next item and space allows.
- Long press opens a compact quick-actions sheet:
  - Save offline
  - Add bookmark at current time
  - Open queue
  - Driving mode
- The mini player height must be stable so bottom nav does not jump.
- On mobile, title/series truncate cleanly in Hebrew RTL and English LTR.

Do not add horizontal swipe controls in the first PR. They are discoverability-heavy and can conflict with page scrolling. Reconsider after the core model is stable.

### Full Now Playing Tabs

The full player gets a small segmented control or tab row:

- `ניגון` / `Now`: current large controls, seek, speed, actions.
- `הבא בתור` / `Up Next`: current queue, next item, add/remove/reorder.
- `היסטוריה` / `History`: recently played and completed lessons.
- `סימניות` / `Bookmarks`: lesson bookmarks with tap-to-seek.

Rules:

- The default tab is `Now`.
- The queue icon in the header opens `Up Next`.
- If the current lesson has bookmarks, the bookmark count remains visible on `Now`.
- Queue/history tabs use dense rows, not large cards.
- Reordering must be keyboard accessible. If drag-and-drop is added later, keep up/down buttons too.

### Queue Behavior

Existing `queue` and `queueIndex` become visible and predictable.

Required actions:

- `Play now`: replace current queue and start selected item.
- `Play next`: insert after current `queueIndex`.
- `Add to queue`: append to queue.
- `Remove`: remove queued item without interrupting current playback.
- `Move up` / `Move down`: reorder queued items.
- `Clear queue`: clear future items, not the current playing item.

Lesson-specific rules:

- Multi-file lessons queue each audio file in sort order.
- Playing a file from a lesson detail page should set the queue to that lesson's files unless the user explicitly chooses `Play next` or `Add to queue`.
- Queue rows show part number/title, duration, offline status, and currently playing state.

### Listening History

Create local-first history, separate from progress.

History record:

```ts
export interface ListeningHistoryItem {
  trackKey: string;
  lessonId: string;
  audioFileId?: string;
  offlineKey?: string;
  title: string;
  hebrewTitle: string;
  seriesName?: string;
  date?: string;
  duration: number;
  lastPosition: number;
  lastPlayedAt: string;
  completed: boolean;
  playCount: number;
}
```

Rules:

- Record a history item when playback passes 30 seconds or 5% of duration, whichever comes first.
- Update `lastPosition` at the existing progress save interval.
- Mark completed when playback reaches the end or position is at least 95% of duration.
- Keep the last 50 items locally.
- `History` tab shows the last 25 items.
- Home can continue showing only the strongest 5 resume items.

### Resume and Continuity

After page refresh or returning later:

- Never autoplay solely because persisted state says there was a current track.
- Show the mini player in a paused `Tap to resume` state when a current track and position exist.
- Home shows a resume pill for the most recent unfinished lesson:
  - Hebrew example: `המשך מ-34:12`
  - English example: `Continue from 34:12`
- If a lesson is at least 95% complete, default action becomes `Play again`, not `Continue`.

### Offline Confidence

Offline support should feel trustworthy, not mysterious.

Required UI:

- Saved lessons/files show a clear local-device badge, not only a green dot.
- Streaming lessons in driving mode show a short warning and a save-offline action.
- Full player explains the difference between:
  - `Save offline`: app cache for playback without network.
  - `Download file`: device file download outside the app.
- Save-offline progress shows determinate percent when available, and an indeterminate state with bytes downloaded when `content-length` is absent.
- Storage-full or persistence-denied errors show a retry/remove path.

### Sleep Timer

Add a simple sleep timer because long-form lessons are often used passively.

Options:

- 15 minutes
- 30 minutes
- 45 minutes
- End of lesson
- Off

Behavior:

- Timer chip appears in full player when active.
- Mini player shows a small timer icon when active.
- Timer pauses playback and records progress.
- Timer does not mark a lesson completed unless playback naturally reaches completion.
- If the user manually pauses, timer remains but does not keep counting while paused.

### Microinteractions and Polish

Small details that matter:

- Mini to full player transition should feel like the mini player expands into Now Playing, not a hard context switch.
- Full to mini close should restore focus to the mini player for keyboard/screen reader users.
- Buttons use icons where recognizable and `aria-label` text for screen readers.
- Reduced-motion users get instant state changes, not large slide animations.
- When network state changes, show a short non-modal status update only if it affects playback/offline confidence.
- Keep all status language calm and specific. Avoid technical errors like "native audio element stalled" in user-facing copy.

## Task 1: Mini Player 2.0

**Files:**
- Modify `src/components/player/mini-player.tsx`
- Modify `src/components/layout/bottom-nav.tsx`
- Modify `messages/he.json`
- Modify `messages/en.json`
- Test `tests/e2e/player-experience.spec.ts`

- [ ] Add player status copy keys:
  - Hebrew: `offline`, `recovering`, `tapToResume`, `quickActions`, `saveOffline`, `openQueue`, `drivingMode`
  - English equivalents.
- [ ] Make mini-player metadata area the only expand target.
- [ ] Keep play/pause, bookmark, cast, and quick actions from bubbling into expand.
- [ ] Add one status chip chosen by priority: `tapToResume`, `recovering`, `offline`, `next`.
- [ ] Add stable mini-player height and update bottom-nav offset if the chip changes height.
- [ ] Add Playwright assertions:
  - mini player opens full player on metadata tap.
  - play/pause does not open full player.
  - bottom nav remains visible and not overlapped at 375px mobile width.

## Task 2: Queue and Up Next

**Files:**
- Modify `src/stores/audio-store.ts`
- Modify `src/components/player/full-player.tsx`
- Modify `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`
- Modify `messages/he.json`
- Modify `messages/en.json`
- Test `tests/e2e/player-experience.spec.ts`

- [ ] Add `playNext(track)`, `moveQueueItem(from, to)`, `clearQueue()`, and `peekNextTrack()` to `audio-store`.
- [ ] Add `Up Next` tab to full player.
- [ ] Wire the existing queue header icon to open `Up Next`.
- [ ] Add queue rows with current/next/offline/duration state.
- [ ] Add accessible move up/down controls.
- [ ] On lesson detail, playing a multi-file lesson sets queue to all lesson files in order.
- [ ] Add Playwright assertions:
  - queue icon opens `Up Next`.
  - moving a queued item changes order.
  - next track starts after current ends in queue order.

## Task 3: Listening History and Resume

**Files:**
- Create `src/stores/listening-history-store.ts`
- Modify `src/hooks/use-audio-player.ts`
- Modify `src/components/home/continue-listening-section.tsx`
- Modify `src/components/player/full-player.tsx`
- Modify `messages/he.json`
- Modify `messages/en.json`
- Test `src/stores/listening-history-store.test.ts`
- Test `tests/e2e/player-experience.spec.ts`

- [ ] Create `ListeningHistoryItem` type and persisted store.
- [ ] Record history after 30 seconds or 5% of duration.
- [ ] Keep last 50 unique track keys, sorted by `lastPlayedAt`.
- [ ] Add `History` tab to full player.
- [ ] Add home resume pill for most recent unfinished lesson.
- [ ] After refresh, show paused mini player with `Tap to resume`; never autoplay from persisted state.
- [ ] Add tests for dedupe, max length, completion threshold, and resume-vs-play-again copy.

## Task 4: Offline Confidence

**Files:**
- Modify `src/components/player/mini-player.tsx`
- Modify `src/components/player/full-player.tsx`
- Modify `src/app/[locale]/offline/page.tsx`
- Modify `src/app/[locale]/driving/page.tsx`
- Modify `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`
- Modify `messages/he.json`
- Modify `messages/en.json`
- Test `tests/e2e/offline-download.spec.ts`
- Test `tests/e2e/player-experience.spec.ts`

- [ ] Replace ambiguous green-dot-only offline status with text/icon badge where space allows.
- [ ] Add copy that explains save-offline vs device download.
- [ ] Add driving-mode save-offline action when current track is streaming.
- [ ] Add storage-full/persistence-denied failure copy and retry/remove actions.
- [ ] Expand offline E2E to verify saved badge, offline playback, and cache-vs-file download labels.

## Task 5: Sleep Timer

**Files:**
- Create `src/stores/sleep-timer-store.ts`
- Modify `src/hooks/use-audio-player.ts`
- Modify `src/components/player/full-player.tsx`
- Modify `src/components/player/mini-player.tsx`
- Modify `messages/he.json`
- Modify `messages/en.json`
- Test `src/stores/sleep-timer-store.test.ts`
- Test `tests/e2e/player-experience.spec.ts`

- [ ] Add timer options: `15m`, `30m`, `45m`, `end-of-lesson`, `off`.
- [ ] Pause playback when timer expires.
- [ ] Stop timer countdown while user-paused.
- [ ] Show timer chip in full player and compact icon in mini player.
- [ ] Add tests for timer expiry, manual pause, and end-of-lesson mode.

## Task 6: Final QA and Release Gate

**Files:**
- Modify `docs/qa/mobile-background-playback-checklist.md`
- Create `docs/qa/player-experience-checklist.md`

- [ ] Add player experience QA checklist:
  - mini-player tap opens full player
  - play/pause does not open full player
  - queue opens and reorders
  - history records recently played
  - resume pill appears after refresh
  - sleep timer pauses playback
  - offline badge is understandable in Hebrew and English
  - 375px mobile viewport has no overlap
  - reduced motion is acceptable
- [ ] Run:

```bash
npm run type-check
npm run test
npm run lint
npm run build
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts tests/e2e/player-experience.spec.ts --project=chromium --reporter=list
```

Expected:
- TypeScript exits `0`.
- Vitest exits `0`.
- ESLint exits `0`, warnings acceptable only if pre-existing.
- Next build exits `0`.
- Playwright exits `0`.

## Self-Review

- Spec coverage: Covers mini-player, full-player tabs, queue, history, resume, offline confidence, sleep timer, mobile polish, and QA.
- Scope control: Keeps native-only features and recommendation/social systems out of scope.
- Product fit: Prioritizes long-form Torah lesson behavior over music-specific features.
- Accessibility: Requires focus restoration, stable touch targets, RTL/LTR copy, status text, and reduced-motion behavior.
- Known residual risk: The existing lesson detail client file is intentionally large because of a dev webpack workaround. Implementation should keep page-specific client code inline there when touching that page.
