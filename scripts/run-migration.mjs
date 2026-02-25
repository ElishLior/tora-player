#!/usr/bin/env node
/**
 * Run pending Supabase migrations via direct PostgreSQL connection.
 *
 * Usage:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" node scripts/run-migration.mjs
 *
 * To find your DATABASE_URL:
 *   1. Go to https://supabase.com/dashboard/project/yudibxtwlhoydrioqpjr/settings/database
 *   2. Scroll down to "Connection string" → "URI" tab
 *   3. Copy the connection string (replace [YOUR-PASSWORD] with your DB password)
 *
 * Or simply paste the SQL from supabase/migrations/003_lesson_images_and_fields.sql
 * into the Supabase SQL Editor at:
 *   https://supabase.com/dashboard/project/yudibxtwlhoydrioqpjr/sql/new
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required.');
  console.error('');
  console.error('Get it from: https://supabase.com/dashboard/project/yudibxtwlhoydrioqpjr/settings/database');
  console.error('');
  console.error('Usage:');
  console.error('  DATABASE_URL="postgresql://postgres.[ref]:[password]@..." node scripts/run-migration.mjs');
  process.exit(1);
}

async function run() {
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected!\n');

    // Check if migration is needed
    const { rows } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lessons' AND column_name = 'hebrew_date'
    `);

    if (rows.length > 0) {
      console.log('✅ Migration 003 already applied (hebrew_date column exists).');

      // Check lesson_images table
      const { rows: tables } = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_name = 'lesson_images'
      `);
      if (tables.length > 0) {
        console.log('✅ lesson_images table exists.');
      }
      return;
    }

    // Read and run migration
    const sqlPath = join(__dirname, '..', 'supabase', 'migrations', '003_lesson_images_and_fields.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    console.log('🚀 Running migration 003_lesson_images_and_fields.sql ...');
    await client.query(sql);
    console.log('✅ Migration applied successfully!\n');

    // Verify
    const { rows: verify } = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lessons' AND column_name IN ('hebrew_date', 'parsha', 'teacher', 'summary')
      ORDER BY column_name
    `);
    console.log('New columns verified:', verify.map(r => r.column_name).join(', '));

    const { rows: imgTable } = await client.query(`
      SELECT table_name FROM information_schema.tables WHERE table_name = 'lesson_images'
    `);
    console.log('lesson_images table:', imgTable.length > 0 ? '✅ created' : '❌ missing');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
