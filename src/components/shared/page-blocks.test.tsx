import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Hash } from 'lucide-react';
import { CollectionHeader } from './collection-header';
import { PageHeader } from './page-header';
import { SearchField } from './search-field';

vi.stubGlobal('React', React);

describe('PageHeader', () => {
  it('renders one h1 with its icon, the subtitle and the actions', () => {
    const html = renderToStaticMarkup(
      <PageHeader icon={Hash} title="תגיות" subtitle="נושאים" actions={<button type="button">הכל</button>} />,
    );
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html).toContain('תגיות');
    expect(html).toContain('נושאים');
    expect(html).toContain('<button');
  });

  it('leaves out the actions wrapper when there are none (a false action renders nothing)', () => {
    const html = renderToStaticMarkup(<PageHeader title="x" actions={false} />);
    expect(html).not.toContain('<button');
    expect(html.match(/flex flex-wrap items-center gap-2/g)).toBeNull();
  });
});

describe('SearchField', () => {
  it('names the field after its placeholder when no label is given', () => {
    const html = renderToStaticMarkup(<SearchField placeholder="חיפוש שיעורים..." />);
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-label="חיפוש שיעורים..."');
  });

  it('keeps an explicit label', () => {
    const html = renderToStaticMarkup(<SearchField placeholder="x" aria-label="חיפוש תגיות" />);
    expect(html).toContain('aria-label="חיפוש תגיות"');
  });
});

describe('CollectionHeader', () => {
  it('owns the single h1 and places the cover before the text', () => {
    const html = renderToStaticMarkup(
      <CollectionHeader
        hue={200}
        cover={<span className="cover" />}
        eyebrow="סדרה"
        title="עץ חיים"
        description="תיאור"
      />,
    );
    expect(html.match(/<h1/g)?.length).toBe(1);
    expect(html.indexOf('class="cover"')).toBeLessThan(html.indexOf('<h1'));
    expect(html).toContain('סדרה');
  });
});
