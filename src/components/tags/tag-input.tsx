'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { MAX_TAGS, normalizeTag, normalizeTags } from '@/lib/tags';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Accessible label; also shown above the field when `showLabel` is set. */
  label?: string;
  showLabel?: boolean;
  disabled?: boolean;
}

let suggestionCache: Promise<string[]> | null = null;

/** Existing tags on published lessons, most used first. Fetched once per page load. */
function loadSuggestions(): Promise<string[]> {
  suggestionCache ??= Promise.resolve(createClient().rpc('lesson_tag_counts'))
    .then(({ data }) => ((data ?? []) as { tag: string }[]).map((row) => row.tag))
    .catch(() => []);
  return suggestionCache;
}

/**
 * Chip-style tag editor. Enter, comma or Tab commits the typed tag; Backspace on
 * an empty field removes the last chip. Suggestions come from existing tags.
 */
export function TagInput({ value, onChange, label, showLabel = false, disabled = false }: TagInputProps) {
  const t = useTranslations('tags');
  const inputId = useId();
  const listId = useId();
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    loadSuggestions().then((tags) => active && setSuggestions(tags));
    return () => {
      active = false;
    };
  }, []);

  const matches = useMemo(() => {
    const query = draft.trim().replace(/^#+/, '');
    return suggestions.filter((tag) => !value.includes(tag) && (!query || tag.includes(query))).slice(0, 8);
  }, [draft, suggestions, value]);

  const full = value.length >= MAX_TAGS;

  function commit(raw: string) {
    const tag = normalizeTag(raw);
    setDraft('');
    if (tag) onChange(normalizeTags([...value, tag]));
  }

  return (
    <div>
      <label htmlFor={inputId} className={showLabel ? 'mb-1.5 block text-sm text-muted-foreground' : 'sr-only'}>
        {label ?? t('label')}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:ring-2 focus-within:ring-primary/40">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/15 ps-2.5 pe-1 py-0.5 text-sm text-primary">
            <bdi>#{tag}</bdi>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((v) => v !== tag))}
              className="rounded-full p-0.5 hover:bg-primary/20"
              aria-label={t('remove', { tag })}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          list={listId}
          value={draft}
          disabled={disabled || full}
          placeholder={full ? t('full', { max: MAX_TAGS }) : value.length === 0 ? t('placeholder') : ''}
          onChange={(e) => {
            const next = e.target.value;
            if (/[,،]$/.test(next)) commit(next.slice(0, -1));
            else setDraft(next);
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === 'Tab') && draft.trim()) {
              e.preventDefault();
              commit(draft);
            } else if (e.key === 'Backspace' && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <datalist id={listId}>
          {matches.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
