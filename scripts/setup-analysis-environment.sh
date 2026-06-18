#!/bin/bash

# SexyVoice.ai Credit Transaction Analysis Setup Script
# This script sets up the Python environment and provides usage examples.
#
# The venv lives OUTSIDE the project root so that Turbopack does not traverse
# it during the Next.js build.  Default location: ../sexyvoice-scripts-venv
# Override by setting VENV_DIR before running:
#   VENV_DIR=/some/other/path bash setup-analysis-environment.sh

set -e  # Exit on any error

echo "🚀 SexyVoice.ai Credit Transaction Analysis Setup"
echo "================================================"

# Resolve the script's own directory so this works regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Venv is placed one level above the repo root (next to the project folder).
VENV_DIR="${VENV_DIR:-"$(dirname "$SCRIPT_DIR")/sexyvoice-scripts-venv"}"

echo "📁 Virtual environment path: $VENV_DIR"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Python installation
echo ""
echo "📦 Checking Python installation..."
if command_exists python3; then
    PYTHON_CMD="python3"
    echo "✓ Python3 found: $(python3 --version)"
elif command_exists python; then
    PYTHON_CMD="python"
    echo "✓ Python found: $(python --version)"
else
    echo "❌ Python not found. Please install Python 3.7+ first."
    echo "   Visit: https://www.python.org/downloads/"
    exit 1
fi

# Create the venv if it doesn't already exist
echo ""
if [ -d "$VENV_DIR" ]; then
    echo "♻️  Reusing existing virtual environment at $VENV_DIR"
else
    echo "🔨 Creating virtual environment at $VENV_DIR ..."
    $PYTHON_CMD -m venv "$VENV_DIR"
    echo "✓ Virtual environment created"
fi

# Activate the venv for the rest of this script
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
echo "✓ Virtual environment activated"

PYTHON_CMD="python"
PIP_CMD="pip"

# Install dependencies
echo ""
echo "📥 Installing Python dependencies..."
echo "   This may take a few minutes..."

$PIP_CMD install --upgrade pip --quiet

if [ -f "$SCRIPT_DIR/requirements.txt" ]; then
    $PIP_CMD install -r "$SCRIPT_DIR/requirements.txt"
    echo "✓ Dependencies installed from requirements.txt"
else
    echo "Installing individual packages..."
    $PIP_CMD install "pandas>=2.0.0" "numpy>=1.24.0" "matplotlib>=3.6.0" "seaborn>=0.12.0"
    echo "✓ Dependencies installed"
fi

# Test installation
echo ""
echo "🧪 Testing installation..."
if [ -f "$SCRIPT_DIR/test-analysis-logic.py" ]; then
    $PYTHON_CMD "$SCRIPT_DIR/test-analysis-logic.py"
else
    echo "⚠️  test-analysis-logic.py not found, skipping test."
fi

echo ""
echo "✨ Setup complete! Here's how to use the analysis tools:"
echo ""
echo "💡 Activate the venv in your shell before running scripts:"
echo "   source $VENV_DIR/bin/activate"
echo ""

# Usage examples
# cat << 'EOF'
# 📊 USAGE EXAMPLES
# =================

# 1. Generate Sample Data (for testing):
#    python generate-sample-data.py 5000 sample_transactions.csv

# 2. Analyze Real Transaction Data:
#    python analyze-credit-transactions.py your_transactions.csv

# 3. Create Visualizations:
#    python visualize-transactions.py your_transactions.csv

# 4. Clean Data First (if needed):
#    python clean-transactions.py raw_data.csv
#    python analyze-credit-transactions.py raw_data_cleaned.csv

# 📋 EXPECTED CSV FORMAT
# ======================

# Your CSV should have these columns:
# - created_at      (timestamp: YYYY-MM-DD HH:MM:SS)
# - type           (string: 'purchase', 'topup', 'usage', 'freemium')
# - user_id        (string: unique user identifier)
# - metadata       (JSON string with dollarAmount field)
# - amount         (integer: credit amount)

# Example CSV row:
# uuid1,user123,1000,topup,"Credit purchase",2024-01-15 10:30:00,2024-01-15 10:30:00,"{""dollarAmount"":9.99}",stripe_pi_abc123,sub_xyz789

# 🔍 WHAT YOU'LL GET
# ==================

# Analysis Output:
# - Month-to-date vs previous month comparisons
# - Peak usage hours and days
# - User behavior segmentation
# - Revenue insights and trends
# - Key recommendations

# Visualization Files:
# - *_dashboard.png         (comprehensive overview)
# - *_hourly_heatmap.png   (hour vs day patterns)
# - *_monthly_trends.png   (trend analysis)
# - *_user_behavior.png    (user segmentation)
# - *_daily_patterns.png   (daily usage patterns)
# - *_transaction_types.png (transaction analysis)

# 📈 SUPABASE EXPORT QUERY
# =========================

# Use this SQL to export data from your Supabase database:

# SELECT
#     id,
#     user_id,
#     amount,
#     type,
#     description,
#     created_at,
#     updated_at,
#     metadata,
#     reference_id,
#     subscription_id
# FROM credit_transactions
# WHERE created_at >= NOW() - INTERVAL '6 months'
#     AND type IN ('purchase', 'topup')
# ORDER BY created_at DESC;

# 🆘 TROUBLESHOOTING
# ==================

# Issue: "ModuleNotFoundError"
# Fix: Run this setup script or install dependencies manually

# Issue: "No data after filtering"
# Fix: Check your CSV has 'purchase' or 'topup' transaction types

# Issue: "Date parsing errors"
# Fix: Ensure created_at column is in YYYY-MM-DD HH:MM:SS format

# Issue: Charts not generating
# Fix: Install matplotlib and seaborn, check data has enough records

# 📞 NEED HELP?
# =============

# - Check README_credit_analysis.md for detailed documentation
# - Run: python test-analysis-logic.py to verify core functionality
# - Ensure your CSV matches the expected format above

# Happy analyzing! 🎉

# EOF

# echo ""
echo "🎯 Next steps:"
echo "   1. Export your credit transactions to CSV"
echo "   2. source $VENV_DIR/bin/activate"
echo "   3. cd $SCRIPT_DIR"
echo "   4. python analyze-credit-transactions.py your_file.csv"
echo "   5. python visualize-transactions.py your_file.csv"
echo ""
echo "💡 Tip: Start with sample data to test everything works:"
echo "   python generate-sample-data.py 1000 test.csv"
echo "   python analyze-credit-transactions.py test.csv"
