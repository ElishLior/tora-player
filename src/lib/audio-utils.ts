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

export async function extractAudioMetadata(file: File): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);

    audio.addEventListener('loadedmetadata', () => {
      resolve({
        duration: Math.round(audio.duration),
        format: getAudioFormat(file),
        fileSize: file.size,
      });
      URL.revokeObjectURL(objectUrl);
    });

    audio.addEventListener('error', () => {
      URL.revokeObjectURL(objectUrl);
      // Return partial metadata even on error
      resolve({
        duration: 0,
        format: getAudioFormat(file),
        fileSize: file.size,
      });
    });

    // Set timeout for very large files
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Audio metadata extraction timed out'));
    }, 30000);

    audio.src = objectUrl;
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
