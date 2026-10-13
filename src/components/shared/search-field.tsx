import type { InputHTMLAttributes } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The one search box of a list page: a pill with a search icon at the start. Give it
 * `aria-label` (or it uses the placeholder). Put it in a form with role="search" where it
 * submits. Server-safe (no hooks), so it works in a GET form or a client filter.
 */
export function SearchField({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        aria-label={props['aria-label'] ?? (typeof props.placeholder === 'string' ? props.placeholder : undefined)}
        {...props}
        className="w-full rounded-full border-0 bg-[hsl(var(--surface-elevated))] py-2.5 pe-4 ps-11 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 motion-reduce:transition-none"
      />
    </div>
  );
}
