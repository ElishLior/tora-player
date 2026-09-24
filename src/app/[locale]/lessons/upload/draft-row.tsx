import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  FileAudio,
  ImageIcon,
  Loader2,
  RotateCcw,
  Scissors,
  X,
  Zap,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import { TagInput } from '@/components/tags/tag-input';
import { formatFileSize } from '@/lib/audio-utils';
import { generateLessonMetadata } from '@/lib/hebrew-date';
import { LESSON_PART_TYPES, SHORTS_AUDIO_TYPE } from '@/lib/lesson-naming';
import {
  appendTarget,
  formatDraftDay,
  includedImages,
  includedParts,
  setAppendToExisting,
  setDraftShort,
  SHORTS_CATEGORY_ID,
  type DraftAudioPart,
  type LessonDraft,
} from '@/lib/upload-drafts';
import { formatDuration } from '@/lib/utils';
import type { CategoryWithChildren } from '@/types/database';
import { inputClass, type DraftRun, type FileEntry, type RowStatus } from './upload-state';

const KNOWN_PART_TYPES: readonly string[] = [...LESSON_PART_TYPES, SHORTS_AUDIO_TYPE];
const CUSTOM_TYPE = '__custom';
const iconButton = 'rounded p-0.5 disabled:opacity-30';

interface DraftRowProps {
  draft: LessonDraft;
  run: DraftRun;
  status: RowStatus;
  /** Lesson fields can still change (upload not started, or its lesson was never created). */
  open: boolean;
  files: Record<string, FileEntry>;
  categories: CategoryWithChildren[];
  expanded: boolean;
  /** A batch is running; retries wait for it. */
  busy: boolean;
  onToggle: () => void;
  onChange: (update: (d: LessonDraft) => LessonDraft) => void;
  onDateChange: (date: string) => void;
  onRetry: () => void;
}

