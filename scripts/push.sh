#!/usr/bin/env bash
# Pushes committed data updates to GitHub, redacting any credentials embedded in the remote URL.
set -uo pipefail
cd "$(dirname "$0")/.."

# git prints "To https://user:TOKEN@github.com/..." on both success and failure, so filter the
# transcript rather than silencing it — errors stay readable, the token never appears.
# (before: "To https://paul:ghp_abc123@github.com/x.git"  after: "To https://***@github.com/x.git")
git push origin main 2>&1 | sed -E 's#https://[^@/[:space:]]*@#https://***@#g'
status="${PIPESTATUS[0]}"

if [ "$status" -eq 0 ]; then
  echo "Pushed. GitHub Pages will redeploy in a minute or two."
else
  echo "Push failed (exit $status). The commit is still safe in the local repo."
  echo "If this is an auth error, check the token on 'origin' has Contents: read/write and has not expired."
fi
exit "$status"
