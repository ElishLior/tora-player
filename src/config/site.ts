import { routing } from '@/i18n/routing';

/*
 * Single source for the site's public identity: origin, name, tagline and the
 * URL builders every absolute link (metadata, sitemap, RSS, emails, push,
 * share links) goes through. A domain move is only the NEXT_PUBLIC_APP_URL
 * value; a rename is SITE_NAME here plus `common.appName` in messages/*.json.
 * Internal storage identifiers (`tora-player-*` IndexedDB/cache/persist keys,
 * the R2 bucket) are deliberately NOT derived from this.
 */

export type SiteLocale = (typeof routing.locales)[number];

export const DEFAULT_LOCALE: SiteLocale = routing.defaultLocale;

function resolveSiteUrl(): string {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || (vercelHost ? `https://${vercelHost}` : '');
  // localhost is a development fallback only; deploys set NEXT_PUBLIC_APP_URL
  // (Vercel also provides VERCEL_PROJECT_PRODUCTION_URL on the server).
  return (configured || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Canonical origin without a trailing slash, e.g. `https://example.com`. */
export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = { he: 'נגן תורה', en: 'Tora Player' } as const satisfies Record<SiteLocale, string>;

/** The teacher whose lessons the site publishes (podcast author, JSON-LD author). */
export const SITE_AUTHOR = 'הרב אליהו מציון בניהו בן יהוידע';

export const SITE_TAGLINE = {
  he: `שיעורי ${SITE_AUTHOR}`,
  en: 'Torah and Kabbalah lessons of Rabbi Eliyahu',
} as const satisfies Record<SiteLocale, string>;

export const SITE_DESCRIPTION = {
  he: `${SITE_TAGLINE.he} — להאזנה, להורדה ולהאזנה לא מקוונת`,
  en: 'Torah and Kabbalah lessons to stream, download and listen to offline',
} as const satisfies Record<SiteLocale, string>;

/** Open Graph locale per UI locale. */
export const OG_LOCALE = { he: 'he_IL', en: 'en_US' } as const satisfies Record<SiteLocale, string>;

export const FEED_PATH = '/feed.xml';

/** Square podcast artwork (1400×1400 JPEG, built by scripts/generate-icons.mjs). */
export const PODCAST_COVER_PATH = '/brand/podcast-cover.jpg';

export function isSiteLocale(value: string): value is SiteLocale {
  return (routing.locales as readonly string[]).includes(value);
}

/** Localized path for a locale-less pathname: `('/lessons')` → `/he/lessons`, `('/')` → `/he`. */
export function localePath(pathname: string, locale: SiteLocale = DEFAULT_LOCALE): string {
  return pathname === '/' || pathname === '' ? `/${locale}` : `/${locale}${pathname}`;
}

/** Absolute URL for a site path (already localized, or a non-page path like `/feed.xml`). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute URL of a page given its locale-less pathname. */
export function pageUrl(pathname: string, locale: SiteLocale = DEFAULT_LOCALE): string {
  return absoluteUrl(localePath(pathname, locale));
}

/** Locale-less lesson pathname (pass to the i18n `Link` or `localePath`). */
export function lessonPath(lessonId: string): string {
  return `/lessons/${encodeURIComponent(lessonId)}`;
}

export function lessonUrl(lessonId: string, locale: SiteLocale = DEFAULT_LOCALE): string {
  return pageUrl(lessonPath(lessonId), locale);
}

export function seriesPath(seriesId: string): string {
  return `/series/${encodeURIComponent(seriesId)}`;
}

export function categoryPath(categoryId: string): string {
  return `/categories/${encodeURIComponent(categoryId)}`;
}

export function playlistPath(playlistId: string): string {
  return `/playlists/${encodeURIComponent(playlistId)}`;
}

/** Per-series podcast feed (the site-wide feed is FEED_PATH). */
export function seriesFeedPath(seriesId: string): string {
  return `/series/${encodeURIComponent(seriesId)}/feed.xml`;
}
