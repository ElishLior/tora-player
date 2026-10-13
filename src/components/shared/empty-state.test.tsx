import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Scissors } from 'lucide-react';
import { EmptyState } from './empty-state';

// Vitest compiles JSX with the classic runtime here, so components need React in scope.
vi.stubGlobal('React', React);

describe('EmptyState', () => {
  it('shows the title, the one-line hint and the primary action', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Scissors} title="אין עדיין" description="רמז קצר" action={<span>לשיעורים</span>} />,
    );
    expect(html).toContain('<h3');
    expect(html).toContain('אין עדיין');
    expect(html).toContain('רמז קצר');
    expect(html).toContain('לשיעורים');
  });

  it('uses the shorts rose for the rose tone and the app green otherwise', () => {
    const rose = renderToStaticMarkup(<EmptyState tone="rose" icon={Scissors} title="x" />);
    const neutral = renderToStaticMarkup(<EmptyState icon={Scissors} title="x" />);
    expect(rose).toContain('bg-rose-400/15');
    expect(neutral).toContain('bg-primary/10');
    expect(neutral).not.toContain('bg-rose-400');
  });

  it('is smaller inside a card when compact', () => {
    const compact = renderToStaticMarkup(<EmptyState compact icon={Scissors} title="x" />);
    const full = renderToStaticMarkup(<EmptyState icon={Scissors} title="x" />);
    expect(compact).toContain('py-6');
    expect(full).toContain('py-12');
  });
});
