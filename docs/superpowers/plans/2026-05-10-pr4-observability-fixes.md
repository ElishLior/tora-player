# PR4 Observability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the remaining PR #4 review issues so lesson loading, pagination, and health checks fail visibly instead of silently.

**Architecture:** Keep the current PR shape: pure Supabase lesson-list helpers own database result semantics, the server action adapts helper results for the client, the client shows a recoverable load-more failure, and `/api/health` reports degraded when any required dependency probe fails. Add small pure helpers only where they let us test behavior without adding a React test harness.

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase, Vercel Edge Route Handlers, Vitest, Playwright smoke tests.

---

## Scope

This plan fixes only the PR review findings:

1. Infinite scroll hides later-page database failures.
2. Supabase/PostgREST plain-object errors lose their real message.
3. `/api/health` can report `ok` while lesson count probes failed.
4. Health R2 readiness is stricter than the runtime R2 bucket fallback.
5. Smoke tests should be able to run against a non-3000 local port.

Offline lesson downloads and Spotify/Apple Music-style background playback are intentionally not included in this plan. They should be the next dedicated implementation plan after this branch is ready to merge.

## File Structure

- Modify `src/lib/supabase/lesson-list.ts`
  - Preserve plain-object Supabase error messages.
  - Keep existing `LessonListFailureCode` contract.
- Modify `src/lib/supabase/lesson-list.test.ts`
  - Add tests for plain-object Supabase errors.
  - Add tests for paginated failure results.
- Create `src/lib/r2-config.ts`
  - Share the R2 default bucket and runtime readiness rules.
- Modify `src/lib/r2.ts`
  - Use the shared default bucket getter.
- Modify `src/lib/health.ts`
  - Add lesson-count probe status.
  - Return degraded when count probes fail or omit usable counts.
  - Use shared R2 readiness rules.
- Modify `src/lib/health.test.ts`
  - Add failed-count-probe coverage.
  - Replace the missing-bucket degraded expectation with default-bucket behavior.
  - Add missing-R2-credential degraded coverage.
- Create `src/lib/lessons/pagination-state.ts`
  - Pure helper for load-more error copy and auto-scroll gating.
- Create `src/lib/lessons/pagination-state.test.ts`
  - Cover Hebrew/English copy and pausing auto-load while an error is visible.
- Modify `src/app/[locale]/lessons/lessons-client.tsx`
  - Display a recoverable load-more error when `getLessonsPaginated` returns `error`.
  - Pause infinite scroll while the error is visible.
- Modify `playwright.config.ts`
  - Read `PLAYWRIGHT_BASE_URL` with fallback to `http://localhost:3000`.
- Modify `tests/e2e/smoke.spec.ts`
  - Read `PLAYWRIGHT_BASE_URL`.
  - Assert `/he/lessons` shows lesson cards rather than fake empty/error states when DB is healthy.

---

## User-Facing Specs

### Lesson List Initial Load

- If Supabase is unconfigured, unreachable, or schema-incompatible, `/he/lessons` shows:
  - Hebrew title: `לא ניתן לטעון שיעורים כרגע`
  - Hebrew description: `יש בעיה בחיבור למסד הנתונים. נסה שוב בעוד רגע.`
  - Retry button: `נסה שוב`
- A real empty result still shows the empty state:
  - Hebrew title: `אין שיעורים עדיין`

### Infinite Scroll Load More

- If the first page loads and a later pagination request fails:
  - Existing lesson cards stay visible.
  - The app shows an inline alert below the rendered lesson groups.
  - Hebrew copy: `לא ניתן לטעון שיעורים נוספים כרגע. בדוק את החיבור ונסה שוב.`
  - English copy: `Could not load more lessons right now. Check the connection and try again.`
  - Retry button:
    - Hebrew idle: `נסה שוב`
    - English idle: `Retry`
    - Hebrew loading: `טוען...`
    - English loading: `Loading...`
  - Infinite scroll does not immediately retry in a loop while the alert is visible.
  - Pressing retry calls the same pagination request again using the current `lessons.length` offset.

