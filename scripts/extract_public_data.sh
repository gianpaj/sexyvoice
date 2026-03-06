#!/bin/bash

# Script to extract restorable data from a full pg_dump data file.
# It keeps:
#   - Session/encoding preamble
#   - COPY blocks for "public".* tables
#   - COPY blocks for "auth"."users" and "auth"."identities" (needed for local login)
#   - setval() calls for public schema sequences
#   - Closing RESET ALL
#
# Everything else (auth audit logs, sessions, tokens, storage, etc.) is filtered
# out to avoid version-mismatch errors when restoring to a local Supabase instance.
#
# Usage:   ./scripts/extract_public_data.sh <input_data.sql> [output_file.sql]
# Example: ./scripts/extract_public_data.sh backups/2026-03-03T13_55_34_data.sql
#          ./scripts/extract_public_data.sh backups/2026-03-03T13_55_34_data.sql backups/2026-03-03T13_55_34_data_public_only.sql

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Arguments ────────────────────────────────────────────────────────────────

INPUT_FILE="$1"
OUTPUT_FILE="$2"

if [ -z "$INPUT_FILE" ]; then
  print_error "No input file specified."
  echo "Usage: $0 <input_data.sql> [output_file.sql]"
  exit 1
fi

if [ ! -f "$INPUT_FILE" ]; then
  print_error "Input file not found: $INPUT_FILE"
  exit 1
fi

# Derive default output path: replace _data.sql → _data_public_only.sql
# or append _public_only before the .sql extension.
if [ -z "$OUTPUT_FILE" ]; then
  if [[ "$INPUT_FILE" == *_data.sql ]]; then
    OUTPUT_FILE="${INPUT_FILE%_data.sql}_data_public_only.sql"
  else
    OUTPUT_FILE="${INPUT_FILE%.sql}_public_only.sql"
  fi
fi

print_info "Input  : $INPUT_FILE"
print_info "Output : $OUTPUT_FILE"

# ── Extract ──────────────────────────────────────────────────────────────────
#
# Strategy (pure awk, single pass, no temp files):
#
#   1. Print the standard preamble lines (SET/SELECT statements at the top).
#   2. When a COPY line is encountered:
#        - "public".*             → capture (needed for app data)
#        - "auth"."users"         → capture (needed so local logins work)
#        - "auth"."identities"    → capture (needed for OAuth/email identity records)
#        - anything else          → skip until the terminating "\." line
#   3. Print setval() calls that reference the "public" schema.
#   4. Print the closing RESET ALL.

awk '
BEGIN {
    in_keep_copy  = 0   # currently inside a COPY block we want to keep
    in_skip_copy  = 0   # currently inside a COPY block we are discarding
    preamble_done = 0   # have we seen the first COPY line yet?
}

# ── Header comment block (-- lines before first COPY) ──────────────────────
/^--/ && !preamble_done {
    print
    next
}

# ── Preamble SET/SELECT lines ───────────────────────────────────────────────
/^SET |^SELECT pg_catalog\.set_config/ && !preamble_done {
    print
    next
}

# ── Blank lines in preamble ─────────────────────────────────────────────────
/^$/ && !preamble_done {
    print
    next
}

# ── COPY line: decide whether to capture ────────────────────────────────────
/^COPY / {
    preamble_done = 1
    if ($0 ~ /^COPY "public"\./ ||
        $0 ~ /^COPY "auth"\."users"/ ||
        $0 ~ /^COPY "auth"\."identities"/) {
        in_keep_copy = 1
        in_skip_copy = 0
        print
    } else {
        in_keep_copy = 0
        in_skip_copy = 1
    }
    next
}

# ── Terminator line "\." ──────────────────────────────────────────────────────
/^\\./ {
    if (in_keep_copy) {
        print
        in_keep_copy = 0
    } else if (in_skip_copy) {
        in_skip_copy = 0
    }
    next
}

# ── Data rows inside a kept COPY block ───────────────────────────────────────
in_keep_copy {
    print
    next
}

# ── Data rows inside a skipped COPY block ────────────────────────────────────
in_skip_copy {
    next
}

# ── setval() for public sequences ────────────────────────────────────────────
/^SELECT pg_catalog\.setval\('"'"'"public"/ {
    print
    next
}

# ── Closing footer ────────────────────────────────────────────────────────────
/^RESET ALL/ {
    print
    next
}

# ── Comment/blank lines between blocks (after preamble) ──────────────────────
preamble_done && /^--/ { print; next }
preamble_done && /^$/  { print; next }

' "$INPUT_FILE" > "$OUTPUT_FILE"

# ── Verify output ─────────────────────────────────────────────────────────────

PUBLIC_COPY_COUNT=$(grep -c '^COPY "public"\.'        "$OUTPUT_FILE" 2>/dev/null || true)
AUTH_COPY_COUNT=$(grep -c   '^COPY "auth"\.'          "$OUTPUT_FILE" 2>/dev/null || true)
TOTAL_COPY_COUNT=$(grep -c  '^COPY '                  "$OUTPUT_FILE" 2>/dev/null || true)
UNEXPECTED_COUNT=$(( TOTAL_COPY_COUNT - PUBLIC_COPY_COUNT - AUTH_COPY_COUNT ))

INPUT_LINES=$(wc -l < "$INPUT_FILE")
OUTPUT_LINES=$(wc -l < "$OUTPUT_FILE")

print_info "Done."
print_info "  Public COPY blocks       : $PUBLIC_COPY_COUNT"
print_info "  Auth COPY blocks kept    : $AUTH_COPY_COUNT (users + identities)"
if [ "$UNEXPECTED_COUNT" -gt 0 ]; then
  print_warning "  Unexpected COPY blocks   : $UNEXPECTED_COUNT (review output)"
else
  print_info "  Unexpected COPY blocks   : 0"
fi
print_info "  Input  lines : $INPUT_LINES"
print_info "  Output lines : $OUTPUT_LINES"
print_info "Output written to: $OUTPUT_FILE"
