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
- Images served by `/api/images/stream/[fileKey]`: 302 to a presigned R2 URL (no bytes through Vercel). Only `images/…` keys with a raster extension are signed (`servableImageContentType`, `src/lib/image-keys.ts`); the URL is stable per 6-hour signing window with an immutable `response-cache-control`, so the redirect is cached privately and the browser keeps the bytes. Build URLs with `getImageStreamUrl()`.
- Lesson gallery thumbnails: the admin image upload renders a ~480px WebP (`createGalleryThumbnail`, `src/lib/image-thumbs.ts`, sharp) to `images/<lesson>/thumbs/<name>.webp` and stores `lesson_images.thumb_key` + the original's displayed `width`/`height` (migration 019). The grid shows the thumbnail (original while `thumb_key` is null), the lightbox the original. Older rows: `node --experimental-strip-types scripts/backfill-image-thumbs.mjs [--apply]`.
- Zustand store plus browser audio lifecycle helpers
- Hebrew RTL primary, `next-intl`
- Lesson topic tags: `lessons.tags text[]` (migration 016, GIN index, `lesson_tag_counts()` RPC). Every write goes through `normalizeTags()` (`src/lib/tags.ts`); URL helpers live in `src/lib/tag-links.ts`. Tags show as `#tag` chips inside `<bdi>` linking to `/[locale]/tags/<tag>` (the `/[locale]/tags` page is a tag cloud). `/lessons?tag=` filters with `.contains('tags', [tag])` (`src/lib/supabase/lesson-list.ts`). Admins edit tags inline on the lesson page (`updateLessonTags`) or on the edit page (`updateLesson`). Search and קצרים also match tags.
- Public catalog reads: `src/lib/supabase/anon.ts` has a cookie-less anon client (`createAnonSupabaseClient`, published content only via RLS) and `unstable_cache` readers (`getCached*`, tag `catalog`, 5 min), plus `createCatalogLessonListReader()` for `/lessons`, `/tags/[tag]` and `/search`. Use them for public data in pages. Never use them for per-user or admin (unpublished) data. Every action that writes catalog data (lessons, audio parts, images, categories, series, publish) calls `revalidateCatalog()`, never a bare `revalidatePath`. Writes outside `src/actions` (upload API routes, scripts) show up after at most 5 minutes.
- Lesson list queries select `LESSON_CARD_COLUMNS` + `LESSON_AUDIO_FILES` (`src/lib/supabase/lesson-selects.ts`), not `*`. If a card or list reads a new lesson column, add it there. Only the lesson page reads the full row. Category counts come from the `category_lesson_counts()` RPC (migration 018).
- Lesson search (`src/lib/supabase/lesson-list.ts`): `normalizeSearchQuery()` strips niqqud/cantillation, then `ilike` runs on title/hebrew_title/description (pg_trgm GIN indexes, migration 018) and tags match via `matchTags`. The `?type=` audio-type filter is an `!inner` embed (`audio_type_match:lesson_audio!inner(audio_type)`) inside the same query. Never filter the `audio_files` embed itself, because the queue needs every part.
- Supabase Auth user accounts (Google + email one-time code) via `@supabase/ssr`; admins are signed-in users listed in `ADMIN_EMAILS` or with `profiles.role = 'admin'` (optional `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` fallback). The anon key can only read published content; server writes use the service-role client after `requireAdmin()`/`isAdmin()` (`src/lib/auth/admin.ts`). Bookmarks/progress/personal notes are local-first and sync per user when signed in (`src/lib/account/sync.ts`, merge rules in `src/lib/account/merge.ts`).
- Lesson reads that must also open unpublished drafts for admins (the lesson page, `getLesson` / `getAudioFiles` in `src/actions/lessons.ts`) use `lessonReadClient()` (`src/lib/supabase/admin-lesson.ts`). It returns the service-role client for admins and the cookie client for everyone else. Queries run through it must not embed per-user tables (bookmarks, progress), because the service role would return every user's rows.
- Personal library at `/[locale]/me` (listening, bookmarks, notes, downloads, notifications, account; `/auth/account` redirects there). Note images are signed-in only, private R2 objects under `user-notes/<user_id>/<note_id>/`, uploaded via `POST /api/notes/images` and served to their owner only by `/api/notes/images/[imageId]` (302 to a short-lived presigned URL).
- New-lesson notifications: Web Push (VAPID, `public/sw-push.js`) + optional SMTP email (Gmail app password or any provider; same sender as Supabase Auth), sent by `notifyNewLesson()` (one lesson) or `notifyNewLessons(ids, 'none' | 'summary' | 'each')` (an upload batch: one summary push + digest email) in `src/lib/notifications/notify.ts`. Every announced/skipped lesson gets `lessons.notified_at`, so it is never announced twice.
- Admin upload (`/[locale]/lessons/upload`): drop a day or a week of WhatsApp audio + photos; `src/lib/upload-drafts.ts` groups them into one draft per day (shorts per named file), and `lookupUploadTargets` (`src/actions/upload.ts`) skips files already stored and appends drafts to a day that already has a lesson. Files go through one queue (`src/lib/upload-queue.ts`, 2 at a time); a lesson publishes only when all its files landed and a retry re-sends only failed files. Android share sheet: manifest `share_target` → `public/sw.js` stashes the files in Cache Storage (`share-target-v2`) → `/he/lessons/upload?shared=1` loads them.
- Upload transcoding (ffmpeg.wasm, `src/lib/audio-transcode.ts`) loads a self-hosted core from `/ffmpeg/`. `scripts/copy-ffmpeg-core.mjs` copies the pinned devDependency `@ffmpeg/core` there on `predev` and `prebuild`, and `public/ffmpeg/` is gitignored. To upgrade the core, bump the exact version in package.json.
- The CSP is in `vercel.json` and applies to deploys only. `script-src` has `'wasm-unsafe-eval'` (for ffmpeg.wasm) and no `'unsafe-eval'`, so client code must not use `eval` or `new Function`. A new third-party origin needs a CSP entry.
- Abandoned upload chunks (`_chunks/` in R2) expire after 1 day through a bucket lifecycle rule set by `node scripts/r2-lifecycle.mjs --apply`. Run it without `--apply` to see the current rules. It needs an R2 token with Admin Read & Write permission.

