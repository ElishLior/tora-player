import { describe, expect, it } from 'vitest';
import { canAutoLoadMore, getLoadMoreErrorMessage } from './pagination-state';

describe('pagination-state', () => {
  it('returns Hebrew load-more failure copy', () => {
    expect(getLoadMoreErrorMessage('he')).toBe(
      'לא ניתן לטעון שיעורים נוספים כרגע. בדוק את החיבור ונסה שוב.',
    );
  });

  it('returns English load-more failure copy', () => {
    expect(getLoadMoreErrorMessage('en')).toBe(
      'Could not load more lessons right now. Check the connection and try again.',
    );
  });

  it('pauses infinite scroll while an error is visible', () => {
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: true,
        pageError: 'failed',
      }),
    ).toBe(false);
  });

  it('allows infinite scroll only in normal mode with more pages and no visible error', () => {
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: true,
        pageError: null,
      }),
    ).toBe(true);
    expect(
      canAutoLoadMore({
        isSearchMode: true,
        hasMore: true,
        pageError: null,
      }),
    ).toBe(false);
    expect(
      canAutoLoadMore({
        isSearchMode: false,
        hasMore: false,
        pageError: null,
      }),
    ).toBe(false);
  });
});