/** One lesson of the batch: a compact summary line that expands into its editor. */
export function DraftRow(props: DraftRowProps) {
  const { draft, run, status, files, expanded, busy, onToggle, onRetry } = props;
  const t = useTranslations('upload');
  const target = appendTarget(draft);
  const parts = includedParts(draft);
  const images = includedImages(draft);
  const thumbnail = images.map((i) => files[i.fileId]?.previewUrl).find(Boolean);
  const dimmed = status.kind === 'excluded' || status.kind === 'skip';
  const border =
    status.kind === 'attention'
      ? 'border-amber-500/40'
      : status.kind === 'failed'
        ? 'border-destructive/50'
        : 'border-[hsl(0,0%,18%)]';

  return (
    <section className={`overflow-hidden rounded-xl border bg-[hsl(var(--surface-elevated))]/60 ${border}`}>
      <div className="flex items-center gap-2 p-2.5 sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className={`flex min-w-0 flex-1 items-center gap-3 text-start ${dimmed ? 'opacity-60' : ''}`}
        >
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background/60">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- local blob preview
              <img src={thumbnail} alt="" className="h-full w-full object-cover" />
            ) : draft.isShort ? (
              <Scissors className="h-5 w-5 text-rose-400" />
            ) : (
              <FileAudio className="h-5 w-5 text-primary" />
            )}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex items-center gap-1.5 text-sm">
              <bdi className="flex-shrink-0 font-bold tabular-nums">{formatDraftDay(draft.date)}</bdi>
              <span className="truncate" dir="auto">{target ? target.title : draft.title}</span>
              {draft.isShort && (
                <span className="flex-shrink-0 rounded-full bg-rose-500/15 px-1.5 text-[10px] font-bold text-rose-400">
                  {t('shortBadge')}
                </span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-1 text-[11px]">
              {parts.map((part) => (
                <span key={part.fileId} className="rounded-full bg-background/60 px-2 py-0.5">
                  <bdi>{part.audioType || t('part')}</bdi>
                  {part.durationSec ? <bdi> {Math.max(1, Math.round(part.durationSec / 60))}′</bdi> : null}
                </span>
              ))}
              {images.length > 0 && (
                <span className="flex items-center gap-0.5 text-muted-foreground">
                  <ImageIcon className="h-3 w-3" />
                  {images.length}
                </span>
              )}
              {draft.tags.map((tag) => (
                <bdi key={tag} className="text-primary">#{tag}</bdi>
              ))}
            </span>
            {target && status.kind !== 'published' && (
              <span className="block text-[11px] font-bold text-sky-400">{t('appendsToExisting')}</span>
            )}
            {status.kind === 'attention' && (
              <span className="block text-[11px] text-amber-500">{t(`attention.${status.reason}`)}</span>
            )}
            {run.error && (
              <span className="block text-[11px] text-destructive">
                <bdi>{run.error}</bdi>
              </span>
            )}
          </span>
        </button>
        <StatusBadge status={status} busy={busy} onRetry={onRetry} />
      </div>

      {status.kind === 'uploading' && (
        <div className="h-1 bg-[hsl(0,0%,24%)]">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${status.percent}%` }} />
        </div>
      )}

      {expanded && <DraftEditor {...props} />}
    </section>
  );
}

function StatusBadge({ status, busy, onRetry }: { status: RowStatus; busy: boolean; onRetry: () => void }) {
  const t = useTranslations('upload');
  const pill = 'flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap';
  switch (status.kind) {
    case 'ready':
      return <span className={`${pill} bg-primary/15 text-primary`}>{t('status.ready')}</span>;
    case 'attention':
      return (
        <span className={`${pill} bg-amber-500/15 text-amber-400`}>
          <AlertTriangle className="h-3 w-3" />
          {t('status.attention')}
        </span>
      );
    case 'uploading':
      return (
        <span className={`${pill} bg-primary/15 text-primary`}>
          <Loader2 className="h-3 w-3 animate-spin" />
          <bdi>{t('status.uploading', { percent: status.percent })}</bdi>
        </span>
      );
    case 'published':
      return <span className={`${pill} bg-primary text-primary-foreground`}>{t('status.published')}</span>;
    case 'failed':
      return (
        <button
          type="button"
          onClick={onRetry}
          disabled={busy}
          className={`${pill} bg-destructive/15 text-destructive hover:bg-destructive/25 disabled:opacity-50`}
        >
          <RotateCcw className="h-3 w-3" />
          {t('status.failed')} · {t('retry')}
        </button>
      );
    default:
      return <span className={`${pill} bg-background/60 text-muted-foreground`}>{t(`status.${status.kind}`)}</span>;
  }
}

function DraftEditor({ draft, run, status, open, files, categories, onChange, onDateChange }: DraftRowProps) {
  const t = useTranslations('upload');
  const [preview, setPreview] = useState<string | null>(null);
  const hebrewDate = useMemo(() => generateLessonMetadata(draft.date).hebrewDate, [draft.date]);
  const target = appendTarget(draft);
  const locked = !open;
  // A failed row whose lesson exists keeps its fields, but files that never landed can be dropped.
  const droppable = (id: string) => run.phase === 'failed' && files[id]?.status !== 'done';
  const categoryOptions = draft.isShort ? categories.filter((c) => c.id === SHORTS_CATEGORY_ID) : categories;

  const editPart = (fileId: string, patch: Partial<DraftAudioPart>) =>
    onChange((d) => ({
      ...d,
      partsEdited: true,
      audio: d.audio.map((p) => (p.fileId === fileId ? { ...p, ...patch } : p)),
    }));
  const move = <T,>(list: T[], index: number, delta: number) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    return next;
  };
  const removeImage = (id: string) => onChange((d) => ({ ...d, images: d.images.filter((i) => i.fileId !== id) }));
  const previewUrl = preview ? files[preview]?.previewUrl : null;

  return (
    <div className="space-y-4 border-t border-[hsl(0,0%,18%)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={draft.date}
          disabled={locked}
          aria-label={t('date')}
          onChange={(e) => e.target.value && onDateChange(e.target.value)}
          className={`${inputClass} max-w-[10.5rem]`}
        />
        <bdi className="text-xs text-muted-foreground">{hebrewDate}</bdi>
        {status.kind === 'attention' && status.reason === 'noDate' && (
          <button
            type="button"
            onClick={() => onDateChange(draft.date)}
            className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-400 hover:bg-amber-500/25"
          >
            {t('confirmDate')}
          </button>
        )}
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
      </div>

      {draft.existing && !draft.isShort && (
        <label className="flex items-start gap-2 rounded-lg bg-sky-500/10 p-2.5 text-xs">
          <input
            type="checkbox"
            checked={draft.appendToExisting}
            disabled={locked}
            onChange={(e) => onChange((d) => setAppendToExisting(d, e.target.checked))}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[hsl(var(--primary))]"
          />
          <span className="space-y-0.5">
            <span className="block font-bold">
              {t('appendToggle', { title: `\u2068${draft.existing.title}\u2069` })}
            </span>
            {target && <span className="block text-muted-foreground">{t('appendNote')}</span>}
          </span>
        </label>
      )}

      {!target && (
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
              value={draft.description}
              disabled={locked}
              onChange={(e) => onChange((d) => ({ ...d, description: e.target.value }))}
              className={inputClass}
            />
          </label>
        </div>
      )}

      <TagInput value={draft.tags} onChange={(tags) => onChange((d) => ({ ...d, tags }))} disabled={locked} showLabel />

      {draft.audio.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-muted-foreground">{t('parts', { count: draft.audio.length })}</h3>
          {draft.audio.map((part, index) => {
            const entry = files[part.fileId];
            return (
              <div key={part.fileId} className={`space-y-1 rounded-lg bg-background/40 p-2.5 ${part.include ? '' : 'opacity-70'}`}>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={t('includePart')}
                    checked={part.include}
                    disabled={(locked && !droppable(part.fileId)) || part.duplicateOf != null}
                    onChange={(e) =>
                      editPart(part.fileId, {
                        include: e.target.checked,
                        audioType: e.target.checked ? part.audioType : null,
                      })
                    }
                    className="h-4 w-4 flex-shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <bdi dir="ltr" className="w-14 flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                    {part.durationSec ? formatDuration(part.durationSec) : '—'}
                  </bdi>
                  <PartTypeField
                    value={part.audioType}
                    disabled={locked || !part.include}
                    onChange={(audioType) => editPart(part.fileId, { audioType })}
                  />
                  {!locked && (
                    <span className="flex flex-col">
                      <button
                        type="button"
                        aria-label={t('moveUp')}
                        disabled={index === 0}
                        onClick={() => onChange((d) => ({ ...d, partsEdited: true, audio: move(d.audio, index, -1) }))}
                        className={iconButton}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={t('moveDown')}
                        disabled={index === draft.audio.length - 1}
                        onClick={() => onChange((d) => ({ ...d, partsEdited: true, audio: move(d.audio, index, 1) }))}
                        className={iconButton}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                  <FileStatusIcon entry={entry} />
                </div>
                {part.tooShort && <p className="text-[11px] text-amber-500">{t('tooShort')}</p>}
                {part.duplicateOf && (
                  <p className="text-[11px] text-amber-500">{t('duplicate', { title: `\u2068${part.duplicateOf}\u2069` })}</p>
                )}
                {entry?.transcode && part.include && entry.status !== 'done' && (
                  <p className="flex items-center gap-1 text-[11px] text-primary">
                    <Zap className="h-3 w-3" />
                    {t('willTranscode')}
                  </p>
                )}
                {entry?.status === 'running' && (
                  <div className="h-1 overflow-hidden rounded-full bg-[hsl(0,0%,24%)]">
                    <div className="h-full bg-primary transition-[width]" style={{ width: `${entry.progress}%` }} />
                  </div>
                )}
                {entry?.status === 'error' && (
                  <p className="text-[11px] text-destructive"><bdi>{entry.error}</bdi></p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {draft.images.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-bold text-muted-foreground">{t('images', { count: draft.images.length })}</h3>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {draft.images.map((image, index) => {
              const entry = files[image.fileId];
              return (
                <figure key={image.fileId} className={`relative aspect-square ${image.duplicateOf ? 'opacity-40' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setPreview(image.fileId)}
                    aria-label={t('previewImage')}
                    className="h-full w-full overflow-hidden rounded-lg bg-background/60"
                  >
                    {entry?.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                      <img src={entry.previewUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                  <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between rounded-b-lg bg-black/60 px-1 py-0.5 text-white">
                    {!locked ? (
                      <>
                        <button
                          type="button"
                          aria-label={t('moveEarlier')}
                          disabled={index === 0}
                          onClick={() => onChange((d) => ({ ...d, images: move(d.images, index, -1) }))}
                          className={iconButton}
                        >
                          <ChevronRight className="h-3.5 w-3.5 ltr:rotate-180" />
                        </button>
                        <button type="button" aria-label={t('remove')} onClick={() => removeImage(image.fileId)} className={iconButton}>
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={t('moveLater')}
                          disabled={index === draft.images.length - 1}
                          onClick={() => onChange((d) => ({ ...d, images: move(d.images, index, 1) }))}
                          className={iconButton}
                        >
                          <ChevronLeft className="h-3.5 w-3.5 ltr:rotate-180" />
                        </button>
                      </>
                    ) : (
                      <>
                        <FileStatusIcon entry={entry} />
                        {droppable(image.fileId) && (
                          <button type="button" aria-label={t('remove')} onClick={() => removeImage(image.fileId)} className={iconButton}>
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </figcaption>
                  {image.duplicateOf && (
                    <span className="absolute inset-x-0 top-0 rounded-t-lg bg-black/70 px-1 text-center text-[10px] text-white">
                      {t('status.skip')}
                    </span>
                  )}
                  {entry?.status === 'error' && (
                    <span
                      className="absolute inset-x-0 top-0 line-clamp-2 rounded-t-lg bg-destructive/90 px-1 text-[10px] text-destructive-foreground"
                      title={entry.error ?? ''}
                    >
                      <bdi>{entry.error}</bdi>
                    </span>
                  )}
                </figure>
              );
            })}
          </div>
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none font-bold">{t('fileDetails')}</summary>
        <ul className="mt-1.5 space-y-0.5">
          {[...draft.audio, ...draft.images].map((file) => (
            <li key={file.fileId} className="flex items-center justify-between gap-3">
              <bdi dir="ltr" className="min-w-0 truncate">{file.name}</bdi>
              <bdi dir="ltr" className="flex-shrink-0 tabular-nums">{formatFileSize(file.size)}</bdi>
            </li>
          ))}
        </ul>
      </details>

      <div className="flex flex-wrap items-center gap-3 border-t border-[hsl(0,0%,18%)] pt-3 text-xs">
        {open && run.lessonId == null && (
          <label className="flex items-center gap-1.5 font-bold">
            <input
              type="checkbox"
              checked={draft.excluded}
              onChange={(e) => onChange((d) => ({ ...d, excluded: e.target.checked }))}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            {t('exclude')}
          </label>
        )}
        {run.lessonId && (
          <span className="ms-auto flex gap-3">
            {run.phase === 'published' && (
              <Link href={`/lessons/${run.lessonId}`} className="font-bold underline">
                {t('openLesson')}
              </Link>
            )}
            <Link href={`/lessons/${run.lessonId}/edit`} className="text-muted-foreground underline">
              {t('editLesson')}
            </Link>
          </span>
        )}
      </div>

      {previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('previewImage')}
          onClick={() => setPreview(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        >
          <button
            type="button"
            aria-label={t('closePreview')}
            onClick={() => setPreview(null)}
            className="absolute end-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img src={previewUrl} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

/** Part type: סידור / עץ חיים / קצרים, none, or a custom label. */
function PartTypeField({
  value,
  disabled,
  onChange,
}: {
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations('upload');
  const [custom, setCustom] = useState(value != null && !KNOWN_PART_TYPES.includes(value));
  return (
    <span className="flex min-w-0 flex-1 gap-1.5">
      <select
        value={custom ? CUSTOM_TYPE : (value ?? '')}
        disabled={disabled}
        aria-label={t('partType')}
        onChange={(e) => {
          const next = e.target.value;
          setCustom(next === CUSTOM_TYPE);
          onChange(next === CUSTOM_TYPE || next === '' ? null : next);
        }}
        className="min-w-0 rounded-md border-0 bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs disabled:opacity-60"
      >
        <option value="">{t('noType')}</option>
        {KNOWN_PART_TYPES.map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
        <option value={CUSTOM_TYPE}>{t('customType')}</option>
      </select>
      {custom && (
        <input
          type="text"
          dir="auto"
          value={value ?? ''}
          maxLength={50}
          disabled={disabled}
          placeholder={t('customTypePlaceholder')}
          aria-label={t('partType')}
          onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
          className="min-w-0 flex-1 rounded-md border-0 bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs disabled:opacity-60"
        />
      )}
    </span>
  );
}

function FileStatusIcon({ entry }: { entry: FileEntry | undefined }) {
  if (entry?.status === 'running') return <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-primary" />;
  if (entry?.status === 'done') return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />;
  if (entry?.status === 'error') return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-destructive" />;
  return null;
}
