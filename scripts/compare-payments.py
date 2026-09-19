import pandas as pd
import sys
from datetime import datetime

def load_csv(file_path: str, file_type: str):
    """Load CSV file with error handling"""
    print(f"Loading {file_type} from: {file_path}")
    try:
        df = pd.read_csv(file_path)
        print(f"  ✓ Successfully loaded {len(df)} rows")
        return df
    except FileNotFoundError:
        print(f"  ✗ Error: File '{file_path}' not found")
        sys.exit(1)
    except Exception as e:
        print(f"  ✗ Error loading CSV file: {e}")
        sys.exit(1)

def main():
    # Check if command line arguments are provided
    if len(sys.argv) < 3:
        print("Usage: python compare-payments.py <stripe_cleaned.csv> <transactions_cleaned.csv>")
        print("\nExample:")
        print("  python compare-payments.py \\")
        print("    backups/stripe_payments_succeeded-2025-10-25T15_07_45_cleaned.csv \\")
        print("    backups/credit_transactions_rows-2025-10-25T15_07_45_cleaned.csv")
        sys.exit(1)

    stripe_file = sys.argv[1]
    transactions_file = sys.argv[2]

    # Load both CSV files
    print("=" * 80)
    print("LOADING DATA")
    print("=" * 80)

    stripe_df = load_csv(stripe_file, "Stripe payments")
    transactions_df = load_csv(transactions_file, "Supabase transactions")

    print("\n" + "=" * 80)
    print("DATA OVERVIEW")
    print("=" * 80)

    print("\nStripe Payments:")
    print(f"  Total records: {len(stripe_df)}")
    if 'amount_dollars' in stripe_df.columns:
        print(f"  Total amount: ${stripe_df['amount_dollars'].sum():,.2f}")
        print(f"  Date range: {stripe_df['created_date_readable'].min()} to {stripe_df['created_date_readable'].max()}")

    print("\nSupabase Transactions:")
    print(f"  Total records: {len(transactions_df)}")
    if 'amount' in transactions_df.columns:
        print(f"  Total credits: {transactions_df['amount'].sum():,}")
    if 'dollarAmount' in transactions_df.columns:
        total_dollars = transactions_df['dollarAmount'].sum()
        print(f"  Total amount: ${total_dollars:,.2f}" if pd.notna(total_dollars) else "  Total amount: N/A")

    # Prepare data for comparison
    print("\n" + "=" * 80)
    print("PREPARING COMPARISON")
    print("=" * 80)

    # Get transactions with reference_id (these should match Stripe payments)
    transactions_with_ref = transactions_df[transactions_df['reference_id'].notna()].copy()
    print(f"\nTransactions with reference_id: {len(transactions_with_ref)}")

    # Get transactions WITHOUT reference_id
    transactions_without_ref = transactions_df[transactions_df['reference_id'].isna()].copy()
    if len(transactions_without_ref) > 0:
        print(f"⚠️  Transactions WITHOUT reference_id: {len(transactions_without_ref)}")
    else:
        print("✓ All transactions have reference_id")

    # Check for duplicates in both datasets
    print("\nChecking for duplicates...")

    # Check for duplicate reference_ids in Supabase
    supabase_duplicates = transactions_with_ref[transactions_with_ref.duplicated(subset=['reference_id'], keep=False)].copy()
    if len(supabase_duplicates) > 0:
        print(f"  ⚠️  Found {len(supabase_duplicates)} duplicate reference_ids in Supabase data")
    else:
        print("  ✓ No duplicate reference_ids in Supabase data")

    # Report duplicates if found
    if len(supabase_duplicates) > 0:
        print("\n" + "=" * 80)
        print("DUPLICATE DETECTION")
        print("=" * 80)

        if len(supabase_duplicates) > 0:
            print(f"\n⚠️  DUPLICATE REFERENCE_IDS IN SUPABASE")  # noqa: F541
            print("-" * 80)
            print(f"Found {len(supabase_duplicates)} duplicate records for {len(supabase_duplicates) // 2} unique reference IDs")

            # Group by reference_id to show duplicates together
            supabase_dup_sorted = supabase_duplicates.sort_values('created_at', ascending=False)

            for ref_id in supabase_dup_sorted['reference_id'].unique():
                dups = supabase_dup_sorted[supabase_dup_sorted['reference_id'] == ref_id]
                print(f"\n  Reference ID: {ref_id} (appears {len(dups)} times)")
                for idx, row in dups.iterrows():
                    print(f"    • Amount: {row.get('amount', 'N/A')} credits")
                    if 'dollarAmount' in row and pd.notna(row['dollarAmount']):
                        print(f"      Dollar amount: ${row['dollarAmount']:.2f}")
                    print(f"      Date: {row.get('created_at', 'N/A')}")
                    print(f"      User: {row.get('username', 'N/A')}")
                    print(f"      Transaction ID: {row.get('id', 'N/A')}")

    # Report transactions without reference_id
    if len(transactions_without_ref) > 0:
        print("\n" + "=" * 80)
        print("TRANSACTIONS WITHOUT REFERENCE_ID")
        print("=" * 80)

        print(f"\n⚠️  Found {len(transactions_without_ref)} Supabase transaction(s) WITHOUT reference_id")
        print("-" * 80)
        print("These transactions cannot be matched to Stripe payments.\n")

        # Sort by date, most recent first
        no_ref_sorted = transactions_without_ref.sort_values('created_at', ascending=False)

        for _, row in no_ref_sorted.iterrows():
            print(f"    • Transaction ID: {row.get('id', 'N/A')}")
            print(f"      Amount: {row.get('amount', 'N/A')} credits")
            if 'dollarAmount' in row and pd.notna(row['dollarAmount']):
                print(f"      Dollar amount: ${row['dollarAmount']:.2f}")
            print(f"      Date: {row.get('created_at', 'N/A')}")
            print(f"      User: {row.get('username', 'N/A')}")
            print(f"      Type: {row.get('type', 'N/A')}")
            print(f"      Description: {row.get('description', 'N/A')}")
            print(f"      ⚠️  No reference_id - cannot match to Stripe payment")  # noqa: F541
            print()

    # Start comparison
    print("\n" + "=" * 80)
    print("MISMATCH ANALYSIS")
    print("=" * 80)

    # 1. Find Stripe payments NOT in Supabase transactions
    print("\n1. STRIPE PAYMENTS NOT IN SUPABASE")
    print("-" * 80)

    stripe_ids = set(stripe_df['id'])
    transaction_refs = set(transactions_with_ref['reference_id'].dropna())

    missing_in_supabase = stripe_ids - transaction_refs

    if missing_in_supabase:
        print(f"  ⚠️  Found {len(missing_in_supabase)} Stripe payments NOT recorded in Supabase:")
        missing_df = stripe_df[stripe_df['id'].isin(missing_in_supabase)].copy()
        # Sort by date, most recent first
        if 'created_date_readable' in missing_df.columns:
            missing_df = missing_df.sort_values('created_date_readable', ascending=False)
        elif 'created_date_iso' in missing_df.columns:
            missing_df = missing_df.sort_values('created_date_iso', ascending=False)

        for _, row in missing_df.iterrows():
            print(f"    • {row['id']}")
            print(f"      Amount: ${row['amount_dollars']:.2f} {row['currency'].upper()}")
            print(f"      Date: {row['created_date_readable']}")
            print(f"      Customer: {row['customer']}")
            if pd.notna(row['description']) and row['description']:
                print(f"      Description: {row['description']}")
            print()
    else:
        print("  ✓ All Stripe payments are recorded in Supabase")

    # 2. Find Supabase transactions NOT in Stripe
    print("\n2. SUPABASE TRANSACTIONS NOT IN STRIPE")
    print("-" * 80)

    missing_in_stripe = transaction_refs - stripe_ids

    if missing_in_stripe:
        print(f"  ⚠️  Found {len(missing_in_stripe)} Supabase transactions NOT found in Stripe:")
        missing_trans_df = transactions_with_ref[transactions_with_ref['reference_id'].isin(missing_in_stripe)].copy()
        # Sort by date, most recent first
        missing_trans_df = missing_trans_df.sort_values('created_at', ascending=False)

        for _, row in missing_trans_df.iterrows():
            print(f"    • {row['reference_id']}")
            print(f"      Amount: {row['amount']} credits")
            if 'dollarAmount' in row and pd.notna(row['dollarAmount']):
                print(f"      Dollar amount: ${row['dollarAmount']:.2f}")
            print(f"      Date: {row['created_at']}")
            print(f"      User: {row['username']} (stripe_id: {row.get('stripe_id', 'N/A')})")
            print(f"      Description: {row['description']}")
            print()
    else:
        print("  ✓ All Supabase transaction reference_ids exist in Stripe")

    # 3. Compare matching records for discrepancies
    print("\n3. MATCHING RECORDS WITH DISCREPANCIES")
    print("-" * 80)

    # Merge the datasets
    merged = transactions_with_ref.merge(
        stripe_df,
        left_on='reference_id',
        right_on='id',
        how='inner',
        suffixes=('_supabase', '_stripe')
    )

    print(f"\nMatching records: {len(merged)}")

    discrepancies = []

    for _, row in merged.iterrows():
        issues = []

        # Check customer ID mismatch
        supabase_stripe_id = row.get('stripe_id', None)
        stripe_customer_id = row.get('customer', None)

        if pd.notna(supabase_stripe_id) and pd.notna(stripe_customer_id):
            if supabase_stripe_id != stripe_customer_id:
                issues.append(f"Customer ID mismatch: Supabase={supabase_stripe_id}, Stripe={stripe_customer_id}")

        # Check amount mismatch (if dollarAmount exists)
        if 'dollarAmount' in row and pd.notna(row['dollarAmount']):
            supabase_amount = float(row['dollarAmount'])
            stripe_amount = float(row['amount_dollars'])

            # Allow for small floating point differences
            if abs(supabase_amount - stripe_amount) > 0.01:
                issues.append(f"Amount mismatch: Supabase=${supabase_amount:.2f}, Stripe=${stripe_amount:.2f}")

        if issues:
            discrepancies.append({
                'payment_id': row['reference_id'],
                'issues': issues,
                'supabase_user': row.get('username', 'N/A'),
                'created_date': row.get('created_at', 'N/A')
            })

    if discrepancies:
        print(f"  ⚠️  Found {len(discrepancies)} records with discrepancies:")

        # Sort discrepancies by date (most recent first)
        discrepancies_sorted = sorted(discrepancies, key=lambda x: x['created_date'], reverse=True)

        for disc in discrepancies_sorted:
            print(f"\n    • Payment ID: {disc['payment_id']}")
            print(f"      User: {disc['supabase_user']}")
            print(f"      Date: {disc['created_date']}")
            print(f"      Issues:")  # noqa: F541
            for issue in disc['issues']:
                print(f"        - {issue}")
    else:
        print("  ✓ No discrepancies found in matching records")

    # 4. Summary Statistics
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)

    total_issues = len(missing_in_supabase) + len(missing_in_stripe) + len(discrepancies)

    print(f"\nData Mismatch Issues: {total_issues}")
    print(f"  • Stripe payments not in Supabase: {len(missing_in_supabase)}")
    print(f"  • Supabase transactions not in Stripe: {len(missing_in_stripe)}")
    print(f"  • Records with discrepancies: {len(discrepancies)}")

    print(f"\nDuplicate Issues:")  # noqa: F541
    print(f"  • Duplicate reference_ids in Supabase: {len(supabase_duplicates)}")

    print(f"\nMissing Reference Issues:")  # noqa: F541
    print(f"  • Transactions without reference_id: {len(transactions_without_ref)}")

    print(f"\nTotal Issues: {total_issues + len(supabase_duplicates) + len(transactions_without_ref)}")

    # Amount comparison
    if len(merged) > 0 and 'dollarAmount' in merged.columns:
        supabase_total = merged['dollarAmount'].sum()
        stripe_total = merged['amount_dollars'].sum()
        difference = abs(supabase_total - stripe_total)

        print(f"\nAmount comparison (matched records only):")  # noqa: F541
        print(f"  Supabase total: ${supabase_total:,.2f}")
        print(f"  Stripe total: ${stripe_total:,.2f}")
        print(f"  Difference: ${difference:,.2f}")

        if difference > 1.0:
            print("  ⚠️  Warning: Total amounts differ by more than $1")

    # Generate report file
    print("\n" + "=" * 80)
    print("GENERATING REPORT")
    print("=" * 80)

    timestamp = datetime.now().strftime("%Y-%m-%dT%H_%M_%S")
    report_file = f"backups/payment_comparison_report-{timestamp}.txt"

    with open(report_file, 'w') as f:
        f.write("STRIPE AND SUPABASE PAYMENT COMPARISON REPORT\n")
        f.write("=" * 80 + "\n")
        f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Stripe file: {stripe_file}\n")
        f.write(f"Transactions file: {transactions_file}\n")
        f.write("\n")

        f.write("SUMMARY\n")
        f.write("-" * 80 + "\n")
        f.write(f"Total Stripe payments: {len(stripe_df)}\n")
        f.write(f"Total Supabase transactions: {len(transactions_df)}\n")
        f.write(f"Transactions with reference_id: {len(transactions_with_ref)}\n")
        f.write(f"Matched records: {len(merged)}\n")
        f.write(f"\nTotal issues: {total_issues}\n")
        f.write(f"  - Stripe payments not in Supabase: {len(missing_in_supabase)}\n")
        f.write(f"  - Supabase transactions not in Stripe: {len(missing_in_stripe)}\n")
        f.write(f"  - Records with discrepancies: {len(discrepancies)}\n")
        f.write(f"  - Duplicate reference_ids in Supabase: {len(supabase_duplicates)}\n")
        f.write(f"  - Transactions without reference_id: {len(transactions_without_ref)}\n")
        f.write("\n")

        if missing_in_supabase:
            f.write("\nSTRIPE PAYMENTS NOT IN SUPABASE\n")
            f.write("-" * 80 + "\n")
            missing_df = stripe_df[stripe_df['id'].isin(missing_in_supabase)].copy()
            # Sort by date, most recent first
            if 'created_date_readable' in missing_df.columns:
                missing_df = missing_df.sort_values('created_date_readable', ascending=False)
            elif 'created_date_iso' in missing_df.columns:
                missing_df = missing_df.sort_values('created_date_iso', ascending=False)
            for _, row in missing_df.iterrows():
                f.write(f"{row['id']}, ${row['amount_dollars']:.2f}, {row['created_date_readable']}, {row['customer']}\n")
            f.write("\n")

        if missing_in_stripe:
            f.write("\nSUPABASE TRANSACTIONS NOT IN STRIPE\n")
            f.write("-" * 80 + "\n")
            missing_trans_df = transactions_with_ref[transactions_with_ref['reference_id'].isin(missing_in_stripe)].copy()
            # Sort by date, most recent first
            missing_trans_df = missing_trans_df.sort_values('created_at', ascending=False)
            for _, row in missing_trans_df.iterrows():
                f.write(f"{row['reference_id']}, {row['amount']} credits, {row['created_at']}, {row['username']}\n")
            f.write("\n")

        if len(transactions_without_ref) > 0:
            f.write("\nTRANSACTIONS WITHOUT REFERENCE_ID\n")
            f.write("-" * 80 + "\n")
            no_ref_sorted = transactions_without_ref.sort_values('created_at', ascending=False)
            for _, row in no_ref_sorted.iterrows():
                amount_str = f", ${row['dollarAmount']:.2f}" if 'dollarAmount' in row and pd.notna(row['dollarAmount']) else ""
                f.write(f"{row['id']}, {row.get('amount', 'N/A')} credits{amount_str}, {row.get('created_at', 'N/A')}, {row.get('username', 'N/A')}\n")
            f.write("\n")

        if discrepancies:
            f.write("\nRECORDS WITH DISCREPANCIES\n")
            f.write("-" * 80 + "\n")
            # Sort by date, most recent first
            discrepancies_sorted = sorted(discrepancies, key=lambda x: x['created_date'], reverse=True)
            for disc in discrepancies_sorted:
                f.write(f"{disc['payment_id']}, {disc['supabase_user']}, {disc['created_date']}\n")
                for issue in disc['issues']:
                    f.write(f"  - {issue}\n")
                f.write("\n")

    print(f"\n✓ Detailed report saved to: {report_file}")

    # Export discrepancies to CSV if any exist
    if discrepancies:
        discrepancies_csv_file = f"backups/payment_discrepancies-{timestamp}.csv"

        # Create DataFrame from discrepancies
        discrepancies_rows = []
        for disc in discrepancies:
            # Get full details from merged dataset
            matching_row = merged[merged['reference_id'] == disc['payment_id']].iloc[0]

            discrepancies_rows.append({
                'payment_id': disc['payment_id'],
                'created_date': disc['created_date'],
                'username': disc['supabase_user'],
                'stripe_customer_id': matching_row.get('customer', 'N/A'),
                'supabase_stripe_id': matching_row.get('stripe_id', 'N/A'),
                'supabase_amount_dollars': matching_row.get('dollarAmount', 'N/A'),
                'stripe_amount_dollars': matching_row.get('amount_dollars', 'N/A'),
                'supabase_credits': matching_row.get('amount', 'N/A'),
                'description_supabase': matching_row.get('description_supabase', 'N/A'),
                'description_stripe': matching_row.get('description', 'N/A'),
                'issues': '; '.join(disc['issues'])
            })

        discrepancies_df = pd.DataFrame(discrepancies_rows)

        # Sort by created_date, most recent first
        discrepancies_df = discrepancies_df.sort_values('created_date', ascending=False)

        # Save to CSV
        discrepancies_df.to_csv(discrepancies_csv_file, index=False)

        print(f"✓ Discrepancies CSV exported to: {discrepancies_csv_file}")

    # Export transactions without reference_id to CSV if any exist
    if len(transactions_without_ref) > 0:
        no_ref_csv_file = f"backups/transactions_no_reference_id-{timestamp}.csv"
        no_ref_sorted = transactions_without_ref.sort_values('created_at', ascending=False)
        no_ref_sorted.to_csv(no_ref_csv_file, index=False)
        print(f"✓ Transactions without reference_id CSV exported to: {no_ref_csv_file}")

    # Export duplicate Supabase transactions to CSV if any exist
    # if len(supabase_duplicates) > 0:
    #     supabase_dup_csv_file = f"backups/supabase_duplicates-{timestamp}.csv"
    #     supabase_dup_sorted = supabase_duplicates.sort_values('created_at', ascending=False)
    #     supabase_dup_sorted.to_csv(supabase_dup_csv_file, index=False)
    #     print(f"✓ Supabase duplicates CSV exported to: {supabase_dup_csv_file}")

    if total_issues == 0 and len(supabase_duplicates) == 0 and len(transactions_without_ref) == 0:
        print("\n🎉 SUCCESS: All payments match perfectly!")
    else:
        total_all_issues = total_issues + len(supabase_duplicates) + len(transactions_without_ref)
        print(f"\n⚠️  ATTENTION: Found {total_all_issues} issue(s) that need review")
        print(f"    - Data mismatches: {total_issues}")
        print(f"    - Duplicates: {len(supabase_duplicates)}")
        print(f"    - Missing reference_id: {len(transactions_without_ref)}")

if __name__ == "__main__":
    main()
