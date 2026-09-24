import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { deleteNote, saveNote } from '@/actions/notes';
import { isNoteDirty, toNoteInput } from '@/lib/account/merge';
import { MAX_NOTE_IMAGES, noteImageUrl } from '@/lib/note-rules';

export interface LocalNoteImage {
  id: string;
  width: number | null;
  height: number | null;
}

export interface LocalNote {
  id: string;
  lessonId: string;
  body: string;
  /** Seconds into the lesson's main audio file, or null for a general note. */
  position: number | null;
  audioFileId: string | null;
  createdAt: string;
  /** Time of the last edit on the device that made it (last-write-wins between devices). */
  updatedAt: string;
  /** Account version (`updated_at`) this device last agreed with; null = never stored in the account. */
  syncedAt: string | null;
  lessonTitle?: string;
  /** Images live in the signed-in account only. */
  images: LocalNoteImage[];
}

/** `sync_failed`: saved on this device, but mirroring to the signed-in account failed. */
type SyncResult = { error?: 'sync_failed' };

export type NoteImageUploadError = 'auth_required' | 'too_many' | 'too_large' | 'unsupported' | 'failed';

interface NotesState {
  notes: LocalNote[];
  /** Ids removed on this device that may still exist in the account; the next sync deletes them. */
  pendingDeletes: string[];
  /** Signed-in user whose account mirrors these notes; null = local-only. Not persisted. */
  accountUserId: string | null;
  addNote: (input: {
    lessonId: string;
    body: string;
    position?: number | null;
    audioFileId?: string | null;
    lessonTitle?: string;
  }) => Promise<SyncResult & { note: LocalNote }>;
  updateNote: (id: string, body: string) => Promise<SyncResult>;
  removeNote: (id: string) => Promise<SyncResult>;
  /** Uploads an already downscaled image to a note (signed-in users only). */
  addImage: (
    noteId: string,
    image: { blob: Blob; width: number | null; height: number | null },
  ) => Promise<{ error?: NoteImageUploadError }>;
  removeImage: (noteId: string, imageId: string) => Promise<SyncResult>;
  /** Moves notes of the old per-lesson localStorage format (`tora-notes-<lessonId>`) into this store. */
  importLegacyNotes: () => void;
}

const SYNC_FAILED = 'sync_failed' as const;
const MAX_PENDING_DELETES = 500;
const LEGACY_PREFIX = 'tora-notes-';

