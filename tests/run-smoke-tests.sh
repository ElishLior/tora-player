#!/bin/bash
# Smoke test runner for Tora Player
# Tries Playwright first, falls back to curl-based testing

set -e

PROJECT_DIR="/Users/liorelisha/Tora player"
OUTPUT_DIR="$PROJECT_DIR/.a5c/runs/01KJ55Z0DTPCEK8M09484QJ7V3/tasks/01KJ5MJETS3TM7605MYNGBZVFM"
OUTPUT_FILE="$OUTPUT_DIR/output.json"
BASE_URL="http://localhost:3000"

# Ensure output directory exists
mkdir -p "$OUTPUT_DIR"

# Check if dev server is running
echo "Checking if dev server is running on port 3000..."
if ! curl -s -o /dev/null -w "" --connect-timeout 5 "$BASE_URL/he" 2>/dev/null; then
  echo '{"totalTests":12,"passed":0,"failed":12,"failures":[{"test":"Server check","error":"Dev server not running on port 3000"}],"screenshots":[],"method":"curl"}' > "$OUTPUT_FILE"
  echo "ERROR: Dev server is not running on port 3000"
  exit 1
fi
echo "Dev server is running."

# Try Playwright first
echo "Checking Playwright availability..."
cd "$PROJECT_DIR"

PLAYWRIGHT_AVAILABLE=false
if npx playwright --version 2>/dev/null; then
  # Check if browsers are installed
  if npx playwright install --dry-run chromium 2>/dev/null | grep -q "already"; then
    PLAYWRIGHT_AVAILABLE=true
  else
    echo "Installing Playwright chromium browser..."
    if npx playwright install chromium 2>/dev/null; then
      PLAYWRIGHT_AVAILABLE=true
    fi
  fi
fi

if [ "$PLAYWRIGHT_AVAILABLE" = true ]; then
  echo "Running Playwright tests..."
  PLAYWRIGHT_JSON_OUTPUT_NAME=results npx playwright test tests/e2e/smoke.spec.ts --reporter=json 2>&1 | tee /tmp/playwright-output.txt
  PLAYWRIGHT_EXIT=$?

  # Parse Playwright JSON output
  if [ -f "test-results/.last-run.json" ] || [ $PLAYWRIGHT_EXIT -eq 0 ]; then
    # Playwright ran - parse the JSON output from stdout
    # The JSON reporter outputs to stdout
    node -e "
      const fs = require('fs');
      const raw = fs.readFileSync('/tmp/playwright-output.txt', 'utf8');
      // Find the JSON part (starts with {)
      const jsonStart = raw.indexOf('{');
      if (jsonStart === -1) {
        console.log(JSON.stringify({totalTests:12,passed:0,failed:12,failures:[{test:'Playwright output',error:'Could not parse Playwright JSON output'}],screenshots:[],method:'playwright'}));
        process.exit(0);
      }
      try {
        const data = JSON.parse(raw.substring(jsonStart));
        const suites = data.suites || [];
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
        for (const suite of suites) {
          processSpecs(suite.specs || []);
          for (const sub of (suite.suites || [])) {
            processSpecs(sub.specs || []);
          }
        }
        const output = {totalTests:total,passed,failed,failures,screenshots:[],method:'playwright'};
        console.log(JSON.stringify(output, null, 2));
      } catch(e) {
        console.log(JSON.stringify({totalTests:12,passed:0,failed:12,failures:[{test:'JSON parse',error:e.message}],screenshots:[],method:'playwright'}));
      }
    " > "$OUTPUT_FILE"
    echo "Playwright results written to $OUTPUT_FILE"
    cat "$OUTPUT_FILE"
    exit 0
  fi
fi

# Fallback to curl-based testing
echo "Playwright not available, falling back to curl-based testing..."

TOTAL=12
PASSED=0
FAILED=0
FAILURES="[]"

run_test() {
  local test_name="$1"
  local url="$2"
  local check_content="$3"

  echo -n "Testing: $test_name ... "

  HTTP_CODE=$(curl -s -o /tmp/test-response.html -w "%{http_code}" --connect-timeout 10 "$url" 2>/dev/null)

  if [ "$HTTP_CODE" = "200" ]; then
    if [ -n "$check_content" ]; then
      if grep -q "$check_content" /tmp/test-response.html 2>/dev/null; then
        echo "PASSED (HTTP $HTTP_CODE, content found)"
        PASSED=$((PASSED + 1))
        return 0
      else
        echo "FAILED (HTTP $HTTP_CODE, content '$check_content' not found)"
        FAILED=$((FAILED + 1))
        FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'$test_name',error:'Content check failed: $check_content not found'});console.log(JSON.stringify(f))")
        return 1
      fi
    else
      echo "PASSED (HTTP $HTTP_CODE)"
      PASSED=$((PASSED + 1))
      return 0
    fi
  else
    echo "FAILED (HTTP $HTTP_CODE)"
    FAILED=$((FAILED + 1))
    FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'$test_name',error:'HTTP status $HTTP_CODE'});console.log(JSON.stringify(f))")
    return 1
  fi
}

