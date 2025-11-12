#!/bin/bash

# Script to restore Supabase cloud database backups to local Supabase instance
# Usage: ./db_local_restore.sh [backup_timestamp]
# Example: ./db_local_restore.sh 2025-10-27T13_09_30
# If no timestamp provided, will use the most recent backup

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default local database URL
LOCAL_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Backup directory
BACKUP_DIR="backups"

# Function to print colored messages
print_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
  print_error "Backup directory '$BACKUP_DIR' not found."
  print_info "Please run ./db_backups.sh first to create backups."
  exit 1
fi

# Determine which backup to restore
if [ -z "$1" ]; then
  # Find the most recent backup by timestamp
  TIMESTAMP=$(ls -t "$BACKUP_DIR" | grep "_schema.sql$" | head -1 | sed 's/_schema.sql$//')
  if [ -z "$TIMESTAMP" ]; then
    print_error "No backup files found in '$BACKUP_DIR'."
    exit 1
  fi
  print_info "No timestamp provided. Using most recent backup: $TIMESTAMP"
else
  TIMESTAMP="$1"
  print_info "Using provided backup timestamp: $TIMESTAMP"
fi

# Define backup file paths
ROLES_FILE="$BACKUP_DIR/${TIMESTAMP}_roles.sql"
SCHEMA_FILE="$BACKUP_DIR/${TIMESTAMP}_schema.sql"
DATA_FILE="$BACKUP_DIR/${TIMESTAMP}_data.sql"

# Verify all required backup files exist
if [ ! -f "$ROLES_FILE" ]; then
  print_error "Roles backup file not found: $ROLES_FILE"
  exit 1
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  print_error "Schema backup file not found: $SCHEMA_FILE"
  exit 1
fi

if [ ! -f "$DATA_FILE" ]; then
  print_error "Data backup file not found: $DATA_FILE"
  exit 1
fi

print_info "Found all backup files:"
print_info "  - Roles: $ROLES_FILE"
print_info "  - Schema: $SCHEMA_FILE"
print_info "  - Data: $DATA_FILE"

# Check if local Supabase is running
print_info "Checking if local Supabase is running..."
if ! supabase status > /dev/null 2>&1; then
  print_error "Local Supabase is not running."
  print_info "Please start it with: supabase start"
  exit 1
fi

print_info "Local Supabase is running."

# Confirmation prompt
print_warning "This will RESET your local database and restore from backup."
print_warning "All current local data will be LOST."
read -p "Do you want to continue? (yes/no): " -r
echo
if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
  print_info "Restore cancelled."
  exit 0
fi

# Reset local database
print_info "Resetting local database..."
supabase db reset --local

# Wait a moment for database to be ready
sleep 2

# Restore roles (optional, may have permission issues in local env)
print_info "Restoring roles..."
psql "$LOCAL_DB_URL" -f "$ROLES_FILE" 2>&1 | grep -v "role .* already exists" || true

# Restore schema
print_info "Restoring schema..."
psql "$LOCAL_DB_URL" -f "$SCHEMA_FILE"

# Restore data
print_info "Restoring data..."
psql "$LOCAL_DB_URL" -f "$DATA_FILE"

print_info "${GREEN}✓ Database restore completed successfully!${NC}"
print_info ""
print_info "Local database is now restored with backup from: $TIMESTAMP"
print_info "Database URL: $LOCAL_DB_URL"
