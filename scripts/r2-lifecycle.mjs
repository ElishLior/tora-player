#!/usr/bin/env node
/**
 * Sets the R2 lifecycle rule that deletes abandoned upload chunks.
 *
 * Admin uploads stage chunks under `_chunks/{uploadId}/`
 * (src/app/api/upload/chunk/route.ts); the complete route deletes them, but an
 * upload that never completes leaves them behind. The rule expires every
 * `_chunks/` object one day after it was written. Other lifecycle rules on the
 * bucket (e.g. R2's default multipart-abort rule) are kept.
 *
 * Usage:
 *   node scripts/r2-lifecycle.mjs           # print the current rules and the planned change
 *   node scripts/r2-lifecycle.mjs --apply   # write the rule (no-op when already set)
 *
 * Reads R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME
 * (default tora-player-audio) from the environment or .env.local, like
 * src/lib/r2.ts. Bucket settings need an R2 API token with "Admin Read &
 * Write" permission; the app's object read/write token gets AccessDenied, so
 * pass an admin token's keys as R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in the
 * environment (they take precedence over .env.local).
 */

import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });

const APPLY = process.argv.includes('--apply');
const RULE = {
  ID: 'expire-upload-chunks',
  Status: 'Enabled',
  Filter: { Prefix: '_chunks/' },
  Expiration: { Days: 1 },
};

const accountId = process.env.R2_ACCOUNT_ID?.trim();
const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
const bucket = process.env.R2_BUCKET_NAME?.trim() || 'tora-player-audio';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('Missing R2_ACCOUNT_ID, R2_ACCESS_KEY_ID or R2_SECRET_ACCESS_KEY (env or .env.local).');
  process.exit(1);
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

async function currentRules() {
  try {
    const { Rules } = await r2.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }));
    return Rules ?? [];
  } catch (err) {
    if (err?.name === 'NoSuchLifecycleConfiguration') return [];
    if (err?.name === 'AccessDenied') {
      console.error(
        `AccessDenied reading bucket ${bucket} settings: this token lacks the R2 "Admin Read & Write" permission.\n` +
          'Create one in the Cloudflare dashboard (R2 > Manage API tokens) and run with its keys:\n' +
          '  R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... node scripts/r2-lifecycle.mjs',
      );
      process.exit(1);
    }
    throw err;
  }
}

function matchesRule(rule) {
  return (
    rule.Status === RULE.Status &&
    (rule.Filter?.Prefix ?? rule.Prefix) === RULE.Filter.Prefix &&
    rule.Expiration?.Days === RULE.Expiration.Days
  );
}

const rules = await currentRules();
console.log(`Bucket ${bucket}: current lifecycle rules`);
console.log(rules.length ? JSON.stringify(rules, null, 2) : '(none)');

const existing = rules.find((rule) => rule.ID === RULE.ID);
if (existing && matchesRule(existing)) {
  console.log(`\nRule "${RULE.ID}" is already set. Nothing to do.`);
  process.exit(0);
}

const next = [...rules.filter((rule) => rule.ID !== RULE.ID), RULE];
console.log(`\n${existing ? 'Replace' : 'Add'} rule "${RULE.ID}":`);
console.log(JSON.stringify(RULE, null, 2));

if (!APPLY) {
  console.log('\nDry run. Re-run with --apply to write it.');
  process.exit(0);
}

await r2.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: bucket,
    LifecycleConfiguration: { Rules: next },
  }),
);
const written = (await currentRules()).find((rule) => rule.ID === RULE.ID);
if (!written || !matchesRule(written)) {
  console.error('\nWrite returned OK but the rule does not read back as expected:', written);
  process.exit(1);
}
console.log(`\nRule "${RULE.ID}" applied.`);
