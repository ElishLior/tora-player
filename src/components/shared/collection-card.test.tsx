import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardGrid } from './card-grid';
import { CollectionCard } from './collection-card';

vi.stubGlobal('React', React);

vi.mock('@/i18n/routing', async () => {
  const { createElement } = await vi.importActual<typeof import('react')>('react');
  return {
    Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) =>
      createElement('a', { href, ...rest }, children),
  };
});

describe('CollectionCard', () => {
  it('makes the title the stretched link and keeps the footer links outside it', () => {
    const html = renderToStaticMarkup(
      <CollectionCard
        href="/categories/c1"
        title="שיעורים"
        meta="12"
        footer={React.createElement('a', { href: '/categories/c2', className: 'relative z-10' }, 'תת־קטגוריה')}
      />,
    );
    expect(html).toContain('<article');
    expect(html).toContain('before:absolute before:inset-0');
    const titleAt = html.indexOf('href="/categories/c1"');
    const footerAt = html.indexOf('href="/categories/c2"');
    expect(titleAt).toBeGreaterThan(-1);
    // The title link closes before the footer link opens: siblings, never nested.
    expect(html.indexOf('</a>', titleAt)).toBeLessThan(footerAt);
    expect(html).toContain('relative z-10');
  });

  it('renders the cover and the count without a link of their own', () => {
    const html = renderToStaticMarkup(
      <CollectionCard href="/playlists/p1" title="רשימה" cover={<span className="cover-art" />} meta="3" />,
    );
    expect(html).toContain('cover-art');
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).toContain('3');
  });
});

describe('CardGrid', () => {
  it('uses one column on phones for rows and two for tiles, widening with the pane', () => {
    const rows = renderToStaticMarkup(
      <CardGrid variant="rows">
        <span />
      </CardGrid>,
    );
    const tiles = renderToStaticMarkup(
      <CardGrid variant="tiles">
        <span />
      </CardGrid>,
    );
    expect(rows).toContain('grid-cols-1');
    expect(rows).toContain('min-[1900px]:grid-cols-3');
    expect(tiles).toContain('grid-cols-2');
    expect(tiles).toContain('min-[1900px]:grid-cols-4');
  });

  it('stacks category cards in one column on phones and opens a second column from sm', () => {
    const cards = renderToStaticMarkup(
      <CardGrid variant="cards">
        <span />
      </CardGrid>,
    );
    expect(cards).toContain('grid-cols-1');
    expect(cards).toContain('sm:grid-cols-2');
  });

  it('keeps the count under the title, so a narrow tile keeps the title wide', () => {
    const html = renderToStaticMarkup(
      <CollectionCard href="/playlists/p1" title="רשימה" meta="3 שיעורים" description="תיאור" />,
    );
    expect(html.indexOf('3 שיעורים')).toBeGreaterThan(html.indexOf('</h2>'));
  });
});
