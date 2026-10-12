import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from 'next-themes';
import { AudioPlayer } from '@/components/player/audio-player';
import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { SideNav } from '@/components/layout/side-nav';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { NotificationPrompt } from '@/components/notifications/notification-prompt';
import { ServiceWorkerRegistrar } from '@/components/pwa/sw-registrar';
import { AppUpdateBanner } from '@/components/pwa/app-update-banner';
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
              <Header locale={locale} />

              {/* Desktop: side menu at the inline start (right in Hebrew, left in English) + centered content. */}
              <div className="flex flex-1">
                <SideNav locale={locale} />

                {/* Padded for the bottom nav + mini player on phones, the mini player alone on desktop. */}
                <main className="min-w-0 flex-1 px-4 py-4 pb-36 lg:px-8 lg:py-6 lg:pb-24">
                  <div className="mx-auto w-full max-w-3xl lg:max-w-5xl">{children}</div>
                </main>
              </div>
            </div>

            {/* Bottom navigation */}
            <BottomNav locale={locale} />

            {/* Audio player (mini + full) */}
            <AudioPlayer />

            {/* PWA install prompt */}
            <InstallPrompt />

            {/* New-lesson notification question (once per device) */}
            <NotificationPrompt />

            {/* A newer deployed build is available (passive; refresh is the user's choice) */}
            <AppUpdateBanner />

            {/* Service worker registration */}
            <ServiceWorkerRegistrar />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
