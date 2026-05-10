const DEFAULT_AUDIO_EXTENSION = 'mp3';

function getExtensionFromUrl(url: string): string {
  const path = url.split('?')[0] || '';
  const decoded = decodeURIComponent(path);
  const match = decoded.match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1]?.toLowerCase() || DEFAULT_AUDIO_EXTENSION;
}

export function sanitizeDownloadFilename(
  filename: string | null | undefined,
  fallbackExtension = DEFAULT_AUDIO_EXTENSION
): string {
  const extension = fallbackExtension.replace(/^\./, '') || DEFAULT_AUDIO_EXTENSION;
  const fallback = `audio.${extension}`;
  const raw = (filename || fallback).trim() || fallback;

  const sanitized = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '')
    .slice(0, 160);

  const safeBase = sanitized || 'audio';
  return /\.[a-z0-9]{2,5}$/i.test(safeBase) ? safeBase : `${safeBase}.${extension}`;
}

function encodeQuery(params: URLSearchParams): string {
  return Array.from(params.entries())
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

export function getAudioDownloadUrl(audioUrl: string, filename?: string | null): string {
  const isAbsolute = /^https?:\/\//i.test(audioUrl);
  const parsed = new URL(audioUrl, 'https://tora.local');
  const safeFilename = sanitizeDownloadFilename(filename, getExtensionFromUrl(parsed.pathname));

  parsed.searchParams.set('download', '1');
  parsed.searchParams.set('filename', safeFilename);

  const query = encodeQuery(parsed.searchParams);
  const path = `${parsed.pathname}${query ? `?${query}` : ''}${parsed.hash}`;

  return isAbsolute ? `${parsed.origin}${path}` : path;
}

function asciiFallbackFilename(filename: string): string {
  const extension = filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] || DEFAULT_AUDIO_EXTENSION;
  const baseName = filename.replace(/\.[a-z0-9]{2,5}$/i, '');
  const asciiBase = baseName
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '');

  return `${asciiBase || 'audio'}.${extension}`;
}

export function buildContentDisposition(filename: string): string {
  const safeFilename = sanitizeDownloadFilename(filename);
  const fallback = asciiFallbackFilename(safeFilename);
  return `attachment; filename="${fallback.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`;
}
