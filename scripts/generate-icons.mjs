#!/usr/bin/env node
/**
 * Build every app icon and brand image from the two masters in assets/brand/:
 *   medallion.png    — round gold-ring medallion (app icon, favicon, header mark)
 *   illustration.png — transparent illustration (emails, sign-in, welcome)
 *
 *   node scripts/generate-icons.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = path.join(root, 'assets/brand');
const icons = path.join(root, 'public/icons');
const pub = path.join(root, 'public/brand');
const BG = '#121212'; // --background: hsl(0 0% 7%)

const medallion = path.join(brand, 'medallion.png');
const illustration = path.join(brand, 'illustration.png');

/** The medallion master has opaque black corners; cut a clean circle so it sits on any background. */
async function roundMedallion(size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 0.5}" fill="#fff"/></svg>`,
  );
  return sharp(medallion)
    .resize(size, size)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Medallion centred on the app background; `scale` < 1 leaves the safe zone maskable icons need. */
async function iconOnBackground(size, scale) {
  const inner = Math.round(size * scale);
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: await roundMedallion(inner), gravity: 'center' }])
    .png({ palette: true, quality: 90, compressionLevel: 9 })
    .toBuffer();
}

async function write(file, buffer) {
  await fs.writeFile(file, buffer);
  const { size } = await fs.stat(file);
  console.log(`${path.relative(root, file)}  ${(size / 1024).toFixed(0)} KB`);
}

async function main() {
  await fs.mkdir(icons, { recursive: true });
  await fs.mkdir(pub, { recursive: true });

  // PWA + platform icons
  await write(path.join(icons, 'icon-192.png'), await iconOnBackground(192, 0.94));
  await write(path.join(icons, 'icon-512.png'), await iconOnBackground(512, 0.94));
  await write(path.join(icons, 'icon-maskable-512.png'), await iconOnBackground(512, 0.78));
  await write(path.join(icons, 'apple-touch-icon.png'), await iconOnBackground(180, 0.9));
  await write(path.join(icons, 'favicon-32.png'), await roundMedallion(32));
  await write(path.join(icons, 'favicon-16.png'), await roundMedallion(16));

  // Header mark (2x of 36px) and web illustration
  await write(path.join(pub, 'logo-mark.webp'), await sharp(await roundMedallion(96)).webp({ quality: 90 }).toBuffer());
  await write(
    path.join(pub, 'illustration.webp'),
    await sharp(illustration).resize(640, 640).webp({ quality: 88 }).toBuffer(),
  );
  // Email logo: PNG for mail-client compatibility, sized for a 120px slot at 2x.
  await write(path.join(pub, 'email-logo.png'), await sharp(illustration).resize(240, 240).png({ compressionLevel: 9 }).toBuffer());

  // Podcast artwork (Apple: square JPEG/PNG, 1400–3000 px, RGB). No text, so a
  // rename never needs a new image; link previews are rendered by
  // src/app/opengraph-image.tsx.
  await write(
    path.join(pub, 'podcast-cover.jpg'),
    await sharp({ create: { width: 1400, height: 1400, channels: 3, background: BG } })
      .composite([{ input: await roundMedallion(1180), gravity: 'center' }])
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
