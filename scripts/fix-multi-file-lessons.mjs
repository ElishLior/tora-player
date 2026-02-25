#!/usr/bin/env node
/**
 * Fix lessons with 3+ audio files:
 * 1. Identify voice messages (small files <1.5MB) → delete from DB
 * 2. Re-tag remaining files correctly:
 *    - If 2 large files: 1st=סידור, 2nd=עץ חיים
 *    - If 3 large files: 1st=סידור, 2nd=עץ חיים א, 3rd=עץ חיים ב
 * 3. Also fix cases where a voice message was incorrectly tagged as סידור/עץ חיים
 *
 * Usage: node scripts/fix-multi-file-lessons.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const VOICE_MSG_THRESHOLD = 1.5 * 1024 * 1024; // 1.5MB — voice messages are under 2 min ≈ <1MB opus

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🚀 LIVE RUN\n');

  const { data: allAudio, error } = await supabase
    .from('lesson_audio')
    .select('id, lesson_id, sort_order, original_name, audio_type, file_size')
    .order('lesson_id')
    .order('sort_order', { ascending: true });

  if (error) { console.error('❌', error.message); process.exit(1); }

  // Group by lesson
  const byLesson = {};
  for (const row of allAudio) {
    if (!byLesson[row.lesson_id]) byLesson[row.lesson_id] = [];
    byLesson[row.lesson_id].push(row);
  }

  let deleted = 0;
  let retagged = 0;
  let manualReview = 0;

  for (const [lessonId, files] of Object.entries(byLesson)) {
    if (files.length < 3) continue;

    const short = lessonId.slice(0, 8);

    // Separate real lesson files from voice messages by size
    const realFiles = [];
    const voiceMessages = [];

    for (const f of files) {
      const size = f.file_size || 0;
      if (size < VOICE_MSG_THRESHOLD) {
        voiceMessages.push(f);
      } else {
        realFiles.push(f);
      }
    }

    console.log(`\n📚 Lesson ${short}... (${files.length} files → ${realFiles.length} real, ${voiceMessages.length} voice msgs)`);

    // Delete voice messages
    for (const vm of voiceMessages) {
      const sizeMB = ((vm.file_size || 0) / 1024 / 1024).toFixed(1);
      console.log(`  🗑️  DELETE "${vm.original_name}" (${sizeMB}MB) [${vm.audio_type || 'untagged'}]`);
      if (!DRY_RUN) {
        const { error: delErr } = await supabase
          .from('lesson_audio')
          .delete()
          .eq('id', vm.id);
        if (delErr) console.error(`    ❌ Delete failed:`, delErr.message);
        else deleted++;
      } else {
        deleted++;
      }
    }

    // Re-tag real files based on sort_order
    // Sort by sort_order to maintain original order
    realFiles.sort((a, b) => a.sort_order - b.sort_order);

    if (realFiles.length === 1) {
      // Only 1 real file — should be סידור (the other part might be missing)
      const f = realFiles[0];
      if (f.audio_type !== 'סידור' || f.original_name !== 'סידור') {
        console.log(`  🏷️  RETAG #${f.sort_order}: "${f.original_name}" → "סידור"`);
        if (!DRY_RUN) {
          await supabase.from('lesson_audio').update({ audio_type: 'סידור', original_name: 'סידור' }).eq('id', f.id);
        }
        retagged++;
      }
    } else if (realFiles.length === 2) {
      // Standard: 1st=סידור, 2nd=עץ חיים
      const tags = ['סידור', 'עץ חיים'];
      for (let i = 0; i < 2; i++) {
        const f = realFiles[i];
        if (f.audio_type !== tags[i] || f.original_name !== tags[i]) {
          console.log(`  🏷️  RETAG #${f.sort_order}: "${f.original_name}" [${f.audio_type || 'none'}] → "${tags[i]}"`);
          if (!DRY_RUN) {
            await supabase.from('lesson_audio').update({ audio_type: tags[i], original_name: tags[i] }).eq('id', f.id);
          }
          retagged++;
        }
      }
    } else if (realFiles.length === 3) {
      // User said: 1st=סידור, 2nd=עץ חיים א, 3rd=עץ חיים ב
      const tags = ['סידור', 'עץ חיים א', 'עץ חיים ב'];
      for (let i = 0; i < 3; i++) {
        const f = realFiles[i];
        if (f.audio_type !== tags[i] || f.original_name !== tags[i]) {
          console.log(`  🏷️  RETAG #${f.sort_order}: "${f.original_name}" [${f.audio_type || 'none'}] → "${tags[i]}"`);
          if (!DRY_RUN) {
            await supabase.from('lesson_audio').update({ audio_type: tags[i], original_name: tags[i] }).eq('id', f.id);
          }
          retagged++;
        }
      }
    } else {
      console.log(`  ⚠️  ${realFiles.length} real files — needs manual review`);
      manualReview++;
    }

    // Fix sort_order for remaining files (re-index 0,1,2...)
    if (!DRY_RUN && voiceMessages.length > 0) {
      for (let i = 0; i < realFiles.length; i++) {
        if (realFiles[i].sort_order !== i) {
          await supabase.from('lesson_audio').update({ sort_order: i }).eq('id', realFiles[i].id);
        }
      }
    }
  }

  console.log(`\n✅ Done!`);
  console.log(`   Voice messages deleted: ${deleted}`);
  console.log(`   Files retagged: ${retagged}`);
  console.log(`   Manual review needed: ${manualReview}`);
  if (DRY_RUN) console.log('\n(dry run — no changes were made)');
}

run();
