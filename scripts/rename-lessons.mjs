#!/usr/bin/env node
/**
 * Rename daily lessons to the canonical title from src/lib/hebrew-date.ts
 * (the same function the admin upload uses):
 *
 *   Friday:     "ליל שישי - {hebrew_date} | פרשת {parsha}"
 *   Other days: "יום {day} - {hebrew_date}"
 *
 * Short lessons (lesson_type short_clip or filed under קצרים) keep their topic
 * titles and are skipped. Missing hebrew_date / parsha are backfilled.
 *
 * Requires Node >= 22.18 (imports the TypeScript module directly) and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local (anon writes are not allowed).
 *
 * Usage:
 *   node scripts/rename-lessons.mjs --dry-run     # Preview changes
 *   node scripts/rename-lessons.mjs               # Apply changes
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLessonMetadata } from '../src/lib/hebrew-date.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');
const SHORTS_CATEGORY_ID = '10000000-0000-0000-0000-000000000005';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log(`\n📝 Rename Lessons Script ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

  const { data: shortTopics, error: topicsError } = await supabase
    .from('categories')
    .select('id')
    .eq('parent_id', SHORTS_CATEGORY_ID);
  if (topicsError) {
    console.error('❌ Failed to fetch categories:', topicsError.message);
    process.exit(1);
  }
  const shortCategoryIds = new Set([SHORTS_CATEGORY_ID, ...shortTopics.map((c) => c.id)]);

  const { data: lessons, error } = await supabase
    .from('lessons')
    .select('id, title, hebrew_title, date, hebrew_date, parsha, lesson_type, category_id')
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
    if (!lesson.date || lesson.lesson_type === 'short_clip' || shortCategoryIds.has(lesson.category_id)) {
      skipped++;
      continue;
    }

    const meta = generateLessonMetadata(lesson.date);
    if (lesson.title === meta.title && lesson.hebrew_title === meta.title) {
      skipped++;
      continue;
    }

    const updates = { title: meta.title, hebrew_title: meta.title };
    if (!lesson.hebrew_date) updates.hebrew_date = meta.hebrewDate;
    if (!lesson.parsha && meta.parsha) updates.parsha = meta.parsha;

    if (DRY_RUN) {
      console.log(`📝 [${lesson.date}] "${lesson.title}"`);
      console.log(`   → "${meta.title}"`);
      if (updates.hebrew_date) console.log(`   + hebrew_date: "${updates.hebrew_date}"`);
      if (updates.parsha) console.log(`   + parsha: "${updates.parsha}"`);
      console.log();
    } else {
      const { error: updateError } = await supabase.from('lessons').update(updates).eq('id', lesson.id);
      if (updateError) {
        console.error(`❌ [${lesson.id.slice(0, 8)}] Update failed:`, updateError.message);
        errors++;
        continue;
      }
      console.log(`✅ [${lesson.date}] "${meta.title}"`);
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
