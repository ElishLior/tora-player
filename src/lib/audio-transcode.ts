'use client';

/**
 * Client-side audio transcoding using ffmpeg.wasm
 *
 * Converts large audio files (FLAC, WAV, large MP3) to Opus/OGG
 * for optimal streaming and storage.
 *
 * Uses single-threaded WASM build (no SharedArrayBuffer/COOP/COEP required).
 * WASM is loaded from CDN on demand — singleton instance.
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Singleton ffmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<boolean | void> | null = null;

// Threshold: auto-transcode files larger than this
const TRANSCODE_SIZE_THRESHOLD = 50 * 1024 * 1024; // 50 MB

// Lossless formats that always benefit from transcoding
const LOSSLESS_EXTENSIONS = new Set(['flac', 'wav', 'aiff', 'aif']);

// All supported input formats
const SUPPORTED_INPUT = new Set(['mp3', 'wav', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'webm', 'aiff', 'aif']);

export interface TranscodeOptions {
  /** Target bitrate in kbps (default: 48) */
  bitrate?: number;
  /** Target sample rate in Hz (default: 24000) */
  sampleRate?: number;
  /** Number of channels (default: 1 = mono) */
  channels?: number;
}

export interface TranscodeProgress {
  /** 0-100 percentage */
  percent: number;
  /** Human-readable status */
  message: string;
}

/**
 * Get or create the singleton FFmpeg instance.
 * Loads WASM from CDN on first call.
 */
async function getFFmpeg(onProgress?: (p: TranscodeProgress) => void): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (loadPromise) {
    await loadPromise;
    return ffmpegInstance!;
  }

  ffmpegInstance = new FFmpeg();

  // Progress callback for ffmpeg operations
  ffmpegInstance.on('progress', ({ progress }) => {
    const pct = Math.round(Math.max(0, Math.min(100, progress * 100)));
    onProgress?.({ percent: pct, message: `ממיר... ${pct}%` });
  });

  onProgress?.({ percent: 0, message: 'טוען מנוע המרה...' });

  loadPromise = ffmpegInstance.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
  }).catch((err) => {
    // Reset on failure so next attempt retries
    ffmpegInstance = null;
    loadPromise = null;
    throw err;
  });

  await loadPromise;
  onProgress?.({ percent: 0, message: 'מנוע המרה מוכן' });
  return ffmpegInstance!;
}

/**
 * Get the file extension from a File object.
 */
function getExtension(file: File): string {
  return (file.name.split('.').pop() || '').toLowerCase();
}

/**
 * Check if a file should be transcoded.
 * Returns true for:
 * - Any file > 50MB (large files benefit from Opus compression)
 * - Lossless formats (FLAC, WAV) regardless of size
 * - Does NOT transcode files already in Opus/OGG format
 */
export function shouldTranscode(file: File): boolean {
  const ext = getExtension(file);

  // Don't transcode Opus/OGG — already optimal
  if (ext === 'opus' || ext === 'ogg') return false;

  // Don't transcode unsupported formats
  if (!SUPPORTED_INPUT.has(ext)) return false;

  // Always transcode lossless formats
  if (LOSSLESS_EXTENSIONS.has(ext)) return true;

  // Transcode large files
  return file.size > TRANSCODE_SIZE_THRESHOLD;
}

/**
 * Estimate the transcoded file size.
 * Opus @ 48kbps ≈ 6KB/sec ≈ 360KB/min
 * We estimate based on file size / format typical bitrate.
 */
export function estimateTranscodedSize(file: File): { estimatedSize: number; savingsPercent: number } {
  const ext = getExtension(file);
  const targetBitrate = 48; // kbps
  const targetBytesPerSec = targetBitrate * 1000 / 8; // 6000 bytes/sec

  // Estimate duration from file size + format
  let estimatedDuration: number;
  switch (ext) {
    case 'wav':
      // WAV: ~176KB/s for 16-bit 44.1kHz stereo
      estimatedDuration = file.size / (176 * 1024);
      break;
    case 'flac':
      // FLAC: ~50-60% of WAV, ~88KB/s
      estimatedDuration = file.size / (88 * 1024);
      break;
    case 'mp3':
      // MP3: varies, assume 128kbps average (~16KB/s)
      estimatedDuration = file.size / (16 * 1024);
      break;
    case 'm4a':
    case 'aac':
      // AAC: ~128kbps average
      estimatedDuration = file.size / (16 * 1024);
      break;
    default:
      // Conservative estimate
      estimatedDuration = file.size / (16 * 1024);
  }

  const estimatedSize = Math.round(estimatedDuration * targetBytesPerSec);
  const savingsPercent = Math.round((1 - estimatedSize / file.size) * 100);

  return {
    estimatedSize: Math.max(estimatedSize, 10 * 1024), // minimum 10KB
    savingsPercent: Math.max(0, savingsPercent),
  };
}

/**
 * Transcode an audio file to Opus/OGG format.
 * Returns a new File object with the transcoded data.
 */
export async function transcodeToOpus(
  file: File,
  options: TranscodeOptions = {},
  onProgress?: (p: TranscodeProgress) => void,
): Promise<File> {
  const {
    bitrate = 48,
    sampleRate = 24000,
    channels = 1,
  } = options;

  const ffmpeg = await getFFmpeg(onProgress);

  const inputExt = getExtension(file);
  const inputName = `input.${inputExt}`;
  const outputName = 'output.ogg';

  try {
    onProgress?.({ percent: 5, message: 'מכין קובץ להמרה...' });

    // Write input file to virtual filesystem
    const inputData = await fetchFile(file);
    await ffmpeg.writeFile(inputName, inputData);

    onProgress?.({ percent: 10, message: 'ממיר ל-Opus...' });

    // Run ffmpeg conversion
    // -i input -c:a libopus -b:a 48k -ac 1 -ar 24000 -vn output.ogg
    await ffmpeg.exec([
      '-i', inputName,
      '-c:a', 'libopus',
      '-b:a', `${bitrate}k`,
      '-ac', String(channels),
      '-ar', String(sampleRate),
      '-vn', // no video
      '-y', // overwrite
      outputName,
    ]);

    onProgress?.({ percent: 95, message: 'קורא תוצאה...' });

    // Read the output
    const outputData = await ffmpeg.readFile(outputName);
    // Create blob from raw data — use explicit cast to satisfy strict TS typing
    const outputBlob = outputData instanceof Uint8Array
      ? new Blob([outputData as unknown as BlobPart], { type: 'audio/ogg' })
      : new Blob([outputData], { type: 'audio/ogg' });

    // Generate new filename
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const newFileName = `${baseName}.ogg`;

    onProgress?.({ percent: 100, message: 'המרה הושלמה!' });

    // Clean up virtual filesystem
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch { /* ignore cleanup errors */ }

    return new File([outputBlob], newFileName, { type: 'audio/ogg' });
  } catch (error) {
    // Clean up on error
    try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
    try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
    throw error;
  }
}

/**
 * Format file size for display (Hebrew)
 */
export function formatSizeHebrew(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
