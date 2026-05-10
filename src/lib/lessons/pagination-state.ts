export interface AutoLoadMoreState {
  isSearchMode: boolean;
  hasMore: boolean;
  pageError: string | null;
}

export function getLoadMoreErrorMessage(locale: string) {
  return locale === 'he'
    ? 'לא ניתן לטעון שיעורים נוספים כרגע. בדוק את החיבור ונסה שוב.'
    : 'Could not load more lessons right now. Check the connection and try again.';
}

export function canAutoLoadMore({
  isSearchMode,
  hasMore,
  pageError,
}: AutoLoadMoreState) {
  return !isSearchMode && hasMore && !pageError;
}
