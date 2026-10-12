import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '../../../messages/he.json';
import type { LessonWithRelations } from '@/types/database';
import { LessonCard } from './lesson-card';

// Vitest compiles JSX with the classic runtime here, so components need React in scope.
vi.stubGlobal('React', React);

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string | number>) => {
    const messages = he as unknown as Record<string, Record<string, string>>;
    const template = String(messages[namespace]?.[key] ?? key);
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ''));
  },
}));

vi.mock('@/i18n/routing', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) =>
      createElement('a', { href, ...rest }, children),
    useRouter: () => ({ push: () => {} }),
  };
});

vi.mock('@/hooks/use-offline', () => ({ useIsDownloaded: () => false }));

const lesson = {
  id: 'lesson-1',
  slug: 'yom-sheni-12-10-2026',
  title: 'Monday',
  hebrew_title: 'יום שני - א׳ חשון',
  date: '2026-10-12',
  hebrew_date: null,
  parsha: null,
  tags: ['עץ חיים'],
  part_number: null,
  category: null,
  created_at: '2026-10-12T00:00:00Z',
  audio_files: [
    {
      id: 'a1',
      file_key: 'audio/a1.opus',
      audio_url: '',
      original_name: 'one.opus',
      audio_type: 'סידור',
      duration: 4920,
      sort_order: 0,
    },
    {
      id: 'a2',
      file_key: 'audio/a2.opus',
      audio_url: '',
      original_name: 'two.opus',
      audio_type: 'סידור',
      duration: 4200,
      sort_order: 1,
    },
  ],
} as unknown as LessonWithRelations;

describe('LessonCard (the shared lesson row)', () => {
  it('links the title and the date tile as siblings, not nested', () => {
    const html = renderToStaticMarkup(<LessonCard lesson={lesson} />);
    expect(html).toContain('<article');
    expect(html).toContain('data-lesson-date="2026-10-12"');
    expect(html).toContain('יום שני - א׳ חשון');
    // The date link closes before the title link opens: siblings, not nested.
    const dateLinkEnd = html.indexOf('</a>', html.indexOf('data-lesson-date'));
    expect(dateLinkEnd).toBeGreaterThan(-1);
    expect(html.indexOf('href="/lessons/yom-sheni-12-10-2026"')).toBeGreaterThan(dateLinkEnd);
  });

  it('shows each part with its own length and never the combined total', () => {
    const html = renderToStaticMarkup(<LessonCard lesson={lesson} />);
    expect(html).toContain('חלק 1');
    expect(html).toContain('82');
    expect(html).toContain('70');
    expect(html).not.toContain('152');
  });

  it('is a plain toggle in bulk-select mode: no links, no play button, no date link', () => {
    const html = renderToStaticMarkup(<LessonCard lesson={lesson} selectable selected />);
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('data-lesson-date');
    expect(html).toContain('יום שני - א׳ חשון');
  });
});
