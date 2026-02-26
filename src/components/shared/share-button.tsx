'use client';

import { Share2, Copy, Clock, Link2, X, Check } from 'lucide-react';
import { getLessonShareUrl, shareLesson, copyToClipboard } from '@/lib/share';
import { useState, useRef, useEffect } from 'react';
import { useAudioPlayer } from '@/hooks/use-audio-player';

interface ShareButtonProps {
  lessonId: string;
  title: string;
  seriesName?: string;
  className?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(str: string): number | null {
  const parts = str.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

export function ShareButton({ lessonId, title, seriesName, className = '' }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [includeTimestamp, setIncludeTimestamp] = useState(false);
  const [timestampStr, setTimestampStr] = useState('0:00');
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const { currentTrack, currentTime } = useAudioPlayer();
  const isCurrentLesson = currentTrack?.id === lessonId;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleOpen = () => {
    // Pre-fill current time if playing this lesson
    if (isCurrentLesson && currentTime > 0) {
      setTimestampStr(formatTime(currentTime));
      setIncludeTimestamp(true);
    } else {
      setIncludeTimestamp(false);
      setTimestampStr('0:00');
    }
    setCopied(false);
    setShared(false);
    setOpen(true);
  };

  const getTimestamp = (): number | undefined => {
    if (!includeTimestamp) return undefined;
    return parseTime(timestampStr) || undefined;
  };

  const getShareUrl = (): string => {
    return getLessonShareUrl(lessonId, getTimestamp());
  };

  const handleCopyLink = async () => {
    const url = getShareUrl();
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    const url = getShareUrl();
    const text = seriesName ? `${title} - ${seriesName}` : title;
    const success = await shareLesson({ title, text, url });
    if (success) {
      setShared(true);
      setTimeout(() => { setShared(false); setOpen(false); }, 1500);
    }
  };

  const handleWhatsApp = () => {
    const url = getShareUrl();
    const text = seriesName ? `${title} - ${seriesName}` : title;
    const fullText = `${text}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank');
    setOpen(false);
  };

  const handleTelegram = () => {
    const url = getShareUrl();
    const text = seriesName ? `${title} - ${seriesName}` : title;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
    setOpen(false);
  };

  const handleUseCurrentTime = () => {
    if (isCurrentLesson && currentTime > 0) {
      setTimestampStr(formatTime(currentTime));
      setIncludeTimestamp(true);
    }
  };

  const hasNativeShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        className={`rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors ${className}`}
        aria-label="Share"
      >
        <Share2 className="h-5 w-5" />
      </button>

      {/* Share dialog overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 animate-fade-in">
          <div
            ref={dialogRef}
            className="w-full sm:max-w-sm bg-[hsl(var(--surface-elevated))] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-slide-up shadow-xl"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">שיתוף שיעור</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Lesson title preview */}
            <div className="text-sm text-muted-foreground truncate">
              {seriesName ? `${title} — ${seriesName}` : title}
            </div>

            {/* Timestamp option */}
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTimestamp}
                  onChange={(e) => setIncludeTimestamp(e.target.checked)}
                  className="rounded border-[hsl(0,0%,30%)] bg-[hsl(0,0%,10%)] text-primary focus:ring-primary/40 h-4 w-4"
                />
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">שיתוף מנקודת זמן</span>
              </label>

              {includeTimestamp && (
                <div className="flex items-center gap-2 ps-7">
                  <input
                    type="text"
                    value={timestampStr}
                    onChange={(e) => setTimestampStr(e.target.value)}
                    placeholder="0:00"
                    className="w-20 rounded-lg bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,20%)] px-2.5 py-1.5 text-sm text-foreground text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                    dir="ltr"
                  />
                  {isCurrentLesson && currentTime > 0 && (
                    <button
                      onClick={handleUseCurrentTime}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      השתמש בזמן נוכחי ({formatTime(currentTime)})
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* URL preview */}
            <div className="flex items-center gap-2 rounded-lg bg-[hsl(0,0%,10%)] border border-[hsl(0,0%,20%)] px-3 py-2.5" dir="ltr">
              <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground truncate flex-1">
                {getShareUrl()}
              </span>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-[hsl(var(--surface-highlight))] hover:bg-primary/20 text-foreground transition-colors flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-400" />
                    <span className="text-green-400">הועתק!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>העתק</span>
                  </>
                )}
              </button>
            </div>

            {/* Share actions */}
            <div className="space-y-2">
              {/* WhatsApp */}
              <button
                onClick={handleWhatsApp}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
              >
                <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                <span className="text-sm font-medium">שתף בוואטסאפ</span>
              </button>

              {/* Telegram */}
              <button
                onClick={handleTelegram}
                className="w-full flex items-center gap-3 rounded-xl px-4 py-3 bg-[#0088cc]/10 border border-[#0088cc]/30 text-[#0088cc] hover:bg-[#0088cc]/20 transition-colors"
              >
                <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                <span className="text-sm font-medium">שתף בטלגרם</span>
              </button>

              {/* Native share (mobile) */}
              {hasNativeShare && (
                <button
                  onClick={handleNativeShare}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 bg-[hsl(var(--surface-highlight))] border border-[hsl(var(--border))]/50 text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
                >
                  {shared ? (
                    <>
                      <Check className="h-5 w-5 text-green-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-green-400">שותף בהצלחה!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-5 w-5 flex-shrink-0" />
                      <span className="text-sm font-medium">שתף לאפליקציה אחרת...</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
