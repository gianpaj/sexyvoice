#!/bin/bash

# Script to compare Stripe payments with Supabase credit transactions
# This script will:
# 1. Export and clean Stripe payment intents
# 2. Export and clean Supabase credit transactions
# 3. Compare both datasets and generate a report

set -e  # Exit on error

echo "=============================================================================="
echo "PAYMENT COMPARISON PIPELINE"
echo "=============================================================================="
echo ""

# Check if SUPABASE_DB_URL is set
if [ -z "$SUPABASE_DB_URL" ]; then
  echo "Error: SUPABASE_DB_URL is not set." >&2
  echo "Please set it using: export SUPABASE_DB_URL=postgresql://postgres:xxx@db.yyyy.supabase.co:5432/postgres"
  exit 1
fi

# Create backups directory if it doesn't exist
mkdir -p backups

# Generate timestamp for this run
TIMESTAMP=$(date +"%Y-%m-%dT%H_%M_%S")

echo "Starting payment comparison at ${TIMESTAMP}"
echo ""

# Step 1: Export and clean Stripe payments
echo "=============================================================================="
echo "STEP 1: EXPORTING STRIPE PAYMENTS"
echo "=============================================================================="
echo ""

FILE="stripe_payments_succeeded-${TIMESTAMP}"

STRIPE_FILE="backups/${FILE}.csv"
STRIPE_CLEANED="backups/${FILE}_cleaned.csv"

# Fetch 500 payment intents with pagination (Stripe API limit is 100 per request)
TOTAL_TO_FETCH=500
LIMIT=100
TEMP_FILE="backups/temp_stripe_${TIMESTAMP}.json"
STARTING_AFTER=""

echo "Fetching ${TOTAL_TO_FETCH} payment intents (this may take a moment)..."

# Initialize empty array for results
echo '{"data":[]}' > "$TEMP_FILE"

FETCHED=0
while [ $FETCHED -lt $TOTAL_TO_FETCH ]; do
  echo "  Fetching batch $(( FETCHED / LIMIT + 1 ))..."

  if [ -z "$STARTING_AFTER" ]; then
    # First request
    BATCH=$(stripe payment_intents list --limit $LIMIT --live)
  else
    # Subsequent requests with pagination
    BATCH=$(stripe payment_intents list --limit $LIMIT --starting-after "$STARTING_AFTER" --live)
  fi

  # Check if we got any data
  BATCH_COUNT=$(echo "$BATCH" | jq '.data | length')

  if [ "$BATCH_COUNT" -eq 0 ]; then
    echo "  No more payment intents available."
    break
  fi

  # Append to results
  if [ $FETCHED -eq 0 ]; then
    echo "$BATCH" > "$TEMP_FILE"
  else
    # Merge the data arrays
    jq -s '.[0].data + .[1].data | {data: .}' "$TEMP_FILE" <(echo "$BATCH") > "${TEMP_FILE}.tmp"
    mv "${TEMP_FILE}.tmp" "$TEMP_FILE"
  fi

  FETCHED=$((FETCHED + BATCH_COUNT))

  # Get the last item's ID for pagination
  STARTING_AFTER=$(echo "$BATCH" | jq -r '.data[-1].id')

  if [ "$STARTING_AFTER" == "null" ]; then
    break
  fi

  echo "  Fetched ${FETCHED} payment intents so far..."
done

echo "Total payment intents fetched: ${FETCHED}"

# Convert to CSV (filter for succeeded status)
cat "$TEMP_FILE" | jq -r '.data[] | select(.status == "succeeded") | [.id, .amount, .currency, .created, .customer, .description, .status] | @csv' > "$STRIPE_FILE"

# Clean up temp file
rm -f "$TEMP_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Exported Stripe payments to ${STRIPE_FILE}"
else
  echo "✗ Failed to export Stripe payments"
  exit 1
fi

python scripts/clean-stripe-payments.py "$STRIPE_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Cleaned Stripe payments saved to ${STRIPE_CLEANED}"
else
  echo "✗ Failed to clean Stripe payments"
  exit 1
fi

echo ""

# Step 2: Export and clean Supabase transactions
echo "=============================================================================="
echo "STEP 2: EXPORTING SUPABASE TRANSACTIONS"
echo "=============================================================================="
echo ""

TRANSACTIONS_FILE="backups/credit_transactions_rows-${TIMESTAMP}.csv"
TRANSACTIONS_CLEANED="backups/credit_transactions_rows-${TIMESTAMP}_cleaned.csv"

SQL_SELECT="select ct.*, p.username, p.stripe_id from public.credit_transactions ct join public.profiles p on ct.user_id = p.id order by ct.id asc nulls last"

psql $SUPABASE_DB_URL -c "COPY ($SQL_SELECT) TO STDOUT WITH CSV HEADER DELIMITER ',';" > "$TRANSACTIONS_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Exported Supabase transactions to ${TRANSACTIONS_FILE}"
else
  echo "✗ Failed to export Supabase transactions"
  exit 1
fi

python scripts/clean-transactions.py "$TRANSACTIONS_FILE"

if [ $? -eq 0 ]; then
  echo "✓ Cleaned Supabase transactions saved to ${TRANSACTIONS_CLEANED}"
else
  echo "✗ Failed to clean Supabase transactions"
  exit 1
fi

echo ""

# Step 3: Compare the datasets
echo "=============================================================================="
echo "STEP 3: COMPARING PAYMENTS"
echo "=============================================================================="
echo ""

python scripts/compare-payments.py "$STRIPE_CLEANED" "$TRANSACTIONS_CLEANED"

if [ $? -eq 0 ]; then
  echo ""
  echo "=============================================================================="
  echo "COMPARISON COMPLETE"
  echo "=============================================================================="
  echo ""
  echo "Files generated:"
  echo "  1. Stripe export:           ${STRIPE_FILE}"
  echo "  2. Stripe cleaned:          ${STRIPE_CLEANED}"
  echo "  3. Transactions export:     ${TRANSACTIONS_FILE}"
  echo "  4. Transactions cleaned:    ${TRANSACTIONS_CLEANED}"
  echo "  5. Comparison report:       backups/payment_comparison_report-TIMESTAMP.txt"
  echo "  6. Discrepancies CSV:       backups/payment_discrepancies-TIMESTAMP.csv (if found)"
  echo ""
else
  echo "✗ Failed to compare payments"
  exit 1
fi
