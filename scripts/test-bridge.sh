#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-http://localhost:4000}"
hdr=(-H 'x-actor-roles: platform.admin' -H 'x-bridge-envelope: 1')
health=$(curl -fsS "$BASE_URL/health")
echo "$health" | grep -q healthy
tenants=$(curl -fsS "${hdr[@]}" "$BASE_URL/api/tenants")
tenant=$(echo "$tenants" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
apps=$(curl -fsS "${hdr[@]}" -H "x-tenant-id: $tenant" "$BASE_URL/api/apps")
echo "$apps" | grep -q wordpress
echo "PASS basic linux smoke against $BASE_URL"
