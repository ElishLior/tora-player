# Lesson slug implementation handoff to Opus

Implementation is ready for integration on `codex/lesson-slugs`. No commit, push, stash, reset, checkout, production write, or deployment occurred in this implementation run. Local checks used the production anon key in a fresh guest context. No service-role key or R2 credentials entered the local server environment.

## Routes and compatibility

- `src/lib/supabase/lesson-route.ts` resolves UUIDs, current slugs, lowercase variants, encoded parameters, and `lesson_slug_history`. It returns a lesson UUID, redirect pathname, or not-found result. The caller supplies `lessonReadClient()` for admin drafts or the anon client for OG images. UUID queries use `*`, so migration 020 is not required for existing links.
- `src/app/[locale]/lessons/[lessonId]/page.tsx` shares its route/detail lookup between the page and metadata through React `cache()`. Both use `permanentRedirect` outside the cached lookup's error handler. Redirects preserve locale and all query values, including repeated values, `t`, and `file`. Metadata canonical, OG URL, breadcrumbs, related-part links, sharing, and edit navigation use the stored slug. Writes and playback identity use `lesson.id`.
- `[lessonId]/opengraph-image.tsx` awaits params and resolves the route before its ID query. Current slugs, old names, and UUIDs all produce the underlying lesson's preview. Unknown values retain the existing generic brand card behavior.
- `[lessonId]/edit/page.tsx` is now a server route wrapper. It resolves the route and redirects to the current `/edit` URL when needed. `edit/edit-client.tsx` contains the existing edit interface and receives the resolved UUID. No edit form, media upload, reorder, or delete action receives a slug as its lesson ID.
- `src/lib/supabase/lesson-slug-select.ts` retries a missing-column/schema error without `slug`, while retaining all columns, filters, and relationship embeds. `queries.ts`, `lesson-list.ts`, `shorts.ts`, podcast reads, sitemap reads, and notification claims use it. Unrelated query errors remain errors.
- `src/types/database.ts` adds optional nullable `Lesson.slug`, so old rows and old fixtures remain valid. `LESSON_CARD_COLUMNS` includes `slug`.

## HTTP status fix and route moves

The inherited `src/app/[locale]/loading.tsx` caused Next to send HTTP 200 before the asynchronous lesson page could redirect or return not-found. This occurred even when metadata used the same redirect decision. Local HTTP checks proved the failure and the correction.

The skeleton now lives in `src/components/shared/page-loading.tsx`. Route-scoped `loading.tsx` files re-export it for `(home)`, `lessons/(catalog)`, `lessons/upload`, admin, auth, bookmarks, categories, diagnostics, driving, me, offline, playlists, search, series, shorts, and tags. Lesson detail and edit routes have no loading ancestor.

- Home moved from `[locale]/page.tsx` to `[locale]/(home)/page.tsx`, with unchanged contents.
- The lesson list moved from `[locale]/lessons/page.tsx` to `[locale]/lessons/(catalog)/page.tsx`. Only its relative `LessonsClient` import changed.
- Public URLs do not change. No global metadata streaming setting changed in `next.config.ts`.

Next documents that a redirect in an already streamed response uses client markup: https://nextjs.org/docs/app/api-reference/functions/permanentRedirect . The boundary move allows actual HTTP 308 and 404 responses.

## Full lesson-link inventory

