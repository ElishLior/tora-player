import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, updated on change. False on the server and
 * during hydration (like `useHydrated`), so UI that only exists on wide screens
 * can skip device work (lesson fetches) on phones without a server/client mismatch.
 */
export function useMediaQuery(query: string): boolean {
  // Stable per query, so React subscribes once instead of on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
