import { expect, test, type Page } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

declare global {
  interface Window {
    __lastAudio?: HTMLAudioElement;
    __resumeAllNativeAudio?: () => void;
  }
}

async function installMediaHarness(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    indexedDB.deleteDatabase('tora-player-offline');

    const setMediaState = (media: HTMLMediaElement, paused: boolean) => {
      Object.defineProperty(media, 'paused', { configurable: true, get: () => paused });
      Object.defineProperty(media, 'ended', { configurable: true, get: () => false });
      Object.defineProperty(media, 'error', { configurable: true, get: () => null });
      Object.defineProperty(media, 'readyState', { configurable: true, get: () => 4 });
    };

    const OriginalAudio = window.Audio;
    const nativeMediaElements = new Set<HTMLMediaElement>();
    const originalAddEventListener = HTMLMediaElement.prototype.addEventListener;

    HTMLMediaElement.prototype.addEventListener = function addEventListener(
      this: HTMLMediaElement,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      nativeMediaElements.add(this);
      return originalAddEventListener.call(this, type, listener, options);
    } as typeof HTMLMediaElement.prototype.addEventListener;

    window.Audio = (function Audio(src?: string) {
      const audio = src === undefined ? new OriginalAudio() : new OriginalAudio(src);
      window.__lastAudio = audio;
      nativeMediaElements.add(audio);
      setMediaState(audio, true);
      return audio;
    } as unknown) as typeof Audio;

    window.__resumeAllNativeAudio = () => {
      nativeMediaElements.forEach((media) => {
        window.__lastAudio = media as HTMLAudioElement;
        setMediaState(media, false);
        media.dispatchEvent(new Event('playing'));
      });
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

async function startFirstLesson(page: Page) {
  await page.goto(`${BASE_URL}/he/lessons`);
  await page.locator('a[href*="/lessons/"] button[aria-label="Play"]').first().click();
  await expect(page.locator('header').getByRole('button', { name: 'השהה' })).toBeVisible();
}

test.describe('music app player behavior', () => {
  test('syncs the UI back to playing when native audio resumes outside React state', async ({ page }) => {
    await installMediaHarness(page);
    await startFirstLesson(page);

    const header = page.locator('header');
    await header.getByRole('button', { name: 'השהה' }).click();
    await expect(header.getByRole('button', { name: 'נגן', exact: true })).toBeVisible();

    await page.evaluate(() => {
      if (!window.__resumeAllNativeAudio) throw new Error('Expected media harness to be installed');
      window.__resumeAllNativeAudio();
    });

    await expect(header.getByRole('button', { name: 'השהה' })).toBeVisible();
    await expect(header.getByRole('button', { name: 'נגן', exact: true })).toHaveCount(0);
  });

  test('exposes compatible accessible actions across header, mini player, and expanded player', async ({ page }) => {
    await installMediaHarness(page);
    await startFirstLesson(page);

    await expect(page.locator('button button, button [role="button"]')).toHaveCount(0);
    await expect(page.locator('header').getByRole('button', { name: 'מתנגן כעת' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'סימניה' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שדר' })).toBeVisible();

    await page.locator('header').getByRole('button', { name: 'מתנגן כעת' }).click();

    await expect(page.getByRole('button', { name: 'פתח שיעור' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'סימניה' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'סימון קטע' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'מצב נהיגה' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שמירה אופליין' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'הורדת קובץ למכשיר' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שדר' })).toBeVisible();
    await expect(page.getByText('שתף קטע')).toHaveCount(0);
  });

  test('keeps player controls responsive on compact mobile screens', async ({ page }) => {
    await installMediaHarness(page);
    await page.setViewportSize({ width: 360, height: 780 });
    await startFirstLesson(page);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);

    await page.locator('header').getByRole('button', { name: 'מתנגן כעת' }).click();
    await expect(page.getByRole('button', { name: 'סימון קטע' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'שמירה אופליין' })).toBeVisible();

    const expandedScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const expandedClientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(expandedScrollWidth).toBeLessThanOrEqual(expandedClientWidth + 5);
  });
});