### Health Endpoint

- `/api/health` returns HTTP 200 only when:
  - Supabase is configured and reachable.
  - Required schema probes pass.
  - Lesson count probes both return OK responses with parseable `Content-Range` totals.
  - R2 runtime credentials are configured.
- `/api/health` returns HTTP 503 when:
  - Supabase env is missing.
  - Supabase connectivity fails.
  - A schema probe fails.
  - A count probe returns a non-OK response.
  - A count probe returns no parseable total.
  - R2 account/access/secret credentials are missing.
- Missing `R2_BUCKET_NAME` alone is not degraded because runtime defaults to `tora-player-audio`.
- Health JSON includes a lesson probe status:

```json
{
  "checks": {
    "lessons": {
      "status": "ok",
      "total": 134,
      "published": 134
    }
  }
}
```

---

## Task 1: Preserve Supabase Error Messages

**Files:**
- Modify `src/lib/supabase/lesson-list.ts`
- Modify `src/lib/supabase/lesson-list.test.ts`

- [ ] **Step 1: Write failing tests for plain-object errors and paginated failures**

Change the import in `src/lib/supabase/lesson-list.test.ts` to include `loadPaginatedLessonList`:

```ts
import {
  loadInitialLessonList,
  loadPaginatedLessonList,
  type LessonListReader,
} from './lesson-list';
```

Add these tests inside the existing `describe('loadInitialLessonList', () => { ... })` block:

```ts
  it('preserves Supabase plain-object error messages', async () => {
    const reader = createReader({
      getLessonsPage: vi.fn(async () => {
        throw {
          code: '42P01',
          message: 'relation "lessons" does not exist',
        };
      }),
    });

    const result = await loadInitialLessonList(reader, {});

    expect(result).toMatchObject({
      ok: false,
      code: 'schema',
      message: 'relation "lessons" does not exist',
    });
  });

  it('returns paginated failures with the original Supabase message', async () => {
    const reader = createReader({
      getLessonsPage: vi.fn(async () => {
        throw {
          code: 'PGRST301',
          message: 'JWT expired',
        };
      }),
    });

    const result = await loadPaginatedLessonList(reader, {
      offset: 20,
      limit: 20,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'query',
      message: 'JWT expired',
    });
  });
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run:

```bash
npx vitest run src/lib/supabase/lesson-list.test.ts
```

Expected result before implementation:

```text
FAIL src/lib/supabase/lesson-list.test.ts
expected message to equal "relation \"lessons\" does not exist"
```

- [ ] **Step 3: Implement plain-object message extraction**

Replace `getErrorMessage` in `src/lib/supabase/lesson-list.ts` with:

```ts
function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error.trim()) return error;

  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return 'Failed to load lessons.';
}
```

- [ ] **Step 4: Run the targeted test and confirm it passes**

Run:

```bash
npx vitest run src/lib/supabase/lesson-list.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/lib/supabase/lesson-list.ts src/lib/supabase/lesson-list.test.ts
git commit -m "fix: preserve lesson list database errors"
```

---

## Task 2: Make Health Counts and R2 Readiness Accurate

**Files:**
- Create `src/lib/r2-config.ts`
- Modify `src/lib/r2.ts`
- Modify `src/lib/health.ts`
- Modify `src/lib/health.test.ts`

- [ ] **Step 1: Write failing health tests**

In `src/lib/health.test.ts`, update the happy-path expectation:

```ts
    expect(result.body.checks.lessons).toEqual({
      status: 'ok',
      total: 134,
      published: 134,
    });
