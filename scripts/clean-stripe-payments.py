import pandas as pd
import sys
from datetime import datetime

# Check if command line argument is provided
if len(sys.argv) < 2:
    print("Usage: python clean-stripe-payments.py <csv_file_path>")
    sys.exit(1)

# Load CSV file from command line argument
file_path = sys.argv[1]
print(f"Loading CSV file: {file_path}")

try:
    df = pd.read_csv(file_path)
    print(f"Successfully loaded {len(df)} rows")
except FileNotFoundError:
    print(f"Error: File '{file_path}' not found")
    sys.exit(1)
except Exception as e:
    print(f"Error loading CSV file: {e}")
    sys.exit(1)

# Preview first few rows
print("\nFirst few rows:")
print(df.head())

# Clean and standardize column names
df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_').str.replace('(', '').str.replace(')', '').str.replace('utc', '')

# Convert datetime columns into Google Sheets-friendly format
datetime_columns = ['created_date_', 'refunded_date_']
for col in datetime_columns:
    if col in df.columns:
        # Handle European date format and convert to standard format
        df[col] = pd.to_datetime(df[col], errors='coerce', dayfirst=True).dt.strftime('%Y-%m-%d %H:%M:%S')

# Clean amount columns - remove commas and convert to float
amount_columns = ['amount', 'amount_refunded', 'converted_amount', 'converted_amount_refunded', 'fee', 'taxes_on_fee']
for col in amount_columns:
    if col in df.columns:
        # Replace commas with dots for decimal separator and convert to float
        df[col] = df[col].astype(str).str.replace(',', '.').str.replace('"', '')
        df[col] = pd.to_numeric(df[col], errors='coerce')

# Filter only successful payments
if 'status' in df.columns:
    initial_count = len(df)
    df = df[df['status'].str.upper() == 'PAID']
    filtered_count = len(df)
    print(f"\nFiltered from {initial_count} to {filtered_count} transactions (only 'PAID' status)")
else:
    print("\nWarning: 'status' column not found. No status filtering applied.")

# Remove refunded transactions (where amount_refunded > 0)
if 'amount_refunded' in df.columns:
    initial_count = len(df)
    df = df[df['amount_refunded'] == 0]
    filtered_count = len(df)
    print(f"Filtered from {initial_count} to {filtered_count} transactions (removed refunded payments)")

# Add calculated fields
if 'amount' in df.columns and 'fee' in df.columns:
    df['net_amount'] = df['amount'] - df['fee']

# Clean up customer email column
if 'customer_email' in df.columns:
    df['customer_email'] = df['customer_email'].str.strip().str.lower()

# Add processing date for tracking
df['processed_date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# Reorder columns for better readability
desired_order = [
    'id', 'created_date_', 'amount', 'currency', 'converted_amount', 'converted_currency',
    'fee', 'net_amount', 'customer_email', 'customer_id', 'description',
    'status', 'processed_date'
]

# Only include columns that exist in the dataframe
existing_columns = [col for col in desired_order if col in df.columns]
remaining_columns = [col for col in df.columns if col not in existing_columns]
final_columns = existing_columns + remaining_columns

df = df[final_columns]

# Save cleaned CSV
output_path = file_path.replace('.csv', '_cleaned.csv')
df.to_csv(output_path, index=False)

print(f"\nCleaned data saved to: {output_path}")
print(f"Final dataset contains {len(df)} rows and {len(df.columns)} columns")

# Print summary statistics
if 'amount' in df.columns:
    print(f"\nSummary Statistics:")
    print(f"Total amount: ${df['amount'].sum():.2f}")
    print(f"Average transaction: ${df['amount'].mean():.2f}")
    print(f"Number of unique customers: {df['customer_email'].nunique() if 'customer_email' in df.columns else 'N/A'}")

    if 'currency' in df.columns:
        print(f"Currency breakdown:")
        print(df['currency'].value_counts())
