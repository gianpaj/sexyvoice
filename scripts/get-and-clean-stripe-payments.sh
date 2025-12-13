#!/bin/bash

TIMESTAMP=$(date +"%Y-%m-%dT%H_%M_%S")

# stripe login

FILE="backups/stripe_payments_succeeded-${TIMESTAMP}.csv"

echo "[PAYMENTS]: Fetching Payment Intents..."

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
cat "$TEMP_FILE" | jq -r '.data[] | select(.status == "succeeded") | [.id, .amount, .currency, .created, .customer, .description, .status] | @csv' > "$FILE"

# Clean up temp file
rm -f "$TEMP_FILE"

SUCCEEDED_COUNT=$(wc -l < "$FILE")
echo "[PAYMENTS]: Exported ${SUCCEEDED_COUNT} succeeded Payment Intents to ${FILE}"

python scripts/clean-stripe-payments.py ${FILE}