- `src/config/site.ts`: `lessonPath` and `lessonUrl` accept a string or `{ id, slug? }`; an available slug wins, otherwise the UUID remains. Segment encoding and absolute/localized URL behavior remain intact.
- `src/i18n/routing-config.ts` and `routing.ts`: locale configuration moved into a module without navigation hooks. `site.ts` uses that module; all existing navigation exports remain available.
- `src/components/lessons/lesson-card.tsx`: stretched card link, detail navigation, and fallback navigation use `lessonPath(lesson)`. This covers homepage recent lessons, continue listening, the catalog and its pagination, search, series detail, category detail, playlist detail, and tag detail. Those pages already share LessonCard and the catalog readers.
- `src/components/home/latest-lesson-hero.tsx`: the hero's detail link uses `lessonPath(lesson)`.
- `src/app/[locale]/shorts/shorts-client.tsx`: short-lesson title links use `lessonPath(lesson)`.
- `src/app/[locale]/lessons/[lessonId]/page.tsx`: canonical, OG URL, breadcrumb, related lesson parts, and the edit link use the resolved lesson object. The series/date/tag links remain listing/filter URLs.
- `src/app/[locale]/lessons/[lessonId]/lesson-player-client.tsx`: the sign-in return URL uses the current lesson path. Its snippet submission still uses the UUID.
- `src/app/[locale]/lessons/[lessonId]/edit/edit-client.tsx`: back navigation uses the known current slug; successful save navigation uses the returned lesson row, including its new slug.
- `src/app/[locale]/me/me-client.tsx`: continue listening and saved-lesson links use loaded lesson objects. Notes and note timestamps use the loaded lesson when available, otherwise their stored UUID. Offline download records still use their stored UUID.
- `src/components/bookmarks/bookmark-groups.tsx`: group links and timestamp links use optional loaded lesson records. `/me` supplies them. Old bookmarks without a loaded record use UUID URLs.
- `src/lib/lesson-tracks.ts`: `lessonMomentPath` accepts the same lesson-or-ID shape and uses `lessonPath`. Online tracks carry optional `lessonSlug`.
- `src/stores/audio-store.ts`: AudioTrack adds optional `lessonSlug`. Old persisted tracks remain valid; `getTrackKey` did not change.
- `src/components/player/full-player.tsx`: "open lesson" uses the current track's slug plus the current locale. It passes the slug to clip sharing.
- `src/lib/player-share.ts`: full, mini, and driving player share controls use the canonical slug from the loaded track. `PlayerShareButton` remains the common control. Driving and up-next have no separate lesson-page URL builder to convert; queues receive the slug through `getLessonTracks`.
- `src/lib/share.ts`: `getLessonShareUrl` accepts a lesson or ID and retains browser-origin and timestamp behavior.
- `src/components/shared/share-button.tsx`: lesson-page sharing receives the real UUID plus optional slug, preserving its loaded-lesson/timestamp comparison.
- `src/components/player/share-clip-dialog.tsx`: clip share URLs use the optional slug; snippet writes still use UUIDs.
- `src/app/[locale]/lessons/upload/draft-row.tsx`: result and edit links use `lessonPath(run.lessonId)`. Upload run records contain only the UUID, so these links intentionally redirect.
- `src/app/[locale]/admin/stats/page.tsx`: aggregate listening-stat links use `lessonPath(lesson.lessonId)` plus locale. Aggregate records have only IDs.
- `src/app/[locale]/admin/snippets/page.tsx`: generated-lesson result links use `lessonPath(sub.result_lesson_id)` plus locale. Submission records have only result IDs.
- `src/lib/notifications/notify.ts`: single and summary push URLs use the claimed lesson object. The claim select includes slug and tolerates the old schema. Notification tags and claim identity retain the UUID.
- `src/lib/notifications/batch-rules.ts`: announcement metadata adds optional slug.
- `src/lib/notifications/email.ts`: single-lesson buttons and digest episode links use `lessonUrl(lesson)`. The digest's catalog button stays a listing URL. Old announcement records without slugs fall back to UUIDs.
- `src/app/sitemap.ts`: the lesson select includes slug, with schema fallback, and emits `lessonPath(row)`. Other sitemap entries stay unchanged.
- `src/lib/podcast-feed.ts`: feed lesson selects and types include optional slug; episode `<link>` uses `lessonUrl(lesson)`. Audio GUIDs, legacy lesson GUIDs, enclosures, and episode identity did not change.
- `src/lib/seo.ts`: lesson JSON-LD uses the lesson's slug URL. `pageAlternates` already accepts a pathname; its lesson caller now passes the slug path.

A whole-src search found no remaining hand-built lesson detail link outside the central helper. Listing, upload, auth, API, and robots paths remain distinct route paths.

## Creation and editing

`src/actions/upload.ts` is the only lesson insert path in src. `createDraftLesson` calls `insertLessonWithSlug` with the stored date, parsha, and short-lesson classification. Existing append-to-day uploads do not rename that day's lesson.

`src/lib/supabase/create-lesson-slug.ts` uses Opus's unchanged `baseLessonSlug` and `uniqueLessonSlug`. It reserves current and historical names with paginated prefix queries. A `23505` for `lessons_slug_key` retries the next suffix. After 20 consecutive races, it finishes with a UUID-only lesson instead of failing the upload. Missing slug schema (`42703`, or the equivalent PostgREST schema-cache errors) falls back to an insert without slug. Other database failures remain failures.

`src/actions/lessons.ts` authorizes with `requireAdmin` before the existing admin client. It validates the optional slug field, checks current and historical ownership, permits restoring the same lesson's old slug, maps slug uniqueness races to a clear translated error, and keeps the current slug for an empty field. Catalog invalidation remains in place.

`messages/he.json` and `messages/en.json` add the owned top-level `lessonSlug` namespace. The edit field shows the current slug, performs live validation, and explains the empty-field and old-link behavior.

`docs/agents/abstractions.md` records the resolver, create helper, compatibility select, and route-scoped skeleton.

## Tests and evidence

New unit test files: `src/config/site.test.ts`, `src/lib/supabase/lesson-route.test.ts`, `create-lesson-slug.test.ts`, `lesson-slug-select.test.ts`, and `src/actions/lessons.test.ts`. Extended tests: `src/lib/lesson-tracks.test.ts`, `src/lib/player-share.test.ts`, and `src/app/feed.xml/route.test.ts`. They cover absent/null slugs, UUID resolution, current/history resolution, lowercase and encoded values, unknown routes, locale/query preservation, collisions, races, missing-schema fallback, admin validation/ownership, unchanged track identity, slug sharing, and stable RSS GUIDs.

