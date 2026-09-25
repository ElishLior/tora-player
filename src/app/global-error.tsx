'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import './globals.css';

// Shown only when the layout itself fails, replacing the whole document (hence
// its own <html>/<body>). The next-intl provider lives in that failed layout,
// so the text is inline: Hebrew with an English line.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('[Global Error]', error);
  }, [error]);

  return (
    <html lang="he" dir="rtl" className="dark">
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <h1 className="text-2xl font-bold mb-2">משהו השתבש</h1>
          <p className="text-muted-foreground mb-1 text-sm">האפליקציה לא נטענה. נסו לטעון אותה מחדש.</p>
          <p className="text-muted-foreground mb-6 text-xs" dir="ltr" lang="en">
            Something went wrong. Please reload the app.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            טען מחדש
          </button>
        </main>
      </body>
    </html>
  );
}
