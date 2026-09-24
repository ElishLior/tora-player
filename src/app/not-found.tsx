import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { heebo } from '@/app/fonts';
import { DEFAULT_LOCALE, localePath } from '@/config/site';

/**
 * 404 for paths outside the locale routes (the root layout renders no
 * <html>, so this page brings its own document, in the default locale).
 */
export default async function RootNotFound() {
  const t = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'notFound' });

  return (
    <html lang={DEFAULT_LOCALE} dir="rtl" className="dark">
      <body className={`${heebo.variable} font-sans antialiased bg-background text-foreground`}>
        <main className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
          <p className="text-4xl font-bold mb-2">404</p>
          <h1 className="text-lg font-medium mb-1">{t('title')}</h1>
          <p className="text-muted-foreground mb-6 text-sm">{t('description')}</p>
          <Link
            href={localePath('/')}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('backHome')}
          </Link>
        </main>
      </body>
    </html>
  );
}
