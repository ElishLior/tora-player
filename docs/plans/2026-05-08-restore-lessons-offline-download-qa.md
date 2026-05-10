# Restore Lessons, Offline Downloads, and QA Plan

Date: 2026-05-08
Status: active
Owner: Tora Player

## Problem Frame

The production app at `https://tora-player.vercel.app/he/lessons` renders successfully but shows the empty lessons state instead of the existing lesson database. Local dev now reproduces the same user-visible behavior after pulling Vercel production environment variables into `.env.local`.

Live evidence:

- `https://tora-player.vercel.app/api/health` returns HTTP 503 with `{"checks":{"supabase":"error"}}`.
- `http://localhost:3001/api/health` returns HTTP 503 with the same Supabase error after `.env.local` is loaded.
- The configured Supabase host from Vercel env is present, but DNS lookup for that project host returns no records locally, and direct REST fetch fails with `ENOTFOUND`.
- `/he/lessons` catches/ignores data errors and renders "אין שיעורים עדיין", so infrastructure failures look like a valid empty database.

Recovery update, 2026-05-08:

- The Supabase project `yudibxtwlhoydrioqpjr` was restored from the dashboard.
- DNS now resolves for `yudibxtwlhoydrioqpjr.supabase.co`.
- `https://tora-player.vercel.app/api/health` now returns HTTP 200 with `supabase: "connected"`.
- Direct REST checks return 134 total lessons and 134 published lessons.
- Browser QA confirms `https://tora-player.vercel.app/he/lessons` renders lesson cards and no longer shows the empty state.
- The project currently runs in `Oceania (Sydney)` / `ap-southeast-2`.

Supabase CLI update, 2026-05-08:

- Supabase CLI login is configured locally using a personal access token stored by the CLI/keychain flow.
- The local workspace is linked to Supabase project `yudibxtwlhoydrioqpjr`.
- `supabase projects list` marks `yudibxtwlhoydrioqpjr` as the linked project.
- `supabase migration list` can connect to the remote database.
- Migration history needs review before any DB push: local migration files are numbered `001`-`008`, while the remote migration table also contains timestamp migration `20260302015635`.

This plan has four tracks:

1. Restore database connectivity and make lesson-loading failures observable.
2. Redesign offline playback and add true local file download.
3. Make background playback reliable enough for driving/lock-screen use and observable when the browser stops it.
4. Add QA coverage that catches these failures before deploy.

## Scope

In scope:

- Production and local Supabase connectivity diagnostics.
- Lesson list/detail data-loading error handling.
- `/api/health` expansion for database schema, lesson counts, and R2 readiness.
- Offline audio storage keyed per audio file, not only per lesson.
- Separate "save for offline" and "download file" user actions.
- Background playback lifecycle, lock-screen controls, driving mode, and audio diagnostics.
- Browser QA for Hebrew RTL, desktop/mobile, online/offline, and production/local.
- Tests and smoke scripts for the affected behavior.

Out of scope for this plan:

- Production deploy without explicit approval.
- Full admin-auth redesign, except for risks discovered while protecting upload/download routes.
- Dependency audit remediation, except if a package blocks this work.
- Visual redesign beyond required controls/states.

## Current Findings

### Database Loading

Relevant files:

- `src/lib/supabase/server.ts`
- `src/lib/supabase/queries.ts`
- `src/actions/lessons-paginated.ts`
- `src/app/[locale]/lessons/page.tsx`
- `src/app/[locale]/lessons/lessons-client.tsx`
- `src/app/[locale]/lessons/[lessonId]/page.tsx`
- `src/app/api/health/route.ts`
- `supabase/migrations/*.sql`

Observed behavior:

- `createServerSupabaseClient()` returns `null` when env vars are missing.
- `LessonsPage` only fetches inside `if (supabase)` and renders the normal empty state otherwise.
- The lesson list fetch ignores Supabase query `error` values in several places.
- The page wraps category/list loading in an empty `catch`, so schema, RLS, and network failures all become `lessons = []`.
- The detail page converts all Supabase failures into `notFound()`.

Most likely root cause:

