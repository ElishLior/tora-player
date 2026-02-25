#!/usr/bin/env node
/**
 * Import short clips from WhatsApp archive into Tora Player.
 *
 * Usage:
 *   node scripts/import-short-clips.mjs [--dry-run] [--skip-upload]
 *
 * Reads short_clips from lessons_database.json and:
 *  1. Creates a series "שיעורים קצרים"
 *  2. Creates lesson records with lesson_type = 'short_clip'
 *  3. Uploads audio to R2 and sets audio_url on the lesson
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const ARCHIVE_DIR = '/Users/liorelisha/Downloads/whatsapp-archive-parsed';
const JSON_FILE = path.join(ARCHIVE_DIR, 'lessons_database.json');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID?.trim();
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID?.trim();
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY?.trim();
const R2_BUCKET = process.env.R2_BUCKET_NAME?.trim() || 'tora-player-audio';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SKIP_UPLOAD = args.includes('--skip-upload');

let supabase, r2;

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

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function getContentType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types = { mp3: 'audio/mpeg', opus: 'audio/ogg', m4a: 'audio/mp4' };
  return types[ext] || 'application/octet-stream';
}

async function uploadToR2(key, filePath) {
  const body = fs.readFileSync(filePath);
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: body,
    ContentType: getContentType(filePath),
  }));
  return body.length;
}

/**
 * Extract a meaningful title from the filename.
 * Patterns:
 *   "00000650-אליהו 30.01.2026 פנימיות האהבה.mp3" → "פנימיות האהבה"
 *   "00000662-אליהו 02.02.2026 סוד ההתחדשות , אהבה ככוח העליון ביותר, הקדמה.mp3" → "סוד ההתחדשות, אהבה ככוח העליון ביותר, הקדמה"
 *   "00000635-AUDIO-2026-02-06-14-40-18.mp3" → "שיעור קצר - 06.02.2026"
 */
function extractTitle(filename, date) {
  // Remove extension
  const base = filename.replace(/\.\w+$/, '');

  // Pattern: "NNNNN-אליהו DD.MM.YYYY TITLE"
  const hebrewMatch = base.match(/^\d+-אליהו\s+\d{2}\.\d{2}\.\d{4}\s+(.+)/);
  if (hebrewMatch) {
    let title = hebrewMatch[1].trim();
    // Clean up "(מחולק) חלק X" suffixes
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

async function main() {
  if (!DRY_RUN) initClients();
  log('=== Short Clips Import ===');
  if (DRY_RUN) log('🔸 DRY RUN');

  const data = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const clips = data.short_clips || [];

  if (clips.length === 0) {
    log('No short clips found.');
    return;
  }

  log(`Found ${clips.length} short clips`);

  // Step 1: Find or create series
  let seriesId;
  if (!DRY_RUN) {
    const { data: existing } = await supabase
      .from('series')
      .select('id')
      .eq('name', 'שיעורים קצרים')
      .maybeSingle();

    if (existing) {
      seriesId = existing.id;
      log(`  Series "שיעורים קצרים" exists: ${seriesId}`);
    } else {
      const { data: created, error } = await supabase
        .from('series')
        .insert({
          name: 'שיעורים קצרים',
          hebrew_name: 'שיעורים קצרים',
          description: 'שיעורים קצרים מקבוצת הוואטסאפ',
        })
        .select()
        .single();

      if (error) throw new Error(`Series create failed: ${error.message}`);
      seriesId = created.id;
      log(`  Created series: ${seriesId}`);
    }
  }

  // Step 2: Import each clip as a lesson + upload audio
  let created = 0, skipped = 0, failed = 0;

  for (const clip of clips) {
    const title = extractTitle(clip.filename, clip.date);
    const duration = Math.round(clip.duration_seconds || 0);

    if (DRY_RUN) {
      log(`  [DRY] ${clip.date} | ${clip.duration_display} | "${title}" (${clip.filename})`);
      created++;
      continue;
    }

    // Check if already imported (by original filename in source_text)
    const { data: existing } = await supabase
      .from('lessons')
      .select('id')
      .eq('source_text', clip.filename)
      .eq('lesson_type', 'short_clip')
      .maybeSingle();

    if (existing) {
      skipped++;
      continue;
    }

    // Upload audio to R2
    const filePath = path.join(ARCHIVE_DIR, clip.filename);
    if (!fs.existsSync(filePath)) {
      log(`  ⚠️  File not found: ${clip.filename}`);
      failed++;
      continue;
    }

    const ext = clip.filename.split('.').pop()?.toLowerCase() || 'mp3';
    const r2Key = `audio/short-clips/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const audioUrl = `/api/audio/stream/${encodeURIComponent(r2Key)}`;

    let fileSize;
    try {
      if (!SKIP_UPLOAD) {
        fileSize = await uploadToR2(r2Key, filePath);
      } else {
        fileSize = fs.statSync(filePath).size;
      }
    } catch (err) {
      log(`  ❌ Upload failed: ${clip.filename} - ${err.message}`);
      failed++;
      continue;
    }

    // Create lesson record
    const { error } = await supabase
      .from('lessons')
      .insert({
        title: title,
        hebrew_title: title,
        date: clip.date,
        series_id: seriesId,
        source_type: 'whatsapp',
        source_text: clip.filename, // track original file for dedup
        is_published: true,
        lesson_type: 'short_clip',
        audio_url: audioUrl,
        duration: duration,
        file_size: fileSize,
        codec: ext,
        teacher: 'אליהו',
      });

    if (error) {
      log(`  ❌ DB error: ${clip.filename} - ${error.message}`);
      failed++;
    } else {
      created++;
      log(`  ✅ "${title}" (${clip.duration_display})`);
    }
  }

  log(`\n📊 Results: ${created} created, ${skipped} skipped, ${failed} failed`);
  log('✅ Short clips import complete!');
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
