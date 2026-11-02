#!/usr/bin/env bash
# Deploys Faero's error reporting and push notifications to Supabase.
# Run from the repo root:  bash scripts/deploy_functions.sh
#
# Reads secrets from files in your home folder, never from the repo:
#   ~/supabasetoken.txt              Supabase access token (sbp_…)
#   ~/faero_vapid_private.txt        push private key
#   ~/faero_vapid_public.txt         push public key (also in faero_v1_launch.html)
#   ~/faero_push_webhook_secret.txt  shared secret between database and send-push
set -euo pipefail

REF=fifnkgpxtnmjycxkkqhz
API=https://api.supabase.com/v1/projects/$REF
read_secret() { tr -d '\r\n ' < "$HOME/$1"; }
TOKEN=$(read_secret supabasetoken.txt)
VAPID_PUBLIC=$(read_secret faero_vapid_public.txt)
VAPID_PRIVATE=$(read_secret faero_vapid_private.txt)
HOOK_SECRET=$(read_secret faero_push_webhook_secret.txt)
auth=(-H "Authorization: Bearer $TOKEN")

deploy() {  # deploy <name> <verify_jwt>
  echo "Deploying $1…"
  curl -sf "${auth[@]}" -X POST "$API/functions/deploy?slug=$1" \
    -F "metadata={\"entrypoint_path\":\"index.ts\",\"name\":\"$1\",\"verify_jwt\":$2};type=application/json" \
    -F "file=@supabase/functions/$1/index.ts;filename=index.ts;type=application/typescript" >/dev/null
}
sql() {
  python -c "import json,sys;print(json.dumps({'query':sys.stdin.read()}))" \
    | curl -sf "${auth[@]}" -H "Content-Type: application/json" -X POST "$API/database/query" --data-binary @-
}

# 1. Error reporting (open endpoint by design: signed-out crashes matter most)
deploy log-error false

# 2. Push: secrets, then the function (the webhook secret is what authenticates it)
echo "Setting push secrets…"
curl -sf "${auth[@]}" -H "Content-Type: application/json" -X POST "$API/secrets" -d "[
  {\"name\":\"VAPID_PUBLIC_KEY\",\"value\":\"$VAPID_PUBLIC\"},
  {\"name\":\"VAPID_PRIVATE_KEY\",\"value\":\"$VAPID_PRIVATE\"},
  {\"name\":\"VAPID_SUBJECT\",\"value\":\"mailto:contact@unitar.app\"},
  {\"name\":\"PUSH_WEBHOOK_SECRET\",\"value\":\"$HOOK_SECRET\"}]" >/dev/null
deploy send-push false

# 3. Database: store the webhook secret in Vault, then add the trigger
echo "Storing the webhook secret in Vault…"
printf "%s" "select vault.create_secret('$HOOK_SECRET', 'push_webhook_secret')
  where not exists (select 1 from vault.secrets where name = 'push_webhook_secret');" | sql >/dev/null
echo "Running sql/12_push_webhook.sql…"
sql < sql/12_push_webhook.sql >/dev/null

# 4. Check
code() { curl -s -o /dev/null -w "%{http_code}" -X POST "https://$REF.supabase.co/functions/v1/$1" "${@:2}"; }
echo "log-error with a test report   → $(code log-error -H 'Content-Type: text/plain' -d '{"kind":"deploy-check","detail":"ok"}')  (want 204)"
echo "send-push without the secret   → $(code send-push -d '{}')  (want 403)"
echo "send-push with the secret      → $(code send-push -H "x-webhook-secret: $HOOK_SECRET" -d '{"record":{"user_id":"00000000-0000-0000-0000-000000000000","type":"like"}}')  (want 200)"
echo "Done."
