# Changelog

Versions follow `MAJOR.MINOR.PATCH`. The version in `package.json` is the release being worked on; a version is released when it is deployed to production from `main` (tag `vX.Y.Z` on that commit). Add each change under the in-progress version as it lands in `dev`.

## 1.1.4 — in progress

- Lesson previews (cards, latest-lesson hero, shorts list) show each part with its own length, `חלק 1: 82 דק׳ · חלק 2: 70 דק׳` ("Part 1: 82 min · Part 2: 70 min"), on one line. A line that does not fit scrolls sideways: swipe or tap on touch screens, hover or keyboard focus with a mouse; reduced motion jumps instead of animating.
- Desktop layout (1024px and up): a persistent side menu at the inline start (right in Hebrew, left in English), centered width-limited content, a search field in the header, two-column lesson lists from 1280px. Phones and tablets keep the bottom bar.
- New-lesson notifications: one consolidated notification per upload batch by default (lessons and their part lengths), no push + email duplicate for the same person (the cause of the doubled notification), retries and repeats never re-send, and the upload page waits until failed lessons are retried (or "send now"). Parts added later to an announced lesson get one "נוסף חלק חדש" notification once migration 022 is applied. Pushes are sent with high urgency.
- Notification opt-in: visitors who haven't turned notifications on get a short approval card ("don't show this again" checkbox, 3-day snooze on "not now"); iPhone/iPad Safari tabs get the Add to Home Screen steps.
- Categories: every category and subcategory can be picked when assigning lessons (edit page, bulk bar, upload, snippets, and a new admin picker on the lesson page); a category can be created with only a Hebrew name; two levels are enforced; the daily and shorts categories can't be deleted; clearer admin errors, reorder rollback and delete warnings.
- Versioning: `package.json` version, this changelog and `vX.Y.Z` release tags.

## 1.1.3 — October 8, 2026

Production release of `main` at `1ea6f93` (PRs #43–#49), deployment `dpl_CmQn4GGAUA6MwsiT9wKV8unT6RDr`.

- Lock-screen skips jump the number the OS shows on its icon.
- Clickable tags and dates on every lesson preview.
- Share from the full and mini players.
- Lesson pages at `/lessons/<topic>-<DD-MM-YYYY>`; old UUID links and old slugs redirect (migrations 020/021).