`tests/e2e/lesson-slugs.spec.ts` supports both a null-slug database and a backfilled database. Its default block verifies UUID navigation, localized 404 status/UI, canonical URL, and `t` plus repeated query values. Its rollout block is skipped unless `SLUGS_LIVE=1`; it checks real 308 Location, slug 200, sitemap, and card links. It can discover a known UUID's slug from an anonymous HTTP redirect without an anon key in the test process. Optional overrides: `SLUG_TEST_LESSON_ID` and `SLUG_TEST_LESSON_SLUG`.

`tests/e2e/share.spec.ts` now expects the loaded track's slug when present. The runner and local server must use the same `NEXT_PUBLIC_APP_URL`.

Final verification:

- `npx next typegen && npm run type-check`: passed.
- `npm run lint`: passed, zero errors and seven warnings. Warnings are existing unused variables and existing image elements; two image warnings now point at the moved edit client.
- `npm test`: **484 passed in 56 files**, zero failures.
- `npm run build`: passed with the CI placeholder environment from `.factory/checks.sh`, including `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key`, and `NEXT_PUBLIC_APP_URL=http://localhost:3000`. The process used `env -i`, an isolated temporary HOME, and no database or secrets. The final build ran after the loading boundary moves and server cleanup.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3006 npx playwright test tests/e2e/lesson-slugs.spec.ts --project=chromium --reporter=line --trace=on`: **3 passed, 3 rollout tests skipped**, as intended. The final default run needed no Supabase credentials in the test process; the local server used anon reads.
- `SLUGS_LIVE=1 NEXT_PUBLIC_APP_URL=http://127.0.0.1:3006 PLAYWRIGHT_BASE_URL=http://127.0.0.1:3006 npx playwright test tests/e2e/lesson-slugs.spec.ts tests/e2e/share.spec.ts --project=chromium --reporter=line --trace=on`: **11 passed** (six slug tests plus five share tests). The local server and this fixture-discovery run used only the production anon key.
- `tests/e2e/navigation.spec.ts`: **8 passed** in the earlier combined run. That run also passed all six slug tests and exposed four old UUID share expectations. The subsequent 11-test run above passed after those expectations and the runner origin matched the new behavior.
- Direct guest HTTP probes: unknown slug **404**, UUID with slug **308**, uppercase slug **308**, percent-encoded lowercase slug **200**. Slug and UUID OG images both returned **200**, each 294,087 bytes.
- `/api/health`: anon database connected, schema OK, 245 published lessons. R2 unconfigured, as required for the guest run.
- `git diff --check`: passed. A byte comparison against HEAD confirmed unchanged home and skeleton contents; the moved catalog page differs only in its relative client import.
- Cleanup killed only the recorded server PID, **13942**. Port 3006 is free.

Evidence, logs, OG images, and Playwright traces: `/Users/liorelisha/.local/state/verify-tora/20261007T222652Z-slugs-Gm4Q`. Final files include `build-final.log`, `slugs-default-final.txt`, `slugs-share-final.txt`, `slugs-and-regression.txt`, `health.json`, `commit.txt`, and `port-after.txt`. Earlier failed traces remain in the same folder; the final logs above identify the successful runs.

## Requests for Opus and remaining limits

1. **Database history ownership:** migration 020's trigger deletes a history entry whenever a new current slug matches it. It does not prohibit another lesson from claiming that old name. The app checks both tables, but concurrent writes or direct database writers can bypass that check. Add an atomic database reservation across current and historical names. A name owned by another lesson must fail with a slug uniqueness error, rather than delete the historical redirect. Since 020 is now applied according to your rollout files, use a follow-up migration if necessary. This implementation did not edit or apply migrations.
2. **Optional helper hardening:** `uniqueLessonSlug` can append a suffix beyond the 80-character limit when the base is already 80 characters. Current upload topics from the provided helper are much shorter, but a long reviewed custom topic can hit this limit. Please keep suffixed results within `MAX_LESSON_SLUG_LENGTH`. This implementation did not edit `lesson-slugs.ts`.
3. The admin edit/write and upload flows have fake-client unit coverage only. Guest verification deliberately did not sign in or drive those flows against production data.
4. The current anon data has slugs; null-slug and absent-column behavior has modeled unit coverage. The local HTTP/browser checks exercised backfilled published records. The rollout block still needs a deployed-code run by Opus after deployment.
5. Verification applies to this uncommitted worktree. It is not evidence for a clean committed release. Opus owns integration, commits, data, and deployment.

Opus-owned changes appeared during the run: CLAUDE.md, the proposal status, the backfill script/topic data, `lesson-slugs.ts` and its rule tests, and migration 020. They remain intact and are not claimed as this implementation's edits.
