'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, Cast, Volume2, X, ChevronRight, ChevronLeft, ChevronDown, StickyNote, Plus, Trash2, Pencil, Clock, Check, Scissors as ScissorsIcon, CloudDownload, CheckCircle, Loader2, AlertCircle } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAudioPlayer } from '@/hooks/use-audio-player';
import { SeekBar } from '@/components/player/seek-bar';
import { SpeedControl } from '@/components/player/speed-control';
import { handleCastClick } from '@/lib/cast-utils';
import type { LessonWithRelations, LessonAudio, LessonImage } from '@/types/database';
import { normalizeAudioUrl } from '@/lib/audio-url';
import { getNotes, addNote, updateNote, deleteNote, type LocalNote } from '@/lib/local-notes';
import { downloadLesson, isLessonDownloaded } from '@/lib/offline-storage';

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

interface LessonPlayerClientProps {
  lesson: LessonWithRelations;
  images?: LessonImage[];
}

export function LessonPlayerClient({ lesson, images }: LessonPlayerClientProps) {
  const locale = useLocale();
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
  }, [effectiveDlState, lesson]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <ScissorsIcon className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium text-primary">
            מצב קטע: {formatDur(clipStart)} - {formatDur(clipEnd)}
          </span>
        </div>
      )}

      <div className="rounded-xl bg-[hsl(var(--surface-elevated))] p-5 space-y-4">
        {/* Seek bar */}
        <SeekBar
          currentTime={displayTime}
          duration={displayDuration}
          onSeek={seekTo}
        />

        {/* Controls — dir="ltr" keeps standard media player layout (⏪ ▶ ⏩) */}
        <div dir="ltr" className="flex items-center justify-center gap-5">
          <SpeedControl
            speed={isCurrentLesson ? playbackSpeed : 1}
            onSpeedChange={setPlaybackSpeed}
          />

          <button
            onClick={() => skipBackward(15)}
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

          <button
            onClick={() => skipForward(15)}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
            disabled={!isCurrentLesson}
          >
            <Skip15Forward className="h-7 w-7" />
          </button>

          {/* Cast / broadcast */}
          <button
            onClick={(e) => { e.stopPropagation(); void handleCastClick(); }}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Cast"
          >
            <Cast className="h-5 w-5" />
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

      {/* ── Offline download button (inlined) ── */}
      {lesson.audio_url && (
        <button
          onClick={handleDownload}
          disabled={effectiveDlState === 'downloaded' || effectiveDlState === 'downloading'}
          className={`w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 transition-all border ${
            effectiveDlState === 'downloaded'
              ? 'bg-green-500/10 border-green-500/30 text-green-400'
              : effectiveDlState === 'downloading'
              ? 'bg-primary/10 border-primary/30 text-primary'
              : effectiveDlState === 'error'
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-[hsl(var(--surface-elevated))] border-[hsl(var(--border))]/50 text-muted-foreground hover:text-foreground hover:border-primary/40'
          }`}
          dir="rtl"
        >
          {effectiveDlState === 'idle' && (
            <>
              <CloudDownload className="h-5 w-5" />
              <span className="text-sm font-medium">{locale === 'he' ? 'הורדה להאזנה אופליין' : 'Download for offline'}</span>
            </>
          )}
          {effectiveDlState === 'downloading' && (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm font-medium">{locale === 'he' ? `מוריד... ${dlProgress}%` : `Downloading... ${dlProgress}%`}</span>
              <div className="flex-1 max-w-[120px] h-1.5 rounded-full bg-primary/20 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${dlProgress}%` }} />
              </div>
            </>
          )}
          {effectiveDlState === 'downloaded' && (
            <>
              <CheckCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{locale === 'he' ? 'הורד להאזנה אופליין' : 'Downloaded for offline'}</span>
            </>
          )}
          {effectiveDlState === 'error' && (
            <>
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{locale === 'he' ? 'שגיאה בהורדה, נסה שוב' : 'Download failed, try again'}</span>
            </>
          )}
        </button>
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
