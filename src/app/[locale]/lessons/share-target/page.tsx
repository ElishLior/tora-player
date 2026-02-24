'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Loader2, CheckCircle2, AlertTriangle, MessageSquare, FileAudio } from 'lucide-react';
import { parseWhatsAppText, type ParsedWhatsAppMessage } from '@/lib/whatsapp-parser';
import { createLesson } from '@/actions/lessons';
import { useUpload, type FileWithMeta } from '@/hooks/use-upload';
import type { AudioMetadata } from '@/lib/audio-utils';
import { formatFileSize } from '@/lib/audio-utils';

type ShareStep = 'receiving' | 'preview' | 'saving' | 'done' | 'error';

export default function ShareTargetPage() {
  const t = useTranslations('lessons');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { status: uploadStatus, progress, uploadMultiple, fileProgresses } = useUpload();

  const [step, setStep] = useState<ShareStep>('receiving');
  const [sharedText, setSharedText] = useState('');
  const [sharedFiles, setSharedFiles] = useState<File[]>([]);
  const [parsed, setParsed] = useState<ParsedWhatsAppMessage | null>(null);
  const [hebrewTitle, setHebrewTitle] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Process the shared data on mount
  useEffect(() => {
    processSharedData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processSharedData() {
    try {
      // Check URL params for text/title/url shares (GET fallback)
      const params = new URLSearchParams(window.location.search);
      const sharedTitle = params.get('title') || '';
      const sharedTextParam = params.get('text') || '';
      const sharedUrl = params.get('url') || '';

      // Combine all text sources
      const combinedText = [sharedTitle, sharedTextParam, sharedUrl]
        .filter(Boolean)
        .join('\n');

      // Check for file shares via the File Handling API / POST data
      if ('launchQueue' in navigator) {
        // @ts-expect-error - launchQueue is not yet in TypeScript types
        navigator.launchQueue.setConsumer(async (launchParams: { files: FileSystemHandle[] }) => {
          if (launchParams.files?.length > 0) {
            const audioFiles: File[] = [];
            for (const handle of launchParams.files) {
              const fileHandle = handle as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              if (file.type.startsWith('audio/')) {
                audioFiles.push(file);
              }
            }
            if (audioFiles.length > 0) {
              setSharedFiles(audioFiles);
            }
          }
        });
      }

      // Try to read files from service worker cache (for POST multipart shares)
      try {
        const cache = await caches.open('share-target-v1');
        const response = await cache.match('/share-target-data');
        if (response) {
          const formData = await response.formData();

          // Extract text fields
          const formTitle = formData.get('title') as string;
          const formText = formData.get('text') as string;
          const textFromForm = [formTitle, formText].filter(Boolean).join('\n');

          // Extract audio files (can be multiple)
          const audioFiles: File[] = [];
          const audioField = formData.getAll('audio');
          for (const item of audioField) {
            if (item instanceof File && item.size > 0) {
              audioFiles.push(item);
            }
          }
          if (audioFiles.length > 0) {
            setSharedFiles(audioFiles);
          }

          if (textFromForm) {
            setSharedText(textFromForm);
            const result = parseWhatsAppText(textFromForm);
            setParsed(result);
            setHebrewTitle(result.hebrewTitle);
            setTitle(result.title);
            setDate(result.date);
            setDescription(result.description);
          }

          // Clean up the cache
          await cache.delete('/share-target-data');
          setStep('preview');
          return;
        }
      } catch {
        // Cache not available, continue with URL params
      }

      if (combinedText) {
        setSharedText(combinedText);
        const result = parseWhatsAppText(combinedText);
        setParsed(result);
        setHebrewTitle(result.hebrewTitle);
        setTitle(result.title);
        setDate(result.date);
        setDescription(result.description);
        setStep('preview');
      } else {
        // No data received, redirect to regular upload
        router.replace('/he/lessons/upload');
      }
    } catch (err) {
      console.error('Error processing shared data:', err);
      setError('שגיאה בעיבוד התוכן');
      setStep('error');
    }
  }

  const handleSave = useCallback(async () => {
    setStep('saving');
    try {
      // Create the lesson
      const formData = new FormData();
      formData.set('title', title || `Lesson - ${date}`);
      formData.set('hebrew_title', hebrewTitle);
      formData.set('description', description);
      formData.set('date', date);
      formData.set('source_type', 'whatsapp');
      if (parsed?.partNumber) {
        formData.set('part_number', String(parsed.partNumber));
      }
      formData.set('source_text', sharedText);

      const result = await createLesson(formData);
      if (result.error) {
        throw new Error('Failed to create lesson');
      }

      const lessonId = result.data!.id;

      // Upload audio files if present
      if (sharedFiles.length > 0) {
        const filesWithMeta: FileWithMeta[] = sharedFiles.map((file) => ({
          file,
          metadata: {
            duration: 0,
            format: file.type || 'audio/mpeg',
            sampleRate: 44100,
            channels: 1,
            fileSize: file.size,
          } as AudioMetadata,
        }));
        await uploadMultiple(filesWithMeta, lessonId);
      }

      setStep('done');

      // Navigate to lesson after short delay
      setTimeout(() => {
        router.push(`/he/lessons/${lessonId}`);
      }, 1500);
    } catch (err) {
      console.error('Error saving lesson:', err);
      setError('שגיאה בשמירת השיעור');
      setStep('error');
    }
  }, [title, date, hebrewTitle, description, parsed, sharedText, sharedFiles, uploadMultiple, router]);

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4" dir="rtl">
      {/* Receiving */}
      {step === 'receiving' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">מקבל תוכן משותף...</p>
        </div>
      )}

      {/* Preview */}
      {step === 'preview' && (
        <div className="space-y-5">
          <h1 className="text-2xl font-bold">שיעור חדש מוואטסאפ</h1>

          {/* Shared content indicator */}
          <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">
            <MessageSquare className="h-4 w-4 flex-shrink-0" />
            <span>התקבל תוכן מוואטסאפ</span>
          </div>

          {/* Audio files indicator */}
          {sharedFiles.length > 0 && (
            <div className="space-y-1.5">
              {sharedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
                  <FileAudio className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{file.name} ({formatFileSize(file.size)})</span>
                </div>
              ))}
            </div>
          )}

          {/* Editable fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם בעברית</label>
              <input
                type="text"
                value={hebrewTitle}
                onChange={(e) => setHebrewTitle(e.target.value)}
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                dir="rtl"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">שם השיעור</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תאריך</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
                dir="rtl"
              />
            </div>

            {parsed?.seriesHint && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">סדרה מזוהה: </span>
                <span className="font-medium">{parsed.seriesHint}</span>
              </div>
            )}

            {parsed?.partNumber && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="text-muted-foreground">חלק: </span>
                <span className="font-medium">{parsed.partNumber}</span>
              </div>
            )}
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            שמירה
          </button>
        </div>
      )}

      {/* Saving */}
      {step === 'saving' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">
            {uploadStatus === 'uploading' ? `מעלה קבצים... ${progress}%` : 'שומר שיעור...'}
          </p>
          {sharedFiles.length > 0 && progress > 0 && (
            <div className="w-full max-w-xs bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          {/* Per-file progress */}
          {fileProgresses.length > 1 && (
            <div className="w-full max-w-xs space-y-1">
              {fileProgresses.map((fp, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="truncate flex-1 text-muted-foreground">{fp.fileName}</span>
                  {fp.status === 'uploading' && <span className="text-primary">{fp.progress}%</span>}
                  {fp.status === 'complete' && <span className="text-green-500">✓</span>}
                  {fp.status === 'error' && <span className="text-destructive">✗</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Done */}
      {step === 'done' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
          <p className="font-medium">השיעור נשמר בהצלחה!</p>
          <p className="text-sm text-muted-foreground">מעביר לדף השיעור...</p>
        </div>
      )}

      {/* Error */}
      {step === 'error' && (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="font-medium text-destructive">{error || 'שגיאה'}</p>
          <button
            onClick={() => router.push('/he/lessons/upload')}
            className="rounded-xl bg-muted px-6 py-2 text-sm font-medium hover:bg-muted/80"
          >
            עבור להעלאה ידנית
          </button>
        </div>
      )}
    </div>
  );
}
