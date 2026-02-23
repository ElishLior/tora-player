'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Error Boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="rounded-full bg-destructive/10 p-4 mb-6">
        <AlertTriangle className="h-10 w-10 text-destructive" />
      </div>

      <h2 className="text-2xl font-bold mb-2" dir="rtl">
        משהו השתבש
      </h2>
      <p className="text-muted-foreground mb-1 text-sm" dir="rtl">
        אירעה שגיאה בטעינת הדף
      </p>
      <p className="text-muted-foreground mb-6 text-xs">
        Something went wrong while loading this page.
      </p>

      <button
        onClick={reset}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <RotateCcw className="h-4 w-4" />
        <span dir="rtl">נסה שוב</span>
      </button>
    </div>
  );
}
