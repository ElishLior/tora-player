#!/usr/bin/env node
/**
 * Rename all lessons to the new naming convention:
 *
 *   Friday (day 5): "ליל שישי - {hebrew_date} | פרשת {parsha}"
 *   Other days:     "יום {day} - {hebrew_date}"
 *
 * - Parsha stays in the DB column but is removed from the title (except Friday)
 * - Friday lessons are always "ליל שישי" (not "יום שישי")
 * - No lessons on Shabbat
 *
 * Usage:
 *   node scripts/rename-lessons.mjs --dry-run     # Preview changes
 *   node scripts/rename-lessons.mjs               # Apply changes
 */

import { createClient } from '@supabase/supabase-js';
import { HDate, Sedra, Locale } from '@hebcal/core';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const HEBREW_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Strip Hebrew nikud (vowel marks / diacritics) */
function stripNikud(str) {
  return str.replace(/[\u0591-\u05C7]/g, '');
}

/**
 * Generate new title for a lesson based on its date and parsha.
 * @param {string} dateStr - ISO date string (YYYY-MM-DD)
 * @param {string|null} parsha - Parsha name from DB
 * @returns {{ title: string, hebrewDate: string }}
 */
function generateNewTitle(dateStr, parsha) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const gDate = new Date(year, month - 1, day);
  const hd = new HDate(gDate);

  // Hebrew date string without nikud
  const hebrewDate = stripNikud(hd.renderGematriya());

  // Day of week
  const dayOfWeek = gDate.getDay(); // 0=Sunday .. 5=Friday
  const isFriday = dayOfWeek === 5;

  // If no parsha in DB, try to compute it
  let effectiveParsha = parsha;
  if (!effectiveParsha) {
    try {
      const sedra = new Sedra(hd.getFullYear(), false);
      const result = sedra.lookup(hd);
      if (result?.parsha?.length > 0) {
        effectiveParsha = stripNikud(
          result.parsha
            .map((p) => Locale.gettext(p, 'he') || p)
            .join('-')
        );
      }
    } catch {
      // No parsha
    }
  }

  let title;
  if (isFriday) {
    title = `ליל שישי - ${hebrewDate}`;
    if (effectiveParsha) {
      title += ` | פרשת ${effectiveParsha}`;
    }
  } else {
    const hebrewDay = HEBREW_DAYS[dayOfWeek];
    title = `יום ${hebrewDay} - ${hebrewDate}`;
  }

  return { title, hebrewDate, effectiveParsha };
}

async function main() {
  console.log(`\n📝 Rename Lessons Script ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

  // Fetch all lessons
  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, title, hebrew_title, date, hebrew_date, parsha')
    .order('date', { ascending: true });

  if (error) {
    console.error('❌ Failed to fetch lessons:', error.message);
    process.exit(1);
  }

  console.log(`Found ${lessons.length} lessons\n`);

  let changed = 0;
  let skipped = 0;
  let errors = 0;

  for (const lesson of lessons) {
    if (!lesson.date) {
      console.log(`⚠️  [${lesson.id.slice(0, 8)}] No date — skipping`);
      skipped++;
      continue;
    }

    const { title: newTitle, hebrewDate, effectiveParsha } = generateNewTitle(lesson.date, lesson.parsha);

    // Check if already matches
    if (lesson.title === newTitle && lesson.hebrew_title === newTitle) {
      skipped++;
      continue;
    }

    const updates = {
      title: newTitle,
      hebrew_title: newTitle,
    };

    // Also backfill hebrew_date and parsha if missing
    if (!lesson.hebrew_date && hebrewDate) {
      updates.hebrew_date = hebrewDate;
    }
    if (!lesson.parsha && effectiveParsha) {
      updates.parsha = effectiveParsha;
    }

    if (DRY_RUN) {
      console.log(`📝 [${lesson.date}] "${lesson.title}"`);
      console.log(`   → "${newTitle}"`);
      if (updates.hebrew_date) console.log(`   + hebrew_date: "${hebrewDate}"`);
      if (updates.parsha) console.log(`   + parsha: "${effectiveParsha}"`);
      console.log();
    } else {
      const { error: updateError } = await supabase
        .from('lessons')
        .update(updates)
        .eq('id', lesson.id);

      if (updateError) {
        console.error(`❌ [${lesson.id.slice(0, 8)}] Update failed:`, updateError.message);
        errors++;
        continue;
      }

      console.log(`✅ [${lesson.date}] "${newTitle}"`);
    }

    changed++;
  }

  console.log('\n--- Summary ---');
  console.log(`Total lessons: ${lessons.length}`);
  console.log(`Renamed:       ${changed}`);
  console.log(`Skipped:       ${skipped}`);
  if (errors > 0) console.log(`Errors:        ${errors}`);
  if (DRY_RUN) console.log('\n⚠️  This was a DRY RUN. Run without --dry-run to apply changes.');
  else console.log('\n✅ Done!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