```

Replace the current `returns degraded when R2 is not configured` test with these three tests:

```ts
  it('returns degraded when lesson count probes fail', async () => {
    const result = await runHealthChecks(configuredEnv, async (input) => {
      const url = String(input);
      if (url === 'https://example.supabase.co/rest/v1/lessons?select=id') {
        return new Response('count failed', { status: 500 });
      }
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      return okResponse('0-0/134');
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.lessons.status).toBe('error');
    expect(result.body.checks.lessons.total).toBeNull();
    expect(result.body.checks.lessons.published).toBe(134);
  });

  it('uses the runtime default R2 bucket when R2_BUCKET_NAME is omitted', async () => {
    const envWithoutBucket = { ...configuredEnv, R2_BUCKET_NAME: undefined };

    const result = await runHealthChecks(envWithoutBucket, async (input) => {
      const url = String(input);
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      if (url.includes('/lessons?select=id')) return okResponse('0-0/134');
      return okResponse();
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('ok');
    expect(result.body.checks.r2).toBe('configured');
  });

  it('returns degraded when an R2 credential is missing', async () => {
    const envWithoutR2Secret = { ...configuredEnv, R2_SECRET_ACCESS_KEY: undefined };

    const result = await runHealthChecks(envWithoutR2Secret, async (input) => {
      const url = String(input);
      if (url.includes('is_published=eq.true')) return okResponse('0-0/134');
      if (url.includes('/lessons?select=id')) return okResponse('0-0/134');
      return okResponse();
    });

    expect(result.httpStatus).toBe(503);
    expect(result.body.status).toBe('degraded');
    expect(result.body.checks.r2).toBe('unconfigured');
  });
```

- [ ] **Step 2: Run the targeted test and confirm it fails**

Run:

```bash
npx vitest run src/lib/health.test.ts
```

Expected result before implementation:

```text
FAIL src/lib/health.test.ts
expected received lessons object to include status
```

- [ ] **Step 3: Create shared R2 config**

Create `src/lib/r2-config.ts`:

```ts
export const DEFAULT_R2_BUCKET_NAME = 'tora-player-audio';

export const REQUIRED_R2_CREDENTIAL_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
] as const;

export type R2ConfigEnv = Partial<
  Record<(typeof REQUIRED_R2_CREDENTIAL_ENV)[number] | 'R2_BUCKET_NAME', string | undefined>
>;

export function getR2BucketName(env: R2ConfigEnv = process.env) {
  return (env.R2_BUCKET_NAME || DEFAULT_R2_BUCKET_NAME).trim();
}

export function isR2RuntimeConfigured(env: R2ConfigEnv = process.env) {
  return (
    REQUIRED_R2_CREDENTIAL_ENV.every((key) => Boolean(env[key]?.trim())) &&
    Boolean(getR2BucketName(env))
  );
}
```

- [ ] **Step 4: Use the shared bucket getter in R2 runtime**

In `src/lib/r2.ts`, add this import:

```ts
import { getR2BucketName } from './r2-config';
```

Replace:

```ts
const BUCKET = (process.env.R2_BUCKET_NAME || 'tora-player-audio').trim();
```

with:

```ts
const BUCKET = getR2BucketName(process.env);
```

- [ ] **Step 5: Update health types and R2 readiness**

In `src/lib/health.ts`, add:

```ts
import { isR2RuntimeConfigured } from './r2-config';
```

Remove the local `REQUIRED_R2_ENV` constant and `isR2Configured` function.

Update the `lessons` check type:

```ts
    lessons: {
      status: 'skipped' | 'ok' | 'error';
      total: number | null;
      published: number | null;
    };
```

Update the R2 readiness assignment:

```ts
  const r2 = isR2RuntimeConfigured(env) ? 'configured' : 'unconfigured';
```

Initialize lessons with status:

```ts
    lessons: {
      status: 'skipped',
      total: null,
      published: null,
    },
```

- [ ] **Step 6: Treat count probe failures as degraded**

Replace the count handling block in `src/lib/health.ts` with:

```ts
        try {
          const [total, published] = await Promise.all([
            fetcher(`${supabaseUrl}/rest/v1/lessons?select=id`, {
              method: 'GET',
              headers: countHeaders,
              signal: withTimeout(),
            }),
            fetcher(`${supabaseUrl}/rest/v1/lessons?select=id&is_published=eq.true`, {
              method: 'GET',
              headers: countHeaders,
              signal: withTimeout(),
            }),
          ]);

          const totalCount = total.ok ? parseCount(total.headers.get('Content-Range')) : null;
          const publishedCount = published.ok
            ? parseCount(published.headers.get('Content-Range'))
            : null;

          checks.lessons.total = totalCount;
          checks.lessons.published = publishedCount;
          checks.lessons.status =
            total.ok && published.ok && totalCount !== null && publishedCount !== null
              ? 'ok'
              : 'error';
        } catch {
          checks.lessons.status = 'error';
        }
```

Update the overall status condition:

```ts
  const status: DependencyStatus =
    checks.supabase === 'connected' &&
    checks.schema === 'ok' &&
    checks.lessons.status === 'ok' &&
    checks.r2 === 'configured'
      ? 'ok'
      : 'degraded';
```

- [ ] **Step 7: Run the targeted health tests**

Run:

```bash
npx vitest run src/lib/health.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

- [ ] **Step 8: Commit Task 2**

Run:

```bash
git add src/lib/r2-config.ts src/lib/r2.ts src/lib/health.ts src/lib/health.test.ts
git commit -m "fix: make health dependency probes strict"
```

---

## Task 3: Surface Infinite Scroll Failures

**Files:**
- Create `src/lib/lessons/pagination-state.ts`
- Create `src/lib/lessons/pagination-state.test.ts`
- Modify `src/app/[locale]/lessons/lessons-client.tsx`

- [ ] **Step 1: Add pure pagination UI-state tests**

Create `src/lib/lessons/pagination-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { canAutoLoadMore, getLoadMoreErrorMessage } from './pagination-state';

describe('pagination-state', () => {
  it('returns Hebrew load-more failure copy', () => {
    expect(getLoadMoreErrorMessage('he')).toBe(
      'לא ניתן לטעון שיעורים נוספים כרגע. בדוק את החיבור ונסה שוב.',
    );
  });

  it('returns English load-more failure copy', () => {
    expect(getLoadMoreErrorMessage('en')).toBe(
      'Could not load more lessons right now. Check the connection and try again.',
    );
  });

  it('pauses infinite scroll while an error is visible', () => {
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: true,
        pageError: 'failed',
      }),
    ).toBe(false);
  });

  it('allows infinite scroll only in normal mode with more pages and no visible error', () => {
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: true,
        pageError: null,
      }),
    ).toBe(true);
    expect(
      canAutoLoadMore({
        isSearchMode: true,
        hasMore: true,
        pageError: null,
      }),
    ).toBe(false);
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: false,
        pageError: null,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the new test and confirm it fails because the helper is missing**

Run:

```bash
npx vitest run src/lib/lessons/pagination-state.test.ts
```

Expected result before implementation:

```text
FAIL src/lib/lessons/pagination-state.test.ts
Cannot find module './pagination-state'
```

- [ ] **Step 3: Create the pure pagination helper**

Create `src/lib/lessons/pagination-state.ts`:

```ts
export interface AutoLoadMoreState {
  isSearchMode: boolean;
  hasMore: boolean;
  pageError: string | null;
}

export function getLoadMoreErrorMessage(locale: string) {
  return locale === 'he'
    ? 'לא ניתן לטעון שיעורים נוספים כרגע. בדוק את החיבור ונסה שוב.'
    : 'Could not load more lessons right now. Check the connection and try again.';
}

export function canAutoLoadMore({ isSearchMode, hasMore, pageError }: AutoLoadMoreState) {
  return !isSearchMode && hasMore && !pageError;
}
```

- [ ] **Step 4: Wire the helper into the lessons client**

In `src/app/[locale]/lessons/lessons-client.tsx`, add:

```ts
import {
  canAutoLoadMore,
  getLoadMoreErrorMessage,
} from '@/lib/lessons/pagination-state';
```

After the existing infinite-scroll state:

```ts
  const [lessons, setLessons] = useState<LessonWithRelations[]>(initialLessons);
  const [hasMore, setHasMore] = useState(initialHasMore);
```

add:

```ts
  const [pageError, setPageError] = useState<string | null>(null);
  const [isRetryingPage, setIsRetryingPage] = useState(false);
```

Update `fetchMore`:

```ts
  const fetchMore = useCallback(async () => {
    const offset = lessons.length;
    const result = await getLessonsPaginated(
      offset,
      PAGE_SIZE,
      audioTypeFilter || undefined,
      categoryFilter || undefined
    );

    if (result.error) {
      setPageError(getLoadMoreErrorMessage(locale));
      return;
    }

    setPageError(null);
    setLessons((prev) => [...prev, ...result.lessons]);
    setHasMore(result.hasMore);
  }, [lessons.length, audioTypeFilter, categoryFilter, locale]);
```

Before calling `useInfiniteScroll`, add:

```ts
  const shouldAutoLoadMore = canAutoLoadMore({
    isSearchMode,
    hasMore,
    pageError,
  });
```

Replace:

```ts
  const { sentinelRef, isLoading } = useInfiniteScroll({ fetchMore, hasMore: !isSearchMode && hasMore });
```

with:

```ts
  const { sentinelRef, isLoading } = useInfiniteScroll({
    fetchMore,
    hasMore: shouldAutoLoadMore,
  });
```

Add this retry callback after the `useInfiniteScroll` call:

```ts
  const retryLoadMore = useCallback(async () => {
    setIsRetryingPage(true);
    await fetchMore();
    setIsRetryingPage(false);
  }, [fetchMore]);
```

Render the alert before the infinite scroll sentinel:

```tsx
      {!isSearchMode && pageError && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200 sm:flex-row sm:items-center sm:justify-between"
          dir={locale === 'he' ? 'rtl' : 'ltr'}
        >
          <span>{pageError}</span>
          <button
            type="button"
            onClick={retryLoadMore}
            disabled={isRetryingPage}
            className="self-start rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60 sm:self-auto"
          >
            {isRetryingPage
              ? locale === 'he'
                ? 'טוען...'
                : 'Loading...'
              : locale === 'he'
                ? 'נסה שוב'
                : 'Retry'}
          </button>
        </div>
      )}
```

- [ ] **Step 5: Run pagination helper tests**

Run:

```bash
npx vitest run src/lib/lessons/pagination-state.test.ts
```

Expected result:

```text
Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 6: Run TypeScript to catch client wiring mistakes**

Run:

```bash
npm run type-check
```

Expected result:

```text
> tora-player@0.1.0 type-check
> tsc --noEmit
```

Exit code must be `0`.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/lib/lessons/pagination-state.ts src/lib/lessons/pagination-state.test.ts 'src/app/[locale]/lessons/lessons-client.tsx'
git commit -m "fix: show lesson pagination failures"
```

---

## Task 4: Strengthen Smoke Test Targeting

**Files:**
- Modify `playwright.config.ts`
- Modify `tests/e2e/smoke.spec.ts`

- [ ] **Step 1: Make Playwright base URL configurable**

In `playwright.config.ts`, add:

```ts
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
```

Replace:

```ts
    baseURL: 'http://localhost:3000',
```

with:

```ts
    baseURL,
```

- [ ] **Step 2: Make smoke spec use the same configurable base URL**

In `tests/e2e/smoke.spec.ts`, replace:

```ts
const BASE_URL = 'http://localhost:3000';
```

with:

```ts
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
```

- [ ] **Step 3: Add a restored-lessons assertion**

In `tests/e2e/smoke.spec.ts`, replace the current `Navigate to /he/lessons page` test with:

```ts
  test('Navigate to /he/lessons page and render restored lessons', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    await expect(page).toHaveURL(/\/he\/lessons/);
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText('לא ניתן לטעון שיעורים כרגע')).toHaveCount(0);
    await expect(page.getByText('אין שיעורים עדיין')).toHaveCount(0);
    await expect(page.locator('a[href*="/lessons/"]').first()).toBeVisible();
  });
