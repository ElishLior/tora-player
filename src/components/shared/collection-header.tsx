import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface CollectionHeaderProps {
  /** The hue of the band's wash: the collection's reading hue (readingHue of its id). */
  hue: number;
  /** The cover tile (CoverTile), sized by the caller. */
  cover: ReactNode;
  /** A small label above the title (playlist, series, category). */
  eyebrow?: ReactNode;
  /** The page's single h1. */
  title: ReactNode;
  description?: ReactNode;
  /** Play buttons and similar, in a row under the text. */
  actions?: ReactNode;
  /** A back link above the band. */
  back?: ReactNode;
  className?: string;
}

/**
 * The header band of a collection page (playlist, series, category): the cover on the
 * start side, the eyebrow, title, description and actions beside it. The band is washed
 * with the collection's own hue (the same family as its cover). Stacked on phones, side by
 * side from sm. Server-safe (no hooks).
 */
export function CollectionHeader({
  hue,
  cover,
  eyebrow,
  title,
  description,
  actions,
  back,
  className,
}: CollectionHeaderProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {back}
      <section
        className="relative rounded-2xl border border-border/40 p-4 sm:p-6"
        style={{
          background: `linear-gradient(160deg, hsl(${hue} 42% 22% / 0.9), hsl(var(--surface-elevated)) 80%)`,
        }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
          {cover}
          <div className="min-w-0 flex-1 space-y-2">
            {eyebrow && (
              <p className="text-xs font-bold" style={{ color: `hsl(${hue} 65% 76%)` }}>
                {eyebrow}
              </p>
            )}
            <h1
              dir="auto"
              className="break-words text-2xl font-extrabold leading-tight tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h1>
            {description && (
              <p dir="auto" className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
            {actions && <div className="flex flex-wrap items-center gap-2 pt-2">{actions}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
