import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/config/site';

/** Personal, admin and device-only pages: never crawled (they also send noindex, see their layouts). */
const PRIVATE_PATHS = ['/admin', '/auth', '/me', '/bookmarks', '/offline', '/driving', '/lessons/upload', '/lessons/*/edit'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', ...routing.locales.flatMap((locale) => PRIVATE_PATHS.map((path) => `/${locale}${path}`))],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
