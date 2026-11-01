#!/usr/bin/env bash
set -euo pipefail
# Explicitly targets an isolated test container, never a configured production DB.
container_name="sellora-test-db"
test_database="sellora_check_$$"
docker exec "$container_name" createdb -U postgres "$test_database"
trap 'docker exec "$container_name" dropdb -U postgres "$test_database"' EXIT
docker exec -i "$container_name" psql -U postgres -d "$test_database" -v ON_ERROR_STOP=1 < scripts/test-bootstrap.sql
for migration in supabase/migrations/*.sql; do
 docker exec -i "$container_name" psql -U postgres -d "$test_database" -v ON_ERROR_STOP=1 < "$migration"
done
docker exec -i "$container_name" psql -U postgres -d "$test_database" -v ON_ERROR_STOP=1 < supabase/tests/tenant-isolation.sql
