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
| `systemSkipSeconds` | `src/lib/player-track-actions.ts` | `({ seekOffset, appleTouchDevice, appSeconds }) => seconds` | Lock-screen / notification skip length, so it matches the number the OS shows. |
| `PlayerShareButton` | `src/components/player/player-share-button.tsx` | `<PlayerShareButton compact? />`; `sharePlayingLesson(track)` (`src/lib/player-share.ts`) | Sharing the loaded lesson from any player surface: native sheet, clipboard, manual-copy fallback. Never touches playback. |
| `UpNextList` | `src/components/player/up-next-list.tsx` | `limit?`, `onJump?`, `focusFallback?` (RefObject), `className?`; `jumpToQueueItem(index)` | The queue after the current track: jump, move, remove, through the store actions only. Used by the Up next sheet (all rows) and the desktop now-playing panel (first 5). Add a new surface by composing it, not by copying rows. |
| `NowPlayingPanel` | `src/components/player/now-playing-panel.tsx` | `<NowPlayingPanel className? />`; a skeleton before hydration | The desktop home side player (from 1360px). With a track loaded: artwork, title and metadata links, current part, `TransportControls`, `PlaybackTimeline`, speed, `VolumeControl`, bookmark, share, `UpNextList`. Otherwise: the last-played lesson (`pickLastPlayed`) with a continue button that never autoplays, or an empty state. |
| `TransportControls` / `PlaybackTimeline` / `VolumeControl` | `src/components/player/transport-controls.tsx` | narrow store selectors; controller actions only | The desktop transport (−15 / play / +15 / previous-next lesson), seek bar with times and volume. Shared by `DesktopPlayerBar` and `NowPlayingPanel`. |
| `DesktopPlayerBar` | `src/components/player/desktop-player-bar.tsx` | mounted by `MiniPlayer` from `lg` | The desktop bottom player (info, transport and timeline, extras). The phone bar stays `lg:hidden`. |
| `pickLastPlayed` / `sortByRecency` | `src/lib/last-played.ts` | progress map in, lesson id + position out | "Last played" displays with nothing loaded. Pure. |
| `useLessonsByIds` | `src/hooks/use-lessons-by-ids.ts` | `(ids, enabled?)` → `{ lessons, settled }` | Published lesson data for ids known only on the device (continue strip, panel). |
| Queue source | `src/lib/queue-source.ts` | `createSegmentLoader(deps)` (`ensureAhead`, `loadNext`), `appendUniqueTracks`, `shouldLoadAhead`, `isPermanentMediaError` | A queue that grows by segments (once per cursor, never reshuffled). The controller uses it for category sessions. |
| Category queue | `src/lib/category-queue.ts`, `src/actions/category-queue.ts` | `loadCategoryQueueSegment(client, req)`, `createCategoryQueueSource`, `compareQueueOrder`, `getCategoryQueueSegment(input)` | A category's lessons as keyset pages in the list order, published only. |
| `PlayCategoryButton` | `src/components/lessons/play-category-button.tsx` | `categoryId`, `scopeIds`, `snapshotAt`, `seed` | Continuous play of a category, with its notices (skipped, finished, stopped). |
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
| Lesson browse links | `src/components/lessons/lesson-browse-links.tsx` | `<LessonDateLink date hebrewDate? onClick? className? />`, `<LessonTagLink tag />`, `<LessonTagList tags />`, `<LessonSeriesLink seriesId name onClick? className? />` | Showing a lesson's date, tags or series anywhere: accessible links to its list or series page, safe beside a card's stretched link. `LessonTagList` is the chip row (renders nothing without tags). `LessonSeriesLink` takes its colour from `className`; pass `onClick` in modal players. |
| Part types | `src/lib/part-types.ts`, `src/components/lessons/part-type-field.tsx`, `getCachedPartTypes` (`src/lib/supabase/anon.ts`) | `normalizePartType`, `partTypeOptions(used)`; `<PartTypeField value onChange />` (commits a whole value, never per keystroke) | Any place that sets or lists a part's type (סידור / עץ חיים / admin-added types). |
| Lesson slugs | `src/lib/lesson-slugs.ts` | `baseLessonSlug({ date, parsha, isShort, topic })`, `uniqueLessonSlug(base, isTaken)`, `isValidLessonSlug`, `isUuid`, `readingTopic` | Naming any lesson URL. Never hand-build a slug. |
| Lesson routes | `src/lib/supabase/lesson-route.ts` | `resolveLessonRoute(client, param)`, `lessonRedirectUrl(path, locale, params)` | UUID, current slug and old slug resolution; preserve locale and playback query parameters. |
| Slug creation | `src/lib/supabase/create-lesson-slug.ts` | `insertLessonWithSlug(client, row, input)` | Upload drafts: reserve current/history names, retry slug races, tolerate missing migration. |
| Slug select compatibility | `src/lib/supabase/lesson-slug-select.ts` | `withLessonSlugSelect(columns, read)` | Explicit catalog selects before and after migration 020. |
| Part lengths | `src/lib/part-durations.ts`, `src/components/lessons/part-durations.tsx`, `getLessonPartSeconds(lesson)` (`src/lib/lesson-tracks.ts`) | `formatPartDurations(seconds[], t)` → `["חלק 1: 82 דק׳", …]` (minutes only; one part = its length only; unknown length = name only); `<PartDurations seconds />` | Showing a lesson's parts and lengths anywhere (cards, hero, shorts, notifications). The component keeps one line; on overflow it fades the hidden side and reveals by swipe/tap or hover/keyboard focus. In a card with a stretched link, render it as a sibling of the link. |
| Site identity | `src/config/site.ts` | `SITE_URL`, `localePath`, `pageUrl`, `lessonPath`, ... | Any origin, name or URL. Never hardcode them. |
| New-content announcement | `src/lib/notifications/notify.ts` (server), pure rules in `announcement.ts`, `recipients.ts`, `upload-announcement.ts` | `notifyNewLessons(lessonIds, mode)`, `notifyNewLesson(id)` | Telling listeners about published lessons or appended parts. Pass every touched lesson id; it claims what is new (idempotent), sends one push + one email per person, never throws. Never send push/email directly. |

