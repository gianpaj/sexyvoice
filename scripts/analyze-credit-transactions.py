#!/usr/bin/env python3
"""
Credit Transactions Analysis Script

This script analyzes credit transaction data from SexyVoice.ai to extract insights
about user purchasing behavior and patterns.

Usage:
    python analyze-credit-transactions.py <csv_file_path>

Example:
    python analyze-credit-transactions.py data/credit_transactions.csv
"""

import pandas as pd
import json
import sys
import warnings
warnings.filterwarnings('ignore')

def load_and_clean_data(file_path: str) -> pd.DataFrame:
    """Load CSV file and clean the data"""
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

    # Convert datetime columns (handle timezone-aware timestamps)
    datetime_cols = ['created_at', 'updated_at']
    for col in datetime_cols:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors='coerce', utc=True)

    # Extract dollarAmount from metadata JSON
    def extract_dollar_amount(metadata: str) -> float | None:
        if pd.isna(metadata):
            return None
        try:
            data = json.loads(metadata)
            return data.get('dollarAmount')
        except Exception:
            return None

    if 'metadata' in df.columns:
        df['dollarAmount'] = df['metadata'].apply(extract_dollar_amount)

    # Filter to only include purchase/topup transactions (revenue generating)
    if 'type' in df.columns:
        initial_count = len(df)
        df = df[df['type'].isin(['purchase', 'topup'])]
        filtered_count = len(df)
        print(f"Filtered from {initial_count} to {filtered_count} transactions (purchase/topup only)")

    # Add time-based columns for analysis
    if 'created_at' in df.columns:
        df['date'] = df['created_at'].dt.date
        df['hour'] = df['created_at'].dt.hour
        df['day_of_week'] = df['created_at'].dt.day_name()
        df['month'] = df['created_at'].dt.to_period('M')
        df['week'] = df['created_at'].dt.to_period('W')

    return df

def get_date_ranges() -> dict[str, pd.Timestamp]:
    """Get current month, previous month, and date ranges"""
    # Use UTC timezone to match the data - pandas will handle timezone conversion
    today = pd.Timestamp.now(tz='UTC')
    current_month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - pd.Timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    return {
        'current_month_start': current_month_start,
        'current_month_end': today,
        'prev_month_start': prev_month_start,
        'prev_month_end': prev_month_end,
        'today': today
    }

def analyze_monthly_metrics(df: pd.DataFrame) -> None:
    """Analyze month-to-date vs previous month metrics"""
    print("\n" + "="*60)
    print("MONTHLY ANALYSIS")
    print("="*60)

    dates = get_date_ranges()

    # Filter data for current and previous month
    current_month_data = df[
        (df['created_at'] >= dates['current_month_start']) &
        (df['created_at'] <= dates['current_month_end'])
    ]

    prev_month_data = df[
        (df['created_at'] >= dates['prev_month_start']) &
        (df['created_at'] <= dates['prev_month_end'])
    ]

    # Calculate metrics
    def calculate_metrics(data: pd.DataFrame, period_name: str) -> dict[str, str | int | float]:
        total_transactions = len(data)
        total_revenue = data['dollarAmount'].sum() if 'dollarAmount' in data.columns else 0
        unique_users = data['user_id'].nunique() if 'user_id' in data.columns else 0
        avg_transaction_value = total_revenue / total_transactions if total_transactions > 0 else 0

        return {
            'period': period_name,
            'transactions': total_transactions,
            'revenue': total_revenue,
            'unique_users': unique_users,
            'avg_transaction_value': avg_transaction_value
        }

    current_metrics = calculate_metrics(current_month_data, "Current Month (MTD)")
    prev_metrics = calculate_metrics(prev_month_data, "Previous Month")

    # Print comparison
    print(f"\n{current_metrics['period']}")
    print(f"  • Transactions: {current_metrics['transactions']:,}")
    print(f"  • Revenue: ${current_metrics['revenue']:,.2f}")
    print(f"  • Unique Users: {current_metrics['unique_users']:,}")
    print(f"  • Avg Transaction Value: ${current_metrics['avg_transaction_value']:.2f}")

    print(f"\n{prev_metrics['period']}")
    print(f"  • Transactions: {prev_metrics['transactions']:,}")
    print(f"  • Revenue: ${prev_metrics['revenue']:,.2f}")
    print(f"  • Unique Users: {prev_metrics['unique_users']:,}")
    print(f"  • Avg Transaction Value: ${prev_metrics['avg_transaction_value']:.2f}")

    # Calculate growth rates
    if prev_metrics['transactions'] > 0:
        transaction_growth = ((current_metrics['transactions'] - prev_metrics['transactions']) / prev_metrics['transactions']) * 100
        revenue_growth = ((current_metrics['revenue'] - prev_metrics['revenue']) / prev_metrics['revenue']) * 100
        user_growth = ((current_metrics['unique_users'] - prev_metrics['unique_users']) / prev_metrics['unique_users']) * 100

        print("\nGrowth Rates (vs Previous Month)")
        print(f"  • Transactions: {transaction_growth:+.1f}%")
        print(f"  • Revenue: {revenue_growth:+.1f}%")
        print(f"  • Unique Users: {user_growth:+.1f}%")

    # return current_metrics, prev_metrics

