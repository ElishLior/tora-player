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
- Cookie-based admin auth, no public user accounts

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

Important files:

```text
src/hooks/use-audio-player.ts
src/hooks/use-media-session.ts
src/lib/audio-engine.ts
src/lib/audio-lifecycle.ts
src/stores/audio-store.ts
src/components/player/full-player.tsx
src/components/player/mini-player.tsx
src/components/layout/header.tsx
```

### Offline And Download Behavior

- Offline lesson cache uses IndexedDB.
- Local file download uses the audio stream route with `download=1` and `filename=...`.
- Download mode should ignore Range requests and return a full attachment response.
- Validate download fixes with browser download tests and header checks.

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
- exact lesson download header returned full `application/octet-stream` attachment with full content length
