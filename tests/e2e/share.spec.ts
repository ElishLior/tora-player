import { expect, test, type Page } from '@playwright/test';
import he from '../../messages/he.json';
import type { AudioTrack } from '../../src/stores/audio-store';

// The runner and local server use the same configured public origin.
const lessonUrl = (track: AudioTrack) =>
  new URL(`/he/lessons/${encodeURIComponent(track.lessonSlug || track.lessonId || track.id)}`, process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').href;

declare global {
  interface Window {
    __lessonShareCalls: ShareData[];
    __shareClipboardCalls: number;
    __sharePauseCalls: number;
  }
}

type ShareMode = 'native' | 'cancel' | 'clipboard' | 'failed';

async function installHarness(page: Page, mode: ShareMode) {
  await page.addInitScript((shareMode) => {
    localStorage.clear();
    indexedDB.deleteDatabase('tora-player-offline');
    window.__lessonShareCalls = [];
    window.__shareClipboardCalls = 0;
    window.__sharePauseCalls = 0;

    const setMediaState = (media: HTMLMediaElement, paused: boolean) => {
      Object.defineProperty(media, 'paused', { configurable: true, get: () => paused });
      Object.defineProperty(media, 'ended', { configurable: true, get: () => false });
      Object.defineProperty(media, 'error', { configurable: true, get: () => null });
      Object.defineProperty(media, 'readyState', { configurable: true, get: () => 4 });
    };
    const OriginalAudio = window.Audio;
    window.Audio = function Audio(src?: string) {
      const audio = src === undefined ? new OriginalAudio() : new OriginalAudio(src);
      window.__lastAudio = audio;
      setMediaState(audio, true);
      return audio;
    } as unknown as typeof Audio;
    HTMLMediaElement.prototype.play = function () {
      window.__lastAudio = this as HTMLAudioElement;
      setMediaState(this, false);
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      window.__sharePauseCalls += 1;
      setMediaState(this, true);
      this.dispatchEvent(new Event('pause'));
    };

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value:
        shareMode === 'native' || shareMode === 'cancel'
          ? (data: ShareData) => {
              window.__lessonShareCalls.push(data);
              return shareMode === 'cancel'
                ? Promise.reject(new DOMException('Cancelled', 'AbortError'))
                : Promise.resolve();
            }
          : undefined,
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    if (shareMode === 'failed') {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: () => {
            window.__shareClipboardCalls += 1;
            return Promise.reject(new Error('denied'));
          },
        },
      });
      document.execCommand = () => false;
    } else {
      const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = (value: string) => {
        window.__shareClipboardCalls += 1;
        return writeText(value);
      };
    }
  }, mode);
  await page.route('**/api/audio/stream/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/api/images/stream/**', (route) => route.fulfill({ status: 200, body: '' }));
}

async function loadedTrack(page: Page): Promise<AudioTrack> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tora-player-audio')!).state.currentTrack);
}

async function startLesson(page: Page) {
  await page.goto('/he/lessons');
  await page.getByRole('main').getByRole('button', { name: he.player.play, exact: true }).first().click();
  await expect(page.locator('header').getByRole('button', { name: he.player.pause })).toBeVisible();
  return loadedTrack(page);
}

async function openFullPlayer(page: Page) {
  await page.locator('[data-player-expand]').click();
  await expect(page.getByRole('dialog').getByRole('button', { name: he.player.shareLesson })).toBeVisible();
}

async function playbackSnapshot(page: Page) {
  return {
    track: await loadedTrack(page),
    time: await page.getByRole('dialog').getByRole('slider', { name: he.player.seek }).getAttribute('aria-valuenow'),
    audio: await page.evaluate(() => ({
      paused: window.__lastAudio?.paused,
      time: window.__lastAudio?.currentTime,
      source: window.__lastAudio?.src,
      pauseCalls: window.__sharePauseCalls,
    })),
  };
}

async function expectPlaybackUnchanged(page: Page, before: Awaited<ReturnType<typeof playbackSnapshot>>) {
  expect(await playbackSnapshot(page)).toEqual(before);
  await expect(page.getByRole('dialog').getByRole('button', { name: he.player.pause, exact: true })).toBeVisible();
}

async function expectNoOverflow(page: Page) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
  ).toBeLessThanOrEqual(0);
}

test.beforeEach(async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 360, height: 780 });
});

