export interface LocalNote {
  id: string;
  text: string;
  timestamp?: number;
  createdAt: string;
}

const STORAGE_PREFIX = 'tora-notes-';

function getStorageKey(lessonId: string): string {
  return `${STORAGE_PREFIX}${lessonId}`;
}

export function getNotes(lessonId: string): LocalNote[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(lessonId));
    if (!raw) return [];
    return JSON.parse(raw) as LocalNote[];
  } catch {
    return [];
  }
}

function saveNotes(lessonId: string, notes: LocalNote[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(lessonId), JSON.stringify(notes));
  } catch {
    // Storage full or unavailable — silent fail
  }
}

export function addNote(lessonId: string, text: string, timestamp?: number): LocalNote {
  const note: LocalNote = {
    id: crypto.randomUUID(),
    text,
    timestamp,
    createdAt: new Date().toISOString(),
  };
  const existing = getNotes(lessonId);
  saveNotes(lessonId, [...existing, note]);
  return note;
}

export function updateNote(lessonId: string, noteId: string, text: string): void {
  const notes = getNotes(lessonId);
  const updated = notes.map((n) =>
    n.id === noteId ? { ...n, text } : n
  );
  saveNotes(lessonId, updated);
}

export function deleteNote(lessonId: string, noteId: string): void {
  const notes = getNotes(lessonId);
  saveNotes(
    lessonId,
    notes.filter((n) => n.id !== noteId)
  );
}
