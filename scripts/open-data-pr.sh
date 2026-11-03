#!/usr/bin/env bash
# Opens or updates the one nightly data pull request; it never merges it
# itself. Run by the "propose" job of .github/workflows/nightly-data.yml, at
# the repository root, after the build job's data/pool.json, data/ids.json
# and data/report.md were copied over main's. Needs GH_TOKEN.
# MERGE_WHEN_GREEN=1 (the admin dashboard's Rebuild now) turns GitHub
# auto-merge on for the pull request, so GitHub merges it once CI passes,
# but only when main requires the status check `check`: auto-merge waits
# for required checks alone, so without one GitHub would merge at once,
# before CI. Any other night turns it off, before the push, so a scheduled
# night waits for review.
#   bash scripts/open-data-pr.sh            commit, push, open or update the pull request
#   bash scripts/open-data-pr.sh --dry-run  say what it would do; no commit, no push, and
#                                           no gh but the two reads of main's rules
# Sourced (`source scripts/open-data-pr.sh`), it only defines the functions.
set -euo pipefail

readonly branch="data/nightly"
# The id registry travels with the pool, or data:check fails on the branch;
# the copied photos (P30) travel with the pool that points at them.
readonly files=(data/pool.json data/ids.json data/report.md public/photos)
# GitHub refuses a description over 65,536 characters; bytes are never fewer.
readonly body_limit=65000
readonly truncated_note=$'\n\n_The report is longer than a pull request description allows; the rest is in data/report.md on this branch._'
readonly merge_when_green="${MERGE_WHEN_GREEN:-}"
if [ "$merge_when_green" = 1 ]; then
  readonly opened_by="Opened by Rebuild now on the admin dashboard; it merges by itself once CI passes."
else
  readonly opened_by="Opened by the nightly data job; it never merges by itself."
fi
readonly footer=$'\n\n---\n'"${opened_by}"$' How to review it: data/README.md. Corrections go in data/overrides.json on main, never on this branch, which is rebuilt every night.\n'

# The report changes every night (it carries the date); the pool, the ids
# and the photos change only when the data does.
data_changed() {
  [ -n "$(git status --porcelain -- data/pool.json data/ids.json public/photos)" ]
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

readonly no_required_check="main has no required check: auto-merge left off"

# main_requires_check: whether main requires the status check `check`,
# from its rulesets or its classic protection. A read that fails (a 404:
# no protection; a 403: the workflow's token may not read it) counts as
# no; so auto-merge stays off, the safe side.
main_requires_check() {
  local rules protection
  rules="$(gh api 'repos/{owner}/{repo}/rules/branches/main' \
    --jq '[.[] | select(.type == "required_status_checks") | .parameters.required_status_checks[]?.context] | any(. == "check")' \
    2>/dev/null || true)"
  [ "$rules" = true ] && return 0
  protection="$(gh api 'repos/{owner}/{repo}/branches/main/protection' \
    --jq '[(.required_status_checks.contexts // [])[], ((.required_status_checks.checks // [])[] | .context)] | any(. == "check")' \
    2>/dev/null || true)"
  [ "$protection" = true ]
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
  # Arm auto-merge only for a dashboard rebuild, and only when GitHub
  # will wait for CI before merging.
  local arm=false
  if [ "$merge_when_green" = 1 ] && main_requires_check; then
    arm=true
  fi
  if [ "$dry_run" = true ]; then
    echo "dry run: would commit ${files[*]} to ${branch} as \"${title}\" with a $(($(wc -c <"$body")))-byte description"
    if [ "$arm" = true ]; then
      echo "dry run: would enable auto-merge (squash)"
    elif [ "$merge_when_green" = 1 ]; then
      echo "$no_required_check"
    else
      echo "dry run: would turn auto-merge off"
    fi
    return 0
  fi

  # The bot's commit carries no co-author line.
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  git switch --force-create "$branch"
  # A night with no photo yet: git add refuses a path that does not exist.
  mkdir -p public/photos
  git add -- "${files[@]}"
  git commit --quiet -m "$title"
  # Checkout keeps no token; gh lends GH_TOKEN to this push only.
  gh auth setup-git
  if [ "$arm" = false ]; then
    # Before the push: no head is ever pushed while an earlier rebuild's
    # auto-merge is still on. No pull request, or off already, is fine.
    gh pr merge "$branch" --disable-auto || true
  fi
  git push --force origin "$branch"

  if [ -z "$(gh pr list --head "$branch" --base main --state open --json number --jq '.[].number')" ]; then
    gh pr create --base main --head "$branch" --title "$title" --body-file "$body"
  else
    gh pr edit "$branch" --title "$title" --body-file "$body"
  fi

  # A pull request opened with the workflow's token starts no workflow; a
  # dispatch does, and its checks appear on the pull request's commit.
  gh workflow run ci.yml --ref "$branch"
  if [ "$arm" = true ]; then
    # GitHub merges it once CI's required check passes. Refused when the
    # repository's "Allow auto-merge" setting is off: the job fails and
    # says so.
    gh pr merge "$branch" --auto --squash
    echo "pull request ready: ${branch}, auto-merge on"
  else
    if [ "$merge_when_green" = 1 ]; then
      echo "$no_required_check"
    fi
    echo "pull request ready: ${branch}"
  fi
}

# `return` succeeds only in a sourced file. Comparing BASH_SOURCE with $0
# is not enough: `bash -c 'source "$0"' open-data-pr.sh` makes them equal.
if ! (return 0 2>/dev/null); then
  main "$@"
fi
