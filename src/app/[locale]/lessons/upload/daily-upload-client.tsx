'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowRight, Loader2, Upload } from 'lucide-react';
import { Link } from '@/i18n/routing';
import {
  announceUploadedLessons,
  createDraftLesson,
  lookupUploadTargets,
  mergeLessonTags,
  publishUploadedLesson,
} from '@/actions/upload';
import { ImageUnreadableError, uploadAudioFile, uploadImageFile } from '@/hooks/use-upload';
import { extractAudioMetadata } from '@/lib/audio-utils';
import { shouldTranscode } from '@/lib/audio-transcode';
import { mediaKindOf } from '@/lib/lesson-naming';
import { defaultNotifyMode, type NotifyMode } from '@/lib/notifications/batch-rules';
import {
  appendTarget,
  applyUploadLookup,
  buildLessonDrafts,
  compareDrafts,
  draftState,
  includedImages,
  includedParts,
  jerusalemToday,
  lessonFieldsForDraft,
  lookupCandidates,
  mergeLessonDrafts,
  moveDraftToDate,
  summarizeDrafts,
  type LessonDraft,
} from '@/lib/upload-drafts';
import { draftOutcome, pendingJobs, queueProgress, runQueue, type JobStatus, type UploadJob } from '@/lib/upload-queue';
import { useAudioStore } from '@/stores/audio-store';
import type { CategoryWithChildren } from '@/types/database';
import { DraftRow } from './draft-row';
import { takeSharedFiles } from './shared-files';
import { UploadActionBar } from './upload-action-bar';
import { draftJobs, NEW_RUN, rowStatus, type DraftRun, type FileEntry } from './upload-state';
import { useUploadGuard } from './use-upload-guard';

/** Files sent at once across the whole batch. */
const CONCURRENCY = 2;
/** Bottom nav height (+ border), and the mini player above it when a track is loaded. */
const BOTTOM_NAV_OFFSET = 57;
const MINI_PLAYER_OFFSET = 56;

interface SendJob extends UploadJob {
  send: (entry: FileEntry, onProgress: (percent: number) => void) => Promise<unknown>;
}

/** Lesson fields can still change: upload not started, or its lesson row was never created. */
const isOpenRun = (run: DraftRun) => run.phase === 'idle' || (run.phase === 'failed' && run.lessonId == null);

/** Server actions reject on network loss; turn that into their `{ error }` shape. */
function settle<T>(promise: Promise<T>): Promise<T | { data?: undefined; error: string }> {
  return promise.catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
}

const bidi = (text: string) => `\u2068${text}\u2069`;

