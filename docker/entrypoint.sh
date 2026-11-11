#!/bin/sh
# web    : apply pending migrations (idempotent, forward-only), then serve the app (the in-process job worker starts with it)
# worker : run only the dedicated job worker (for deployments that scale workers separately; set JOB_WORKER=off on web)
# migrate: apply migrations and exit
set -eu
case "${1:-web}" in
  web)     npx tsx scripts/migrate.ts && exec npx next start -H "${HOSTNAME:-0.0.0.0}" -p "${PORT:-3000}" ;;
  worker)  exec npx tsx scripts/worker.ts ;;
  migrate) exec npx tsx scripts/migrate.ts ;;
  seed)    exec npx tsx scripts/seed.ts ;;
  *)       exec "$@" ;;
esac
