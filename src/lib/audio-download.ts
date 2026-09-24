const AUDIO_CONTENT_TYPES = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/mp4',
  mp4: 'audio/mp4',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webm: 'audio/webm',
} as const;

type AudioExtension = keyof typeof AUDIO_CONTENT_TYPES;

const DEFAULT_AUDIO_EXTENSION: AudioExtension = 'mp3';
const STREAM_PREFIX = '/api/audio/stream/';
const DOWNLOAD_PREFIX = '/api/audio/download/';

/**
 * The file's extension when it is a known audio extension, else null.
 * Names like "WhatsApp Audio at 10.30.12" or "פרק 10.12" have no extension.
 */
export function getAudioExtension(name: string | null | undefined): AudioExtension | null {
  const match = name?.match(/\.([a-z0-9]+)$/i);
  const extension = match?.[1]?.toLowerCase();
  return extension && extension in AUDIO_CONTENT_TYPES ? (extension as AudioExtension) : null;
}

/** MIME type for an audio object key / filename; defaults to audio/mpeg. */
export function getAudioContentType(name: string): string {
  return AUDIO_CONTENT_TYPES[getAudioExtension(name) ?? DEFAULT_AUDIO_EXTENSION];
}

/**
 * Filesystem-safe filename that always ends in a real audio extension.
 * An existing audio extension is kept; otherwise `extension` is appended
 * (digits after a dot are part of the name, not an extension).
 */
export function sanitizeDownloadFilename(
  filename: string | null | undefined,
  extension: string = DEFAULT_AUDIO_EXTENSION,
): string {
  const fallbackExtension = getAudioExtension(`.${extension.replace(/^\./, '')}`) ?? DEFAULT_AUDIO_EXTENSION;

  const sanitized = (filename || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '')
    .slice(0, 160);

  const base = sanitized || 'audio';
  return getAudioExtension(base) ? base : `${base}.${fallbackExtension}`;
}

/**
 * Download filename for an audio file: the display name with the stored
 * file's real extension (a transcoded .opus must not be saved as .mp3).
 */
export function buildAudioDownloadFilename(name: string | null | undefined, audioUrl: string): string {
  // Object keys never percent-encode '.', so the extension is readable as-is.
  const extension = getAudioExtension(audioUrl.split(/[?#]/)[0]) ?? DEFAULT_AUDIO_EXTENSION;
  const nameExtension = getAudioExtension(name);
  const baseName = name && nameExtension ? name.slice(0, -(nameExtension.length + 1)) : name;
  return sanitizeDownloadFilename(baseName, extension);
}

/**
 * URL that downloads an audio file to the device.
 *
 * Stream-route URLs map to `/api/audio/download/<key>`, which redirects to a
 * short-lived R2 URL with an attachment Content-Disposition, so the bytes never
 * pass through a Vercel function. Other URLs (external imports) are returned
 * unchanged.
 */
export function getAudioDownloadUrl(audioUrl: string, filename?: string | null): string {
  if (!audioUrl.startsWith(STREAM_PREFIX)) return audioUrl;

  const encodedKey = audioUrl.slice(STREAM_PREFIX.length).split(/[?#]/)[0];
  const safeFilename = buildAudioDownloadFilename(filename, audioUrl);
  return `${DOWNLOAD_PREFIX}${encodedKey}?filename=${encodeURIComponent(safeFilename)}`;
}

/** Same-origin URL that redirects to the raw R2 object (inline), for offline saving. */
export function getAudioDirectUrl(audioUrl: string): string | null {
  if (!audioUrl.startsWith(STREAM_PREFIX)) return null;
  const encodedKey = audioUrl.slice(STREAM_PREFIX.length).split(/[?#]/)[0];
  return `${DOWNLOAD_PREFIX}${encodedKey}?disposition=inline`;
}

function asciiFallbackFilename(filename: string): string {
  const extension = getAudioExtension(filename) ?? DEFAULT_AUDIO_EXTENSION;
  const asciiBase = filename
    .slice(0, -(extension.length + 1))
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[\\/:*?"<>|;]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\-\s]+/, '')
    .replace(/[.\-\s]+$/, '');

  return `${asciiBase || 'audio'}.${extension}`;
}

/**
 * RFC 6266 attachment header: an ASCII `filename` for old clients plus an
 * RFC 5987 `filename*` carrying the full UTF-8 (Hebrew) name.
 */
export function buildContentDisposition(filename: string): string {
  const safeFilename = sanitizeDownloadFilename(filename);
  const fallback = asciiFallbackFilename(safeFilename);
  const encoded = encodeURIComponent(safeFilename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
