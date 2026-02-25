export function LessonCardSkeleton() {
  return (
    <div className="block rounded-lg p-3">
      <div className="flex items-center gap-3">
        {/* Play button placeholder */}
        <div className="flex-shrink-0 h-10 w-10 rounded-md bg-[hsl(var(--surface-elevated))] animate-pulse" />

        {/* Text info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-3/4 rounded bg-[hsl(var(--surface-elevated))] animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-[hsl(var(--surface-elevated))] animate-pulse" />
        </div>

        {/* Badge placeholder */}
        <div className="h-5 w-10 rounded-full bg-[hsl(var(--surface-elevated))] animate-pulse flex-shrink-0" />
      </div>
    </div>
  );
}
