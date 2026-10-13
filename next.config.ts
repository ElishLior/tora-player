import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Unique per deploy; versions the service worker and its caches.
// Pinned into process.env before Next starts its build workers, so every
// bundle (client, server, /api/version) bakes the same id. Without this each
// worker could evaluate `Date.now()` on its own.
const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;
process.env.NEXT_PUBLIC_BUILD_ID = buildId;

// The release being built (package.json). Read here and baked in, so the app
// never imports package.json into the client bundle.
const appVersion = (JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as { version: string }).version;

const nextConfig: NextConfig = {
  // Phones and other computers on the home network open the dev server by its LAN address;
  // without these, Next blocks their /_next/* requests and the page never hydrates.
  allowedDevOrigins: ['127.0.0.1', 'localhost', '192.168.*.*', '10.*.*.*', '*.local'],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
    ],
  },
  async headers() {
    // Service worker scripts and the web manifest must always be revalidated so updates are seen.
    const serviceWorkers = ['/sw.js', '/sw-push.js', '/manifest.webmanifest'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-cache' }],
    }));
    // Preview and local deploys must never be indexed next to production.
    const noindex =
      process.env.VERCEL_ENV === 'production'
        ? []
        : [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }];
    return [...serviceWorkers, ...noindex];
  },
};

export default withNextIntl(nextConfig);
