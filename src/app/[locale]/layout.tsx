import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from 'next-themes';
import { AudioPlayer } from '@/components/player/audio-player';
import { Header } from '@/components/layout/header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InstallPrompt } from '@/components/pwa/install-prompt';
import { ServiceWorkerRegistrar } from '@/components/pwa/sw-registrar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as 'he' | 'en')) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();
  const isRTL = locale === 'he';

  return (
    <html lang={locale} dir={isRTL ? 'rtl' : 'ltr'} className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-background text-foreground min-h-screen`} suppressHydrationWarning>
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
