import { describe, expect, it } from 'vitest';
import { homeIntroChoice, homeIntroStart } from './home-intro';

describe('homeIntroStart', () => {
  it('opens on the first visit and remembers that it was seen', () => {
    expect(homeIntroStart(null)).toEqual({ open: true, write: 'seen' });
  });

  it('stays collapsed on later visits unless the listener opened it', () => {
    expect(homeIntroStart('seen')).toEqual({ open: false, write: null });
    expect(homeIntroStart('closed')).toEqual({ open: false, write: null });
    expect(homeIntroStart('open')).toEqual({ open: true, write: null });
    expect(homeIntroStart('something else')).toEqual({ open: false, write: null });
  });
});

describe('homeIntroChoice', () => {
  it('stores the listener choice', () => {
    expect(homeIntroChoice(true)).toBe('open');
    expect(homeIntroChoice(false)).toBe('closed');
  });
});
