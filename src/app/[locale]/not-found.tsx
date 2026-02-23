import { FileQuestion } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="rounded-full bg-muted p-4 mb-6">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>

      <h2 className="text-4xl font-bold mb-2">404</h2>

      <p className="text-lg font-medium mb-1" dir="rtl">
        הדף לא נמצא
      </p>
      <p className="text-muted-foreground mb-6 text-sm">
        The page you are looking for does not exist.
      </p>

      <Link
        href="/he"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <span dir="rtl">חזרה לדף הבית</span>
      </Link>
    </div>
  );
}