```

- [ ] **Step 4: Run smoke test against a known running server**

Start the app in another terminal after a successful build:

```bash
PORT=3001 npm run start
```

Run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/smoke.spec.ts --reporter=list
```

Expected result:

```text
12 passed
```

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add playwright.config.ts tests/e2e/smoke.spec.ts
git commit -m "test: strengthen lesson smoke coverage"
```

---

## Task 5: Full Verification and PR Readiness

**Files:**
- No code changes expected.
- Use this task to verify, push, and prepare the PR.

- [ ] **Step 1: Run all focused unit tests**

Run:

```bash
npx vitest run \
  src/lib/health.test.ts \
  src/lib/supabase/lesson-list.test.ts \
  src/lib/lessons/pagination-state.test.ts
```

Expected result:

```text
Test Files  3 passed (3)
Tests       16 passed (16)
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
npm run type-check
```

Expected result: exit code `0`.

- [ ] **Step 3: Run production build**

Run:

```bash
npm run build
```

Expected result:

```text
✓ Compiled successfully
```

Known existing warnings about unused variables and `<img>` usage may remain. New TypeScript or build errors are not acceptable.

- [ ] **Step 4: Run local health smoke**

Start the production server:

```bash
PORT=3001 npm run start
```

In another terminal, run:

```bash
curl -s -i http://localhost:3001/api/health
```

Expected result:

```text
HTTP/1.1 200 OK
```

Expected JSON fields:

```json
{
  "status": "ok",
  "checks": {
    "supabase": "connected",
    "schema": "ok",
    "lessons": {
      "status": "ok",
      "total": 134,
      "published": 134
    },
    "r2": "configured"
  }
}
```

- [ ] **Step 5: Run Playwright smoke against the local server**

Run:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test tests/e2e/smoke.spec.ts --reporter=list
```

