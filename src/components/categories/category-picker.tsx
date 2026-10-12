'use client';

import { useLocale } from 'next-intl';
import { categoryOptions } from '@/lib/category-tree';
import type { CategoryWithChildren } from '@/types/database';

/**
 * Indent before an option, by depth. Non-breaking spaces survive the select's whitespace rules.
 * Depth 0 has none; depth 1 is one step in; depth 2 is two steps in.
 */
const INDENT_BY_DEPTH = ['', '    — ', '        — '];

const DEFAULT_CLASS =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

export interface CategoryPickerProps {
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

/**
 * Native select over the category tree. Use it everywhere a lesson or draft picks a category.
 * Sub-subcategories name their parent too, so repeated names (several "שיעורים") stay distinct.
 */
export function CategoryPicker({
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
}: CategoryPickerProps) {
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
