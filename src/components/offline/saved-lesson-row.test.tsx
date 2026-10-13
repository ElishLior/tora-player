import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '../../../messages/he.json';
import type { OfflineLessonMeta } from '@/lib/offline-storage';
import { SavedLessonRow } from './saved-lesson-row';

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
  };
});

vi.mock('@/lib/offline-storage', () => ({ deleteDownloadedLesson: vi.fn() }));

const saved: OfflineLessonMeta = {
  lessonId: 'lesson-1',
  title: 'Offline lesson',
  hebrewTitle: 'שיעור בדיקה אופליין',
  audioUrl: '',
  duration: 125,
  fileSize: 2048,
  downloadedAt: '2026-10-12T00:00:00Z',
  date: '2026-10-12',
  audioFiles: [
    {
      offlineKey: 'k1',
      lessonId: 'lesson-1',
      audioUrl: '',
      mimeType: 'audio/ogg',
      duration: 60,
      fileSize: 1024,
      sortOrder: 0,
      title: 'one',
      downloadedAt: '2026-10-12T00:00:00Z',
    },
    {
      offlineKey: 'k2',
      lessonId: 'lesson-1',
      audioUrl: '',
      mimeType: 'audio/ogg',
      duration: 65,
      fileSize: 1024,
      sortOrder: 1,
      title: 'two',
      downloadedAt: '2026-10-12T00:00:00Z',
    },
  ],
};

describe('SavedLessonRow (a lesson saved on this device)', () => {
  it('shows the title, the real duration and the size, as the shared row', () => {
    const html = renderToStaticMarkup(<SavedLessonRow lesson={saved} />);
    expect(html).toContain('<article');
    expect(html).toContain('שיעור בדיקה אופליין');
    expect(html).toContain('2:05');
    expect(html).toContain('href="/lessons/lesson-1"');
  });

  it('keeps the play and remove labels the offline list is found by', () => {
    const html = renderToStaticMarkup(<SavedLessonRow lesson={saved} />);
    expect(html).toContain('aria-label="נגן שיעור שמור"');
    expect(html).toContain('aria-label="הסר הורדה"');
  });

  it('lists each saved file of a multi-part lesson as its own play control', () => {
    const html = renderToStaticMarkup(<SavedLessonRow lesson={saved} />);
    expect(html.split('aria-label="נגן קובץ שמור"').length - 1).toBe(2);
  });

  it('has no interactive element inside another one', () => {
    const html = renderToStaticMarkup(<SavedLessonRow lesson={saved} />);
    // Nothing opens a button or link while another one is still open.
    const tags = [...html.matchAll(/<(\/?)(a|button)\b[^>]*>/g)];
    let depth = 0;
    for (const [, closing] of tags) {
      depth += closing ? -1 : 1;
      expect(depth).toBeLessThanOrEqual(1);
    }
  });
});
