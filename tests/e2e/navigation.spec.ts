import { expect as baseExpect, test, type Page } from '@playwright/test';
import he from '../../messages/he.json';

const expect = baseExpect.configure({ timeout: 15_000 });
test.setTimeout(90_000);

async function openLesson(page: Page, tagged = false) {
  await page.goto(tagged ? '/he/tags' : '/he/lessons');
  if (tagged) {
    const tagLink = page.locator('main a[href*="/tags/"]').first();
    const tagHref = await tagLink.getAttribute('href');
    await tagLink.click();
    await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(tagHref);
  }
  const lessonLink = page.locator('main a[href*="/lessons/"]').first();
  const href = await lessonLink.getAttribute('href');
  await lessonLink.click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 45_000 }).toBe(href);
  await expect(page.locator('main [data-lesson-date]').first()).toBeVisible();
  return page.url();
}

async function expectDateResults(page: Page, date: string) {
  await expect(page.locator('[data-active-date]')).toHaveAttribute('data-active-date', date);
  await expect(page.locator('main h1')).toContainText(date);
  const dates = page.locator('main [data-lesson-date]');
  await expect(dates.first()).toBeVisible();
  expect(await dates.evaluateAll((links) => links.map((link) => link.getAttribute('data-lesson-date')))).toEqual(
    Array(await dates.count()).fill(date),
  );
}

async function installMediaHarness(page: Page) {
  await page.route('**/api/audio/stream/**', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/ogg', body: '' }),
  );
  await page.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('tora-player-offline');
    const setMediaState = (media: HTMLMediaElement, paused: boolean) => {
      Object.defineProperty(media, 'paused', { configurable: true, get: () => paused });
      Object.defineProperty(media, 'ended', { configurable: true, get: () => false });
      Object.defineProperty(media, 'error', { configurable: true, get: () => null });
      Object.defineProperty(media, 'readyState', { configurable: true, get: () => 4 });
    };
    HTMLMediaElement.prototype.play = function play() {
      window.__lastAudio = this as HTMLAudioElement;
      setMediaState(this, false);
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function pause() {
      setMediaState(this, true);
      this.dispatchEvent(new Event('pause'));
    };
  });
}

test('date links filter by stored DATE, clear it, and preserve browser Back', async ({ page }) => {
  const lessonURL = await openLesson(page);
  const dateLink = page.locator('main [data-lesson-date]').first();
  const date = (await dateLink.getAttribute('data-lesson-date'))!;
  await expect(dateLink).toHaveAttribute('href', `/he/lessons?date=${date}`);
  await dateLink.click();
  await expect(page).toHaveURL(new RegExp(`/he/lessons\\?date=${date}$`));
  await expectDateResults(page, date);
  await page.getByRole('link', { name: he.lessonBrowse.clearDate, exact: true }).click();
  await expect(page).toHaveURL(/\/he\/lessons$/);
  await expect(page.locator('[data-active-date]')).toHaveCount(0);
  await page.goBack();
  await expectDateResults(page, date);
  await page.goBack();
  await expect(page).toHaveURL(lessonURL);
});

test('lesson tags open their tag list, clear it, and preserve browser Back', async ({ page }) => {
  const lessonURL = await openLesson(page, true);
  const tagLink = page.locator('main [data-lesson-tag]').first();
  const tag = (await tagLink.getAttribute('data-lesson-tag'))!;
  const href = (await tagLink.getAttribute('href'))!;
  await tagLink.click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
  await expect(page.locator('[data-active-tag]')).toHaveAttribute('data-active-tag', tag);
  await expect(page.locator('main h1')).toContainText(tag);
  const cards = page.locator('main .group.relative');
  await expect(cards.first()).toBeVisible();
  for (const card of await cards.all()) {
    await expect(card.locator('[data-lesson-tag]').filter({ hasText: `#${tag}` })).toHaveCount(1);
  }
  await page.locator('[data-active-tag]').click();
  await expect(page).toHaveURL(/\/he\/lessons$/);
  await page.goBack();
  await expect(page.locator('[data-active-tag]')).toHaveAttribute('data-active-tag', tag);
  await page.goBack();
  await expect(page).toHaveURL(lessonURL);
});