## Site Identity And SEO

- `src/config/site.ts` is the only source for the origin (`SITE_URL` from `NEXT_PUBLIC_APP_URL`), `SITE_NAME`/`SITE_TAGLINE`/`SITE_AUTHOR`, `DEFAULT_LOCALE` and URL builders (`localePath`, `pageUrl`, `absoluteUrl`, `lessonPath`/`lessonUrl`, `seriesPath`, …). Never hardcode the domain, the app name or `/he` in code; client UI text uses `common.appName`. A domain move is the env value only; a rename is `SITE_NAME` + `common.appName`. Storage keys (`tora-player-*`, bucket) stay as they are.
- Content pages (`lessons/[lessonId]`, `series/[seriesId]`, `categories/[categoryId]`, `playlists/[playlistId]`, `tags/[tag]`) export `generateMetadata` that shares the page's lookup through a React `cache()` loader, and set `alternates: pageAlternates(pathname)` (`src/lib/seo.ts`): canonical on the `/he` URL plus the RSS link (a page's `alternates` replaces the root one). `/en` pages are `noindex` (`[locale]/layout.tsx`); titles are Hebrew-only. Root title template: `%s · נגן תורה`.
- Private sections (admin, auth, me, bookmarks, offline, driving, upload, edit) get `noindex` from a `layout.tsx` exporting `NOINDEX_METADATA`; `src/app/robots.ts` disallows them and `/api/`. Non-production deploys send `X-Robots-Tag: noindex` (`next.config.ts`).
- JSON-LD (`PodcastEpisode`/`PodcastSeries`/`BreadcrumbList`) is built in `src/lib/seo.ts` and rendered with `<JsonLd>` (`src/components/seo/json-ld.tsx`).
- Link previews: `src/app/opengraph-image.tsx` (default) and `[locale]/lessons/[lessonId]/opengraph-image.tsx`, both via `renderOgImage` (`src/lib/og-image.tsx`, Heebo TTFs in `src/assets/fonts`). Satori has no bidi, so Hebrew goes through `rtlVisualWords` (`src/lib/og-bidi.ts`) and a `row-reverse` wrapping row; never pass raw Hebrew strings to Satori. Pages without their own image must not set `openGraph` (it would drop the root image).
- Podcast RSS: `/feed.xml` (all non-short lessons) and `/series/<id>/feed.xml`, built by `src/lib/podcast-feed.ts`: one episode per audio part, GUID = `lesson_audio.id`, enclosure = absolute `/api/audio/download/<key>?disposition=inline`. Artwork `public/brand/podcast-cover.jpg` (1400², from `scripts/generate-icons.mjs`). Most audio is Opus (`audio/ogg`), which Apple Podcasts does not play; Pocket Casts/AntennaPod/Overcast do.
- `src/app/sitemap.ts` (published lessons, series, categories, public playlists, tags; `revalidate = 3600`) and `/feed.xml` (`revalidate = 900`) read with `createAnonSupabaseClient()`. At `next build` (CI has no database) they fall back to static-only/empty output; at runtime a read error throws so the last good version keeps serving.
- The web manifest is `src/app/manifest.ts` (`/manifest.webmanifest`, `id` = `/he` so existing installs keep their identity). UI font: Heebo (`src/app/fonts.ts`, `--font-heebo`). The header app name is not a heading: each page owns its single `<h1>`. Unknown `/he/...` paths hit `[locale]/[...rest]` → localized 404; other paths use `src/app/not-found.tsx`.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm run test
npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs on every push and PR to `dev`/`main`: `npx next typegen` + type-check, lint (`eslint .`, flat config), vitest, and `npm run build`. The build uses placeholder public env (Supabase pointed at a closed local port) and no secrets. Pages, `sitemap.ts` and other routes prerendered at build time must therefore survive a failed Supabase read. `.prettierrc` sorts Tailwind classes (including inside `cn()`/`cva()`). Format only the files you touch.

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
- Skip semantics are fixed: "back" = -15s (`RotateCcw`), "forward" = +30s (`RotateCw`), via `SkipButton` in `src/components/player/player-controls.tsx`. Render back → play → forward in DOM order and let `dir="rtl"` place them; never swap handlers or icons for RTL. The icon itself is mirrored in RTL (`rtl:-scale-x-100`) so each arrow points outward toward its own side.
- Car/headset next/previous go to the queue neighbour, else skip inside the lesson.
- Queues are built only with `getLessonTracks(lesson)` / `getOfflineLessonTracks(meta)` (`src/lib/lesson-tracks.ts`): one track per part with `partIndex`/`partCount`. Every list query that renders playable cards selects `LESSON_AUDIO_FILES` (`src/lib/supabase/lesson-selects.ts`).
- Starting a lesson from anywhere goes through `playLesson` / `playLessons` (`src/lib/play-lesson.ts`), which continue at the saved part and position. Rules live in `src/lib/lesson-progress.ts`: progress is one entry per lesson (`audioFileId` + position in that part, `playback_progress.audio_file_id`, migration 017); a lesson is heard when its last part reaches its final minute (or last 5% of a short clip); a nearly finished earlier part resumes at the next part.
- Bookmarks and notes store their part (`audioFileId`); moments without one belong to the first part (`isMomentInPart`). Seek-bar markers show only the displayed part's bookmarks.
- Sleep timer (`sleepTimer` in the audio store, not persisted; UI `src/components/player/sleep-timer.tsx`): minutes (wall clock, 10s fade-out, enforced on `timeupdate`), end of part, or end of lesson (enforced in `finishTrack`).
- Queue editing lives in the audio store: `playNext(tracks)` (insert right after the current track, moving existing copies), `removeFromQueue(i)` (never the current track), `moveInQueue(from, to)` (queueIndex follows the current track). UI: full-player previous/next lesson buttons (only with queue neighbours, `SkipBack`/`SkipForward` mirrored in RTL), the "Up next" sheet (`src/components/player/up-next.tsx`), and the LessonCard "play next" button while something else is loaded. Series and playlist pages use `PlayLessonsButtons` (`src/components/lessons/play-lessons-buttons.tsx`): "Play all" in listing order; on series, "Continue series" = first not-heard lesson in date order, playing on through the later ones.
- Modal player surfaces (full player, Up next) are `role="dialog"` elements wired with `useModalDialog` (`src/hooks/use-modal-dialog.ts`): focus in, Tab trapped, Escape closes (not while a menu inside has `aria-expanded="true"`), focus back to the opener. Popover menus (speed, sleep timer) centre with physical `left-1/2 -translate-x-1/2` and close on Escape. The mini player's expand area is one `<button data-player-expand>`; its other controls are siblings, never nested.
- Cast (`src/lib/cast-utils.ts`) never uses `alert()`: outcomes go to `useCastStatus` and show inline via `CastStatusMessage`. Chromecast gets the current position and the file's real MIME type, then local playback pauses. Cast is hidden while an offline copy (`blob:`) plays.
- Media Session artwork: `track.artworkUrl` (MIME type from its extension, no invented size) or else the app icons.
- "New" badge: `src/stores/visit-store.ts` (persisted `tora-visits`) keeps `previousVisitAt` for the whole visit (a visit ends after 30 min unseen), so badges don't vanish on reload. LessonCard shows it after hydration for lessons created since then with no local progress (lists must select `created_at`).
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
- The service worker is registered as `/sw.js?v=<NEXT_PUBLIC_BUILD_ID>`. Each deploy installs a new worker and precaches `/he/offline` plus its chunks and `/manifest.webmanifest`.
  - Activation deletes older builds' caches, except the static cache of the build it replaces. That cache is kept for 7 days after the build was replaced, so a tab left open across a deploy still loads its old hashed chunks; `cacheFirst` looks in every cache.
  - Navigations are network-first, with the offline library as the fallback. `/api/*` and cross-origin requests are never intercepted.
- A chunk that still fails to load after a deploy (`ChunkLoadError` and similar, `src/lib/chunk-error.ts`) makes `src/app/[locale]/error.tsx` hard-reload once, with a 60s sessionStorage guard against loops. It never reloads while `isPlaying`; it shows an "update available" screen with a reload button instead. `src/app/global-error.tsx` covers layout failures and brings its own `<html>`/`<body>`.

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
