'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { noteImageUrl } from '@/lib/note-rules';
import type { LocalNoteImage } from '@/stores/notes-store';

interface NoteImageStripProps {
  images: LocalNoteImage[];
  /** Shown while an upload for this note is running. */
  uploading?: boolean;
  /** Offers a remove button on each thumbnail when given. */
  onRemove?: (imageId: string) => void;
}

/**
 * Thumbnails of a note's private images with a full-screen lightbox. Images
 * load through /api/notes/images/<id>, which only serves them to their owner.
 */
export function NoteImageStrip({ images, uploading = false, onRemove }: NoteImageStripProps) {
  const t = useTranslations('library.notes');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const current = openIndex === null ? null : images[openIndex];

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenIndex(null);
      // Arrow keys follow the reading direction of the document.
      const rtl = document.documentElement.dir === 'rtl';
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const forward = (event.key === 'ArrowLeft') === rtl;
        setOpenIndex((index) => (index === null ? null : (index + (forward ? 1 : -1) + images.length) % images.length));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, images.length]);

  // An image removed while the lightbox shows it closes the lightbox.
  useEffect(() => {
    if (openIndex !== null && openIndex >= images.length) setOpenIndex(null);
  }, [images.length, openIndex]);

  if (images.length === 0 && !uploading) return null;

  const step = (delta: number) =>
    setOpenIndex((index) => (index === null ? null : (index + delta + images.length) % images.length));

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {images.map((image, index) => (
          <div key={image.id} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setOpenIndex(index)}
              className="block h-16 w-16 overflow-hidden rounded-lg bg-[hsl(var(--surface-highlight))] focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={t('image', { index: index + 1 })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user image served by our own route */}
              <img
                src={noteImageUrl(image.id)}
                alt=""
                width={image.width ?? undefined}
                height={image.height ?? undefined}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </button>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(image.id)}
                className="absolute -top-1.5 -end-1.5 rounded-full bg-background p-0.5 text-muted-foreground shadow ring-1 ring-border hover:text-red-400"
                aria-label={t('removeImage')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {uploading && (
          <div
            role="status"
            aria-label={t('uploading')}
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--surface-highlight))]"
          >
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>

      {current && openIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('image', { index: openIndex + 1 })}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          onClick={() => setOpenIndex(null)}
        >
          <button
            type="button"
            onClick={() => setOpenIndex(null)}
            className="absolute top-4 end-4 z-10 rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white"
            aria-label={t('closeImage')}
          >
            <X className="h-6 w-6" />
          </button>
          <bdi dir="ltr" className="absolute top-5 start-4 text-sm tabular-nums text-white/60">
            {openIndex + 1} / {images.length}
          </bdi>
          {images.length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                step(-1);
              }}
              className="absolute start-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white"
              aria-label={t('previousImage')}
            >
              <ChevronRight className="h-6 w-6 ltr:rotate-180" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- private, per-user image served by our own route */}
          <img
            src={noteImageUrl(current.id)}
            alt={t('image', { index: openIndex + 1 })}
            className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          {images.length > 1 && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                step(1);
              }}
              className="absolute end-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white"
              aria-label={t('nextImage')}
            >
              <ChevronLeft className="h-6 w-6 ltr:rotate-180" />
            </button>
          )}
        </div>
      )}
    </>
  );
}
