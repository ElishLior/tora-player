/*
 * How a lesson preview names its parts and their lengths, in minutes only:
 * "חלק 1: 82 דק׳ · חלק 2: 70 דק׳" ("Part 1: 82 min · Part 2: 70 min"). Pure, so
 * cards, the offline list and new-lesson notifications share one wording.
 * Strings come from the `partDurations` messages through whatever translator
 * the caller has (useTranslations on the client, createTranslator on the server).
 */

/** next-intl translator scoped to the `partDurations` namespace. */
export type PartDurationsTranslator = (
  key: 'part' | 'partWithLength' | 'seconds' | 'minutes',
  values: Record<string, string | number>,
) => string;

export type PartLength = { unit: 'seconds'; seconds: number } | { unit: 'minutes'; minutes: number };

/** Whole minutes (a clip under a minute keeps its seconds); null when unknown (0 or missing). */
export function splitPartLength(seconds: number | null | undefined): PartLength | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 59.5) return { unit: 'seconds', seconds: Math.max(1, Math.round(seconds)) };
  return { unit: 'minutes', minutes: Math.round(seconds / 60) };
}

export function formatPartLength(seconds: number | null | undefined, t: PartDurationsTranslator): string | null {
  const length = splitPartLength(seconds);
  if (!length) return null;
  return length.unit === 'seconds'
    ? t('seconds', { seconds: length.seconds })
    : t('minutes', { minutes: length.minutes });
}

/**
 * One label per part, in play order. A single part shows only its length; a
 * part with an unknown length (stored 0) shows only its name, never "0 min".
 */
export function formatPartDurations(partSeconds: readonly number[], t: PartDurationsTranslator): string[] {
  if (partSeconds.length === 0) return [];
  if (partSeconds.length === 1) {
    const only = formatPartLength(partSeconds[0], t);
    return only ? [only] : [];
  }
  return partSeconds.map((seconds, index) => {
    const name = t('part', { number: index + 1 });
    const length = formatPartLength(seconds, t);
    return length ? t('partWithLength', { name, length }) : name;
  });
}

/** Middle dot between parts (the brief's "Part A: 45 min · Part B: 38 min"). */
export const PART_SEPARATOR = ' · ';
