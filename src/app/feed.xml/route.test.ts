import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://torah.example/';
});

vi.mock('@/lib/supabase/anon', () => ({
  createAnonSupabaseClient: vi.fn(),
}));

// Run the real feed builder; Next's cache requires a request runtime absent in Vitest.
vi.mock('next/cache', () => ({ unstable_cache: (fn: () => Promise<unknown>) => fn }));

// The real module also builds next-intl navigation, which needs the Next.js runtime.
vi.mock('@/i18n/routing', () => ({ routing: { locales: ['he', 'en'], defaultLocale: 'he' } }));

import { createAnonSupabaseClient } from '@/lib/supabase/anon';
import { GET } from './route';

type Result = { data: unknown; error: unknown };

/** Minimal PostgREST builder with the same page boundaries as the public API. */
function fakeSupabase(results: Record<string, Result>) {
  return {
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      let start = 0;
      let end = Number.POSITIVE_INFINITY;
      const builder: Record<string, unknown> = {
        then: (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({
            ...result,
            data: Array.isArray(result.data) ? result.data.slice(start, end + 1) : result.data,
          }).then(resolve, reject),
        range: (from: number, to: number) => {
          start = from;
          end = to;
          return builder;
        },
        limit: (count: number) => {
          end = Math.min(end, start + count - 1);
          return builder;
        },
      };
      for (const method of ['select', 'eq', 'or', 'order']) builder[method] = () => builder;
      return builder;
    },
  };
}

const audio = (id: string, sortOrder: number, extra: Record<string, unknown> = {}) => ({
  id,
  lesson_id: 'lesson-1',
  file_key: `audio/lesson-1/${id}.opus`,
  audio_url: `/api/audio/stream/${encodeURIComponent(`audio/lesson-1/${id}.opus`)}`,
  original_name: null,
  audio_type: null,
  duration: 3600.4,
  file_size: 1234567,
  sort_order: sortOrder,
  ...extra,
});

const lessons = [
  {
    id: 'lesson-1',
    title: 'Fallback title',
    hebrew_title: 'שיעור <b>"א" & \'ב\'</b>\u0007',
    description: null,
    summary: null,
    date: '2026-09-22',
    hebrew_date: 'י״א תשרי תשפ״ז',
    parsha: null,
    duration: 7200,
    series: null,
    audio_files: [
      audio('part-b', 1, { audio_type: 'עץ חיים', duration: 1047 }),
      audio('part-a', 0, { audio_type: 'סידור' }),
      audio('external', 2, { audio_url: 'https://example.com/podcast.mp3' }),
    ],
  },
  {
    id: 'lesson-2',
    title: 'Single part',
    hebrew_title: null,
    description: 'תיאור קצר',
    summary: null,
    date: '2026-09-18',
    hebrew_date: null,
    parsha: null,
    duration: 60,
    series: null,
    audio_files: [audio('only', 0, { file_key: 'audio/lesson-2/only.mp3', audio_url: '/api/audio/stream/audio%2Flesson-2%2Fonly.mp3' })],
  },
];

async function feedXml() {
  const response = await GET();
  expect(response.headers.get('Content-Type')).toBe('application/rss+xml; charset=utf-8');
  return response.text();
}

