import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '../../../messages/he.json';
import { SkipButton } from './player-controls';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof he.player) => he.player[key],
}));

describe('SkipButton', () => {
  beforeEach(() => vi.stubGlobal('React', React));
  afterEach(() => vi.unstubAllGlobals());
  it.each(['back', 'forward'] as const)('calls one click handler once and labels the %s interval as 15 seconds', (direction) => {
    const onClick = vi.fn();
    const button = SkipButton({ direction, onClick });
    const label = direction === 'back' ? he.player.skipBackward : he.player.skipForward;

    button.props.onClick();

    expect(onClick).toHaveBeenCalledExactlyOnceWith();
    expect(button.props['aria-label']).toBe(label);
    expect(label).toContain('15');
    expect(renderToStaticMarkup(button)).toContain(`aria-label="${label}"`);
    expect(button.props.onPointerDown).toBeUndefined();
    expect(button.props.onTouchStart).toBeUndefined();
    expect(button.props.onKeyDown).toBeUndefined();
  });
});
