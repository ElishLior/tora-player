#!/usr/bin/env node
/**
 * Restore lesson names that were incorrectly overwritten by rename-lessons.mjs.
 *
 * What went wrong:
 *   - rename-lessons.mjs replaced ALL titles with date-only format
 *   - Custom descriptions in parentheses were deleted from titles
 *   - Short clips (קצרים) got date-based names instead of their custom names
 *
 * What this script does:
 *   1. For SHORT CLIPS: restores original custom titles from filename (via source_text)
 *   2. For REGULAR LESSONS: keeps the new date prefix but appends back the original
 *      parenthetical descriptions from the source JSON
 *
 * Usage:
 *   node scripts/restore-lesson-names.mjs --dry-run     # Preview changes
 *   node scripts/restore-lesson-names.mjs               # Apply changes
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

// Path to original lessons data
const JSON_FILE = '/Users/liorelisha/Downloads/💻 Code & Dev Projects/whatsapp-archive-parsed/lessons_database.json';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

if (!fs.existsSync(JSON_FILE)) {
  console.error('❌ Original lessons JSON not found at:', JSON_FILE);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

/**
 * Extract a meaningful title from the short clip filename.
 * (Same logic as import-short-clips.mjs)
 */
function extractTitle(filename, date) {
  const base = filename.replace(/\.\w+$/, '');

  // Pattern: "NNNNN-אליהו DD.MM.YYYY TITLE"
  const hebrewMatch = base.match(/^\d+-אליהו\s+\d{2}\.\d{2}\.\d{4}\s+(.+)/);
  if (hebrewMatch) {
    let title = hebrewMatch[1].trim();
    const partMatch = title.match(/\(מחולק\)\s*חלק\s*(\d+)$/);
    if (partMatch) {
      title = title.replace(/\s*\(מחולק\)\s*חלק\s*\d+$/, '') + ` - חלק ${partMatch[1]}`;
    }
    return title;
  }

  // Pattern: "NNNNN-אליהו DD.MM.YYYY" (no title, just date)
  const dateOnlyMatch = base.match(/^\d+-אליהו\s+(\d{2}\.\d{2}\.\d{4})$/);
  if (dateOnlyMatch) {
    return `שיעור קצר - ${dateOnlyMatch[1]}`;
  }

  // Pattern: generic "AUDIO-YYYY-MM-DD..." → use date
  const formattedDate = date.split('-').reverse().join('.');
  return `שיעור קצר - ${formattedDate}`;
}

/**
 * Extract parenthetical text from an original title.
 * e.g., "שיעור כ׳ טבת ... (הקדמה לטנתא)" → "(הקדמה לטנתא)"
 */
function extractParenthetical(originalTitle) {
  // Match the last parenthetical group
  const match = originalTitle.match(/\(([^)]+)\)\s*$/);
  if (match) {
    return `(${match[1]})`;
  }
  return null;
}

