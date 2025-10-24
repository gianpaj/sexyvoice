# Credit Transaction Analysis Scripts

This directory contains Python scripts for analyzing credit transaction data from SexyVoice.ai to extract insights about user purchasing behavior and patterns.

## Scripts Overview

### 1. `analyze-credit-transactions.py`
Main analysis script that provides comprehensive insights including:
- Month-to-date vs previous month comparisons
- Number of credit transactions (any type)
- Dollar amounts and revenue analysis
- Unique users count
- Most popular times of day and days of the week
- User behavior patterns and segmentation
- Transaction trends over time
- Key insights and recommendations

### 2. `visualize-transactions.py`
Visualization script that creates charts and graphs:
- Comprehensive dashboard with key metrics
- Hourly heatmap (hour vs day of week)
- Weekly MTD vs previous month comparison (transactions & revenue)
- Monthly trend analysis
- User behavior charts
- Daily usage patterns
- Transaction types analysis

### 3. `clean-transactions.py` (existing)
Data cleaning script that:
- Extracts dollar amounts from metadata JSON
- Filters to purchase/topup transactions only
- Formats datetime columns

## Installation

Install required Python packages:

```bash
pip install -r requirements.txt
```

Or install individually:
```bash
pip install pandas numpy matplotlib seaborn
```

## Usage

### Basic Analysis
```bash
python analyze-credit-transactions.py path/to/credit_transactions.csv
```

### Create Visualizations
```bash
python visualize-transactions.py path/to/credit_transactions.csv
```

### Clean Data First (Optional)
```bash
python clean-transactions.py path/to/raw_transactions.csv
python analyze-credit-transactions.py path/to/raw_transactions_cleaned.csv
```

## Expected CSV Format

The scripts expect a CSV file with the following columns:

**Required columns:**
- `created_at` - Transaction timestamp
- `type` - Transaction type ('purchase', 'topup', 'usage', 'freemium')
- `user_id` - Unique user identifier

**Optional but recommended columns:**
- `metadata` - JSON string containing `dollarAmount` field
- `amount` - Credit amount
- `description` - Transaction description
- `reference_id` - External reference (e.g., Stripe payment ID)
- `subscription_id` - Subscription identifier

**Example CSV structure:**
```csv
id,user_id,amount,type,description,created_at,metadata
uuid1,user123,1000,topup,Credit purchase,2024-01-15 10:30:00,"{\"dollarAmount\":9.99}"
uuid2,user456,500,usage,Voice generation,2024-01-15 11:45:00,null
```

## Output Files

### Analysis Script Output
- Console output with detailed analysis
- `*_analysis_report.txt` - Summary report file

### Visualization Script Output
- `*_dashboard.png` - Comprehensive dashboard
- `*_weekly_mtd_comparison.png` - Weekly MTD vs previous month (transactions & revenue)
- `*_hourly_heatmap.png` - Hour vs day heatmap
- `*_monthly_trends.png` - Monthly trend charts
- `*_user_behavior.png` - User behavior analysis
- `*_daily_patterns.png` - Daily usage patterns
- `*_transaction_types.png` - Transaction types analysis

## Key Metrics Analyzed

### Monthly Comparisons
- Transaction count (current month vs previous month)
- Total revenue comparison
- Unique users comparison
- Average transaction value
- Growth rates (% change)

### Time Patterns
- Most popular hours of the day
- Most popular days of the week
- Peak usage times identification

### User Behavior
- User purchase frequency distribution
- User segmentation:
  - Single purchase users
  - Repeat users (2-4 purchases)
  - Power users (5+ purchases)
- Average revenue per user
- Customer lifetime value insights

### Transaction Patterns
- Transaction type distribution
- Revenue statistics (mean, median, min, max)
- Most common transaction amounts
- Weekly MTD vs previous month comparison (transactions & revenue)
- Monthly trends and seasonality

## Example Output

```
MONTHLY ANALYSIS
============================================================

Current Month (MTD)
  • Transactions: 1,250
  • Revenue: $12,458.50
  • Unique Users: 892
  • Avg Transaction Value: $9.97

Previous Month
  • Transactions: 1,180
  • Revenue: $11,832.00
  • Unique Users: 845
  • Avg Transaction Value: $10.03

Growth Rates (vs Previous Month)
  • Transactions: +5.9%
  • Revenue: +5.3%
  • Unique Users: +5.6%

TIME PATTERN ANALYSIS
============================================================

Most Popular Hours (Top 5):
  •  2:00 PM: 127 transactions
  •  3:00 PM: 115 transactions
  •  1:00 PM: 108 transactions
  •  4:00 PM: 94 transactions
  •  11:00 AM: 89 transactions

Peak Day: Wednesday (245 transactions)
```

## Database Integration

To export data directly from Supabase:

```sql
-- Export recent credit transactions
SELECT 
    id,
    user_id,
    amount,
    type,
    description,
    created_at,
    updated_at,
    metadata,
    reference_id,
    subscription_id
FROM credit_transactions
WHERE created_at >= NOW() - INTERVAL '6 months'
    AND type IN ('purchase', 'topup')
ORDER BY created_at DESC;
```

## Troubleshooting

### Common Issues

1. **Missing columns error**
   - Check that your CSV has the required columns
   - Ensure column names match exactly (case-sensitive)

2. **Date parsing errors**
   - Verify `created_at` column is in a valid datetime format
   - Common formats: `YYYY-MM-DD HH:MM:SS` or ISO 8601

3. **No data after filtering**
   - Check if your data contains 'purchase' or 'topup' transaction types
   - Verify the `type` column values

4. **Visualization errors**
   - Ensure matplotlib and seaborn are installed
   - Check that you have sufficient data points for meaningful charts

### Performance Notes

- For large datasets (>100k rows), consider filtering by date range first
- Visualization script may take longer with very large datasets
- Consider using data sampling for initial exploration of massive datasets

## Integration with SexyVoice.ai Workflow

These scripts are designed to work with the SexyVoice.ai credit system:

1. **Export data** from Supabase using the provided SQL query
2. **Clean data** using `clean-transactions.py` if needed
3. **Analyze patterns** using `analyze-credit-transactions.py`
4. **Create visuals** using `visualize-transactions.py`
5. **Review insights** to inform business decisions

## Contributing

When modifying these scripts:

1. Follow the existing code patterns
2. Add error handling for new features
3. Update this README with new functionality
4. Test with sample data before committing

## Dependencies

- pandas >= 2.0.0
- numpy >= 1.24.0
- matplotlib >= 3.6.0
- seaborn >= 0.12.0