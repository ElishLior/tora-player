'use client';

import { useState } from 'react';
import { X, Bookmark } from 'lucide-react';
import { useBookmarksStore } from '@/stores/bookmarks-store';
import { formatDuration } from '@/lib/utils';

const PREDEFINED_TAGS = [
  { value: 'important', label: 'חשוב', labelEn: 'Important', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'review', label: 'לחזור', labelEn: 'Review', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'quote', label: 'ציטוט', labelEn: 'Quote', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { value: 'question', label: 'שאלה', labelEn: 'Question', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30' },
];

export function getTagInfo(tagValue: string) {
  return PREDEFINED_TAGS.find((t) => t.value === tagValue);
}

interface BookmarkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lessonId: string;
  position: number;
  locale?: string;
}

export function BookmarkDialog({ isOpen, onClose, lessonId, position, locale = 'he' }: BookmarkDialogProps) {
  const [note, setNote] = useState('');
  const [selectedTag, setSelectedTag] = useState('important');
  const addBookmark = useBookmarksStore((s) => s.addBookmark);
  const isRTL = locale === 'he';

  if (!isOpen) return null;

  const handleSave = () => {
    addBookmark(lessonId, position, note, selectedTag);
    setNote('');
    setSelectedTag('important');
    onClose();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
    >
      <div
        className="w-full sm:max-w-md bg-[hsl(0,0%,12%)] rounded-t-2xl sm:rounded-2xl p-5 space-y-4 animate-slide-up"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold">
              {isRTL ? 'הוסף סימניה' : 'Add Bookmark'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-[hsl(var(--surface-highlight))] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Timestamp display */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{isRTL ? 'זמן:' : 'Time:'}</span>
          <span className="font-mono text-primary font-bold text-base">
            {formatDuration(Math.round(position))}
          </span>
        </div>

        {/* Tag selector */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground font-medium">
            {isRTL ? 'סוג' : 'Tag'}
          </label>
          <div className="flex flex-wrap gap-2">
            {PREDEFINED_TAGS.map((tag) => (
              <button
                key={tag.value}
                onClick={() => setSelectedTag(tag.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                  selectedTag === tag.value
                    ? `${tag.color} border-current ring-1 ring-current/30 scale-105`
                    : 'bg-[hsl(var(--surface-elevated))] text-muted-foreground border-transparent hover:border-[hsl(0,0%,30%)]'
                }`}
              >
                {isRTL ? tag.label : tag.labelEn}
              </button>
            ))}
          </div>
        </div>

        {/* Note input */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground font-medium">
            {isRTL ? 'הערה (אופציונלי)' : 'Note (optional)'}
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isRTL ? 'כתוב הערה...' : 'Write a note...'}
            className="w-full rounded-xl bg-[hsl(var(--surface-elevated))] border border-[hsl(0,0%,22%)] px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 resize-none"
            rows={3}
            dir={isRTL ? 'rtl' : 'ltr'}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {isRTL ? 'ביטול' : 'Cancel'}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {isRTL ? 'שמור' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
