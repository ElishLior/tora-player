# Catalog and navigation

The home page, the lessons catalog, the main pages a guest can open, and the Hebrew (right to left) and English (left to right) routes.

## Sub-features

- Home `/he` with the app name linking home
- Lessons catalog `/he/lessons` through the bottom navigation
- Series, playlists, bookmarks and search pages
- `/he/lessons/upload` sends guests to the admin sign-in
- `/en` renders left to right; a 375 px viewport still fits

## How to get to it (user POV)

Open the site. The bottom navigation ("ניווט ראשי") has "שיעורים"; the search icon is in the header.

## Driving it with Playwright

Preconditions: Launch with the anon key, or a deployed URL.

- Run `PLAYWRIGHT_BASE_URL=$BASE npx playwright test tests/e2e/smoke.spec.ts --project=chromium --reporter=line --trace=on --output="$EVIDENCE/catalog"`. Each test prints one line; with catalog data all 12 pass.
- The search test only loads the page. To prove results, open `$BASE/he/search?q=<a word from a lesson title>` with the browser tool and screenshot the list.

## Gotchas

- In a UI-only run "render restored lessons" fails because the catalog is empty. Report it as skipped for missing data, not as a regression.
- Dev mode compiles each route on first request; the first test can take 20 seconds.
