import { expect, test } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';

declare global {
  interface Window {
    __offlinePlaybackBlobUrls: string[];
  }
}

async function seedOfflineLesson(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
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
    tx.objectStore('lesson-meta').put({
      lessonId: 'qa-lesson',
      title: 'Offline QA Lesson',
      hebrewTitle: 'שיעור בדיקה אופליין',
      audioUrl: '/api/audio/stream/qa-audio-1.mp3',
      duration: 125,
      fileSize: 10,
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
      ],
    });

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
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

    await page.getByRole('button', { name: 'נגן שיעור שהורד' }).click();
    await expect(page.getByRole('button', { name: 'מתנגן כעת' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.__offlinePlaybackBlobUrls?.some((url) => url.startsWith('blob:'))))
      .toBe(true);

    await context.setOffline(false);
  });

  test('lesson detail exposes separate offline-save and local file download controls', async ({ page }) => {
    await page.goto(`${BASE_URL}/he/lessons`);
    const lessonHref = await page.locator('a[href*="/lessons/"]').first().getAttribute('href');
    expect(lessonHref).toBeTruthy();
    await page.goto(`${BASE_URL}${lessonHref}`);

    await expect(page.getByRole('button', { name: 'שמור להאזנה לא מקוונת' })).toBeVisible();

    const downloadLink = page.getByRole('link', { name: 'הורדת קובץ למכשיר' }).first();
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.getAttribute('href');
    expect(href).toContain('download=1');
    expect(href).toContain('filename=');

    await page.route('**/api/audio/stream/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('download') !== '1') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': 'attachment; filename="qa-download.mp3"',
        },
        body: 'fake-audio',
      });
    });

    const download = await Promise.all([
      page.waitForEvent('download'),
      downloadLink.click(),
    ]).then(([download]) => download);

    expect(download.suggestedFilename()).toMatch(/\.(mp3|m4a|aac|mp4|ogg|opus|wav|flac|webm)$/i);
  });
});
