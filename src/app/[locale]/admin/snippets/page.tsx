'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight, Loader2, Pencil, Check, X, Trash2,
  Play, Pause, Download, Music, ChevronDown, Scissors,
} from 'lucide-react';
import {
  getSnippetSubmissions,
  getPendingSnippetCount,
  updateSnippetSubmission,
  deleteSnippetSubmission,
} from '@/actions/snippets';
import { getCategories } from '@/actions/categories';
import type { SnippetSubmissionWithLesson, CategoryWithChildren } from '@/types/database';

// ---- Audio utility: WAV encoding ----

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const bps = 16;
  const blockAlign = numCh * (bps / 8);
  const dataLen = buffer.length * blockAlign;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  writeString(v, 0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  writeString(v, 8, 'WAVE');
  writeString(v, 12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bps, true);
  writeString(v, 36, 'data');
  v.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      off += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

async function extractAudioSegment(audioUrl: string, startTime: number, endTime: number): Promise<Blob> {
  const resp = await fetch(audioUrl);
  if (!resp.ok) {
    throw new Error(`שגיאה בטעינת האודיו (${resp.status})`);
  }
  const ab = await resp.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(ab);
    const sr = decoded.sampleRate;
    const startSamp = Math.floor(startTime * sr);
    const endSamp = Math.min(Math.floor(endTime * sr), decoded.length);
    const len = endSamp - startSamp;
    if (len <= 0) {
      throw new Error('טווח הזמן שנבחר לא תקין');
    }
    const offCtx = new OfflineAudioContext(decoded.numberOfChannels, len, sr);
    const src = offCtx.createBufferSource();
    src.buffer = decoded;
    src.connect(offCtx.destination);
    src.start(0, startTime, endTime - startTime);
    const rendered = await offCtx.startRendering();
    return audioBufferToWav(rendered);
  } finally {
    await ctx.close();
  }
}

// ---- Time helpers ----

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function parseMinSec(val: string): number | null {
  const parts = val.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s) || m < 0 || s < 0 || s >= 60) return null;
  return m * 60 + s;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ---- Status helpers ----

type SnippetStatus = 'pending' | 'approved' | 'rejected';

