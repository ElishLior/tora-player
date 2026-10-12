'use client';

/** Reloads the current page (a failed server read is retried by a fresh request). */
export function ReloadButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="min-h-11 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      {label}
    </button>
  );
}
