import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CategoryWithChildren } from '@/types/database';
import { CategoryTiles } from './category-tiles';

vi.stubGlobal('React', React);

vi.mock('@/i18n/routing', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) =>
      createElement('a', { href, ...rest }, children),
  };
});

function category(id: string, name: string, icon: string | null, children: CategoryWithChildren[] = []) {
  return {
    id,
    name,
    hebrew_name: name,
    description: null,
    icon,
    parent_id: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    children,
  } as unknown as CategoryWithChildren;
}

const tree: CategoryWithChildren[] = [
  category('top', 'שיעורים', 'BookOpen', [category('sub', 'מתחילת עץ חיים', null)]),
  category('empty', 'כח המדמה', null),
];
const counts = { sub: 191 };

describe('CategoryTiles', () => {
  const html = renderToStaticMarkup(
    <CategoryTiles nodes={tree} tree={tree} counts={counts} locale="he" emptyLabel="ריק" leading="dot" />,
  );

  it('shows each category with its branch count, and "empty" where a branch has no lessons', () => {
    expect(html).toContain('191');
    expect(html).toContain('ריק');
  });

  it('lists the subcategories inside their tile, after the tile link (never nested)', () => {
    const titleAt = html.indexOf('href="/categories/top"');
    const subAt = html.indexOf('href="/categories/sub"');
    expect(titleAt).toBeGreaterThan(-1);
    expect(subAt).toBeGreaterThan(titleAt);
    expect(html.indexOf('</a>', titleAt)).toBeLessThan(subAt);
  });

  it('colours a top-level tile by its icon', () => {
    expect(html).toContain('bg-primary');
  });
});
