import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Unique per deploy; versions the service worker and its caches.
const buildId =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `local-${Date.now()}`;

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
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
    // Service worker scripts must always be revalidated so updates are seen.
    return ['/sw.js', '/sw-push.js'].map((source) => ({
      source,
      headers: [{ key: 'Cache-Control', value: 'no-cache' }],
    }));
  },
};

export default withNextIntl(nextConfig);
