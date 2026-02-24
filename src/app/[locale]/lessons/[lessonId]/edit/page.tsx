'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { ArrowRight, Trash2, Loader2, GripVertical, Pencil, Check, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Link } from '@/i18n/routing';
import {
  updateLesson,
  deleteLesson,
  getLesson,
  getAudioFiles,
  renameAudioFile,
  reorderAudioFiles,
  deleteAudioFile,
} from '@/actions/lessons';
import type { LessonAudio } from '@/types/database';

export default function EditLessonPage() {
  const t = useTranslations('lessons');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const params = useParams();
  const lessonId = params.lessonId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [hebrewTitle, setHebrewTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  // Audio files state
  const [audioFiles, setAudioFiles] = useState<LessonAudio[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingFiles, setSavingFiles] = useState(false);

  useEffect(() => {
    async function load() {
      const [lessonResult, audioResult] = await Promise.all([
        getLesson(lessonId),
        getAudioFiles(lessonId),
      ]);
      if (lessonResult.data) {
        const lesson = lessonResult.data;
        setTitle(lesson.title || '');
        setHebrewTitle(lesson.hebrew_title || '');
        setDescription(lesson.description || '');
        setDate(lesson.date || '');
        setIsPublished(lesson.is_published);
      }
      if (audioResult.data) {
        setAudioFiles(audioResult.data);
      }
      setLoading(false);
    }
    load();
  }, [lessonId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    setSaving(true);

    try {
      const formData = new FormData();
      formData.set('title', title);
      formData.set('hebrew_title', hebrewTitle);
      formData.set('description', description);
      formData.set('date', date);
      formData.set('is_published', String(isPublished));

      const result = await updateLesson(lessonId, formData);
      if (result.error) {
        setFormError('שגיאה בעדכון השיעור');
      } else {
        setSuccessMsg('השיעור עודכן בהצלחה');
        setTimeout(() => {
          router.push(`/lessons/${lessonId}`);
        }, 800);
      }
    } catch {
      setFormError('אירעה שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const result = await deleteLesson(lessonId);
      if (result.error) {
        setFormError('שגיאה במחיקת השיעור');
        setDeleting(false);
      } else {
        router.push('/lessons');
      }
    } catch {
      setFormError('אירעה שגיאה');
      setDeleting(false);
    }
  };

  // --- Audio file management ---

  const startRename = (file: LessonAudio) => {
    setEditingFileId(file.id);
    setEditingName(file.original_name || '');
  };

  const cancelRename = () => {
    setEditingFileId(null);
    setEditingName('');
  };

  const saveRename = async (fileId: string) => {
    if (!editingName.trim()) return;
    setSavingFiles(true);
    const result = await renameAudioFile(fileId, editingName.trim());
    if (!result.error) {
      setAudioFiles((prev) =>
        prev.map((f) => (f.id === fileId ? { ...f, original_name: editingName.trim() } : f))
      );
    }
    setEditingFileId(null);
    setSavingFiles(false);
  };

  const moveFile = useCallback(async (index: number, direction: 'up' | 'down') => {
    const newFiles = [...audioFiles];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= newFiles.length) return;

    [newFiles[index], newFiles[swapIndex]] = [newFiles[swapIndex], newFiles[index]];
    setAudioFiles(newFiles);

    setSavingFiles(true);
    await reorderAudioFiles(lessonId, newFiles.map((f) => f.id));
    setSavingFiles(false);
  }, [audioFiles, lessonId]);

  const handleDeleteFile = async (fileId: string) => {
    setSavingFiles(true);
    const result = await deleteAudioFile(fileId);
    if (!result.error) {
      setAudioFiles((prev) => prev.filter((f) => f.id !== fileId));
    }
    setSavingFiles(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/lessons/${lessonId}`}
          className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
        >
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{tCommon('edit')}</h1>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Hebrew Title */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('hebrewName')}
          </label>
          <input
            type="text"
            value={hebrewTitle}
            onChange={(e) => setHebrewTitle(e.target.value)}
            className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
            dir="rtl"
          />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('lessonName')}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
          />
        </div>

        {/* Date */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('date')}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            {t('description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0 resize-y"
            dir="rtl"
          />
        </div>

        {/* Published toggle */}
        <div className="flex items-center justify-between rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-3">
          <span className="text-sm font-medium">פורסם</span>
          <button
            type="button"
            onClick={() => setIsPublished(!isPublished)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isPublished ? 'bg-primary' : 'bg-[hsl(0,0%,30%)]'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isPublished ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Success / Error */}
        {successMsg && (
          <p className="text-sm text-primary font-medium">{successMsg}</p>
        )}
        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}

        {/* Save button */}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {saving ? tCommon('loading') : tCommon('save')}
        </button>
      </form>

      {/* Audio Files Section */}
      {audioFiles.length > 0 && (
        <div className="border-t border-[hsl(0,0%,18%)] pt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              קבצי שמע ({audioFiles.length})
            </h2>
            {savingFiles && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div className="space-y-1">
            {audioFiles.map((file, index) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2.5 group"
              >
                {/* Grip / order indicator */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => moveFile(index, 'up')}
                    disabled={index === 0 || savingFiles}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFile(index, 'down')}
                    disabled={index === audioFiles.length - 1 || savingFiles}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Order number */}
                <span className="text-xs text-muted-foreground w-5 text-center flex-shrink-0">
                  {index + 1}
                </span>

                {/* File name (editable) */}
                <div className="flex-1 min-w-0">
                  {editingFileId === file.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(file.id);
                          if (e.key === 'Escape') cancelRename();
                        }}
                        className="flex-1 rounded bg-[hsl(var(--surface-highlight))] px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 border-0"
                        autoFocus
                        dir="auto"
                      />
                      <button
                        type="button"
                        onClick={() => saveRename(file.id)}
                        className="p-1 text-primary hover:text-primary/80 transition-colors"
                        aria-label="Save"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={cancelRename}
                        className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Cancel"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-foreground truncate" dir="auto">
                      {file.original_name || file.file_key.split('/').pop() || 'Unnamed'}
                    </p>
                  )}
                </div>

                {/* Actions (visible on hover / always on mobile) */}
                {editingFileId !== file.id && (
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => startRename(file)}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Rename"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteFile(file.id)}
                      disabled={savingFiles}
                      className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete section */}
      <div className="border-t border-[hsl(0,0%,18%)] pt-6">
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 text-sm text-destructive hover:text-destructive/80 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {tCommon('delete')} שיעור
          </button>
        ) : (
          <div className="space-y-3 rounded-lg bg-destructive/10 p-4">
            <p className="text-sm font-medium text-destructive">
              האם אתה בטוח שברצונך למחוק את השיעור? פעולה זו לא ניתנת לביטול.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-full bg-destructive px-5 py-2 text-sm font-bold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? tCommon('loading') : tCommon('delete')}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-full bg-[hsl(var(--surface-elevated))] px-5 py-2 text-sm font-medium text-foreground hover:bg-[hsl(var(--surface-highlight))]"
              >
                {tCommon('cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
