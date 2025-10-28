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
    # Read CSV with explicit column names since the Stripe CLI export doesn't include headers
    df = pd.read_csv(
        file_path,
        header=None,
        names=['id', 'amount', 'currency', 'created', 'customer', 'description', 'status']
    )
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

# Convert Unix timestamp to ISO date format
if 'created' in df.columns:
    # Convert Unix timestamp (seconds) to datetime
    df['created_date'] = pd.to_datetime(df['created'], unit='s', errors='coerce')
    # Format as ISO 8601 string
    df['created_date_iso'] = df['created_date'].dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    # Also keep a human-readable format
    df['created_date_readable'] = df['created_date'].dt.strftime('%Y-%m-%d %H:%M:%S')
    print(f"\nConverted {df['created'].count()} Unix timestamps to ISO dates")

# Convert amount from cents to dollars
if 'amount' in df.columns:
    df['amount_dollars'] = df['amount'] / 100
    print(f"Converted amounts from cents to dollars")

# Clean up description column (handle empty values)
if 'description' in df.columns:
    df['description'] = df['description'].fillna('').str.strip()

# Filter only successful payments (should already be filtered, but double-check)
if 'status' in df.columns:
    initial_count = len(df)
    df = df[df['status'].str.lower() == 'succeeded']
    filtered_count = len(df)
    print(f"\nFiltered from {initial_count} to {filtered_count} transactions (only 'succeeded' status)")
else:
    print("\nWarning: 'status' column not found. No status filtering applied.")

# Add processing metadata
df['processed_date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

# Reorder columns for better readability
desired_order = [
    'id',
    'created_date_iso',
    'created_date_readable',
    'amount_dollars',
    'amount',
    'currency',
    'customer',
    'description',
    'status',
    'processed_date'
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
if 'amount_dollars' in df.columns:
    print(f"\nSummary Statistics:")
    print(f"Total amount: ${df['amount_dollars'].sum():,.2f}")
    print(f"Average transaction: ${df['amount_dollars'].mean():,.2f}")
    print(f"Min transaction: ${df['amount_dollars'].min():,.2f}")
    print(f"Max transaction: ${df['amount_dollars'].max():,.2f}")

    if 'customer' in df.columns:
        print(f"Number of unique customers: {df['customer'].nunique()}")

    if 'currency' in df.columns:
        print(f"\nCurrency breakdown:")
        print(df['currency'].value_counts())

    if 'created_date' in df.columns:
        print(f"\nDate range:")
        print(f"First transaction: {df['created_date'].min()}")
        print(f"Last transaction: {df['created_date'].max()}")
