'use client';

import { categoryOptions } from '@/lib/category-tree';
import type { CategoryWithChildren } from '@/types/database';

/** Indent for child options. Non-breaking spaces survive the select's whitespace rules. */
const CHILD_PREFIX = '    — ';

const DEFAULT_CLASS =
  'w-full rounded-lg bg-[hsl(var(--surface-elevated))] px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 border-0';

export interface CategoryPickerProps {
  value: string;
  onChange: (categoryId: string) => void;
  /** Two-level tree; every top-level category and its children are selectable. */
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

/** Native select over the category tree. Use it everywhere a lesson or draft picks a category. */
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
      {categoryOptions(categories).map((option) => (
        <option key={option.id} value={option.id}>
          {option.depth > 0 ? `${CHILD_PREFIX}${option.label}` : option.label}
        </option>
      ))}
    </select>
  );
}
