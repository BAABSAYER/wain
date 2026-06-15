#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Replace the baked NEXT_PUBLIC_API_URL inside an ALREADY-BUILT web/admin
# bundle with `/api` (or any other URL). Lets you recover from a botched URL
# bake WITHOUT running another 20-min `next build` on a small droplet.
#
# Usage:    bash scripts/patch-baked-url.sh [OLD_URL] [NEW_URL]
# Default:  detects every absolute http(s) URL ending in /api inside the
#           bundles and replaces it with /api (the new relative default).
#
# Safe to re-run; idempotent if the bundles already use the target URL.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

NEW_URL="${2:-/api}"
SERVICES=(admin web)

for SVC in "${SERVICES[@]}"; do
  echo
  echo "── $SVC ──"
  if ! docker compose ps "$SVC" --status running -q | grep -q .; then
    echo "  (container not running; skipping)"
    continue
  fi

  # Detect what's currently baked unless OLD_URL was passed explicitly.
  OLD_URL="${1:-}"
  if [ -z "$OLD_URL" ]; then
    OLD_URL=$(docker compose exec -T "$SVC" sh -c \
      "grep -rho 'https\\?://[a-zA-Z0-9.:_-]*/api' /app/apps/$SVC/.next 2>/dev/null | sort -u | head -1" || true)
  fi

  if [ -z "$OLD_URL" ]; then
    echo "  no absolute /api URL found in the bundle — nothing to do."
    continue
  fi

  echo "  baked URL : $OLD_URL"
  echo "  target    : $NEW_URL"

  if [ "$OLD_URL" = "$NEW_URL" ]; then
    echo "  already correct; skipping."
    continue
  fi

  docker compose exec -T "$SVC" sh -c "
    set -e
    cd /app/apps/$SVC/.next
    files=\$(grep -rl -- '$OLD_URL' . 2>/dev/null || true)
    if [ -z \"\$files\" ]; then
      echo '  no files matched (already patched?)'
      exit 0
    fi
    echo \"\$files\" | xargs sed -i 's|$OLD_URL|$NEW_URL|g'
    echo \"  patched \$(echo \"\$files\" | wc -l) files\"
  "
done

echo
echo "── restart so the new chunks are served ──"
docker compose restart admin web

echo
echo "── verify ──"
for SVC in "${SERVICES[@]}"; do
  echo -n "$SVC: "
  docker compose exec -T "$SVC" sh -c \
    "grep -rho 'https\\?://[a-zA-Z0-9.:_-]*/api\\|/api' /app/apps/$SVC/.next 2>/dev/null | sort -u | head"
done

echo
echo "✅ Done. Hard-refresh your browser tab; the bundle now calls $NEW_URL."
