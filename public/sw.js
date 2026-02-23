// Tora Player Service Worker
const CACHE_VERSION = 'tora-player-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// App shell resources to precache
const APP_SHELL = [
  '/',
  '/he',
  '/en',
  '/offline',
  '/manifest.json',
];

// Static asset extensions
const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff', '.woff2', '.ttf', '.otf',
  '.png', '.jpg', '.jpeg', '.svg', '.ico', '.webp',
];

// Install event - precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Failed to precache some resources:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('tora-player-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Helper: is this a static asset request?
function isStaticAsset(url) {
  return STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext)) ||
    url.pathname.startsWith('/_next/static/');
}

// Helper: is this an API request?
function isApiRequest(url) {
  return url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase');
}

// Helper: is this a page navigation?
function isPageRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept')?.includes('text/html'));
}

// Fetch event - routing strategies
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Handle share target POST requests (from WhatsApp/other apps)
  if (event.request.method === 'POST' && url.pathname.includes('/share-target')) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!url.protocol.startsWith('http')) return;

  // Strategy 1: Network-first for API calls
  if (isApiRequest(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // Strategy 2: Cache-first for static assets
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Strategy 3: Stale-while-revalidate for page navigations
  if (isPageRequest(event.request)) {
    event.respondWith(staleWhileRevalidate(event.request, DYNAMIC_CACHE));
    return;
  }

  // Default: network-first
  event.respondWith(networkFirst(event.request, DYNAMIC_CACHE));
});

// Network-first strategy
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Return offline fallback for page requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline');
      if (offlinePage) return offlinePage;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Cache-first strategy
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Handle share target POST - cache the form data and redirect to share-target page
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();

    // Store the shared data in a temporary cache for the page to read
    const cache = await caches.open('share-target-v1');

    // Create a synthetic Response with the form data
    const headers = new Headers();
    headers.set('Content-Type', request.headers.get('Content-Type') || 'multipart/form-data');

    // Re-create FormData as a Response that can be cached
    const body = new FormData();
    for (const [key, value] of formData.entries()) {
      body.append(key, value);
    }

    await cache.put('/share-target-data', new Response(body));

    // Build redirect URL with text params as fallback
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const url = formData.get('url') || '';
    const params = new URLSearchParams();
    if (title) params.set('title', title);
    if (text) params.set('text', text);
    if (url) params.set('url', url);

    const redirectUrl = `/he/lessons/share-target${params.toString() ? '?' + params.toString() : ''}`;

    return Response.redirect(redirectUrl, 303);
  } catch (err) {
    console.error('[SW] Share target error:', err);
    return Response.redirect('/he/lessons/upload', 303);
  }
}

// Stale-while-revalidate strategy
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {
      // If fetch fails and we have no cache, try offline page
      if (!cached) {
        return caches.match('/offline') || new Response('Offline', { status: 503 });
      }
      return cached;
    });

  // Return cached version immediately if available, otherwise wait for network
  return cached || fetchPromise;
}
