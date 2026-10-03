#!/usr/bin/env bash
# Install a checkout of this repo into the app container. Runs as root inside the container
# (called by jazz-autodeploy, see deploy/autodeploy.sh). Idempotent; only reloads what changed.
#   install.sh <checkout-dir> <commit-sha>
set -euo pipefail
SRC="${1:?usage: install.sh <checkout-dir> <commit-sha>}"; SHA="${2:-unknown}"
SITE=/opt/jazz-piano
changed() { ! cmp -s "$1" "$2"; }

# 1. static site, swapped in atomically
rm -rf "$SITE.new" && mkdir -p "$SITE.new"
cp -R "$SRC/index.html" "$SRC/css" "$SRC/js" "$SITE.new/"
printf '{"commit":"%s","dirty":false,"builtAt":"%s"}\n' "${SHA:0:7}" "$(date -u +%FT%TZ)" > "$SITE.new/version.json"
# load css/js through a per-commit URL prefix (nginx maps /v/<commit>/x to /x) so browsers never run stale code
sed -i -e "s#href=\"css/app.css\"#href=\"v/${SHA:0:7}/css/app.css\"#" -e "s#src=\"js/app.js\"#src=\"v/${SHA:0:7}/js/app.js\"#" "$SITE.new/index.html"
chmod -R a+rX,go-w "$SITE.new"
rm -rf "$SITE.old"; if [ -d "$SITE" ]; then mv "$SITE" "$SITE.old"; fi
mv "$SITE.new" "$SITE"

# 2. feedback API
id jazzfb >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin jazzfb
install -D -m 644 "$SRC/server/feedback_api.py" /opt/jazz-feedback/feedback_api.py
reload=false
for unit in jazz-feedback.service jazz-autodeploy.service jazz-autodeploy.timer; do
  if changed "$SRC/deploy/$unit" "/etc/systemd/system/$unit"; then install -m 644 "$SRC/deploy/$unit" "/etc/systemd/system/$unit"; reload=true; fi
done
$reload && systemctl daemon-reload
systemctl enable --quiet jazz-feedback.service jazz-autodeploy.timer
systemctl restart jazz-feedback.service
systemctl start jazz-autodeploy.timer

# 3. the auto-deployer itself
if changed "$SRC/deploy/autodeploy.sh" /usr/local/sbin/jazz-autodeploy; then install -m 755 "$SRC/deploy/autodeploy.sh" /usr/local/sbin/jazz-autodeploy; fi

# 4. nginx (keeps the previous config if the new one doesn't validate)
if changed "$SRC/deploy/nginx-jazz.conf" /etc/nginx/sites-available/jazz; then
  cp /etc/nginx/sites-available/jazz /etc/nginx/sites-available/jazz.prev 2>/dev/null || true
  install -m 644 "$SRC/deploy/nginx-jazz.conf" /etc/nginx/sites-available/jazz
  ln -sf /etc/nginx/sites-available/jazz /etc/nginx/sites-enabled/jazz
  rm -f /etc/nginx/sites-enabled/default
  if ! nginx -t 2>/dev/null; then
    echo "nginx config invalid; keeping the previous one" >&2
    cp /etc/nginx/sites-available/jazz.prev /etc/nginx/sites-available/jazz
    if [ -d "$SITE.old" ]; then rm -rf "$SITE" && mv "$SITE.old" "$SITE"; fi
    exit 1
  fi
  systemctl reload nginx
fi

# 5. health check; put the previous site back if it fails
sleep 1
if curl -fsS -o /dev/null http://127.0.0.1:8080/ && curl -fsS -o /dev/null "http://127.0.0.1:8080/v/${SHA:0:7}/js/app.js" && curl -fsS -o /dev/null "http://127.0.0.1:8080/api/feedback/status?ids="; then
  rm -rf "$SITE.old"; echo "installed ${SHA:0:7}"
else
  echo "health check failed; restoring the previous site" >&2
  if [ -d "$SITE.old" ]; then rm -rf "$SITE" && mv "$SITE.old" "$SITE"; fi
  exit 1
fi
