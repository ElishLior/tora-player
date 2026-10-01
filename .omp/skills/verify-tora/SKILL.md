---
name: verify-tora
description: Prove a Tora Player change in a real browser. Starts the Next.js app locally (or uses a deployed URL), checks /api/health, runs the repo's Playwright specs as a guest, and keeps traces as evidence. Use before calling any app change done.
---

# Verify Tora Player

Start the app, check it, drive the changed feature as a guest listener, keep the evidence, stop what you started. Real lesson data comes from production, so every run is read-only: guest only, no service-role key, and never the flows under "Do not drive".

## Launch

Every run starts with its own evidence folder:

```bash
EVIDENCE=~/.local/state/verify-tora/$(date -u +%Y%m%dT%H%M%SZ); mkdir -p "$EVIDENCE"
```

Local, to test this checkout (Node 22, `npm ci` done, port 3006 free):

```bash
# Next loads .env* files by itself, and they can hold the service-role key that turns guest reads
# into production writes. Same rule as .factory/checks.sh: this must print nothing. If it prints a
# file, stop and use a clean `git worktree add` instead (the main checkout has them).
ls -a | grep -E '^\.env' | grep -vx '.env.example'
BASE=http://127.0.0.1:3006
export NEXT_PUBLIC_SUPABASE_URL=https://ncmfptetebjjtbeqfeiw.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(supabase projects api-keys --project-ref ncmfptetebjjtbeqfeiw -o json 2>/dev/null | jq -r '.[] | select(.name=="anon") | .api_key')"
env -u SUPABASE_SERVICE_ROLE_KEY npm run dev -- --hostname 127.0.0.1 --port 3006 > "$EVIDENCE/server.log" 2>&1 &
echo $! > "$EVIDENCE/server.pid"
```

Ready when `curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/health` prints 200 or 503 (about 15 s). Skip the two exports for a UI-only run: the lessons page then shows the load error "לא ניתן לטעון שיעורים כרגע", but offline downloads, bookmarks and the admin redirect still work.

Deployed: `BASE=https://tora-player.vercel.app`. Nothing to launch or clean up; the same guest-only rules apply.

## Doctor

```bash
curl -s $BASE/api/health; echo
lsof -nP -iTCP:3006 -sTCP:LISTEN
git rev-parse HEAD; git status --short
```

- Local with the anon key: `"supabase":"connected"` and `"published"` above 0. HTTP 503 is expected because R2 is never configured locally; the specs stub audio.
- Local UI-only: `"supabase":"unconfigured"`.
- Deployed: HTTP 200 and `"status":"ok"`.
- The port listener is the server you started, and `git status --short` is empty when the proof should count.

## Drive

The repo's Playwright specs are the harness. Run the spec for the feature you changed (see `features/README.md`):

```bash
PLAYWRIGHT_BASE_URL=$BASE npx playwright test tests/e2e/player-behavior.spec.ts \
  --project=chromium --reporter=line --trace=on --output="$EVIDENCE/playback" 2>&1 | tee "$EVIDENCE/playback.txt"
```

Give every run its own `--output` folder: Playwright empties that folder when a run starts. Dev mode compiles each route on its first visit, so a first run can fail on a 5-second wait; rerun once on the warm server, and treat a second failure as real.

For behavior no spec covers, drive the page with the browser tool (OMP `browser`, or `skill://agent-browser`) using the Hebrew labels in `messages/he.json`, and save a screenshot of each step into `$EVIDENCE`.

Drive only in a fresh, signed-out browser. The specs get a new context per test. With the browser tool, open a new managed tab and clear its cookies and site storage before the first page; never use the relay to your real Chrome. A signed-in session syncs bookmarks, progress and notes to production on page load (`src/components/auth/account-button.tsx:29`), and a stored push subscription is posted again after 24 hours (`src/components/notifications/use-push-notifications.ts:73-89`).

Do not drive, on any URL with real data:

- sign-in, `/he/admin/**`, upload, or lesson editing;
- "סימון קטע" then "שלח לאדמין" (inserts a snippet with the service role on deployed URLs);
- the notifications bell (stores a push subscription);
- real audio for 30 seconds or more (records a listen). The specs stub `play()` and the audio requests for this reason.

## Evidence

Everything stays in `$EVIDENCE`, outside the repo:

- `server.log` from the dev server;
- `<run>.txt` (for example `playback.txt`), one pass or fail line per test;
- `<run>/<test>/trace.zip`, a screenshot and DOM snapshot of every action (`npx playwright show-trace <zip>`);
- browser-tool screenshots for anything driven by hand.

Write `git rev-parse HEAD` and `git status --short` into `$EVIDENCE/commit.txt`. A proof counts only for a clean tree at that commit.

## Cleanup

Local runs only; a deployed run started nothing.

```bash
kill "$(cat "$EVIDENCE/server.pid")"
sleep 2; lsof -nP -iTCP:3006 -sTCP:LISTEN   # must print nothing
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
```

If the port is still busy, report it and stop; never kill a process you cannot tie to `server.pid`. Cleanup never deletes `$EVIDENCE`. Keep this skill current with `/maintain-verification-skill`.
