#!/usr/bin/env node
/**
 * Execute a reviewed import manifest (built from a WhatsApp export) against
 * Supabase + R2. Idempotent: media is keyed by content SHA-1 (migration 012),
 * R2 keys are deterministic, lessons stay unpublished until all their files
 * are in place. Dry run unless --execute is given.
 *
 *   node --experimental-strip-types scripts/import-manifest.mjs <manifest.json> [--execute] [--only=lessons,shorts,renames,fixes]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { generateLessonMetadata } from '../src/lib/hebrew-date.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });

const args = process.argv.slice(2);
const manifestPath = args.find((a) => !a.startsWith('--'));
const EXECUTE = args.includes('--execute');
const ONLY = new Set(
  (args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'fixes,lessons,shorts,renames').split(','),
);
if (!manifestPath) {
  console.error('usage: import-manifest.mjs <manifest.json> [--execute] [--only=...]');
  process.exit(1);
}

const CATEGORY_ETZ_CHAIM = '10000000-0000-0000-0000-000000000011';
const CATEGORY_SHORTS = '10000000-0000-0000-0000-000000000005';
const CONTENT_TYPES = {
  opus: 'audio/ogg', ogg: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac',
  wav: 'audio/wav', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sourceDir = manifest.source_dir;

const env = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set in .env.local`);
  return value;
};
const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const bucket = env('R2_BUCKET_NAME');
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') },
});

const stats = { lessonsCreated: 0, lessonsReused: 0, audio: 0, images: 0, skippedExisting: 0, shorts: 0, renamed: 0, removed: 0 };
const log = (msg) => console.log(`${EXECUTE ? '' : '[dry] '}${msg}`);

async function must(promise, what) {
  const { data, error } = await promise;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

/** Upload once; a HEAD hit means a previous run already stored these exact bytes. */
async function putObject(key, file) {
  const ext = file.split('.').pop().toLowerCase();
  try {
    await r2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return;
  } catch (err) {
    if (err?.$metadata?.httpStatusCode !== 404 && err?.name !== 'NotFound') throw err;
  }
  await r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fs.readFileSync(path.join(sourceDir, file)),
      ContentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    }),
  );
}

async function existingSha(table, sha) {
  const rows = await must(supabase.from(table).select('id').eq('content_sha1', sha).limit(1), `lookup ${table}`);
  return rows.length > 0;
}

async function addAudio(lessonId, part, sortOrder) {
  if (await existingSha('lesson_audio', part.sha)) {
    stats.skippedExisting++;
    return;
  }
  const ext = part.file.split('.').pop().toLowerCase();
  const key = `audio/${lessonId}/${part.sha}.${ext}`;
  log(`    + audio ${part.type ?? ''} ${part.file} (${Math.round(part.sec / 60)}m)`);
  stats.audio++;
  if (!EXECUTE) return;
  await putObject(key, part.file);
  await must(
    supabase.from('lesson_audio').insert({
      lesson_id: lessonId,
      file_key: key,
      audio_url: `/api/audio/stream/${encodeURIComponent(key)}`,
      original_name: part.file,
      file_size: part.size,
      duration: part.sec,
      codec: ext,
      sort_order: sortOrder,
      audio_type: part.type ?? null,
      content_sha1: part.sha,
    }),
    `insert audio ${part.file}`,
  );
}

async function addImage(lessonId, image, sortOrder) {
  if (await existingSha('lesson_images', image.sha)) {
    stats.skippedExisting++;
    return;
  }
  const ext = image.file.split('.').pop().toLowerCase();
  const key = `images/${lessonId}/${image.sha}.${ext}`;
  stats.images++;
  if (!EXECUTE) return;
  await putObject(key, image.file);
  await must(
    supabase.from('lesson_images').insert({
      lesson_id: lessonId,
      file_key: key,
      image_url: `/api/images/stream/${encodeURIComponent(key)}`,
      original_name: image.file,
      file_size: image.size,
      sort_order: sortOrder,
      content_sha1: image.sha,
    }),
    `insert image ${image.file}`,
  );
}

async function findDailyLesson(date) {
  const rows = await must(
    supabase.from('lessons').select('id, title').eq('date', date).neq('lesson_type', 'short_clip').order('created_at').limit(1),
    `find lesson ${date}`,
  );
  return rows[0] ?? null;
}

