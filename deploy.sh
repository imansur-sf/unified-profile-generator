#!/usr/bin/env bash
# ============================================================
# deploy.sh — Publish Unified Profile Generator to GitHub Pages
# ------------------------------------------------------------
# Mirrors the pattern used for the Loyalty Portal Generator:
#   Repo:  https://github.com/imansur-sf/unified-profile-generator
#   Pages: https://imansur-sf.github.io/unified-profile-generator/
#
# Prerequisites (one-time):
#   1. `gh auth refresh -h github.com`  (your token is expired)
#   2. Confirm your GitHub account:  `gh api user --jq .login`
#
# Usage:
#   cd ~/claude/unified-profile-generator
#   ./deploy.sh
# ============================================================
set -euo pipefail

REPO_OWNER="imansur-sf"
REPO_NAME="unified-profile-generator"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
PAGES_URL="https://${REPO_OWNER}.github.io/${REPO_NAME}/"

cd "$(dirname "$0")"

# 1. Freshen the standalone bundle so the repo has both the source and
#    the single-file download in sync.
python3 build-standalone.py

# 2. Make sure we're operating on a git repo rooted HERE, not on a
#    surrounding parent repo (e.g. ~/.git). Force git commands to use
#    THIS folder's git dir/work tree.
if [ ! -d ".git" ]; then
  git init -b main
fi
export GIT_DIR="$(pwd)/.git"
export GIT_WORK_TREE="$(pwd)"

# Fail loudly if the resolved top-level isn't this folder — protects
# against accidentally committing to a parent repo again.
TOPLEVEL="$(git rev-parse --show-toplevel)"
if [ "$TOPLEVEL" != "$(pwd)" ]; then
  echo "ERROR: git resolved a top-level of '$TOPLEVEL' — expected '$(pwd)'." >&2
  echo "Run 'git init -b main' here first and rerun." >&2
  exit 1
fi

# 3. Stage files (whitelist — no .DS_Store, no editor cruft)
git add \
  index.html \
  js/ \
  build-standalone.py \
  README.md \
  Unified_Profile_Generator.html \
  .gitignore

# 4. Commit if there are changes
if ! git diff --cached --quiet; then
  git commit -m "$(cat <<'EOF'
Unified Profile Generator — initial deploy

Salesforce Data Cloud unified customer profile demo builder.
Mirrors the shape of the Loyalty Portal Generator: 7-step wizard,
live preview iframe, self-contained HTML export, AI URL analysis
via shared Cloudflare Worker (with BYOK fallback).
EOF
)"
fi

# 5. Set the remote if missing
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "$REPO_URL"
fi

# 6. Create the GitHub repo if it doesn't exist yet — decouple from `git push`
#    so gh doesn't need to inspect the local .git (it uses its own filesystem
#    probe that ignores GIT_DIR overrides).
if ! gh repo view "${REPO_OWNER}/${REPO_NAME}" >/dev/null 2>&1; then
  echo "Creating ${REPO_OWNER}/${REPO_NAME} on GitHub…"
  gh repo create "${REPO_OWNER}/${REPO_NAME}" \
    --public \
    --description "Salesforce Data Cloud unified profile demo generator" \
    --homepage "${PAGES_URL}"
else
  echo "Repo already exists — will just push."
fi

# 7. Push
git push -u origin main

# 8. Turn on GitHub Pages (source = main / root)
echo "Enabling GitHub Pages…"
gh api \
  -X POST "/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
  -F "source[branch]=main" \
  -F "source[path]=/" 2>/dev/null \
  || gh api \
      -X PUT "/repos/${REPO_OWNER}/${REPO_NAME}/pages" \
      -F "source[branch]=main" \
      -F "source[path]=/"

echo ""
echo "✓ Deployed."
echo "  Repo:  https://github.com/${REPO_OWNER}/${REPO_NAME}"
echo "  Pages: ${PAGES_URL}"
echo ""
echo "Pages may take 1–2 min to build on the first push. Refresh the Pages URL."