def analyze_time_patterns(df: pd.DataFrame) -> None:
    """Analyze time-based patterns"""
    print("\n" + "="*60)
    print("TIME PATTERN ANALYSIS")
    print("="*60)

    # Most popular hours
    if 'hour' in df.columns:
        hourly_transactions = df.groupby('hour').size().sort_values(ascending=False)
        print("\nMost Popular Hours (Top 5):")
        for hour, count in hourly_transactions.head().items():
            period = "AM" if hour < 12 else "PM"
            display_hour = hour if hour <= 12 else hour - 12
            if display_hour == 0:
                display_hour = 12
            print(f"  • {display_hour:2d}:00 {period}: {count:,} transactions")

    # Most popular days of week
    if 'day_of_week' in df.columns:
        daily_transactions = df.groupby('day_of_week').size().reindex([
            'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
        ])
        print("\nTransactions by Day of Week:")
        for day, count in daily_transactions.items():
            print(f"  • {day}: {count:,} transactions")

        # Find peak day
        peak_day = daily_transactions.idxmax()
        peak_count = daily_transactions.max()
        print(f"\nPeak Day: {peak_day} ({peak_count:,} transactions)")

def analyze_user_behavior(df: pd.DataFrame) -> None:
    """Analyze user purchasing behavior"""
    print("\n" + "="*60)
    print("USER BEHAVIOR ANALYSIS")
    print("="*60)

    if 'user_id' not in df.columns:
        print("No user_id column found - skipping user behavior analysis")
        return

    # User purchase frequency
    user_transaction_counts = df.groupby('user_id').size()

    print("\nUser Purchase Frequency:")
    print(f"  • Total unique users: {len(user_transaction_counts):,}")
    print(f"  • Average transactions per user: {user_transaction_counts.mean():.1f}")
    print(f"  • Median transactions per user: {user_transaction_counts.median():.1f}")

    # Segment users by frequency
    single_purchase_users = (user_transaction_counts == 1).sum()
    repeat_users = (user_transaction_counts > 1).sum()
    power_users = (user_transaction_counts >= 5).sum()

    print("\nUser Segments:")
    print(f"  • Single purchase users: {single_purchase_users:,} ({single_purchase_users/len(user_transaction_counts)*100:.1f}%)")
    print(f"  • Repeat users (2+ purchases): {repeat_users:,} ({repeat_users/len(user_transaction_counts)*100:.1f}%)")
    print(f"  • Power users (5+ purchases): {power_users:,} ({power_users/len(user_transaction_counts)*100:.1f}%)")

    # Revenue analysis by user segment
    if 'dollarAmount' in df.columns:
        user_revenue = df.groupby('user_id')['dollarAmount'].sum()

        print("\nRevenue Analysis:")
        print(f"  • Average revenue per user: ${user_revenue.mean():.2f}")
        print(f"  • Median revenue per user: ${user_revenue.median():.2f}")
        print(f"  • Top 10% of users generate: ${user_revenue.quantile(0.9):.2f}+ each")

def analyze_transaction_patterns(df: pd.DataFrame) -> None:
    """Analyze transaction amount and type patterns"""
    print("\n" + "="*60)
    print("TRANSACTION PATTERN ANALYSIS")
    print("="*60)

    # Transaction types
    if 'type' in df.columns:
        type_counts = df['type'].value_counts()
        print("\nTransaction Types:")
        for transaction_type, count in type_counts.items():
            percentage = (count / len(df)) * 100
            print(f"  • {transaction_type}: {count:,} transactions ({percentage:.1f}%)")

    # Revenue analysis
    if 'dollarAmount' in df.columns:
        revenue_stats = df['dollarAmount'].describe()
        print("\nRevenue Statistics:")
        print(f"  • Total Revenue: ${df['dollarAmount'].sum():,.2f}")
        print(f"  • Average Transaction: ${revenue_stats['mean']:.2f}")
        print(f"  • Median Transaction: ${revenue_stats['50%']:.2f}")

        # Common transaction amounts
        common_amounts = df['dollarAmount'].value_counts().head()
        print("\nMost Common Transaction Amounts:")
        for amount, count in common_amounts.items():
            print(f"  • ${amount}: {count:,} transactions")