## Verification

| Block | Where | Use it for |
|---|---|---|
| Page loading skeleton | `src/components/shared/page-loading.tsx` and route-scoped `loading.tsx` exports | Keep loading UI outside lesson detail ancestors so asynchronous resolution can send HTTP 308/404 before streaming. |
| CI script | `.factory/checks.sh` | The canonical local run: install, type-check, lint, unit tests, build. |
| Controller test harness | `src/lib/audio-controller.test.ts` (fake audio element, `becomePlaying`, `endCurrentFile`) | Modeled playback scenarios. Results are "modeled", never "device verified". |

## Notifications

| Block | Where | Interface | Use it for |
|---|---|---|---|
| `notificationPromptView` + `<NotificationPrompt />` | `src/lib/notification-prompt.ts`, `src/components/notifications/notification-prompt.tsx` | `notificationPromptView({ status, neverAgain, snoozedUntil, now })` → `'enable' \| 'ios-install' \| null`; `<NotificationPrompt />` mounted once in the locale layout | The once-per-device "get an alert for new lessons?" question. Built on `usePushNotifications()`; reuse the rule and the memory helpers (`readPromptMemory`, `rememberNotNow`, `rememberEnabled`), never a second prompt. |

## Categories

| Block | Where | Interface | Use it for |
|---|---|---|---|
| Category tree rules | `src/lib/category-tree.ts` | `buildCategoryTree(rows)`, `descendantIds(tree, id)`, `categoryAncestors`, `categoryDepth`, `subtreeHeight`, `validateCategoryMove({ tree, id, newParentId })`, `validMoveTargets`, `reorderSiblings`, `validateCategoryParent`, `categoryOptions(tree, locale)`, `categoryLabel(category, locale)`, `categoryLessonTotal`, `isProtectedCategory`, `containsProtectedCategory`, `findCategory`, `childrenOf` | Any code that reads, shows or changes the three-level category tree. Pure; the actions, admin page, pages and playback scope all call it. Use `categoryLabel` for every displayed category name. |
| `<CategoryPicker />` | `src/components/categories/category-picker.tsx` | `value`, `onChange`, `categories` (tree), `includeNone?`, `noneLabel?`, `noneValue?`, `placeholder?`, `className?`, `disabled?` | Choosing a category anywhere (lesson editor, bulk bar, upload draft, snippets, lesson page). Every top-level category and its children are selectable. |
| `updateLessonCategory(lessonId, categoryId \| null)` | `src/actions/categories.ts` | `{ categoryId } \| { error }`; admin only, validates the category, revalidates the catalog | Setting one lesson's category from a lesson page. Use `bulkUpdateLessonCategory` for many lessons. |

## Layout

