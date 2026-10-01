#!/usr/bin/env bash
# Commits and pushes the current data/ to GitHub, working in a throwaway clone outside the
# Cowork mount (the mount cannot unlink files, so git can only ever make one commit there).
set -uo pipefail

repo="$(cd "$(dirname "$0")/.." && pwd)"
creds="$repo/.gitcreds"
remote="https://github.com/ZW-PaulWang/court_tracking.git"

if [ ! -f "$creds" ]; then
  echo "No $repo/.gitcreds — cannot authenticate."
  echo "Create it with a line like: https://USERNAME:TOKEN@github.com"
  exit 2
fi

# Git reads the credentials file itself; the token is never echoed, interpolated or logged.
helper="store --file=$creds"
work="$(mktemp -d)"   # lands in the sandbox's own filesystem, where git works normally
trap 'rm -rf "$work"' EXIT

echo "Cloning $remote …"
if ! git -c credential.helper="$helper" clone -q "$remote" "$work/repo" 2>&1 | sed -E 's#https://[^@/[:space:]]*@#https://***@#g'; then
  echo "Clone failed. Check the token in .gitcreds has Contents: read/write and has not expired."
  exit 1
fi

# 0. Copy the working files over, skipping the local git state and build output.
for f in index.html README.md requirements.txt .gitignore; do
  [ -f "$repo/$f" ] && cp "$repo/$f" "$work/repo/$f"
done
mkdir -p "$work/repo/data" "$work/repo/scripts" "$work/repo/.github/workflows"
cp "$repo"/data/*.json           "$work/repo/data/"            2>/dev/null
# Copy scripts/ as a tree, so subdirectories like scripts/scrape/ are not silently dropped.
cp -R "$repo"/scripts/.            "$work/repo/scripts/"        2>/dev/null
cp "$repo"/.github/workflows/*.yml "$work/repo/.github/workflows/" 2>/dev/null

cd "$work/repo"
git config user.name  "court-watch"
git config user.email "pawang@hbs.edu"
git add -A

if git diff --staged --quiet; then
  echo "No change since the last push — nothing to do."
  exit 0
fi

git -c commit.gpgsign=false commit -q -m "Refresh court availability ($(date '+%Y-%m-%d %H:%M'))"
echo "Pushing …"
git -c credential.helper="$helper" push -q origin HEAD:main 2>&1 | sed -E 's#https://[^@/[:space:]]*@#https://***@#g'
status="${PIPESTATUS[0]}"

if [ "$status" -eq 0 ]; then
  echo "Pushed. GitHub Pages redeploys in a minute or two."
else
  echo "Push failed (exit $status). Nothing was lost — data/ in the Claude folder is still current."
fi
exit "$status"