Expected result:

```text
12 passed
```

- [ ] **Step 6: Push branch**

Run:

```bash
git push origin codex/restore-lessons-health-offline-playback-plan
```

Expected result:

```text
To github.com:ElishLior/tora-player.git
   <old>..<new>  codex/restore-lessons-health-offline-playback-plan -> codex/restore-lessons-health-offline-playback-plan
```

- [ ] **Step 7: Update PR #4 from draft to ready after verification**

Run:

```bash
gh pr ready 4
gh pr view 4 --json isDraft,mergeStateStatus,statusCheckRollup,url
```

Expected result:

```json
{
  "isDraft": false,
  "mergeStateStatus": "CLEAN",
  "url": "https://github.com/ElishLior/tora-player/pull/4"
}
```

Do not merge to `dev` until the user approves.

---

## Execution Recommendation

Use `subagent-driven-development` for Tasks 1-4 if parallel work is desired:

- Worker A: Task 1, owns `src/lib/supabase/lesson-list.ts` and `src/lib/supabase/lesson-list.test.ts`.
- Worker B: Task 2, owns `src/lib/r2-config.ts`, `src/lib/r2.ts`, `src/lib/health.ts`, and `src/lib/health.test.ts`.
- Worker C: Task 3, owns `src/lib/lessons/pagination-state.ts`, `src/lib/lessons/pagination-state.test.ts`, and `src/app/[locale]/lessons/lessons-client.tsx`.
- Main thread: Task 4 and Task 5 verification, because smoke tests and PR readiness depend on all previous tasks landing.

If implementing inline, execute tasks sequentially and commit after each task. Do not deploy production from this branch without explicit user approval.

## Self-Review

- Spec coverage: All four review findings map to Tasks 1-3. Smoke and PR readiness map to Tasks 4-5.
- Placeholder scan: Every task includes concrete code, commands, and expected results.
- Type consistency: The new `HealthBody.checks.lessons.status` field is used in tests and the health status condition. The new pagination helper names match the planned imports.
