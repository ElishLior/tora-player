'use client';

import { Share2 } from 'lucide-react';
import { shareLesson, getLessonShareUrl } from '@/lib/share';
import { useState } from 'react';

interface ShareButtonProps {
  lessonId: string;
  title: string;
  seriesName?: string;
  className?: string;
}

export function ShareButton({ lessonId, title, seriesName, className = '' }: ShareButtonProps) {
  const [showCopied, setShowCopied] = useState(false);

  const handleShare = async () => {
    const url = getLessonShareUrl(lessonId);
    const text = seriesName ? `${title} - ${seriesName}` : title;

    const shared = await shareLesson({ title, text, url });

    // If fallback clipboard copy was used, show feedback
    if (shared && !(typeof navigator !== 'undefined' && navigator.share)) {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        className={`rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors ${className}`}
        aria-label="Share"
      >
        <Share2 className="h-5 w-5" />
      </button>
      {showCopied && (
        <div className="absolute -bottom-8 start-1/2 -translate-x-1/2 whitespace-nowrap bg-foreground text-background text-xs px-2 py-1 rounded-md animate-fade-in">
          הקישור הועתק!
        </div>
      )}
    </div>
  );
}
