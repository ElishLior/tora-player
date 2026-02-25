'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Share2, Check, Scissors } from 'lucide-react';

function formatTimeMMSS(totalSeconds: number): { minutes: number; seconds: number } {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  return {
    minutes: Math.floor(clamped / 60),
    seconds: clamped % 60,
  };
}

function toSeconds(minutes: number, seconds: number): number {
  return Math.max(0, minutes * 60 + seconds);
}

function formatDisplay(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ShareClipDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  currentTime: number;
  duration: number;
  lessonTitle: string;
}

export function ShareClipDialog({
  isOpen,
  onClose,
  lessonId,
  currentTime,
  duration,
  lessonTitle,
}: ShareClipDialogProps) {
  // Defaults: 30s before and after current position
  const defaultStart = Math.max(0, Math.floor(currentTime) - 30);
  const defaultEnd = Math.min(Math.floor(duration), Math.floor(currentTime) + 30);

  const [startMin, setStartMin] = useState(0);
  const [startSec, setStartSec] = useState(0);
  const [endMin, setEndMin] = useState(0);
  const [endSec, setEndSec] = useState(0);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  // Reset values when dialog opens
  useEffect(() => {
    if (isOpen) {
      const s = formatTimeMMSS(defaultStart);
      const e = formatTimeMMSS(defaultEnd);
      setStartMin(s.minutes);
      setStartSec(s.seconds);
      setEndMin(e.minutes);
      setEndSec(e.seconds);
      setCopied(false);
      setShared(false);
    }
  }, [isOpen, defaultStart, defaultEnd]);

  const startTotal = toSeconds(startMin, startSec);
  const endTotal = toSeconds(endMin, endSec);
  const clipDuration = Math.max(0, endTotal - startTotal);
  const isValid = endTotal > startTotal && startTotal >= 0 && endTotal <= Math.ceil(duration);

  const generateUrl = useCallback(() => {
    const base = `https://tora-player.vercel.app/he/lessons/${encodeURIComponent(lessonId)}`;
    return `${base}?start=${startTotal}&end=${endTotal}`;
  }, [lessonId, startTotal, endTotal]);

  const shareText = useCallback(() => {
    return `${lessonTitle}\n${String.fromCodePoint(0x2702)} קטע: ${formatDisplay(startTotal)} - ${formatDisplay(endTotal)}\n${generateUrl()}`;
  }, [lessonTitle, startTotal, endTotal, generateUrl]);

  const handleShare = async () => {
    const text = shareText();
    const url = generateUrl();

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `${lessonTitle} - קטע`,
          text,
          url,
        });
        setShared(true);
        setTimeout(() => onClose(), 1200);
      } catch {
        // User cancelled or not supported — fallback to clipboard
        await copyToClipboard(text);
      }
    } else {
      await copyToClipboard(text);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl bg-[hsl(0,0%,12%)] border border-[hsl(0,0%,20%)] shadow-2xl animate-slide-up"
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[hsl(0,0%,18%)]">
          <div className="flex items-center gap-2" dir="rtl">
            <Scissors className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-white">שתף קטע</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5" dir="rtl">
          {/* Lesson title */}
          <p className="text-sm text-white/60 truncate">{lessonTitle}</p>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-4">
            {/* Start time */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                התחלה
              </label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={startMin}
                  onChange={(e) => setStartMin(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                  aria-label="דקות התחלה"
                />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={startSec}
                  onChange={(e) => setStartSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                  aria-label="שניות התחלה"
                />
              </div>
            </div>

            {/* End time */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-white/50 uppercase tracking-wider">
                סיום
              </label>
              <div className="flex items-center gap-1.5" dir="ltr">
                <input
                  type="number"
                  min={0}
                  max={99}
                  value={endMin}
                  onChange={(e) => setEndMin(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                  aria-label="דקות סיום"
                />
                <span className="text-white/40 font-bold text-lg">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={endSec}
                  onChange={(e) => setEndSec(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="w-14 rounded-lg bg-[hsl(0,0%,8%)] border border-[hsl(0,0%,22%)] px-2 py-2.5 text-center text-white text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
                  aria-label="שניות סיום"
                />
              </div>
            </div>
          </div>

          {/* Clip duration preview */}
          <div className="rounded-lg bg-[hsl(0,0%,8%)] px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-white/50">משך הקטע</span>
            <span className={`text-sm font-mono font-bold tabular-nums ${isValid ? 'text-primary' : 'text-red-400'}`}>
              {isValid ? formatDisplay(clipDuration) : 'לא תקין'}
            </span>
          </div>

          {/* Validation error */}
          {!isValid && (
            <p className="text-xs text-red-400 text-center">
              זמן הסיום חייב להיות אחרי זמן ההתחלה
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium text-white/70 bg-white/5 hover:bg-white/10 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={handleShare}
              disabled={!isValid}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  הועתק!
                </>
              ) : shared ? (
                <>
                  <Check className="h-4 w-4" />
                  שותף!
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  שתף קטע
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
