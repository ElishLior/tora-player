'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Play, Pause, Cast, Volume2, X, ChevronRight, ChevronLeft, ChevronDown, StickyNote, Plus, Trash2, Pencil, Clock, Check, Scissors, Share2, Car, Download, CheckCircle, Loader2, Bookmark } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import { handleCastClick } from '@/lib/cast-utils';
import type { LessonWithRelations, LessonAudio, LessonImage } from '@/types/database';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { getNotes, addNote, updateNote, deleteNote, type LocalNote } from '@/lib/local-notes';
import { downloadLesson, isLessonDownloaded } from '@/lib/offline-storage';
import { useBookmarksStore } from '@/stores/bookmarks-store';

// ---- Inlined bookmark dialog (webpack workaround: no separate 'use client' imports) ----
const BOOKMARK_TAGS = [
  { value: 'important', label: 'חשוב', labelEn: 'Important', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'review', label: 'לחזור', labelEn: 'Review', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'quote', label: 'ציטוט', labelEn: 'Quote', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'question', label: 'שאלה', labelEn: 'Question', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

function Skip15Back({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1L7 5l5 4V5" />
      <path d="M19.07 7.93A8 8 0 1 1 7 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function Skip15Forward({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5V1l5 4-5 4V5" />
      <path d="M4.93 7.93A8 8 0 1 0 17 5.3" />
      <text x="12" y="15.5" textAnchor="middle" fill="currentColor" stroke="none" fontSize="7.5" fontWeight="bold" fontFamily="system-ui">15</text>
    </svg>
  );
}

function formatDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Inlined — cannot import separate 'use client' files into this component
function BookmarkDialogInline({ isRTL, position, lessonId, onClose }: {
  isRTL: boolean;
  position: number;
  lessonId: string;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('important');
  const addBookmark = useBookmarksStore((s) => s.addBookmark);

  const handleSave = () => {
    addBookmark(lessonId, position, note, selectedTag);
    setNote('');
    setSelectedTag('important');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full sm:max-w-md bg-[hsl(0,0%,12%)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">{isRTL ? 'הוסף סימניה' : 'Add Bookmark'}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{isRTL ? 'זמן:' : 'Time:'}</span>
          <span className="font-mono text-primary font-bold text-base">{formatDur(Math.round(position)) || '0:00'}</span>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground font-medium">{isRTL ? 'סוג' : 'Tag'}</label>
          <div className="flex flex-wrap gap-2">
            {BOOKMARK_TAGS.map((tag) => (
              <button
                key={tag.value}
                onClick={() => setSelectedTag(tag.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selectedTag === tag.value
                    ? `${tag.color} border-current ring-1 ring-current/30 scale-105`
                    : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground border-transparent hover:border-[hsl(0,0%,30%)]'
                }`}
              >
                {isRTL ? tag.label : tag.labelEn}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground font-medium">{isRTL ? 'הערה (אופציונלי)' : 'Note (optional)'}</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isRTL ? 'כתוב הערה...' : 'Write a note...'}
            className="w-full rounded-xl bg-[hsl(var(--surface-elevated))] border border-[hsl(0,0%,22%)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
            rows={3}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 rounded-xl bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            {isRTL ? 'ביטול' : 'Cancel'}
          </button>
          <button onClick={handleSave} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors">
            {isRTL ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Inlined share clip dialog (webpack workaround) ----
function ShareClipDialogInline({
  isOpen,
  onClose,
  lessonId,
  currentTime: ct,
  duration: dur,
  lessonTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  currentTime: number;
  duration: number;
  lessonTitle: string;
}) {
  const defaultStart = Math.max(0, Math.floor(ct) - 30);
  const defaultEnd = Math.min(Math.floor(dur), Math.floor(ct) + 30);

  const [startMin, setStartMin] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endMin, setEndMin] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

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
      setCopied(false);
      setShared(false);
    }
  }, [isOpen, defaultStart, defaultEnd]);

  const startTotal = Math.max(0, startMin * 60 + startSec);
  const endTotal = Math.max(0, endMin * 60 + endSec);
  const clipDuration = Math.max(0, endTotal - startTotal);
  const isValid = endTotal > startTotal && startTotal >= 0 && endTotal <= Math.ceil(dur);

  const generateUrl = useCallback(() => {
    return `https://tora-player.vercel.app/he/lessons/${encodeURIComponent(lessonId)}?start=${startTotal}&end=${endTotal}`;
  }, [lessonId, startTotal, endTotal]);

  const shareText = useCallback(() => {
    return `${lessonTitle}\n✂ קטע: ${formatDur(startTotal)} - ${formatDur(endTotal)}\n${generateUrl()}`;
  }, [lessonTitle, startTotal, endTotal, generateUrl]);

  const handleShare = async () => {
    const text = shareText();
    const url = generateUrl();
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${lessonTitle} - קטע`, text, url });
        setShared(true);
        setTimeout(() => onClose(), 1200);
      } catch {
        await copyClip(text);
      }
    } else {
      await copyClip(text);
    }
  };

  const copyClip = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!isOpen) return null;

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
            <h2 className="text-base font-bold text-white">שתף קטע</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5 space-y-5" dir="rtl">
          <p className="text-sm text-white/60 truncate">{lessonTitle}</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">התחלה</label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input type="number" min={0} max={99} value={startMin} onChange={(e) => setStartMin(Math.max(0, parseInt(e.target.value) || 0))} className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input type="number" min={0} max={59} value={startSec} onChange={(e) => setStartSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">סיום</label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input type="number" min={0} max={99} value={endMin} onChange={(e) => setEndMin(Math.max(0, parseInt(e.target.value) || 0))} className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50" />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input type="number" min={0} max={59} value={endSec} onChange={(e) => setEndSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))} className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>
          </div>
          <div className="rounded-lg bg-[hsl(0,0%,8%)] px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-white/50">משך הקטע</span>
            <span className={`text-sm font-mono font-bold tabular-nums ${isValid ? 'text-primary' : 'text-red-400'}`}>
              {isValid ? formatDur(clipDuration) : 'לא תקין'}
            </span>
          </div>
          {!isValid && <p className="text-xs text-red-400 text-center">זמן הסיום חייב להיות אחרי זמן ההתחלה</p>}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors">ביטול</button>
            <button onClick={handleShare} disabled={!isValid} className="flex-1 py-3 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
              {copied ? <><Check className="h-4 w-4" />הועתק!</> : shared ? <><Check className="h-4 w-4" />שותף!</> : <><Share2 className="h-4 w-4" />שתף קטע</>}
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    playbackSpeed,
    togglePlay,
    skipForward,
    skipBackward,
    seekTo,
    setPlaybackSpeed,
    playTrack,
    setTrack,
  } = useAudioPlayer();

  const isCurrentLesson = currentTrack?.id === lesson.id;

  // ── Clip mode: read start/end from URL search params ──
  const clipStartParam = searchParams.get('start');
  const clipEndParam = searchParams.get('end');
  const clipStart = clipStartParam ? parseFloat(clipStartParam) : null;
  const clipEnd = clipEndParam ? parseFloat(clipEndParam) : null;
  const isClipMode = clipStart !== null;
  const clipSeekDoneRef = useRef(false);

  // Auto-seek to clip start when the track loads for this lesson
  useEffect(() => {
    if (clipStart === null || clipSeekDoneRef.current) return;
    if (!isCurrentLesson) return;
    // Wait until duration is available (track loaded)
    if (duration <= 0) return;

    seekTo(clipStart);
    clipSeekDoneRef.current = true;
  }, [clipStart, isCurrentLesson, duration, seekTo]);

  // Auto-play the lesson if clip link and not yet playing this lesson
  useEffect(() => {
    if (clipStart === null) return;
    if (isCurrentLesson) return; // Already playing this lesson
    if (clipSeekDoneRef.current) return; // Already handled

    // Start playing the lesson so the seek effect above can fire
    playTrack({
      id: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: normalizeAudioUrl(lesson.audio_url) || lesson.audio_url!,
      audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
      duration: lesson.duration,
      seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
      date: lesson.date,
      description: lesson.description || lesson.summary || undefined,
    });
  }, [clipStart, isCurrentLesson]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-pause at clip end
  useEffect(() => {
    if (clipEnd === null || !isCurrentLesson || !isPlaying) return;
    if (currentTime >= clipEnd) {
      togglePlay();
    }
  }, [clipEnd, currentTime, isCurrentLesson, isPlaying, togglePlay]);

  const handlePlay = () => {
    if (isCurrentLesson) {
      togglePlay();
    } else {
      playTrack({
        id: lesson.id,
        title: lesson.title,
        hebrewTitle: lesson.hebrew_title || lesson.title,
        audioUrl: normalizeAudioUrl(lesson.audio_url) || lesson.audio_url!,
        audioUrlFallback: normalizeAudioUrl(lesson.audio_url_fallback) || undefined,
        duration: lesson.duration,
        seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
        date: lesson.date,
        description: lesson.description || lesson.summary || undefined,
      });
    }
  };

  // Audio file list helpers
  const audioFiles = lesson.audio_files || [];
  const sortedAudioFiles = [...audioFiles].sort((a, b) => a.sort_order - b.sort_order);

  function isFileActive(audio: LessonAudio): boolean {
    if (!currentTrack) return false;
    const normalizedFileUrl = normalizeAudioUrl(audio.audio_url);
    return currentTrack.audioUrl === normalizedFileUrl || currentTrack.audioUrl === audio.audio_url;
  }

  function handleFileClick(audio: LessonAudio) {
    if (isFileActive(audio)) {
      togglePlay();
      return;
    }
    setTrack({
      id: lesson.id,
      title: lesson.title,
      hebrewTitle: lesson.hebrew_title || lesson.title,
      audioUrl: normalizeAudioUrl(audio.audio_url) || audio.audio_url,
      duration: audio.duration || lesson.duration,
      seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined,
      date: lesson.date,
      description: lesson.description || lesson.summary || undefined,
    });
  }

  // ---- Offline download state (inlined — webpack workaround) ----
  const [dlState, setDlState] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [dlProgress, setDlProgress] = useState(0);
  const [isDownloaded, setIsDownloaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isLessonDownloaded(lesson.id).then((v) => { if (!cancelled) setIsDownloaded(v); });
    return () => { cancelled = true; };
  }, [lesson.id]);

  const effectiveDlState = isDownloaded && dlState === 'idle' ? 'downloaded' : dlState;

  const handleDownload = useCallback(async () => {
    if (effectiveDlState === 'downloaded' || effectiveDlState === 'downloading') return;
    const audioUrl = normalizeAudioUrl(lesson.audio_url) || lesson.audio_url;
    if (!audioUrl) return;
    setDlState('downloading');
    setDlProgress(0);
    const success = await downloadLesson(
      lesson.id, audioUrl,
      { lessonId: lesson.id, title: lesson.title, hebrewTitle: lesson.hebrew_title || lesson.title, audioUrl, duration: lesson.duration, fileSize: 0, seriesName: lesson.series?.hebrew_name || lesson.series?.name || undefined, date: lesson.date },
      (pct) => setDlProgress(pct),
    );
    if (success) { setDlState('downloaded'); setIsDownloaded(true); }
    else { setDlState('error'); setTimeout(() => setDlState('idle'), 3000); }
  }, [effectiveDlState, lesson]);

  // ---- Bookmark state ----
  const [showBookmarkDialog, setShowBookmarkDialog] = useState(false);
  const [showShareClipDialog, setShowShareClipDialog] = useState(false);
  // Use stable selector (returns same reference between updates), then filter with useMemo
  const allBookmarks = useBookmarksStore((s) => s.bookmarks);
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const lessonBookmarks = useMemo(
    () => allBookmarks.filter((b) => b.lessonId === lesson.id).sort((a, b) => a.position - b.position),
    [allBookmarks, lesson.id]
  );
  const bookmarkCount = lessonBookmarks.length;

  // Tag color map for bookmark markers on seek bar
  const tagColorMap: Record<string, string> = {
    important: 'bg-red-400',
    review: 'bg-amber-400',
    quote: 'bg-blue-400',
    question: 'bg-purple-400',
  };

  // ---- Notes state ----
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [notesOpen, setNotesOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [attachTimestamp, setAttachTimestamp] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Load notes from localStorage
  useEffect(() => {
    setNotes(getNotes(lesson.id));
  }, [lesson.id]);

  const refreshNotes = useCallback(() => {
    setNotes(getNotes(lesson.id));
  }, [lesson.id]);

  const handleAddNote = () => {
    const text = newNoteText.trim();
    if (!text) return;
    const ts = attachTimestamp && isCurrentLesson ? currentTime : undefined;
    addNote(lesson.id, text, ts);
    setNewNoteText('');
    setAttachTimestamp(false);
    refreshNotes();
  };

  const handleDeleteNote = (noteId: string) => {
    deleteNote(lesson.id, noteId);
    refreshNotes();
  };

  const handleStartEdit = (note: LocalNote) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const handleSaveEdit = () => {
    if (editingNoteId && editingNoteText.trim()) {
      updateNote(lesson.id, editingNoteId, editingNoteText.trim());
      setEditingNoteId(null);
      setEditingNoteText('');
      refreshNotes();
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const displayTime = isCurrentLesson ? currentTime : 0;
  const displayDuration = isCurrentLesson ? duration : lesson.duration;

  return (
    <div className="space-y-4">
      {/* Clip mode badge */}
      {isClipMode && clipStart !== null && clipEnd !== null && (
        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20" dir="rtl">
          <Scissors className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-primary">
            מצב קטע: {formatDur(clipStart)} - {formatDur(clipEnd)}
          </span>
        </div>
      )}

      <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-5 space-y-4">
        {/* Bookmark chips row */}
        {lessonBookmarks.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap" dir={locale === 'he' ? 'rtl' : 'ltr'}>
            {lessonBookmarks.map((bm) => (
              <button
                key={bm.id}
                onClick={() => { if (isCurrentLesson) seekTo(bm.position); }}
                onContextMenu={(e) => { e.preventDefault(); removeBookmark(bm.id); }}
                className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 transition-colors"
                title={bm.note || (locale === 'he' ? 'לחץ לדלג, לחץ ימני למחיקה' : 'Click to seek, right-click to delete')}
              >
                <Bookmark className="h-3 w-3 fill-current" />
                {formatDur(bm.position)}
              </button>
            ))}
          </div>
        )}

        {/* Seek bar with bookmark markers */}
        <div className="relative">
          <SeekBar
            currentTime={displayTime}
            duration={displayDuration}
            onSeek={seekTo}
          />
          {/* Bookmark markers overlay on seek bar */}
          {displayDuration > 0 && lessonBookmarks.length > 0 && (
            <div className="absolute top-0 inset-x-0 h-5 pointer-events-auto" style={{ zIndex: 1 }}>
              {lessonBookmarks.map((bm) => {
                const pct = (bm.position / displayDuration) * 100;
                const colorClass = tagColorMap[bm.tag] || 'bg-primary';
                return (
                  <button
                    key={bm.id}
                    onClick={() => seekTo(bm.position)}
                    className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full ${colorClass} border border-black/30 shadow-sm hover:scale-150 transition-transform cursor-pointer`}
                    style={{ left: `calc(${pct}% - 5px)` }}
                    title={bm.note || ''}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Controls — dir="ltr" keeps standard media player layout (⏪ ▶ ⏩) */}
        <div dir="ltr" className="flex items-center justify-center gap-6">
          <SpeedControl
            speed={isCurrentLesson ? playbackSpeed : 1}
            onSpeedChange={setPlaybackSpeed}
          />

          {/* In RTL: left = forward in time, right = backward. Icons stay, handlers swap. */}
          <button
            onClick={() => skipForward(15)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            disabled={!isCurrentLesson}
          >
            <Skip15Back className="h-7 w-7" />
          </button>

          <button
            onClick={handlePlay}
            className="rounded-full p-4 bg-foreground text-background hover:scale-105 transition-transform shadow-lg"
          >
            {isCurrentLesson && isPlaying ? (
              <Pause className="h-7 w-7 fill-current" />
            ) : (
              <Play className="h-7 w-7 fill-current ml-0.5" />
            )}
          </button>

          {/* In RTL: right side = backward in time */}
          <button
            onClick={() => skipBackward(15)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            disabled={!isCurrentLesson}
          >
            <Skip15Forward className="h-7 w-7" />
          </button>

          {/* Spacer for symmetry */}
          <div className="w-10" />
        </div>

        {/* Secondary actions row */}
        <div className="flex items-center justify-center gap-5 pt-1 flex-wrap" dir="rtl">
          {/* Bookmark */}
          <button
            onClick={() => setShowBookmarkDialog(true)}
            disabled={!isCurrentLesson}
            className={`flex flex-col items-center gap-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              bookmarkCount > 0 ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <div className="relative">
              <Bookmark className={`h-5 w-5 ${bookmarkCount > 0 ? 'fill-current' : ''}`} />
              {bookmarkCount > 0 && (
                <span className="absolute -top-1.5 -end-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                  {bookmarkCount}
                </span>
              )}
            </div>
            <span className="text-[10px]">{locale === 'he' ? 'סימניה' : 'Bookmark'}</span>
          </button>

          {/* Share clip */}
          <button
            onClick={() => setShowShareClipDialog(true)}
            disabled={!isCurrentLesson}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Scissors className="h-5 w-5" />
            <span className="text-[10px]">{locale === 'he' ? 'שתף קטע' : 'Share Clip'}</span>
          </button>

          {/* Driving mode */}
          <button
            onClick={() => router.push(`/${locale}/driving`)}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Car className="h-5 w-5" />
            <span className="text-[10px]">{locale === 'he' ? 'מצב נהיגה' : 'Driving'}</span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            disabled={effectiveDlState === 'downloaded' || effectiveDlState === 'downloading' || !lesson.audio_url}
            className={`flex flex-col items-center gap-1.5 transition-colors disabled:cursor-not-allowed ${
              effectiveDlState === 'downloaded'
                ? 'text-green-400'
                : effectiveDlState === 'downloading'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {effectiveDlState === 'downloading' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : effectiveDlState === 'downloaded' ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <Download className="h-5 w-5" />
            )}
            <span className="text-[10px]">
              {effectiveDlState === 'downloading'
                ? `${dlProgress}%`
                : effectiveDlState === 'downloaded'
                ? (locale === 'he' ? 'הורד' : 'Saved')
                : (locale === 'he' ? 'הורדה' : 'Download')}
            </span>
          </button>

          {/* Cast */}
          <button
            onClick={(e) => { e.stopPropagation(); void handleCastClick(); }}
            className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Cast className="h-5 w-5" />
            <span className="text-[10px]">{locale === 'he' ? 'שדר' : 'Cast'}</span>
          </button>
        </div>
      </div>

      {/* Audio files list (inlined to avoid webpack dev chunk issue) */}
      {sortedAudioFiles.length > 1 && (
        <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-4">
          <h2 className="text-sm font-bold mb-3 text-muted-foreground uppercase tracking-wider">
            {locale === 'he' ? 'קבצי שמע' : 'Audio Files'}
          </h2>
          <div className="space-y-0.5">
            {sortedAudioFiles.map((audio, index) => {
              const active = isFileActive(audio);
              const playing = active && isPlaying;
              return (
                <button
                  key={audio.id}
                  onClick={() => handleFileClick(audio)}
                  className={`w-full flex items-center gap-3 rounded-md p-2.5 transition-colors group text-start ${
                    active
                      ? 'bg-primary/10'
                      : 'hover:bg-[hsl(var(--surface-highlight))]'
                  }`}
                >
                  <span className="w-5 text-center flex-shrink-0">
                    {playing ? (
                      <Volume2 className="h-4 w-4 text-primary animate-pulse mx-auto" />
                    ) : active ? (
                      <Pause className="h-4 w-4 text-primary mx-auto" />
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
                    <p
                      className={`text-sm font-medium truncate ${active ? 'text-primary' : ''}`}
                      dir="rtl"
                    >
                      {audio.original_name || `${locale === 'he' ? 'חלק' : 'Part'} ${index + 1}`}
                    </p>
                    {audio.audio_type && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                        audio.audio_type === 'עץ חיים'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-amber-500/15 text-amber-400'
                      }`}>
                        {audio.audio_type}
                      </span>
                    )}
                  </div>

                  {audio.duration > 0 && (
                    <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                      {formatDur(audio.duration)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Image gallery */}
      {images && images.length > 0 && (
        <ImageGallerySection images={images} locale={locale} />
      )}

      {/* ==================== Notes Section (inlined — local-first) ==================== */}
      <div className="rounded-xl bg-[hsl(var(--surface-elevated))]" dir={locale === 'he' ? 'rtl' : 'ltr'}>
        {/* Collapsible header */}
        <button
          onClick={() => setNotesOpen(!notesOpen)}
          className="w-full flex items-center justify-between p-4 text-start"
        >
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              {locale === 'he' ? 'הערות אישיות' : 'Personal Notes'}
            </h2>
            {notes.length > 0 && (
              <span className="bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {notes.length}
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
        </button>

        {notesOpen && (
          <div className="px-4 pb-4 space-y-3">
            {/* New note input */}
            <div className="space-y-2">
              <textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder={locale === 'he' ? 'כתוב הערה...' : 'Write a note...'}
                className="w-full rounded-lg bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,20%)] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
                rows={2}
                dir={locale === 'he' ? 'rtl' : 'ltr'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleAddNote();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attachTimestamp}
                    onChange={(e) => setAttachTimestamp(e.target.checked)}
                    className="rounded border-[hsl(0,0%,30%)] bg-[hsl(0,0%,10%)] text-primary focus:ring-primary/40"
                  />
                  <Clock className="h-3 w-3" />
                  {locale === 'he' ? 'צרף זמן נוכחי' : 'Attach current time'}
                  {attachTimestamp && isCurrentLesson && (
                    <span className="text-primary font-mono font-bold">
                      {formatDur(currentTime)}
                    </span>
                  )}
                </label>
                <button
                  onClick={handleAddNote}
                  disabled={!newNoteText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {locale === 'he' ? 'הוסף' : 'Add'}
                </button>
              </div>
            </div>

            {/* Notes list */}
            {notes.length > 0 && (
              <div className="space-y-2 pt-1">
                {[...notes].reverse().map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-[hsl(0,0%,10%)] p-3 group"
                  >
                    {editingNoteId === note.id ? (
                      /* Editing mode */
                      <div className="space-y-2">
                        <textarea
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          className="w-full rounded-lg bg-[hsl(0,0%,8%)] border border-primary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                          rows={2}
                          dir={locale === 'he' ? 'rtl' : 'ltr'}
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={handleCancelEdit}
                            className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {locale === 'he' ? 'ביטול' : 'Cancel'}
                          </button>
                          <button
                            onClick={handleSaveEdit}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
                          >
                            <Check className="h-3 w-3" />
                            {locale === 'he' ? 'שמור' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Display mode */
                      <>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {note.text}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            {note.timestamp !== undefined && (
                              <button
                                onClick={() => seekTo(note.timestamp!)}
                                className="flex items-center gap-1 text-primary hover:text-primary/80 font-mono font-bold"
                              >
                                <Clock className="h-3 w-3" />
                                {formatDur(note.timestamp)}
                              </button>
                            )}
                            <span>
                              {new Date(note.createdAt).toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-US')}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStartEdit(note)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
                              aria-label={locale === 'he' ? 'ערוך' : 'Edit'}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteNote(note.id)}
                              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              aria-label={locale === 'he' ? 'מחק' : 'Delete'}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3">
                {locale === 'he'
                  ? 'אין הערות עדיין. כתוב הערה ראשונה!'
                  : 'No notes yet. Write your first note!'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Bookmark dialog — inlined to avoid separate 'use client' import */}
      {showBookmarkDialog && (
        <BookmarkDialogInline
          isRTL={locale === 'he'}
          position={isCurrentLesson ? currentTime : 0}
          lessonId={lesson.id}
          onClose={() => setShowBookmarkDialog(false)}
        />
      )}

      {/* Share clip dialog — inlined to avoid separate 'use client' import */}
      <ShareClipDialogInline
        isOpen={showShareClipDialog}
        onClose={() => setShowShareClipDialog(false)}
        lessonId={lesson.id}
        currentTime={isCurrentLesson ? currentTime : 0}
        duration={isCurrentLesson ? duration : lesson.duration}
        lessonTitle={lesson.hebrew_title || lesson.title}
      />
    </div>
  );
}

// ==================== Image Gallery (inlined to share webpack chunk) ====================

function getImageStreamUrl(fileKey: string) {
  const encodedKey = encodeURIComponent(fileKey);
  return `/api/images/stream/${encodedKey}`;
}

function ImageGallerySection({ images, locale }: { images: LessonImage[]; locale: string }) {
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
              alt={img.caption || img.original_name || ''}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
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
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute start-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Previous"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          <img
            src={getImageStreamUrl(sorted[lightboxIndex].file_key)}
            alt={sorted[lightboxIndex].caption || sorted[lightboxIndex].original_name || ''}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {sorted.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
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
