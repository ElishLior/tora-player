/**
 * Client-side audio utilities for metadata extraction and format detection.
 */

export interface AudioMetadata {
  duration: number; // seconds
  format: string;
  sampleRate?: number;
  channels?: number;
  fileSize: number;
}

const SUPPORTED_AUDIO_TYPES = [
  'audio/mpeg',       // mp3
  'audio/mp4',        // m4a, aac
  'audio/aac',
  'audio/ogg',        // ogg vorbis
  'audio/opus',       // opus
  'audio/webm',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
];

const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'webm', 'm4a', 'aac', 'flac', 'opus', 'wma'];

export function isAudioFile(file: File): boolean {
  if (SUPPORTED_AUDIO_TYPES.includes(file.type)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  return AUDIO_EXTENSIONS.includes(ext);
}

export function getAudioFormat(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (AUDIO_EXTENSIONS.includes(ext)) return ext;
  if (file.type.includes('mpeg')) return 'mp3';
  if (file.type.includes('mp4')) return 'm4a';
  if (file.type.includes('ogg')) return 'ogg';
  if (file.type.includes('webm')) return 'webm';
  if (file.type.includes('wav')) return 'wav';
  if (file.type.includes('flac')) return 'flac';
  return 'unknown';
}

/**
 * Read duration from the file's own metadata via the browser decoder.
 * Never rejects: unknown/unreadable durations (and Infinity from streamed
 * containers) come back as 0 after at most 30 s.
 */
export function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  const { promise, resolve } = Promise.withResolvers<AudioMetadata>();
  const audio = new Audio();
  const objectUrl = URL.createObjectURL(file);
  const finish = (duration: number) => {
    clearTimeout(timer);
    URL.revokeObjectURL(objectUrl);
    audio.removeAttribute('src');
    resolve({
      duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0,
      format: getAudioFormat(file),
      fileSize: file.size,
    });
  };
  const timer = setTimeout(() => finish(0), 30000);
  audio.preload = 'metadata';
  audio.addEventListener('loadedmetadata', () => finish(audio.duration), { once: true });
  audio.addEventListener('error', () => finish(0), { once: true });
  audio.src = objectUrl;
  return promise;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
