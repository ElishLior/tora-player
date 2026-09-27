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

for env_file in .env .env.*; do
  [ -e "$env_file" ] || continue
  [ "$env_file" = .env.example ] && continue
  printf 'FAILED: Refusing to read environment file %s; run from a clean checkout instead\n' "$env_file" >&2
  exit 1
done

# npm and Next read HOME config and process environment; isolate both before any install hook runs.
checks_home=$(mktemp -d "$repo_root/.factory/.checks-home.XXXXXX") || exit 1
trap 'rm -rf "$checks_home"' 0

safe_run() {
  env -i HOME="$checks_home" PATH="$PATH" CI=true NEXT_TELEMETRY_DISABLED=1 "$@"
}

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
  safe_run npx next typegen && safe_run npm run type-check
}

run_step 'Install dependencies' safe_run npm ci
run_step 'Type-check' type_check
run_step 'Lint' safe_run npm run lint
run_step 'Unit tests' safe_run npm test
run_step 'Build' safe_run env \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-placeholder-anon-key \
  NEXT_PUBLIC_APP_URL=http://localhost:3000 \
  npm run build
