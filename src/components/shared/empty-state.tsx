import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** A primary action (a link or button) where one makes sense. */
  action?: ReactNode;
  /** rose = the shorts accent; neutral = the app's green primary; muted = a failed read (not success). */
  tone?: 'neutral' | 'rose' | 'muted';
  /** Inside a card: less padding, same anatomy. */
  compact?: boolean;
}

const TONE = {
  neutral: 'bg-primary/10 text-primary',
  rose: 'bg-rose-400/15 text-rose-400',
  muted: 'bg-[hsl(var(--surface-highlight))] text-muted-foreground',
} as const;

/**
 * The one empty state: an icon in a tinted circle, a title, one line of hint and,
 * where it helps, one primary action. Server-safe (no hooks), so server pages and
 * ListLoadError render it directly; a client component passes its own icon in.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'neutral',
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-4 py-6' : 'gap-2 px-4 py-12 sm:py-16',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mb-2 flex items-center justify-center rounded-full',
          compact ? 'h-12 w-12' : 'h-16 w-16',
          TONE[tone],
        )}
      >
        <Icon className={compact ? 'h-6 w-6' : 'h-7 w-7'} />
      </span>
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
