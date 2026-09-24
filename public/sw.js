// Tora Player service worker.
//
// The page registers `/sw.js?v=<build id>`. A new deploy changes the script
// URL, so the browser installs a fresh worker whose caches are keyed by that
// build id; activation deletes every cache from older builds.
importScripts('/sw-push.js');

const BUILD_ID = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_PREFIX = 'tora-player-';
const STATIC_CACHE = `${CACHE_PREFIX}${BUILD_ID}-static`;
const PAGES_CACHE = `${CACHE_PREFIX}${BUILD_ID}-pages`;
const SHARE_TARGET_CACHE = 'share-target-v1';

const DEFAULT_LOCALE = 'he';
const LOCALES = ['he', 'en'];
const offlinePath = (locale) => `/${locale}/offline`;

// Pages that must never be stored: sign-in, admin screens and the upload flow.
const UNCACHEABLE_PAGE_PREFIXES = LOCALES.flatMap((locale) => [
  `/${locale}/auth`,
  `/${locale}/admin`,
  `/${locale}/lessons/upload`,
]);

// Matches hashed Next.js assets referenced from HTML, including the chunk
// paths embedded in the RSC flight payload ("static/chunks/...js"). Only real
// files (with an extension) match, never bare directory prefixes.
const NEXT_ASSET_PATTERN =
  /(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)<>?]+\.(?:js|css|woff2?|ttf|otf)(?:\?[^"'\\\s)<>]*)?/g;

function extractNextAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(NEXT_ASSET_PATTERN)) {
    const path = match[0].startsWith('/_next/') ? match[0] : `/_next/${match[0]}`;
    assets.add(path);
  }
  return [...assets];
}

// Cache an offline library page together with every JS/CSS chunk it needs to
// hydrate, so it works with no network at all.
async function precacheOfflineShell(locale) {
  const pages = await caches.open(PAGES_CACHE);
  const response = await fetch(offlinePath(locale), { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Offline shell ${locale} returned ${response.status}`);

  const html = await response.clone().text();
  const staticCache = await caches.open(STATIC_CACHE);
  await staticCache.addAll(['/manifest.json', ...extractNextAssets(html)]);
  await pages.put(offlinePath(locale), response);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // The default locale's shell is required: if it can't be cached the
      // install fails and the previous worker keeps serving.
      await precacheOfflineShell(DEFAULT_LOCALE);
      await Promise.allSettled(
        LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(precacheOfflineShell),
      );
      // Activate right away. Open pages keep running their already-loaded
      // code; the next full navigation picks up the new build. The page never
      // force-reloads, so playback is not interrupted.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE && name !== PAGES_CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

// Sent by the sign-out flow: drop every stored page (they may contain the
// previous account's data), then re-fetch the offline shell as the signed-out
// user so offline fallback keeps working. Static assets stay cached.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_USER_CACHES') return;
  event.waitUntil(
    (async () => {
      await caches.delete(PAGES_CACHE);
      await Promise.allSettled(LOCALES.map(precacheOfflineShell));
    })(),
  );
});

function isPublicStaticFile(url) {
  return (
    url.pathname === '/manifest.json' ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:png|jpe?g|svg|ico|webp|woff2?|ttf|otf)$/i.test(url.pathname)
  );
}

function localeOf(url) {
  const segment = url.pathname.split('/')[1];
  return LOCALES.includes(segment) ? segment : DEFAULT_LOCALE;
}

// A page response may be stored only when it is public: Next.js marks
// dynamic / per-user renders `private, no-store`.
function isCacheablePage(url, response) {
  if (response.status !== 200 || response.type !== 'basic' || response.redirected) return false;
  if (UNCACHEABLE_PAGE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return false;
  const cacheControl = response.headers.get('Cache-Control') || '';
  return !/no-store|private/i.test(cacheControl);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Share target POSTs from other apps (WhatsApp etc.).
  if (request.method === 'POST' && url.origin === self.location.origin && url.pathname.includes('/share-target')) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  if (request.method !== 'GET') return;
  // Cross-origin (Supabase, R2, ...) is never intercepted or cached.
  if (url.origin !== self.location.origin) return;
  // In local development the worker stays out of the way.
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
  // API routes (audio/image streams with Range, auth, data) go straight to the network.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (isPublicStaticFile(url)) {
    event.respondWith(staleWhileRevalidate(event));
  }
  // Everything else (RSC payloads, /_next/image, ...) uses the network only.
});

async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);

  try {
    const response = await fetch(request);
    if (isCacheablePage(url, response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES_CACHE).then((cache) => cache.put(request, copy)));
    }
    return response;
  } catch {
    const pages = await caches.open(PAGES_CACHE);
    const cached = await pages.match(request, { ignoreVary: true });
    if (cached) return cached;

    const fallbackPath = offlinePath(localeOf(url));
    if (url.pathname !== fallbackPath && (await pages.match(fallbackPath))) {
      // Redirect so the offline library renders at its own URL and the router
      // state matches the HTML.
      return Response.redirect(fallbackPath, 302);
    }

    const shell = await pages.match(fallbackPath);
    if (shell) return shell;

    return new Response('אין חיבור לרשת', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.status === 200) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request).then(async (response) => {
    if (response.status === 200) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(network.catch(() => undefined));
    return cached;
  }
  return network;
}

// Handle share target POST: stash the form data and redirect to the share-target page.
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const cache = await caches.open(SHARE_TARGET_CACHE);

    const body = new FormData();
    for (const [key, value] of formData.entries()) {
      body.append(key, value);
    }
    await cache.put('/share-target-data', new Response(body));

    const params = new URLSearchParams();
    for (const key of ['title', 'text', 'url']) {
      const value = formData.get(key);
      if (value) params.set(key, value);
    }

    const query = params.toString();
    return Response.redirect(`/he/lessons/share-target${query ? `?${query}` : ''}`, 303);
  } catch (err) {
    console.error('[SW] Share target error:', err);
    return Response.redirect('/he/lessons/upload', 303);
  }
}