describe('GET /feed.xml', () => {
  beforeEach(() => {
    vi.mocked(createAnonSupabaseClient).mockReturnValue(
      fakeSupabase({
        categories: { data: [{ id: 'short-topic' }], error: null },
        lessons: { data: lessons, error: null },
      }) as unknown as SupabaseClient,
    );
  });

  it('renders a podcast channel with iTunes tags on the canonical origin', async () => {
    const xml = await feedXml();

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"')).toBe(true);
    expect(xml).toContain('<title>נגן תורה</title>');
    expect(xml).toContain('<link>https://torah.example/he</link>');
    expect(xml).toContain('<atom:link href="https://torah.example/feed.xml" rel="self" type="application/rss+xml"/>');
    expect(xml).toContain('<language>he</language>');
    expect(xml).toContain('<itunes:image href="https://torah.example/brand/podcast-cover.jpg"/>');
    expect(xml).toContain('<itunes:category text="Religion &amp; Spirituality"><itunes:category text="Judaism"/></itunes:category>');
    expect(xml).toContain('<itunes:explicit>false</itunes:explicit>');
    expect(xml.trimEnd().endsWith('</channel>\n</rss>')).toBe(true);
  });

  it('emits one episode per stored audio part, in play order, with stable GUIDs and enclosures', async () => {
    const xml = await feedXml();
    const items = xml.match(/<item>.*?<\/item>/g) ?? [];

    // lesson-1: part-a, part-b (the external file has no stable public URL); lesson-2: one part.
    expect(items.map((item) => item.match(/<guid isPermaLink="false">(.*?)<\/guid>/)?.[1])).toEqual(['part-a', 'part-b', 'only']);

    const [first, second, single] = items;
    expect(first).toContain(' · חלק 1 (סידור)</title>');
    expect(second).toContain(' · חלק 2 (עץ חיים)</title>');
    expect(first).toContain(
      '<enclosure url="https://torah.example/api/audio/download/audio%2Flesson-1%2Fpart-a.opus?disposition=inline" length="1234567" type="audio/ogg"/>',
    );
    expect(first).toContain('<itunes:duration>3600</itunes:duration>');
    expect(first).toContain('<link>https://torah.example/he/lessons/lesson-1</link>');
    expect(first).toContain('<pubDate>Tue, 22 Sep 2026 00:00:00 GMT</pubDate>');
    expect(second).toContain('<pubDate>Tue, 22 Sep 2026 00:01:00 GMT</pubDate>');

    expect(single).toContain('<title>Single part</title>');
    expect(single).toContain('<description>תיאור קצר</description>');
    expect(single).toContain('type="audio/mpeg"');
  });

  it('keeps older published lessons after the first feed page', async () => {
    const manyLessons = Array.from({ length: 225 }, (_, index) => ({
      ...lessons[1],
      id: `lesson-${index}`,
      title: `Lesson ${index}`,
      audio_files: [audio(`part-${index}`, 0)],
    }));
    vi.mocked(createAnonSupabaseClient).mockReturnValue(
      fakeSupabase({
        categories: { data: [], error: null },
        lessons: { data: manyLessons, error: null },
      }) as unknown as SupabaseClient,
    );

    const xml = await feedXml();
    expect(xml.match(/<item>/g)).toHaveLength(225);
    expect(xml).toContain('<guid isPermaLink="false">part-224</guid>');
  });

  it('publishes the legacy audio of a lesson without part rows', async () => {
    vi.mocked(createAnonSupabaseClient).mockReturnValue(
      fakeSupabase({
        categories: { data: [], error: null },
        lessons: {
          data: [{
            ...lessons[1],
            id: 'legacy-lesson',
            title: 'Legacy lesson',
            audio_url: '/api/audio/stream/audio%2Flegacy%2Frecording.mp3',
            file_size: 321,
            audio_files: [],
          }],
          error: null,
        },
      }) as unknown as SupabaseClient,
    );

    const xml = await feedXml();
    expect(xml).toContain('<guid isPermaLink="false">legacy-lesson</guid>');
    expect(xml).toContain(
      '<enclosure url="https://torah.example/api/audio/download/audio%2Flegacy%2Frecording.mp3?disposition=inline" length="321" type="audio/mpeg"/>',
    );
  });

  it('escapes markup and drops characters XML forbids', async () => {
    const xml = await feedXml();

    expect(xml).toContain('<title>שיעור &lt;b&gt;&quot;א&quot; &amp; &apos;ב&apos;&lt;/b&gt; · חלק 1 (סידור)</title>');
    expect(xml).not.toContain('<b>');
    expect(xml).not.toContain('\u0007');
  });

  it('fails instead of publishing an empty feed when the database errors at runtime', async () => {
    vi.mocked(createAnonSupabaseClient).mockReturnValue(
      fakeSupabase({
        categories: { data: [], error: null },
        lessons: { data: null, error: { message: 'connection refused' } },
      }) as unknown as SupabaseClient,
    );

    await expect(GET()).rejects.toMatchObject({ message: 'connection refused' });
  });
});
