# Production Wrap And Database Import Handoff

Date: 2026-05-11

## Session Summary

This session stabilized Tora Player as a production-ready Hebrew lesson audio PWA and shipped the player/offline/download fixes to production.

Production URL:

```text
https://tora-player.vercel.app
```

Latest production release:

```text
PR #9: codex/unify-player-surfaces
Merged into dev, promoted to main, deployed to Vercel production.
```

## What Shipped

- Lesson loading restored and verified against production Supabase data.
- Offline lesson cache and offline playback path hardened.
- Local file download button fixed on lesson detail and expanded player surfaces.
- Download API now returns full attachment responses in download mode, even if a browser sends a Range request.
- Header player, bottom mini player, expanded player, and lesson detail player now expose compatible actions.
- Native/background playback resume syncs back to UI so audio cannot keep playing while the UI says paused.
- Compact mobile responsiveness for player controls was tested.
- Production Vercel deploy completed against the correct `tora-player` project.

## Production Verification

After deployment, these checks passed:

```bash
npm run build
PLAYWRIGHT_BASE_URL=https://tora-player.vercel.app npx playwright test tests/e2e/offline-download.spec.ts tests/e2e/player-behavior.spec.ts --project=chromium --reporter=list
curl -s https://tora-player.vercel.app/api/health
```

Health output confirmed:

- Supabase: connected
- schema: OK
- lessons: 134 total, 134 published
- R2: configured

Exact lesson smoke path:

```text
https://tora-player.vercel.app/he/lessons/898dca42-38d9-4383-8e65-72b76208f07e
```

Exact lesson download URL was discovered from the page and checked with a Range header. It returned:

- HTTP 200
- `content-type: application/octet-stream`
- `content-disposition: attachment`
- full `content-length`

## Important Deployment Note

A first deploy attempt from a new worktree auto-created a Vercel project named `tora-next-planning`. That project did not have production env vars and returned degraded health.

The worktree was relinked to the real Vercel project:

```text
tora-player
```

Future deploys should verify `.vercel/project.json` points to `tora-player` before running production deploys.

## Current Import Pipeline

Existing scripts:

```text
scripts/import-whatsapp-lessons.mjs
scripts/import-short-clips.mjs
```

Current assumed parsed archive path:

```text
/Users/liorelisha/Downloads/whatsapp-archive-parsed
```

Current assumed JSON:

```text
lessons_database.json
```

Existing import script responsibilities:

- creates or reuses series
- inserts lessons
- uploads lesson audio to R2
- inserts `lesson_audio`
- uploads images to R2
- inserts `lesson_images`
- creates playlists
- imports short clips as lessons

Important Supabase tables:

```text
lessons
lesson_audio
lesson_images
series
categories
playlists
playlist_lessons
snippets
snippet_submissions
```

## Recommended Next Work Plan

1. Create a new `codex/...` branch from `dev`.
2. Inspect Supabase schema from migrations and live production.
3. Inspect the new WhatsApp files and any parsed JSON/manifest the user provides.
4. Define a reviewable import manifest before writing any data.
5. Run a dry-run that reports:
   - lessons to create
   - existing lessons to skip/update
   - short lessons/clips to create
   - audio files to upload
   - images to upload
   - category/series/playlist assignments
   - duplicate or ambiguous files
   - missing metadata or missing media
6. Get user approval for the dry-run counts and rules.
7. Run the import in stages:
   - lessons/metadata
   - audio
   - images
   - short lessons
   - playlists/categories
8. Verify production:
   - database counts
   - sample lesson pages
   - audio playback
   - image rendering
   - local file download
   - offline save
   - search
   - category placement
9. Commit code/script changes to `dev`, then deploy production only with explicit user approval.

## Questions For The Next Session

Ask the user for:

- path to the new WhatsApp export or parsed media folder
- whether the data is raw WhatsApp export or already parsed JSON
- start date for the import
- how to group files into lessons
- how to identify short lessons
- how images should attach to lessons
- whether duplicates should be skipped, merged, or replaced
- target series, categories, and playlists
- Hebrew naming format
- whether any old lessons should be renamed or re-categorized

## Handoff Prompt For The Next Conversation

Use this prompt to start the database/import work:

```text
We are continuing work on Tora Player, a Hebrew Torah lesson audio PWA.

Repo/worktree context:
- Next.js 15, TypeScript, Tailwind, Supabase, Cloudflare R2.
- Production is https://tora-player.vercel.app.
- Development branch is dev; production branch is main.
- Never deploy production or mutate production data without explicit approval.
- Current production health after the last release: Supabase connected, schema OK, R2 configured, 134 published lessons.

Important files:
- CLAUDE.md
- README.md
- docs/handoffs/2026-05-11-production-wrap-and-database-import.md
- scripts/import-whatsapp-lessons.mjs
- scripts/import-short-clips.mjs
- supabase/migrations/
- src/app/api/audio/stream/[fileKey]/route.ts
- src/app/api/images/stream/[fileKey]/route.ts

Goal:
We need to do a careful database/media import from WhatsApp lesson files. I will provide files from WhatsApp groups. We need to sort them into full lessons and short lessons, attach related images to each lesson, start from a specific date, upload audio/images to R2, insert/update Supabase records, and verify the app.

Rules:
- First inspect the current scripts, schema, and provided files.
- Build or update a manifest-driven dry-run.
- Do not write to Supabase or upload to R2 until I approve the dry-run plan and counts.
- Preserve original filenames for traceability.
- Make the process idempotent so reruns do not duplicate lessons/audio/images.
- After import, verify lesson pages, audio playback, images, local download, offline save, search, categories, and production health.

Please start by reading the handoff doc and import scripts, then ask me only for the minimum missing inputs needed to produce the dry-run plan.
```

## Risks To Watch

- Duplicate lesson dates may not be enough to identify lessons if multiple lessons occur on one day.
- Existing scripts have hard-coded archive paths; parameterizing paths may be safer before the next large import.
- Short clips currently dedupe by `source_text` filename; confirm this still fits the new files.
- Images may need stronger association rules than date-only matching.
- Large R2 uploads should be resumable or at least staged with clear progress and skip logic.
- Production env vars are configured on the real `tora-player` Vercel project, not necessarily on preview projects.