test('date and tag query filters compose, clear separately, and have noindex metadata', async ({ page }) => {
  await openLesson(page, true);
  const date = (await page.locator('main [data-lesson-date]').first().getAttribute('data-lesson-date'))!;
  const tag = (await page.locator('main [data-lesson-tag]').first().getAttribute('data-lesson-tag'))!;
  const params = new URLSearchParams({ date, tag });
  await page.goto(`/he/lessons?${params}`);
  await expectDateResults(page, date);
  await expect(page.locator('[data-active-tag]')).toHaveAttribute('data-active-tag', tag);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/he\/lessons$/);
  await page.locator('[data-active-date]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('date')).toBeNull();
  expect(new URL(page.url()).searchParams.get('tag')).toBe(tag);
  await page.goBack();
  await expect(page.locator('[data-active-date]')).toBeVisible();
  await page.locator('[data-active-tag]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBeNull();
  expect(new URL(page.url()).searchParams.get('date')).toBe(date);
});

test('a real date with no lessons has an empty state; an invalid date is ignored', async ({ page }) => {
  await page.goto('/he/lessons?date=2001-01-01');
  await expect(page.locator('[data-active-date]')).toHaveAttribute('data-active-date', '2001-01-01');
  await expect(page.getByText(he.lessonBrowse.filteredEmpty, { exact: true })).toBeVisible();
  await expect(page.locator('main [data-lesson-date]')).toHaveCount(0);
  await page.goto('/he/lessons?date=2026-02-30');
  await expect(page.locator('[data-active-date]')).toHaveCount(0);
  await expect(page.locator('main [data-lesson-date]').first()).toBeVisible();
});

test('Tab reaches a date link and Enter navigates without nested links', async ({ page }) => {
  await openLesson(page);
  const dateLink = page.locator('main [data-lesson-date]').first();
  const href = await dateLink.getAttribute('href');
  let reached = false;
  for (let count = 0; count < 35; count++) {
    await page.keyboard.press('Tab');
    reached = await dateLink.evaluate((link) => document.activeElement === link);
    if (reached) break;
  }
  expect(reached).toBe(true);
  await page.keyboard.press('Enter');
  await expect.poll(() => `${new URL(page.url()).pathname}${new URL(page.url()).search}`).toBe(href);
  await expect(page.locator('main a a, main button a')).toHaveCount(0);
});

test('date navigation keeps the same audio element, mini-player lesson, queue and play intent', async ({ page }) => {
  await installMediaHarness(page);
  await page.goto('/he/lessons');
  await page.getByRole('main').getByRole('button', { name: he.player.play, exact: true }).first().click();
  await expect(page.locator('main [data-lesson-date]').first()).toBeVisible();
  await expect(page.locator('header').getByRole('button', { name: he.player.pause, exact: true })).toBeVisible();
  const mini = page.locator('[data-player-expand]');
  const miniName = await mini.getAttribute('aria-label');
  const audio = await page.evaluateHandle(() => window.__lastAudio);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tora-player-audio')!).state);
  const before = await page.evaluate(() => ({
    paused: window.__lastAudio!.paused,
    src: window.__lastAudio!.src,
    time: window.__lastAudio!.currentTime,
  }));
  await page.locator('main [data-lesson-date]').first().click();
  await expect(page.locator('[data-active-date]')).toBeVisible();
  await expect(mini).toHaveAttribute('aria-label', miniName!);
  await expect(page.locator('header').getByRole('button', { name: he.player.pause, exact: true })).toBeVisible();
  expect(await page.evaluate((original) => window.__lastAudio === original, audio)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tora-player-audio')!).state)).toEqual(stored);
  expect(
    await page.evaluate(() => ({
      paused: window.__lastAudio!.paused,
      src: window.__lastAudio!.src,
      time: window.__lastAudio!.currentTime,
    })),
  ).toEqual(before);
  expect(before.paused).toBe(false);
  await audio.dispose();
});

test('card, shorts and date-filter links fit a 360px viewport and meet touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  for (const pathname of ['/he/lessons', '/he/shorts']) {
    await page.goto(pathname);
    await expect(page.locator('main [data-lesson-date]').first()).toBeVisible();
    await expect(page.locator('main a a, main button a')).toHaveCount(0);
    const tooSmall = await page
      .locator('main [data-lesson-date], main [data-lesson-tag]')
      .evaluateAll((links) => links.filter((link) => link.getBoundingClientRect().height < 24).length);
    expect(tooSmall).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    ).toBeLessThanOrEqual(0);
  }
  await page.locator('main [data-lesson-date]').first().click();
  await expect(page.locator('[data-active-date]')).toBeVisible();
  expect(
    await page.locator('[data-active-date]').evaluate((link) => link.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
});
