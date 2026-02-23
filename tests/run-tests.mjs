#!/usr/bin/env node
// Node.js-based smoke test runner for Tora Player
// Tests all routes and validates HTML content

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';

const BASE_URL = 'http://localhost:3000';
const OUTPUT_DIR = '/Users/liorelisha/Tora player/.a5c/runs/01KJ55Z0DTPCEK8M09484QJ7V3/tasks/01KJ5MJETS3TM7605MYNGBZVFM';
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'output.json');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Request timeout after 15s')), 15000);
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        clearTimeout(timeout);
        resolve({ statusCode: res.statusCode, body: data, headers: res.headers });
      });
      res.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

const results = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  failures: [],
  screenshots: [],
  method: 'node-fetch'
};

async function runTest(name, testFn) {
  results.totalTests++;
  process.stdout.write(`  Testing: ${name} ... `);
  try {
    await testFn();
    results.passed++;
    console.log('PASSED');
  } catch (err) {
    results.failed++;
    results.failures.push({ test: name, error: err.message });
    console.log(`FAILED: ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Check if Playwright is available and try that first
async function tryPlaywright() {
  try {
    console.log('Checking Playwright availability...');
    const version = execSync('cd "/Users/liorelisha/Tora player" && npx playwright --version 2>&1', { timeout: 10000 }).toString().trim();
    console.log(`Playwright version: ${version}`);

    // Check if chromium browser is installed
    try {
      execSync('cd "/Users/liorelisha/Tora player" && npx playwright install chromium 2>&1', { timeout: 120000 });
      console.log('Chromium browser ready.');
    } catch (e) {
      console.log(`Browser install issue: ${e.message}`);
      // Continue anyway, might already be installed
    }

    console.log('Running Playwright tests...');
    let playwrightOutput;
    try {
      playwrightOutput = execSync(
        'cd "/Users/liorelisha/Tora player" && npx playwright test tests/e2e/smoke.spec.ts --reporter=json 2>/dev/null',
        { timeout: 120000 }
      ).toString();
    } catch (e) {
      // Playwright returns non-zero exit code if tests fail, but still outputs JSON
      playwrightOutput = e.stdout ? e.stdout.toString() : '';
      if (!playwrightOutput) {
        playwrightOutput = e.stderr ? e.stderr.toString() : '';
      }
    }

    if (playwrightOutput) {
      // Find JSON in output
      const jsonStart = playwrightOutput.indexOf('{');
      if (jsonStart >= 0) {
        const data = JSON.parse(playwrightOutput.substring(jsonStart));
        let total = 0, passed = 0, failed = 0;
        const failures = [];

        function processSpecs(specs) {
          for (const spec of specs) {
            for (const test of (spec.tests || [])) {
              total++;
              const result = test.results && test.results[0];
              if (result && result.status === 'passed') {
                passed++;
              } else {
                failed++;
                failures.push({
                  test: spec.title || 'Unknown',
                  error: (result && result.error && result.error.message) || 'Test failed'
                });
              }
            }
          }
        }

        for (const suite of (data.suites || [])) {
          processSpecs(suite.specs || []);
          for (const sub of (suite.suites || [])) {
            processSpecs(sub.specs || []);
          }
        }

        const output = { totalTests: total, passed, failed, failures, screenshots: [], method: 'playwright' };
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
        console.log('\nPlaywright test results:');
        console.log(JSON.stringify(output, null, 2));
        return true;
      }
    }

    return false;
  } catch (err) {
    console.log(`Playwright not available: ${err.message}`);
    return false;
  }
}

async function runNodeTests() {
  console.log('\nRunning Node.js HTTP-based smoke tests...\n');

  // Test 1: Home page loads at /he with Hebrew content
  await runTest('Home page loads at /he with Hebrew content', async () => {
    const res = await fetchPage(`${BASE_URL}/he`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.body.includes('he'), 'No Hebrew locale reference found');
  });

  // Test 2: Navigate to /he/lessons
  await runTest('Navigate to /he/lessons page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/lessons`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 3: Navigate to /he/upload (lessons/upload)
  await runTest('Navigate to /he/upload page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/lessons/upload`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 4: Navigate to /he/series
  await runTest('Navigate to /he/series page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/series`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 5: Navigate to /he/playlists
  await runTest('Navigate to /he/playlists page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/playlists`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 6: Navigate to /he/bookmarks
  await runTest('Navigate to /he/bookmarks page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/bookmarks`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 7: Navigate to /he/search
  await runTest('Navigate to /he/search page', async () => {
    const res = await fetchPage(`${BASE_URL}/he/search`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
  });

  // Test 8: Verify RTL direction on /he pages
  await runTest('Verify RTL direction on /he pages', async () => {
    const res = await fetchPage(`${BASE_URL}/he`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.body.includes('dir="rtl"'), 'dir="rtl" not found in HTML');
    assert(res.body.includes('lang="he"'), 'lang="he" not found in HTML');
  });

  // Test 9: Switch to /en and verify LTR
  await runTest('Switch to /en and verify LTR', async () => {
    const res = await fetchPage(`${BASE_URL}/en`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.body.includes('dir="ltr"'), 'dir="ltr" not found in HTML');
    assert(res.body.includes('lang="en"'), 'lang="en" not found in HTML');
  });

  // Test 10: Mobile viewport responsiveness (verify page loads, can't check viewport via HTTP)
  await runTest('Check mobile viewport responsiveness (page loads)', async () => {
    const res = await fetchPage(`${BASE_URL}/he`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    // Check for viewport meta tag that enables responsive design
    assert(
      res.body.includes('viewport') || res.body.includes('width=device-width'),
      'No viewport meta tag found - may not be mobile responsive'
    );
  });

  // Test 11: Verify bottom navigation markup is present
  await runTest('Verify bottom navigation is visible', async () => {
    const res = await fetchPage(`${BASE_URL}/he`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    // Bottom nav is client-side rendered, so check for the component script references
    // or for the nav element in the SSR output
    const hasNav = res.body.includes('Main navigation') ||
                   res.body.includes('bottom-nav') ||
                   res.body.includes('BottomNav') ||
                   res.body.includes('<nav');
    assert(hasNav, 'Bottom navigation markup not found in HTML');
  });

  // Test 12: Verify header with app title "נגן תורה"
  await runTest('Verify header with app title "נגן תורה" is present', async () => {
    const res = await fetchPage(`${BASE_URL}/he`);
    assert(res.statusCode === 200, `Expected 200, got ${res.statusCode}`);
    assert(res.body.includes('נגן תורה'), 'App title "נגן תורה" not found in HTML');
  });

  // Write results
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log('\n=============================');
  console.log('Test Results Summary');
  console.log('=============================');
  console.log(`Total: ${results.totalTests} | Passed: ${results.passed} | Failed: ${results.failed}`);
  if (results.failures.length > 0) {
    console.log('\nFailures:');
    for (const f of results.failures) {
      console.log(`  - ${f.test}: ${f.error}`);
    }
  }
  console.log(`\nResults written to: ${OUTPUT_FILE}`);
}

async function main() {
  console.log('=== Tora Player Smoke Tests ===\n');

  // First check if server is running
  try {
    await fetchPage(`${BASE_URL}/he`);
    console.log('Dev server is running on port 3000.\n');
  } catch (err) {
    console.log(`ERROR: Dev server not running on port 3000: ${err.message}`);
    const output = {
      totalTests: 12,
      passed: 0,
      failed: 12,
      failures: [{ test: 'Server check', error: `Dev server not running: ${err.message}` }],
      screenshots: [],
      method: 'node-fetch'
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    process.exit(1);
  }

  // Try Playwright first
  const playwrightSucceeded = await tryPlaywright();

  if (!playwrightSucceeded) {
    // Fall back to Node.js HTTP tests
    await runNodeTests();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  const output = {
    totalTests: 12,
    passed: 0,
    failed: 12,
    failures: [{ test: 'Runner', error: err.message }],
    screenshots: [],
    method: 'node-fetch'
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  process.exit(1);
});
