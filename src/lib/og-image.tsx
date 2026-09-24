import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/config/site';
import { rtlVisualWords } from '@/lib/og-bidi';

/*
 * Link-preview cards (WhatsApp, Telegram, Facebook, X) rendered with Satori.
 * Satori has no Hebrew glyphs, so Heebo is bundled in src/assets/fonts.
 */

export const OG_IMAGE_SIZE = { width: 1200, height: 630 };
export const OG_IMAGE_CONTENT_TYPE = 'image/png';

const BACKGROUND = '#121212';
const GOLD = '#d4af37';
const MUTED = '#a1a1aa';
const TITLE_MAX_LENGTH = 90;

interface OgAssets {
  regular: Buffer;
  bold: Buffer;
  medallion: string;
}

let assets: Promise<OgAssets> | null = null;

/** Fonts and the app medallion, read once per server instance. */
function loadAssets(): Promise<OgAssets> {
  assets ??= Promise.all([
    readFile(join(process.cwd(), 'src/assets/fonts/Heebo-Regular.ttf')),
    readFile(join(process.cwd(), 'src/assets/fonts/Heebo-Bold.ttf')),
    readFile(join(process.cwd(), 'public/icons/icon-512.png')),
  ])
    .then(([regular, bold, icon]) => ({ regular, bold, medallion: `data:image/png;base64,${icon.toString('base64')}` }))
    .catch((error) => {
      assets = null;
      throw error;
    });
  return assets;
}

export interface OgCard {
  title: string;
  /** Gold line under the title (series name, tagline). */
  subtitle?: string | null;
  /** Small facts line (date, duration). */
  facts?: ReadonlyArray<string | null | undefined>;
}

/**
 * A right-to-left paragraph for Satori, which has no bidi: words come
 * pre-ordered by rtlVisualWords and flow right to left in a wrapping row.
 */
function RtlText({ text, fontSize, color, fontWeight = 400 }: { text: string; fontSize: number; color: string; fontWeight?: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        columnGap: Math.round(fontSize * 0.28),
        rowGap: Math.round(fontSize * 0.12),
        fontSize,
        color,
        fontWeight,
        lineHeight: 1.15,
      }}
    >
      {rtlVisualWords(text).map((word, index) => (
        <span key={index}>{word}</span>
      ))}
    </div>
  );
}

/** Brand card: medallion on the left, right-aligned Hebrew text on the right (site name above any other title). */
export async function renderOgImage(card: OgCard, headers?: HeadersInit): Promise<ImageResponse> {
  const { regular, bold, medallion } = await loadAssets();
  const title = card.title.length > TITLE_MAX_LENGTH ? `${card.title.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()}…` : card.title;
  const titleSize = title.length > 60 ? 50 : title.length > 32 ? 60 : 72;
  const facts = (card.facts ?? []).filter(Boolean).join(' · ');

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100%',
          alignItems: 'center',
          gap: 56,
          padding: '64px 72px',
          background: BACKGROUND,
          fontFamily: 'Heebo',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> */}
        <img src={medallion} width={400} height={400} alt="" style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 22 }}>
          {title !== SITE_NAME.he && <RtlText text={SITE_NAME.he} fontSize={34} color={GOLD} fontWeight={700} />}
          <RtlText text={title} fontSize={titleSize} color="#ffffff" fontWeight={700} />
          {card.subtitle && <RtlText text={card.subtitle} fontSize={36} color={GOLD} />}
          {facts && <RtlText text={facts} fontSize={30} color={MUTED} />}
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts: [
        { name: 'Heebo', data: regular, weight: 400, style: 'normal' },
        { name: 'Heebo', data: bold, weight: 700, style: 'normal' },
      ],
      headers,
    },
  );
}
