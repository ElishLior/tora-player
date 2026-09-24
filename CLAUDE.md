# Tora Player Agent Notes

Tora Player is a Hebrew Torah lesson audio player PWA. Treat the product like a music app for lessons: fast browsing, dependable playback, stable background behavior, offline listening, local file downloads, and clear Hebrew RTL UI.

## Current Status

- Production URL: https://tora-player.vercel.app
- Production release shipped: May 11, 2026
- Latest landed PR: #9, `codex/unify-player-surfaces` into `dev`, then `dev` promoted to `main`
- Production health after release: Supabase connected, schema OK, R2 configured, 134 published lessons
- Real production deploy target: Vercel project `tora-player`

## Stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS
- Supabase Postgres with RLS
- Cloudflare R2 for audio and images
- Audio streamed through `/api/audio/stream/[fileKey]`
- Images streamed through `/api/images/stream/[fileKey]`
- Zustand store plus browser audio lifecycle helpers
- Hebrew RTL primary, `next-intl`
- Supabase Auth user accounts (Google + email one-time code) via `@supabase/ssr`; admins are signed-in users listed in `ADMIN_EMAILS` or with `profiles.role = 'admin'` (optional `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` fallback). The anon key can only read published content; server writes use the service-role client after `requireAdmin()`/`isAdmin()` (`src/lib/auth/admin.ts`). Bookmarks/progress are local-first and sync per user when signed in.
- New-lesson notifications: Web Push (VAPID, `public/sw-push.js`) + optional Resend email, sent by `notifyNewLesson()` in `src/lib/notifications/notify.ts`

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

Production deploy:

```bash
npm run build
npx vercel --prod --yes
```

Never deploy production without explicit user approval.

## Git Workflow

- `dev` is the development branch.
- `main` is the production branch.
- Commit feature work to a `codex/...` branch and open a PR into `dev`.
- Promote `dev` to `main` only when the user approves production release.
- The user's primary worktree may contain local untracked agent files; do not overwrite user changes.

## Critical Implementation Constraints

### Lesson Detail Client Boundary

There is a dev-server webpack issue when a Server Component page imports multiple client components. Keep the lesson detail interactive UI consolidated in:

```text
src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx
```

This file intentionally contains the lesson player, audio list, image gallery, dialogs, and related controls.

### Audio And Player UX

Player surfaces must stay compatible:

- lesson detail player
- header compact player
- bottom mini player
- expanded full player
- driving mode

Playback should behave like a music app:

- background/native resume updates React state
- paused UI must not show while audio is still playing
- download and offline-save are separate actions
- mini player remains tappable and informative
- controls must fit compact mobile screens without horizontal overflow

How playback is wired (keep it this way):

- `src/lib/audio-engine.ts` owns the one `HTMLAudioElement` (no Howler). Its status is read from the element's live state, never inferred from event names.
- `src/lib/audio-controller.ts` is the only code that drives the engine. `<AudioPlayer/>` (root layout) starts it once. UI surfaces, the lock screen and car controls only change store state or call its actions (`play`, `pause`, `togglePlay`, `seekTo`, `skipBackward`, `skipForward`, `playTrack`, `nextTrackOrSkip`, `previousTrackOrSkip`).
- Resuming the loaded track never seeks; a start position is applied only when a different track loads.
- Play/pause icons use `getTransportState()` (real element state), not the `isPlaying` intent.
- Skip semantics are fixed: "back" = -15s (`RotateCcw`), "forward" = +30s (`RotateCw`), via `SkipButton` in `src/components/player/player-controls.tsx`. Render back → play → forward in DOM order and let `dir="rtl"` place them; never swap handlers or icons for RTL.
- Car/headset next/previous go to the queue neighbour, else skip inside the lesson.
- Listen statistics: `src/lib/listen-tracker.ts` (started by the controller) only observes the store and reports to `POST /api/listen` → `listen_events` (migration 015, service role only): first event after 30s of real playback, heartbeats ≤ 1/min, `sendBeacon` flush on pause/pagehide. Pure rules live in `src/lib/listen-tracking.ts`. `/admin/stats` and `/admin/users` read it through the `admin_*` SQL functions.

Important files:

```text
src/lib/audio-engine.ts
src/lib/audio-controller.ts
src/lib/audio-lifecycle.ts
src/lib/audio-resume.ts
src/stores/audio-store.ts
src/hooks/use-audio-player.ts
src/hooks/use-media-session.ts
src/components/player/player-controls.tsx
src/components/player/full-player.tsx
src/components/player/mini-player.tsx
src/components/layout/header.tsx
```

### Offline And Download Behavior

- Offline lesson cache uses IndexedDB (`src/lib/offline-storage.ts`); each saved file is a Blob, played through a blob URL.
- Offline save and local file download both use `/api/audio/download/[fileKey]`, which 302-redirects to a short-lived presigned R2 URL (bytes never pass through a Vercel function). `?filename=` gives an attachment with an RFC 5987 UTF-8 filename; `?disposition=inline` is the raw audio for offline saving. Only `audio/…` keys with an audio extension are signed.
- `/api/audio/stream/[fileKey]` is for playback only (Range → 206).
- iOS home-screen apps can't save attachment downloads: `src/lib/device-download.ts` uses the share sheet (saved files) or opens the link in a Safari view.
- The service worker is registered as `/sw.js?v=<NEXT_PUBLIC_BUILD_ID>`; each deploy installs a new worker, precaches `/he/offline` + its chunks, and deletes older caches. Navigations are network-first with the offline library as fallback; `/api/*` and cross-origin requests are never intercepted.

Useful checks:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3006 npx playwright test tests/e2e/offline-download.spec.ts --project=chromium
PLAYWRIGHT_BASE_URL=http://localhost:3006 npx playwright test tests/e2e/player-behavior.spec.ts --project=chromium
```

## Database Import Handoff

The next major task is importing a new batch of WhatsApp lesson files into Supabase and R2.

Start from:

```text
scripts/import-whatsapp-lessons.mjs
scripts/import-short-clips.mjs
supabase/migrations/
docs/handoffs/2026-05-11-production-wrap-and-database-import.md
```

Guardrails for database work:

- Do not mutate Supabase or R2 until the user approves the exact dry-run plan.
- First inspect the current production schema and compare it to migrations.
- Export or otherwise capture a rollback snapshot/counts before large imports.
- Make import scripts idempotent by checking stable identifiers before insert/upload.
- Prefer a manifest-driven import that can be reviewed before execution.
- Separate full lessons, short lessons/clips, audio files, images, playlists, and category assignment.
- Preserve original WhatsApp filenames in `source_text`, `original_name`, or a dedicated manifest field for traceability.
- After import, verify counts, duplicate detection, sample lesson pages, image rendering, audio playback, local download, offline save, search, and categories.

Likely user-provided inputs for the next session:

- WhatsApp export/media folder or parsed archive path
- start date for import
- lesson grouping rules
- short lesson criteria
- image-to-lesson association rules
- target categories/series/playlists
- naming conventions in Hebrew
- whether existing lessons should be skipped, updated, or merged

## Production Verification Baseline

After the May 11, 2026 production release, these checks passed:

- `npm run build`
- production Vercel build
- `curl https://tora-player.vercel.app/api/health`
- production `/he`, `/he/lessons`, and exact lesson route smoke checks
- Playwright production smoke: `offline-download.spec.ts` and `player-behavior.spec.ts`
- exact lesson download header returned full `application/octet-stream` attachment with full content length (before downloads moved to presigned R2 redirects)