- The Vercel production `NEXT_PUBLIC_SUPABASE_URL` points to a Supabase project host that is not currently resolvable/reachable. The app is configured, but the configured backend is unavailable or the project reference/env value is stale.

Other risks to verify after connectivity is restored:

- Required migrations may not all be applied in production: `categories`, `lesson_audio`, `lesson_images`, `category_id`, lesson metadata columns, snippet submissions.
- `is_published = true` may hide lessons if data was imported unpublished.
- Category admin mutations may fail because app admin auth is cookie-based while category RLS policies use Supabase `authenticated`.

### Offline and Download

Relevant files:

- `public/sw.js`
- `public/manifest.json`
- `src/lib/register-sw.ts`
- `src/components/pwa/sw-registrar.tsx`
- `src/lib/offline-storage.ts`
- `src/hooks/use-offline.ts`
- `src/hooks/use-audio-player.ts`
- `src/stores/audio-store.ts`
- `src/app/[locale]/offline/page.tsx`
- `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`
- `src/app/api/audio/stream/[fileKey]/route.ts`
- `src/app/api/images/stream/[fileKey]/route.ts`

Observed behavior:

- Service worker bypasses localhost, so local dev does not exercise offline caching.
- Audio/image stream endpoints are deliberately skipped by the service worker because partial `206` responses are not cache-safe.
- IndexedDB stores audio blobs under `lessonId`.
- Multi-file lesson playback sets each track id to `lesson.id`; offline lookup also uses `track.id`.
- A downloaded primary file can therefore be reused for the wrong audio file in a multi-file lesson.
- The lesson detail page has one "download" action that means "save for offline"; users also need a real device-local file download.
- The offline page lists saved lessons but does not provide a play action.
- Full player has a visible download icon with no real handler.

Design decision:

- Treat offline app storage and device downloads as separate user actions.
- "Save offline" stores blobs/metadata in IndexedDB for in-app playback.
- "Download file" uses browser download behavior with `Content-Disposition: attachment`.

### Background Playback

Relevant files:

- `src/hooks/use-audio-player.ts`
- `src/lib/audio-engine.ts`
- `src/hooks/use-media-session.ts`
- `src/stores/audio-store.ts`
- `src/components/player/audio-player.tsx`
- `src/components/player/full-player.tsx`
- `src/components/player/mini-player.tsx`
- `src/app/[locale]/driving/page.tsx`
- `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`
- `src/app/api/audio/stream/[fileKey]/route.ts`

Product target:

- The app should feel like Spotify or Apple Music for long-form listening: start a lesson, switch apps, lock the screen, use car/Bluetooth controls, return later, and have playback state still make sense.
- Lock-screen and notification media controls should show accurate title/artwork/progress and should support play, pause, seek back, seek forward, next, and previous where the platform allows it.
- Driving mode should be optimized for screen-on listening and large controls, but normal playback should not depend on driving mode being open.
- Offline saved lessons should be treated as the most reliable mode for driving, dead zones, and long sessions.
- If the mobile browser or PWA runtime blocks resume after a lock/app switch, the app should show a clear one-tap resume state instead of pretending playback continued.
- If the real product requirement is full native parity with Apple Music on iOS, we should evaluate a native shell or React Native/Capacitor app after the PWA hardening pass, because PWAs cannot configure the same OS-level audio session that native audio apps can.

Observed behavior and likely causes:

- `useAudioPlayer()` is not only a selector hook; every mounted instance configures singleton engine callbacks, load/play effects, timers, and recovery logic. It is mounted by global player UI, lesson pages, full player, mini player, and driving mode, so more than one controller can steer the same Howler singleton.
- Store `isPlaying` currently acts like playback intent, but the app does not model actual native media state. If the browser pauses, stalls, suspends, or errors the underlying `<audio>` element, the UI can still believe playback is active.
- Foreground recovery only reloads when `audioEngine.isLoaded()` is false. `isLoaded()` currently means `howl !== null`, so a "loaded but paused/stalled/dead" media element does not recover.
- Time tracking uses `requestAnimationFrame`, and progress saving uses `setInterval`. Both can be throttled or suspended while hidden, locked, or frozen, so resume can use stale progress.
- Media Session action handlers mostly flip store state. Lock-screen play should also call/reconcile against the actual engine and log failures such as autoplay/user-activation rejection.
- Wake Lock is useful for driving mode while the screen is visible, but it is not a background-audio guarantee and is released when hidden or manually locked.
- Same-lesson multi-file playback uses `lesson.id` as the track id for multiple audio files. The load effect includes `audioUrl`, but the play/pause effect depends on track id and `isPlaying`; switching to another file in the same lesson can load a new URL without a matching play call.
- Web/PWA background playback is inherently best-effort, especially on iOS. Native apps can configure OS audio session behavior; a PWA cannot. The app should be robust and transparent, but real-device QA remains mandatory.

