import { expect, test, type Locator, type Page } from '@playwright/test';
import he from '../../messages/he.json';

declare global {
  interface Window {
    __seekAudio: HTMLAudioElement;
    __seekEvents: number;
    __seekWrites: number;
  }
}

// Four minutes of local PCM silence. Keep native currentTime / seeking behavior,
// but never call native play or fetch real lesson audio.
function silentWav() {
  const rate = 8000;
  const dataSize = 240 * rate * 2;
  const wav = Buffer.alloc(44 + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

async function installPausedFixture(page: Page) {
  const wav = silentWav();
  await page.route('**/api/audio/stream/**', async (route) => {
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers().range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1;
    await route.fulfill({
      status: range ? 206 : 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
      },
      body: wav.subarray(start, end + 1),
    });
  });
  await page.route('**/api/listen', (route) => route.fulfill({ status: 204 }));
  await page.route('**/api/progress', (route) => route.fulfill({ status: 401 }));
  await page.addInitScript(() => {
    localStorage.clear();
    const OriginalAudio = window.Audio;
    const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    window.__seekEvents = 0;
    window.__seekWrites = 0;
    window.Audio = function Audio(src?: string) {
      const audio = new OriginalAudio(src);
      window.__seekAudio = audio;
      audio.addEventListener('seeking', () => window.__seekEvents++);
      Object.defineProperty(audio, 'currentTime', {
        get: () => time.get!.call(audio),
        set: (value: number) => {
          window.__seekWrites++;
          time.set!.call(audio, value);
        },
      });
      return audio;
    } as unknown as typeof Audio;
    HTMLMediaElement.prototype.play = () => Promise.resolve();
  });
}

async function expectOneSkip(page: Page, control: Locator, activation: 'click' | 'tap' | 'Enter' | 'Space') {
  const before = await page.evaluate(() => {
    window.__seekEvents = 0;
    window.__seekWrites = 0;
    return window.__seekAudio.currentTime;
  });
  if (activation === 'click') await control.click();
  else if (activation === 'tap') await control.tap();
  else {
    await control.focus();
    await page.keyboard.press(activation);
  }
  await expect.poll(() => page.evaluate(() => window.__seekEvents)).toBe(1);
  await page.waitForFunction(() => !window.__seekAudio.seeking);
  const after = await page.evaluate(() => ({
    time: window.__seekAudio.currentTime,
    events: window.__seekEvents,
    writes: window.__seekWrites,
    paused: window.__seekAudio.paused,
  }));
  expect(after.events).toBe(1);
  expect(after.writes).toBe(1);
  expect(after.paused).toBe(true);
  expect(after.time - before).toBeCloseTo(15, 1);
}

test.use({ hasTouch: true });

test('one activation seeks once on lesson, full player and driving surfaces, including remounts', async ({ page }) => {
  test.setTimeout(90_000);
  await installPausedFixture(page);
  await page.goto('/he/lessons');
  const lessonLink = page.locator('main a[href^="/he/lessons/"]').first();
  const lessonPath = await lessonLink.getAttribute('href');
  expect(lessonPath).toBeTruthy();
  await lessonLink.click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath}$`));
  await page.getByRole('main').getByRole('button', { name: he.player.play, exact: true }).first().click();
  await page.waitForFunction(() => window.__seekAudio?.readyState >= 2);
  await page.evaluate(() => { window.__seekAudio.currentTime = 100; });
  await page.waitForFunction(() => !window.__seekAudio.seeking);

  for (const activation of ['click', 'tap', 'Enter', 'Space'] as const) {
    await expectOneSkip(page, page.getByRole('main').getByRole('button', { name: he.player.skipForward, exact: true }), activation);
  }

  await page.goBack();
  await expect(page).toHaveURL(/\/he\/lessons$/);
  await page.locator(`main a[href="${lessonPath}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath}$`));
  await expectOneSkip(page, page.getByRole('main').getByRole('button', { name: he.player.skipForward, exact: true }), 'click');

  await page.evaluate(() => { window.__seekAudio.currentTime = 100; });
  await page.waitForFunction(() => !window.__seekAudio.seeking);
  await page.locator('header').getByRole('button', { name: he.player.nowPlaying, exact: true }).click();
  const dialog = page.getByRole('dialog');
  for (const activation of ['click', 'tap', 'Enter', 'Space'] as const) {
    await expectOneSkip(page, dialog.getByRole('button', { name: he.player.skipForward, exact: true }), activation);
  }
  await dialog.getByRole('button', { name: he.player.closePlayer, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${lessonPath}$`));
  await expectOneSkip(page, page.getByRole('main').getByRole('button', { name: he.player.skipForward, exact: true }), 'click');

  // Use client navigation so the same root audio element survives the route change.
  await page.getByRole('main').getByRole('button', { name: he.player.drivingMode, exact: true }).click();
  await expect(page).toHaveURL(/\/he\/driving/, { timeout: 30_000 });
  // Reset below the end after the ten independent +15 activations above.
  await page.evaluate(() => { window.__seekAudio.currentTime = 60; });
  await page.waitForFunction(() => !window.__seekAudio.seeking);
  for (const activation of ['click', 'tap', 'Enter', 'Space'] as const) {
    await expectOneSkip(page, page.getByRole('main').getByRole('button', { name: he.player.skipForward, exact: true }), activation);
  }
});