async function importLesson(entry) {
  const existing = await findDailyLesson(entry.date);
  let lessonId = existing?.id;
  if (existing) {
    stats.lessonsReused++;
    log(`= ${entry.date} ${existing.title}`);
  } else {
    const meta = generateLessonMetadata(entry.date);
    stats.lessonsCreated++;
    log(`+ ${entry.date} ${meta.title}${entry.description ? ` — ${entry.description}` : ''}`);
    if (EXECUTE) {
      const row = await must(
        supabase
          .from('lessons')
          .insert({
            title: meta.title,
            hebrew_title: meta.hebrewTitle,
            date: entry.date,
            hebrew_date: meta.hebrewDate,
            parsha: meta.parsha,
            teacher: meta.teacher,
            location: meta.location,
            lesson_type: meta.lessonType,
            description: entry.description || null,
            summary: entry.description || null,
            category_id: CATEGORY_ETZ_CHAIM,
            source_type: 'whatsapp',
            is_published: false,
          })
          .select('id')
          .single(),
        `insert lesson ${entry.date}`,
      );
      lessonId = row.id;
    } else {
      lessonId = `new-${entry.date}`;
    }
  }

  const baseOrder = existing
    ? (await must(supabase.from('lesson_audio').select('id').eq('lesson_id', lessonId), 'count audio')).length
    : 0;
  for (const [i, part] of entry.parts.entries()) await addAudio(lessonId, part, baseOrder + i);
  const baseImage = existing
    ? (await must(supabase.from('lesson_images').select('id').eq('lesson_id', lessonId), 'count images')).length
    : 0;
  for (const [i, image] of entry.images.entries()) await addImage(lessonId, image, baseImage + i);

  if (EXECUTE && !existing) {
    await must(supabase.from('lessons').update({ is_published: true }).eq('id', lessonId), `publish ${entry.date}`);
  }
}

async function importShort(short) {
  if (await existingSha('lesson_audio', short.sha)) {
    stats.skippedExisting++;
    return;
  }
  const meta = generateLessonMetadata(short.date);
  stats.shorts++;
  log(`+ קצר ${short.date} ${short.title}`);
  if (!EXECUTE) return;
  const row = await must(
    supabase
      .from('lessons')
      .insert({
        title: short.title,
        hebrew_title: short.title,
        date: short.date,
        hebrew_date: meta.hebrewDate,
        teacher: meta.teacher,
        lesson_type: 'short_clip',
        category_id: CATEGORY_SHORTS,
        source_type: 'whatsapp',
        is_published: false,
      })
      .select('id')
      .single(),
    `insert short ${short.title}`,
  );
  await addAudio(row.id, { ...short, type: 'קצרים' }, 0);
  await must(supabase.from('lessons').update({ is_published: true }).eq('id', row.id), 'publish short');
}

async function main() {
  log(`manifest: ${manifestPath}\nsource: ${sourceDir}\nmode: ${EXECUTE ? 'EXECUTE' : 'dry run'}`);

  if (ONLY.has('fixes')) {
    for (const fix of manifest.fixes ?? []) {
      const lesson = await findDailyLesson(fix.date);
      if (!lesson) continue;
      const rows = await must(
        supabase.from('lesson_audio').select('id, file_key, file_size').eq('lesson_id', lesson.id).in('file_size', fix.remove_audio_size),
        `fix lookup ${fix.date}`,
      );
      for (const row of rows) {
        stats.removed++;
        log(`- ${fix.date} remove audio ${row.file_key} (${fix.note})`);
        if (EXECUTE) await must(supabase.from('lesson_audio').delete().eq('id', row.id), 'fix delete');
      }
    }
  }
  if (ONLY.has('lessons')) for (const entry of manifest.lessons) await importLesson(entry);
  if (ONLY.has('shorts')) for (const short of manifest.shorts) await importShort(short);
  if (ONLY.has('renames')) {
    for (const r of manifest.short_renames ?? []) {
      stats.renamed++;
      log(`~ ${r.date} "${r.old}" → "${r.new}"`);
      if (EXECUTE) {
        await must(
          supabase.from('lessons').update({ title: r.new, hebrew_title: r.new }).eq('id', r.id).eq('title', r.old),
          `rename ${r.id}`,
        );
      }
    }
  }
  console.log('\nsummary', stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
