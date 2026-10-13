/*
 * Limits of bookmarks, shared by the edit dialog (counter, maxLength) and the
 * server schema (src/lib/validators.ts). Free of server dependencies so client
 * bundles stay small.
 */

/** Longest bookmark note; matches bookmarkSchema on the server. */
export const BOOKMARK_NOTE_MAX = 2000;
