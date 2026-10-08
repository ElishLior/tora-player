import { isMissingSlugSchema } from './lesson-route';

/** Retry only a missing slug column, before migration 020. Keep all filters and embeds. */
export async function withLessonSlugSelect<T extends { error: { code?: string; message?: string } | null }>(
  columns: string,
  read: (columns: string) => PromiseLike<T>,
): Promise<T> {
  const result = await read(columns);
  if (result.error && isMissingSlugSchema(result.error)) {
    return await read(columns.replace(/\bslug\s*,\s*/g, ''));
  }
  return result;
}
