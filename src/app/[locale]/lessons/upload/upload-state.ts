import {
  draftState,
  includedImages,
  includedParts,
  type DraftAttention,
  type LessonDraft,
} from '@/lib/upload-drafts';
import type { JobStatus, UploadJob } from '@/lib/upload-queue';

export interface FileEntry {
  id: string;
  file: File;
  durationSec: number | null;
  transcode: boolean;
  previewUrl: string | null;
  status: JobStatus;
  progress: number;
  error: string | null;
}

export type RunPhase = 'idle' | 'queued' | 'uploading' | 'failed' | 'published' | 'saved';

export interface DraftRun {
  phase: RunPhase;
  /** Lesson the files go to (created or appended to); set once it exists. */
  lessonId: string | null;
  error: string | null;
  /** Intent of the last run, reused by the row's retry. */
  publish: boolean;
}

export const NEW_RUN: DraftRun = { phase: 'idle', lessonId: null, error: null, publish: true };

export type RowStatus =
  | { kind: 'ready' }
  | { kind: 'attention'; reason: DraftAttention }
  | { kind: 'skip' }
  | { kind: 'excluded' }
  | { kind: 'queued' }
  | { kind: 'uploading'; percent: number }
  | { kind: 'published' }
  | { kind: 'saved' }
  | { kind: 'failed' };

export function rowStatus(draft: LessonDraft, run: DraftRun, percent: number): RowStatus {
  switch (run.phase) {
    case 'idle':
      return draftState(draft);
    case 'uploading':
      return { kind: 'uploading', percent };
    default:
      return { kind: run.phase };
  }
}

/** The files a draft sends, for progress (sort order and target come from the draft). */
export function draftJobs(draft: LessonDraft): UploadJob[] {
  return [
    ...includedParts(draft).map((p) => ({ id: p.fileId, draftKey: draft.key, bytes: p.size })),
    ...includedImages(draft).map((i) => ({ id: i.fileId, draftKey: draft.key, bytes: i.size })),
  ];
}

export const inputClass =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0 disabled:opacity-60';
