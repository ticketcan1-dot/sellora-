#!/usr/bin/env bash
set -euo pipefail
# Local Supabase only; the entire SQL test rolls back its fixtures.
container_name="${SUPABASE_DB_CONTAINER:-supabase_db_sellora}"
docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/tenant-isolation.sql
