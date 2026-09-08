#!/usr/bin/env sh
set -eu
PROFILE=""
if [ "${1:-}" = "--full" ]; then PROFILE="--profile full"; fi
if [ ! -f .env ]; then cp .env.example .env; fi
docker compose $PROFILE up --build -d
docker compose ps
