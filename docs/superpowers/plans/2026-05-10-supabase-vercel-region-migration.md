# Supabase and Vercel Region Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the app’s database and server execution closer to the primary user base, replacing the current Sydney Supabase primary with a closer region and aligning Vercel Function execution with that data source.

**Architecture:** Treat this as a controlled infrastructure migration, not a code refactor. Baseline current latency, create or restore into a new Supabase project in the chosen region, validate schema/data/auth/RLS against the new project, deploy a preview wired to the new env vars, then cut production over by updating Vercel env vars and deploying from `main`.

**Tech Stack:** Supabase CLI, Supabase Dashboard, PostgreSQL `psql`, Vercel CLI, Next.js 15, Vercel Functions regions, Playwright, `/api/health` canary.

---

## Review Verdict

Four reviewer passes were run before execution: infra/security, QA/release gate, mobile audio architecture spillover, and product/UX. The original plan had two production blockers: production cutover happened before PR/merge, and the final restore was not repeatable. This revised plan treats cutover as an approved production operation after PR merge, not as part of the development PR.

Mandatory rules:

- No production deploy happens from this plan without explicit user approval in the thread after preview canary passes.
- Production cutover must run only after the reviewed `vercel.json` and runbook are merged through `dev` and released to `main`.
- All writes are frozen during final backup, final restore, env update, deploy, and canary. That includes admin writes, uploads, listener progress, bookmarks, snippets, and any `/api/progress` writes.
- Final restore must be repeatable. Do not restore final data on top of a dirty preview target. Use a fresh target project for final cutover or run a tested target reset/wipe before final restore.
- Do not put database dumps in the repo. Use a temporary directory outside the worktree and keep secrets/dumps out of git.
- Do not add `SUPABASE_SERVICE_ROLE_KEY` to Vercel unless runtime code is changed to require it. The current app uses the anon key path.

## Execution Phases

1. **Development PR:** baseline script, runbook, validation queries, and optional `vercel.json` region config. Target branch: `dev`.
2. **Preview migration drill:** branch-scoped preview env vars, initial target restore, preview deployment, canaries, policy/grant/function diffs, audio range checks.
3. **Merge and release prep:** merge PR to `dev`, validate, then release/merge to `main` through the normal workflow.
4. **Approved production operation:** after explicit user approval, freeze writes, perform final safe restore, update production env vars, deploy production, canary, and monitor.

## Verified Platform Constraints

- Current linked Supabase project from `npx supabase projects list --output json`:
  - project ref: `yudibxtwlhoydrioqpjr`
  - status: `ACTIVE_HEALTHY`
  - region: `ap-southeast-2` / Sydney
  - Postgres: `17.6.1.063`
- There is an inactive Supabase project named `Capsule` in `eu-central-1`, but inactive projects should not be assumed safe as a migration target until inspected in the dashboard.
- Supabase docs state that a project is region-bound at the infrastructure level; changing region means creating a new project in the desired region and migrating data.
- Supabase available specific regions include `eu-central-1` Frankfurt, `us-east-1` North Virginia, and current `ap-southeast-2` Sydney.
- Supabase read replicas can reduce read latency, but they are read-only and do not move Auth/Storage/Realtime primary behavior. They are not a full replacement for primary-region migration.
- Vercel docs state Node.js Functions default to `iad1`, can be configured in `vercel.json` with `"regions"`, and should run close to the data source.

Official docs used:

