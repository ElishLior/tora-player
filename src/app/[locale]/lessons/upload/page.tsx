'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Link as LinkIcon } from 'lucide-react';
import { UploadZone } from '@/components/upload/upload-zone';
import { WhatsAppInput } from '@/components/upload/whatsapp-input';
import { UploadProgress } from '@/components/upload/upload-progress';
import { useUpload } from '@/hooks/use-upload';
import { createLesson } from '@/actions/lessons';
import type { AudioMetadata } from '@/lib/audio-utils';
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp-parser';
import { Link } from '@/i18n/routing';

export default function UploadPage() {
  const t = useTranslations('lessons');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { status, progress, error: uploadError, upload } = useUpload();

  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const [parsedMessage, setParsedMessage] = useState<ParsedWhatsAppMessage | null>(null);
  const [title, setTitle] = useState('');
  const [hebrewTitle, setHebrewTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFileSelected = useCallback((f: File, meta: AudioMetadata) => {
    setFile(f);
    setMetadata(meta);
    // Auto-fill title from filename if empty
    if (!title) {
      const name = f.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setTitle(name);
    }
  }, [title]);

  const handleWhatsAppParsed = useCallback((result: ParsedWhatsAppMessage) => {
    setParsedMessage(result);
    setHebrewTitle(result.hebrewTitle);
    setTitle(result.title);
    setDate(result.date);
    setDescription(result.description);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      // Create lesson record
      const formData = new FormData();
      formData.set('title', title || `Lesson - ${date}`);
      formData.set('hebrew_title', hebrewTitle);
      formData.set('description', description);
      formData.set('date', date);
      formData.set('source_type', mode === 'upload' ? 'upload' : 'url_import');
      if (parsedMessage?.partNumber) {
        formData.set('part_number', String(parsedMessage.partNumber));
      }

      const result = await createLesson(formData);
      if (result.error) {
        setFormError('Failed to create lesson');
        setIsSubmitting(false);
        return;
      }

      const lessonId = result.data!.id;

      if (mode === 'upload' && file && metadata) {
        // Upload the file
        await upload(file, lessonId, metadata);
      } else if (mode === 'url' && importUrl) {
        // Import from URL
        await fetch('/api/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lessonId, url: importUrl }),
        });
      }

      // Navigate to the lesson
      router.push(`/lessons/${lessonId}`);
    } catch {
      setFormError('An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isUploading = status === 'uploading' || status === 'processing';
  const canSubmit = (mode === 'upload' ? !!file : !!importUrl) && !isUploading && !isSubmitting;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/lessons" className="rounded-full p-2 hover:bg-muted">
          <ArrowRight className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{t('addLesson')}</h1>
      </div>

      {/* Mode Tabs */}
      <div className="flex rounded-xl bg-muted p-1">
        <button
          onClick={() => setMode('upload')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'upload' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('uploadAudio')}
        </button>
        <button
          onClick={() => setMode('url')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'url' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          {t('importUrl')}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Audio Source */}
        {mode === 'upload' ? (
          <UploadZone onFileSelected={handleFileSelected} disabled={isUploading} />
        ) : (
          <div className="relative">
            <LinkIcon className="absolute start-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              type="url"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/audio.mp3"
              className="w-full rounded-xl border bg-background px-10 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              dir="ltr"
            />
          </div>
        )}

        {/* WhatsApp Text Input */}
        <WhatsAppInput onParsed={handleWhatsAppParsed} />

        {/* Lesson Details */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('hebrewName')}</label>
            <input
              type="text"
              value={hebrewTitle}
              onChange={(e) => setHebrewTitle(e.target.value)}
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              dir="rtl"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('lessonName')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('date')}</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{t('description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-xl border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              dir="rtl"
            />
          </div>
        </div>

        {/* Upload Progress */}
        <UploadProgress progress={progress} status={status} error={uploadError || undefined} />

        {/* Error */}
        {formError && (
          <p className="text-sm text-destructive">{formError}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting || isUploading ? tCommon('loading') : tCommon('save')}
        </button>
      </form>
    </div>
  );
}
