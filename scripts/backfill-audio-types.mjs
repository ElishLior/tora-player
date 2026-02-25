#!/usr/bin/env node
/**
 * Backfill audio_type and original_name for all lesson_audio records.
 *
 * Rule: For each lesson, sorted by sort_order ASC:
 *   - First file  -> audio_type='סידור', original_name='סידור'
 *   - Second file -> audio_type='עץ חיים', original_name='עץ חיים'
 *   - 3rd+ files  -> skipped (manual review needed)
 *
 * Usage:
 *   node scripts/backfill-audio-types.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const TYPES = ['סידור', 'עץ חיים'];

async function run() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🚀 LIVE RUN\n');

  // Fetch all audio files ordered by lesson_id and sort_order
  const { data: allAudio, error } = await supabase
    .from('lesson_audio')
    .select('id, lesson_id, sort_order, original_name, audio_type')
    .order('lesson_id')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('❌ Fetch failed:', error.message);
    process.exit(1);
  }

  console.log(`📦 Found ${allAudio.length} audio files total\n`);

  // Group by lesson_id
  const byLesson = {};
  for (const row of allAudio) {
    if (!byLesson[row.lesson_id]) byLesson[row.lesson_id] = [];
    byLesson[row.lesson_id].push(row);
  }

  const lessonCount = Object.keys(byLesson).length;
  console.log(`📚 Across ${lessonCount} lessons\n`);

  let updated = 0;
  let skipped = 0;
  let manualReview = 0;

  for (const [lessonId, files] of Object.entries(byLesson)) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (i >= TYPES.length) {
        console.warn(`⚠️  Lesson ${lessonId.slice(0, 8)}... has ${files.length} files — file #${i + 1} skipped`);
        manualReview++;
        continue;
      }

      const newType = TYPES[i];
      const newName = TYPES[i];

      if (file.audio_type === newType && file.original_name === newName) {
        skipped++;
        continue;
      }

      const shortId = lessonId.slice(0, 8);
      console.log(
        `${DRY_RUN ? '[DRY] ' : ''}${shortId}... file #${i + 1}: ` +
        `"${file.original_name || '(null)'}" → "${newName}", type="${newType}"`
      );

      if (!DRY_RUN) {
        const { error: updateErr } = await supabase
          .from('lesson_audio')
          .update({ audio_type: newType, original_name: newName })
          .eq('id', file.id);

        if (updateErr) {
          console.error(`  ❌ Error updating ${file.id}:`, updateErr.message);
        } else {
          updated++;
        }
      } else {
        updated++;
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Already correct: ${skipped}`);
  console.log(`   Manual review needed: ${manualReview}`);
  if (DRY_RUN) console.log('\n(dry run — no changes were made)');
}

run();
