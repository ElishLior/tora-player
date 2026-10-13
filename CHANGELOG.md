# Changelog

Versions follow `MAJOR.MINOR.PATCH`. The version in `package.json` is the release being worked on; a version is released when it is deployed to production from `main` (tag `vX.Y.Z` on that commit). Add each change under the in-progress version as it lands in `dev`.

## 1.2.0 — in progress

Migrations 023, 024 and 025 applied in production on October 13, 2026, before the deploy (checked read-only; a stale `move_category` call returns `CAT01` through PostgREST).


- Continuous category playback: "ניגון רציף של הקטגוריה" on a category page plays the category and all its subcategories in one session. Order: date, then upload time. The queue is frozen when it starts, so new uploads don't reshuffle it. Multipart lessons finish before the next lesson, more lessons load ahead in segments of 25, and unavailable lessons are skipped with a notice (at most 3 in a row). It ends with a "category finished" notice, with no repeat or shuffle. A restored session never autoplays. A source error skips a lesson only after one retry. While the next lesson loads, the player shows loading and Play keeps waiting (only Pause cancels). Skipped, stopped and finished notices show on the mini player and the desktop bar. The saved queue keeps 50 tracks behind the current one.
- Image download: the lesson image viewer has a "הורדת התמונה" button that saves the full-size original, named after the lesson and the image number. On iPhone home-screen apps it opens the image, and Share → Save Image saves it.
- Bookmarks can be edited (note and tag) on /bookmarks, /me and the lesson page, keeping the same bookmark. A bookmark changed on another device is not overwritten (needs migration 024).
- Categories have up to three levels. The admin tree shows all of them, with move up/down and "Move to…" (keyboard-accessible). Moves check the whole branch and refuse an edit made in the meantime (needs migration 023). English category names are optional: without one, English pages show the Hebrew name. Category pages, counts and the lesson filter include every sub-level.
- Desktop player:
  - A proper bottom bar from 1024px: transport, timeline with times, speed, volume (from 1280px), bookmark, share, cast, up next.
  - The home side panel (from 1360px) is a full player. With nothing loaded it shows the last-played lesson with a "continue" button, and it never autoplays.
  - The duplicate "המשך האזנה" strip is hidden where the panel shows.
- Wide desktop (owner feedback, October 13):
  - The app is a three-pane layout: the side menu, a fluid centre and the now-playing panel. The panel is on every page from 1280px.
  - The latest lesson is the first box on home, with its reading cover and part count. The panel shows the latest lesson when nothing has been played yet.
  - Lesson lists spread to 2–4 columns with the screen width. Shorts and categories sit side by side.
  - Hovering a lesson lifts the row, highlights the title, turns the play button green and shows an arrow.
  - The lesson page has two columns: the player and parts, beside a column with the description, category and images.
  - Failed catalog reads show an error with a retry button instead of an empty list.
  - "קטגוריות" is in the menu.
  - On phones, the mini player sits above the tab bar, and the latest lesson shows its cover, part count and series.
- A lesson can belong to several categories at any level (owner, October 13):
  - The admin ticks them in a checkbox tree. The first one is the lesson's primary category, and another can be made primary.
  - Category pages, category playback and the category filter include a lesson when any of its categories matches. Counts count each lesson once per branch.
  - The lesson page links all its categories.
  - The bulk bar can set, add or remove a category on many lessons at once.
  - Shorts, feeds and notifications use the primary category.
  - Migrations 026 and 027 were applied on October 13. Applying 026 briefly broke the live 1.1.4 site; the cause was a foreign key that made the lessons→categories embeds ambiguous. 027 removed the key and replaced it with a delete trigger.
- Every page in the 1.2 design (owner, October 13):
  - Shorts are rows with a rose tile, in the same grid as lessons, on the shorts page and on home.
  - Playlists and series get cover tiles and a header band.
  - Bookmarks are grouped by lesson, and downloads use the same rows as lessons.
  - /me shows its sections in two columns on desktop.
  - Categories are tiles with colored dots and counts.
  - Tags and search use the new design, with clear empty and no-results states.
  - Every page uses one empty-state design.