const STATUS_CONFIG: Record<SnippetStatus, { label: string; bg: string; text: string; border: string }> = {
  pending: { label: 'ממתין', bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  approved: { label: 'אושר', bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  rejected: { label: 'נדחה', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
};

type TabFilter = 'all' | SnippetStatus;

// =============================================
// MAIN COMPONENT
// =============================================

export default function AdminSnippetsPage() {
  const params = useParams();
  const locale = params.locale as string;
  const isRTL = locale === 'he';

  // ---- State ----
  const [submissions, setSubmissions] = useState<SnippetSubmissionWithLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    start_time: '',
    end_time: '',
  });

  // Audio preview state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endTimeRef = useRef<number>(0);

  // Create clip state
  const [createClipId, setCreateClipId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);

  // ---- Flash message ----
  const flashSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // ---- Load submissions ----
  const loadSubmissions = useCallback(async () => {
    const statusFilter = activeTab === 'all' ? undefined : activeTab;
    const result = await getSnippetSubmissions(statusFilter);
    if (result.data) {
      setSubmissions(result.data);
    } else if (result.error) {
      setError(result.error);
    }
  }, [activeTab]);

  const loadPendingCount = useCallback(async () => {
    const result = await getPendingSnippetCount();
    if (result.data !== undefined) {
      setPendingCount(result.data);
    } else if (result.error) {
      console.error('Failed to load pending count:', result.error);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([loadSubmissions(), loadPendingCount()]);
      setLoading(false);
    }
    init();
  }, [loadSubmissions, loadPendingCount]);

  // ---- Load categories when create clip is opened ----
  useEffect(() => {
    if (createClipId && !categoriesLoaded) {
      getCategories().then((res) => {
        if (res.data) setCategories(res.data);
        else if (res.error) setError('שגיאה בטעינת קטגוריות: ' + res.error);
        setCategoriesLoaded(true);
      });
    }
  }, [createClipId, categoriesLoaded]);

  // ---- Audio preview ----
  const handlePlayPreview = (sub: SnippetSubmissionWithLesson) => {
    if (!sub.audio_file?.file_key) return;

    // If same track is playing, pause it
    if (playingId === sub.id && audioRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
    }

    const audioUrl = `/api/audio/stream/${encodeURIComponent(sub.audio_file.file_key)}`;
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    endTimeRef.current = sub.end_time;

    audio.addEventListener('loadedmetadata', () => {
      audio.currentTime = sub.start_time;
      audio.play();
      setPlayingId(sub.id);
    });

    audio.addEventListener('timeupdate', handleTimeUpdate);

    audio.addEventListener('ended', () => {
      setPlayingId(null);
    });

    audio.addEventListener('error', () => {
      setPlayingId(null);
      setError('שגיאה בנגינת התצוגה המקדימה');
    });

    // Start loading
    audio.load();
  };

  const handleTimeUpdate = () => {
    if (audioRef.current && audioRef.current.currentTime >= endTimeRef.current) {
      audioRef.current.pause();
      setPlayingId(null);
    }
  };

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // ---- Edit handlers ----
  const startEdit = (sub: SnippetSubmissionWithLesson) => {
    setEditingId(sub.id);
    setEditForm({
      title: sub.title,
      description: sub.description || '',
      start_time: formatSeconds(sub.start_time),
      end_time: formatSeconds(sub.end_time),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ title: '', description: '', start_time: '', end_time: '' });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.title.trim()) return;

    const startSec = parseMinSec(editForm.start_time);
    const endSec = parseMinSec(editForm.end_time);

    if (startSec === null || endSec === null) {
      setError('פורמט זמן לא תקין. השתמש בפורמט דק:שנ (למשל 02:30)');
      return;
    }
    if (endSec <= startSec) {
      setError('זמן סיום חייב להיות אחרי זמן התחלה');
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateSnippetSubmission(editingId, {
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      start_time: startSec,
      end_time: endSec,
    });

    if ('error' in result && result.error) {
      const err = result.error;
      const errMsg = typeof err === 'string' ? err : ('_form' in err ? err._form?.[0] : 'שגיאה בשמירה');
      setError(errMsg || 'שגיאה בשמירה');
    } else {
      cancelEdit();
      flashSuccess('הסימון עודכן בהצלחה');
      await loadSubmissions();
    }
    setSaving(false);
  };

  // ---- Status handlers ----
  const handleApprove = async (id: string) => {
    setSaving(true);
    const result = await updateSnippetSubmission(id, { status: 'approved' });
    if ('error' in result && result.error) {
      setError('שגיאה באישור הסימון');
    } else {
      flashSuccess('הסימון אושר');
      await Promise.all([loadSubmissions(), loadPendingCount()]);
    }
    setSaving(false);
  };

  const handleReject = async (id: string) => {
    setSaving(true);
    const result = await updateSnippetSubmission(id, { status: 'rejected' });
    if ('error' in result && result.error) {
      setError('שגיאה בדחיית הסימון');
    } else {
      flashSuccess('הסימון נדחה');
      await Promise.all([loadSubmissions(), loadPendingCount()]);
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const result = await deleteSnippetSubmission(id);
    if (result.error) {
      setError(result.error);
    } else {
      flashSuccess('הסימון נמחק');
      await Promise.all([loadSubmissions(), loadPendingCount()]);
    }
    setDeleteConfirmId(null);
    setSaving(false);
  };

  // ---- Download handler ----
  const handleDownload = async (sub: SnippetSubmissionWithLesson) => {
    if (!sub.audio_file?.file_key) return;
    setProcessingId(sub.id);
    try {
      const audioUrl = `/api/audio/stream/${encodeURIComponent(sub.audio_file.file_key)}`;
      const wav = await extractAudioSegment(audioUrl, sub.start_time, sub.end_time);
      const url = URL.createObjectURL(wav);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sub.title || 'snippet'}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      flashSuccess('ההורדה החלה');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בהורדת האודיו');
    } finally {
      setProcessingId(null);
    }
  };

  // ---- Create clip handler ----
  const handleCreateClip = async (sub: SnippetSubmissionWithLesson, categoryId: string) => {
    if (!sub.audio_file?.file_key) return;
    setProcessingId(sub.id);
    try {
      // 1. Extract audio segment
      const audioUrl = `/api/audio/stream/${encodeURIComponent(sub.audio_file.file_key)}`;
      const wav = await extractAudioSegment(audioUrl, sub.start_time, sub.end_time);

      // 2. Create lesson first (need lessonId for upload)
      const lessonForm = new FormData();
      lessonForm.set('title', sub.title);
      lessonForm.set('hebrew_title', sub.title);
      lessonForm.set('date', new Date().toISOString().split('T')[0]);
      lessonForm.set('source_type', 'upload');
      if (categoryId) lessonForm.set('category_id', categoryId);

      const { createLesson } = await import('@/actions/lessons');
      const lessonResult = await createLesson(lessonForm);

      if ('error' in lessonResult) throw new Error('יצירת השיעור נכשלה');

      const newLessonId = lessonResult.data?.id;
      if (!newLessonId) throw new Error('לא התקבל מזהה שיעור');

      // 3. Upload WAV to R2 via existing upload API
      const uploadForm = new FormData();
      uploadForm.append('file', wav, `${sub.title || 'snippet'}.wav`);
      uploadForm.append('lessonId', newLessonId);
      uploadForm.append('fileName', `${sub.title || 'snippet'}.wav`);
      uploadForm.append('contentType', 'audio/wav');
      uploadForm.append('fileSize', String(wav.size));
      uploadForm.append('sortOrder', '0');

      const uploadResp = await fetch('/api/upload', { method: 'POST', body: uploadForm });
      const uploadResult = await uploadResp.json();
      if (!uploadResult.fileKey) throw new Error('העלאת הקובץ נכשלה');

      // 4. Update snippet submission
      await updateSnippetSubmission(sub.id, {
        status: 'approved',
        result_lesson_id: newLessonId,
      });

      // 5. Refresh
      await Promise.all([loadSubmissions(), loadPendingCount()]);
      setCreateClipId(null);
      setSelectedCategoryId('');
      flashSuccess('הקטע נוצר בהצלחה!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה ביצירת הקטע');
    } finally {
      setProcessingId(null);
    }
  };

  // ---- Tab definitions ----
  const tabs: { key: TabFilter; label: string; showBadge?: boolean }[] = [
    { key: 'all', label: 'הכל' },
    { key: 'pending', label: 'ממתינים', showBadge: true },
    { key: 'approved', label: 'אושרו' },
    { key: 'rejected', label: 'נדחו' },
  ];

  // ---- Input classes (match categories page) ----
  const inputClasses = 'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border border-border/30';
  const selectClasses = 'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border border-border/30';

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- Main render ----
  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin`}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            {isRTL ? 'סימוני קטעים' : 'Snippet Markings'}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isRTL
              ? `${submissions.length} סימונים`
              : `${submissions.length} submissions`}
          </p>
        </div>
        {saving && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Success / Error messages */}
      {successMsg && (
        <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-3">
          <p className="text-sm font-medium text-primary">{successMsg}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-xs text-destructive/70 hover:text-destructive mt-1 underline"
          >
            {isRTL ? 'סגור' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Tab filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))]'
            }`}
          >
            <span>{tab.label}</span>
            {tab.showBadge && pendingCount > 0 && (
              <span
                className={`inline-flex items-center justify-center rounded-full min-w-[20px] h-5 px-1.5 text-xs font-bold ${
                  activeTab === tab.key
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-amber-500/20 text-amber-400'
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Submissions list */}
      <div className="space-y-4">
        {submissions.length === 0 ? (
          <div className="rounded-xl bg-[hsl(var(--surface-elevated))] border border-border/50 p-8 text-center">
            <Scissors className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {isRTL ? 'אין סימונים בסטטוס זה' : 'No submissions with this status'}
            </p>
          </div>
        ) : (
          submissions.map((sub) => {
            const statusCfg = STATUS_CONFIG[sub.status];
            const isEditing = editingId === sub.id;
            const isDeleting = deleteConfirmId === sub.id;
            const isProcessing = processingId === sub.id;
            const isPlaying = playingId === sub.id;
            const isCreatingClip = createClipId === sub.id;
            const duration = sub.end_time - sub.start_time;
            const lessonTitle = sub.lesson?.hebrew_title || sub.lesson?.title || 'שיעור לא ידוע';

            return (
              <div
                key={sub.id}
                className="rounded-xl bg-[hsl(var(--surface-elevated))] border border-border/50 overflow-hidden"
              >
                {/* Card header */}
                <div className="px-4 pt-4 pb-3 space-y-3">
                  {/* Status badge + lesson source */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${statusCfg.bg} ${statusCfg.text} border ${statusCfg.border}`}
                    >
                      {statusCfg.label}
                    </span>
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {lessonTitle}
                    </span>
                  </div>

                  {/* Editing mode */}
                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          כותרת
                        </label>
                        <input
                          type="text"
                          value={editForm.title}
                          onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          className={inputClasses}
                          dir="rtl"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                          תיאור
                        </label>
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className={inputClasses}
                          dir="rtl"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                            התחלה (דק:שנ)
                          </label>
                          <input
                            type="text"
                            value={editForm.start_time}
                            onChange={(e) => setEditForm({ ...editForm, start_time: e.target.value })}
                            className={inputClasses}
                            dir="ltr"
                            placeholder="00:00"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                            סיום (דק:שנ)
                          </label>
                          <input
                            type="text"
                            value={editForm.end_time}
                            onChange={(e) => setEditForm({ ...editForm, end_time: e.target.value })}
                            className={inputClasses}
                            dir="ltr"
                            placeholder="00:00"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={saving || !editForm.title.trim()}
                          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                        >
                          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          <span>שמור</span>
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg bg-[hsl(var(--surface-highlight))] px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Title */}
                      <h3 className="text-base font-bold text-foreground leading-snug">
                        {sub.title}
                      </h3>

                      {/* Description */}
                      {sub.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {sub.description}
                        </p>
                      )}

                      {/* Time range + duration */}
                      <div className="flex items-center gap-3 text-sm">
                        <span className="font-mono text-muted-foreground" dir="ltr">
                          {formatSeconds(sub.start_time)} - {formatSeconds(sub.end_time)}
                        </span>
                        <span className="text-xs text-muted-foreground/70">
                          ({formatSeconds(duration)} {isRTL ? 'דקות' : 'min'})
                        </span>
                      </div>

                      {/* Created date */}
                      <p className="text-xs text-muted-foreground/60">
                        {formatDate(sub.created_at)}
                      </p>

                      {/* Result lesson link */}
                      {sub.result_lesson_id && (
                        <Link
                          href={`/${locale}/lessons/${sub.result_lesson_id}`}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Music className="h-3 w-3" />
                          {isRTL ? 'צפה בקטע שנוצר' : 'View created clip'}
                        </Link>
                      )}
                    </>
                  )}
                </div>

                {/* Action buttons row (not in edit mode) */}
                {!isEditing && (
                  <div className="border-t border-border/30 px-4 py-3">
                    {/* Audio preview button */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {sub.audio_file?.file_key && (
                        <button
                          type="button"
                          onClick={() => handlePlayPreview(sub)}
                          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            isPlaying
                              ? 'bg-primary/20 text-primary'
                              : 'bg-[hsl(var(--surface-highlight))] text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                          <span>{isPlaying ? 'עצור' : 'נגן'}</span>
                        </button>
                      )}

                      {/* Edit */}
                      {(sub.status === 'pending' || sub.status === 'approved') && (
                        <button
                          type="button"
                          onClick={() => startEdit(sub)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-highlight))] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>ערוך</span>
                        </button>
                      )}

                      {/* Approve (only for pending) */}
                      {sub.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleApprove(sub.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-lg bg-green-500/10 px-3 py-1.5 text-xs font-bold text-green-400 hover:bg-green-500/20 transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>אשר</span>
                        </button>
                      )}

                      {/* Reject (only for pending) */}
                      {sub.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleReject(sub.id)}
                          disabled={saving}
                          className="flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>דחה</span>
                        </button>
                      )}

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(sub.id)}
                        disabled={saving}
                        className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-highlight))] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>מחק</span>
                      </button>
                    </div>

                    {/* Download + Create Clip row */}
                    {sub.audio_file?.file_key && (sub.status === 'pending' || sub.status === 'approved') && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleDownload(sub)}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-highlight))] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {isProcessing && processingId === sub.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="h-3.5 w-3.5" />
                          )}
                          <span>הורד אודיו</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (createClipId === sub.id) {
                              setCreateClipId(null);
                              setSelectedCategoryId('');
                            } else {
                              setCreateClipId(sub.id);
                            }
                          }}
                          disabled={isProcessing}
                          className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          <Scissors className="h-3.5 w-3.5" />
                          <span>צור קטע קצר</span>
                          <ChevronDown className={`h-3 w-3 transition-transform ${isCreatingClip ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    )}

                    {/* Create clip inline section */}
                    {isCreatingClip && (
                      <div className="mt-3 rounded-lg bg-primary/5 border border-primary/10 p-4 space-y-3">
                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                          בחר קטגוריה לקטע החדש
                        </h4>
                        <select
                          value={selectedCategoryId}
                          onChange={(e) => setSelectedCategoryId(e.target.value)}
                          className={selectClasses}
                          dir="rtl"
                        >
                          <option value="">ללא קטגוריה</option>
                          {categories.map((parent) => (
                            <optgroup key={parent.id} label={parent.hebrew_name}>
                              <option value={parent.id}>{parent.hebrew_name}</option>
                              {parent.children.map((child) => (
                                <option key={child.id} value={child.id}>
                                  &nbsp;&nbsp;{child.hebrew_name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCreateClip(sub, selectedCategoryId)}
                            disabled={isProcessing}
                            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                          >
                            {isProcessing ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            <span>צור והעלה</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCreateClipId(null);
                              setSelectedCategoryId('');
                            }}
                            className="rounded-lg bg-[hsl(var(--surface-highlight))] px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-4 space-y-3">
                        <p className="text-sm font-medium text-destructive">
                          האם אתה בטוח שברצונך למחוק את הסימון &quot;{sub.title}&quot;? פעולה זו לא ניתנת לביטול.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleDelete(sub.id)}
                            disabled={saving}
                            className="rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'מחק'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
