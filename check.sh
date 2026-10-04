#!/usr/bin/env bash
# Runs every CI check in order; exits non-zero on the first failure.
set -euo pipefail
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm data:check
pnpm test:db
# CIRCLE_NODE_TOTAL keeps the build to two workers on a low-memory machine.
# An empty analytics key keeps test traffic out of PostHog.
NEXT_PUBLIC_POSTHOG_KEY= CIRCLE_NODE_TOTAL=2 pnpm build
pnpm test:e2e
pnpm lighthouse
echo "all checks passed"