- [Supabase: Change Project Region](https://supabase.com/docs/guides/troubleshooting/change-project-region-eWJo5Z)
- [Supabase: Migrating within Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase)
- [Supabase: Backup and Restore using CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
- [Supabase: Available regions](https://supabase.com/docs/guides/platform/regions)
- [Supabase: Read Replicas](https://supabase.com/docs/guides/platform/read-replicas)
- [Vercel: Function regions](https://vercel.com/docs/functions/configuring-functions/region)

## Target Region Decision

Assumption for this plan: the primary user base is Israel / nearby Europe and the desired closest Supabase region is `eu-central-1` Frankfurt. If the real primary user base is the United States, replace the target Supabase region with `us-east-1` and the Vercel region with `iad1`.

For Israel-focused production:

- Supabase primary target: `eu-central-1`
- Vercel Function target: `fra1`
- Keep Cloudflare R2 audio delivery unchanged for this phase unless latency tests show audio startup is dominated by R2.

## File Structure

- Create `scripts/latency-baseline.mjs`
  - Measures production health, lesson list HTML, and API response timings before and after migration.
- Create `docs/infra/region-migration-runbook.md`
  - Human runbook for backup, restore, env updates, cutover, rollback, and canary.
- Modify `vercel.json`
  - Add `"regions": ["fra1"]` after the new Supabase project is validated.
- No schema migrations are planned for this work.

## Acceptance Criteria

- A new Supabase project exists in the approved target region.
- New project has the same required schema, RLS policies, functions, publications, and data needed by Tora Player.
- Policy, grant, function, trigger, extension, and publication diffs between source and target have no unexpected differences.
- `/api/health` against a preview deployment wired to the new Supabase project returns HTTP `200`.
- `/he/lessons` against preview shows lesson cards and no empty/error state.
- Offline/download Playwright tests pass against preview.
- A real audio stream range request returns `206`, `Accept-Ranges`, `Content-Range`, and non-empty bytes against preview and production.
- Preview and production `x-vercel-id` headers prove Node routes are executing in the intended region.
- Production Vercel env vars point to the new Supabase URL/keys only after preview canary passes.
- Production `/api/health` returns HTTP `200` after cutover.
- Old production env values are captured outside the repo before mutation, and rollback is timed/drilled before production cutover.
- Rollback is documented and can restore old Supabase env vars without code changes.
- Israel-focused measurements improve or remain acceptable: `/api/health` and `/he/lessons` p50/p95 do not regress by more than 50%, lesson cards render, no empty lesson list appears, and admin upload/edit smoke remains healthy.

---

### Task 1: Add Latency Baseline Script

**Files:**
- Create: `scripts/latency-baseline.mjs`

- [ ] **Step 1: Create the script**

Create `scripts/latency-baseline.mjs`:

```js
#!/usr/bin/env node

const targets = [
  '/api/health',
  '/he',
  '/he/lessons',
  '/he/offline',
];

const baseUrl = process.env.BASELINE_URL || 'https://tora-player.vercel.app';
const runs = Number(process.env.BASELINE_RUNS || 5);
const audioFileKey = process.env.BASELINE_AUDIO_FILE_KEY || '';

async function timeFetch(url, init = {}) {
  const start = performance.now();
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = await response.arrayBuffer();
  const durationMs = Math.round(performance.now() - start);
  return {
    status: response.status,
    durationMs,
    bytes: body.byteLength,
    ok: response.ok || response.status === 206,
    vercelId: response.headers.get('x-vercel-id'),
    acceptRanges: response.headers.get('accept-ranges'),
    contentRange: response.headers.get('content-range'),
  };
}

const checks = audioFileKey
  ? [...targets, `/api/audio/stream/${encodeURIComponent(audioFileKey)}`]
  : targets;

for (const path of checks) {
  const samples = [];
  const url = new URL(path, baseUrl).toString();
  for (let i = 0; i < runs; i += 1) {
    samples.push(await timeFetch(
      url,
      path.startsWith('/api/audio/stream/')
        ? { headers: { Range: 'bytes=0-1023' } }
        : {},
    ));
  }

  const durations = samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p95 = durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
  const statuses = [...new Set(samples.map((sample) => sample.status))].join(',');
  const ok = samples.every((sample) => sample.ok);

  console.log(JSON.stringify({
    baseUrl,
    path,
    runs,
    statuses,
    ok,
    p50,
    p95,
    min: durations[0],
    max: durations.at(-1),
    bytes: samples[0]?.bytes ?? 0,
    vercelId: samples[0]?.vercelId ?? null,
    acceptRanges: samples[0]?.acceptRanges ?? null,
    contentRange: samples[0]?.contentRange ?? null,
  }));
}
```

- [ ] **Step 2: Run baseline against current production**

Run:

```bash
node scripts/latency-baseline.mjs
```

Expected: four JSON lines without `BASELINE_AUDIO_FILE_KEY`, or five JSON lines when an audio file key is provided. All lines have `"ok":true`; the audio line should have status `206`, non-empty bytes, and `contentRange`.

- [ ] **Step 3: Save baseline output**

Create `docs/infra/region-baseline-before.jsonl` with the command output:

```bash
BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs > docs/infra/region-baseline-before.jsonl
```

- [ ] **Step 4: Commit**

```bash
git add scripts/latency-baseline.mjs docs/infra/region-baseline-before.jsonl
git commit -m "chore: add production latency baseline script"
```

---

### Task 2: Write the Migration Runbook

**Files:**
- Create: `docs/infra/region-migration-runbook.md`

- [ ] **Step 1: Create runbook**

Create `docs/infra/region-migration-runbook.md`:

```md
# Supabase + Vercel Region Migration Runbook

## Current Production

- Supabase source project ref: `yudibxtwlhoydrioqpjr`
- Supabase source region: `ap-southeast-2`
- Production URL: `https://tora-player.vercel.app`
- Vercel project: `tora-player`

## Target

- Supabase target region: `eu-central-1`
- Vercel Function region after migration: `fra1`

## Freeze Window

During final cutover, freeze every write path until production canary passes:

- Admin uploads and lesson edits
- Category, snippet, image, and audio metadata edits
- Listener progress writes through `/api/progress`
- Bookmarks and any future user-generated state

If listener progress must remain live, do not proceed with this runbook until a final delta reconciliation script exists and has been tested. The default policy is full write freeze.

## Required Secrets

Set these locally in the shell that runs the migration. Do not commit them.

```bash
export OLD_PROJECT_REF=yudibxtwlhoydrioqpjr
export MIGRATION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tora-region.XXXXXX")"
read -rsp "Old Supabase database URL: " OLD_DB_URL; echo
read -rp "New Supabase project ref: " NEW_PROJECT_REF
read -rsp "New Supabase database URL: " NEW_DB_URL; echo
export NEW_SUPABASE_URL="https://${NEW_PROJECT_REF}.supabase.co"
read -rsp "New Supabase anon key: " NEW_SUPABASE_ANON_KEY; echo
read -rp "Known lesson_audio file_key for range canary: " KNOWN_AUDIO_FILE_KEY
```

Before any Vercel env mutation, capture old production values outside the repo in the password manager or a sealed local rollback file. Do not commit rollback files.

## Backup Source Database

```bash
test -n "$MIGRATION_DIR"
cd "$MIGRATION_DIR"
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$OLD_DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$OLD_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
cd -
```

## Restore Target Database

Do this only into a clean target database. For preview, use the newly created target project. For final production cutover, either create a fresh final target project or run a tested target reset/wipe first. Never restore final data over dirty preview data.

```bash
test -n "$MIGRATION_DIR"
cd "$MIGRATION_DIR"
psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "$NEW_DB_URL"

psql \
  --single-transaction \
  --variable ON_ERROR_STOP=1 \
  --file history_schema.sql \
  --file history_data.sql \
  --dbname "$NEW_DB_URL"
cd -
```

## Validate Target Database

```bash
psql "$NEW_DB_URL" -c "select count(*) as lessons from public.lessons;"
psql "$NEW_DB_URL" -c "select count(*) as published_lessons from public.lessons where is_published = true;"
psql "$NEW_DB_URL" -c "select count(*) as lesson_audio from public.lesson_audio;"
psql "$NEW_DB_URL" -c "select count(*) as lesson_images from public.lesson_images;"
psql "$NEW_DB_URL" -c "select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;"

psql "$OLD_DB_URL" -Atc "select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname in ('public','storage','auth') order by 1,2,3,4" > "$MIGRATION_DIR/old-policies.tsv"
psql "$NEW_DB_URL" -Atc "select schemaname,tablename,policyname,cmd,roles,qual,with_check from pg_policies where schemaname in ('public','storage','auth') order by 1,2,3,4" > "$MIGRATION_DIR/new-policies.tsv"
diff -u "$MIGRATION_DIR/old-policies.tsv" "$MIGRATION_DIR/new-policies.tsv"

psql "$OLD_DB_URL" -Atc "select n.nspname, p.proname, pg_get_function_arguments(p.oid), pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public') order by 1,2,3" > "$MIGRATION_DIR/old-functions.tsv"
psql "$NEW_DB_URL" -Atc "select n.nspname, p.proname, pg_get_function_arguments(p.oid), pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public') order by 1,2,3" > "$MIGRATION_DIR/new-functions.tsv"
diff -u "$MIGRATION_DIR/old-functions.tsv" "$MIGRATION_DIR/new-functions.tsv"

psql "$OLD_DB_URL" -Atc "select event_object_schema,event_object_table,trigger_name,action_timing,event_manipulation,action_statement from information_schema.triggers where event_object_schema='public' order by 1,2,3,4,5" > "$MIGRATION_DIR/old-triggers.tsv"
psql "$NEW_DB_URL" -Atc "select event_object_schema,event_object_table,trigger_name,action_timing,event_manipulation,action_statement from information_schema.triggers where event_object_schema='public' order by 1,2,3,4,5" > "$MIGRATION_DIR/new-triggers.tsv"
diff -u "$MIGRATION_DIR/old-triggers.tsv" "$MIGRATION_DIR/new-triggers.tsv"

psql "$OLD_DB_URL" -Atc "select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where table_schema in ('public','storage','auth') order by 1,2,3,4" > "$MIGRATION_DIR/old-grants.tsv"
psql "$NEW_DB_URL" -Atc "select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants where table_schema in ('public','storage','auth') order by 1,2,3,4" > "$MIGRATION_DIR/new-grants.tsv"
diff -u "$MIGRATION_DIR/old-grants.tsv" "$MIGRATION_DIR/new-grants.tsv"

psql "$OLD_DB_URL" -Atc "select * from pg_publication order by pubname" > "$MIGRATION_DIR/old-publications.tsv"
psql "$NEW_DB_URL" -Atc "select * from pg_publication order by pubname" > "$MIGRATION_DIR/new-publications.tsv"
diff -u "$MIGRATION_DIR/old-publications.tsv" "$MIGRATION_DIR/new-publications.tsv"
```

Expected:
- `lessons` and `published_lessons` match current production health count.
- `lesson_audio` is non-zero.
- Public tables that use RLS remain RLS-enabled.
- Policy, grant, function, trigger, and publication diffs are empty or explicitly explained before cutover.

## Preview Cutover

Add preview env vars in Vercel for the new project:

```bash
BRANCH=codex/supabase-vercel-region-migration
npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview "$BRANCH" --value "$NEW_SUPABASE_URL" --force --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview "$BRANCH" --value "$NEW_SUPABASE_ANON_KEY" --force --yes
```

Deploy preview:

```bash
npx vercel --yes
```

Run canary against the preview URL:

```bash
npx vercel --yes | tee "$MIGRATION_DIR/preview-deploy.log"
export PREVIEW_URL="$(awk '/https:\/\/.*vercel.app/ {print $NF}' "$MIGRATION_DIR/preview-deploy.log" | tail -1)"
test -n "$PREVIEW_URL"
BASELINE_URL="$PREVIEW_URL" node scripts/latency-baseline.mjs
BASELINE_URL="$PREVIEW_URL" BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs
curl -s -i "$PREVIEW_URL/api/health"
curl -i -H 'Range: bytes=0-1023' "$PREVIEW_URL/api/audio/stream/$KNOWN_AUDIO_FILE_KEY"
PLAYWRIGHT_BASE_URL="$PREVIEW_URL" npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts --reporter=list
```

Expected audio range result: HTTP `206`, `Accept-Ranges`, `Content-Range`, correct `Content-Type`, non-empty body, and `x-vercel-id` showing the intended region for Node routes.

## Production Cutover

This section is not executed by the development PR. Run it only after the PR is merged through `dev`, released to `main`, preview canary passes, rollback values are captured, and the user explicitly approves production cutover in the thread.

Update production env vars in Vercel:

```bash
npx vercel env update NEXT_PUBLIC_SUPABASE_URL production --value "$NEW_SUPABASE_URL" --yes
npx vercel env update NEXT_PUBLIC_SUPABASE_ANON_KEY production --value "$NEW_SUPABASE_ANON_KEY" --yes
```

Deploy production from `main`:

```bash
git checkout main
git pull --ff-only origin main
git merge-base --is-ancestor origin/dev HEAD
npm run build
npx vercel --prod --yes
```

Run production canary:

```bash
curl -s -i https://tora-player.vercel.app/api/health
BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs > docs/infra/region-baseline-after.jsonl
curl -i -H 'Range: bytes=0-1023' "https://tora-player.vercel.app/api/audio/stream/$KNOWN_AUDIO_FILE_KEY"
PLAYWRIGHT_BASE_URL=https://tora-player.vercel.app npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts --reporter=list
```

## Rollback

If production health fails after cutover:

1. Restore Vercel production env vars to the old Supabase URL and anon key values captured before mutation.
2. Run `npx vercel --prod --yes`.
3. Run `curl -s -i https://tora-player.vercel.app/api/health`.
4. Run one audio range canary.
5. Keep the new Supabase project untouched for forensic comparison.

## Storage and Auth Notes

- Tora Player audio/images are stored in Cloudflare R2, not Supabase Storage, so R2 objects are not part of this migration.
- Admin auth is cookie-based app auth, not Supabase user auth.
- Disable unused Supabase Auth providers/signups in the target dashboard unless they are intentionally enabled later.
- Confirm target dashboard site URL and redirect URLs do not accidentally allow unexpected auth flows.
- If Supabase Auth providers are later enabled, copy provider secrets manually in the target project dashboard before cutover.
```

- [ ] **Step 2: Commit**

```bash
git add docs/infra/region-migration-runbook.md
git commit -m "docs: add region migration runbook"
```

---

### Task 3: Create and Validate Target Supabase Project

**Files:**
- No code files.

- [ ] **Step 1: Create target project in Supabase Dashboard**

Dashboard actions:

1. Open Supabase Dashboard.
2. Create new project in the same organization.
3. Name: `tora-player-eu`.
4. Region: `Central EU (Frankfurt)` or exact `eu-central-1`.
5. Save database password in the password manager.
6. Wait until project status is healthy.

- [ ] **Step 2: Verify project appears in CLI**

Run:

```bash
npx supabase projects list --output json
```

Expected: output contains a healthy project in `eu-central-1`.

- [ ] **Step 3: Record target ref in runbook**

Edit `docs/infra/region-migration-runbook.md` and add the actual target project ref under the Target section. Keep passwords and API keys out of the file.

- [ ] **Step 4: Run initial target restore and validation**

Run the runbook sections:

```bash
# Required variables must already be set:
# OLD_DB_URL, NEW_DB_URL, NEW_PROJECT_REF, NEW_SUPABASE_URL, NEW_SUPABASE_ANON_KEY, KNOWN_AUDIO_FILE_KEY, MIGRATION_DIR

# 1. Backup Source Database
# 2. Restore Target Database into a clean target
# 3. Validate Target Database, including policies/grants/functions/triggers/publications
```

Expected:
- Restore succeeds without object-exists or duplicate-key errors.
- Lesson counts match source.
- Public policy/grant/function/trigger/publication diffs are empty or documented.
- Target dashboard auth/storage settings are checked.

- [ ] **Step 5: Commit**

```bash
git add docs/infra/region-migration-runbook.md
git commit -m "docs: record target Supabase project ref"
```

---

### Task 4: Add Vercel Frankfurt Function Region

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add region setting**

Modify `vercel.json` near the top:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "regions": ["fra1"],
  "headers": [
```

- [ ] **Step 2: Validate JSON and build**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('vercel.json', 'utf8')); console.log('vercel.json ok')"
npm run build
```

Expected:
- `vercel.json ok`
- Next build exits `0`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore: run Vercel functions in Frankfurt"
```

---

### Task 5: Preview Migration Canary

**Files:**
- Modify: `docs/infra/region-migration-runbook.md`
- Create: `docs/infra/region-baseline-preview.jsonl`

- [ ] **Step 1: Add preview env vars**

Run the preview env commands from the runbook with the new project values already exported:

```bash
BRANCH=codex/supabase-vercel-region-migration
npx vercel env add NEXT_PUBLIC_SUPABASE_URL preview "$BRANCH" --value "$NEW_SUPABASE_URL" --force --yes
npx vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview "$BRANCH" --value "$NEW_SUPABASE_ANON_KEY" --force --yes
```

- [ ] **Step 2: Deploy preview**

Run:

```bash
npx vercel --yes
```

Copy the preview URL from the CLI output.

- [ ] **Step 3: Run preview canary**

Run:

```bash
test -n "$PREVIEW_URL"
curl -s -i "$PREVIEW_URL/api/health"
BASELINE_URL="$PREVIEW_URL" BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs > docs/infra/region-baseline-preview.jsonl
curl -i -H 'Range: bytes=0-1023' "$PREVIEW_URL/api/audio/stream/$KNOWN_AUDIO_FILE_KEY"
PLAYWRIGHT_BASE_URL="$PREVIEW_URL" npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts --reporter=list
```

Expected:
- Health returns HTTP `200`.
- Health JSON reports Supabase connected, schema ok, and published lesson count matching current production.
- Audio range request returns HTTP `206` and non-empty bytes.
- `x-vercel-id` headers show the expected function region for Node routes.
- Playwright exits `0`.

- [ ] **Step 4: Commit preview baseline**

```bash
git add docs/infra/region-baseline-preview.jsonl
git commit -m "docs: record region migration preview baseline"
```

---

### Task 6: PR, Merge Prep, and Approval Gate

**Files:**
- No new files.

- [ ] **Step 1: Push and open PR**

```bash
git push origin codex/supabase-vercel-region-migration
gh pr create \
  --base dev \
  --head codex/supabase-vercel-region-migration \
  --title "Plan and configure Supabase region migration" \
  --body "## Summary
- Adds latency baseline tooling and migration runbook
- Configures Vercel Functions for Frankfurt after Supabase EU validation
- Records preview and production region migration baselines

## Test Plan
- BASELINE_AUDIO_FILE_KEY=\"$KNOWN_AUDIO_FILE_KEY\" node scripts/latency-baseline.mjs
- npm run build
- PLAYWRIGHT_BASE_URL=\"$PREVIEW_URL\" npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts --reporter=list
- curl -s -i \"$PREVIEW_URL/api/health\"
- curl -i -H 'Range: bytes=0-1023' \"$PREVIEW_URL/api/audio/stream/$KNOWN_AUDIO_FILE_KEY\""
```

- [ ] **Step 2: Merge sequence**

Do not cut production over from this feature branch. Required order:

```text
branch -> PR to dev -> merge to dev -> validate dev/preview -> release/merge to main -> explicit user approval -> production env update -> production deploy
```

Before requesting production approval, verify:

- PR is merged through `dev`.
- The release commit on `main` includes the reviewed `vercel.json`.
- Preview canary passed with the new Supabase target.
- Old production env values are captured outside the repo.
- A rollback drill has been timed.
- A final restore strategy is chosen: fresh final target project or tested target reset/wipe.

---

### Task 7: Approved Production Cutover and Monitoring

**Files:**
- Create: `docs/infra/region-baseline-after.jsonl`

This task is an operations runbook, not automatic PR work. It starts only after explicit user approval in the thread.

- [ ] **Step 1: Confirm write freeze**

Before starting, confirm in the thread:

```text
Production cutover is starting. Please avoid all app writes until I confirm the canary passes: admin uploads/edits, category/snippet changes, progress updates, and bookmarks.
```

- [ ] **Step 2: Prepare clean final target**

Choose one:

- Preferred: create a fresh final Supabase project in `eu-central-1`, set `NEW_PROJECT_REF`, `NEW_DB_URL`, `NEW_SUPABASE_URL`, and `NEW_SUPABASE_ANON_KEY` to that project, then restore final data into it.
- Alternative: run a tested target reset/wipe on the preview target before final restore. Do not restore final data on top of dirty preview data.

- [ ] **Step 3: Take final backup outside the repo**

Run:

```bash
export FINAL_MIGRATION_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tora-region-final.XXXXXX")"
cd "$FINAL_MIGRATION_DIR"
supabase db dump --db-url "$OLD_DB_URL" -f roles.sql --role-only
supabase db dump --db-url "$OLD_DB_URL" -f schema.sql
supabase db dump --db-url "$OLD_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
supabase db dump --db-url "$OLD_DB_URL" -f history_schema.sql --schema supabase_migrations
supabase db dump --db-url "$OLD_DB_URL" -f history_data.sql --use-copy --data-only --schema supabase_migrations
cd -
```

- [ ] **Step 4: Restore final backup and validate parity**

Run the restore and validation commands from the runbook with `MIGRATION_DIR="$FINAL_MIGRATION_DIR"`.

Expected:
- Final source counts match final target counts.
- Policy, grant, function, trigger, and publication diffs have no unexpected changes.
- Known audio file key still exists in `lesson_audio`.

- [ ] **Step 5: Update production env vars**

Run:

```bash
npx vercel env update NEXT_PUBLIC_SUPABASE_URL production --value "$NEW_SUPABASE_URL" --yes
npx vercel env update NEXT_PUBLIC_SUPABASE_ANON_KEY production --value "$NEW_SUPABASE_ANON_KEY" --yes
```

- [ ] **Step 6: Deploy production from reviewed main**

Run:

```bash
git checkout main
git pull --ff-only origin main
git merge-base --is-ancestor origin/dev HEAD
npm run build
npx vercel --prod --yes
```

- [ ] **Step 7: Run production canary**

Run:

```bash
curl -s -i https://tora-player.vercel.app/api/health
BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs > docs/infra/region-baseline-after.jsonl
curl -i -H 'Range: bytes=0-1023' "https://tora-player.vercel.app/api/audio/stream/$KNOWN_AUDIO_FILE_KEY"
PLAYWRIGHT_BASE_URL=https://tora-player.vercel.app npx playwright test tests/e2e/smoke.spec.ts tests/e2e/offline-download.spec.ts --reporter=list
```

Expected:
- Health returns HTTP `200`.
- `checks.supabase` is `connected`.
- `checks.lessons.published` matches the final backup source count.
- Audio range request returns HTTP `206` and non-empty bytes.
- Playwright exits `0`.

- [ ] **Step 8: Commit after-baseline to a docs follow-up branch**

```bash
git checkout -b codex/region-migration-after-baseline
git add docs/infra/region-baseline-after.jsonl
git commit -m "docs: record region migration production baseline"
```

- [ ] **Step 9: Monitor for 24 hours**

Run a temporary loop or external monitor every 5 minutes for 24 hours:

```bash
while true; do
  date -u
  curl -fsS https://tora-player.vercel.app/api/health | jq .
  BASELINE_AUDIO_FILE_KEY="$KNOWN_AUDIO_FILE_KEY" node scripts/latency-baseline.mjs
  curl -fsSI -H 'Range: bytes=0-1023' "https://tora-player.vercel.app/api/audio/stream/$KNOWN_AUDIO_FILE_KEY"
  sleep 300
done
```

Expected:
- Health remains `ok`.
- Published lesson count remains stable unless admin work happened.
- p50/p95 health and lesson-list timings are better than or comparable to the before baseline.
- Any HTTP failure, empty lesson list, repeated audio range failure, or p95 regression above 50% triggers rollback evaluation.

---

## Self-Review

- Spec coverage: Covers baseline, target project creation, initial restore, policy/grant/function parity, Vercel region alignment, preview canary, approved production cutover, rollback, audio range canaries, and 24-hour monitoring.
- Placeholder scan: Secrets are intentionally represented as environment variables; no code depends on undefined functions or unclear file paths.
- Type consistency: No TypeScript API changes in this plan except `vercel.json` region configuration.
- Known residual risk: Supabase dashboard project creation, final clean target choice, and secret retrieval require human/dashboard access. Production cutover remains a separate explicitly approved operation.
