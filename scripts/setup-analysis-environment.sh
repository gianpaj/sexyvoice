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

echo ""
echo "✨ Setup complete. Activate the venv in your shell before running scripts:"
echo "   source $VENV_DIR/bin/activate"
echo ""
echo "🎯 Next steps:"
echo "   1. Export your credit transactions to CSV"
echo "   2. source $VENV_DIR/bin/activate"
echo "   3. cd $SCRIPT_DIR"
echo "   4. python analyze-credit-transactions.py your_file.csv"
echo "   5. python visualize-transactions.py your_file.csv"
