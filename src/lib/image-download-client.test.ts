import { describe, expect, it, vi } from 'vitest';
import { downloadLessonImage, ImageDownloadError, type ImageDownloadEnv } from './image-download-client';

const URL_PATH = '/api/images/download/9d1f3c2a-6b7e-4a8d-9c1e-2f3a4b5c6d7e';

function env(overrides: Partial<ImageDownloadEnv> = {}) {
  const fake = {
    fetch: vi.fn(async () => new Response(null, { status: 404 })),
    openWindow: vi.fn(),
    startDownload: vi.fn(),
    ...overrides,
  };
  return fake;
}

function opaqueRedirect(): Response {
  // A real opaque redirect cannot be built in node; the check only reads `type`.
  return { type: 'opaqueredirect', ok: false, status: 0 } as unknown as Response;
}

describe('downloadLessonImage', () => {
  it('preflights with a HEAD that does not follow the redirect, then starts the attachment', async () => {
    const fake = env({ fetch: vi.fn(async () => opaqueRedirect()) });

    const result = await downloadLessonImage(URL_PATH, { homeScreenApp: false }, fake);

    expect(result).toBe('started');
    expect(fake.fetch).toHaveBeenCalledWith(URL_PATH, expect.objectContaining({ method: 'HEAD', redirect: 'manual' }));
    expect(fake.startDownload).toHaveBeenCalledExactlyOnceWith(URL_PATH);
    expect(fake.openWindow).not.toHaveBeenCalled();
  });

  it('throws and starts nothing when the route answers with an error', async () => {
    const fake = env();

    await expect(downloadLessonImage(URL_PATH, { homeScreenApp: false }, fake)).rejects.toBeInstanceOf(
      ImageDownloadError,
    );
    expect(fake.startDownload).not.toHaveBeenCalled();
    expect(fake.openWindow).not.toHaveBeenCalled();
  });

  it('throws when the preflight itself fails (offline)', async () => {
    const fake = env({ fetch: vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))) });

    await expect(downloadLessonImage(URL_PATH, { homeScreenApp: false }, fake)).rejects.toThrow();
    expect(fake.startDownload).not.toHaveBeenCalled();
  });

  it('opens the link in a Safari view on an iOS home-screen app, without any await first', () => {
    const fake = env();

    // No await: the call must reach window.open synchronously, inside the tap.
    const pending = downloadLessonImage(URL_PATH, { homeScreenApp: true }, fake);

    expect(fake.openWindow).toHaveBeenCalledExactlyOnceWith(URL_PATH);
    expect(fake.fetch).not.toHaveBeenCalled();
    expect(fake.startDownload).not.toHaveBeenCalled();
    return expect(pending).resolves.toBe('opened');
  });
});
