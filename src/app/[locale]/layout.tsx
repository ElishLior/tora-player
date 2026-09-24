import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from 'next-themes';
import { AudioPlayer } from '@/components/player/audio-player';
import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { ServiceWorkerRegistrar } from '@/components/pwa/sw-registrar';
import { DEFAULT_LOCALE, SITE_DESCRIPTION, SITE_NAME, isSiteLocale } from '@/config/site';
import { heebo } from '@/app/fonts';

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Lesson content is Hebrew-only, so other locales are UI translations of the
 * same pages: they keep their own title/description but stay out of the index
 * (content pages set canonical to the default-locale URL).
 */
export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { locale } = await params;
  if (locale === DEFAULT_LOCALE || !isSiteLocale(locale)) return {};
  return {
    title: { default: SITE_NAME[locale], template: `%s · ${SITE_NAME[locale]}` },
    description: SITE_DESCRIPTION[locale],
    robots: { index: false, follow: true },
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!isSiteLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const isRTL = locale === 'he';

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'} className="dark" suppressHydrationWarning>
      <body className={`${heebo.variable} font-sans antialiased bg-background text-foreground min-h-screen`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
          <NextIntlClientProvider messages={messages}>
            <div className="flex min-h-screen flex-col">
              {/* Header */}
              <Header locale={locale} />

              {/* Main content - padded for bottom nav + mini player */}
              <main className="flex-1 container mx-auto px-4 py-4 pb-36">
                {children}
              </main>
            </div>

            {/* Bottom navigation */}
            <BottomNav locale={locale} />

            {/* Audio player (mini + full) */}
            <AudioPlayer />

            {/* PWA install prompt */}
            <InstallPrompt />

            {/* Service worker registration */}
            <ServiceWorkerRegistrar />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
