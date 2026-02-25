'use client';

import { useCallback, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  fetchMore: () => Promise<void>;
  hasMore: boolean;
}

export function useInfiniteScroll({ fetchMore, hasMore }: UseInfiniteScrollOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Clean up previous observer
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node || !hasMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting && hasMore && !isLoading) {
            setIsLoading(true);
            fetchMore().finally(() => {
              setIsLoading(false);
            });
          }
        },
        { rootMargin: '200px' }
      );

      observerRef.current.observe(node);
    },
    [fetchMore, hasMore, isLoading]
  );

  return { sentinelRef, isLoading };
}
