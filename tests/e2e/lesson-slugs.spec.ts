import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import he from '../../messages/he.json';

// Only published anon reads. No login, playback, admin action or database write.
const fallbackId = 'fb296bdf-9d25-4832-a2d9-262875d48a29';
let lesson: { id: string; slug?: string | null };
test.beforeAll(async ({ request }) => {
  lesson = { id: process.env.SLUG_TEST_LESSON_ID || fallbackId, slug: process.env.SLUG_TEST_LESSON_SLUG };
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client
      .from('lessons')
      .select('*')
      .eq('is_published', true)
      .order('date', { ascending: false })
      .limit(1000);
    if (error) throw error;
    // Exercise the no-slug state when present. The same suite also works after backfill.
    const selected = process.env.SLUG_TEST_LESSON_ID
      ? data?.find((row) => row.id === process.env.SLUG_TEST_LESSON_ID)
      : (process.env.SLUGS_LIVE === '1'
          ? data?.find((row) => row.slug && row.lesson_type !== 'short_clip')
          : data?.find((row) => !row.slug)) ||
        data?.find((row) => row.lesson_type !== 'short_clip') ||
        data?.[0];
    if (selected) lesson = { id: selected.id, slug: selected.slug };
  }
  // A deployed read-only run can discover the slug from the old UUID URL without credentials.
  if (!lesson.slug) {
    const response = await request.get(`/he/lessons/${lesson.id}`, { maxRedirects: 0 });
    if (response.status() === 308) {
      lesson.slug = new URL(response.headers().location, response.url()).pathname.split('/').pop();
    }
  }
});

test.beforeEach(async ({ page }) => {
  await page.route('**/api/images/**', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/audio/**', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/listen', (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(() => {
    localStorage.clear();
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
});

test('UUID URLs render with no slug, and remain usable after a slug is assigned', async ({ page, request }) => {
  test.setTimeout(90_000);
  const pathname = `/he/lessons/${lesson.id}`;
  const raw = await request.get(pathname, { maxRedirects: 0 });
  expect(raw.status()).toBe(lesson.slug ? 308 : 200);
  const response = await page.goto(pathname);
  expect(response?.status()).toBe(200);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/he/lessons/${lesson.slug || lesson.id}$`),
  );
  if (lesson.slug) await expect(page).toHaveURL(new RegExp(`/he/lessons/${lesson.slug}$`));
});

test('an unknown slug shows the localized not-found page', async ({ page, request }) => {
  test.setTimeout(90_000);
  const path = '/he/lessons/unknown-slug-e2e-does-not-exist';
  // A crawler receives the non-streamed 404 status. The browser gets the localized UI.
  const response = await request.get(path, { headers: { 'user-agent': 'Twitterbot/1.0' } });
  expect(response.status()).toBe(404);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: he.notFound.title })).toBeVisible();
});

test('UUID navigation preserves playback time and unrelated repeated query parameters', async ({ page, request }) => {
  test.setTimeout(90_000);
  const path = `/en/lessons/${lesson.id}?t=123&extra=one&extra=two`;
  const raw = await request.get(path, { maxRedirects: 0 });
  if (lesson.slug) {
    expect(raw.status()).toBe(308);
    const destination = new URL(raw.headers().location, raw.url());
    expect(destination.pathname).toBe(`/en/lessons/${lesson.slug}`);
    expect(destination.searchParams.get('t')).toBe('123');
    expect(destination.searchParams.getAll('extra')).toEqual(['one', 'two']);
  } else expect(raw.status()).toBe(200);
  await page.goto(path);
  const current = new URL(page.url());
  expect(current.searchParams.get('t')).toBe('123');
  expect(current.searchParams.getAll('extra')).toEqual(['one', 'two']);
  await expect(page.locator('main h1')).toBeVisible();
});

test.describe('live slugs after migration and backfill (read-only)', () => {
  test.skip(process.env.SLUGS_LIVE !== '1', 'Opus enables this block after the reviewed backfill');
  test('UUID is a 308 to the slug with playback time; the slug is 200', async ({ request }) => {
    expect(lesson.slug).toBeTruthy();
    const response = await request.get(`/he/lessons/${lesson.id}?t=42`, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    const destination = new URL(response.headers().location, response.url());
    expect(destination.pathname).toBe(`/he/lessons/${lesson.slug}`);
    expect(destination.searchParams.get('t')).toBe('42');
    expect((await request.get(destination.toString())).status()).toBe(200);
  });
  test('sitemap includes the canonical slug URL', async ({ request }) => {
    expect(lesson.slug).toBeTruthy();
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain(`/he/lessons/${lesson.slug}</loc>`);
  });
  test('a catalog card points at the slug', async ({ page }) => {
    test.setTimeout(90_000);
    expect(lesson.slug).toBeTruthy();
    await page.goto('/he/lessons');
    await expect(page.locator(`main a[href="/he/lessons/${lesson.slug}"]`).first()).toBeVisible();
  });
});
