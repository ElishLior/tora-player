'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bell,
  Bookmark,
  Car,
  ChevronDown,
  Download,
  FileDown,
  Hash,
  History,
  MousePointerClick,
  Moon,
  Search,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { usePushNotifications } from '@/components/notifications/use-push-notifications';
import { PlatformShareIcon } from '@/components/shared/platform-share-icon';
import { cn } from '@/lib/utils';

/** Inline icon inside a sentence: the same glyph the real button shows. */
function InlineIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="mx-0.5 inline-grid h-6 w-6 translate-y-1 place-items-center rounded-md bg-[hsl(var(--surface-highlight))] align-baseline text-foreground"
    >
      {children}
    </span>
  );
}

const RICH = {
  b: (chunks: ReactNode) => <b className="font-bold text-foreground">{chunks}</b>,
  share: (chunks: ReactNode) => (
    <InlineIcon label={String(chunks)}>
      <PlatformShareIcon className="h-3.5 w-3.5" />
    </InlineIcon>
  ),
};

/** Each feature's hue (the icon tint). The lesson-page tip is the highlighted one. */
const ITEMS = [
  { key: 'offline', hue: 141, icons: [Download] },
  { key: 'download', hue: 199, icons: [FileDown] },
  { key: 'resume', hue: 40, icons: [History] },
  { key: 'bookmarks', hue: 262, icons: [Bookmark, StickyNote] },
  { key: 'controls', hue: 28, icons: [] },
  { key: 'notifications', hue: 350, icons: [Bell] },
  { key: 'search', hue: 172, icons: [Search, Hash] },
  { key: 'share', hue: 210, icons: [] },
] as const;

/** The collapsed row's rotating line: the lesson-page tip first, then every feature. */
const TIPS = ['lessonPage', ...ITEMS.map((item) => `items.${item.key}` as const)] as const;
const TIP_INTERVAL_MS = 7000;

/**
 * "טיפים ועדכונים": the tips box at the top of the home page. It always loads
 * collapsed (owner, October 13, 2026): one row whose second line shows one tip
 * at a time, changing every few seconds (paused on hover, focus, a hidden tab
 * and reduced motion). A tap opens every feature in a grid, each with the
 * app's own icon, plus the lesson-page tip.
 */
export function HomeIntro({ className }: { className?: string }) {
  const t = useTranslations('homeIntro');
  const [open, setOpen] = useState(false);
  const [tip, setTip] = useState(0);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (open || held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setTip((index) => (index + 1) % TIPS.length);
    }, TIP_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [open, held]);

  const lessonPageTip = (
    <div className="from-primary/14 grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl border border-primary/30 bg-gradient-to-r to-primary/5 p-3 text-[13px] leading-relaxed text-foreground/80">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-[hsl(141_70%_62%)]">
        <MousePointerClick aria-hidden="true" className="h-4 w-4" />
      </span>
      <p>{t.rich('lessonPage', RICH)}</p>
    </div>
  );

  return (
    <section
      aria-labelledby="home-intro-title"
      className={cn(
        'rounded-2xl border border-border/60 bg-[linear-gradient(180deg,hsl(0_0%_12%),hsl(0_0%_10%))] px-3 py-1',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocus={() => setHeld(true)}
        onBlur={() => setHeld(false)}
        aria-expanded={open}
        aria-controls="home-intro-body"
        className="grid w-full gap-1 rounded-xl py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <span className="flex items-center gap-3">
          <span className="bg-primary/12 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg text-primary">
            <Sparkles aria-hidden="true" className="h-4 w-4" />
          </span>
          <span id="home-intro-title" className="flex-1 text-[15px] font-bold text-foreground">
            {t('title')}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {open ? t('hide') : t('more', { count: ITEMS.length })}
          </span>
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[hsl(var(--surface-elevated))]">
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'h-4 w-4 transition-transform duration-200 motion-reduce:transition-none',
                open && 'rotate-180',
              )}
            />
          </span>
        </span>
        {/* One tip at a time while collapsed. Hidden from screen readers: the text
            changes on its own, and every tip is in the list the button opens. */}
        {!open && (
          <span
            key={tip}
            aria-hidden="true"
            className="line-clamp-2 min-h-[2lh] ps-11 text-[13px] leading-relaxed text-foreground/75 motion-safe:duration-300 motion-safe:animate-in motion-safe:fade-in-0"
          >
            {t.rich(TIPS[tip], RICH)}
          </span>
        )}
      </button>

      <div id="home-intro-body" hidden={!open} className={cn('grid gap-3 pb-2 pt-2', !open && 'hidden')}>
        <p className="text-sm leading-relaxed text-foreground/75">{t('lead')}</p>
        {/* Two tinted cards per row on every screen (concept B). */}
        <ul className="grid grid-cols-2 gap-2">
          {ITEMS.map((item) => (
            <li
              key={item.key}
              className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl bg-[hsl(var(--surface-elevated))] p-3 text-[13px] leading-relaxed text-foreground/75"
            >
              <FeatureIcons
                hue={item.hue}
                icons={item.icons}
                controls={item.key === 'controls'}
                share={item.key === 'share'}
              />
              <div className="grid gap-2">
                <p>{t.rich(`items.${item.key}`, RICH)}</p>
                {item.key === 'notifications' && <NotificationsAction />}
              </div>
            </li>
          ))}
          <li className="col-span-2">{lessonPageTip}</li>
        </ul>
      </div>
    </section>
  );
}

function FeatureIcons({
  hue,
  icons,
  controls,
  share,
}: {
  hue: number;
  icons: readonly React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>[];
  controls?: boolean;
  /** The device's own share glyph (Apple or Android), like the real share buttons. */
  share?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-8 min-w-8 items-center gap-1.5 rounded-lg px-2"
      style={{ background: `hsl(${hue} 60% 50% / 0.16)`, color: `hsl(${hue} 80% 72%)` }}
    >
      {controls ? (
        <>
          <span className="rounded border-[1.5px] border-current px-0.5 text-[11px] font-extrabold tabular-nums leading-none">
            1x
          </span>
          <Moon className="h-4 w-4" />
          <Car className="h-4 w-4" />
        </>
      ) : share ? (
        <PlatformShareIcon className="h-4 w-4" />
      ) : (
        icons.map((Icon, index) => <Icon key={index} className="h-4 w-4" aria-hidden />)
      )}
    </span>
  );
}

/** The notifications item's button: only while notifications can still be turned on. */
function NotificationsAction() {
  const t = useTranslations('homeIntro');
  const tNotifications = useTranslations('notifications');
  const { status, busy, error, enable } = usePushNotifications();

  if (status !== 'off') return null;

  return (
    <div className="grid gap-1.5">
      <button
        type="button"
        onClick={() => void enable()}
        disabled={busy}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <Bell aria-hidden="true" className="h-4 w-4" />
        {t('enableNotifications')}
      </button>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {tNotifications('errors.failed')}
        </p>
      )}
    </div>
  );
}
