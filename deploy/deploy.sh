#!/usr/bin/env bash
# Deploy now instead of waiting up to a minute: the container's auto-deployer pulls main from GitHub,
# so this only checks that main is pushed and then triggers it.  Needs deploy/local.env.
#   ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f deploy/local.env ] || { echo "Create deploy/local.env first (see deploy/local.env.example)"; exit 1; }
# shellcheck disable=SC1091
source deploy/local.env
git fetch --quiet origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD isn't what's on origin/main. Commit and 'git push' first; the server deploys from GitHub."; exit 1
fi
ssh "$DEPLOY_HOST" "pct exec $DEPLOY_CT -- sh -c 'systemctl start jazz-autodeploy.service; journalctl -u jazz-autodeploy.service -n 4 --no-pager -o cat'" 2>&1 | grep -v '^locale:'
LIVE="$(curl -fsS "$SITE_URL/version.json?t=$(date +%s)" | sed -E 's/.*"commit":"([0-9a-f]+)".*/\1/')"
if [ "$LIVE" = "$(git rev-parse --short=7 HEAD)" ]; then echo "Live: $SITE_URL (version $LIVE)"
else echo "Deploy FAILED: $SITE_URL is still on $LIVE (see the log above)"; exit 1; fi