Design decision:

- Create one persistent audio controller mounted once near the layout root.
- UI hooks should become store selectors and command dispatchers, not engine orchestrators.
- Separate `desiredPlaying` from `actualPlaying` and model engine states such as `idle`, `loading`, `ready`, `playing`, `paused`, `stalled`, `blocked`, `error`, and `recovering`.
- Treat offline saved audio as the reliability mode for driving/dead-zone use.

## Implementation Plan

### Phase 1: Restore Supabase Connectivity

Goal: get existing lessons loading again before changing product behavior.

Tasks:

1. Verify the intended Supabase project reference in the Supabase dashboard.
2. Compare the dashboard project URL to Vercel `NEXT_PUBLIC_SUPABASE_URL`.
3. If the current project was paused/deleted/renamed, update Vercel Production env vars to the active project.
4. Pull env locally again with `vercel env pull .env.local --environment=production --yes`.
5. Run direct REST checks:

```bash
DOTENV_CONFIG_PATH=.env.local node -r dotenv/config -e "const u=process.env.NEXT_PUBLIC_SUPABASE_URL; const k=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; fetch(u + '/rest/v1/lessons?select=id&limit=1', { headers: { apikey: k, Authorization: 'Bearer ' + k } }).then(async r => console.log(r.status, await r.text())).catch(console.error)"
```

6. Run production health after env update and deployment:

```bash
curl -i https://tora-player.vercel.app/api/health
```

Acceptance criteria:

- Supabase host resolves from local and Vercel.
- `/api/health` returns HTTP 200 with Supabase connected.
- `/he/lessons` renders actual lesson cards when published lessons exist.
- If the database is truly empty, the empty state remains valid.

### Phase 2: Make Lesson Loading Observable

Goal: stop masking infrastructure/schema failures as "no lessons".

Tasks:

1. Add a shared server-side lesson query helper, for example `src/lib/supabase/lesson-queries.ts`.
2. Make the helper return a discriminated result:

```ts
type LessonListResult =
  | { ok: true; lessons: LessonWithRelations[]; hasMore: boolean; categories: Category[] }
  | { ok: false; code: 'unconfigured' | 'network' | 'schema' | 'query'; message: string };
```

3. Use the helper from:

- `src/app/[locale]/lessons/page.tsx`
- `src/actions/lessons-paginated.ts`
- `src/app/[locale]/search/page.tsx` if query duplication remains.

4. Replace empty `catch` blocks with structured server logs.
5. Render a localized error state for data failures, not the normal empty state.
6. Keep true empty database behavior distinct from backend failure.
7. On detail pages, distinguish "lesson not found" from "database unavailable".

User-facing Hebrew copy:

- Data unavailable title: `לא ניתן לטעון שיעורים כרגע`
- Data unavailable body: `יש בעיה בחיבור למסד הנתונים. נסה שוב בעוד רגע.`
- Retry label: `נסה שוב`
- True empty title remains: `אין שיעורים עדיין`

Acceptance criteria:

- Missing Supabase env shows a data-unavailable state in local dev.
- Network/Supabase failure shows a data-unavailable state.
- Empty `lessons` table shows the normal empty state.
- Detail page does not present backend outages as a fake 404.

### Phase 3: Expand Health Checks

Goal: one endpoint can prove app readiness before QA/deploy.

Tasks:

1. Extend `src/app/api/health/route.ts`.
2. Check Supabase REST connectivity.
3. Check required schema objects:

