'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { BUILT_IN_PART_TYPES, MAX_PART_TYPE_LENGTH, normalizePartType, partTypeOptions } from '@/lib/part-types';

const NEW_TYPE = '__new';

// Picker choices shared by every field on the page: built-in types, types in
// use (fetched once per page load) and types typed in during this visit.
let options: string[] = [...BUILT_IN_PART_TYPES];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setOptions(next: string[]) {
  options = next;
  listeners.forEach((listener) => listener());
}

function addOption(type: string) {
  if (!options.includes(type)) setOptions([...options, type]);
}

function loadOptions() {
  loading ??= Promise.resolve(
    createClient().from('lesson_audio').select('audio_type').not('audio_type', 'is', null).limit(5000),
  )
    .then(({ data }) => {
      const used = ((data ?? []) as { audio_type: string | null }[]).map((row) => row.audio_type);
      setOptions(partTypeOptions([...used, ...options]));
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface PartTypeFieldProps {
  value: string | null;
  /** Called with a committed type (null = no type), never per keystroke. */
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Part type picker (סידור / עץ חיים / ...). "New type…" opens a text field; a
 * type typed there is offered for every other part on the page and, once saved,
 * on later pages too.
 */
export function PartTypeField({ value, onChange, disabled = false, className }: PartTypeFieldProps) {
  const t = useTranslations('upload');
  const choices = useSyncExternalStore(subscribe, () => options, () => options);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(loadOptions, []);

  const list = value && !choices.includes(value) ? [...choices, value] : choices;
  const fieldClass = 'min-w-0 rounded-md border-0 bg-[hsl(var(--surface-elevated))] px-2 py-1 text-xs disabled:opacity-60';

  const commit = () => {
    if (draft === null) return;
    const type = normalizePartType(draft);
    setDraft(null);
    if (!type) return;
    addOption(type);
    if (type !== value) onChange(type);
  };

  if (draft !== null) {
    return (
      <input
        type="text"
        dir="auto"
        autoFocus
        value={draft}
        maxLength={MAX_PART_TYPE_LENGTH}
        disabled={disabled}
        placeholder={t('customTypePlaceholder')}
        aria-label={t('partType')}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setDraft(null);
          }
        }}
        onBlur={commit}
        className={cn(fieldClass, 'flex-1', className)}
      />
    );
  }

  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      aria-label={t('partType')}
      onChange={(e) => {
        const next = e.target.value;
        if (next === NEW_TYPE) setDraft('');
        else onChange(next || null);
      }}
      className={cn(fieldClass, className)}
    >
      <option value="">{t('noType')}</option>
      {list.map((type) => (
        <option key={type} value={type}>
          {type}
        </option>
      ))}
      <option value={NEW_TYPE}>{t('customType')}</option>
    </select>
  );
}
