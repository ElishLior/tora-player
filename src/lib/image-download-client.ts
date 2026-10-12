'use client';

/**
 * Starting a lesson image download from the browser. The effects are injected
 * so the decision logic runs under the node test environment; the default
 * `browserImageDownloadEnv` is the real DOM.
 *
 * - Desktop, Android and Safari tabs: a HEAD preflight (no redirect followed)
 *   checks that the route will serve the file, then a hidden anchor with the
 *   `download` attribute starts the attachment. A failed preflight throws, so
 *   the page never navigates away (that would stop playback).
 * - iOS home-screen apps can't save attachment downloads: the link opens in a
 *   Safari view, which can save or share it. The window opens synchronously,
 *   before any await, because a spent user gesture blocks window.open.
 */

export interface ImageDownloadEnv {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  openWindow: (url: string) => void;
  startDownload: (url: string) => void;
}

export type ImageDownloadResult = 'started' | 'opened';

export class ImageDownloadError extends Error {
  constructor() {
    super('Image download could not be prepared');
  }
}

export const browserImageDownloadEnv: ImageDownloadEnv = {
  fetch: (url, init) => fetch(url, init),
  openWindow: (url) => {
    window.open(url, '_blank', 'noopener');
  },
  startDownload: (url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = '';
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
  },
};

export async function downloadLessonImage(
  url: string,
  { homeScreenApp }: { homeScreenApp: boolean },
  env: ImageDownloadEnv = browserImageDownloadEnv,
): Promise<ImageDownloadResult> {
  if (homeScreenApp) {
    env.openWindow(url);
    return 'opened';
  }

  // redirect: 'manual' keeps the R2 hop out of the check: a served image is an
  // opaque redirect (readable status 0), and an error is a readable 4xx/5xx.
  const response = await env.fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store' });
  if (response.type !== 'opaqueredirect' && !response.ok) throw new ImageDownloadError();

  env.startDownload(url);
  return 'started';
}
