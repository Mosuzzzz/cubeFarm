#!/bin/sh
set -eu

ORIGIN_URL="${ORIGIN_URL:-http://localhost:8088}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed" >&2
  exit 1
fi

echo "Starting a temporary Cloudflare Quick Tunnel to ${ORIGIN_URL}"
echo "Copy the new https://*.trycloudflare.com URL into LINE webhook and LIFF settings."
exec cloudflared tunnel --config /dev/null --no-autoupdate --url "$ORIGIN_URL"
