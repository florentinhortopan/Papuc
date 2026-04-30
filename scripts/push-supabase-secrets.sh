#!/usr/bin/env bash
# Push Edge Function secrets to Supabase from supabase/.env.local
# Usage:
#   supabase login
#   supabase link --project-ref <ref>
#   ./scripts/push-supabase-secrets.sh
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/supabase/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

echo "Pushing secrets from $ENV_FILE to Supabase…"
supabase secrets set --env-file "$ENV_FILE"
echo "Done. Verify with: supabase secrets list"
