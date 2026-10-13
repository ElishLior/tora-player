'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { categoryOptions } from '@/lib/category-tree';
import {
  categoryPickerRows,
  makePrimaryCategory,
  primaryCategoryId,
} from '@/lib/lesson-categories';
import { cn } from '@/lib/utils';
import type { CategoryWithChildren } from '@/types/database';

/**
 * Indent before an option, by depth. Non-breaking spaces survive the select's whitespace rules.
 * Depth 0 has none; depth 1 is one step in; depth 2 is two steps in.
 */
const INDENT_BY_DEPTH = ['', '    — ', '        — '];

/** Start padding of a checkbox row, by depth (logical, so it indents to the right in Hebrew). */
const ROW_PADDING_BY_DEPTH = ['ps-3', 'ps-8', 'ps-14'];

const DEFAULT_CLASS =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

interface SingleCategoryPickerProps {
  /** Omitted or false: one category, a native select. */
  multiple?: false;
  value: string;
  onChange: (categoryId: string) => void;
  /** Up to three levels; every category at every level is selectable. */
  categories: CategoryWithChildren[];
  /** Adds a "no category" option whose value is `noneValue`. */
  includeNone?: boolean;
  noneLabel?: string;
  /** Value of the "no category" option. Defaults to ''. */
  noneValue?: string;
  /** Disabled first option, shown while `value` is ''. */
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

interface MultiCategoryPickerProps {
  /** true: several categories at any level, the first one is the primary (migration 026). */
  multiple: true;
  /** Ordered selection; values[0] is the primary category. */
  values: string[];
  onValuesChange: (categoryIds: string[]) => void;
  categories: CategoryWithChildren[];
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
}

export type CategoryPickerProps = SingleCategoryPickerProps | MultiCategoryPickerProps;

/**
 * Choosing categories anywhere a lesson or draft picks them. Single mode is a
 * native select (one value). Multiple mode is a checkbox tree with the chosen
 * categories as chips, the first being primary; see CategoryCheckPicker.
 */
export function CategoryPicker(props: CategoryPickerProps) {
  if (props.multiple) return <CategoryCheckPicker {...props} />;
  return <CategorySelect {...props} />;
}

function CategorySelect({
  value,
  onChange,
  categories,
  includeNone = false,
  noneLabel = '',
  noneValue = '',
  placeholder,
  id,
  className,
  disabled,
  'aria-label': ariaLabel,
}: SingleCategoryPickerProps) {
  const locale = useLocale();

  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className ?? DEFAULT_CLASS}
      dir="rtl"
    >
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {includeNone && <option value={noneValue}>{noneLabel}</option>}
      {categoryOptions(categories, locale).map((option) => (
        <option key={option.id} value={option.id}>
          {`${INDENT_BY_DEPTH[option.depth] ?? INDENT_BY_DEPTH[2]}${option.label}${
            option.depth >= 2 && option.parentLabel ? ` (${option.parentLabel})` : ''
          }`}
        </option>
      ))}
    </select>
  );
}

/**
 * Several categories. Chips at the top show the selection in order (the first is
 * primary, with "make primary" and "remove" beside the others). Below, a
 * checkbox tree: each checkbox is a native input, so Space toggles it, and its
 * label is the category name. The buttons are never inside a label.
 */
function CategoryCheckPicker({
  values,
  onValuesChange,
  categories,
  id,
  className,
  disabled,
  'aria-label': ariaLabel,
}: MultiCategoryPickerProps) {
  const locale = useLocale();
  const t = useTranslations('lessonCategories');
  const [query, setQuery] = useState('');

  const options = categoryOptions(categories, locale);
  const labelById = new Map(options.map((option) => [option.id, option.label]));
  const primary = primaryCategoryId(values);
  const rows = categoryPickerRows(categories, locale, query);

  return (
    <div className={cn('space-y-3', className)}>
      {values.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noneSelected')}</p>
      ) : (
        <ul aria-label={t('selectedLabel')} className="flex flex-wrap gap-2">
          {values.map((categoryId) => {
            const name = labelById.get(categoryId) ?? categoryId;
            const isPrimary = categoryId === primary;
            return (
              <li
                key={categoryId}
                className="flex max-w-full items-center gap-1 rounded-full bg-[hsl(var(--surface-elevated))] ps-3 pe-1 text-sm text-foreground"
              >
                <span className="min-w-0 break-words">{name}</span>
                {isPrimary && (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                    {t('primary')}
                  </span>
                )}
                {!isPrimary && (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onValuesChange(makePrimaryCategory(values, categoryId))}
                    aria-label={t('makePrimaryFor', { name })}
                    className="min-h-11 rounded-full px-2 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 motion-reduce:transition-none"
                  >
                    {t('makePrimary')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onValuesChange(values.filter((current) => current !== categoryId))}
                  aria-label={t('removeFor', { name })}
                  className="flex h-11 min-w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50 motion-reduce:transition-none"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <input
        id={id ? `${id}-search` : undefined}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search')}
        aria-label={t('search')}
        disabled={disabled}
        className="w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 border-0"
      />

      <fieldset
        id={id}
        disabled={disabled}
        className="max-h-72 overflow-y-auto rounded-lg bg-[hsl(var(--surface-elevated))] p-1"
      >
        <legend className="sr-only">{ariaLabel ?? t('legend')}</legend>
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">{t('noMatches')}</p>
        ) : (
          rows.map((row) => {
            const checked = values.includes(row.id);
            return (
              <label
                key={row.id}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md pe-3 py-2 text-sm text-foreground hover:bg-white/5',
                  ROW_PADDING_BY_DEPTH[row.depth] ?? ROW_PADDING_BY_DEPTH[2],
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    onValuesChange(
                      checked ? values.filter((current) => current !== row.id) : [...values, row.id],
                    )
                  }
                  className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))] focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <span className="min-w-0 break-words">{row.label}</span>
                {row.depth >= 2 && row.parentLabel && (
                  <span className="min-w-0 break-words text-xs text-muted-foreground">({row.parentLabel})</span>
                )}
              </label>
            );
          })
        )}
      </fieldset>

      <p className="text-xs text-muted-foreground">{t('pickerHint')}</p>
    </div>
  );
}
