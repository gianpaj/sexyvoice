# Database Backup and Restore Scripts

This directory contains scripts for backing up and restoring the Supabase database.

## Scripts

### `db_backups.sh`

Creates backups of the Supabase cloud database.

**Requirements:**
- `SUPABASE_DB_URL` environment variable must be set

**Usage:**
```bash
export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres
./scripts/db_backups.sh
```

**Output:**
Creates three backup files in the `backups/` directory with timestamp:
- `YYYY-MM-DDTHH_MM_SS_roles.sql` - Database roles
- `YYYY-MM-DDTHH_MM_SS_schema.sql` - Database schema
- `YYYY-MM-DDTHH_MM_SS_data.sql` - Database data

### `db_local_restore.sh`

Restores a backup to your local Supabase instance.

**Requirements:**
- Local Supabase must be running (`supabase start`)
- Backup files must exist in `backups/` directory

**Usage:**

Restore the most recent backup:
```bash
./scripts/db_local_restore.sh
```

Restore a specific backup by timestamp:
```bash
./scripts/db_local_restore.sh 2025-10-27T13_09_30
```

**What it does:**
1. Verifies backup files exist
2. Checks if local Supabase is running
3. Prompts for confirmation (DESTRUCTIVE operation)
4. Resets the local database
5. Restores roles, schema, and data from backup files

**Important Notes:**
- ⚠️ This will **DELETE ALL LOCAL DATA**
- The script will prompt for confirmation before proceeding
- Requires `psql` to be installed and available in PATH
- Local database URL defaults to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Complete Workflow

1. **Backup cloud database:**
   ```bash
   export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres
   ./scripts/db_backups.sh
   ```

2. **Start local Supabase (if not running):**
   ```bash
   supabase start
   ```

3. **Restore to local database:**
   ```bash
   ./scripts/db_local_restore.sh
   ```

## Troubleshooting

**"Local Supabase is not running"**
- Run `supabase start` to start the local instance

**"Backup directory 'backups' not found"**
- Run `./scripts/db_backups.sh` first to create backups

**"No backup files found"**
- Ensure you've run `db_backups.sh` successfully
- Check that files exist in the `backups/` directory

**Permission errors during role restoration**
- This is normal in local environments
- The script filters out "role already exists" warnings
- Schema and data restoration should still succeed