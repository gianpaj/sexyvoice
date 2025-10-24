#!/usr/bin/env python3
"""
Credit Transactions Visualization Script

This script creates visualizations from SexyVoice.ai credit transaction data
to help understand purchasing patterns and user behavior.

Usage:
    python visualize-transactions.py <csv_file_path>

Example:
    python visualize-transactions.py data/credit_transactions.csv
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import json
import sys
import warnings
warnings.filterwarnings('ignore')

# Set style for better looking plots
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")

def load_and_clean_data(file_path):
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
    def extract_dollar_amount(metadata):
        if pd.isna(metadata):
            return None
        try:
            data = json.loads(metadata)
            return data.get('dollarAmount')
        except Exception:
            return None

    if 'metadata' in df.columns:
        df['dollarAmount'] = df['metadata'].apply(extract_dollar_amount)

    # Filter to only include purchase/topup transactions
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
        df['day_of_week_num'] = df['created_at'].dt.dayofweek

    return df

def create_hourly_heatmap(df, save_path):
    """Create heatmap showing transaction patterns by hour and day of week"""
    if 'hour' not in df.columns or 'day_of_week' not in df.columns:
        print("Missing time columns for hourly heatmap")
        return

    # Create pivot table for heatmap
    heatmap_data = df.groupby(['day_of_week_num', 'hour']).size().unstack(fill_value=0)

    # Reorder days
    day_labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    heatmap_data.index = day_labels

    plt.figure(figsize=(15, 8))
    sns.heatmap(heatmap_data, annot=True, fmt='d', cmap='YlOrRd', cbar_kws={'label': 'Number of Transactions'})
    plt.title('Transaction Heatmap: Hour of Day vs Day of Week', fontsize=16, fontweight='bold')
    plt.xlabel('Hour of Day', fontsize=12)
    plt.ylabel('Day of Week', fontsize=12)
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Hourly heatmap saved to: {save_path}")

def create_monthly_trends(df, save_path):
    """Create monthly trend charts"""
    if 'month' not in df.columns:
        print("Missing month column for trends")
        return

    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle('Monthly Trends Analysis', fontsize=16, fontweight='bold')

    # Monthly transaction count
    monthly_transactions = df.groupby('month').size()
    month_labels = [str(m) for m in monthly_transactions.index]
    x_pos = range(len(monthly_transactions))

    axes[0, 0].plot(x_pos, monthly_transactions.values, marker='o', linewidth=2, markersize=6)
    axes[0, 0].set_title('Monthly Transaction Count')
    axes[0, 0].set_ylabel('Number of Transactions')
    axes[0, 0].set_xticks(x_pos)
    axes[0, 0].set_xticklabels(month_labels, rotation=45)
    axes[0, 0].grid(True, alpha=0.3)

    # Monthly unique users
    if 'user_id' in df.columns:
        monthly_users = df.groupby('month')['user_id'].nunique()
        axes[0, 1].plot(x_pos, monthly_users.values, marker='s', linewidth=2, markersize=6, color='orange')
        axes[0, 1].set_title('Monthly Unique Users')
        axes[0, 1].set_ylabel('Unique Users')
        axes[0, 1].set_xticks(x_pos)
        axes[0, 1].set_xticklabels(month_labels, rotation=45)
        axes[0, 1].grid(True, alpha=0.3)

    # Monthly revenue
    if 'dollarAmount' in df.columns:
        monthly_revenue = df.groupby('month')['dollarAmount'].sum()
        axes[1, 0].plot(x_pos, monthly_revenue.values, marker='^', linewidth=2, markersize=6, color='green')
        axes[1, 0].set_title('Monthly Revenue')
        axes[1, 0].set_ylabel('Revenue ($)')
        axes[1, 0].set_xticks(x_pos)
        axes[1, 0].set_xticklabels(month_labels, rotation=45)
        axes[1, 0].grid(True, alpha=0.3)

        # Average transaction value
        monthly_avg = df.groupby('month')['dollarAmount'].mean()
        axes[1, 1].plot(x_pos, monthly_avg.values, marker='d', linewidth=2, markersize=6, color='red')
        axes[1, 1].set_title('Monthly Average Transaction Value')
        axes[1, 1].set_ylabel('Average Value ($)')
        axes[1, 1].set_xticks(x_pos)
        axes[1, 1].set_xticklabels(month_labels, rotation=45)
        axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Monthly trends chart saved to: {save_path}")

def create_user_behavior_charts(df, save_path):
    """Create user behavior analysis charts"""
    if 'user_id' not in df.columns:
        print("Missing user_id column for user behavior analysis")
        return

    fig, axes = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle('User Behavior Analysis', fontsize=16, fontweight='bold')

    # Transaction frequency distribution
    user_transaction_counts = df.groupby('user_id').size()
    axes[0, 0].hist(user_transaction_counts, bins=min(20, user_transaction_counts.max()), alpha=0.7, color='skyblue')
    axes[0, 0].set_title('Distribution of Transactions per User')
    axes[0, 0].set_xlabel('Number of Transactions')
    axes[0, 0].set_ylabel('Number of Users')
    axes[0, 0].grid(True, alpha=0.3)

    # User segments pie chart
    single_purchase = (user_transaction_counts == 1).sum()
    repeat_users = (user_transaction_counts.between(2, 4)).sum()
    power_users = (user_transaction_counts >= 5).sum()

    segments = [single_purchase, repeat_users, power_users]
    labels = ['Single Purchase', 'Repeat Users (2-4)', 'Power Users (5+)']
    colors = ['lightcoral', 'lightskyblue', 'lightgreen']

    axes[0, 1].pie(segments, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
    axes[0, 1].set_title('User Segments by Purchase Frequency')

    if 'dollarAmount' in df.columns:
        # Revenue per user distribution
        user_revenue = df.groupby('user_id')['dollarAmount'].sum()
        axes[1, 0].hist(user_revenue, bins=min(20, len(user_revenue.unique())), alpha=0.7, color='lightgreen')
        axes[1, 0].set_title('Distribution of Revenue per User')
        axes[1, 0].set_xlabel('Total Revenue per User ($)')
        axes[1, 0].set_ylabel('Number of Users')
        axes[1, 0].grid(True, alpha=0.3)

        # Transaction value distribution
        axes[1, 1].hist(df['dollarAmount'], bins=min(30, len(df['dollarAmount'].unique())), alpha=0.7, color='orange')
        axes[1, 1].set_title('Distribution of Transaction Values')
        axes[1, 1].set_xlabel('Transaction Value ($)')
        axes[1, 1].set_ylabel('Number of Transactions')
        axes[1, 1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"User behavior charts saved to: {save_path}")

def create_daily_patterns(df, save_path):
    """Create daily pattern analysis charts"""
    if 'day_of_week' not in df.columns or 'hour' not in df.columns:
        print("Missing time columns for daily patterns")
        return

    fig, axes = plt.subplots(1, 2, figsize=(15, 6))
    fig.suptitle('Daily Usage Patterns', fontsize=16, fontweight='bold')

    # Transactions by day of week
    day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    daily_counts = df.groupby('day_of_week').size().reindex(day_order)

    axes[0].bar(range(len(daily_counts)), daily_counts.values, color='steelblue', alpha=0.8)
    axes[0].set_title('Transactions by Day of Week')
    axes[0].set_xlabel('Day of Week')
    axes[0].set_ylabel('Number of Transactions')
    axes[0].set_xticks(range(len(day_order)))
    axes[0].set_xticklabels([day[:3] for day in day_order], rotation=45)
    axes[0].grid(True, alpha=0.3)

    # Transactions by hour of day
    hourly_counts = df.groupby('hour').size()
    axes[1].plot(hourly_counts.index, hourly_counts.values, marker='o', linewidth=2, markersize=4, color='darkorange')
    axes[1].set_title('Transactions by Hour of Day')
    axes[1].set_xlabel('Hour of Day')
    axes[1].set_ylabel('Number of Transactions')
    axes[1].set_xticks(range(0, 24, 2))
    axes[1].grid(True, alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Daily patterns chart saved to: {save_path}")

def create_transaction_types_analysis(df, save_path):
    """Create transaction types analysis chart"""
    if 'type' not in df.columns:
        print("Missing transaction type column")
        exit(1)
        return

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('Transaction Types Analysis', fontsize=16, fontweight='bold')

    # Transaction types pie chart
    type_counts = df['type'].value_counts()
    axes[0].pie(type_counts.values, labels=type_counts.index, autopct='%1.1f%%', startangle=90)
    axes[0].set_title('Transaction Types Distribution')

    # Transaction types over time
    if 'month' in df.columns:
        monthly_types = df.groupby(['month', 'type']).size().unstack(fill_value=0)
        monthly_types.plot(kind='bar', stacked=True, ax=axes[1], alpha=0.8)
        axes[1].set_title('Transaction Types Over Time')
        axes[1].set_xlabel('Month')
        axes[1].set_ylabel('Number of Transactions')
        axes[1].legend(title='Transaction Type')
        axes[1].tick_params(axis='x', rotation=45)

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Transaction types chart saved to: {save_path}")

def create_transaction_amounts_analysis(df, save_path):
    """Create transaction dollar amounts analysis chart"""
    if 'dollarAmount' not in df.columns:
        print("Missing dollarAmount column")
        exit(1)

    # Filter out null dollar amounts
    df_amounts = df[df['dollarAmount'].notna()].copy()

    if len(df_amounts) == 0:
        print("No transactions with dollar amounts found")
        return

    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig.suptitle('Transaction Dollar Amounts Analysis', fontsize=16, fontweight='bold')

    # Dollar amounts distribution (pie chart by ranges)
    # Create dollar amount ranges
    bins = [5, 10, 99, float('inf')]
    labels = ['$5', '$10', '$99']
    df_amounts['amount_range'] = pd.cut(df_amounts['dollarAmount'], bins=bins, labels=labels, include_lowest=True)

    amount_counts = df_amounts['amount_range'].value_counts()
    axes[0].pie(amount_counts.values, labels=amount_counts.index, autopct='%1.1f%%', startangle=90)
    axes[0].set_title('Dollar Amount Distribution')

    # Dollar amounts over time
    if 'month' in df_amounts.columns:
        monthly_amounts = df_amounts.groupby('month')['dollarAmount'].agg(['sum', 'mean', 'count'])

        revenue_color = "darkgreen"
        average_color= "orange"
        # Create a bar chart for total revenue per month
        x_pos = range(len(monthly_amounts))
        axes[1].bar(x_pos, monthly_amounts['sum'], alpha=0.7, color=revenue_color, label='Total Revenue')

        # Add a line for average transaction amount
        ax2 = axes[1].twinx()
        ax2.plot(x_pos, monthly_amounts['mean'], color=average_color, marker='o', linewidth=2, label='Avg Amount')

        axes[1].set_title('Transaction Amounts Over Time')
        axes[1].set_xlabel('Month')
        axes[1].set_ylabel('Total Revenue ($)', color=revenue_color)
        ax2.set_ylabel('Average Amount ($)', color=average_color)
        axes[1].set_xticks(x_pos)
        axes[1].set_xticklabels([str(m) for m in monthly_amounts.index], rotation=45)
        axes[1].tick_params(axis='y', labelcolor=revenue_color)
        ax2.grid(False)
        ax2.tick_params(axis='y', labelcolor=average_color)

        # Combine legends
        lines1, labels1 = axes[1].get_legend_handles_labels()
        lines2, labels2 = ax2.get_legend_handles_labels()
        axes[1].legend(lines1 + lines2, labels1 + labels2, loc='upper left')

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Transaction amounts chart saved to: {save_path}")

def get_weekly_comparison_data(df):
    """Extract weekly comparison data for MTD vs previous month"""
    if 'created_at' not in df.columns:
        return None, None, None, None

    # Get current date ranges
    today = pd.Timestamp.now(tz='UTC')
    current_month_start = today.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = current_month_start - pd.Timedelta(days=1)
    prev_month_start = prev_month_end.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # Filter data for current and previous month
    current_month_data = df[
        (df['created_at'] >= current_month_start) &
        (df['created_at'] <= today)
    ]
    prev_month_data = df[
        (df['created_at'] >= prev_month_start) &
        (df['created_at'] <= prev_month_end)
    ]

    # Get weeks using shared function
    def get_week_of_month(date_series, month_start):
        days_from_start = (date_series - month_start).dt.days
        return (days_from_start // 7) + 1

    # Calculate weekly data
    if len(current_month_data) > 0:
        current_month_data = current_month_data.copy()
        current_month_data['week_of_month'] = get_week_of_month(current_month_data['created_at'], current_month_start)
        current_weekly = current_month_data.groupby('week_of_month').size()
    else:
        current_weekly = pd.Series(dtype='int64')

    if len(prev_month_data) > 0:
        prev_month_data = prev_month_data.copy()
        prev_month_data['week_of_month'] = get_week_of_month(prev_month_data['created_at'], prev_month_start)
        prev_weekly = prev_month_data.groupby('week_of_month').size()
    else:
        prev_weekly = pd.Series(dtype='int64')

    # Prepare data for chart
    max_weeks = max(current_weekly.index.max() if len(current_weekly) > 0 else 0,
                   prev_weekly.index.max() if len(prev_weekly) > 0 else 0, 1)
    weeks = list(range(1, max_weeks + 1))

    current_counts = [current_weekly.get(week, 0) for week in weeks]
    prev_counts = [prev_weekly.get(week, 0) for week in weeks]

    # Calculate weekly revenue if dollarAmount available
    current_revenue = prev_revenue = None
    if 'dollarAmount' in df.columns:
        # Filter revenue data for current month
        current_revenue_data = current_month_data[current_month_data['dollarAmount'].notna()] if len(current_month_data) > 0 else pd.DataFrame()
        if len(current_revenue_data) > 0:
            current_weekly_revenue = current_revenue_data.groupby('week_of_month')['dollarAmount'].sum()
            current_revenue = [current_weekly_revenue.get(week, 0) for week in weeks]
        else:
            current_revenue = [0] * len(weeks)

        # Filter revenue data for previous month
        prev_revenue_data = prev_month_data[prev_month_data['dollarAmount'].notna()] if len(prev_month_data) > 0 else pd.DataFrame()
        if len(prev_revenue_data) > 0:
            prev_weekly_revenue = prev_revenue_data.groupby('week_of_month')['dollarAmount'].sum()
            prev_revenue = [prev_weekly_revenue.get(week, 0) for week in weeks]
        else:
            prev_revenue = [0] * len(weeks)

    return weeks, current_counts, prev_counts, (current_month_start, prev_month_start), current_revenue, prev_revenue

def create_weekly_mtd_comparison(df, save_path):
    """Create weekly comparison between MTD and previous month using bar chart"""
    # Get weekly comparison data using shared function
    weekly_data = get_weekly_comparison_data(df)
    if weekly_data[0] is None:
        print("Missing created_at column for weekly MTD comparison")
        return

    weeks, current_counts, prev_counts, (current_month_start, prev_month_start), current_revenue, prev_revenue = weekly_data

    # Create figure with subplots for transactions and revenue
    has_revenue = current_revenue is not None and prev_revenue is not None
    fig_height = 12 if has_revenue else 6
    nrows = 2 if has_revenue else 1

    fig, axes = plt.subplots(nrows, 1, figsize=(12, fig_height))
    if not has_revenue:
        axes = [axes]  # Make it a list for consistent indexing

    fig.suptitle('Weekly Comparison: MTD vs Previous Month', fontsize=16, fontweight='bold')

    x = np.arange(len(weeks))
    width = 0.35

    # Transaction count comparison
    ax1 = axes[0]
    bars1 = ax1.bar(x - width/2, current_counts, width, label='MTD', color='steelblue', alpha=0.8)
    bars2 = ax1.bar(x + width/2, prev_counts, width, label='Prev Month', color='darkorange', alpha=0.8)

    ax1.set_title('Weekly Transaction Counts')
    ax1.set_xlabel('Week of Month')
    ax1.set_ylabel('Number of Transactions')
    ax1.set_xticks(x)
    ax1.set_xticklabels([f'Week {w}' for w in weeks])
    ax1.legend()
    ax1.grid(True, alpha=0.3)

    # Add value labels on bars
    for bar, count in zip(bars1, current_counts):
        if count > 0:
            ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                    str(count), ha='center', va='bottom', fontweight='bold')

    for bar, count in zip(bars2, prev_counts):
        if count > 0:
            ax1.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                    str(count), ha='center', va='bottom', fontweight='bold')

    # Add summary statistics for transactions
    current_total = sum(current_counts)
    prev_total = sum(prev_counts)
    summary_text = f"MTD Total: {current_total}\nPrev Month Total: {prev_total}"
    if prev_total > 0:
        change_pct = ((current_total - prev_total) / prev_total) * 100
        summary_text += f"\nChange: {change_pct:+.1f}%"

    ax1.text(0.02, 0.98, summary_text, transform=ax1.transAxes,
            verticalalignment='top', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgray"))

    # Revenue comparison (if available)
    if has_revenue:
        ax2 = axes[1]
        bars3 = ax2.bar(x - width/2, current_revenue, width, label='MTD', color='green', alpha=0.8)
        bars4 = ax2.bar(x + width/2, prev_revenue, width, label='Prev Month', color='red', alpha=0.8)

        ax2.set_title('Weekly Revenue (Dollar Amounts)')
        ax2.set_xlabel('Week of Month')
        ax2.set_ylabel('Revenue ($)')
        ax2.set_xticks(x)
        ax2.set_xticklabels([f'Week {w}' for w in weeks])
        ax2.legend()
        ax2.grid(True, alpha=0.3)

        # Add value labels on revenue bars
        for bar, revenue in zip(bars3, current_revenue):
            if revenue > 0:
                ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + revenue * 0.01,
                        f'${revenue:.0f}', ha='center', va='bottom', fontweight='bold')

        for bar, revenue in zip(bars4, prev_revenue):
            if revenue > 0:
                ax2.text(bar.get_x() + bar.get_width()/2, bar.get_height() + revenue * 0.01,
                        f'${revenue:.0f}', ha='center', va='bottom', fontweight='bold')

        # Add summary statistics for revenue
        current_revenue_total = sum(current_revenue)
        prev_revenue_total = sum(prev_revenue)
        revenue_summary = f"MTD Revenue: ${current_revenue_total:.2f}\nPrev Month: ${prev_revenue_total:.2f}"
        if prev_revenue_total > 0:
            revenue_change_pct = ((current_revenue_total - prev_revenue_total) / prev_revenue_total) * 100
            revenue_summary += f"\nChange: {revenue_change_pct:+.1f}%"

        ax2.text(0.02, 0.98, revenue_summary, transform=ax2.transAxes,
                verticalalignment='top', bbox=dict(boxstyle="round,pad=0.3", facecolor="lightgreen"))

    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Weekly MTD comparison chart saved to: {save_path}")

def create_dashboard(df, save_path):
    """Create a comprehensive dashboard"""
    fig = plt.figure(figsize=(20, 15))
    gs = fig.add_gridspec(4, 4, hspace=0.4, wspace=0.3)
    fig.suptitle('SexyVoice.ai Credit Transactions Dashboard', fontsize=20, fontweight='bold')

    # Key metrics (top row)
    ax1 = fig.add_subplot(gs[0, 0])
    ax1.text(0.5, 0.7, f"{len(df):,}", ha='center', va='center', fontsize=24, fontweight='bold')
    ax1.text(0.5, 0.3, "Total Transactions", ha='center', va='center', fontsize=12)
    ax1.set_xlim(0, 1)
    ax1.set_ylim(0, 1)
    ax1.axis('off')
    ax1.add_patch(plt.Rectangle((0.05, 0.05), 0.9, 0.9, fill=False, edgecolor='gray', linewidth=2))

    ax2 = fig.add_subplot(gs[0, 1])
    if 'user_id' in df.columns:
        unique_users = df['user_id'].nunique()
        ax2.text(0.5, 0.7, f"{unique_users:,}", ha='center', va='center', fontsize=24, fontweight='bold')
        ax2.text(0.5, 0.3, "Unique Users", ha='center', va='center', fontsize=12)
    ax2.set_xlim(0, 1)
    ax2.set_ylim(0, 1)
    ax2.axis('off')
    ax2.add_patch(plt.Rectangle((0.05, 0.05), 0.9, 0.9, fill=False, edgecolor='gray', linewidth=2))

    ax3 = fig.add_subplot(gs[0, 2])
    if 'dollarAmount' in df.columns:
        total_revenue = df['dollarAmount'].sum()
        ax3.text(0.5, 0.7, f"${total_revenue:,.0f}", ha='center', va='center', fontsize=24, fontweight='bold')
        ax3.text(0.5, 0.3, "Total Revenue", ha='center', va='center', fontsize=12)
    ax3.set_xlim(0, 1)
    ax3.set_ylim(0, 1)
    ax3.axis('off')
    ax3.add_patch(plt.Rectangle((0.05, 0.05), 0.9, 0.9, fill=False, edgecolor='gray', linewidth=2))

    ax4 = fig.add_subplot(gs[0, 3])
    if 'dollarAmount' in df.columns:
        avg_transaction = df['dollarAmount'].mean()
        ax4.text(0.5, 0.7, f"${avg_transaction:.2f}", ha='center', va='center', fontsize=24, fontweight='bold')
        ax4.text(0.5, 0.3, "Avg Transaction", ha='center', va='center', fontsize=12)
    ax4.set_xlim(0, 1)
    ax4.set_ylim(0, 1)
    ax4.axis('off')
    ax4.add_patch(plt.Rectangle((0.05, 0.05), 0.9, 0.9, fill=False, edgecolor='gray', linewidth=2))

    # Daily pattern
    ax5 = fig.add_subplot(gs[1, :2])
    if 'day_of_week' in df.columns:
        day_order = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        daily_counts = df.groupby('day_of_week').size().reindex(day_order)
        ax5.bar(range(len(daily_counts)), daily_counts.values, color='steelblue', alpha=0.8)
        ax5.set_title('Transactions by Day of Week')
        ax5.set_xticks(range(len(day_order)))
        ax5.set_xticklabels([day[:3] for day in day_order])

    # Hourly pattern
    ax6 = fig.add_subplot(gs[1, 2:])
    if 'hour' in df.columns:
        hourly_counts = df.groupby('hour').size()
        ax6.plot(hourly_counts.index, hourly_counts.values, marker='o', linewidth=2, color='darkorange')
        ax6.set_title('Transactions by Hour of Day')
        ax6.set_xlabel('Hour')

    # Weekly MTD comparison - Transactions
    ax7 = fig.add_subplot(gs[2, :2])
    # Use shared function to get weekly comparison data
    weekly_data = get_weekly_comparison_data(df)
    if weekly_data[0] is not None:
        weeks, current_counts, prev_counts, _, current_revenue, prev_revenue = weekly_data

        x = np.arange(len(weeks))
        width = 0.35

        bars1 = ax7.bar(x - width/2, current_counts, width, label='MTD', color='steelblue', alpha=0.8)
        bars2 = ax7.bar(x + width/2, prev_counts, width, label='Prev Month', color='darkorange', alpha=0.8)

        ax7.set_title('Weekly Transactions: MTD vs Previous Month')
        ax7.set_xlabel('Week of Month')
        ax7.set_ylabel('Transactions')
        ax7.set_xticks(x)
        ax7.set_xticklabels([f'Week {w}' for w in weeks])
        ax7.legend()
        ax7.grid(True, alpha=0.3)

        # Add value labels on bars (same as standalone version)
        for bar, count in zip(bars1, current_counts):
            if count > 0:
                ax7.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                        str(count), ha='center', va='bottom', fontweight='bold')

        for bar, count in zip(bars2, prev_counts):
            if count > 0:
                ax7.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.1,
                        str(count), ha='center', va='bottom', fontweight='bold')

    # Weekly MTD comparison - Revenue
    ax7_revenue = fig.add_subplot(gs[2, 2:])
    if weekly_data[0] is not None and current_revenue is not None and prev_revenue is not None:
        bars3 = ax7_revenue.bar(x - width/2, current_revenue, width, label='MTD', color='green', alpha=0.8)
        bars4 = ax7_revenue.bar(x + width/2, prev_revenue, width, label='Prev Month', color='red', alpha=0.8)

        ax7_revenue.set_title('Weekly Revenue: MTD vs Previous Month')
        ax7_revenue.set_xlabel('Week of Month')
        ax7_revenue.set_ylabel('Revenue ($)')
        ax7_revenue.set_xticks(x)
        ax7_revenue.set_xticklabels([f'Week {w}' for w in weeks])
        ax7_revenue.legend()
        ax7_revenue.grid(True, alpha=0.3)

        # Add value labels on revenue bars
        for bar, revenue in zip(bars3, current_revenue):
            if revenue > 0:
                ax7_revenue.text(bar.get_x() + bar.get_width()/2, bar.get_height() + revenue * 0.01,
                               f'${revenue:.0f}', ha='center', va='bottom', fontweight='bold', fontsize=9)

        for bar, revenue in zip(bars4, prev_revenue):
            if revenue > 0:
                ax7_revenue.text(bar.get_x() + bar.get_width()/2, bar.get_height() + revenue * 0.01,
                               f'${revenue:.0f}', ha='center', va='bottom', fontweight='bold', fontsize=9)

    # Monthly trend
    ax8 = fig.add_subplot(gs[3, :2])
    if 'month' in df.columns:
        monthly_transactions = df.groupby('month').size()
        ax8.plot(range(len(monthly_transactions)), monthly_transactions.values, marker='o', linewidth=2)
        ax8.set_title('Monthly Transaction Trend')
        ax8.set_ylabel('Transactions')

    # User segments
    ax9 = fig.add_subplot(gs[3, 2:])
    if 'user_id' in df.columns:
        user_transaction_counts = df.groupby('user_id').size()
        single_purchase = (user_transaction_counts == 1).sum()
        repeat_users = (user_transaction_counts.between(2, 4)).sum()
        power_users = (user_transaction_counts >= 5).sum()

        segments = [single_purchase, repeat_users, power_users]
        labels = ['Single Purchase', 'Repeat Users', 'Power Users']
        ax9.pie(segments, labels=labels, autopct='%1.1f%%', startangle=90)
        ax9.set_title('User Segments')

    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Dashboard saved to: {save_path}")

def main():
    """Main visualization function"""
    if len(sys.argv) < 2:
        print("Usage: python visualize-transactions.py <csv_file_path>")
        print("Example: python visualize-transactions.py data/credit_transactions.csv")
        sys.exit(1)

    file_path = sys.argv[1]
    base_name = file_path.replace('.csv', '')

    # Load and clean data
    df = load_and_clean_data(file_path)

    if len(df) == 0:
        print("No data to visualize after filtering")
        sys.exit(1)

    print(f"\nCreating visualizations for {len(df):,} credit transactions...")
    print("="*60)

    # Create all visualizations
    create_dashboard(df, f"{base_name}_dashboard.png")
    create_weekly_mtd_comparison(df, f"{base_name}_weekly_mtd_comparison.png")
    create_hourly_heatmap(df, f"{base_name}_hourly_heatmap.png")
    create_monthly_trends(df, f"{base_name}_monthly_trends.png")
    create_user_behavior_charts(df, f"{base_name}_user_behavior.png")
    create_daily_patterns(df, f"{base_name}_daily_patterns.png")
    create_transaction_types_analysis(df, f"{base_name}_transaction_types.png")
    create_transaction_amounts_analysis(df, f"{base_name}_transaction_amounts.png")

    print("\nAll visualizations created! 📊")
    print(f"Files saved with prefix: {base_name}_")

if __name__ == "__main__":
    main()
