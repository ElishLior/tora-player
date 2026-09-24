'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Play,
  Cast,
  Volume2,
  X,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  StickyNote,
  Plus,
  Trash2,
  Pencil,
  Clock,
  Check,
  Scissors,
  Car,
  Download,
  CheckCircle,
  Loader2,
  Bookmark,
  FileDown,
  ImagePlus,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import { PlayPauseIcon, SkipButton } from '@/components/player/player-controls';
import { BookmarkDialog } from '@/components/bookmarks/bookmark-dialog';
import { BookmarkChips, BookmarkMarkers } from '@/components/bookmarks/lesson-bookmarks';
import { NoteImageStrip } from '@/components/notes/note-image-strip';
import { handleCastClick } from '@/lib/cast-utils';
import { buildAudioDownloadFilename, getAudioDownloadUrl } from '@/lib/audio-download';
import type { LessonWithRelations, LessonImage } from '@/types/database';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { createLessonTrack, getLessonAudioAssets, getSortedAudioFiles, type LessonAudioAsset } from '@/lib/lesson-tracks';
import { saveAudioFilesOffline, getDownloadedLesson } from '@/lib/offline-storage';
import {
  OFFLINE_DOWNLOADS_CHANGED_EVENT,
  isOfflineDownloadsChangedEvent,
} from '@/lib/offline-events';
import { handleDeviceDownloadClick } from '@/lib/device-download';
import { MAX_NOTE_IMAGES, MAX_NOTE_LENGTH } from '@/lib/note-rules';
import { prepareNoteImage } from '@/lib/note-image-resize';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { useNotesStore, type LocalNote } from '@/stores/notes-store';
import { submitSnippet } from '@/actions/snippets';

function formatDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type DownloadState = 'idle' | 'downloading' | 'downloaded' | 'error';

function getAudioAssetFilename(lesson: LessonWithRelations, asset: LessonAudioAsset, index = 0): string {
  const baseTitle = asset.originalName || lesson.hebrew_title || lesson.title || asset.title || 'lesson';
  const suffix = asset.audioType ? ` - ${asset.audioType}` : index > 0 ? ` - ${index + 1}` : '';
  return buildAudioDownloadFilename(`${baseTitle}${suffix}`, asset.audioUrl);
}