test('native share uses the loaded lesson after navigation, without a playback change', async ({ page }) => {
  await installHarness(page, 'native');
  const track = await startLesson(page);
  const expectedUrl = lessonUrl(track);
  const loadedPath = `/he/lessons/${encodeURIComponent(track.lessonSlug || track.lessonId || track.id)}`;
  const otherLesson = page.locator(`main a[href*="/lessons/"]:not([href="${loadedPath}"])`).first();
  const otherHref = await otherLesson.getAttribute('href');
  await otherLesson.click();
  await expect(page).toHaveURL(new URL(otherHref!, page.url()).href);
  expect(await loadedTrack(page)).toEqual(track);
  await expectNoOverflow(page);
  await openFullPlayer(page);
  const share = page.getByRole('dialog').getByRole('button', { name: he.player.shareLesson });
  const bounds = await share.boundingBox();
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  const before = await playbackSnapshot(page);
  await share.click();
  await expect(share).toBeEnabled();
  expect(await page.evaluate(() => window.__lessonShareCalls)).toEqual([
    { title: track.hebrewTitle || track.title, text: '', url: expectedUrl },
  ]);
  expect(await page.evaluate(() => window.__shareClipboardCalls)).toBe(0);
  await expectPlaybackUnchanged(page, before);
  await expectNoOverflow(page);
});

test('cancelled native share is silent and keeps playback active', async ({ page }) => {
  await installHarness(page, 'cancel');
  await startLesson(page);
  await openFullPlayer(page);
  const before = await playbackSnapshot(page);
  const share = page.getByRole('dialog').getByRole('button', { name: he.player.shareLesson });
  await share.click();
  await expect(share).toBeEnabled();
  expect(await page.evaluate(() => window.__lessonShareCalls.length)).toBe(1);
  expect(await page.evaluate(() => window.__shareClipboardCalls)).toBe(0);
  await expect(page.getByText(he.player.shareCopied, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: he.player.shareLink })).toHaveCount(0);
  // Next's route announcer also has role=alert; scope this check to the player.
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveCount(0);
  await expectPlaybackUnchanged(page, before);
});

test('clipboard fallback copies the canonical URL and shows inline confirmation', async ({ page }) => {
  await installHarness(page, 'clipboard');
  const track = await startLesson(page);
  await openFullPlayer(page);
  const before = await playbackSnapshot(page);
  await page.getByRole('dialog').getByRole('button', { name: he.player.shareLesson }).click();
  await expect(page.getByRole('status').filter({ hasText: he.player.shareCopied })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(lessonUrl(track));
  await expectPlaybackUnchanged(page, before);
  await expectNoOverflow(page);
});

test('copy failure selects a manual URL field and traps focus until close', async ({ page }) => {
  await installHarness(page, 'failed');
  const track = await startLesson(page);
  await openFullPlayer(page);
  const before = await playbackSnapshot(page);
  const share = page.getByRole('dialog').getByRole('button', { name: he.player.shareLesson });
  await share.click();
  const field = page.getByRole('textbox', { name: he.player.shareLink });
  const url = lessonUrl(track);
  await expect(field).toHaveValue(url);
  await expect(field).toHaveAttribute('readonly', '');
  await expect(field).toBeFocused();
  expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([
    0,
    url.length,
  ]);
  await expectNoOverflow(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: he.player.shareClose })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(share).toBeFocused();
  await expectPlaybackUnchanged(page, before);
});

test('mini share stays beside the expand button and follows a switched lesson', async ({ page }) => {
  await installHarness(page, 'native');
  await startLesson(page);
  await page.getByRole('main').getByRole('button', { name: he.player.play, exact: true }).nth(1).click();
  const track = await loadedTrack(page);
  const expand = page.locator('[data-player-expand]');
  await expect(expand.locator('button')).toHaveCount(0);
  const share = expand.locator('..').getByRole('button', { name: he.player.shareLesson });
  await expect(share).toBeVisible();
  await expectNoOverflow(page);
  await share.click();
  await expect(share).toBeEnabled();
  expect(await page.evaluate(() => window.__lessonShareCalls)).toEqual([
    { title: track.hebrewTitle || track.title, text: '', url: lessonUrl(track) },
  ]);
  await expect(page.locator('header').getByRole('button', { name: he.player.pause })).toBeVisible();
  await expectNoOverflow(page);
});