| Block | Where | Interface | Use it for |
|---|---|---|---|
| App sections | `src/components/layout/nav-items.ts` | `PRIMARY_NAV`, `BROWSE_NAV`, `isNavActive(pathname, locale, href)` | Every navigation surface. `BottomNav` (phones/tablets) and `SideNav` (lg+, inline start, so right in Hebrew and left in English) both read it; add a section here, not in a component. |
| `<LessonCardList>` | `src/components/lessons/lesson-card-list.tsx` | children = `LessonCard`s / skeletons | Any list of lesson cards: one column, two from `xl` so rows never stretch across a wide screen. |

## Sharing

| Block | Where | Interface | Use it for |
|---|---|---|---|
| `sharePlatform` | `src/lib/share-platform.ts` | `({ userAgent, platform?, maxTouchPoints? }) → 'apple' \| 'android' \| 'other'` | Pure OS detection (iPadOS desktop UA included). Read `navigator` only at the call site. |
| `<PlatformShareIcon />` | `src/components/shared/platform-share-icon.tsx` | `className?`; decorative (`aria-hidden`) | Any share icon: Apple's square-with-arrow on Apple devices, lucide `Share2` elsewhere. Renders `Share2` until hydrated, so it never mismatches the server. Keep the button's label. |
| `<ShareButton />` | `src/components/shared/share-button.tsx` | `lessonId`, `lessonSlug?`, `title`, `seriesName?`, `variant?: 'icon' \| 'action'` | Sharing a lesson with the share sheet (link, time, native share). `icon` for top bars; `action` for a labelled row in the lesson player. |

## 1.2 additions

