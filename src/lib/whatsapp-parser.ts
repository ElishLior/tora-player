/**
 * Parse WhatsApp message text to extract lesson metadata.
 * Handles Hebrew text, dates, part numbers, and generates lesson names.
 */

export interface ParsedWhatsAppMessage {
  title: string;
  hebrewTitle: string;
  date: string; // YYYY-MM-DD
  partNumber: number | null;
  description: string;
  seriesHint: string | null;
}

// Hebrew part patterns: חלק א', חלק ב', חלק 1, חלק 2
const PART_PATTERNS = [
  /חלק\s*([אבגדהוזחטי])['\u2019]?/,
  /חלק\s*(\d+)/,
  /part\s*(\d+)/i,
  /\((\d+)\s*מתוך\s*\d+\)/,
];

// Hebrew letter to number mapping
const HEBREW_LETTER_TO_NUM: Record<string, number> = {
  'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5,
  'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10,
};


export function parseWhatsAppText(text: string): ParsedWhatsAppMessage {
  const lines = text.trim().split('\n').filter(l => l.trim());
  const fullText = text.trim();

  // Extract date
  const date = extractDate(fullText);

  // Extract part number
  const partNumber = extractPartNumber(fullText);

  // Extract series hint
  const seriesHint = extractSeriesHint(fullText);

  // Generate Hebrew title
  const hebrewTitle = generateHebrewTitle(lines, seriesHint, date, partNumber);

  // Generate English title (transliterated or date-based)
  const title = generateTitle(hebrewTitle, date, partNumber);

  // Use remaining text as description
  const description = lines.join('\n');

  return {
    title,
    hebrewTitle,
    date,
    partNumber,
    description,
    seriesHint,
  };
}

function extractDate(text: string): string {
  // Try DD/MM/YYYY pattern first
  const ddmmyyyy = text.match(/(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Try YYYY-MM-DD
  const yyyymmdd = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (yyyymmdd) {
    return yyyymmdd[0];
  }

  // Default to today
  return new Date().toISOString().split('T')[0];
}

function extractPartNumber(text: string): number | null {
  for (const pattern of PART_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1];
      // Check if it's a Hebrew letter
      if (HEBREW_LETTER_TO_NUM[value]) {
        return HEBREW_LETTER_TO_NUM[value];
      }
      // Check if it's a number
      const num = parseInt(value, 10);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

function extractSeriesHint(text: string): string | null {
  // Look for common series patterns in Hebrew
  const seriesPatterns = [
    /סדרת\s+"?([^"\n]+)"?/,
    /שיעור(?:ים)?\s+ב([^\n,]+)/,
    /פרשת\s+([^\n,]+)/,
    /מסכת\s+([^\n,]+)/,
  ];

  for (const pattern of seriesPatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }

  return null;
}

function generateHebrewTitle(
  lines: string[],
  seriesHint: string | null,
  date: string,
  partNumber: number | null
): string {
  // Try to find a meaningful title line (not a date, not too short)
  const titleLine = lines.find(line => {
    const trimmed = line.trim();
    // Skip very short lines, dates, and greetings
    if (trimmed.length < 3) return false;
    if (/^\d{1,2}[/.\-]\d{1,2}[/.\-]\d{4}$/.test(trimmed)) return false;
    if (/^(שלום|היי|בוקר טוב|ערב טוב)/.test(trimmed)) return false;
    return true;
  });

  if (titleLine) {
    let title = titleLine.trim();
    // Clean up common prefixes
    title = title.replace(/^(שיעור\s*[-–:]\s*)/i, '');
    // Limit length
    if (title.length > 100) title = title.substring(0, 97) + '...';
    return title;
  }

  // Fallback: construct from series and date
  const parts: string[] = [];
  if (seriesHint) parts.push(seriesHint);
  parts.push(formatHebrewDate(date));
  if (partNumber) parts.push(`חלק ${numberToHebrewLetter(partNumber)}'`);

  return parts.join(' - ') || `שיעור ${formatHebrewDate(date)}`;
}

function generateTitle(hebrewTitle: string, date: string, partNumber: number | null): string {
  // Use date-based English title
  const dateObj = new Date(date + 'T00:00:00');
  const formatted = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  let title = `Lesson - ${formatted}`;
  if (partNumber) title += ` (Part ${partNumber})`;
  return title;
}

function formatHebrewDate(dateStr: string): string {
  const dateObj = new Date(dateStr + 'T00:00:00');
  return dateObj.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function numberToHebrewLetter(num: number): string {
  const letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];
  if (num >= 1 && num <= 10) return letters[num - 1];
  return String(num);
}
