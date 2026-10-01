#!/usr/bin/env bash
# Deploys the frontend to Vercel production, then keeps only the newest
# $KEEP deployments (default 10) — older ones are removed.
# Usage: scripts/deploy-frontend.sh            (uses the Parvsetu Vercel login)
#        KEEP=10 VERCEL_PROFILE=~/.vercel-parvsetu scripts/deploy-frontend.sh
set -euo pipefail
KEEP="${KEEP:-10}"
PROFILE="${VERCEL_PROFILE:-$HOME/.vercel-parvsetu}"
SCOPE="${VERCEL_SCOPE:-parv-setu}"
PROJECT="${VERCEL_PROJECT:-parvsetu-web}"
cd "$(dirname "$0")/../frontend"
v() { vercel --global-config "$PROFILE" --scope "$SCOPE" "$@"; }

# Label the deployment with the commit it ships. Vercel reads this from the
# folder's git data, which it can't find in a temporary `git worktree` copy —
# without this the dashboard shows a random id instead of the message.
SHA=$(git rev-parse HEAD)
MSG=$(git log -1 --format=%s | cut -c1-200)
REF=$(git rev-parse --abbrev-ref HEAD)
[ "$REF" = "HEAD" ] && REF=main
DIRTY=$([ -n "$(git status --porcelain -- . 2>/dev/null)" ] && echo " (+ local changes)" || true)
v deploy --prod --yes \
  --meta githubCommitSha="$SHA" --meta githubCommitMessage="$MSG$DIRTY" --meta githubCommitRef="$REF" \
  --meta githubDeployment=1 --meta githubOrg=parvsetu --meta githubRepo=Web

# Newest first; unique deployment URLs only.
# Newest first; unique URLs. (Portable to macOS bash 3.2 — no mapfile.)
DEPLOYS=$(v ls "$PROJECT" 2>&1 | grep -oE "https://${PROJECT%-web}-[a-z0-9]+-${SCOPE}\.vercel\.app" | awk '!seen[$0]++')
COUNT=$(printf '%s\n' "$DEPLOYS" | grep -c . || true)
echo "Found $COUNT deployments; keeping the newest $KEEP."
printf '%s\n' "$DEPLOYS" | tail -n +"$((KEEP + 1))" | while read -r url; do
  [ -n "$url" ] || continue
  echo "Removing $url"
  v rm "$url" --yes
done
