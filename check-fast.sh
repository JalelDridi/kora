#!/usr/bin/env bash
# The quick checks: everything in check.sh except the build, the browser
# tests and Lighthouse. Run it before every commit; run check.sh before
# every push. Exits non-zero on the first failure.
set -euo pipefail
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm data:check
pnpm test:db
echo "fast checks passed"