def analyze_trends(df: pd.DataFrame) -> None:
    """Analyze trends over time"""
    print("\n" + "="*60)
    print("TREND ANALYSIS")
    print("="*60)

    if 'created_at' not in df.columns:
        print("No created_at column found - skipping trend analysis")
        return

    # Monthly trends
    monthly_stats = df.groupby('month').agg({
        'user_id': ['count', 'nunique'],
        'dollarAmount': 'sum' if 'dollarAmount' in df.columns else 'count'
    }).round(2)

    if 'dollarAmount' in df.columns:
        monthly_stats.columns = ['Transactions', 'Unique_Users', 'Revenue']
    else:
        monthly_stats.columns = ['Transactions', 'Unique_Users']

    print("\nMonthly Trends (Last 6 months):")
    recent_months = monthly_stats.tail(6)
    for month, row in recent_months.iterrows():
        if 'Revenue' in recent_months.columns:
            print(f"  • {month}: {row['Transactions']:,.0f} transactions, {row['Unique_Users']:,.0f} users, ${row['Revenue']:,.2f} revenue")
        else:
            print(f"  • {month}: {row['Transactions']:,.0f} transactions, {row['Unique_Users']:,.0f} users")

def generate_insights(df: pd.DataFrame) -> None:
    """Generate key insights and recommendations"""
    print("\n" + "="*60)
    print("KEY INSIGHTS & RECOMMENDATIONS")
    print("="*60)

    insights = []

    # Peak usage insights
    if 'hour' in df.columns and 'day_of_week' in df.columns:
        peak_hour = df.groupby('hour').size().idxmax()
        peak_day = df.groupby('day_of_week').size().idxmax()

        period = "AM" if peak_hour < 12 else "PM"
        display_hour = peak_hour if peak_hour <= 12 else peak_hour - 12
        if display_hour == 0:
            display_hour = 12

        insights.append(f"Peak usage occurs on {peak_day}s at {display_hour}:00 {period}")

    # User behavior insights
    if 'user_id' in df.columns:
        user_transaction_counts = df.groupby('user_id').size()
        repeat_rate = (user_transaction_counts > 1).sum() / len(user_transaction_counts) * 100
        insights.append(f"Repeat purchase rate is {repeat_rate:.1f}%")

    # Revenue insights
    if 'dollarAmount' in df.columns:
        avg_transaction = df['dollarAmount'].mean()
        total_revenue = df['dollarAmount'].sum()
        insights.append(f"Average transaction value is ${avg_transaction:.2f}")
        insights.append(f"Total revenue analyzed: ${total_revenue:,.2f}")

    print("\nKey Insights:")
    for i, insight in enumerate(insights, 1):
        print(f"  {i}. {insight}")

    # print("\nRecommendations:")
    # print("  • Schedule marketing campaigns during peak usage times")
    # print("  • Develop retention strategies to increase repeat purchase rate")
    # print("  • Analyze high-value customers for upselling opportunities")

def save_summary_report(df: pd.DataFrame, output_path: str) -> None:
    """Save a summary report to file"""
    try:
        with open(output_path, 'w') as f:
            f.write("SEXYVOICE.AI - CREDIT TRANSACTIONS ANALYSIS REPORT\n")
            f.write("="*60 + "\n")
            f.write(f"Generated: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Data period: {df['created_at'].min()} to {df['created_at'].max()}\n")
            f.write(f"Total transactions analyzed: {len(df):,}\n")

            if 'dollarAmount' in df.columns:
                f.write(f"Total revenue: ${df['dollarAmount'].sum():,.2f}\n")

            if 'user_id' in df.columns:
                f.write(f"Unique users: {df['user_id'].nunique():,}\n")

        print(f"\nSummary report saved to: {output_path}")
    except Exception as e:
        print(f"Error saving summary report: {e}")

def main() -> None:
    """Main analysis function"""
    if len(sys.argv) < 2:
        print("Usage: python analyze-credit-transactions.py <csv_file_path>")
        print("Example: python analyze-credit-transactions.py data/credit_transactions.csv")
        sys.exit(1)

    file_path = sys.argv[1]

    # Load and clean data
    df = load_and_clean_data(file_path)

    if len(df) == 0:
        print("No data to analyze after filtering")
        sys.exit(1)

    print(f"\nAnalyzing {len(df):,} credit transactions...")
    print("="*60)

    # Run all analyses
    analyze_monthly_metrics(df)
    # analyze_time_patterns(df)
    analyze_user_behavior(df)
    analyze_transaction_patterns(df)
    analyze_trends(df)
    generate_insights(df)

    # Save summary report
    # output_path = file_path.replace('.csv', '_analysis_report.txt')
    # save_summary_report(df, output_path)

    print("\nAnalysis complete! 🎉")

if __name__ == "__main__":
    main()
