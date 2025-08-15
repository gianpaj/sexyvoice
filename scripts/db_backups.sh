#!/bin/bash

# export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres

# Generate timestamp for backup files
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/roles_${TIMESTAMP}.sql" --role-only

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/schema_${TIMESTAMP}.sql"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/data_${TIMESTAMP}.sql" --data-only --use-copy


# https://github.com/sesto-dev/supabase-database-backup/blob/main/.github/workflows/backup.yaml
