/**
 * Shared rules for turning uploaded/exported media files into lessons.
 * Used by the admin drag-and-drop upload and by the WhatsApp import scripts,
 * so both paths date and name lessons identically.
 */

export type MediaKind = 'audio' | 'image' | 'document' | 'other';

export type MediaFilenameSource =
  /** WhatsApp "Export chat" attachment: 00001909-AUDIO-2026-09-24-05-04-03.opus */
  | 'whatsapp-export'
  /** WhatsApp "Save" on a phone/desktop: WhatsApp Audio 2026-09-01 at 05.00.01.opus */
  | 'whatsapp-save'
  /** Human-named file that carries a date: אליהו 29.01.2026 נושא.mp3, 23-08-2026 יחוד.ogg */
  | 'named'
  /** Phone voice-recorder file: 20260624-030714.mp3 (optionally behind an export prefix) */
  | 'recorder';

export interface ParsedMediaFilename {
  kind: MediaKind;
  source: MediaFilenameSource;
  /** Calendar date in YYYY-MM-DD. */
  date: string;
  /** Local time HH:MM:SS when the filename carries one. */
  time: string | null;
  /** WhatsApp export sequence number (00001909), used for stable ordering. */
  sequence: number | null;
  /** Human text left after removing date/prefix noise; empty for generic names. */
  label: string;
}

const AUDIO_EXT = /\.(opus|ogg|oga|mp3|m4a|aac|wav|flac|webm)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif)$/i;
const DOCUMENT_EXT = /\.(pdf|docx?|xlsx?|pptx?)$/i;

const EXPORT_RE = /^(\d{6,})-(AUDIO|PHOTO|VIDEO|STICKER)-(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\./i;
const RECORDER_RE = /^(?:(\d{8})-)?(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\./;
const SAVE_RE = /WhatsApp (?:Audio|Image|Video|Ptt) (\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2})/i;
/** dd.mm.yyyy, dd-mm-yyyy or dd/mm/yyyy anywhere in the name. */
const DMY_RE = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/;
/** yyyy-mm-dd anywhere in the name. */
const YMD_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;

export function mediaKindOf(filename: string): MediaKind {
  if (AUDIO_EXT.test(filename)) return 'audio';
  if (IMAGE_EXT.test(filename)) return 'image';
  if (DOCUMENT_EXT.test(filename)) return 'document';
  return 'other';
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Extract the lesson date (and time, when known) from a media filename.
 * Returns null when the name carries no recognizable date.
 */
export function parseMediaFilename(filename: string): ParsedMediaFilename | null {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const kind = mediaKindOf(base);

  const exp = EXPORT_RE.exec(base);
  if (exp) {
    const date = isoDate(Number(exp[3]), Number(exp[4]), Number(exp[5]));
    if (date) {
      return {
        kind,
        source: 'whatsapp-export',
        date,
        time: `${exp[6]}:${exp[7]}:${exp[8]}`,
        sequence: Number(exp[1]),
        label: '',
      };
    }
  }

  const saved = SAVE_RE.exec(base);
  if (saved) {
    const date = isoDate(Number(saved[1]), Number(saved[2]), Number(saved[3]));
    if (date) {
      return {
        kind,
        source: 'whatsapp-save',
        date,
        time: `${saved[4].padStart(2, '0')}:${saved[5]}:${saved[6]}`,
        sequence: null,
        label: '',
      };
    }
  }

  const rec = RECORDER_RE.exec(base);
  if (rec) {
    const date = isoDate(Number(rec[2]), Number(rec[3]), Number(rec[4]));
    if (date) {
      return {
        kind,
        source: 'recorder',
        date,
        time: `${rec[5]}:${rec[6]}:${rec[7]}`,
        sequence: rec[1] ? Number(rec[1]) : null,
        label: '',
      };
    }
  }

  // Named files: an export prefix (00000649-) may precede the human name.
  const seqMatch = /^(\d{6,})-/.exec(base);
  const sequence = seqMatch ? Number(seqMatch[1]) : null;
  const human = (seqMatch ? base.slice(seqMatch[0].length) : base).replace(/\.[^.]+$/, '');

  const ymd = YMD_RE.exec(human);
  const dmy = ymd ? null : DMY_RE.exec(human);
  const date = ymd
    ? isoDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]))
    : dmy
      ? isoDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
      : null;
  if (!date) return null;

  const matched = (ymd ?? dmy)![0];
  return {
    kind,
    source: 'named',
    date,
    time: null,
    sequence,
    label: human
      .replace(matched, ' ')
      .replace(/^VERT_/i, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/[\s_-]+/g, ' ')
      .trim(),
  };
}

/**
 * Order files the way they were posted: export sequence first, then date+time,
 * then name. Stable for files without metadata.
 */
export function compareMediaFilenames(a: string, b: string): number {
  const pa = parseMediaFilename(a);
  const pb = parseMediaFilename(b);
  if (pa?.sequence != null && pb?.sequence != null) return pa.sequence - pb.sequence;
  const ka = pa ? `${pa.date} ${pa.time ?? '99:99:99'}` : '9999';
  const kb = pb ? `${pb.date} ${pb.time ?? '99:99:99'}` : '9999';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.localeCompare(b, 'he');
}

/** Part labels used in lesson_audio.audio_type, in the order the rabbi teaches them. */
export const LESSON_PART_TYPES = ['סידור', 'עץ חיים'] as const;
export type LessonPartType = (typeof LESSON_PART_TYPES)[number];

/** Short-lesson category label (קצרים). */
export const SHORTS_AUDIO_TYPE = 'קצרים';
