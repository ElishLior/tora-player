#!/usr/bin/env node
/**
 * Generate PWA icons for Tora Player.
 * Creates a beautiful icon with a Torah scroll symbol on a dark blue gradient.
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'public', 'icons');

function createSvgIcon(size) {
  const padding = size * 0.1;
  const iconSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = size * 0.4;
  const subFontSize = size * 0.12;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1a365d"/>
      <stop offset="100%" style="stop-color:#0f2847"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6"/>
      <stop offset="100%" style="stop-color:#2563eb"/>
    </linearGradient>
  </defs>

  <!-- Background circle -->
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>

  <!-- Subtle inner glow -->
  <rect x="${size * 0.05}" y="${size * 0.05}" width="${size * 0.9}" height="${size * 0.9}" rx="${size * 0.18}" fill="none" stroke="rgba(59,130,246,0.15)" stroke-width="${size * 0.01}"/>

  <!-- Torah scroll symbol (ת) -->
  <text x="${cx}" y="${cy + fontSize * 0.12}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="white"
        text-anchor="middle"
        dominant-baseline="middle">תּ</text>

  <!-- Subtle line under -->
  <line x1="${cx - size * 0.18}" y1="${cy + fontSize * 0.45}" x2="${cx + size * 0.18}" y2="${cy + fontSize * 0.45}" stroke="url(#accent)" stroke-width="${size * 0.015}" stroke-linecap="round"/>
</svg>`;
}

async function generateIcon(size, filename) {
  const svg = createSvgIcon(size);
  const outputPath = path.join(OUTPUT_DIR, filename);

  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ quality: 100 })
    .toFile(outputPath);

  console.log(`✅ Generated ${filename} (${size}x${size})`);
}

async function run() {
  // Generate all needed sizes
  await generateIcon(192, 'icon-192.png');
  await generateIcon(512, 'icon-512.png');
  // Apple touch icon
  await generateIcon(180, 'apple-touch-icon.png');
  // Favicon
  await generateIcon(32, 'favicon-32.png');
  await generateIcon(16, 'favicon-16.png');

  console.log('\n🎉 All icons generated!');
}

run().catch(console.error);
