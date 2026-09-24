/** Lesson topic tags: one normalization shared by upload, edit, filters and DB writes. */

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;

/** Trim, drop a leading '#', collapse whitespace; empty or over-long input yields null. */
export function normalizeTag(raw: string): string | null {
  const tag = raw.replace(/^#+/, '').replace(/\s+/g, ' ').trim();
  if (!tag || tag.length > MAX_TAG_LENGTH) return null;
  return tag;
}

/** Normalize, de-duplicate (first spelling wins) and cap a tag list. */
export function normalizeTags(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of raw) {
    const tag = normalizeTag(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}
