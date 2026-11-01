#!/usr/bin/env bash
set -euo pipefail
# Local Supabase only; the entire SQL test rolls back its fixtures.
container_name="${SUPABASE_DB_CONTAINER:-supabase_db_sellora}"
docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/tenant-isolation.sql

docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/account-approval.sql

docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/commerce.sql

docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/team-billing.sql

docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/messaging-checkout.sql

docker exec -i "$container_name" psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/tests/ai-checkout.sql
