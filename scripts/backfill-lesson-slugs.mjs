#!/usr/bin/env node
/**
 * Gives every lesson without a slug its `<topic>-<DD-MM-YYYY>` slug
 * (src/lib/lesson-slugs.ts). Dry run by default: prints the plan as JSON.
 *
 *   node --experimental-strip-types scripts/backfill-lesson-slugs.mjs [--out plan.json]
 *   node --experimental-strip-types scripts/backfill-lesson-slugs.mjs --apply
 *
 * - Topics: the reading/holiday for full lessons; reviewed topics for other
 *   titles from scripts/data/lesson-slug-topics.json; else `short` / `lesson`.
 * - Collisions: `-2`, `-3` in created_at order, never reusing a slug already
 *   in lessons or lesson_slug_history.
 * - Idempotent: lessons that already have a slug are left alone, and each
 *   write is guarded with `slug is null`.
 * - --apply saves the before/after rows under ~/.local/state/tora-data-writes/.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, from the
 * environment or from the file in TORA_ENV_FILE (default: .env.local).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { baseLessonSlug, isValidLessonSlug, uniqueLessonSlug } from '../src/lib/lesson-slugs.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: process.env.TORA_ENV_FILE || path.join(root, '.env.local'), quiet: true });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

const env = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const SHORTS_AUDIO_TYPE = 'קצרים';
const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});
const { topics } = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/lesson-slug-topics.json'), 'utf8'));

function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

const lessons = check(
  await supabase
    .from('lessons')
    .select('id, title, hebrew_title, date, parsha, slug, created_at, is_published, category:category_id(hebrew_name), series:series_id(hebrew_name), audio:lesson_audio(audio_type)')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }),
  'read lessons',
);
const history = check(await supabase.from('lesson_slug_history').select('slug'), 'read slug history');

const taken = new Set([...lessons.map((lesson) => lesson.slug).filter(Boolean), ...history.map((row) => row.slug)]);

function isShortLesson(lesson) {
  return (
    (lesson.audio ?? []).some((part) => part.audio_type === SHORTS_AUDIO_TYPE) ||
    /קצר/.test(lesson.category?.hebrew_name ?? '') ||
    lesson.series?.hebrew_name === 'שיעורים קצרים'
  );
}

const plan = [];
const skipped = [];
for (const lesson of lessons) {
  if (lesson.slug) continue;
  const base = baseLessonSlug({
    date: lesson.date,
    parsha: lesson.parsha,
    isShort: isShortLesson(lesson),
    topic: topics[lesson.id] ?? null,
  });
  if (!base) {
    skipped.push({ id: lesson.id, reason: `no valid date (${lesson.date})` });
    continue;
  }
  const slug = uniqueLessonSlug(base, (candidate) => taken.has(candidate));
  if (!isValidLessonSlug(slug)) throw new Error(`invalid slug ${slug} for ${lesson.id}`);
  taken.add(slug);
  plan.push({
    id: lesson.id,
    slug,
    date: lesson.date,
    parsha: lesson.parsha,
    published: lesson.is_published,
    title: lesson.hebrew_title || lesson.title,
  });
}

const summary = { lessons: lessons.length, alreadySlugged: lessons.length - plan.length - skipped.length, planned: plan.length, skipped };
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify({ summary, plan }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (!apply) {
  if (!outFile) console.log(JSON.stringify(plan, null, 2));
  console.log('Dry run. Re-run with --apply to write.');
  process.exit(0);
}

const stateDir = path.join(os.homedir(), '.local/state/tora-data-writes');
fs.mkdirSync(stateDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const before = lessons.filter((lesson) => plan.some((item) => item.id === lesson.id)).map(({ id, slug }) => ({ id, slug }));
fs.writeFileSync(path.join(stateDir, `${stamp}-lesson-slugs-before.json`), JSON.stringify(before, null, 2));

const written = [];
for (const item of plan) {
  const rows = check(
    await supabase.from('lessons').update({ slug: item.slug }).eq('id', item.id).is('slug', null).select('id, slug'),
    `write ${item.id}`,
  );
  if (rows.length !== 1) throw new Error(`expected one row for ${item.id}, got ${rows.length}`);
  written.push(rows[0]);
}
fs.writeFileSync(path.join(stateDir, `${stamp}-lesson-slugs-after.json`), JSON.stringify(written, null, 2));
console.log(`Wrote ${written.length} slugs. Before/after: ${stateDir}/${stamp}-lesson-slugs-{before,after}.json`);
