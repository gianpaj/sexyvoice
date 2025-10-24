# Stripe Payments Data Cleaning Script

This script cleans and standardizes Stripe payments CSV export data for easier analysis and import into other systems.

## Usage

```bash
python clean-stripe-payments.py <csv_file_path>
```

### Example

```bash
python clean-stripe-payments.py ../backups/unified_payments_success.csv
```

## What the Script Does

1. **Data Loading**: Loads the Stripe payments CSV file
2. **Column Standardization**: Cleans column names (lowercase, underscores, removes special characters)
3. **Date Formatting**: Converts datetime columns to standard format (YYYY-MM-DD HH:MM:SS)
4. **Amount Cleaning**: 
   - Converts European decimal format (commas) to standard decimal format (dots)
   - Removes quotes and converts to numeric values
5. **Filtering**:
   - Keeps only payments with "PAID" status
   - Removes refunded transactions (where amount_refunded > 0)
6. **Calculated Fields**:
   - Adds `net_amount` field (amount - fee)
   - Adds `processed_date` timestamp
7. **Email Cleaning**: Standardizes customer email addresses (lowercase, trimmed)
8. **Column Reordering**: Organizes columns in logical order for analysis

## Input CSV Format Expected

The script expects Stripe payment export CSV with columns like:
- `id` - Payment/charge ID
- `Created date (UTC)` - Payment creation date
- `Amount` - Payment amount
- `Currency` - Payment currency
- `Status` - Payment status
- `Customer Email` - Customer's email address
- `Fee` - Stripe processing fee
- And other standard Stripe export columns

## Output

Creates a cleaned CSV file with `_cleaned.csv` suffix containing:
- Standardized column names
- Properly formatted dates and amounts
- Only successful, non-refunded payments
- Additional calculated fields
- Summary statistics printed to console

## Dependencies

- pandas

Install with: `pip install pandas`

## Notes

- The script handles European number formatting (commas as decimal separators)
- Automatically filters out refunded and failed payments
- Provides summary statistics including total amounts and customer counts
- Preserves all original data while adding cleaned/calculated fields