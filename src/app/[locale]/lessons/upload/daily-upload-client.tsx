'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  FileAudio, Loader2, RotateCcw, Upload, X, Zap,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { createDraftLesson, findDuplicateAudio, publishUploadedLesson } from '@/actions/upload';
import { ImageUnreadableError, uploadAudioFile, uploadImageFile } from '@/hooks/use-upload';
import { extractAudioMetadata, formatFileSize } from '@/lib/audio-utils';
import { shouldTranscode } from '@/lib/audio-transcode';
import { generateLessonMetadata } from '@/lib/hebrew-date';
import { LESSON_PART_TYPES, mediaKindOf, SHORTS_AUDIO_TYPE } from '@/lib/lesson-naming';
import {
  applyDuplicates,
  buildLessonDrafts,
  includedParts,
  jerusalemToday,
  lessonFieldsForDraft,
  mergeLessonDrafts,
  setDraftDate,
  setDraftShort,
  SHORTS_CATEGORY_ID,
  type LessonDraft,
} from '@/lib/upload-drafts';
import { formatDuration } from '@/lib/utils';
import type { CategoryWithChildren } from '@/types/database';

type FileStatus = 'ready' | 'uploading' | 'done' | 'error';

interface FileEntry {
  id: string;
  file: File;
  durationSec: number | null;
  transcode: boolean;
  previewUrl: string | null;
  status: FileStatus;
  progress: number;
  error: string | null;
}

type DraftPhase = 'review' | 'uploading' | 'failed' | 'published';

interface DraftRun {
  phase: DraftPhase;
  lessonId: string | null;
  error: string | null;
  description: string;
}

const NEW_RUN: DraftRun = { phase: 'review', lessonId: null, error: null, description: '' };
const PART_TYPE_OPTIONS = [...LESSON_PART_TYPES, SHORTS_AUDIO_TYPE];
const inputClass =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

