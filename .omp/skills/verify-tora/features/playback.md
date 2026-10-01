# Playback

Playing a lesson from the catalog and controlling it from the header, the mini player and the full player.

## Sub-features

- A lesson row's play button starts playback and opens the lesson page
- The header shows "השהה" while playing and "מתנגן כעת" opens the full player
- The full player offers bookmark, save offline and driving mode ("מצב נהיגה")
- Controls stay usable on a compact mobile screen

## How to get to it (user POV)

"שיעורים", then the play button on a lesson row. The header button opens the full player.

## Driving it with Playwright

Preconditions: Launch with the anon key, or a deployed URL.

- Run `PLAYWRIGHT_BASE_URL=$BASE npx playwright test tests/e2e/player-behavior.spec.ts --project=chromium --reporter=line --trace=on --output="$EVIDENCE/playwright"`. Four tests pass.
- The spec replaces `play()` and `pause()` (`installMediaHarness`), so no audio is fetched and no listen is recorded.
- Driving mode has no spec. With the browser tool: full player, "מצב נהיגה", then the dialog "מצב נהיגה" shows large controls; "השהה" turns into "נגן".

## Gotchas

- A click before React hydrates the page is lost. Wait for the element to respond (the spec's `expect(...).toBeVisible()` after the click) instead of adding sleeps.
- In right-to-left layout the skip-forward button sits on the left; that is intended.
