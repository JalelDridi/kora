#!/usr/bin/env bash
# Opens or updates the one nightly data pull request; it never merges.
# Run by the "propose" job of .github/workflows/nightly-data.yml, at the
# repository root, after the build job's data/pool.json, data/ids.json and
# data/report.md were copied over main's. Needs GH_TOKEN.
#   bash scripts/open-data-pr.sh            commit, push, open or update the pull request
#   bash scripts/open-data-pr.sh --dry-run  say what it would do; no commit, no push, no gh
# Sourced (`source scripts/open-data-pr.sh`), it only defines the functions.
set -euo pipefail

readonly branch="data/nightly"
# The id registry travels with the pool, or data:check fails on the branch.
readonly files=(data/pool.json data/ids.json data/report.md)
# GitHub refuses a description over 65,536 characters; bytes are never fewer.
readonly body_limit=65000
readonly truncated_note=$'\n\n_The report is longer than a pull request description allows; the rest is in data/report.md on this branch._'
readonly footer=$'\n\n---\nOpened by the nightly data job; it never merges by itself. How to review it: data/README.md. Corrections go in data/overrides.json on main, never on this branch, which is rebuilt every night.\n'

# The report changes every night (it carries the date); the pool and the ids
# change only when the data does.
data_changed() {
  [ -n "$(git status --porcelain -- data/pool.json data/ids.json)" ]
}

# pr_body REPORT OUT: the report, cut at a line when too long, then the footer.
pr_body() {
  local report="$1" out="$2"
  local size
  size=$(($(wc -c <"$report")))
  if [ "$size" -le $((body_limit - ${#footer})) ]; then
    cat -- "$report" >"$out"
  else
    # Whole lines only, counted in bytes, so no character is cut in half.
    LC_ALL=C awk -v max=$((body_limit - ${#footer} - ${#truncated_note})) \
      '{ n += length($0) + 1; if (n > max) exit; print }' "$report" >"$out"
    printf '%s' "$truncated_note" >>"$out"
  fi
  printf '%s' "$footer" >>"$out"
}

# close_stale DRY_RUN: tonight equals main, so an open nightly pull request
# from an earlier night is stale: close it with a comment. The branch and
# everything else stay; the next night that changes the data reopens one.
close_stale() {
  if [ "$1" = true ]; then
    echo "data unchanged: no pull request; would close an open one from ${branch}"
    return 0
  fi
  local open
  open="$(gh pr list --head "$branch" --base main --state open --json number --jq '.[].number')"
  if [ -z "$open" ]; then
    echo "data unchanged: no pull request"
    return 0
  fi
  gh pr close "$branch" --comment "Closed by the nightly data job: a later night's data equals main, so this proposal is out of date."
  echo "data unchanged: closed the stale pull request #${open}"
}

main() {
  local dry_run=false
  if [ "${1:-}" = "--dry-run" ] && [ "$#" -eq 1 ]; then
    dry_run=true
  elif [ "$#" -gt 0 ]; then
    # Anything else would fall through to the real run: commit, push, gh.
    echo "open-data-pr.sh: unknown argument: $*" >&2
    return 2
  fi
  if ! data_changed; then
    close_stale "$dry_run"
    return 0
  fi

  local title body
  title="data: nightly pool $(date -u +%F)"
  body="$(mktemp)"
  pr_body data/report.md "$body"
  if [ "$dry_run" = true ]; then
    echo "dry run: would commit ${files[*]} to ${branch} as \"${title}\" with a $(($(wc -c <"$body")))-byte description"
    return 0
  fi

  # The bot's commit carries no co-author line.
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git switch --force-create "$branch"
  git add -- "${files[@]}"
  git commit --quiet -m "$title"
  # Checkout keeps no token; gh lends GH_TOKEN to this push only.
  gh auth setup-git
  git push --force origin "$branch"

  if [ -z "$(gh pr list --head "$branch" --base main --state open --json number --jq '.[].number')" ]; then
    gh pr create --base main --head "$branch" --title "$title" --body-file "$body"
  else
    gh pr edit "$branch" --title "$title" --body-file "$body"
  fi

  # A pull request opened with the workflow's token starts no workflow; a
  # dispatch does, and its checks appear on the pull request's commit.
  gh workflow run ci.yml --ref "$branch"
  echo "pull request ready: ${branch}"
}

# `return` succeeds only in a sourced file. Comparing BASH_SOURCE with $0
# is not enough: `bash -c 'source "$0"' open-data-pr.sh` makes them equal.
if ! (return 0 2>/dev/null); then
  main "$@"
fi
