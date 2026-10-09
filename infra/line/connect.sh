#!/bin/sh
set -eu

: "${LIFF_ID:?Set LIFF_ID}"
: "${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:?Set LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}"
: "${RICH_MENU_IMAGE:?Set RICH_MENU_IMAGE to a 2500x1686 or 2500x843 JPEG or PNG}"

LIFF_URL="https://miniapp.line.me/${LIFF_ID}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MENU_JSON=$(mktemp)
trap 'rm -f "$MENU_JSON"' EXIT
sed "s|__LIFF_URL__|$LIFF_URL|g" "$SCRIPT_DIR/richmenu.template.json" > "$MENU_JSON"

curl --fail-with-body -X POST https://api.line.me/v2/bot/richmenu/validate \
  -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data-binary "@$MENU_JSON"

RICH_MENU_ID=$(curl --fail-with-body -sS -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: application/json" --data-binary "@$MENU_JSON" |
  python3 -c 'import json,sys; print(json.load(sys.stdin)["richMenuId"])')

case "$RICH_MENU_IMAGE" in *.png) CONTENT_TYPE=image/png;; *) CONTENT_TYPE=image/jpeg;; esac
curl --fail-with-body -X POST "https://api-data.line.me/v2/bot/richmenu/$RICH_MENU_ID/content" \
  -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Type: $CONTENT_TYPE" --data-binary "@$RICH_MENU_IMAGE"
curl --fail-with-body -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RICH_MENU_ID" \
  -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
  -H "Content-Length: 0" --data ''

printf '\nDefault rich menu connected: %s\n' "$RICH_MENU_ID"

if [ "${SKIP_WEBHOOK:-0}" != "1" ]; then
  : "${PUBLIC_BASE_URL:?Set PUBLIC_BASE_URL to the current public HTTPS URL, or set SKIP_WEBHOOK=1}"
  WEBHOOK_URL="${PUBLIC_BASE_URL%/}/webhooks/line"
  printf 'Connecting webhook: %s\n' "$WEBHOOK_URL"
  curl --fail-with-body -X PUT https://api.line.me/v2/bot/channel/webhook/endpoint \
    -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"endpoint\":\"$WEBHOOK_URL\"}"

  curl --fail-with-body -X POST https://api.line.me/v2/bot/channel/webhook/test \
    -H "Authorization: Bearer $LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    --data "{\"endpoint\":\"$WEBHOOK_URL\"}"
  printf '\nWebhook connected and verified.\n'
else
  printf 'Webhook setup skipped.\n'
fi