export default function DailyUploadClient({ categories, shared }: { categories: CategoryWithChildren[]; shared: boolean }) {
  const t = useTranslations('upload');
  const [files, setFiles] = useState<Record<string, FileEntry>>({});
  const [drafts, setDrafts] = useState<LessonDraft[]>([]);
  const [runs, setRuns] = useState<Record<string, DraftRun>>({});
  const [unsupported, setUnsupported] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notifyChoice, setNotifyChoice] = useState<NotifyMode | null>(null);
  const [running, setRunning] = useState(false);
  const [runJobs, setRunJobs] = useState<UploadJob[]>([]);
  const [lookup, setLookup] = useState<{ signature: string; error: string | null }>({ signature: '', error: null });
  const [sharedEmpty, setSharedEmpty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasMiniPlayer = useAudioStore((s) => s.currentTrack != null);

  // The async upload run reads the latest state through refs.
  const filesRef = useRef(files);
  const draftsRef = useRef(drafts);
  const runsRef = useRef(runs);
  const runningRef = useRef(false);
  filesRef.current = files;
  draftsRef.current = drafts;
  runsRef.current = runs;

  const runOf = (key: string) => runs[key] ?? NEW_RUN;

  const patchFile = useCallback((id: string, patch: Partial<FileEntry>) => {
    setFiles((prev) => (prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev));
  }, []);
  const patchRun = useCallback((key: string, patch: Partial<DraftRun>) => {
    setRuns((prev) => ({ ...prev, [key]: { ...(prev[key] ?? NEW_RUN), ...patch } }));
  }, []);
  const updateDraft = useCallback((key: string, update: (d: LessonDraft) => LessonDraft) => {
    setDrafts((prev) => prev.map((d) => (d.key === key ? update(d) : d)));
  }, []);

  useUploadGuard(running, t('leaveWarning'));

  // Revoke image previews when the page goes away.
  useEffect(
    () => () => {
      for (const entry of Object.values(filesRef.current)) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
      }
    },
    [],
  );

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
          status: 'pending',
          progress: 0,
          error: null,
        };
      }),
    );

    const { drafts: incoming, unsupportedIds } = buildLessonDrafts(
      entries.map((e) => ({ id: e.id, name: e.file.name, size: e.file.size, durationSec: e.durationSec })),
      jerusalemToday(),
    );
    // New files for a day whose upload already started become a lesson of their own
    // (the lookup then appends them to that day's lesson).
    const started = new Set(
      draftsRef.current.filter((d) => !isOpenRun(runsRef.current[d.key] ?? NEW_RUN)).map((d) => d.key),
    );
    const adjusted = incoming.map((d) => (started.has(d.key) ? { ...d, key: `${d.key}#${crypto.randomUUID()}` } : d));

    setFiles((prev) => ({ ...prev, ...Object.fromEntries(entries.map((e) => [e.id, e])) }));
    setDrafts((prev) => mergeLessonDrafts(prev, adjusted));
    setUnsupported((prev) => [...prev, ...entries.filter((e) => unsupportedIds.includes(e.id)).map((e) => e.file.name)]);
    setSharedEmpty(false);
    setAnalyzing(false);
  }, []);

  // Files shared from WhatsApp arrive through the service worker's stash.
  const sharedTaken = useRef(false);
  useEffect(() => {
    if (!shared || sharedTaken.current) return;
    sharedTaken.current = true;
    window.history.replaceState(null, '', window.location.pathname);
    takeSharedFiles()
      .then((list) => (list.length > 0 ? addFiles(list) : setSharedEmpty(true)))
      .catch(() => setSharedEmpty(true));
  }, [shared, addFiles]);

  // Check open drafts against the DB whenever their files or dates change:
  // duplicates are skipped and days that already have a lesson are appended to.
  const lookupSignature = drafts
    .filter((d) => isOpenRun(runOf(d.key)))
    .map((d) => `${d.key}@${d.date}:${[...d.audio, ...d.images].map((f) => f.fileId).join(',')}`)
    .join('|');
  useEffect(() => {
    if (!lookupSignature) return;
    const open = (d: LessonDraft) => isOpenRun(runsRef.current[d.key] ?? NEW_RUN);
    let cancelled = false;
    settle(lookupUploadTargets(draftsRef.current.filter(open).flatMap(lookupCandidates))).then((res) => {
      if (cancelled) return;
      if (res.data) {
        const data = res.data;
        setDrafts((prev) => prev.map((d) => (open(d) ? applyUploadLookup(d, data) : d)));
      }
      setLookup({ signature: lookupSignature, error: res.error ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [lookupSignature]);
  const checking = lookupSignature !== '' && lookup.signature !== lookupSignature;

  const sortedDrafts = useMemo(() => [...drafts].sort(compareDrafts), [drafts]);
  const summary = useMemo(() => summarizeDrafts(drafts), [drafts]);
  const fileStatus = useMemo(() => Object.fromEntries(Object.values(files).map((e) => [e.id, e.status])), [files]);
  const fileProgress = useMemo(() => Object.fromEntries(Object.values(files).map((e) => [e.id, e.progress])), [files]);

  const batch = sortedDrafts.filter((d) => {
    const run = runOf(d.key);
    if (run.phase === 'failed' && run.lessonId) return true;
    return isOpenRun(run) && draftState(d).kind === 'ready';
  });
  const blocked = sortedDrafts.filter((d) => isOpenRun(runOf(d.key)) && draftState(d).kind === 'attention').length;
  const failed = sortedDrafts.filter((d) => runOf(d.key).phase === 'failed').length;
  const finished =
    !running &&
    batch.length === 0 &&
    blocked === 0 &&
    sortedDrafts.some((d) => ['published', 'saved'].includes(runOf(d.key).phase));
  // Appends to a lesson that is already public are never announced.
  const notifyMode =
    notifyChoice ?? defaultNotifyMode(batch.filter((d) => !appendTarget(d)?.isPublished).length);

  const runBatch = async (keys: string[], publish: boolean) => {
    if (runningRef.current || keys.length === 0) return;
    runningRef.current = true;
    setRunning(true);
    const mode = notifyMode;
    const drafted = keys
      .map((key) => draftsRef.current.find((d) => d.key === key))
      .filter((d): d is LessonDraft => d != null);
    const status: Record<string, JobStatus> = Object.fromEntries(
      Object.values(filesRef.current).map((e) => [e.id, e.status]),
    );
    const lessonIds: Record<string, string> = {};
    const newlyPublished: string[] = [];
    for (const draft of drafted) patchRun(draft.key, { phase: 'queued', error: null, publish });

    // 1. The lesson rows: created unpublished, or the existing lesson of that day.
    for (const draft of drafted) {
      let lessonId = (runsRef.current[draft.key] ?? NEW_RUN).lessonId ?? appendTarget(draft)?.id ?? null;
      if (!lessonId) {
        const created = await settle(createDraftLesson(lessonFieldsForDraft(draft)));
        if (!created.data) {
          patchRun(draft.key, { phase: 'failed', error: t('createFailed', { error: bidi(created.error) }) });
          continue;
        }
        lessonId = created.data.id;
      }
      lessonIds[draft.key] = lessonId;
      patchRun(draft.key, { lessonId });
    }

    // 2. One queue for every file of the batch; files that landed in an earlier run are skipped.
    const jobs: SendJob[] = drafted
      .filter((d) => lessonIds[d.key])
      .flatMap((draft) => {
        const lessonId = lessonIds[draft.key];
        const all: SendJob[] = [
          ...includedParts(draft).map((part) => ({
            id: part.fileId,
            draftKey: draft.key,
            bytes: part.size,
            send: (entry: FileEntry, onProgress: (percent: number) => void) =>
              uploadAudioFile(entry.file, {
                lessonId,
                sortOrder: part.sortOrder,
                audioType: part.audioType,
                duration: part.durationSec ?? 0,
                transcode: entry.transcode,
                onProgress,
              }),
          })),
          ...includedImages(draft).map((image) => ({
            id: image.fileId,
            draftKey: draft.key,
            bytes: image.size,
            send: (entry: FileEntry) => uploadImageFile(entry.file, { lessonId, sortOrder: image.sortOrder }),
          })),
        ];
        return pendingJobs(all, status);
      });
    const jobIdsOf = (key: string) => jobs.filter((job) => job.draftKey === key).map((job) => job.id);
    setRunJobs(jobs);

    // 3. A lesson whose files all landed is finished: tags merged, then published (or kept as draft).
    const finish = async (draft: LessonDraft) => {
      const target = appendTarget(draft);
      if (target && draft.tags.length > 0) {
        const merged = await settle(mergeLessonTags(target.id, draft.tags));
        if (!merged.data) {
          patchRun(draft.key, { phase: 'failed', error: t('tagsFailed', { error: bidi(merged.error) }) });
          return;
        }
      }
      if (!publish) {
        patchRun(draft.key, { phase: target?.isPublished ? 'published' : 'saved', error: null });
        return;
      }
      const published = await settle(publishUploadedLesson(lessonIds[draft.key], false));
      if (!published.data) {
        patchRun(draft.key, { phase: 'failed', error: t('publishFailed', { error: bidi(published.error) }) });
        return;
      }
      if (published.data.newlyPublished) newlyPublished.push(published.data.id);
      patchRun(draft.key, { phase: 'published', error: null });
    };

    for (const draft of drafted) {
      if (lessonIds[draft.key] && jobIdsOf(draft.key).length === 0) await finish(draft);
    }

    await runQueue(
      jobs,
      CONCURRENCY,
      async (job) => {
        status[job.id] = 'running';
        patchFile(job.id, { status: 'running', progress: 0, error: null });
        patchRun(job.draftKey, { phase: 'uploading' });
        await job.send(filesRef.current[job.id], (progress) => patchFile(job.id, { progress }));
      },
      async (job, outcome) => {
        status[job.id] = outcome.ok ? 'done' : 'error';
        patchFile(
          job.id,
          outcome.ok
            ? { status: 'done', progress: 100 }
            : {
                status: 'error',
                error:
                  outcome.error instanceof ImageUnreadableError
                    ? t('imageUnreadable')
                    : outcome.error instanceof Error
                      ? outcome.error.message
                      : String(outcome.error),
              },
        );
        const ids = jobIdsOf(job.draftKey);
        const result = draftOutcome(ids, status);
        if (result === 'uploading') return;
        if (result === 'failed') {
          const count = ids.filter((id) => status[id] === 'error').length;
          patchRun(job.draftKey, { phase: 'failed', error: t('filesFailed', { count }) });
          return;
        }
        await finish(drafted.find((d) => d.key === job.draftKey)!);
      },
    );

    // 4. One announcement for everything this run published ('none' still marks them announced).
    if (publish && newlyPublished.length > 0) await settle(announceUploadedLessons(newlyPublished, mode));
    runningRef.current = false;
    setRunning(false);
    setRunJobs([]);
  };

  const onDateChange = (key: string, date: string) => {
    const before = draftsRef.current.find((d) => d.key === key);
    const firstFile = before?.audio[0]?.fileId ?? before?.images[0]?.fileId;
    const next = moveDraftToDate(draftsRef.current, key, date, (k) => isOpenRun(runsRef.current[k] ?? NEW_RUN));
    setDrafts(next);
    // The draft may have taken that day's key or joined its draft; keep it open.
    const moved = next.find((d) => [...d.audio, ...d.images].some((f) => f.fileId === firstFile)) ?? next.find((d) => d.key === key);
    if (moved) setExpanded(moved.key);
  };

  const startOver = () => {
    for (const entry of Object.values(files)) {
      if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl);
    }
    setFiles({});
    setDrafts([]);
    setRuns({});
    setUnsupported([]);
    setExpanded(null);
    setNotifyChoice(null);
    setSharedEmpty(false);
    setLookup({ signature: '', error: null });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!analyzing) void addFiles(Array.from(e.dataTransfer.files));
  };

  const runPercent = queueProgress(runJobs, fileStatus, fileProgress);
  const hasDrafts = drafts.length > 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link
          href="/lessons"
          aria-label={t('back')}
          className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-[hsl(var(--surface-highlight))] hover:text-foreground"
        >
          <ArrowRight className="h-5 w-5 ltr:rotate-180" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold">{t('title')}</h1>
          {!hasDrafts && <p className="text-xs text-muted-foreground">{t('subtitle')}</p>}
        </div>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => !analyzing && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed text-center transition-all ${
          hasDrafts ? 'gap-2 p-3' : 'flex-col p-8'
        } ${dragging ? 'border-primary bg-primary/5' : 'border-[hsl(0,0%,25%)] hover:border-primary/50'}`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="audio/*,image/*,.opus,.ogg,.oga,.m4a,.mp3,.heic,.heif"
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        {analyzing ? (
          <Loader2 className={`animate-spin text-muted-foreground ${hasDrafts ? 'h-4 w-4' : 'mb-2 h-6 w-6'}`} />
        ) : (
          <Upload className={`text-muted-foreground ${hasDrafts ? 'h-4 w-4' : 'mb-2 h-6 w-6'}`} />
        )}
        <p className="text-sm font-medium">{analyzing ? t('analyzing') : hasDrafts ? t('dropMore') : t('dropHere')}</p>
        {!hasDrafts && <p className="mt-1 text-xs text-muted-foreground">{t('dropHint')}</p>}
      </div>

      {sharedEmpty && <Notice>{t('sharedEmpty')}</Notice>}
      {unsupported.length > 0 && <Notice>{t('unsupported', { names: unsupported.map(bidi).join(', ') })}</Notice>}
      {lookup.error && !checking && <Notice>{t('lookupFailed', { error: bidi(lookup.error) })}</Notice>}

      {hasDrafts && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[hsl(var(--surface-elevated))]/60 px-3 py-2.5 text-xs">
          <span className="font-bold">{t('summary.lessons', { count: summary.lessons })}</span>
          {summary.shorts > 0 && <span className="font-bold">{t('summary.shorts', { count: summary.shorts })}</span>}
          <span className="text-muted-foreground">{t('summary.recordings', { count: summary.recordings })}</span>
          <span className="text-muted-foreground">{t('summary.images', { count: summary.images })}</span>
          {(summary.duplicates > 0 || summary.undated > 0 || summary.tinyClips > 0) && (
            <span className="flex basis-full flex-wrap gap-x-3 gap-y-1 text-amber-400">
              {summary.duplicates > 0 && <span>{t('summary.duplicates', { count: summary.duplicates })}</span>}
              {summary.undated > 0 && <span>{t('summary.undated', { count: summary.undated })}</span>}
              {summary.tinyClips > 0 && <span>{t('summary.tinyClips', { count: summary.tinyClips })}</span>}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {sortedDrafts.map((draft) => {
          const run = runOf(draft.key);
          return (
            <DraftRow
              key={draft.key}
              draft={draft}
              run={run}
              status={rowStatus(draft, run, queueProgress(draftJobs(draft), fileStatus, fileProgress))}
              open={isOpenRun(run)}
              files={files}
              categories={categories}
              expanded={expanded === draft.key}
              busy={running}
              onToggle={() => setExpanded((current) => (current === draft.key ? null : draft.key))}
              onChange={(update) => updateDraft(draft.key, update)}
              onDateChange={(date) => onDateChange(draft.key, date)}
              onRetry={() => void runBatch([draft.key], run.publish)}
            />
          );
        })}
      </div>

      {hasDrafts && (
        <>
          {/* Room for the fixed action bar. */}
          <div aria-hidden className="h-32" />
          <UploadActionBar
            bottomOffset={BOTTOM_NAV_OFFSET + (hasMiniPlayer ? MINI_PLAYER_OFFSET : 0)}
            notifyMode={notifyMode}
            onNotifyMode={setNotifyChoice}
            count={batch.length}
            blocked={blocked}
            checking={checking || analyzing}
            running={running}
            progress={
              running
                ? {
                    percent: runPercent,
                    done: runJobs.filter((job) => fileStatus[job.id] === 'done').length,
                    total: runJobs.length,
                  }
                : null
            }
            failed={failed}
            finished={finished}
            onPublish={() => void runBatch(batch.map((d) => d.key), true)}
            onSaveDraft={() => void runBatch(batch.map((d) => d.key), false)}
            onStartOver={startOver}
          />
        </>
      )}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-500">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
      <span>{children}</span>
    </p>
  );
}
