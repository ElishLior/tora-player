'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatPartDurations, PART_SEPARATOR } from '@/lib/part-durations';
import { cn } from '@/lib/utils';

interface PartDurationsProps {
  /** Each part's length in seconds, in play order (getLessonPartSeconds). */
  seconds: readonly number[];
  className?: string;
}

interface Edges {
  overflow: boolean;
  /** Content hidden past the physical left / right edge. */
  left: boolean;
  right: boolean;
}

const FADE = '1.25rem';
const NO_OVERFLOW: Edges = { overflow: false, left: false, right: false };

function readEdges(el: HTMLElement): Edges {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= 1) return NO_OVERFLOW;
  // RTL scrollLeft runs from 0 (start, right edge) to -max.
  const rtl = getComputedStyle(el).direction === 'rtl';
  const fromLeft = rtl ? max + el.scrollLeft : el.scrollLeft;
  return { overflow: true, left: fromLeft > 1, right: fromLeft < max - 1 };
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * "חלק 1: 82 דק׳ · חלק 2: 70 דק׳" on one line that never wraps. When it does
 * not fit, the hidden side fades and the rest is reachable without a second
 * line: swipe or tap on touch screens, hover or keyboard focus with a mouse.
 * Reduced motion jumps instead of scrolling smoothly.
 *
 * Inside a card with a stretched link, render it as a sibling of the link:
 * while it fits it stays unpositioned so a tap still opens the lesson; once it
 * overflows it lifts above the link so the swipe and tap reach it.
 */
export function PartDurations({ seconds, className }: PartDurationsProps) {
  const t = useTranslations('partDurations');
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>(NO_OVERFLOW);
  const items = formatPartDurations(seconds, t);
  const text = items.join(PART_SEPARATOR);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const next = readEdges(el);
    setEdges((prev) =>
      prev.overflow === next.overflow && prev.left === next.left && prev.right === next.right ? prev : next,
    );
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [measure, text]);

  const reveal = (toEnd: boolean) => {
    const el = ref.current;
    if (!el || !edges.overflow) return;
    const max = el.scrollWidth - el.clientWidth;
    const rtl = getComputedStyle(el).direction === 'rtl';
    el.scrollTo({ left: toEnd ? (rtl ? -max : max) : 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  const atEnd = () => {
    const el = ref.current;
    return el ? Math.abs(el.scrollLeft) >= el.scrollWidth - el.clientWidth - 1 : false;
  };

  if (items.length === 0) return null;

  const mask =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? 'transparent' : '#000'}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${edges.right ? 'transparent' : '#000'})`
      : undefined;

  return (
    <div
      ref={ref}
      role={edges.overflow ? 'group' : undefined}
      aria-label={edges.overflow ? t('label') : undefined}
      tabIndex={edges.overflow ? 0 : undefined}
      onScroll={measure}
      onPointerEnter={(e) => e.pointerType === 'mouse' && reveal(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && document.activeElement !== ref.current && reveal(false)}
      onFocus={(e) => e.currentTarget.matches(':focus-visible') && reveal(true)}
      onBlur={() => reveal(false)}
      onClick={(e) => {
        if (!edges.overflow) return;
        // A tap on a clipped line shows the other end instead of opening the card.
        e.stopPropagation();
        reveal(!atEnd());
      }}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={cn(
        'min-w-0 overflow-x-auto overscroll-x-contain whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        edges.overflow &&
          'relative z-10 rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-primary/70',
        className,
      )}
    >
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 && <span aria-hidden="true">{PART_SEPARATOR}</span>}
          <bdi>{item}</bdi>
        </span>
      ))}
    </div>
  );
}
