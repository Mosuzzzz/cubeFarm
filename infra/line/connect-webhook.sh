#!/bin/sh
set -eu

: "${LINE_MESSAGING_CHANNEL_ACCESS_TOKEN:?Set LINE_MESSAGING_CHANNEL_ACCESS_TOKEN}"
: "${PUBLIC_BASE_URL:?Set PUBLIC_BASE_URL to the current public HTTPS URL}"

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
