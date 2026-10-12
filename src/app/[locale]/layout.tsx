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
import { DesktopShell } from '@/components/layout/desktop-shell';
import { NowPlayingPanel } from '@/components/player/now-playing-panel';
import { getCachedRecentLessons } from '@/lib/supabase/anon';
import { isSupabaseConfigured } from '@/lib/supabase/server';
import { SHELL_PAGE_BACKGROUND } from '@/lib/desktop-shell';
import type { LessonWithRelations } from '@/types/database';
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

/**
 * The latest published lesson, for the desktop panel's fallback. It is the same cached
 * read the home page uses (getCachedRecentLessons(10), first row), so the panel and the
 * hero always show the same lesson. Null when nothing can be read (CI builds, outages).
 */
async function readLatestLesson(): Promise<LessonWithRelations | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const [latest] = await getCachedRecentLessons(10);
    return latest ?? null;
  } catch (error) {
    console.error('Layout: failed to read the latest lesson', error);
    return null;
  }
}

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
  const latestLesson = await readLatestLesson();

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'} className="dark" suppressHydrationWarning>
      <body
        className={`${heebo.variable} min-h-screen bg-background font-sans text-foreground antialiased`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme="dark" forcedTheme="dark" enableSystem={false}>
          <NextIntlClientProvider messages={messages}>
            <div className={`flex min-h-screen flex-col ${SHELL_PAGE_BACKGROUND}`}>
              <Header locale={locale} />

              {/* Phones and tablets: the page alone. Desktop: side menu, page and now-playing panel as panes (DesktopShell). */}
              <DesktopShell
                sidebar={<SideNav locale={locale} />}
                panel={<NowPlayingPanel fallbackLesson={latestLesson} />}
              >
                {/* The page's content width: fluid on desktop, capped on very wide screens. */}
                <div className="mx-auto w-full max-w-3xl lg:max-w-[1680px]">{children}</div>
              </DesktopShell>
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
