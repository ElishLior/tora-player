'use client';

import { useState } from 'react';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';
import type { LessonImage } from '@/types/database';

interface LessonImageGalleryProps {
  images: LessonImage[];
}

function getImageStreamUrl(fileKey: string) {
  const encodedKey = encodeURIComponent(fileKey);
  return `/api/images/stream/${encodedKey}`;
}

export function LessonImageGallery({ images }: LessonImageGalleryProps) {
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
    <>
      {/* Thumbnail grid */}
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

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 end-4 z-10 rounded-full p-2 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          {/* Counter */}
          <div className="absolute top-5 start-4 text-sm text-white/60 tabular-nums">
            {lightboxIndex + 1} / {sorted.length}
          </div>

          {/* Navigation - Previous */}
          {sorted.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goPrev(); }}
              className="absolute start-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Previous"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Image */}
          <img
            src={getImageStreamUrl(sorted[lightboxIndex].file_key)}
            alt={sorted[lightboxIndex].caption || sorted[lightboxIndex].original_name || ''}
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />

          {/* Navigation - Next */}
          {sorted.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goNext(); }}
              className="absolute end-2 top-1/2 -translate-y-1/2 z-10 rounded-full p-2 text-white/60 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
              aria-label="Next"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Caption */}
          {sorted[lightboxIndex].caption && (
            <div className="absolute bottom-6 inset-x-0 text-center">
              <p className="text-sm text-white/80 bg-black/50 inline-block px-4 py-2 rounded-full" dir="rtl">
                {sorted[lightboxIndex].caption}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