- The home intro ("כל מה שאפשר לעשות כאן") is one closed row on every visit and opens only when tapped (owner, October 13).
- Fixes from the requirements audit:
  - Pause cancels a pending retry. A blocked autoplay offers "המשך ניגון" in the mini player and the desktop bar.
  - The desktop bar links the series and the date.
  - Bookmarks stay in sync across open tabs.
  - Renaming a category refuses to overwrite another admin's newer edit.
  - English category names are loaded everywhere.
  - /me and the admin dashboard show the running and the live version.
  - The lesson page shows its category as a link.
  - The image viewer's download button resets per image, and the viewer's labels are translated.
- One lesson row everywhere: categories, /lessons, tags, search, series and playlists all use the home page's row (date tile, part chips, tags, progress, play button). List play buttons play in place.
- Version 1.2.0:
  - The version is shown on /me and on the admin dashboard, and `/api/health` reports the real version.
  - `/api/version` reports the deployed build. When a newer build is live, a banner offers "רענון". Refresh waits until playback is paused, and "אחר כך" snoozes that build.
  - Admins can draft, preview and explicitly send a release announcement through Web Push (/admin/announcements, needs migration 025). Nothing is ever sent automatically.

## 1.1.4 — October 12, 2026

Production release of `main` at `5350349` (PRs #52, #53), deployment `dpl_7kYaUUVwfVsyPwU3dvfiYia1jaRy`. Migration 022 applied in production the same day (437 existing parts marked as announced).


- Lesson previews (cards, latest-lesson hero, shorts list) show each part with its own length, `חלק 1: 82 דק׳ · חלק 2: 70 דק׳` ("Part 1: 82 min · Part 2: 70 min"), on one line. A line that does not fit scrolls sideways: swipe or tap on touch screens, hover or keyboard focus with a mouse; reduced motion jumps instead of animating.
- Desktop layout (1024px and up): a persistent side menu at the inline start (right in Hebrew, left in English), centered width-limited content, a search field in the header, two-column lesson lists from 1280px. Phones and tablets keep the bottom bar.
- New-lesson notifications: one consolidated notification per upload batch by default (lessons and their part lengths), no push + email duplicate for the same person (the cause of the doubled notification), retries and repeats never re-send, and the upload page waits until failed lessons are retried (or "send now"). Parts added later to an announced lesson get one "נוסף חלק חדש" notification once migration 022 is applied. Pushes are sent with high urgency.
- Notification opt-in: visitors who haven't turned notifications on get a short approval card ("don't show this again" checkbox, 3-day snooze on "not now"); iPhone/iPad Safari tabs get the Add to Home Screen steps.
- Categories: every category and subcategory can be picked when assigning lessons (edit page, bulk bar, upload, snippets, and a new admin picker on the lesson page); a category can be created with only a Hebrew name; two levels are enforced; the daily and shorts categories can't be deleted; clearer admin errors, reorder rollback and delete warnings.
- Clickable everywhere: the whole latest-lesson hero and every shorts row open the lesson (play and download stay separate), the hero shows its tags, series names link to the series page (hero, full player, lesson page, /me), the full player's title opens the lesson page, and the offline library's titles link to their lessons. On the home page "שיעורים אחרונים" now comes before "קצרים".
- Share: the lesson page's share button moved from the top bar into the player's action row ("שיתוף", next to Bookmark). Share buttons draw the device's own share icon: Apple's square-with-arrow on iPhone, iPad and Mac, the three-dots icon on Android and elsewhere.
- New home page (owner-chosen concept B, "השיעור של היום"):
  - A feature intro, "כל מה שאפשר לעשות כאן". Each item uses the app's own icon, and the notifications item has a button that turns them on. The intro is open on the first visit and folds to one line on later visits; the lesson-page tip ("tap a lesson's title to open its page") always stays visible.
  - A slim continue-listening strip.
  - Today's lesson, with a play chip for each part.
  - "שיעורים אחרונים" grouped by week ("השבוע · פרשת נח"), with Hebrew date tiles and colored part chips.
  - Shorts and categories as quiet lists.
  - From 1360px wide, a "now playing / up next" panel beside the feed while a lesson is loaded.
- Versioning: `package.json` version, this changelog and `vX.Y.Z` release tags.

## 1.1.3 — October 8, 2026

Production release of `main` at `1ea6f93` (PRs #43–#49), deployment `dpl_CmQn4GGAUA6MwsiT9wKV8unT6RDr`.

- Lock-screen skips jump the number the OS shows on its icon.
- Clickable tags and dates on every lesson preview.
- Share from the full and mini players.
- Lesson pages at `/lessons/<topic>-<DD-MM-YYYY>`; old UUID links and old slugs redirect (migrations 020/021).
