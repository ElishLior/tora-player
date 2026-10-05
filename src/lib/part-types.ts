/** Part types (lesson_audio.audio_type): the built-in labels plus any the admin typed in. */

import { LESSON_PART_TYPES, SHORTS_AUDIO_TYPE } from '@/lib/lesson-naming';

export const BUILT_IN_PART_TYPES: readonly string[] = [...LESSON_PART_TYPES, SHORTS_AUDIO_TYPE];
export const MAX_PART_TYPE_LENGTH = 50;

/** Trim and collapse whitespace; empty means "no type" (null). Over-long input is cut. */
export function normalizePartType(raw: string | null | undefined): string | null {
  const type = (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PART_TYPE_LENGTH).trim();
  return type || null;
}

/**
 * Choices for a part-type picker: the built-in types first, then types already
 * in use (most used first, then alphabetical), each once.
 */
export function partTypeOptions(used: readonly (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();
  for (const raw of used) {
    const type = normalizePartType(raw);
    if (type && !BUILT_IN_PART_TYPES.includes(type)) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  const extra = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b, 'he'));
  return [...BUILT_IN_PART_TYPES, ...extra];
}
