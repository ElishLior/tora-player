/** Placeholder with the shape of a LessonCard row (date tile, two lines, chips, play button). */
export function LessonCardSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 rounded-2xl p-2.5 sm:p-3">
      <div className="h-[58px] w-[52px] flex-shrink-0 animate-pulse rounded-xl bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
      <div className="grid min-w-0 flex-1 gap-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
        <div className="flex gap-1.5">
          <div className="h-6 w-24 animate-pulse rounded-full bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
          <div className="h-6 w-24 animate-pulse rounded-full bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
        </div>
      </div>
      <div className="h-11 w-11 flex-shrink-0 animate-pulse rounded-full bg-[hsl(var(--surface-elevated))] motion-reduce:animate-none" />
    </div>
  );
}
