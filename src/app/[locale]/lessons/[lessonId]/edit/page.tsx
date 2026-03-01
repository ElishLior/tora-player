'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  ArrowRight, Trash2, Loader2, Pencil, Check, X,
  ChevronUp, ChevronDown, ImagePlus, Sparkles, Calendar,
  Upload, FileAudio,
} from 'lucide-react';
import { Link } from '@/i18n/routing';
import {
  updateLesson,
  deleteLesson,
  getLesson,
  getAudioFiles,
  getImages,
  renameAudioFile,
  reorderAudioFiles,
  deleteAudioFile,
  deleteImage,
  updateAudioType,
} from '@/actions/lessons';
import { useUpload, type FileWithMeta } from '@/hooks/use-upload';
import { UploadZone, type SelectedFile } from '@/components/upload/upload-zone';
import type { LessonAudio, LessonImage, CategoryWithChildren } from '@/types/database';
import { getCategories } from '@/actions/categories';

interface MetadataSuggestion {
  title: string;
  hebrewTitle: string;
  hebrewDate: string;
  hebrewDay: string;
  parsha: string | null;
  teacher: string;
  location: string;
  lessonType: string;
}

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

  // Basic fields
  const [title, setTitle] = useState('');
  const [hebrewTitle, setHebrewTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [isPublished, setIsPublished] = useState(false);

  // Category
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);

  // Metadata fields
  const [hebrewDate, setHebrewDate] = useState('');
  const [parsha, setParsha] = useState('');
  const [teacher, setTeacher] = useState('');
  const [location, setLocation] = useState('');
  const [summary, setSummary] = useState('');
  const [lessonType, setLessonType] = useState('');
  const [sederNumber, setSederNumber] = useState('');

  // Auto-metadata suggestion
  const [metadataSuggestion, setMetadataSuggestion] = useState<MetadataSuggestion | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  // Audio files state
  const [audioFiles, setAudioFiles] = useState<LessonAudio[]>([]);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [savingFiles, setSavingFiles] = useState(false);

  // Audio upload (new files)
  const [showAudioUpload, setShowAudioUpload] = useState(false);
  const [pendingAudioFiles, setPendingAudioFiles] = useState<SelectedFile[]>([]);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const { uploadMultiple, progress: audioUploadProgress, fileProgresses, reset: resetUpload } = useUpload();

  // Image management
  const [images, setImages] = useState<LessonImage[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Load data
  useEffect(() => {
    async function load() {
      const [lessonResult, audioResult, imagesResult, categoriesResult] = await Promise.all([
        getLesson(lessonId),
        getAudioFiles(lessonId),
        getImages(lessonId),
        getCategories(),
      ]);
      if (lessonResult.data) {
        const lesson = lessonResult.data;
        setTitle(lesson.title || '');
        setHebrewTitle(lesson.hebrew_title || '');
        setDescription(lesson.description || '');
        setDate(lesson.date || '');
        setIsPublished(lesson.is_published);
        setCategoryId(lesson.category_id || '');
        // Metadata
        setHebrewDate(lesson.hebrew_date || '');
        setParsha(lesson.parsha || '');
        setTeacher(lesson.teacher || '');
        setLocation(lesson.location || '');
        setSummary(lesson.summary || '');
        setLessonType(lesson.lesson_type || '');
        setSederNumber(lesson.seder_number ? String(lesson.seder_number) : '');
      }
      if (audioResult.data) {
        setAudioFiles(audioResult.data);
      }
      if (imagesResult.data) {
        setImages(imagesResult.data);
      }
      if (categoriesResult.data) {
        setCategories(categoriesResult.data);
      }
      setLoading(false);
    }
    load();
  }, [lessonId]);

  // --- Auto-metadata ---

  const fetchMetadata = async () => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    setMetadataLoading(true);
    try {
      const res = await fetch(`/api/lesson-metadata?date=${date}`);
      const data = await res.json();
      if (!data.error) {
        setMetadataSuggestion(data as MetadataSuggestion);
      }
    } catch {
      // ignore
    } finally {
      setMetadataLoading(false);
    }
  };

  const applyMetadata = () => {
    if (!metadataSuggestion) return;
    setTitle(metadataSuggestion.title);
    setHebrewTitle(metadataSuggestion.hebrewTitle || metadataSuggestion.title);
    setHebrewDate(metadataSuggestion.hebrewDate);
    if (metadataSuggestion.parsha) setParsha(metadataSuggestion.parsha);
    setTeacher(metadataSuggestion.teacher);
    setLocation(metadataSuggestion.location);
    setLessonType(metadataSuggestion.lessonType);
    setMetadataSuggestion(null);
  };

  // --- Save ---

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
      // Metadata
      formData.set('hebrew_date', hebrewDate);
      formData.set('parsha', parsha);
      formData.set('teacher', teacher);
      formData.set('location', location);
      formData.set('summary', summary);
      formData.set('lesson_type', lessonType);
      formData.set('category_id', categoryId || '');
      if (sederNumber) formData.set('seder_number', sederNumber);

      const result = await updateLesson(lessonId, formData);
      if (result.error) {
        setFormError('שגיאה בעדכון השיעור');
        setSaving(false);
        return;
      }

      // Upload new images if any
      if (newImageFiles.length > 0) {
        setUploadingImages(true);
        const startOrder = images.length;
        for (let i = 0; i < newImageFiles.length; i++) {
          const imgForm = new FormData();
          imgForm.append('file', newImageFiles[i]);
          imgForm.append('lessonId', lessonId);
          imgForm.append('sortOrder', String(startOrder + i));
          try {
            await fetch('/api/upload/image', { method: 'POST', body: imgForm });
          } catch (err) {
            console.error(`Image upload ${i} failed:`, err);
          }
        }
        setUploadingImages(false);
      }

      setSuccessMsg('השיעור עודכן בהצלחה');
      setTimeout(() => {
        router.push(`/lessons/${lessonId}`);
      }, 800);
    } catch {
      setFormError('אירעה שגיאה');
    } finally {
      setSaving(false);
    }
  };

  // --- Delete lesson ---

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

  // --- Image management ---

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      setNewImageFiles((prev) => [...prev, ...files]);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeNewImage = (index: number) => {
    setNewImageFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDeleteExistingImage = async (imageId: string) => {
    const result = await deleteImage(imageId);
    if (!result.error) {
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    }
  };

  // --- Audio upload ---

  const handleAudioFilesSelected = (files: SelectedFile[]) => {
    setPendingAudioFiles(files);
  };

  const handleUploadAudio = async () => {
    if (pendingAudioFiles.length === 0) return;
    setUploadingAudio(true);
    setFormError(null);

    try {
      // Assign sort_order starting after existing files
      const startOrder = audioFiles.length;
      const filesToUpload: FileWithMeta[] = pendingAudioFiles.map((sf, i) => ({
        file: sf.file,
        metadata: { ...sf.metadata, sortOrder: startOrder + i },
        transcodeEnabled: sf.transcodeEnabled,
      }));

      await uploadMultiple(filesToUpload, lessonId);

      // Refresh audio files list from server
      const refreshed = await getAudioFiles(lessonId);
      if (refreshed.data) {
        setAudioFiles(refreshed.data);
      }

      // Reset upload state
      setPendingAudioFiles([]);
      setShowAudioUpload(false);
      resetUpload();
      setSuccessMsg('קבצי שמע הועלו בהצלחה');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setFormError('שגיאה בהעלאת קבצי שמע');
    } finally {
      setUploadingAudio(false);
    }
  };

  // --- Render ---

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

        {/* Auto-generate metadata button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchMetadata}
            disabled={!date || metadataLoading}
            className="flex items-center gap-1.5 rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>הצע מטאדאטה מתאריך</span>
          </button>
          {metadataLoading && (
            <span className="text-xs text-muted-foreground animate-pulse">מחשב...</span>
          )}
        </div>

        {/* Metadata suggestion preview */}
        {metadataSuggestion && (
          <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>מטאדאטה מוצעת</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyMetadata}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  החל
                </button>
                <button
                  type="button"
                  onClick={() => setMetadataSuggestion(null)}
                  className="rounded-full bg-[hsl(var(--surface-elevated))] px-3 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-elevated))] px-2.5 py-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                {metadataSuggestion.hebrewDate}
              </span>
              <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2.5 py-1">
                יום {metadataSuggestion.hebrewDay}
              </span>
              {metadataSuggestion.parsha && (
                <span className="rounded-full bg-primary/20 text-primary px-2.5 py-1 font-medium">
                  פרשת {metadataSuggestion.parsha}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate" dir="rtl">
              {metadataSuggestion.title}
            </p>
          </div>
        )}

        {/* Metadata Fields */}
        <div className="border-t border-[hsl(0,0%,18%)] pt-5 space-y-4">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">מטאדאטה</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                תאריך עברי
              </label>
              <input
                type="text"
                value={hebrewDate}
                onChange={(e) => setHebrewDate(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                dir="rtl"
                placeholder="כ״ה באדר ב׳ תשפ״ו"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                פרשה
              </label>
              <input
                type="text"
                value={parsha}
                onChange={(e) => setParsha(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                dir="rtl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                מורה
              </label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                מיקום
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                dir="rtl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                סוג שיעור
              </label>
              <input
                type="text"
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                מספר סדר
              </label>
              <input
                type="number"
                value={sederNumber}
                onChange={(e) => setSederNumber(e.target.value)}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                min="1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              תקציר
            </label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0 resize-y"
              dir="rtl"
            />
          </div>
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

        {/* Category picker */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            קטגוריה
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
            dir="rtl"
          >
            <option value="">ללא קטגוריה</option>
            {categories.map((parent) => (
              parent.children.length > 0 ? (
                <optgroup key={parent.id} label={parent.hebrew_name}>
                  {parent.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.hebrew_name}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={parent.id} value={parent.id}>
                  {parent.hebrew_name}
                </option>
              )
            ))}
          </select>
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
          disabled={saving || uploadingImages || uploadingAudio}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {saving ? tCommon('loading') : uploadingImages ? 'מעלה תמונות...' : uploadingAudio ? 'מעלה קבצי שמע...' : tCommon('save')}
        </button>
      </form>

      {/* Image Management Section */}
      <div className="border-t border-[hsl(0,0%,18%)] pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            תמונות ({images.length + newImageFiles.length})
          </h2>
          {uploadingImages && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Existing images */}
        {images.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
            {images
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((img) => (
                <div key={img.id} className="relative group aspect-square">
                  <img
                    src={`/api/images/stream/${encodeURIComponent(img.file_key)}`}
                    alt={img.caption || img.original_name || ''}
                    className="w-full h-full object-cover rounded-lg"
                    loading="lazy"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteExistingImage(img.id)}
                    className="absolute top-1 end-1 rounded-full bg-destructive/80 text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Delete image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        )}

        {/* New images preview */}
        {newImageFiles.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
            {newImageFiles.map((img, index) => (
              <div key={`new-${index}`} className="relative group aspect-square">
                <img
                  src={URL.createObjectURL(img)}
                  alt={img.name}
                  className="w-full h-full object-cover rounded-lg opacity-70"
                />
                <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary/30" />
                <button
                  type="button"
                  onClick={() => removeNewImage(index)}
                  className="absolute top-1 end-1 rounded-full bg-destructive/80 text-destructive-foreground p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add images button */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
        >
          <ImagePlus className="h-4 w-4" />
          <span>{images.length > 0 || newImageFiles.length > 0 ? 'הוסף עוד תמונות' : 'הוסף תמונות'}</span>
        </button>
      </div>

      {/* Audio Files Section */}
      <div className="border-t border-[hsl(0,0%,18%)] pt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
            קבצי שמע ({audioFiles.length})
          </h2>
          <div className="flex items-center gap-2">
            {(savingFiles || uploadingAudio) && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>

        {/* Existing audio files list */}
        {audioFiles.length > 0 && (
          <div className="space-y-1 mb-3">
            {audioFiles.map((file, index) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2.5 group"
              >
                {/* Order controls */}
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

                {/* Audio type tag */}
                <select
                  value={file.audio_type || ''}
                  onChange={async (e) => {
                    const newType = e.target.value || null;
                    setSavingFiles(true);
                    const result = await updateAudioType(file.id, newType);
                    if (!result.error) {
                      setAudioFiles((prev) =>
                        prev.map((f) => (f.id === file.id ? { ...f, audio_type: newType } : f))
                      );
                    }
                    setSavingFiles(false);
                  }}
                  disabled={savingFiles}
                  className="rounded-md bg-[hsl(var(--surface-highlight))] px-2 py-1 text-xs text-foreground border-0 focus:outline-none focus:ring-1 focus:ring-primary/50 flex-shrink-0"
                  dir="rtl"
                >
                  <option value="">ללא סוג</option>
                  <option value="סידור">סידור</option>
                  <option value="עץ חיים">עץ חיים</option>
                </select>

                {/* Actions */}
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
        )}

        {/* Upload new audio files */}
        {showAudioUpload ? (
          <div className="space-y-3">
            <UploadZone
              onFilesSelected={handleAudioFilesSelected}
              disabled={uploadingAudio}
              multiple
            />

            {/* Upload progress */}
            {uploadingAudio && fileProgresses.length > 0 && (
              <div className="space-y-2">
                {fileProgresses.map((fp, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FileAudio className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate flex-1">{fp.fileName}</span>
                    {fp.status === 'uploading' && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-primary/20 overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${fp.progress}%` }} />
                        </div>
                        <span className="text-muted-foreground tabular-nums">{fp.progress}%</span>
                      </div>
                    )}
                    {fp.status === 'complete' && (
                      <Check className="h-3.5 w-3.5 text-green-400" />
                    )}
                    {fp.status === 'error' && (
                      <span className="text-destructive">שגיאה</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Upload / Cancel buttons */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleUploadAudio}
                disabled={pendingAudioFiles.length === 0 || uploadingAudio}
                className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {uploadingAudio ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>מעלה... {audioUploadProgress}%</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    <span>העלה {pendingAudioFiles.length > 0 ? `${pendingAudioFiles.length} קבצים` : ''}</span>
                  </>
                )}
              </button>
              {!uploadingAudio && (
                <button
                  type="button"
                  onClick={() => { setShowAudioUpload(false); setPendingAudioFiles([]); resetUpload(); }}
                  className="rounded-full bg-[hsl(var(--surface-elevated))] px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  ביטול
                </button>
              )}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAudioUpload(true)}
            className="flex items-center gap-2 rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
          >
            <Upload className="h-4 w-4" />
            <span>{audioFiles.length > 0 ? 'הוסף עוד קבצי שמע' : 'הוסף קבצי שמע'}</span>
          </button>
        )}
      </div>

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
