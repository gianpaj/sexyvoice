#!/bin/bash

# Script to determine if build should run based on changed files
# Exit code 0: Should build
# Exit code 1: Should skip build

# Set strict error handling
set -euo pipefail

# Function to log messages
log() {
  echo "[should-build] $1" >&2
}

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  log "Not in a git repository, defaulting to build"
  exit 0
fi

# Get the current commit and previous commit
CURRENT_COMMIT=${1:-HEAD}
PREVIOUS_COMMIT=${2:-HEAD^}

# Check if previous commit exists (handles initial commit case)
if ! git rev-parse --verify "$PREVIOUS_COMMIT" > /dev/null 2>&1; then
  log "Previous commit doesn't exist (initial commit?), defaulting to build"
  exit 0
fi

log "Checking changes between $PREVIOUS_COMMIT and $CURRENT_COMMIT"

# Define paths that should NOT trigger a build
SKIP_PATHS=(
  "supabase/"
  "scripts/"
  "*.md"
  ".*"
)

# Check if only skip paths were modified
build_needed=false

# Get all changed files
changed_files=$(git diff --name-only "$PREVIOUS_COMMIT" "$CURRENT_COMMIT" || true)

# If no files changed, skip build
if [ -z "$changed_files" ]; then
  log "No files changed, skipping build"
  exit 1
fi

log "Changed files:"
echo "$changed_files" | sed 's/^/  /'

# Check each changed file
while IFS= read -r file; do
  should_skip=false
  
  # Check against skip patterns
  for pattern in "${SKIP_PATHS[@]}"; do
    case "$file" in
      $pattern)
        log "File matches skip pattern '$pattern': $file"
        should_skip=true
        break
        ;;
    esac
  done
  
  # Special case: .md files in root directory only
  if [[ "$file" == *.md && ! "$file" =~ / ]]; then
    log "Root .md file found: $file"
    should_skip=true
  fi
  
  # If this file doesn't match any skip pattern, we need to build
  if [ "$should_skip" = false ]; then
    log "File requires build: $file"
    build_needed=true
    break
  fi
done <<< "$changed_files"

# Exit with appropriate code
if [ "$build_needed" = true ]; then
  log "Build needed due to non-skip file changes"
  exit 0
else
  log "All changes are in skip paths, skipping build"
  exit 1
fi