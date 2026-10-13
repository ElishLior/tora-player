'use server';

import { loadCategoryQueueSegment, parseCategorySegmentRequest, type CategorySegment } from '@/lib/category-queue';
import { createAnonSupabaseClient } from '@/lib/supabase/anon';

export type CategoryQueueSegmentResult = { ok: true; segment: CategorySegment } | { ok: false };

/**
 * The next segment of a category play session. Public catalog data only: the
 * cookie-less anon client sees published lessons through RLS, so no sign-in is
 * needed and a revoked (unpublished) lesson is simply absent.
 */
export async function getCategoryQueueSegment(input: unknown): Promise<CategoryQueueSegmentResult> {
  const request = parseCategorySegmentRequest(input);
  if (!request) return { ok: false };
  try {
    return { ok: true, segment: await loadCategoryQueueSegment(createAnonSupabaseClient(), request) };
  } catch (error) {
    console.error('getCategoryQueueSegment error:', error);
    return { ok: false };
  }
}
