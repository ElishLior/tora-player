import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import he from '../../messages/he.json';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

declare global {
  interface Window {
    __offlinePlaybackBlobUrls: string[];
  }
}

async function seedOfflineLesson(page: Page, files = 1) {
  await page.evaluate(async (files) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('tora-player-offline', 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('lesson-meta')) {
          db.createObjectStore('lesson-meta', { keyPath: 'lessonId' });
        }
        if (!db.objectStoreNames.contains('audio-cache')) {
          db.createObjectStore('audio-cache');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['lesson-meta', 'audio-cache'], 'readwrite');
      tx.objectStore('lesson-meta').clear();
      tx.objectStore('audio-cache').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    const tx = db.transaction(['lesson-meta', 'audio-cache'], 'readwrite');
    tx.objectStore('audio-cache').put(
      new Blob(['fake-audio'], { type: 'audio/mpeg' }),
      'qa-lesson:qa-audio-1'
    );
    if (files > 1) {
      tx.objectStore('audio-cache').put(
        new Blob(['fake-audio'], { type: 'audio/mpeg' }),
        'qa-lesson:qa-audio-2'
      );
    }
    tx.objectStore('lesson-meta').put({
      lessonId: 'qa-lesson',
      title: 'Offline QA Lesson',
      hebrewTitle: 'שיעור בדיקה אופליין',
      audioUrl: '/api/audio/stream/qa-audio-1.mp3',
      duration: files > 1 ? 225 : 125,
      fileSize: files > 1 ? 20 : 10,
      downloadedAt: '2026-05-10T00:00:00.000Z',
      seriesName: 'בדיקות',
      date: '2026-05-10',
      audioFiles: [
        {
          offlineKey: 'qa-lesson:qa-audio-1',
          lessonId: 'qa-lesson',
          audioFileId: 'qa-audio-1',
          audioUrl: '/api/audio/stream/qa-audio-1.mp3',
          title: 'חלק 1',
          mimeType: 'audio/mpeg',
          duration: 125,
          fileSize: 10,
          sortOrder: 0,
          downloadedAt: '2026-05-10T00:00:00.000Z',
        },
        ...(files > 1 ? [{
          offlineKey: 'qa-lesson:qa-audio-2',
          lessonId: 'qa-lesson',
          audioFileId: 'qa-audio-2',
          audioUrl: '/api/audio/stream/qa-audio-2.mp3',
          title: 'חלק 2',
          mimeType: 'audio/mpeg',
          duration: 100,
          fileSize: 10,
          sortOrder: 1,
          downloadedAt: '2026-05-10T00:00:00.000Z',
        }] : []),
      ],
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }, files);
}

test.describe('offline downloads', () => {
  test('offline page lists cached lessons and can start playback while offline', async ({ page, context }) => {
    await page.goto(`${BASE_URL}/he`);
    await seedOfflineLesson(page);

    await page.goto(`${BASE_URL}/he/offline`);
    await expect(page.getByText('שיעור בדיקה אופליין')).toBeVisible();
    await expect(page.getByText('2:05')).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText('לא מקוון')).toBeVisible();

    await page.evaluate(() => {
      const originalCreateObjectURL = URL.createObjectURL.bind(URL);
      window.__offlinePlaybackBlobUrls = [];
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        const url = originalCreateObjectURL(blob);
        window.__offlinePlaybackBlobUrls.push(url);
        return url;
      };
    });

    await page.getByRole('button', { name: 'נגן שיעור שמור' }).click();
    await expect(page.getByRole('button', { name: 'מתנגן כעת' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__offlinePlaybackBlobUrls?.some((url) => url.startsWith('blob:'))))
      .toBe(true);

    await context.setOffline(false);
  });

  test('older saved multipart lessons still offer the end-of-part timer', async ({ page }) => {
    await page.goto(`${BASE_URL}/he`);
    await seedOfflineLesson(page, 2);
    await page.goto(`${BASE_URL}/he/offline`);
    await page.getByRole('button', { name: he.offline.play }).click();
    await page.locator('header').getByRole('button', { name: 'מתנגן כעת' }).click();
    await page.getByRole('button', { name: he.player.sleepTimer, exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: he.player.sleepEndOfPart })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'הבא בתור (1)' }).click();
    await expect(page.getByRole('button', { name: /שיעור בדיקה אופליין.*חלק מהשיעור/ })).toBeVisible();
  });

  test('saving a lesson offline also permits a separate device-file download', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    const lessonHref = await page.locator('main a[href*="/lessons/"]').first().getAttribute('href');
    expect(lessonHref).toBeTruthy();
    await page.goto(`${BASE_URL}${lessonHref}`);
    const lessonTitle = await page.getByRole('heading', { level: 1 }).innerText();

    // Use tiny media bytes: exercise the real download-to-IndexedDB workflow without
    // transferring a full lesson from production storage.
    await page.route('**/api/audio/**', (route) =>
      route.fulfill({ status: 200, contentType: 'audio/ogg', body: 'OggS-test-audio' }),
    );

    const saveButton = page.getByRole('button', { name: he.player.saveOffline });
    await saveButton.click();
    await expect(page.getByRole('button', { name: he.player.savedOffline, exact: true })).toBeDisabled();

    const downloadLink = page.getByRole('link', { name: 'הורדת קובץ למכשיר' }).first();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    expect(download.suggestedFilename()).toMatch(/\.(mp3|m4a|aac|mp4|ogg|opus|wav|flac|webm)$/i);

    await page.goto(`${BASE_URL}/he/offline`);
    await expect(page.getByText(lessonTitle, { exact: true })).toBeVisible();
  });
});
