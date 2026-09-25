# Tora Player

Hebrew Torah lesson audio player and PWA with a Spotify-inspired dark interface.

Production: https://tora-player.vercel.app

## Stack

- Framework: Next.js 15 App Router, TypeScript, Tailwind CSS
- Database: Supabase Postgres with RLS
- Storage: Cloudflare R2 for audio and images
- Media delivery: playback via `/api/audio/stream/[fileKey]`; downloads and podcast enclosures via `/api/audio/download/[fileKey]` (GET redirects to R2; HEAD returns matching metadata)
- Audio engine: singleton browser audio lifecycle plus Zustand player store
- i18n: `next-intl`, Hebrew RTL primary
- Auth: Supabase Auth user accounts; admin access is authorized separately

## Local Development

```bash
npm run dev
npm run type-check
npm run lint
npm run build
npm run test
npm run test:e2e
```

The in-app browser and Playwright tests often use custom ports, for example:

```bash
npm run dev -- --port 3006
PLAYWRIGHT_BASE_URL=http://localhost:3006 npx playwright test tests/e2e/player-behavior.spec.ts --project=chromium
```

## Production Deploy

Development lands on `dev`; production is `main`.

```bash
npm run build
npx vercel --prod --yes
```

Production deploys require explicit user approval. Before deploying from a fresh worktree, make sure `.vercel/project.json` points at the existing Vercel project `tora-player`, not an auto-created worktree project.

Production health check:

```bash
curl -s https://tora-player.vercel.app/api/health
```

Expected healthy production shape:

- `status: "ok"`
- Supabase connected
- schema OK
- R2 configured
- published lessons count present

## Current Shipped State

Last production release: September 25, 2026, via PR #19 (deployment `dpl_3wT2VG4MqZshsGgGPRqDemiSEC4T`).

The current app includes:

- Restored lesson loading from Supabase-backed production data.
- Offline lesson cache with a dedicated offline page and local IndexedDB playback.
- Local file download links for lesson audio, served as full attachment downloads.
- Unified player actions across header, mini player, expanded player, and lesson detail.
- Player UI state recovery when native/browser audio resumes outside React state.
- Mobile/responsive QA coverage for compact player controls.
- Production smoke coverage for lesson loading, player behavior, offline playback, and download headers.

## Listening And Podcast Feeds

- Lessons play their audio parts in order. Progress records the current part and its position; offline copies retain the original part count even when only one file is saved.
- `/feed.xml` includes all published non-short lessons; `/series/<id>/feed.xml` includes the published lessons in that series, including older single-file audio. One audio file produces one episode with a stable GUID.
- Enclosure GET redirects to R2 (which supports Range); HEAD reads only object metadata and returns the matching type, byte length, and optional attachment filename. Publishing or editing catalog content invalidates both feeds and the sitemap.
- Most uploaded audio is Opus (`audio/ogg`). These feeds work in podcast apps that support Opus; Apple Podcasts requires MP3/AAC and is not supported until compatible renditions exist.

## Important Constraints

### Dev Webpack Constraint

Importing multiple `'use client'` components directly into some Server Component pages has caused dev-only webpack failures. For the lesson detail page, keep the interactive lesson UI consolidated in:

```text
src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx
```

Production builds are not affected the same way, but preserve this pattern unless the dev bug is intentionally retired and verified.

### Service Worker And Cache

`public/sw.js` has localhost bypass behavior to avoid stale JavaScript while debugging. If local UI looks stale, unregister the service worker and clear browser caches before assuming the code is wrong.

### Audio Behavior

The app should behave more like Spotify or Apple Music:

- playback state should stay compatible across all player surfaces
- background/native resume should sync back into app UI
- bottom mini player should remain informative and tappable
- expanded player and lesson player should expose compatible actions
- downloads and offline-save are separate workflows

## Data Import Context

Existing import scripts:

- `scripts/import-whatsapp-lessons.mjs`
- `scripts/import-short-clips.mjs`

They currently assume an archive folder at:

```text
/Users/liorelisha/Downloads/whatsapp-archive-parsed
```

and read:

```text
lessons_database.json
```

The next database/import session should start by inspecting those scripts and the Supabase migrations, then create a dry-run manifest for the new WhatsApp files before writing to Supabase or R2.

Relevant tables:

- `lessons`
- `lesson_audio`
- `lesson_images`
- `series`
- `categories`
- `playlists`
- `playlist_lessons`
- `snippets`
- `snippet_submissions`

## Useful Docs

- Session/database handoff: `docs/handoffs/2026-05-11-production-wrap-and-database-import.md`
- Supabase/Vercel region plan: `docs/superpowers/plans/2026-05-10-supabase-vercel-region-migration.md`
- Player experience plan: `docs/superpowers/plans/2026-05-10-player-experience-upgrade.md`
- Background playback plan: `docs/superpowers/plans/2026-05-10-mobile-background-playback-hardening.md`
