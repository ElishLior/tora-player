'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { ArrowRight, Link as LinkIcon, Plus, Scissors, ImagePlus, X, Calendar, Sparkles } from 'lucide-react';
import { UploadZone, type SelectedFile } from '@/components/upload/upload-zone';
import { WhatsAppInput } from '@/components/upload/whatsapp-input';
import { UploadProgress } from '@/components/upload/upload-progress';
import { useUpload, type FileWithMeta } from '@/hooks/use-upload';
import { createLesson } from '@/actions/lessons';
import { createSeries } from '@/actions/series';
import { getCategories } from '@/actions/categories';
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp-parser';
import type { Series, CategoryWithChildren } from '@/types/database';
import { Link } from '@/i18n/routing';

interface LessonMetadata {
  title: string;
  hebrewTitle: string;
  hebrewDate: string;
  hebrewDay: string;
  parsha: string | null;
  dayOfWeek: number;
  teacher: string;
  location: string;
  lessonType: string;
}

interface UploadFormProps {
  series: Series[];
  defaultSeriesId?: string;
}

export function UploadForm({ series: initialSeries, defaultSeriesId }: UploadFormProps) {
  const t = useTranslations('lessons');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { status, progress, error: uploadError, fileProgresses, uploadMultiple } = useUpload();

  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [parsedMessage, setParsedMessage] = useState<ParsedWhatsAppMessage | null>(null);
  const [title, setTitle] = useState('');
  const [hebrewTitle, setHebrewTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Auto-generated metadata
  const [metadata, setMetadata] = useState<LessonMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [autoTitleApplied, setAutoTitleApplied] = useState(false);

  // Category state
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);

  // Series state
  const [seriesList, setSeriesList] = useState<Series[]>(initialSeries);
  const [selectedSeriesId, setSelectedSeriesId] = useState(defaultSeriesId || '');
  const [showNewSeries, setShowNewSeries] = useState(false);
  const [newSeriesName, setNewSeriesName] = useState('');
  const [creatingNewSeries, setCreatingNewSeries] = useState(false);

  // Image upload ref
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isShortClipMode = !!defaultSeriesId;
  const backHref = isShortClipMode ? '/series' : '/lessons';

  // Auto-fetch metadata when date changes
  useEffect(() => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    let cancelled = false;
    setMetadataLoading(true);

    fetch(`/api/lesson-metadata?date=${date}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setMetadata(null);
          return;
        }
        setMetadata(data as LessonMetadata);

        // Auto-fill title if user hasn't manually typed one,
        // or if the current title was previously auto-generated
        if (!title || autoTitleApplied) {
          setTitle(data.title);
          setHebrewTitle(data.hebrewTitle || data.title);
          setAutoTitleApplied(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMetadata(null);
      })
      .finally(() => {
        if (!cancelled) setMetadataLoading(false);
      });

    return () => { cancelled = true; };
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch categories on mount
  useEffect(() => {
    async function loadCategories() {
      const result = await getCategories();
      if (result.data) setCategories(result.data);
    }
    loadCategories();
  }, []);

  const handleFilesSelected = useCallback((selectedFiles: SelectedFile[]) => {
    setFiles(selectedFiles);
  }, []);

  const handleWhatsAppParsed = useCallback((result: ParsedWhatsAppMessage) => {
    setParsedMessage(result);
    setHebrewTitle(result.hebrewTitle);
    setTitle(result.title);
    setDate(result.date);
    setDescription(result.description);
    setAutoTitleApplied(false); // WhatsApp override = manual
  }, []);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/'));
    if (newFiles.length > 0) {
      setImageFiles((prev) => [...prev, ...newFiles]);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleCreateNewSeries = async () => {
    if (!newSeriesName.trim()) return;
    setCreatingNewSeries(true);
    try {
      const formData = new FormData();
      formData.set('name', newSeriesName.trim());
      formData.set('hebrew_name', newSeriesName.trim());
      const result = await createSeries(formData);
      if (result.data) {
        setSeriesList((prev) => [...prev, result.data!]);
        setSelectedSeriesId(result.data.id);
        setShowNewSeries(false);
        setNewSeriesName('');
      }
    } catch {
      // ignore
    } finally {
      setCreatingNewSeries(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.set('title', title || `Lesson - ${date}`);
      formData.set('hebrew_title', hebrewTitle || title);
      formData.set('description', description);
      formData.set('date', date);
      formData.set('source_type', mode === 'upload' ? 'upload' : 'url_import');
      if (selectedSeriesId) {
        formData.set('series_id', selectedSeriesId);
      }
      if (categoryId) {
        formData.set('category_id', categoryId);
      }
      if (parsedMessage?.partNumber) {
        formData.set('part_number', String(parsedMessage.partNumber));
      }

      // Add auto-generated metadata
      if (metadata) {
        formData.set('hebrew_date', metadata.hebrewDate);
        if (metadata.parsha) formData.set('parsha', metadata.parsha);
        formData.set('teacher', metadata.teacher);
        formData.set('location', metadata.location);
        formData.set('lesson_type', metadata.lessonType);
      }

      const result = await createLesson(formData);
      if (result.error) {
        console.error('Create lesson error:', result.error);
        setFormError('שגיאה ביצירת השיעור');
        setIsSubmitting(false);
        return;
      }

      const lessonId = result.data!.id;

      // Upload audio files
      if (mode === 'upload' && files.length > 0) {
        const filesWithMeta: FileWithMeta[] = files.map((f) => ({
          file: f.file,
          metadata: f.metadata,
          transcodeEnabled: f.transcodeEnabled,
        }));
        await uploadMultiple(filesWithMeta, lessonId);
      } else if (mode === 'url' && importUrl) {
        await fetch('/api/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, url: importUrl }),
        });
      }

      // Upload images
      if (imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          const imgForm = new FormData();
          imgForm.append('file', imageFiles[i]);
          imgForm.append('lessonId', lessonId);
          imgForm.append('sortOrder', String(i));
          try {
            await fetch('/api/upload/image', { method: 'POST', body: imgForm });
          } catch (err) {
            console.error(`Image upload ${i} failed:`, err);
          }
        }
      }

      router.push(`/lessons/${lessonId}`);
    } catch {
      setFormError('אירעה שגיאה');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUploading = status === 'uploading' || status === 'processing';
  const hasContent = mode === 'upload' ? files.length > 0 : !!importUrl;
  const canSubmit = hasContent && !isUploading && !isSubmitting;

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={backHref} className="rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">
          {isShortClipMode
            ? (tCommon('series') || 'קטעים קצרים')
            : t('addLesson')
          }
        </h1>
        {isShortClipMode && (
          <Scissors className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Mode Tabs */}
      <div className="flex rounded-full bg-[hsl(var(--surface-elevated))] p-1">
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
            mode === 'upload' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('uploadAudio')}
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
            mode === 'url' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('importUrl')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Audio Source */}
        {mode === 'upload' ? (
          <UploadZone
            onFilesSelected={handleFilesSelected}
            disabled={isUploading}
            multiple={true}
          />
        ) : (
          <div className="relative">
            <LinkIcon className="absolute start-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/audio.mp3"
              className="w-full rounded-xl bg-[hsl(var(--surface-elevated))] px-10 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
              dir="ltr"
            />
          </div>
        )}

        {/* Image Upload */}
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            תמונות
          </label>
          <div className="space-y-2">
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
              <span>{imageFiles.length > 0 ? 'הוסף עוד תמונות' : 'הוסף תמונות'}</span>
            </button>

            {imageFiles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {imageFiles.map((img, index) => (
                  <div key={`${img.name}-${index}`} className="relative group">
                    <img
                      src={URL.createObjectURL(img)}
                      alt={img.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-1.5 -end-1.5 rounded-full bg-destructive text-destructive-foreground p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* WhatsApp Text Input */}
        <WhatsAppInput onParsed={handleWhatsAppParsed} />

        {/* Lesson Details */}
        <div className="space-y-4">
          {/* Date — moved up because it drives auto-generation */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              {t('date')}
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setAutoTitleApplied(true); // next metadata fetch will update title
                }}
                className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
              />
            </div>
          </div>

          {/* Auto-generated metadata preview */}
          {metadata && (
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                <span>נוצר אוטומטית</span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--surface-elevated))] px-2.5 py-1">
                  <Calendar className="h-3 w-3 text-muted-foreground" />
                  {metadata.hebrewDate}
                </span>
                <span className="rounded-full bg-[hsl(var(--surface-elevated))] px-2.5 py-1">
                  יום {metadata.hebrewDay}
                </span>
                {metadata.parsha && (
                  <span className="rounded-full bg-primary/20 text-primary px-2.5 py-1 font-medium">
                    פרשת {metadata.parsha}
                  </span>
                )}
              </div>
            </div>
          )}
          {metadataLoading && (
            <div className="text-xs text-muted-foreground animate-pulse">מחשב תאריך עברי...</div>
          )}

          {/* Series selector */}
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              {tCommon('series') || 'קטעים קצרים'}
            </label>

            {!showNewSeries ? (
              <div className="flex gap-2">
                <select
                  value={selectedSeriesId}
                  onChange={(e) => setSelectedSeriesId(e.target.value)}
                  className="flex-1 rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                  dir="rtl"
                >
                  <option value="">{isShortClipMode ? 'בחר קטע קצר...' : 'ללא קטע קצר'}</option>
                  {seriesList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.hebrew_name || s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewSeries(true)}
                  className="rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2.5 text-muted-foreground hover:text-foreground transition-colors"
                  title="צור חדש"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="שם הקטע הקצר..."
                  className="flex-1 rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
                  dir="rtl"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={handleCreateNewSeries}
                  disabled={!newSeriesName.trim() || creatingNewSeries}
                  className="rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40 transition-colors"
                >
                  {creatingNewSeries ? '...' : 'צור'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewSeries(false); setNewSeriesName(''); }}
                  className="rounded-lg bg-[hsl(var(--surface-elevated))] px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ✕
                </button>
              </div>
            )}
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

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('hebrewName')}</label>
            <input
              type="text"
              value={hebrewTitle}
              onChange={(e) => { setHebrewTitle(e.target.value); setAutoTitleApplied(false); }}
              className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
              dir="rtl"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('lessonName')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setAutoTitleApplied(false); }}
              className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0 resize-y"
              dir="rtl"
            />
          </div>
        </div>

        {/* Upload Progress */}
        <UploadProgress progress={progress} status={status} error={uploadError || undefined} />

        {/* Per-file progress */}
        {fileProgresses.length > 1 && (
          <div className="space-y-1.5">
            {fileProgresses.map((fp, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="truncate flex-1 text-muted-foreground">{fp.fileName}</span>
                {fp.status === 'uploading' && (
                  <span className="text-primary tabular-nums">{fp.progress}%</span>
                )}
                {fp.status === 'complete' && (
                  <span className="text-primary">✓</span>
                )}
                {fp.status === 'error' && (
                  <span className="text-destructive">✗</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-full bg-primary py-3.5 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isSubmitting || isUploading ? tCommon('loading') : tCommon('save')}
        </button>
      </form>
    </div>
  );
}
