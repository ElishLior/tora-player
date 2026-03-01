#!/usr/bin/env node
/**
 * Apply the 005_categories migration to Supabase.
 * Since we don't have a service_role key, we run the SQL statements
 * via the Supabase REST API using the anon key (RLS allows writes).
 *
 * For DDL (CREATE TABLE, ALTER TABLE), we need to use the Supabase SQL editor.
 * This script handles the DML part: inserts and updates.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  console.log('\n📂 Categories Migration\n');

  // Step 1: Check if categories table exists
  const { data: catTest, error: catErr } = await supabase
    .from('categories')
    .select('id')
    .limit(1);

  if (catErr) {
    console.error('❌ categories table does not exist yet.');
    console.log('\n📋 You need to run the DDL part in the Supabase SQL Editor first:');
    console.log('   https://supabase.com/dashboard → SQL Editor → paste 005_categories.sql\n');
    console.log('   The DDL part includes: CREATE TABLE, ALTER TABLE, indexes, trigger, RLS policies.\n');
    console.log('   After running DDL, re-run this script for seed data.\n');
    process.exit(1);
  }

  // Step 2: Check if already seeded
  const { data: existing } = await supabase
    .from('categories')
    .select('id');

  if (existing && existing.length > 0) {
    console.log(`✅ Categories table already has ${existing.length} rows. Skipping seed.\n`);
  } else {
    // Seed top-level categories
    console.log('🌱 Seeding categories...');

    const topLevel = [
      { id: '10000000-0000-0000-0000-000000000001', name: 'Lessons', hebrew_name: 'שיעורים', icon: 'BookOpen', sort_order: 1 },
      { id: '10000000-0000-0000-0000-000000000002', name: 'Work Methods', hebrew_name: 'דרכי עבודה', icon: 'Wrench', sort_order: 2 },
      { id: '10000000-0000-0000-0000-000000000003', name: 'Imagination', hebrew_name: 'כח המדמה', icon: 'Sparkles', sort_order: 3 },
      { id: '10000000-0000-0000-0000-000000000004', name: 'Short with Melodies', hebrew_name: 'קצרים עם נעימות', icon: 'Music', sort_order: 4 },
      { id: '10000000-0000-0000-0000-000000000005', name: 'Short Clips', hebrew_name: 'קצרים', icon: 'Scissors', sort_order: 5 },
    ];

    const { error: insertTopErr } = await supabase.from('categories').insert(topLevel);
    if (insertTopErr) {
      console.error('❌ Error inserting top-level categories:', insertTopErr.message);
      process.exit(1);
    }
    console.log('  ✅ 5 top-level categories inserted');

    // Sub-categories under "שיעורים"
    const subLessons = [
      { id: '10000000-0000-0000-0000-000000000011', name: 'Etz Chaim Sequential', hebrew_name: 'מתחילת עץ חיים', description: 'שיעורים מסודרים מתחילת עץ חיים', sort_order: 1, parent_id: '10000000-0000-0000-0000-000000000001' },
      { id: '10000000-0000-0000-0000-000000000012', name: 'Lessons at Tzion', hebrew_name: 'שיעורים בציון בניהו בן יהוידע', description: 'שיעורים לפני תחילת הסדר', sort_order: 2, parent_id: '10000000-0000-0000-0000-000000000001' },
    ];

    const { error: insertSubErr1 } = await supabase.from('categories').insert(subLessons);
    if (insertSubErr1) {
      console.error('❌ Error inserting sub-categories (lessons):', insertSubErr1.message);
      process.exit(1);
    }
    console.log('  ✅ 2 sub-categories under שיעורים');

    // Sub-categories under "דרכי עבודה"
    const subWork = [
      { id: '10000000-0000-0000-0000-000000000021', name: 'Work Methods Lessons', hebrew_name: 'שיעורים', sort_order: 1, parent_id: '10000000-0000-0000-0000-000000000002' },
      { id: '10000000-0000-0000-0000-000000000022', name: 'High Quality', hebrew_name: 'שיעורים באיכות גבוהה', sort_order: 2, parent_id: '10000000-0000-0000-0000-000000000002' },
    ];

    const { error: insertSubErr2 } = await supabase.from('categories').insert(subWork);
    if (insertSubErr2) {
      console.error('❌ Error inserting sub-categories (work):', insertSubErr2.message);
      process.exit(1);
    }
    console.log('  ✅ 2 sub-categories under דרכי עבודה');
  }

  // Step 3: Assign lessons to categories
  console.log('\n📌 Assigning lessons to categories...');

  // Lessons WITH seder_number → "מתחילת עץ חיים"
  const { data: etzChaim, error: e1 } = await supabase
    .from('lessons')
    .update({ category_id: '10000000-0000-0000-0000-000000000011' })
    .not('seder_number', 'is', null)
    .select('id');

  if (e1) console.error('  ❌ Etz Chaim assignment error:', e1.message);
  else console.log(`  ✅ ${etzChaim.length} lessons → מתחילת עץ חיים`);

  // Lessons WITHOUT seder_number → "שיעורים בציון בניהו בן יהוידע"
  const { data: preSeder, error: e2 } = await supabase
    .from('lessons')
    .update({ category_id: '10000000-0000-0000-0000-000000000012' })
    .is('seder_number', null)
    .is('category_id', null)
    .select('id');

  if (e2) console.error('  ❌ Pre-seder assignment error:', e2.message);
  else console.log(`  ✅ ${preSeder.length} lessons → שיעורים בציון בניהו בן יהוידע`);

  // Verify
  const { data: unassigned } = await supabase
    .from('lessons')
    .select('id')
    .is('category_id', null);

  console.log(`\n📊 Unassigned lessons remaining: ${unassigned?.length || 0}`);
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
