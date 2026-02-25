#!/usr/bin/env node
/**
 * Import WhatsApp-parsed lessons into Tora Player.
 *
 * Usage:
 *   node scripts/import-whatsapp-lessons.mjs [--dry-run] [--skip-upload] [--only=lessons|audio|images]
 *
 * Reads lessons_database.json and:
 *  1. Creates a series for "עץ חיים"
 *  2. Creates lesson records in Supabase
 *  3. Uploads audio files to R2 and creates lesson_audio records
 *  4. Uploads image files to R2 and creates lesson_images records
 *  5. Creates playlists for post-seder and pre-seder
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load env from the app root
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

// ------- Config -------
const ARCHIVE_DIR = '/Users/liorelisha/Downloads/whatsapp-archive-parsed';
const JSON_FILE = path.join(ARCHIVE_DIR, 'lessons_database.json');
const MAP_FILE = path.join(ARCHIVE_DIR, '_lesson_id_map.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID?.trim();
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY?.trim();
const R2_BUCKET = process.env.R2_BUCKET_NAME?.trim() || 'tora-player-audio';

// ------- Validate env -------
function validateEnv() {
  const required = {
    NEXT_PUBLIC_SUPABASE_URL: SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: SUPABASE_KEY,
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: R2_ACCESS_KEY,
    R2_SECRET_ACCESS_KEY: R2_SECRET,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    console.error(`❌ Missing env vars: ${missing.join(', ')}`);
    console.error('   Make sure .env.local exists in the app root');
    process.exit(1);
  }
}

// ------- CLI Args -------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_UPLOAD = args.includes('--skip-upload');
const ONLY = args.find(a => a.startsWith('--only='))?.split('=')[1];

// ------- Clients (lazy init after env validation) -------
let supabase;
let r2;

function initClients() {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY,
      secretAccessKey: R2_SECRET,
    },
  });
}

// ------- Helpers -------
function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function getContentType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types = {
    opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
    wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
}

function getCodec(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext || 'unknown';
}

async function uploadToR2(key, filePath) {
  const body = fs.readFileSync(filePath);
  const contentType = getContentType(filePath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return body.length;
}

function loadIdMap() {
  if (fs.existsSync(MAP_FILE)) {
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  }
  return {};
}

function saveIdMap(map) {
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}

// ------- Main -------
async function main() {
  validateEnv();
  if (!DRY_RUN) initClients();

  log('=== WhatsApp Lessons Import ===');
  if (DRY_RUN) log('🔸 DRY RUN — no changes will be made');
  if (SKIP_UPLOAD) log('🔸 SKIP UPLOAD — files will not be uploaded to R2');
  if (ONLY) log(`🔸 ONLY: ${ONLY}`);

  // Load JSON
  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const allLessons = [...data.lessons, ...data.pre_seder_lessons];
  const shortClips = data.short_clips || [];

  log(`Loaded: ${data.lessons.length} post-seder + ${data.pre_seder_lessons.length} pre-seder + ${shortClips.length} clips`);

  // Shared lesson ID map (date -> supabase UUID)
  let lessonIdMap = loadIdMap();

  // ---- Step 1: Create Series ----
  if (!ONLY || ONLY === 'lessons') {
    log('\n📚 Creating series...');

    let seriesId;
    if (!DRY_RUN) {
      // Check if series already exists (maybeSingle returns null without error if 0 rows)
      const { data: existing } = await supabase
        .from('series')
        .select('id')
        .eq('name', 'עץ חיים')
        .maybeSingle();

      if (existing) {
        seriesId = existing.id;
        log(`  Series "עץ חיים" already exists: ${seriesId}`);
      } else {
        const { data: series, error } = await supabase
          .from('series')
          .insert({
            name: 'עץ חיים',
            hebrew_name: 'עץ חיים',
            description: 'שיעורי עץ חיים - הרב אליהו, ציון בניהו בן יהוידע',
          })
          .select()
          .single();

        if (error) throw new Error(`Series create failed: ${error.message}`);
        seriesId = series.id;
        log(`  Created series: ${seriesId}`);
      }
    }

    // ---- Step 2: Create Lessons ----
    log('\n📝 Creating lesson records...');
    let created = 0, skipped = 0;

    for (const lesson of allLessons) {
      if (DRY_RUN) {
        log(`  [DRY] Would create: ${lesson.title}`);
        created++;
        continue;
      }

      // Check if lesson already exists by date
      const { data: existing } = await supabase
        .from('lessons')
        .select('id')
        .eq('date', lesson.date)
        .eq('source_type', 'whatsapp')
        .maybeSingle();

      if (existing) {
        lessonIdMap[lesson.date] = existing.id;
        skipped++;
        continue;
      }

      const record = {
        title: lesson.title,
        hebrew_title: lesson.title,
        description: lesson.summary || null,
        date: lesson.date,
        series_id: seriesId,
        source_type: 'whatsapp',
        source_text: lesson.summary || null,
        is_published: true,
        hebrew_date: lesson.hebrew_date,
        parsha: lesson.parsha,
        teacher: lesson.teacher,
        location: lesson.location,
        summary: lesson.summary,
        lesson_type: lesson.lesson_type,
        seder_number: lesson.seder_lesson_number || null,
        codec: 'opus',
      };

      const { data: inserted, error } = await supabase
        .from('lessons')
        .insert(record)
        .select()
        .single();

      if (error) {
        log(`  ❌ Failed: ${lesson.date} - ${error.message}`);
        continue;
      }

      lessonIdMap[lesson.date] = inserted.id;
      created++;
    }

    log(`  ✅ Lessons: ${created} created, ${skipped} skipped (already exist)`);

    // Save lessonIdMap for subsequent steps / re-runs
    if (!DRY_RUN) {
      saveIdMap(lessonIdMap);
      log(`  Saved lesson ID map (${Object.keys(lessonIdMap).length} entries)`);
    }
  }

  // Reload map in case it was just written
  lessonIdMap = loadIdMap();

  // ---- Step 3: Upload Audio Files ----
  if (!ONLY || ONLY === 'audio') {
    log('\n🎵 Uploading audio files...');
    let uploaded = 0, failed = 0, audioSkipped = 0, noId = 0;

    for (const lesson of allLessons) {
      const lessonId = lessonIdMap[lesson.date];
      if (!lessonId) { noId++; continue; }

      for (let i = 0; i < lesson.audio_files.length; i++) {
        const af = lesson.audio_files[i];
        if (!af.filename) continue; // omitted

        const filePath = path.join(ARCHIVE_DIR, af.filename);
        if (!fs.existsSync(filePath)) {
          log(`  ⚠️  File not found: ${af.filename}`);
          failed++;
          continue;
        }

        if (DRY_RUN) {
          uploaded++;
          continue;
        }

        // Check if audio record already exists
        const { data: existing } = await supabase
          .from('lesson_audio')
          .select('id')
          .eq('lesson_id', lessonId)
          .eq('original_name', af.filename)
          .maybeSingle();

        if (existing) {
          audioSkipped++;
          continue;
        }

        const ext = af.filename.split('.').pop()?.toLowerCase() || 'opus';
        const r2Key = `audio/${lessonId}/${i}_${Date.now()}.${ext}`;
        const audioUrl = `/api/audio/stream/${encodeURIComponent(r2Key)}`;

        try {
          let fileSize;
          if (!SKIP_UPLOAD) {
            fileSize = await uploadToR2(r2Key, filePath);
          } else {
            fileSize = fs.statSync(filePath).size;
          }

          const { error } = await supabase
            .from('lesson_audio')
            .insert({
              lesson_id: lessonId,
              file_key: r2Key,
              audio_url: audioUrl,
              original_name: af.filename,
              file_size: fileSize,
              duration: Math.round(af.duration_seconds || 0),
              codec: getCodec(af.filename),
              sort_order: i,
            });

          if (error) {
            log(`  ❌ DB error for ${af.filename}: ${error.message}`);
            failed++;
          } else {
            uploaded++;
            if (uploaded % 10 === 0) log(`  📤 Audio: ${uploaded} uploaded...`);
          }
        } catch (err) {
          log(`  ❌ Upload error: ${af.filename} - ${err.message}`);
          failed++;
        }
      }
    }

    if (noId > 0) log(`  ⚠️  ${noId} lessons had no ID mapping (run --only=lessons first)`);
    log(`  ✅ Audio: ${uploaded} uploaded, ${audioSkipped} skipped, ${failed} failed`);
  }

  // ---- Step 4: Upload Images ----
  if (!ONLY || ONLY === 'images') {
    log('\n📸 Uploading images...');
    let uploaded = 0, failed = 0, imgSkipped = 0, noId = 0;

    for (const lesson of allLessons) {
      const lessonId = lessonIdMap[lesson.date];
      if (!lessonId) { noId++; continue; }

      for (let i = 0; i < lesson.photo_files.length; i++) {
        const pf = lesson.photo_files[i];
        if (!pf.filename) continue;

        const filePath = path.join(ARCHIVE_DIR, pf.filename);
        if (!fs.existsSync(filePath)) {
          failed++;
          continue;
        }

        if (DRY_RUN) {
          uploaded++;
          continue;
        }

        // Check if image record already exists
        const { data: existing } = await supabase
          .from('lesson_images')
          .select('id')
          .eq('lesson_id', lessonId)
          .eq('original_name', pf.filename)
          .maybeSingle();

        if (existing) {
          imgSkipped++;
          continue;
        }

        const ext = pf.filename.split('.').pop()?.toLowerCase() || 'jpg';
        const r2Key = `images/${lessonId}/${i}_${Date.now()}.${ext}`;
        const imageUrl = `/api/images/stream/${encodeURIComponent(r2Key)}`;

        try {
          let fileSize;
          if (!SKIP_UPLOAD) {
            fileSize = await uploadToR2(r2Key, filePath);
          } else {
            fileSize = fs.statSync(filePath).size;
          }

          const { error } = await supabase
            .from('lesson_images')
            .insert({
              lesson_id: lessonId,
              file_key: r2Key,
              image_url: imageUrl,
              original_name: pf.filename,
              file_size: fileSize,
              caption: pf.caption || null,
              sort_order: i,
            });

          if (error) {
            log(`  ❌ DB error for ${pf.filename}: ${error.message}`);
            failed++;
          } else {
            uploaded++;
            if (uploaded % 10 === 0) log(`  📤 Images: ${uploaded} uploaded...`);
          }
        } catch (err) {
          log(`  ❌ Upload error: ${pf.filename} - ${err.message}`);
          failed++;
        }
      }
    }

    if (noId > 0) log(`  ⚠️  ${noId} lessons had no ID mapping (run --only=lessons first)`);
    log(`  ✅ Images: ${uploaded} uploaded, ${imgSkipped} skipped, ${failed} failed`);
  }

  // ---- Step 5: Create Playlists ----
  if (!ONLY || ONLY === 'lessons') {
    log('\n📋 Creating playlists...');

    if (!DRY_RUN) {
      // Helper: find or create playlist by name
      async function findOrCreatePlaylist(name, description) {
        const { data: existing } = await supabase
          .from('playlists')
          .select('id')
          .eq('name', name)
          .maybeSingle();

        if (existing) return existing.id;

        const { data: created, error } = await supabase
          .from('playlists')
          .insert({ name, hebrew_name: name, description, is_public: true })
          .select('id')
          .single();

        if (error) {
          log(`  ❌ Playlist create failed: ${error.message}`);
          return null;
        }
        return created.id;
      }

      // Post-seder playlist
      const postId = await findOrCreatePlaylist(
        'עץ חיים כסדר',
        `שיעורי עץ חיים כסדר - ${data.lessons.length} שיעורים`
      );
      if (postId) {
        let position = 0;
        for (const lesson of data.lessons) {
          const lessonId = lessonIdMap[lesson.date];
          if (!lessonId) continue;

          // Use insert with conflict ignore (check first)
          const { data: existing } = await supabase
            .from('playlist_lessons')
            .select('id')
            .eq('playlist_id', postId)
            .eq('lesson_id', lessonId)
            .maybeSingle();

          if (!existing) {
            await supabase
              .from('playlist_lessons')
              .insert({ playlist_id: postId, lesson_id: lessonId, position });
          }
          position++;
        }
        log(`  Created playlist "עץ חיים כסדר" with ${position} lessons`);
      }

      // Pre-seder playlist
      if (data.pre_seder_lessons.length > 0) {
        const preId = await findOrCreatePlaylist(
          'שיעורים לפני הסדר',
          `שיעורים מלפני התחלת עץ חיים כסדר - ${data.pre_seder_lessons.length} שיעורים`
        );
        if (preId) {
          let position = 0;
          for (const lesson of data.pre_seder_lessons) {
            const lessonId = lessonIdMap[lesson.date];
            if (!lessonId) continue;

            const { data: existing } = await supabase
              .from('playlist_lessons')
              .select('id')
              .eq('playlist_id', preId)
              .eq('lesson_id', lessonId)
              .maybeSingle();

            if (!existing) {
              await supabase
                .from('playlist_lessons')
                .insert({ playlist_id: preId, lesson_id: lessonId, position });
            }
            position++;
          }
          log(`  Created playlist "שיעורים לפני הסדר" with ${position} lessons`);
        }
      }
    }
  }

  log('\n✅ Import complete!');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