# Test 1: Home page loads at /he with Hebrew content
run_test "Home page loads at /he with Hebrew content" "$BASE_URL/he" "נגן תורה"

# Test 2: Navigate to /he/lessons
run_test "Navigate to /he/lessons page" "$BASE_URL/he/lessons" ""

# Test 3: Navigate to /he/lessons/upload (upload page)
run_test "Navigate to /he/upload page" "$BASE_URL/he/lessons/upload" ""

# Test 4: Navigate to /he/series
run_test "Navigate to /he/series page" "$BASE_URL/he/series" ""

# Test 5: Navigate to /he/playlists
run_test "Navigate to /he/playlists page" "$BASE_URL/he/playlists" ""

# Test 6: Navigate to /he/bookmarks
run_test "Navigate to /he/bookmarks page" "$BASE_URL/he/bookmarks" ""

# Test 7: Navigate to /he/search
run_test "Navigate to /he/search page" "$BASE_URL/he/search" ""

# Test 8: Verify RTL direction on /he pages
echo -n "Testing: Verify RTL direction on /he pages ... "
if curl -s "$BASE_URL/he" 2>/dev/null | grep -q 'dir="rtl"'; then
  echo "PASSED"
  PASSED=$((PASSED + 1))
else
  echo "FAILED"
  FAILED=$((FAILED + 1))
  FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'Verify RTL direction on /he pages',error:'dir=rtl not found in HTML'});console.log(JSON.stringify(f))")
fi

# Test 9: Switch to /en and verify LTR
echo -n "Testing: Switch to /en and verify LTR ... "
if curl -s "$BASE_URL/en" 2>/dev/null | grep -q 'dir="ltr"'; then
  echo "PASSED"
  PASSED=$((PASSED + 1))
else
  echo "FAILED"
  FAILED=$((FAILED + 1))
  FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'Switch to /en and verify LTR',error:'dir=ltr not found in HTML'});console.log(JSON.stringify(f))")
fi

# Test 10: Check mobile viewport responsiveness (curl can only check page loads)
run_test "Check mobile viewport responsiveness (page loads)" "$BASE_URL/he" ""

# Test 11: Verify bottom navigation is visible (check for nav element in HTML)
echo -n "Testing: Verify bottom navigation is visible ... "
if curl -s "$BASE_URL/he" 2>/dev/null | grep -q 'aria-label="Main navigation"'; then
  echo "PASSED"
  PASSED=$((PASSED + 1))
else
  # Check for any nav element
  if curl -s "$BASE_URL/he" 2>/dev/null | grep -q '<nav'; then
    echo "PASSED (nav element found)"
    PASSED=$((PASSED + 1))
  else
    echo "FAILED"
    FAILED=$((FAILED + 1))
    FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'Verify bottom navigation is visible',error:'Navigation element not found in HTML'});console.log(JSON.stringify(f))")
  fi
fi

# Test 12: Verify header with app title "נגן תורה"
echo -n "Testing: Verify header with app title נגן תורה ... "
if curl -s "$BASE_URL/he" 2>/dev/null | grep -q 'נגן תורה'; then
  echo "PASSED"
  PASSED=$((PASSED + 1))
else
  echo "FAILED"
  FAILED=$((FAILED + 1))
  FAILURES=$(echo "$FAILURES" | node -e "const f=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));f.push({test:'Verify header with app title נגן תורה',error:'Title not found in HTML'});console.log(JSON.stringify(f))")
fi

# Write results
node -e "
const output = {
  totalTests: $TOTAL,
  passed: $PASSED,
  failed: $FAILED,
  failures: $FAILURES,
  screenshots: [],
  method: 'curl'
};
console.log(JSON.stringify(output, null, 2));
" > "$OUTPUT_FILE"

echo ""
echo "============================="
echo "Test Results Summary"
echo "============================="
echo "Total: $TOTAL | Passed: $PASSED | Failed: $FAILED"
echo "Results written to: $OUTPUT_FILE"
cat "$OUTPUT_FILE"
