#!/bin/bash

# export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres

# Generate timestamp for backup files
TIMESTAMP=$(date +"%Y-%m-%dT%H_%M_%S")

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/${TIMESTAMP}_roles.sql" --role-only

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/${TIMESTAMP}_schema.sql"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "backups/${TIMESTAMP}_data.sql" --data-only --use-copy


# https://github.com/sesto-dev/supabase-database-backup/blob/main/.github/workflows/backup.yaml