async function main() {
  console.log(`\n🔄 Restore Lesson Names ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

  // Load original JSON data
  const originalData = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const allOriginalLessons = [...originalData.lessons, ...originalData.pre_seder_lessons];
  const originalClips = originalData.short_clips || [];

  console.log(`📄 Original data: ${originalData.lessons.length} lessons + ${originalData.pre_seder_lessons.length} pre-seder + ${originalClips.length} clips\n`);

  // Build lookup maps
  // For regular lessons: date → original title (might have multiple per date, use lesson_type to disambiguate)
  const originalByDate = new Map();
  for (const lesson of allOriginalLessons) {
    if (!originalByDate.has(lesson.date)) {
      originalByDate.set(lesson.date, []);
    }
    originalByDate.set(lesson.date, [...originalByDate.get(lesson.date), lesson]);
  }

  // For short clips from JSON: filename → clip data
  const clipByFilename = new Map();
  for (const clip of originalClips) {
    clipByFilename.set(clip.filename, clip);
  }

  // Fetch all lessons from DB
  const { data: dbLessons, error } = await supabase
    .from('lessons')
    .select('id, title, hebrew_title, description, date, lesson_type, source_text, parsha')
    .order('date', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch lessons:', error.message);
    process.exit(1);
  }

  console.log(`📊 DB lessons: ${dbLessons.length} total\n`);

  let restored = 0;
  let skipped = 0;
  let shortClipRestored = 0;
  let descriptionRestored = 0;

  for (const lesson of dbLessons) {
    const isShortClip = lesson.lesson_type === 'short_clip';

    if (isShortClip) {
      // === SHORT CLIPS: Restore original custom title ===
      if (!lesson.source_text) {
        console.log(`⚠️  Short clip [${lesson.id.slice(0, 8)}] ${lesson.date} has no source_text — skipping`);
        skipped++;
        continue;
      }

      const originalTitle = extractTitle(lesson.source_text, lesson.date);

      if (lesson.title === originalTitle && lesson.hebrew_title === originalTitle) {
        skipped++;
        continue;
      }

      const updates = {
        title: originalTitle,
        hebrew_title: originalTitle,
      };

      if (DRY_RUN) {
        console.log(`🎵 SHORT CLIP [${lesson.date}]`);
        console.log(`   Current:  "${lesson.title}"`);
        console.log(`   Restore:  "${originalTitle}"`);
        console.log(`   Source:   ${lesson.source_text}`);
        console.log();
      } else {
        const { error: updateError } = await supabase
          .from('lessons')
          .update(updates)
          .eq('id', lesson.id);

        if (updateError) {
          console.error(`❌ [${lesson.id.slice(0, 8)}] Update failed:`, updateError.message);
          continue;
        }
        console.log(`✅ Short clip [${lesson.date}] → "${originalTitle}"`);
      }

      shortClipRestored++;
      restored++;
      continue;
    }

    // === REGULAR LESSONS: Restore parenthetical descriptions ===
    const originals = originalByDate.get(lesson.date) || [];

    if (originals.length === 0) {
      // No original data for this lesson (likely added after import)
      skipped++;
      continue;
    }

    // Find the best matching original (prefer non-short-clip match)
    // If multiple originals on same date, try to match by looking at content
    let original = originals[0];
    if (originals.length > 1) {
      // Multiple lessons on same date — find the one that's NOT a short clip equivalent
      original = originals.find(o => {
        // Original titles don't have lesson_type, but we can match by checking
        // if the current lesson's source_text matches any original's data
        return true; // Just use the first regular one
      }) || originals[0];
    }

    const parenthetical = extractParenthetical(original.title);

    if (!parenthetical) {
      // Original title had no parenthetical description
      skipped++;
      continue;
    }

    // Check if current title already has the parenthetical
    if (lesson.title.includes(parenthetical)) {
      skipped++;
      continue;
    }

    // Append parenthetical to current title
    const newTitle = `${lesson.title} ${parenthetical}`;

    const updates = {
      title: newTitle,
      hebrew_title: newTitle,
    };

    if (DRY_RUN) {
      console.log(`📝 LESSON [${lesson.date}]`);
      console.log(`   Current:  "${lesson.title}"`);
      console.log(`   Original: "${original.title}"`);
      console.log(`   Restore:  "${newTitle}"`);
      console.log();
    } else {
      const { error: updateError } = await supabase
        .from('lessons')
        .update(updates)
        .eq('id', lesson.id);

      if (updateError) {
        console.error(`❌ [${lesson.id.slice(0, 8)}] Update failed:`, updateError.message);
        continue;
      }
      console.log(`✅ [${lesson.date}] → "${newTitle}"`);
    }

    descriptionRestored++;
    restored++;
  }

  console.log('\n--- Summary ---');
  console.log(`Total DB lessons:           ${dbLessons.length}`);
  console.log(`Short clips restored:       ${shortClipRestored}`);
  console.log(`Descriptions restored:      ${descriptionRestored}`);
  console.log(`Total restored:             ${restored}`);
  console.log(`Skipped (no change needed): ${skipped}`);
  if (DRY_RUN) console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.');
  else console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
