import { FileQuestion } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export default function NotFound() {
  const t = useTranslations('notFound');

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center px-4">
      <div className="rounded-full bg-muted p-4 mb-6">
        <FileQuestion className="h-10 w-10 text-muted-foreground" />
      </div>

      <p className="text-4xl font-bold mb-2">404</p>

      <h1 className="text-lg font-medium mb-1">{t('title')}</h1>
      <p className="text-muted-foreground mb-6 text-sm">{t('description')}</p>

      <Link
        href="/"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {t('backHome')}
      </Link>
    </div>
  );
}