const UPLOAD_ERRORS: Record<number, NoteImageUploadError> = {
  401: 'auth_required',
  409: 'too_many',
  413: 'too_large',
  415: 'unsupported',
};

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => {
      /** Mirrors one note to the account; on success the device copy is marked in sync. */
      async function pushNote(id: string): Promise<SyncResult> {
        const note = get().notes.find((n) => n.id === id);
        if (!note || !get().accountUserId) return {};
        try {
          const result = await saveNote(toNoteInput(note));
          if (result.error) return { error: SYNC_FAILED };
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? { ...n, syncedAt: note.updatedAt } : n)),
          }));
          return {};
        } catch {
          return { error: SYNC_FAILED };
        }
      }

      return {
        notes: [],
        pendingDeletes: [],
        accountUserId: null,

        addNote: async ({ lessonId, body, position = null, audioFileId = null, lessonTitle }) => {
          const now = new Date().toISOString();
          const note: LocalNote = {
            id: crypto.randomUUID(),
            lessonId,
            body,
            position,
            audioFileId,
            createdAt: now,
            updatedAt: now,
            syncedAt: null,
            lessonTitle,
            images: [],
          };
          set((state) => ({ notes: [...state.notes, note] }));
          // Anonymous: local only. Signed-in notes that fail here are uploaded by the next sync.
          return { note, ...(await pushNote(note.id)) };
        },

        updateNote: async (id, body) => {
          const updatedAt = new Date().toISOString();
          set((state) => ({
            notes: state.notes.map((n) => (n.id === id ? { ...n, body, updatedAt } : n)),
          }));
          return pushNote(id);
        },

        removeNote: async (id) => {
          set((state) => ({
            notes: state.notes.filter((n) => n.id !== id),
            pendingDeletes: [...state.pendingDeletes.filter((pending) => pending !== id), id].slice(-MAX_PENDING_DELETES),
          }));
          if (!get().accountUserId) return {};
          try {
            const result = await deleteNote(id);
            if (result.error) return { error: SYNC_FAILED };
            set((state) => ({ pendingDeletes: state.pendingDeletes.filter((pending) => pending !== id) }));
            return {};
          } catch {
            return { error: SYNC_FAILED };
          }
        },

        addImage: async (noteId, image) => {
          if (!get().accountUserId) return { error: 'auth_required' };
          const note = get().notes.find((n) => n.id === noteId);
          if (!note) return { error: 'failed' };
          if (note.images.length >= MAX_NOTE_IMAGES) return { error: 'too_many' };
          // The upload route only accepts images for notes stored in the account.
          if (isNoteDirty(note) && (await pushNote(noteId)).error) return { error: 'failed' };

          const form = new FormData();
          form.append('noteId', noteId);
          form.append('file', image.blob, `image.${image.blob.type.split('/')[1] || 'jpg'}`);
          if (image.width) form.append('width', String(image.width));
          if (image.height) form.append('height', String(image.height));
          try {
            const response = await fetch('/api/notes/images', { method: 'POST', body: form });
            if (!response.ok) return { error: UPLOAD_ERRORS[response.status] ?? 'failed' };
            const { image: saved } = (await response.json()) as { image: LocalNoteImage };
            set((state) => ({
              notes: state.notes.map((n) => (n.id === noteId ? { ...n, images: [...n.images, saved] } : n)),
            }));
            return {};
          } catch {
            return { error: 'failed' };
          }
        },

        removeImage: async (noteId, imageId) => {
          try {
            const response = await fetch(noteImageUrl(imageId), { method: 'DELETE' });
            // 404: already gone from the account.
            if (!response.ok && response.status !== 404) return { error: SYNC_FAILED };
          } catch {
            return { error: SYNC_FAILED };
          }
          set((state) => ({
            notes: state.notes.map((n) =>
              n.id === noteId ? { ...n, images: n.images.filter((image) => image.id !== imageId) } : n,
            ),
          }));
          return {};
        },

        importLegacyNotes: () => {
          if (typeof window === 'undefined') return;
          const imported: LocalNote[] = [];
          const known = new Set(get().notes.map((n) => n.id));
          for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(LEGACY_PREFIX)) continue;
            const lessonId = key.slice(LEGACY_PREFIX.length);
            try {
              const legacy = JSON.parse(localStorage.getItem(key) ?? '[]') as {
                id: string;
                text: string;
                timestamp?: number;
                createdAt: string;
              }[];
              for (const old of Array.isArray(legacy) ? legacy : []) {
                if (!old?.id || known.has(old.id) || typeof old.text !== 'string' || !old.text.trim()) continue;
                known.add(old.id);
                const createdAt = typeof old.createdAt === 'string' ? old.createdAt : new Date().toISOString();
                imported.push({
                  id: old.id,
                  lessonId,
                  body: old.text.trim(),
                  position: typeof old.timestamp === 'number' ? old.timestamp : null,
                  audioFileId: null,
                  createdAt,
                  updatedAt: createdAt,
                  syncedAt: null,
                  images: [],
                });
              }
            } catch {
              // Unreadable legacy entry: nothing to keep.
            }
            localStorage.removeItem(key);
          }
          if (imported.length > 0) set((state) => ({ notes: [...state.notes, ...imported] }));
        },
      };
    },
    {
      name: 'tora-notes',
      partialize: (state) => ({ notes: state.notes, pendingDeletes: state.pendingDeletes }),
      onRehydrateStorage: () => (state) => state?.importLegacyNotes(),
    },
  ),
);
