'use client';

import { useEffect, useState } from 'react';
import { getLessonsByIds } from '@/actions/lessons';
import type { LessonWithRelations } from '@/types/database';

export interface LessonsByIds {
  /** Published lessons that were found, by id. */
  lessons: ReadonlyMap<string, LessonWithRelations>;
  /** True once the fetch for these ids finished (successfully or not). */
  settled: boolean;
}

const EMPTY: LessonsByIds = { lessons: new Map(), settled: false };

/**
 * Published lesson rows for a set of ids (through the `getLessonsByIds` action).
 * Refetches only when the set of ids changes, so a progress checkpoint does not
 * refetch. Does nothing while `enabled` is false (e.g. before hydration).
 */
export function useLessonsByIds(ids: readonly string[], enabled = true): LessonsByIds {
  const key = ids.join(',');
  const [state, setState] = useState<{ key: string; value: LessonsByIds }>({ key: '', value: EMPTY });

  useEffect(() => {
    if (!enabled || !key) return;
    let cancelled = false;
    getLessonsByIds(key.split(','))
      .then((rows) => {
        if (cancelled) return;
        setState({ key, value: { lessons: new Map(rows.map((lesson) => [lesson.id, lesson])), settled: true } });
      })
      .catch(() => {
        if (!cancelled) setState({ key, value: { lessons: new Map(), settled: true } });
      });
    return () => {
      cancelled = true;
    };
  }, [key, enabled]);

  return enabled && key && state.key === key ? state.value : EMPTY;
}
