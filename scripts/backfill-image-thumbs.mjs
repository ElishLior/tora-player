#!/usr/bin/env node
/**
 * Backfill gallery thumbnails (migration 019) for lesson images uploaded
 * before thumbnails existed: download the original from R2, render the WebP
 * thumbnail (src/lib/image-thumbs.ts, same as the admin upload), upload it to
 * `images/<lesson>/thumbs/<name>.webp`, and set thumb_key plus the original's
 * width/height where they are null. Idempotent: rows that already have all
 * three are never selected. Dry run (downloads and renders, writes nothing)
 * unless --apply is given.
 *
 *   node --experimental-strip-types scripts/backfill-image-thumbs.mjs [--apply] [--limit=N]
 *
 * Needs .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createGalleryThumbnail, thumbKeyFor } from '../src/lib/image-thumbs.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env.local') });

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number(args.find((a) => a.startsWith('--limit='))?.slice(8) ?? Infinity);
const PAGE = 500;

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

const log = (msg) => console.log(`${APPLY ? '' : '[dry] '}${msg}`);

/** Every row missing a thumbnail or dimensions, oldest first (keyset-paginated by id). */
async function pendingRows() {
  const rows = [];
  let after = '00000000-0000-0000-0000-000000000000';
  while (rows.length < LIMIT) {
    const { data, error } = await supabase
      .from('lesson_images')
      .select('id, file_key, thumb_key, width, height')
      .or('thumb_key.is.null,width.is.null,height.is.null')
      .gt('id', after)
      .order('id')
      .limit(PAGE);
    if (error) throw new Error(`list lesson_images: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
    after = data[data.length - 1].id;
  }
  return rows.slice(0, LIMIT);
}

async function download(key) {
  const response = await r2.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return Buffer.from(await response.Body.transformToByteArray());
}

async function backfill(row) {
  if (!row.file_key.startsWith('images/')) throw new Error('not an images/ key');
  const rendition = await createGalleryThumbnail(await download(row.file_key));
  const update = {};
  if (!row.thumb_key) update.thumb_key = thumbKeyFor(row.file_key);
  if (row.width == null) update.width = rendition.width;
  if (row.height == null) update.height = rendition.height;

  log(`${row.file_key} → ${JSON.stringify(update)} (thumb ${(rendition.thumb.length / 1024).toFixed(1)} KB)`);
  if (!APPLY) return;

  if (update.thumb_key) {
    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: update.thumb_key,
      Body: rendition.thumb,
      ContentType: 'image/webp',
    }));
  }
  const { error } = await supabase.from('lesson_images').update(update).eq('id', row.id);
  if (error) throw new Error(`update row: ${error.message}`);
}

const rows = await pendingRows();
console.log(`${rows.length} lesson image(s) need a thumbnail or dimensions${APPLY ? '' : ' (dry run: pass --apply to write)'}`);
let failed = 0;
for (const row of rows) {
  try {
    await backfill(row);
  } catch (error) {
    failed++;
    console.error(`✗ ${row.id} ${row.file_key}: ${error.message}`);
  }
}
console.log(`done: ${rows.length - failed} ok, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
