/*
 * PostgREST returns an embedded aggregate (`select('*, lessons(count)')`) as `[{ count: n }]`.
 * Rows read before such a select existed (cached catalog entries) have no key at all, so the
 * count is `null` ("unknown") rather than 0: a card then shows no count instead of a false one.
 */
export function embeddedCount(row: object, relation: string): number | null {
  const value = (row as Record<string, unknown>)[relation];
  if (!Array.isArray(value)) return null;
  const count = (value[0] as { count?: unknown } | undefined)?.count;
  return typeof count === 'number' && Number.isFinite(count) ? count : null;
}
