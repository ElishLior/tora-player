import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SeekBar } from './seek-bar';

// Vitest compiles JSX with the classic runtime here, so components need React in scope.
vi.stubGlobal('React', React);

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('SeekBar time row', () => {
  it('total mode shows elapsed and total time, both LTR, with no remaining time', () => {
    const html = renderToStaticMarkup(<SeekBar currentTime={30} duration={4920} onSeek={() => {}} timeMode="total" />);
    expect(html).toContain('0:30');
    expect(html).toContain('1:22:00');
    expect(html).not.toContain('-1:21');
    expect(html).toContain('text-[13px]');
  });

  it('defaults to the remaining-time row the full player uses', () => {
    const html = renderToStaticMarkup(<SeekBar currentTime={30} duration={4920} onSeek={() => {}} />);
    expect(html).toContain('-1:21:30');
    expect(html).toContain('text-[11px]');
  });
});