- `lessons`
- `lesson_audio`
- `lesson_images`
- `categories`
- `snippets`
- `playback_progress`

4. Check required lesson columns:

- `category_id`
- `hebrew_date`
- `parsha`
- `lesson_type`
- `seder_number`

5. Return published lesson count and total lesson count.
6. Add R2 readiness checks without exposing secrets:

- env present for `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- optional signed URL smoke for a known object only if a safe fixture exists.

7. Add a short timeout per external check.

Response shape:

```json
{
  "status": "ok",
  "checks": {
    "supabase": "connected",
    "schema": "ok",
    "lessons": { "total": 134, "published": 134 },
    "r2": "configured"
  }
}
```

Acceptance criteria:

- Health returns `503` for unreachable Supabase.
- Health returns `503` for missing required schema.
- Health returns `200` only when app dependencies are ready.
- No secret values appear in logs or responses.

### Phase 4: Offline Storage v2

Goal: reliable in-app offline playback, including multi-file lessons.

Tasks:

1. Upgrade `src/lib/offline-storage.ts` IndexedDB schema to v2.
2. Replace lesson-only blob keying with file-level keying:

```ts
type OfflineAudioFile = {
  offlineKey: string;
  lessonId: string;
  audioFileId?: string;
  fileKey?: string;
  audioUrl: string;
  originalName?: string;
  mimeType: string;
  duration: number;
  fileSize: number;
  downloadedAt: string;
};
```

3. Add lesson manifest storage:

```ts
type OfflineLessonManifest = {
  lessonId: string;
  title: string;
  hebrewTitle: string;
  date: string;
  seriesName?: string;
  files: string[];
  downloadedAt: string;
};
```

4. Add migration logic from v1 lesson blobs to v2 where possible.
5. Preserve MIME type when creating blobs:

```ts
new Blob(chunks, { type: response.headers.get('content-type') || 'audio/mpeg' })
```

6. Add quota preflight with `navigator.storage.estimate()`.
7. Request persistent storage with `navigator.storage.persist()` when available.
8. Add cancellation with `AbortController`.
9. Add cleanup for partial file failures.

Acceptance criteria:

- Saving one file in a multi-file lesson does not affect another file.
- Playback resolves the exact saved file by `offlineKey`.
- Offline page can list file-level and lesson-level saved content.
- Failed downloads do not leave partial saved metadata.

### Phase 5: Player and UI Integration

Goal: make offline and download controls clear and usable.

Tasks:

1. Extend `AudioTrack` in `src/stores/audio-store.ts`:

```ts
offlineKey?: string;
lessonId?: string;
audioFileId?: string;
fileKey?: string;
originalName?: string;
mimeType?: string;
```

2. Update `src/hooks/use-audio-player.ts` to resolve offline URL by `track.offlineKey`, falling back to network.
3. Update `lesson-player-client.tsx`:

- Primary lesson action: "Save offline".
- Secondary action: "Download file".
- Per-file row actions for multi-file lessons.
- Lesson-level "Save all offline" if there are multiple files.

4. Update `src/app/[locale]/offline/page.tsx`:

- Add play action.
- Add remove action.
- Show saved file count, total size, and saved date.
- Show online/offline state.

5. Update `src/components/player/full-player.tsx` so download/offline controls are functional or removed until wired.
6. Add translations in `messages/he.json` and `messages/en.json`.

Acceptance criteria:

- A user can save a lesson for in-app offline playback.
- A user can download an audio file to their device.
- Multi-file lessons show file-specific save/download status.
- Offline page can start playback of saved content while network is offline.

### Phase 6: Download Endpoint

Goal: support real local file downloads safely.

Tasks:

1. Add `download=1` support to `src/app/api/audio/stream/[fileKey]/route.ts`, or create `src/app/api/audio/download/[fileKey]/route.ts`.
2. Add `HEAD` support for size/type preflight.
3. Add `Content-Disposition` with sanitized UTF-8 filename.
4. Verify `Range` still works for normal playback.
5. Authorize requested R2 keys against DB:

- public if the key belongs to a published lesson audio file.
- admin-only for unpublished/private content.

Acceptance criteria:

- Clicking "Download file" starts a browser download.
- Download filename is readable and safe.
- Direct requests for unknown R2 keys are rejected.
- Existing audio playback keeps `206` seeking support.

### Phase 7: PWA and Service Worker QA

Goal: prove production offline behavior without stale caches.

Tasks:

1. Keep localhost bypass for dev unless a test-only SW mode is added.
2. Add explicit QA instructions to unregister SW and clear caches before testing.
3. Add English offline fallback or make fallback locale-aware instead of always `/he/offline`.
4. Decide whether lesson images should be included in offline bundles.
5. Version bump service worker cache when behavior changes.

Acceptance criteria:

- Fresh production install gets current app shell.
- Previously installed app updates cleanly after SW version bump.
- Offline shell renders.
- Saved offline audio plays with browser network disabled.

### Phase 8: Background Playback Reliability

Goal: make long-form audio resilient across app switching, screen lock/unlock, driving mode, and lock-screen controls, with diagnostics for cases the browser/OS still blocks.

User promise:

- A listener can start a lesson and continue listening while navigating, locking the phone, using Maps/Waze, or using Bluetooth/car controls.
- The app always reflects the true playback state: playing, loading, paused, stalled, blocked, or recovering.
- The user can recover quickly from a platform interruption with one visible action.
- Offline saved audio is a first-class listening mode, not just an emergency fallback.

Tasks:

1. Add a single `AudioController` component mounted once from `src/app/[locale]/layout.tsx`.
2. Move engine ownership into the controller:

- track loading
- play/pause reconciliation
- native audio event listeners
- Media Session metadata/actions
- progress timers and visibility/page lifecycle recovery
- offline URL resolution

3. Convert `useAudioPlayer()` into command/selectors only, or split it into:

- `useAudioPlayerState()`
- `useAudioPlayerActions()`
- internal `useAudioController()` mounted only once

4. Extend audio store state:

```ts
type PlaybackStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'stalled'
  | 'blocked'
  | 'error'
  | 'recovering';

