#!/usr/bin/env bash
# Vercel's build (package.json "vercel-build"), the same for Production and
# Preview, against that environment's own database. Each step runs only when
# the one before it succeeded; a failure names its step and fails the build.
set -euo pipefail

step() {
  local name="$1"
  shift
  echo "vercel-build: ${name}"
  if ! "$@"; then
    echo "vercel-build: \"${name}\" failed; nothing after it ran" >&2
    exit 1
  fi
}

# A suspended Neon compute takes seconds to start; Prisma's first connection
# gives up after five (P1001). Wait for it before anything else connects.
step "wake the database" node src/pipeline/sync-cli.ts wake
step "apply migrations" prisma migrate deploy
# data/pool.json into this environment's database, in one transaction; it
# refuses an empty or invalid pool before connecting.
step "sync data/pool.json" node src/pipeline/sync-cli.ts
# The next 30 days of Chkoun? from the secret CHKOUN_SEED (D-S2-2). Only a
# missing seed fails the build here (P50); too few eligible footballers
# write what they can and print how many days are filled. It never prints
# the seed or a footballer.
step "top up the Chkoun? calendar" node src/pipeline/sync-cli.ts calendar
step "build the app" next build
echo "vercel-build: done"
