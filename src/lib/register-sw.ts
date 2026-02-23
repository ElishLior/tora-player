/**
 * Register the service worker for PWA functionality.
 * Call this on the client side after the page loads.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        // Check for updates periodically
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'activated' &&
                navigator.serviceWorker.controller
              ) {
                // New service worker activated, content is cached
                console.log('[SW] New content is available; please refresh.');
              }
            });
          }
        });

        console.log('[SW] Service worker registered successfully.');
      } catch (error) {
        console.error('[SW] Service worker registration failed:', error);
      }
    });
  }
}