type PlaybackIntent = {
  desiredPlaying: boolean;
  source: 'ui' | 'media-session' | 'driving' | 'visibility-recovery' | 'native-event';
  updatedAt: number;
};
```

5. Update `AudioTrack` identity so every playable file has a unique key:

```ts
trackKey: string; // lessonId + audioFileId/fileKey/audioUrl hash
lessonId: string;
audioFileId?: string;
audioUrl: string;
offlineKey?: string;
```

6. Update play flow so first playback after a user gesture loads and plays as directly as possible, reducing the chance that iOS loses transient user activation.
7. Add native `<audio>` event reconciliation from `audioEngine.getAudioElement()`:

- `play`
- `playing`
- `pause`
- `waiting`
- `stalled`
- `suspend`
- `abort`
- `emptied`
- `error`
- `ended`
- `timeupdate`
- `canplay`
- `seeking`
- `seeked`

8. On `visibilitychange`, `pageshow`, `online`, and supported `resume` events:

- read freshest native `currentTime`
- if `desiredPlaying` is true and actual state is paused/stalled/error/missing, attempt resume
- if resume is blocked, set status `blocked` and show a clear resume affordance

9. Persist a short-lived `resumeIntent` instead of raw `isPlaying`:

```ts
type ResumeIntent = {
  trackKey: string;
  currentTime: number;
  desiredPlayingAt: string;
  expiresAt: string;
};
```

10. Use native `timeupdate`, `pagehide`, and `visibilitychange:hidden` to flush progress, with `sendBeacon` where practical.
11. Keep screen Wake Lock only for explicit screen-on UX, especially driving mode; do not treat it as a background playback fix.
12. Add a playback diagnostics ring buffer in local storage or IndexedDB:

```ts
type PlaybackDiagnosticEvent = {
  at: string;
  event: string;
  route: string;
  visibility: DocumentVisibilityState;
  online: boolean;
  trackKey?: string;
  desiredPlaying: boolean;
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  readyState?: number;
  networkState?: number;
  mediaErrorCode?: number;
  userAgent: string;
};
```

13. Add an admin-only or hidden debug export view for recent playback diagnostics.
14. Add `/api/audio/stream` request diagnostics with request ids, range headers, response status, content length/range, R2 status, and aborted stream logging.
15. Add "now playing" UX states across mini player, full player, and lesson page:

- `מנגן`
- `טוען`
- `מנסה להתחבר מחדש`
- `ההפעלה נעצרה`
- `צריך ללחוץ כדי להמשיך`

16. Add car/Bluetooth-focused command mapping:

- play/pause should reconcile native engine state
- previous should restart current lesson if more than 3 seconds in, otherwise previous track
- next should advance to the next queued file/lesson only when the next item is fully known
- seek commands should update native media position and Media Session position state

17. Define a native-app decision gate after PWA hardening:

- If iPhone Home Screen PWA still cannot meet lock-screen resume requirements after controller refactor and offline playback, document the remaining platform limitation.
- If the limitation blocks the Spotify/Apple Music product bar, plan a native shell evaluation for iOS/Android.

Acceptance criteria:

- Only one audio controller owns the Howler singleton at runtime.
- UI never shows "playing" unless native media is actually playing, except while explicitly `loading` or `recovering`.
- Same-lesson multi-file switching starts the selected file while already playing.
- Lock-screen play/pause/seek handlers reconcile actual engine state and log failures.
- Returning from background attempts recovery when intent was to keep playing.
- If autoplay/user-activation policy blocks resume, the app shows a resume action instead of pretending playback continued.
- Driving mode has clear screen-on behavior but does not depend on Wake Lock for background audio.
- A saved offline lesson can keep playing through app switch and lock/unlock scenarios better than network streaming.
- Car/Bluetooth controls work for play/pause and seek on supported platforms.
- Any remaining iOS/Android PWA limitation is visible in diagnostics and called out in release notes before shipping.

## Test Plan

### Automated Checks

Commands:

```bash
npm run type-check
npm run lint
npm run build
npx playwright test
npx vitest run
```

Current baseline:

- `npm run type-check` passes.
- `npm run lint` currently fails on generated `next-env.d.ts` and has pre-existing warnings.
- Existing Playwright smoke tests only prove pages are visible; they do not catch database failures.

### Unit Tests To Add

Recommended paths:

- `src/lib/audio-url.test.ts`
- `src/lib/offline-storage.test.ts`
- `src/lib/supabase/lesson-queries.test.ts`
- `src/lib/audio-controller.test.ts`
- `src/hooks/use-media-session.test.ts`
- `src/app/api/audio/stream/[fileKey]/route.test.ts`
- `src/app/api/health/route.test.ts`

Scenarios:

- R2 URL normalization.
- Offline storage save/get/delete.
- Multi-file offline key separation.
- Failed/incomplete download cleanup.
- Supabase unconfigured, network error, schema error, empty result, populated result.
- Health status for connected, degraded, and unconfigured states.
- Download endpoint headers and unknown-key rejection.
- Playback state transitions: loading, playing, paused, stalled, blocked, recovering, error.
- Duplicate-controller prevention.
- Native audio pause/stall/error reconciliation.
- Visibility/pagehide/pageshow progress flushing.
- Media Session actions call/reconcile with the engine and handle unsupported actions.
- Same-lesson multi-file switching triggers playback for the new file.
- `/api/audio/stream` `Range: bytes=0-99` returns `206`, `Content-Range`, `Accept-Ranges`, correct MIME, and seek-safe headers.

### E2E Tests To Add

Recommended paths:

- `tests/e2e/database-health.spec.ts`
- `tests/e2e/lessons-data.spec.ts`
- `tests/e2e/offline-download.spec.ts`
- `tests/e2e/auth-boundaries.spec.ts`

Scenarios:

- `/api/health` must be `ok` before lesson-data tests run.
- `/he/lessons` shows lesson cards when data exists.
- Backend failure shows data-unavailable state, not "אין שיעורים עדיין".
- Logged-out upload/edit routes redirect to login.
- Single-file lesson can be saved offline.
- Multi-file lesson saves and plays the correct file offline.
- Device download triggers download event with expected filename.
- Offline page plays saved lesson with network disabled.
- Visibility/page lifecycle events resync actual media state.
- Mocked native audio `stalled`/`pause` events do not leave the UI falsely playing.
- Media Session play/pause/seek handlers update engine and store state.

### Manual QA Matrix

Desktop:

- Chrome local dev.
- Chrome production build.
- Production Vercel.

Mobile:

- iOS Safari/PWA installed.
- Android Chrome/PWA installed.
- iPhone Safari tab, iPhone Home Screen PWA, iPad Safari/PWA.
- Android Chrome tab, installed Android PWA, Pixel and Samsung if available.

States:

- Online.
- Offline after first visit.
- Offline with saved lesson.
- Offline without saved lesson.
- Logged out.
- Logged in admin.
- Empty DB.
- Populated DB.
- Multi-file lesson.
- Lesson with images.
- Lock screen for 1, 5, 30, and 60 minutes.
- Pause from lock screen, wait 15 seconds, 30 seconds, 2 minutes, and 10 minutes, then resume.
- Switch apps during playback: Maps/Waze, phone call, Siri/Assistant, WhatsApp or another common app.
- Bluetooth/headphones/car controls for play, pause, seek, next, and previous.
- Network transitions: Wi-Fi to cellular, cellular dead zone, airplane mode, reconnect.
- Low-power mode, low battery, storage pressure, and PWA/service-worker update.

Routes:

- `/he`
- `/he/lessons`
- `/he/lessons/[lessonId]`
- `/he/offline`
- `/he/search`
- `/he/admin/login`
- `/he/lessons/upload`
- `/api/health`
- `/api/audio/stream/[fileKey]`

Background playback cases:

- Start playback from lesson page, lock, unlock, verify time and state.
- Start playback from mini player, switch apps, return, verify recovery.
- Enter driving mode while playing, lock/unlock, leave driving mode, verify one engine remains active.
- Use lock-screen controls for pause/play/seek.
- Use Bluetooth/headphone/car controls for play/pause/seek/next/previous.
- Start playback, open Maps/Waze, lock the phone, and verify playback continues or shows a clean one-tap resume state when returning.
- Start offline playback, disable network, switch apps, lock/unlock, and verify the lesson continues from the saved file.
- Switch between two audio files in the same lesson while playing.
- Let a track end while locked and verify next-track behavior or graceful stop.
- Kill/reopen PWA and verify no false "playing" UI; offer resume from saved position.

## Immediate Recovery Checklist

1. Confirm active Supabase project in dashboard.
2. Correct Vercel Production Supabase env vars if needed.
3. Deploy only after explicit approval.
4. Verify `https://tora-player.vercel.app/api/health`.
5. Verify `/he/lessons` renders real data.
6. Implement observable lesson-loading errors.
7. Implement offline storage v2 and download endpoint.
8. Implement background playback controller, diagnostics, and driving-mode QA fixes.
9. Add tests and run full QA matrix.

## Risks

- If the Supabase project was deleted or data was lost, env correction alone will not restore lessons; a backup/import path will be needed.
- Current broad anon write RLS and unprotected upload APIs are security risks and should be hardened after immediate recovery.
- Service worker caching can hide old production JS; QA must include unregistering SW and clearing caches.
- Offline audio blobs can exceed mobile storage quota; quota preflight and clear error states are required.
- iOS and Android browsers can still suspend, freeze, or block playback/resume despite correct app logic; diagnostics and resume affordances are required.
- Lock-screen resume after a long pause is best-effort in PWAs and must be tested on real devices.

## Open Questions

1. What is the active Supabase project reference for the production lesson database?
2. Should "Save all offline" include images or audio only for v1?
3. Should local device downloads be available for every public lesson, or admin-only for some lesson types?
4. Should the offline page be added to bottom navigation, or accessed from lesson/player actions only?
5. Which real devices should define the release gate for background playback: iPhone Safari, iPhone PWA, Android Chrome, Android PWA, car Bluetooth?
6. Should next-track while locked be required for multi-file lessons, or can v1 stop gracefully and ask the user to resume/select the next file?
7. Is PWA hardening enough if it reaches reliable one-tap recovery, or is native-level automatic lock-screen resume a hard requirement?
