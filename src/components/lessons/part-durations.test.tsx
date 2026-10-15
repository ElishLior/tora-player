import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import he from '../../../messages/he.json';
import { PartDurations } from './part-durations';

vi.stubGlobal('React', React);

function render(props: React.ComponentProps<typeof PartDurations>) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <PartDurations {...props} />
    </NextIntlClientProvider>,
  );
}

describe('PartDurations', () => {
  it.each([1, 2, 3, 4, 5])('exposes all %i playable parts without a scroll container', (count) => {
    const html = render({ variant: 'chips', seconds: Array(count).fill(7200), onPlayPart: vi.fn() });
    const container = html.slice(0, html.indexOf('>'));
    const buttons = html.match(/<button\b[^>]*>/g) ?? [];

    expect(container).toContain('flex-wrap');
    expect(container).not.toMatch(/overflow|mask|relative|z-10|tabindex/);
    expect(buttons).toHaveLength(count);
    for (const button of buttons) {
      expect(button).toContain('relative z-10');
      expect(button).toContain('min-h-11');
    }
    expect(html).toContain('120 דק׳');
    if (count > 1) expect(html).toContain(`חלק ${count}: 120 דק׳`);
  });

  it('keeps non-playable lesson-row chips compact', () => {
    const html = render({ variant: 'chips', seconds: [5460, 3360] });
    expect(html).toContain('overflow-x-auto');
    expect(html).not.toContain('flex-wrap');
    expect(html).not.toContain('<button');
  });

  it('keeps text previews on the single-line scroller', () => {
    const html = render({ seconds: [5460, 3360] });
    expect(html).toContain('overflow-x-auto');
    expect(html).toContain('whitespace-nowrap');
    expect(html).not.toContain('flex-wrap');
  });
});