// ---- Inlined mark snippet dialog (webpack workaround) ----
function MarkSnippetDialogInline({
  isOpen,
  onClose,
  lessonId,
  currentAudioFileId,
  currentTime: ct,
  duration: dur,
}: {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  currentAudioFileId: string | null;
  currentTime: number;
  duration: number;
}) {
  const defaultStart = Math.max(0, Math.floor(ct) - 30);
  const defaultEnd = Math.min(Math.floor(dur), Math.floor(ct) + 30);

  const [startMin, setStartMin] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endMin, setEndMin] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [snippetTitle, setSnippetTitle] = useState('');
  const [snippetDescription, setSnippetDescription] = useState('');
  const [snippetSubmitting, setSnippetSubmitting] = useState(false);
  const [snippetSuccess, setSnippetSuccess] = useState(false);
  const [snippetError, setSnippetError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const sm = Math.floor(defaultStart / 60);
      const ss = defaultStart % 60;
      const em = Math.floor(defaultEnd / 60);
      const es = defaultEnd % 60;
      setStartMin(sm);
      setStartSec(ss);
      setEndMin(em);
      setEndSec(es);
      setSnippetTitle('');
      setSnippetDescription('');
      setSnippetSubmitting(false);
      setSnippetSuccess(false);
      setSnippetError(null);
    }
  }, [isOpen, defaultStart, defaultEnd]);

  const startTotal = Math.max(0, startMin * 60 + startSec);
  const endTotal = Math.max(0, endMin * 60 + endSec);
  const clipDuration = Math.max(0, endTotal - startTotal);
  const maxDur = Math.ceil(dur) || 99999; // fallback if duration unknown
  const isValid = endTotal > startTotal && startTotal >= 0 && endTotal <= maxDur;

  async function handleSnippetSubmit() {
    if (!snippetTitle.trim()) return;
    setSnippetSubmitting(true);
    setSnippetError(null);
    try {
      const result = await submitSnippet({
        lesson_id: lessonId,
        audio_file_id: currentAudioFileId || null,
        title: snippetTitle.trim(),
        description: snippetDescription.trim() || null,
        start_time: startTotal,
        end_time: endTotal,
      });
      if ('error' in result && result.error) {
        const err = result.error;
        const msg =
          typeof err === 'string' ? err : '_form' in err ? err._form?.[0] : Object.values(err).flat().join(', ');
        setSnippetError(msg || 'שגיאה בשליחת הסימון');
      } else {
        setSnippetSuccess(true);
        setTimeout(() => {
          onClose();
          setSnippetSuccess(false);
          setSnippetTitle('');
          setSnippetDescription('');
        }, 2500);
      }
    } catch (err) {
      setSnippetError(err instanceof Error ? err.message : 'שגיאה בשליחת הסימון');
    } finally {
      setSnippetSubmitting(false);
    }
  }

  if (!isOpen) return null;

  // Success state
  if (snippetSuccess) {
    return (
      <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
        <div
          className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[hsl(0,0%,12%)] border border-[hsl(0,0%,20%)] shadow-2xl"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-8 flex flex-col items-center gap-4 text-center" dir="rtl">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-white">הקטע נשלח בהצלחה!</h3>
            <p className="text-sm text-white/60">האדמין יבדוק ויאשר אותו.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[hsl(0,0%,12%)] border border-[hsl(0,0%,20%)] shadow-2xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-[hsl(0,0%,18%)]">
          <div className="flex items-center gap-2" dir="rtl">
            <Scissors className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-white">סימון קטע</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-4" dir="rtl">
          <p className="text-xs text-white/50 leading-relaxed">
            הקטע שתסמן ישלח לאדמין לבדיקה. לאחר אישור ועריכה, הקטע יוכל לעלות למערכת כקטע נפרד.
          </p>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">התחלה</label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={startMin}
                  onChange={(e) => setStartMin(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 rounded-lg bg-[hsl(var(--surface-elevated))] border border-border/50 px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={startSec}
                  onChange={(e) => setStartSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-14 rounded-lg bg-[hsl(var(--surface-elevated))] border border-border/50 px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">סיום</label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={endMin}
                  onChange={(e) => setEndMin(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 rounded-lg bg-[hsl(var(--surface-elevated))] border border-border/50 px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={endSec}
                  onChange={(e) => setEndSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-14 rounded-lg bg-[hsl(var(--surface-elevated))] border border-border/50 px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* Duration display */}
          <div className="rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-white/50">משך הקטע</span>
            <span className={`text-sm font-mono font-bold tabular-nums ${isValid ? 'text-primary' : 'text-red-400'}`}>
              {isValid ? formatDur(clipDuration) : 'לא תקין'}
            </span>
          </div>
          {!isValid && <p className="text-xs text-red-400 text-center">זמן הסיום חייב להיות אחרי זמן ההתחלה</p>}

          {/* Title input */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground font-medium">
              כותרת הקטע <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={snippetTitle}
              onChange={(e) => setSnippetTitle(e.target.value)}
              placeholder="לדוגמה: קטע יפה על..."
              className="w-full bg-[hsl(var(--surface-elevated))] border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
              dir="rtl"
            />
          </div>

          {/* Description textarea */}
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground font-medium">תיאור (אופציונלי)</label>
            <textarea
              value={snippetDescription}
              onChange={(e) => setSnippetDescription(e.target.value)}
              placeholder="תאר את הקטע בקצרה..."
              className="w-full bg-[hsl(var(--surface-elevated))] border border-border/50 rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
              rows={2}
              dir="rtl"
            />
          </div>

          {/* Error message */}
          {snippetError && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{snippetError}</p>}

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleSnippetSubmit}
              disabled={!isValid || !snippetTitle.trim() || snippetSubmitting}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {snippetSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>שלח לאדמין</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LessonPlayerClientProps {
  lesson: LessonWithRelations;
  images?: LessonImage[];
}

export function LessonPlayerClient({ lesson, images }: LessonPlayerClientProps) {
  const locale = useLocale();
  const t = useTranslations('player');
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentTrack,
    currentTime,
    duration,
    playbackSpeed,
    playbackIssue,
    transport,
    togglePlay,
    play,
    pause,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
    playTrack,
  } = useAudioPlayer();

  const currentLessonId = currentTrack?.lessonId || currentTrack?.id;
  const isCurrentLesson = currentLessonId === lesson.id;
  const sortedAudioFiles = useMemo(() => getSortedAudioFiles(lesson), [lesson]);
  const lessonAudioAssets = useMemo(() => getLessonAudioAssets(lesson), [lesson]);
  const primaryAudioAsset = lessonAudioAssets[0] || null;

  const createTrackFromAsset = useCallback((asset: LessonAudioAsset) => createLessonTrack(lesson, asset), [lesson]);

  // All parts of the lesson form the queue, so a multi-part lesson plays through
  // and car "next"/"previous" move between its parts.
  const playAsset = useCallback(
    (index: number, startAt?: number) => {
      const tracks = lessonAudioAssets.map(createTrackFromAsset);
      if (!tracks[index]) return;
      playTrack(tracks[index], { queue: tracks, queueIndex: index, startAt });
    },
    [createTrackFromAsset, lessonAudioAssets, playTrack],
  );

  /** Jump to a position of the lesson's main file, starting the lesson if another one plays. */
  const seekLesson = useCallback(
    (position: number) => {
      if (isCurrentLesson) seekTo(position);
      else playAsset(0, position);
    },
    [isCurrentLesson, playAsset, seekTo],
  );

  // ── Deep links: ?start=&end= (shared clip) and ?t=[&file=<audioFileId>] (bookmark, note) ──
  const clipStartParam = searchParams.get('start');
  const clipEndParam = searchParams.get('end');
  const timeParam = searchParams.get('t');
  const fileParam = searchParams.get('file');
  const clipStart = clipStartParam ? parseFloat(clipStartParam) : null;
  const clipEnd = clipEndParam ? parseFloat(clipEndParam) : null;
  const deepLinkTime = clipStart ?? (timeParam ? parseFloat(timeParam) : null);
  const isClipMode = clipStart !== null;
  const deepLinkHandledRef = useRef(false);
  const clipEndHandledRef = useRef(false);

  useEffect(() => {
    if (deepLinkHandledRef.current || deepLinkTime === null || !Number.isFinite(deepLinkTime)) return;
    if (!primaryAudioAsset) return;
    deepLinkHandledRef.current = true;
    // Links point into the main file unless they name another part. If the
    // browser refuses to autoplay, the player waits at this position with the
    // play button showing.
    const index = Math.max(0, fileParam ? lessonAudioAssets.findIndex((asset) => asset.audioFileId === fileParam) : 0);
    if (isCurrentLesson && isFileActive(lessonAudioAssets[index])) {
      seekTo(deepLinkTime);
      play();
    } else {
      playAsset(index, deepLinkTime);
    }
    // Runs once per page visit; isFileActive reads the current track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkTime, primaryAudioAsset]);

  // Pause once at the end of a shared clip.
  useEffect(() => {
    if (clipEnd === null || clipEndHandledRef.current || !isCurrentLesson) return;
    if (currentTime >= clipEnd) {
      clipEndHandledRef.current = true;
      pause();
    }
  }, [clipEnd, currentTime, isCurrentLesson, pause]);

  const handlePlay = () => {
    if (isCurrentLesson) togglePlay();
    else playAsset(0);
  };

  // Audio file list helpers
  function isFileActive(asset: LessonAudioAsset): boolean {
    if (!currentTrack || !isCurrentLesson) return false;
    if (currentTrack.audioFileId && asset.audioFileId) {
      return currentTrack.audioFileId === asset.audioFileId;
    }
    const normalizedFileUrl = normalizeAudioUrl(asset.audioUrl);
    return currentTrack.audioUrl === normalizedFileUrl || currentTrack.audioUrl === asset.audioUrl;
  }

  // Track the currently playing audio file ID for snippet submissions
  // Falls back to first audio file when nothing is playing (free action)
  const currentAudioFileId = useMemo(() => {
    if (currentTrack && isCurrentLesson) {
      const activeAsset = lessonAudioAssets.find((asset) => isFileActive(asset));
      if (activeAsset?.audioFileId) return activeAsset.audioFileId;
    }
    // Default to first audio file when not playing
    return sortedAudioFiles[0]?.id ?? null;
  }, [currentTrack, isCurrentLesson, lessonAudioAssets, sortedAudioFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFileClick(asset: LessonAudioAsset, index: number) {
    if (isFileActive(asset)) togglePlay();
    else playAsset(index);
  }

  // ---- Offline download state (inlined — webpack workaround) ----
  const [dlState, setDlState] = useState<Record<string, DownloadState>>({});
  const [dlProgress, setDlProgress] = useState<Record<string, number>>({});
  const [downloadedKeys, setDownloadedKeys] = useState<Set<string>>(new Set());
  const [downloadedAudioUrls, setDownloadedAudioUrls] = useState<Set<string>>(new Set());
  const [offlineSaveError, setOfflineSaveError] = useState<'quota' | 'failed' | null>(null);
  const tOffline = useTranslations('offline');

  const updateDownloadedRefs = useCallback((downloadedLesson: Awaited<ReturnType<typeof getDownloadedLesson>>) => {
    const files = downloadedLesson?.audioFiles ?? [];
    setDownloadedKeys(new Set(files.map((file) => file.offlineKey)));
    setDownloadedAudioUrls(new Set(files.map((file) => normalizeAudioUrl(file.audioUrl) || file.audioUrl)));
  }, []);

  const refreshDownloadedKeys = useCallback(async () => {
    const downloadedLesson = await getDownloadedLesson(lesson.id);
    updateDownloadedRefs(downloadedLesson);
  }, [lesson.id, updateDownloadedRefs]);

  useEffect(() => {
    let cancelled = false;
    getDownloadedLesson(lesson.id).then((downloadedLesson) => {
      if (!cancelled) {
        updateDownloadedRefs(downloadedLesson);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [lesson.id, updateDownloadedRefs]);

  useEffect(() => {
    const handleOfflineDownloadsChanged = (event: Event) => {
      if (isOfflineDownloadsChangedEvent(event, lesson.id)) {
        void refreshDownloadedKeys();
      }
    };

    window.addEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleOfflineDownloadsChanged);
    return () => window.removeEventListener(OFFLINE_DOWNLOADS_CHANGED_EVENT, handleOfflineDownloadsChanged);
  }, [lesson.id, refreshDownloadedKeys]);

  const isAssetDownloaded = useCallback(
    (asset: LessonAudioAsset): boolean => {
      const normalizedAssetUrl = normalizeAudioUrl(asset.audioUrl) || asset.audioUrl;
      return downloadedKeys.has(asset.offlineKey) || downloadedAudioUrls.has(normalizedAssetUrl);
    },
    [downloadedAudioUrls, downloadedKeys],
  );

  const getAssetDownloadState = useCallback(
    (asset: LessonAudioAsset): DownloadState => {
      const state = dlState[asset.offlineKey] || 'idle';
      if (isAssetDownloaded(asset) && state === 'idle') return 'downloaded';
      return state;
    },
    [dlState, isAssetDownloaded],
  );

  const allAudioDownloaded =
    lessonAudioAssets.length > 0 && lessonAudioAssets.every((asset) => isAssetDownloaded(asset));
  const lessonSaveState: DownloadState =
    dlState.__lesson === 'downloading'
      ? 'downloading'
      : dlState.__lesson === 'error'
        ? 'error'
        : allAudioDownloaded
          ? 'downloaded'
          : 'idle';

  const saveAudioAssets = useCallback(
    async (assets: LessonAudioAsset[], stateKey: string) => {
      if (assets.length === 0 || dlState[stateKey] === 'downloading') return;
      setDlState((prev) => ({ ...prev, [stateKey]: 'downloading' }));
      setDlProgress((prev) => ({ ...prev, [stateKey]: 0 }));

      const result = await saveAudioFilesOffline(
        lesson.id,
        assets.map((asset) => ({
          audioFileId: asset.audioFileId,
          fileKey: asset.fileKey,
          audioUrl: asset.audioUrl,
          title: asset.title,
          originalName: asset.originalName,
          audioType: asset.audioType,
          duration: asset.duration,
          fileSize: asset.fileSize,
          sortOrder: asset.sortOrder,
        })),
        {
          lessonId: lesson.id,
          title: lesson.title,
          hebrewTitle: lesson.hebrew_title || lesson.title,
          duration: lesson.duration,
          seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
          date: lesson.date,
        },
        (pct) => setDlProgress((prev) => ({ ...prev, [stateKey]: pct })),
      );

      // Saved files (also from a partial save) arrive via OFFLINE_DOWNLOADS_CHANGED_EVENT.
      if (result.ok) {
        setDlState((prev) => {
          const next = { ...prev, [stateKey]: 'downloaded' as DownloadState };
          for (const asset of assets) next[asset.offlineKey] = 'downloaded';
          return next;
        });
      } else {
        setDlState((prev) => ({ ...prev, [stateKey]: 'error' }));
        setOfflineSaveError(result.reason);
        setTimeout(() => {
          setDlState((prev) => ({ ...prev, [stateKey]: 'idle' }));
          setOfflineSaveError(null);
        }, 5000);
      }
    },
    [dlState, lesson],
  );

  const handleSaveLessonOffline = useCallback(() => {
    const remainingAssets = lessonAudioAssets.filter((asset) => !isAssetDownloaded(asset));
    saveAudioAssets(remainingAssets.length > 0 ? remainingAssets : lessonAudioAssets, '__lesson');
  }, [isAssetDownloaded, lessonAudioAssets, saveAudioAssets]);

  const handleSaveAssetOffline = useCallback(
    (asset: LessonAudioAsset) => {
      saveAudioAssets([asset], asset.offlineKey);
    },
    [saveAudioAssets],
  );

  // ---- Bookmark state ----
  // Position captured when the dialog opens, so typing a note does not move it.
  const [bookmarkPosition, setBookmarkPosition] = useState<number | null>(null);
  const [showShareClipDialog, setShowShareClipDialog] = useState(false);
  // Use stable selector (returns same reference between updates), then filter with useMemo
  const allBookmarks = useBookmarksStore((s) => s.bookmarks);
  const lessonBookmarks = useMemo(
    () => allBookmarks.filter((b) => b.lessonId === lesson.id).sort((a, b) => a.position - b.position),
    [allBookmarks, lesson.id],
  );
  const bookmarkCount = lessonBookmarks.length;

  // ---- Notes: local-first, mirrored to the account when signed in ----
  const tNotes = useTranslations('library.notes');
  const allNotes = useNotesStore((s) => s.notes);
  const notesSignedIn = useNotesStore((s) => s.accountUserId !== null);
  const addNote = useNotesStore((s) => s.addNote);
  const updateNote = useNotesStore((s) => s.updateNote);
  const removeNote = useNotesStore((s) => s.removeNote);
  const addNoteImage = useNotesStore((s) => s.addImage);
  const removeNoteImage = useNotesStore((s) => s.removeImage);
  // Notes come from localStorage: render them only after hydration.
  const [notesHydrated, setNotesHydrated] = useState(false);
  useEffect(() => setNotesHydrated(true), []);
  const lessonNotes = useMemo(
    () =>
      notesHydrated
        ? allNotes
            .filter((note) => note.lessonId === lesson.id)
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        : [],
    [allNotes, lesson.id, notesHydrated],
  );
  const [notesOpen, setNotesOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [attachTimestamp, setAttachTimestamp] = useState(true);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);
  const [uploadingNoteId, setUploadingNoteId] = useState<string | null>(null);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);
  const noteImageInputRef = useRef<HTMLInputElement>(null);
  /** 'new' = the composer, otherwise the id of the note receiving the picked images. */
  const noteImageTargetRef = useRef<string>('new');

  const pendingPreviews = useMemo(() => pendingImages.map((file) => URL.createObjectURL(file)), [pendingImages]);
  useEffect(() => () => pendingPreviews.forEach((url) => URL.revokeObjectURL(url)), [pendingPreviews]);

  const uploadNoteImages = async (noteId: string, files: File[]) => {
    const attached = useNotesStore.getState().notes.find((note) => note.id === noteId)?.images.length ?? 0;
    const room = Math.max(0, MAX_NOTE_IMAGES - attached);
    if (files.length > room) setNoteMessage(tNotes('errors.too_many', { max: MAX_NOTE_IMAGES }));
    setUploadingNoteId(noteId);
    try {
      for (const file of files.slice(0, room)) {
        const prepared = await prepareNoteImage(file);
        const result = 'error' in prepared ? prepared : await addNoteImage(noteId, prepared);
        if (!result.error) continue;
        setNoteMessage(tNotes(`errors.${result.error}`, { max: MAX_NOTE_IMAGES }));
        // A bad file skips only itself; account/network problems stop the batch.
        if (result.error !== 'too_large' && result.error !== 'unsupported' && result.error !== 'empty') break;
      }
    } finally {
      setUploadingNoteId(null);
    }
  };

  const pickNoteImages = (target: string) => {
    noteImageTargetRef.current = target;
    noteImageInputRef.current?.click();
  };

  const handleNoteImagesPicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setNoteMessage(null);
    const target = noteImageTargetRef.current;
    if (target !== 'new') {
      void uploadNoteImages(target, files);
      return;
    }
    const combined = [...pendingImages, ...files];
    if (combined.length > MAX_NOTE_IMAGES) setNoteMessage(tNotes('errors.too_many', { max: MAX_NOTE_IMAGES }));
    setPendingImages(combined.slice(0, MAX_NOTE_IMAGES));
  };

  const handleAddNote = async () => {
    const body = newNoteText.trim();
    if (!body) return;
    const withTime = attachTimestamp && isCurrentLesson;
    const saving = addNote({
      lessonId: lesson.id,
      body,
      position: withTime ? currentTime : null,
      audioFileId: withTime ? currentAudioFileId : null,
      lessonTitle: lesson.hebrew_title || lesson.title,
    });
    const files = pendingImages;
    setNewNoteText('');
    setPendingImages([]);
    setNoteMessage(null);
    const { note, error } = await saving;
    if (error) setNoteMessage(tNotes('errors.syncFailed'));
    else if (files.length > 0) await uploadNoteImages(note.id, files);
  };

  const handleSaveEdit = async () => {
    const body = editingNoteText.trim();
    if (!editingNoteId || !body) return;
    const id = editingNoteId;
    setEditingNoteId(null);
    setEditingNoteText('');
    if ((await updateNote(id, body)).error) setNoteMessage(tNotes('errors.syncFailed'));
  };

  const handleDeleteNote = async (noteId: string) => {
    if (confirmDeleteNoteId !== noteId) {
      setConfirmDeleteNoteId(noteId);
      setTimeout(() => setConfirmDeleteNoteId((current) => (current === noteId ? null : current)), 3000);
      return;
    }
    setConfirmDeleteNoteId(null);
    if ((await removeNote(noteId)).error) setNoteMessage(tNotes('errors.syncFailed'));
  };

  const handleRemoveNoteImage = async (noteId: string, imageId: string) => {
    if ((await removeNoteImage(noteId, imageId)).error) setNoteMessage(tNotes('errors.failed'));
  };

  /** Plays the note's audio file from its position (the main file for notes without one). */
  const seekNote = (note: LocalNote) => {
    if (note.position === null) return;
    const index = Math.max(0, lessonAudioAssets.findIndex((asset) => asset.audioFileId === note.audioFileId));
    const asset = lessonAudioAssets[index];
    if (!asset) return;
    if (isFileActive(asset)) seekTo(note.position);
    else playAsset(index, note.position);
  };

  const displayTime = isCurrentLesson ? currentTime : 0;
  const displayDuration = isCurrentLesson ? duration : lesson.duration;
  const lessonSaveProgress = dlProgress.__lesson || 0;
  const primaryDownloadFilename = primaryAudioAsset ? getAudioAssetFilename(lesson, primaryAudioAsset) : '';
  const primaryDownloadUrl = primaryAudioAsset
    ? getAudioDownloadUrl(primaryAudioAsset.audioUrl, primaryDownloadFilename)
    : '#';

  return (
    <div className="space-y-4">
      {/* Clip mode badge */}
      {isClipMode && clipStart !== null && clipEnd !== null && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
          <Scissors className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-primary">
            {t('clipMode')}:{' '}
            <bdi dir="ltr">
              {formatDur(clipStart)}–{formatDur(clipEnd)}
            </bdi>
          </span>
        </div>
      )}

      <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-5 space-y-4">
        <BookmarkChips bookmarks={lessonBookmarks} onSeek={seekLesson} />

        {/* Seek bar with bookmark markers; seeking another lesson's bar starts this one */}
        <div className="relative">
          <SeekBar currentTime={displayTime} duration={displayDuration} onSeek={seekLesson} />
          <BookmarkMarkers bookmarks={lessonBookmarks} duration={displayDuration} onSeek={seekLesson} />
        </div>

        {isCurrentLesson && playbackIssue && (
          <p role="status" className="text-center text-xs text-amber-300">
            {t(`issue.${playbackIssue}`)}
          </p>
        )}

        {/* Controls: back → play → forward in DOM order; RTL puts "back" on the right. */}
        <div className="flex items-center justify-center gap-6">
          <SpeedControl speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />

          <SkipButton
            direction="back"
            onClick={skipBackward}
            disabled={!isCurrentLesson}
            className="p-2 text-muted-foreground hover:text-foreground"
            iconClassName="h-7 w-7"
          />

          <button
            type="button"
            onClick={handlePlay}
            className="rounded-full p-4 bg-foreground text-background hover:scale-105 transition-transform shadow-lg"
            aria-label={isCurrentLesson && transport !== 'paused' ? t('pause') : t('play')}
          >
            <PlayPauseIcon transport={isCurrentLesson ? transport : 'paused'} className="h-7 w-7" />
          </button>

          <SkipButton
            direction="forward"
            onClick={skipForward}
            disabled={!isCurrentLesson}
            className="p-2 text-muted-foreground hover:text-foreground"
            iconClassName="h-7 w-7"
          />

          {/* Balances the speed control on the other side */}
          <div className="w-12" aria-hidden />
        </div>

        {/* Secondary actions row */}
        <div className="flex items-center justify-center gap-5 pt-1 flex-wrap">
          {/* Bookmark */}
          <button
            type="button"
            onClick={() => setBookmarkPosition(currentTime)}
            disabled={!isCurrentLesson}
            className={`flex flex-col items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${bookmarkCount > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <div className="relative">
              <Bookmark className={`h-5 w-5 ${bookmarkCount > 0 ? 'fill-current' : ''}`} />
              {bookmarkCount > 0 && (
                <span className="absolute -top-1.5 -end-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {bookmarkCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">{t('bookmark')}</span>
          </button>

          {/* Mark snippet — always enabled, not dependent on player state */}
          <button
            onClick={() => setShowShareClipDialog(true)}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Scissors className="h-5 w-5" />
            <span className="text-[10px]">{t('markSnippet')}</span>
          </button>

          {/* Driving mode */}
          <button
            onClick={() => {
              // Driving mode controls the current lesson; start this one if another is loaded.
              if (!isCurrentLesson) playAsset(0);
              router.push(`/${locale}/driving`);
            }}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Car className="h-5 w-5" />
            <span className="text-[10px]">{t('drivingMode')}</span>
          </button>

          {/* Save for offline playback */}
          <button
            onClick={handleSaveLessonOffline}
            disabled={
              lessonSaveState === 'downloaded' || lessonSaveState === 'downloading' || lessonAudioAssets.length === 0
            }
            className={`flex flex-col items-center gap-1.5 transition-colors disabled:cursor-not-allowed ${lessonSaveState === 'downloaded' ? 'text-green-400' : lessonSaveState === 'downloading' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {lessonSaveState === 'downloading' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : lessonSaveState === 'downloaded' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            <span className="text-[10px] whitespace-nowrap">
              {lessonSaveState === 'downloading'
                ? `${lessonSaveProgress}%`
                : lessonSaveState === 'downloaded'
                  ? locale === 'he'
                    ? 'נשמר'
                    : 'Saved'
                  : locale === 'he'
                    ? 'שמירה אופליין'
                    : 'Save offline'}
            </span>
          </button>
          {offlineSaveError && (
            <p
              role="alert"
              className="fixed inset-x-4 bottom-36 z-50 mx-auto max-w-md rounded-lg bg-destructive px-4 py-3 text-center text-sm text-destructive-foreground shadow-lg"
            >
              {tOffline(offlineSaveError === 'quota' ? 'storageFull' : 'saveFailed')}
            </p>
          )}

          {/* Device file download */}
          <a
            href={primaryDownloadUrl}
            download={primaryDownloadFilename}
            onClick={(e) => {
              if (!primaryAudioAsset) return;
              handleDeviceDownloadClick(e, {
                lessonId: lesson.id,
                offlineKey: primaryAudioAsset.offlineKey,
                audioUrl: primaryAudioAsset.audioUrl,
                filename: primaryDownloadFilename,
                savedOffline: isAssetDownloaded(primaryAudioAsset),
              });
            }}
            className={`flex flex-col items-center gap-1.5 transition-colors ${primaryAudioAsset ? 'text-muted-foreground hover:text-foreground' : 'pointer-events-none opacity-30'}`}
            aria-label={locale === 'he' ? 'הורדת קובץ למכשיר' : 'Download file to device'}
          >
            <FileDown className="h-5 w-5" />
            <span className="text-[10px] whitespace-nowrap">{locale === 'he' ? 'הורדת קובץ' : 'Download file'}</span>
          </a>

          {/* Cast */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              void handleCastClick();
            }}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Cast className="h-5 w-5" />
            <span className="text-[10px]">{t('cast')}</span>
          </button>
        </div>
      </div>

      {/* Audio files list (inlined to avoid webpack dev chunk issue) */}
      {lessonAudioAssets.length > 1 && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {t('audioFiles')}
          </h2>
          <div className="space-y-0.5">
            {lessonAudioAssets.map((asset, index) => {
              const active = isFileActive(asset);
              const activeTransport = active ? transport : 'paused';
              const assetDownloadState = getAssetDownloadState(asset);
              const assetProgress = dlProgress[asset.offlineKey] || 0;
              const assetFilename = getAudioAssetFilename(lesson, asset, index);
              return (
                <div
                  key={asset.offlineKey}
                  className={`w-full flex items-center gap-3 rounded-md p-2.5 transition-colors group text-start ${active ? 'bg-primary/10' : 'hover:bg-[hsl(var(--surface-highlight))]'}`}
                >
                  <button
                    type="button"
                    onClick={() => handleFileClick(asset, index)}
                    className="min-w-0 flex-1 flex items-center gap-3 text-start"
                    aria-label={activeTransport === 'paused' ? t('play') : t('pause')}
                  >
                    <span className="w-5 text-center flex-shrink-0">
                      {activeTransport === 'playing' ? (
                        <Volume2 className="h-4 w-4 text-primary animate-pulse mx-auto" />
                      ) : activeTransport === 'loading' ? (
                        <Loader2 className="h-4 w-4 text-primary animate-spin mx-auto" />
                      ) : active ? (
                        <Play className="h-4 w-4 text-primary fill-current mx-auto" />
                      ) : (
                        <>
                          <span className="text-sm font-medium text-muted-foreground group-hover:hidden">
                            {index + 1}
                          </span>
                          <Play className="h-4 w-4 text-foreground hidden group-hover:block mx-auto" />
                        </>
                      )}
                    </span>

                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${active ? 'text-primary' : ''}`} dir="auto">
                        {asset.originalName || asset.title || t('part', { number: index + 1 })}
                      </p>
                      {asset.audioType && (
                        <span
                          className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${asset.audioType === 'עץ חיים' ? 'bg-primary/15 text-primary' : 'bg-amber-500/15 text-amber-400'}`}
                        >
                          {asset.audioType}
                        </span>
                      )}
                    </div>

                    {asset.duration > 0 && (
                      <bdi className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                        {formatDur(asset.duration)}
                      </bdi>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveAssetOffline(asset);
                    }}
                    disabled={assetDownloadState === 'downloaded' || assetDownloadState === 'downloading'}
                    className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors disabled:cursor-not-allowed ${assetDownloadState === 'downloaded' ? 'text-green-400' : assetDownloadState === 'downloading' ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))]'}`}
                    aria-label={
                      assetDownloadState === 'downloaded'
                        ? locale === 'he'
                          ? 'נשמר לאופליין'
                          : 'Saved offline'
                        : assetDownloadState === 'downloading'
                          ? `${assetProgress}%`
                          : locale === 'he'
                            ? 'שמור קובץ לאופליין'
                            : 'Save file offline'
                    }
                    title={
                      assetDownloadState === 'downloading'
                        ? `${assetProgress}%`
                        : locale === 'he'
                          ? 'שמור לאופליין'
                          : 'Save offline'
                    }
                  >
                    {assetDownloadState === 'downloading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : assetDownloadState === 'downloaded' ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                  </button>

                  <a
                    href={getAudioDownloadUrl(asset.audioUrl, assetFilename)}
                    download={assetFilename}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeviceDownloadClick(e, {
                        lessonId: lesson.id,
                        offlineKey: asset.offlineKey,
                        audioUrl: asset.audioUrl,
                        filename: assetFilename,
                        savedOffline: assetDownloadState === 'downloaded',
                      });
                    }}
                    className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
                    aria-label={locale === 'he' ? 'הורדת קובץ למכשיר' : 'Download file to device'}
                    title={locale === 'he' ? 'הורדת קובץ' : 'Download file'}
                  >
                    <FileDown className="h-4 w-4" />
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Image gallery */}
      {images && images.length > 0 && <ImageGallerySection images={images} locale={locale} lessonTitle={lesson.title} />}

      {/* ==================== Notes (inlined: one client component per page) ==================== */}
      <section className="rounded-xl bg-[hsl(var(--surface-elevated))]" aria-labelledby="lesson-notes-title">
        <button
          type="button"
          onClick={() => setNotesOpen(!notesOpen)}
          aria-expanded={notesOpen}
          className="w-full flex items-center justify-between p-4 text-start"
        >
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            <h2 id="lesson-notes-title" className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              {tNotes('title')}
            </h2>
            {lessonNotes.length > 0 && (
              <span className="bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {lessonNotes.length}
              </span>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${notesOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {notesOpen && (
          <div className="px-4 pb-4 space-y-3">
            <input
              ref={noteImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              multiple
              hidden
              onChange={handleNoteImagesPicked}
            />

            {/* Composer */}
            <div className="space-y-2">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder={tNotes('placeholder')}
                aria-label={tNotes('placeholder')}
                maxLength={MAX_NOTE_LENGTH}
                className="w-full rounded-lg bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,20%)] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
                rows={2}
                dir="auto"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleAddNote();
                }}
              />

              {pendingImages.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {pendingPreviews.map((url, index) => (
                    <div key={url} className="relative shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
                      <img
                        src={url}
                        alt={tNotes('image', { index: index + 1 })}
                        className="h-14 w-14 rounded-lg object-cover bg-[hsl(var(--surface-highlight))]"
                      />
                      <button
                        type="button"
                        onClick={() => setPendingImages((files) => files.filter((_, i) => i !== index))}
                        className="absolute -top-1.5 -end-1.5 rounded-full bg-background p-0.5 text-muted-foreground shadow ring-1 ring-border hover:text-red-400"
                        aria-label={tNotes('removeImage')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={attachTimestamp && isCurrentLesson}
                    disabled={!isCurrentLesson}
                    onClick={() => setAttachTimestamp(!attachTimestamp)}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors disabled:opacity-40 ${
                      attachTimestamp && isCurrentLesson
                        ? 'bg-primary/15 text-primary'
                        : 'bg-[hsl(var(--surface-highlight))] text-muted-foreground'
                    }`}
                    title={isCurrentLesson ? undefined : tNotes('timeNeedsPlayback')}
                  >
                    <Clock className="h-3 w-3" />
                    {tNotes('attachTime')}
                    {attachTimestamp && isCurrentLesson && (
                      <bdi dir="ltr" className="font-mono font-bold tabular-nums">
                        {formatDur(currentTime) || '0:00'}
                      </bdi>
                    )}
                  </button>

                  {notesSignedIn ? (
                    <button
                      type="button"
                      onClick={() => pickNoteImages('new')}
                      disabled={pendingImages.length >= MAX_NOTE_IMAGES}
                      className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-highlight))] px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {tNotes('addImages')}
                    </button>
                  ) : (
                    <Link
                      href={`/${locale}/auth/sign-in?next=${encodeURIComponent(`/${locale}/lessons/${lesson.id}`)}`}
                      className="flex items-center gap-1.5 rounded-full bg-[hsl(var(--surface-highlight))] px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      {tNotes('imagesSignIn')}
                    </Link>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleAddNote()}
                  disabled={!newNoteText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tNotes('add')}
                </button>
              </div>
            </div>

            {noteMessage && (
              <p role="alert" className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                {noteMessage}
              </p>
            )}

            {/* Notes list, newest first */}
            {lessonNotes.length > 0 ? (
              <ul className="space-y-2 pt-1">
                {lessonNotes.map((note) => (
                  <li key={note.id} className="rounded-lg bg-[hsl(0,0%,10%)] p-3 space-y-2 group">
                    {editingNoteId === note.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          aria-label={tNotes('edit')}
                          maxLength={MAX_NOTE_LENGTH}
                          className="w-full rounded-lg bg-[hsl(0,0%,8%)] border border-primary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                          rows={3}
                          dir="auto"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditingNoteText('');
                            }}
                            className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {tNotes('cancel')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveEdit()}
                            disabled={!editingNoteText.trim()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 transition-colors"
                          >
                            <Check className="h-3 w-3" />
                            {tNotes('save')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words" dir="auto">
                        {note.body}
                      </p>
                    )}

                    <NoteImageStrip
                      images={note.images}
                      uploading={uploadingNoteId === note.id}
                      onRemove={
                        editingNoteId === note.id ? (imageId) => void handleRemoveNoteImage(note.id, imageId) : undefined
                      }
                    />

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {note.position !== null && (
                          <button
                            type="button"
                            onClick={() => seekNote(note)}
                            className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary hover:bg-primary/20 font-mono font-bold"
                            aria-label={tNotes('playFrom', { time: formatDur(note.position) || '0:00' })}
                          >
                            <Play className="h-2.5 w-2.5 fill-current" />
                            <bdi dir="ltr">{formatDur(note.position) || '0:00'}</bdi>
                          </button>
                        )}
                        <span>{new Date(note.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}</span>
                      </div>
                      <div className="flex items-center gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-within:opacity-100">
                        {notesSignedIn && note.images.length < MAX_NOTE_IMAGES && (
                          <button
                            type="button"
                            onClick={() => pickNoteImages(note.id)}
                            disabled={uploadingNoteId !== null}
                            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors disabled:opacity-40"
                            aria-label={tNotes('addImages')}
                          >
                            <ImagePlus className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(note.id);
                            setEditingNoteText(note.body);
                          }}
                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
                          aria-label={tNotes('edit')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteNote(note.id)}
                          className={`flex items-center gap-1 p-1 rounded transition-colors ${
                            confirmDeleteNoteId === note.id
                              ? 'bg-red-500/15 text-red-400'
                              : 'text-muted-foreground hover:text-red-400 hover:bg-red-500/10'
                          }`}
                          aria-label={confirmDeleteNoteId === note.id ? tNotes('confirmDelete') : tNotes('delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {confirmDeleteNoteId === note.id && <span className="text-[10px]">{tNotes('confirmDelete')}</span>}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">{tNotes('empty')}</p>
            )}
          </div>
        )}
      </section>

      {bookmarkPosition !== null && (
        <BookmarkDialog
          onClose={() => setBookmarkPosition(null)}
          lessonId={lesson.id}
          position={bookmarkPosition}
        />
      )}

      {/* Mark snippet dialog — inlined to avoid separate 'use client' import */}
      <MarkSnippetDialogInline
        isOpen={showShareClipDialog}
        onClose={() => setShowShareClipDialog(false)}
        lessonId={lesson.id}
        currentAudioFileId={currentAudioFileId}
        currentTime={isCurrentLesson ? currentTime : 0}
        duration={isCurrentLesson ? duration : lesson.duration}
      />
    </div>
  );
}

// ==================== Image Gallery (inlined to share webpack chunk) ====================

function getImageStreamUrl(fileKey: string) {
  const encodedKey = encodeURIComponent(fileKey);
  return `/api/images/stream/${encodedKey}`;
}

function ImageGallerySection({
  images,
  locale,
  lessonTitle,
}: {
  images: LessonImage[];
  locale: string;
  lessonTitle: string;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);

  const goNext = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex + 1) % sorted.length);
    }
  };
  const goPrev = () => {
    if (lightboxIndex !== null) {
      setLightboxIndex((lightboxIndex - 1 + sorted.length) % sorted.length);
    }
  };

  return (
    <div>
      <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider" dir="rtl">
        {locale === 'he' ? 'תמונות' : 'Images'}
      </h2>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {sorted.map((img, i) => (
          <button
            key={img.id}
            onClick={() => openLightbox(i)}
            className="relative aspect-square rounded-lg overflow-hidden bg-[hsl(var(--surface-elevated))] hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <img
              src={getImageStreamUrl(img.file_key)}
              alt={img.caption || `${lessonTitle} – ${i + 1}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center" onClick={closeLightbox}>
          <button
            onClick={closeLightbox}
            className="absolute top-4 end-4 z-10 rounded-full p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <div className="absolute top-5 start-4 text-sm text-white/60 tabular-nums">
            {lightboxIndex + 1} / {sorted.length}
          </div>

          {sorted.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute start-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Previous"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <img
            src={getImageStreamUrl(sorted[lightboxIndex].file_key)}
            alt={sorted[lightboxIndex].caption || `${lessonTitle} – ${lightboxIndex + 1}`}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {sorted.length > 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute end-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Next"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {sorted[lightboxIndex].caption && (
            <div className="absolute bottom-6 inset-x-0 text-center">
              <p className="text-sm text-white/80 bg-black/50 inline-block px-4 py-2 rounded-full" dir="rtl">
                {sorted[lightboxIndex].caption}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