export default function DailyUploadClient({ categories }: { categories: CategoryWithChildren[] }) {
  const t = useTranslations('upload');
  const [files, setFiles] = useState<Record<string, FileEntry>>({});
  const [drafts, setDrafts] = useState<LessonDraft[]>([]);
  const [runs, setRuns] = useState<Record<string, DraftRun>>({});
  const [fallbackDate, setFallbackDate] = useState(() => jerusalemToday());
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Async upload loops read the latest state through refs.
  const filesRef = useRef(files);
  const draftsRef = useRef(drafts);
  const runsRef = useRef(runs);
  filesRef.current = files;
  draftsRef.current = drafts;
  runsRef.current = runs;

  const runOf = (key: string) => runs[key] ?? NEW_RUN;
  const isUploading = Object.values(runs).some((r) => r.phase === 'uploading');

  const patchFile = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);
  const patchRun = useCallback((key: string, patch: Partial<DraftRun>) => {
    setRuns((prev) => ({ ...prev, [key]: { ...(prev[key] ?? NEW_RUN), ...patch } }));
  }, []);
  const updateDraft = useCallback((key: string, update: (d: LessonDraft) => LessonDraft) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? update(d) : d)));
  }, []);

  // Revoke image previews when the page goes away.
  useEffect(
    () => () => {
      for (const entry of Object.values(filesRef.current)) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isUploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('leaveWarning');
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isUploading, t]);

  const addFiles = useCallback(async (list: File[]) => {
    const known = new Set(Object.values(filesRef.current).map((e) => `${e.file.name}:${e.file.size}`));
    const fresh = list.filter((f) => !known.has(`${f.name}:${f.size}`));
    if (fresh.length === 0) return;
    setAnalyzing(true);

    const entries = await Promise.all(
      fresh.map(async (file): Promise<FileEntry> => {
        const kind = mediaKindOf(file.name);
        const durationSec = kind === 'audio' ? (await extractAudioMetadata(file)).duration || null : null;
        return {
          id: crypto.randomUUID(),
          file,
          durationSec,
          transcode: kind === 'audio' && shouldTranscode(file),
          previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
          status: 'ready',
          progress: 0,
          error: null,
        };
      }),
    );

    const { drafts: incoming, unsupportedIds } = buildLessonDrafts(
      entries.map((e) => ({ id: e.id, name: e.file.name, size: e.file.size, durationSec: e.durationSec })),
      fallbackDate,
    );
    // New files for a day that is already uploading/published start a new lesson.
    const locked = new Set(
      draftsRef.current.filter((d) => (runsRef.current[d.key] ?? NEW_RUN).phase !== 'review').map((d) => d.key),
    );
    const adjusted = incoming.map((d) => (locked.has(d.key) ? { ...d, key: `${d.key}#${crypto.randomUUID()}` } : d));

    setFiles((prev) => ({ ...prev, ...Object.fromEntries(entries.map((e) => [e.id, e])) }));
    setDrafts((prev) => mergeLessonDrafts(prev, adjusted));
    setUnsupported((prev) => [
      ...prev,
      ...entries.filter((e) => unsupportedIds.includes(e.id)).map((e) => e.file.name),
    ]);
    setAnalyzing(false);
  }, [fallbackDate]);

  // Duplicate detection: re-check whenever the files or dates under review change.
  const reviewDrafts = drafts.filter((d) => runOf(d.key).phase === 'review');
  const duplicateSignature = reviewDrafts
    .map((d) => `${d.key}@${d.date}:${d.audio.map((p) => p.fileId).join(',')}`)
    .join('|');
  useEffect(() => {
    const candidates = draftsRef.current
      .filter((d) => (runsRef.current[d.key] ?? NEW_RUN).phase === 'review')
      .flatMap((d) => d.audio.map((p) => ({ fileId: p.fileId, date: d.date, size: p.size, name: p.name })));
    if (candidates.length === 0) return;
    let cancelled = false;
    findDuplicateAudio(candidates).then((res) => {
      if (cancelled || !res.data) return;
      const duplicates = res.data;
      setDrafts((prev) =>
        prev.map((d) => ((runsRef.current[d.key] ?? NEW_RUN).phase === 'review' ? applyDuplicates(d, duplicates) : d)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [duplicateSignature]);

  const uploadDraft = useCallback(async (key: string) => {
    const draft = draftsRef.current.find((d) => d.key === key);
    if (!draft) return;
    const run = runsRef.current[key] ?? NEW_RUN;
    patchRun(key, { phase: 'uploading', error: null });

    let lessonId = run.lessonId;
    if (!lessonId) {
      const created = await createDraftLesson(lessonFieldsForDraft(draft, run.description));
      if (!created.data) {
        patchRun(key, { phase: 'failed', error: t('createFailed', { error: `\u2068${created.error}\u2069` }) });
        return;
      }
      lessonId = created.data.id;
      patchRun(key, { lessonId });
    }

    let failures = 0;
    const jobs = [
      ...includedParts(draft).map((part) => ({
        id: part.fileId,
        send: (entry: FileEntry) =>
          uploadAudioFile(entry.file, {
            lessonId: lessonId!,
            sortOrder: part.sortOrder,
            audioType: part.audioType,
            duration: part.durationSec ?? 0,
            transcode: entry.transcode,
            onProgress: (progress) => patchFile(part.fileId, { progress }),
          }),
      })),
      ...draft.imageIds.map((id, sortOrder) => ({
        id,
        send: (entry: FileEntry) => uploadImageFile(entry.file, { lessonId: lessonId!, sortOrder }),
      })),
    ];
    for (const job of jobs) {
      const entry = filesRef.current[job.id];
      if (entry.status === 'done') continue;
      patchFile(job.id, { status: 'uploading', progress: 0, error: null });
      try {
        await job.send(entry);
        patchFile(job.id, { status: 'done', progress: 100 });
      } catch (err) {
        failures++;
        patchFile(job.id, {
          status: 'error',
          error: err instanceof ImageUnreadableError ? t('imageUnreadable') : err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (failures > 0) {
      patchRun(key, { phase: 'failed', error: t('filesFailed') });
      return;
    }
    const published = await publishUploadedLesson(lessonId);
    if (!published.data) {
      patchRun(key, { phase: 'failed', error: t('publishFailed', { error: `\u2068${published.error}\u2069` }) });
      return;
    }
    patchRun(key, { phase: 'published', error: null });
  }, [patchFile, patchRun, t]);

  const pendingKeys = drafts
    .filter((d) => runOf(d.key).phase !== 'published' && includedParts(d).length > 0)
    .map((d) => d.key);

  const uploadAll = async () => {
    for (const key of pendingKeys) await uploadDraft(key);
  };

  const removeDraft = (key: string) => {
    const draft = drafts.find((d) => d.key === key);
    if (!draft) return;
    const ids = [...draft.audio.map((p) => p.fileId), ...draft.imageIds];
    for (const id of ids) {
      const url = files[id]?.previewUrl;
      if (url) URL.revokeObjectURL(url);
    }
    setDrafts((prev) => prev.filter((d) => d.key !== key));
    setFiles((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!analyzing) addFiles(Array.from(e.dataTransfer.files));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link
          href="/lessons"
          aria-label={t('back')}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <ArrowRight className="h-5 w-5 ltr:rotate-180" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{t('title')}</h1>
          <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !analyzing && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
          dragging ? 'border-primary bg-primary/5' : 'border-[hsl(0,0%,25%)] hover:border-primary/50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,image/*,.opus,.ogg,.oga,.m4a,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        {analyzing ? (
          <Loader2 className="h-6 w-6 mb-2 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="h-6 w-6 mb-2 text-muted-foreground" />
        )}
        <p className="text-sm font-medium">{analyzing ? t('analyzing') : t('dropHere')}</p>
        <p className="text-xs text-muted-foreground mt-1">{t('dropHint')}</p>
      </div>

      <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{t('fallbackDate')}</span>
        <input
          type="date"
          value={fallbackDate}
          onChange={(e) => e.target.value && setFallbackDate(e.target.value)}
          className={`${inputClass} max-w-[11rem]`}
        />
      </label>

      {unsupported.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{t('unsupported', { names: unsupported.map((n) => `\u2068${n}\u2069`).join(', ') })}</span>
        </p>
      )}

      {drafts.map((draft) => (
        <DraftCard
          key={draft.key}
          draft={draft}
          run={runOf(draft.key)}
          files={files}
          categories={categories}
          onChange={(update) => updateDraft(draft.key, update)}
          onDescription={(description) => patchRun(draft.key, { description })}
          onUpload={() => uploadDraft(draft.key)}
          onRemove={() => removeDraft(draft.key)}
          disabled={isUploading}
        />
      ))}

      {pendingKeys.length > 1 && (
        <button
          type="button"
          onClick={uploadAll}
          disabled={isUploading || analyzing}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
        >
          {isUploading ? t('uploading') : t('uploadAll', { count: pendingKeys.length })}
        </button>
      )}
    </div>
  );
}

interface DraftCardProps {
  draft: LessonDraft;
  run: DraftRun;
  files: Record<string, FileEntry>;
  categories: CategoryWithChildren[];
  onChange: (update: (d: LessonDraft) => LessonDraft) => void;
  onDescription: (value: string) => void;
  onUpload: () => void;
  onRemove: () => void;
  disabled: boolean;
}

function DraftCard({ draft, run, files, categories, onChange, onDescription, onUpload, onRemove, disabled }: DraftCardProps) {
  const t = useTranslations('upload');
  // Once the lesson row exists its fields are fixed here; later changes go through the edit page.
  const locked = run.lessonId != null || run.phase !== 'review';
  const hebrewDate = useMemo(() => generateLessonMetadata(draft.date).hebrewDate, [draft.date]);
  const categoryOptions = draft.isShort ? categories.filter((c) => c.id === SHORTS_CATEGORY_ID) : categories;
  const canUpload = includedParts(draft).length > 0;

  const movePart = (index: number, delta: number) =>
    onChange((d) => {
      const audio = [...d.audio];
      const [part] = audio.splice(index, 1);
      audio.splice(index + delta, 0, part);
      return { ...d, audio, partsEdited: true };
    });
  const editPart = (fileId: string, patch: Partial<LessonDraft['audio'][number]>) =>
    onChange((d) => ({
      ...d,
      partsEdited: true,
      audio: d.audio.map((p) => (p.fileId === fileId ? { ...p, ...patch } : p)),
    }));
  const moveImage = (index: number, delta: number) =>
    onChange((d) => {
      const imageIds = [...d.imageIds];
      const [id] = imageIds.splice(index, 1);
      imageIds.splice(index + delta, 0, id);
      return { ...d, imageIds };
    });

  return (
    <section className="rounded-xl bg-[hsl(var(--surface-elevated))]/60 p-4 space-y-4 border border-[hsl(0,0%,18%)]">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={draft.date}
          disabled={locked}
          aria-label={t('date')}
          onChange={(e) => e.target.value && onChange((d) => setDraftDate(d, e.target.value))}
          className={`${inputClass} max-w-[11rem]`}
        />
        <span className="text-xs text-muted-foreground">{hebrewDate}</span>
        <label className="ms-auto flex items-center gap-1.5 text-xs font-bold">
          <input
            type="checkbox"
            checked={draft.isShort}
            disabled={locked}
            onChange={(e) => onChange((d) => setDraftShort(d, e.target.checked))}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          {t('shortToggle')}
        </label>
        {!locked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('removeDraft')}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))]"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!draft.dateFromFilename && (
        <p className="flex items-center gap-1.5 text-xs text-amber-500">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t('dateNotDetected')}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-xs font-bold text-muted-foreground">{t('lessonTitle')}</span>
          <input
            type="text"
            dir="auto"
            value={draft.title}
            disabled={locked}
            onChange={(e) => onChange((d) => ({ ...d, title: e.target.value, titleEdited: true }))}
            className={inputClass}
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted-foreground">{t('category')}</span>
          <select
            value={draft.categoryId}
            disabled={locked}
            onChange={(e) => onChange((d) => ({ ...d, categoryId: e.target.value }))}
            className={inputClass}
          >
            {!draft.isShort && <option value="">{t('noCategory')}</option>}
            {categoryOptions.map((parent) => (
              <optgroup key={parent.id} label={parent.hebrew_name}>
                {draft.isShort && <option value={parent.id}>{parent.hebrew_name}</option>}
                {parent.children.map((child) => (
                  <option key={child.id} value={child.id}>{child.hebrew_name}</option>
                ))}
                {!draft.isShort && parent.children.length === 0 && (
                  <option value={parent.id}>{parent.hebrew_name}</option>
                )}
              </optgroup>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted-foreground">{t('description')}</span>
          <input
            type="text"
            dir="auto"
            value={run.description}
            disabled={locked}
            onChange={(e) => onDescription(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      {draft.audio.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-muted-foreground">{t('audioParts', { count: draft.audio.length })}</h3>
          {draft.audio.map((part, index) => {
            const entry = files[part.fileId];
            return (
              <div key={part.fileId} className="rounded-lg bg-background/40 p-2.5 space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={part.include}
                    disabled={locked}
                    onChange={(e) =>
                      editPart(part.fileId, {
                        include: e.target.checked,
                        audioType: e.target.checked ? part.audioType : null,
                      })
                    }
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  <FileAudio className="h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-start" dir="auto">{part.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      <bdi>{part.durationSec ? formatDuration(part.durationSec) : '—'}</bdi> · <bdi>{formatFileSize(part.size)}</bdi>
                    </p>
                  </div>
                  <select
                    value={part.audioType ?? ''}
                    disabled={locked || !part.include}
                    onChange={(e) => editPart(part.fileId, { audioType: e.target.value || null })}
                    className="rounded-md bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs border-0"
                  >
                    <option value="">{t('noType')}</option>
                    {PART_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {!locked && (
                    <div className="flex flex-col">
                      <button type="button" aria-label={t('moveUp')} disabled={index === 0} onClick={() => movePart(index, -1)} className="disabled:opacity-30">
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label={t('moveDown')} disabled={index === draft.audio.length - 1} onClick={() => movePart(index, 1)} className="disabled:opacity-30">
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <FileStatusIcon entry={entry} />
                </div>
                {part.tooShort && <p className="text-[11px] text-amber-500">{t('tooShort')}</p>}
                {part.duplicateOf && (
                  <p className="text-[11px] text-amber-500">{t('duplicate', { title: part.duplicateOf })}</p>
                )}
                {entry?.transcode && part.include && (
                  <p className="flex items-center gap-1 text-[11px] text-primary">
                    <Zap className="h-3 w-3" />
                    {t('willTranscode')}
                  </p>
                )}
                <FileProgress entry={entry} />
              </div>
            );
          })}
        </div>
      )}

      {draft.imageIds.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-muted-foreground">{t('images', { count: draft.imageIds.length })}</h3>
          <div className="flex flex-wrap gap-2">
            {draft.imageIds.map((id, index) => {
              const entry = files[id];
              return (
                <div key={id} className="relative h-20 w-20">
                  {entry?.previewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                    <img src={entry.previewUrl} alt={entry.file.name} className="h-full w-full rounded-lg object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-between rounded-b-lg bg-black/60 px-1 py-0.5 text-white">
                    {!locked ? (
                      <>
                        <button type="button" aria-label={t('moveUp')} disabled={index === 0} onClick={() => moveImage(index, -1)} className="disabled:opacity-30">
                          <ChevronRight className="h-3.5 w-3.5 ltr:rotate-180" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('remove')}
                          onClick={() => onChange((d) => ({ ...d, imageIds: d.imageIds.filter((x) => x !== id) }))}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label={t('moveDown')} disabled={index === draft.imageIds.length - 1} onClick={() => moveImage(index, 1)} className="disabled:opacity-30">
                          <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
                        </button>
                      </>
                    ) : (
                      <FileStatusIcon entry={entry} />
                    )}
                  </div>
                  {entry?.status === 'error' && (
                    <p className="absolute inset-x-0 top-0 rounded-t-lg bg-destructive/90 px-1 text-[10px] text-destructive-foreground line-clamp-2" title={entry.error ?? ''}>
                      <bdi>{entry.error}</bdi>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!canUpload && run.phase !== 'published' && (
        <p className="text-xs text-muted-foreground">{t('noAudio')}</p>
      )}
      {run.error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {run.error}
        </p>
      )}

      <div className="flex items-center gap-2">
        {run.phase === 'published' ? (
          <>
            <span className="flex items-center gap-1 text-sm font-bold text-primary">
              <CheckCircle2 className="h-4 w-4" />
              {t('published')}
            </span>
            <Link href={`/lessons/${run.lessonId}`} className="ms-auto text-sm font-bold underline">
              {t('openLesson')}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onUpload}
              disabled={disabled || !canUpload}
              className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {run.phase === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : run.phase === 'failed' ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {run.phase === 'uploading' ? t('uploading') : run.phase === 'failed' ? t('retryFailed') : t('uploadDraft')}
            </button>
            {run.lessonId && run.phase === 'failed' && (
              <Link href={`/lessons/${run.lessonId}/edit`} className="ms-auto text-xs underline text-muted-foreground">
                {t('editLesson')}
              </Link>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function FileStatusIcon({ entry }: { entry: FileEntry | undefined }) {
  if (entry?.status === 'uploading') return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  if (entry?.status === 'done') return <CheckCircle2 className="h-4 w-4 text-primary" />;
  if (entry?.status === 'error') return <AlertTriangle className="h-4 w-4 text-destructive" />;
  return null;
}

function FileProgress({ entry }: { entry: FileEntry | undefined }) {
  if (!entry) return null;
  if (entry.status === 'error') return <p className="text-[11px] text-destructive"><bdi>{entry.error}</bdi></p>;
  if (entry.status !== 'uploading') return null;
  return (
    <div className="h-1 overflow-hidden rounded-full bg-[hsl(0,0%,24%)]">
      <div className="h-full bg-primary transition-[width]" style={{ width: `${entry.progress}%` }} />
    </div>
  );
}
