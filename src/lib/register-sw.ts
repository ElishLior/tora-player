/**
 * Service worker script URL for this build. Each deploy gets a distinct URL,
 * which makes the browser install a fresh worker (and fresh caches) instead of
 * keeping the previous deploy's precache forever.
 */
export function getServiceWorkerUrl(buildId: string | undefined = process.env.NEXT_PUBLIC_BUILD_ID): string {
  return `/sw.js?v=${encodeURIComponent(buildId || 'dev')}`;
}

async function register(): Promise<void> {
  try {
    await navigator.serviceWorker.register(getServiceWorkerUrl(), { scope: '/' });
  } catch (error) {
    console.error('[SW] Service worker registration failed:', error);
  }
}

/**
 * Register the service worker. Safe to call from a React effect: if the
 * window `load` event already fired, registration happens immediately.
 *
 * A new worker activates on its own (skipWaiting + clients.claim). The page is
 * never force-reloaded, so audio playback continues; the next full navigation
 * loads the new build.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  if (document.readyState === 'complete') {
    void register();
  } else {
    window.addEventListener('load', () => void register(), { once: true });
  }
}