| Block | Where | Interface | Use it for |
|---|---|---|---|
| `attachmentDisposition` / `sanitizeAttachmentName` | `src/lib/attachment-disposition.ts` | `(filename, asciiFallback?)` → header value | Any `Content-Disposition: attachment` (audio and image downloads). |
| Image download | `src/lib/image-download.ts`, `src/lib/image-download-client.ts`, `src/components/lessons/image-download-button.tsx` | `imageDownloadPath(id)`, `buildImageDownloadNames`, `sortLessonImages`, `downloadLessonImage(url, opts, env)`, `<ImageDownloadButton imageId number />` | Downloading a lesson image (route `/api/images/download/[imageId]`). |
| `BookmarkDialog` (add + edit) | `src/components/bookmarks/bookmark-dialog.tsx` | `bookmark` (edit) or `lessonId`/`audioFileId`/`position` (add), `onClose`, `onSaved?`; `useBookmarkSavedNotice()` | Adding or editing a bookmark from any surface. Do not write a new dialog. |
| `updateBookmark` | `src/stores/bookmarks-store.ts` | `(id, patch, { expectedUpdatedAt? })` → `{ error? }` | Any edit of an existing bookmark (same id, never a second record). `BOOKMARK_NOTE_MAX` in `src/lib/bookmark-rules.ts`. |
| `moveCategory` / `reorderCategory` | `src/actions/categories.ts` | `(id, newParentId, newIndex, expectedUpdatedAt)` → result code | Changing a category's place (migration 023 RPC; stale-safe). |
| App version | `src/lib/app-version.ts`, `src/components/shared/app-version-label.tsx` | `APP_VERSION`, `BUILD_ID`, `shortBuildId`; `<AppVersionLabel />` | Showing the running version. Never show the server's version as the running one. |
| App update | `src/lib/app-update.ts`, `src/hooks/use-app-update.ts`, `src/components/pwa/app-update-banner.tsx` | `shouldCheckForUpdate`, `updateTarget`, `refreshDecision`, `verifyRefresh`; `useAppUpdate()`; `<AppUpdateBanner />` | Detecting a newer deploy and refreshing safely (never while playing, no loops). |
| Release announcements | `src/lib/release-announcement.ts`, `src/lib/notifications/release-announcement.ts`, `src/actions/release-announcements.ts` | `releaseTemplate`, `releaseSendBlock`, `previewRelease(id, deps)`, `sendRelease(id, confirmVersion, deps)` | Manual admin release notices only (Web Push, live-version gate, atomic claim). Separate from `notifyNewLessons`. |
| `DesktopShell` | `src/components/layout/desktop-shell.tsx`, `src/lib/desktop-shell.ts` | `sidebar`, `panel`, `children`; `shellPaneHeight(hasPlayerBar, 'sticky' \| 'min')`, `SHELL_*` constants | The lg+ pane layout (side menu, fluid centre, now-playing panel from xl). Never add `overflow-hidden`, `transform`, `filter` or `contain` to a pane wrapper (sticky). |
| `ReadingCover` / `readingCoverOf` | `src/components/lessons/reading-cover.tsx` | `lesson`, `className`, `textClassName` | A lesson's cover: the reading name on its `readingHue` gradient (hero, now-playing panel). |
| `ListLoadError` / `ReloadButton` | `src/components/shared/` | none | A failed catalog read, distinct from a truly empty list. |
| `ResumeBlockedButton` | `src/components/player/resume-blocked-button.tsx` | `className?` | "המשך ניגון" when the browser blocked autoplay (`playbackIssue === 'blocked'`). A sibling of `data-player-expand`, never inside it. |
| `useMediaQuery` | `src/hooks/use-media-query.ts` | `(query)` → boolean, false during SSR | Mounting device-width-only UI after hydration. |
| `useDeployedVersion` / `fetchDeployedVersion` / `buildsDiffer` | `src/hooks/use-deployed-version.ts`, `src/lib/app-update.ts`, `src/lib/app-version.ts` | bounded, no-store, silent on failure | Showing the live version next to the running one. |
| Bookmarks cross-tab sync | `src/stores/bookmarks-store.ts` | `startBookmarksCrossTabSync(target)`, `rehydrateBookmarksOnStorageEvent(key)` | Keeping open tabs in step after an edit. |
| `LessonRow` / `DateTile` | `src/components/lessons/lesson-row.tsx` | slots: tile, title, meta, parts, tags, progress, actions, footer | The row shell under `LessonCard` (and its `variant="short"`). Build a new row kind by filling slots, not by copying markup. |
| `CardGrid` | `src/components/shared/card-grid.tsx` | `variant`: rows / tiles / cards | Pane-width grids for every list (`LessonCardList` delegates to it). |
| `CollectionCard` / `CollectionHeader` | `src/components/shared/` | href, title, description, meta, cover · hue, cover, eyebrow, title, description, actions, back | Playlist and series tiles and their detail headers. |
| `PageHeader` / `SearchField` | `src/components/shared/` | title, icon, subtitle, actions · input props | The header band and search box of list pages. |
| `EmptyState` | `src/components/shared/empty-state.tsx` | icon, title, description, action, tone `neutral \| rose \| muted`, compact | Every empty or failed state (muted for failed reads). |
| `CoverTile` | `src/components/lessons/reading-cover.tsx` | text, hue | A gradient cover with a word on it (`ReadingCover` uses it). |
| `CategoryTiles` / `categoryDotClass` | `src/components/categories/category-tiles.tsx`, `src/lib/category-display.ts` | nodes, tree, counts, locale · icon → dot class | The categories index and category colour dots. |
| `SavedLessonRow` | `src/components/offline/saved-lesson-row.tsx` | offline lesson meta | Downloads rows (works offline, no network reads). |
| Lesson categories (many) | `src/lib/lesson-categories.ts`, `src/lib/supabase/category-scope.ts`, `src/lib/supabase/lesson-category-writes.ts`, `src/actions/lesson-categories.ts` | `normalizeCategorySelection`, `primaryCategoryId`, `toggleCategory`, `makePrimaryCategory`; `withCategoryScope(scopeIds, read)`; `setLessonCategories(lessonId, ids)`, `bulkChangeLessonCategories(ids, 'set' \| 'add' \| 'remove', categoryId)` | Assigning lessons to several categories and reading "lessons in this category branch". The first id is the primary (`lessons.category_id`). Falls back to the single `category_id` before migration 026. |
| `CategoryPicker` (multiple) | `src/components/categories/category-picker.tsx` | `<CategoryPicker multiple values onValuesChange categories />` or the single mode | Every category choice. Multi mode is a checkbox tree with primary/remove chips. |
| App settings | `src/lib/app-settings.ts`, `src/lib/supabase/app-settings.ts`, `src/actions/app-settings.ts`, `getCachedAppSettings` (`anon.ts`) | `APP_SETTING_KEYS`, `DEFAULT_APP_SETTINGS`, `appSettingsFromRows`, `TIP_INTERVAL_OPTIONS`; `readAppSettings(client)` → `{ settings, schemaReady }` (never throws); `updateTipInterval(seconds)` | Any admin-controlled display setting (`app_settings`, migration 028; defaults before it). Add a key + option rules here instead of a new table. Admin form: `/admin/settings`. |
