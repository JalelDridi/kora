#!/usr/bin/env bash
# Runs every CI check in order; exits non-zero on the first failure.
set -euo pipefail
pnpm lint
pnpm format:check
pnpm exec tsc --noEmit
pnpm test
echo "all checks passed"
