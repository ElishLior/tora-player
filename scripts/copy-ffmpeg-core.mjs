#!/usr/bin/env node
// Copies the single-threaded ffmpeg.wasm core (devDependency @ffmpeg/core,
// pinned) into public/ffmpeg/ so the admin upload transcoder loads it from our
// own origin instead of a CDN (src/lib/audio-transcode.ts). Runs before
// `next dev` and `next build` (predev/prebuild). public/ffmpeg/ is gitignored.

import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ffmpeg');

// The package's `require` conditions point at dist/umd, the build that loads
// with importScripts() inside the (classic) worker webpack emits.
const files = [require.resolve('@ffmpeg/core'), require.resolve('@ffmpeg/core/wasm')];

await mkdir(outDir, { recursive: true });
for (const file of files) {
  await copyFile(file, path.join(outDir, path.basename(file)));
}
console.log(`ffmpeg core copied to public/ffmpeg: ${files.map((file) => path.basename(file)).join(', ')}`);
