#!/bin/sh
set -u

if [ "$#" -ne 0 ]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 2
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P) || {
  status=$?
  printf 'FAILED: Locate repository root (exit %s)\n' "$status" >&2
  exit "$status"
}
cd -- "$repo_root" || {
  status=$?
  printf 'FAILED: Enter repository root (exit %s)\n' "$status" >&2
  exit "$status"
}

export CI=true
export NEXT_TELEMETRY_DISABLED=1

run_step() {
  step_name=$1
  shift

  printf '\n==> %s\n' "$step_name"
  if "$@"; then
    return 0
  else
    status=$?
    printf 'FAILED: %s (exit %s)\n' "$step_name" "$status" >&2
    exit "$status"
  fi
}

type_check() {
  npx next typegen && npm run type-check
}

run_step 'Install dependencies' npm ci
run_step 'Type-check' type_check
run_step 'Lint' npm run lint
run_step 'Unit tests' npm test
run_step 'Build' env \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key \
  NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  npm run build
