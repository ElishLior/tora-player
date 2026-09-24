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

  // Link preview (WhatsApp/Telegram/Facebook): 1200x630, Hebrew RTL text.
  const og = Buffer.from(`<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="${BG}"/>
  <text x="1080" y="270" text-anchor="end" font-family="Arial Hebrew, SF Hebrew, Arial" font-weight="700" font-size="96" fill="#ffffff">נגן תורה</text>
  <text x="1080" y="350" text-anchor="end" font-family="Arial Hebrew, SF Hebrew, Arial" font-size="40" fill="#d4af37">שיעורי הרב אליהו</text>
  <text x="1080" y="410" text-anchor="end" font-family="Arial Hebrew, SF Hebrew, Arial" font-size="40" fill="#a1a1aa">ציון בניהו בן יהוידע</text>
</svg>`);
  await write(
    path.join(pub, 'og.jpg'),
    await sharp(og)
      .composite([{ input: await roundMedallion(470), left: 80, top: 80 }])
      .flatten({ background: BG })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer(),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
