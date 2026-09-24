import type { MetadataRoute } from 'next';
import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE, SITE_NAME, SITE_TAGLINE, localePath } from '@/config/site';

const SHORTCUT_ICONS = [{ src: '/icons/icon-192.png', sizes: '192x192' }];

/**
 * Served at /manifest.webmanifest (Next links it from every page). `id` stays
 * the default-locale start URL: installs made from the old static manifest were
 * identified by that start_url, so they keep updating instead of duplicating.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const common = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'common' });
  const nav = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'nav' });
  const home = localePath('/');

  return {
    id: home,
    name: SITE_NAME[DEFAULT_LOCALE],
    short_name: SITE_NAME[DEFAULT_LOCALE],
    description: SITE_TAGLINE[DEFAULT_LOCALE],
    start_url: home,
    scope: '/',
    display: 'standalone',
    dir: 'rtl',
    lang: DEFAULT_LOCALE,
    theme_color: '#121212',
    background_color: '#121212',
    orientation: 'portrait-primary',
    categories: ['education', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Android share sheet → public/sw.js stashes the files → upload page (see shared-files.ts).
    share_target: {
      action: localePath('/lessons/share-target'),
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'files',
            accept: [
              'audio/*',
              'image/*',
              '.opus',
              '.ogg',
              '.oga',
              '.mp3',
              '.m4a',
              '.aac',
              '.wav',
              '.jpg',
              '.jpeg',
              '.png',
              '.webp',
              '.heic',
              '.heif',
            ],
          },
        ],
      },
    },
    shortcuts: [
      { name: common('home'), short_name: nav('home'), url: home, icons: SHORTCUT_ICONS },
      { name: common('lessons'), short_name: nav('lessons'), url: localePath('/lessons'), icons: SHORTCUT_ICONS },
      { name: common('playlists'), short_name: nav('playlists'), url: localePath('/playlists'), icons: SHORTCUT_ICONS },
    ],
  };
}
