export function LessonCardSkeleton() {
  return (
    <div className="rounded-lg p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-[hsl(var(--surface-elevated))] h-10 w-10 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-[hsl(var(--surface-elevated))] rounded w-3/4" />
          <div className="h-3 bg-[hsl(var(--surface-elevated))] rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function LessonListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }, (_, i) => (
        <LessonCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="animate-pulse space-y-2 mb-6">
      <div className="h-8 bg-[hsl(var(--surface-elevated))] rounded w-48" />
      <div className="h-4 bg-[hsl(var(--surface-elevated))] rounded w-64" />
    </div>
  );
}
