# Offline downloads

Lessons saved on the device (IndexedDB), the downloads page, and playing a saved lesson with no network.

## Sub-features

- `/he/offline` lists saved lessons with their duration
- The page says "לא מקוון – ניתן להאזין לשיעורים שנשמרו" when the device goes offline
- A saved lesson plays from device storage while offline
- An older multipart save still offers the end-of-part timer
- Saving offline also allows a separate download of the audio file

## How to get to it (user POV)

Full player, "שמירה אופליין"; then the bottom navigation "הורדות".

## Driving it with Playwright

Preconditions: none for the first two tests (they seed IndexedDB themselves). The device-file test needs catalog data.

- Run `PLAYWRIGHT_BASE_URL=$BASE npx playwright test tests/e2e/offline-download.spec.ts --project=chromium --reporter=line --trace=on --output="$EVIDENCE/playwright"`.
- The device-file test answers `**/api/audio/**` with a few bytes, so nothing is pulled from R2.

## Gotchas

- The service worker ignores localhost and 127.0.0.1 (`public/sw.js:195`). Reloading a page while offline can only be proven on a deployed URL.
