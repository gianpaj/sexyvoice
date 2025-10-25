#!/bin/bash

if [ -z "$SUPABASE_DB_URL" ]; then
  echo "Error: SUPABASE_DB_URL is not set." >&2
  exit 1
fi

# export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres

# Generate timestamp for backup files
TIMESTAMP=$(date +"%Y-%m-%dT%H_%M_%S")

FILE="backups/credit_transactions_rows-${TIMESTAMP}.csv"

mkdir -p backups
psql $SUPABASE_DB_URL -c "COPY (select * from public.credit_transactions order by credit_transactions.id asc nulls last) TO STDOUT WITH CSV HEADER DELIMITER ',';" > $FILE

echo "[TRANSACTIONS]: Exported credit_transactions to ${FILE}"

python scripts/clean-transactions.py ${FILE}

# python scripts/analyze-credit-transactions.py ${FILE}
