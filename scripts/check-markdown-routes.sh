#!/bin/bash

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
BLOG_SLUG="${BLOG_SLUG:-hello-from-sexyvoice}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS_COUNT=0
FAIL_COUNT=0

green() {
  printf '\033[32m%s\033[0m\n' "$1"
}

red() {
  printf '\033[31m%s\033[0m\n' "$1"
}

yellow() {
  printf '\033[33m%s\033[0m\n' "$1"
}

section() {
  printf '\n== %s ==\n' "$1"
}

record_pass() {
  PASS_COUNT=$((PASS_COUNT + 1))
  green "PASS: $1"
}

record_fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  red "FAIL: $1"
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local label="$3"

  if [ "$actual" = "$expected" ]; then
    record_pass "$label"
  else
    record_fail "$label (expected '$expected', got '$actual')"
  fi
}

assert_contains() {
  local actual="$1"
  local expected_substring="$2"
  local label="$3"

  case "$actual" in
    *"$expected_substring"*)
      record_pass "$label"
      ;;
    *)
      record_fail "$label (expected to contain '$expected_substring', got '$actual')"
      ;;
  esac
}

run_curl() {
  local url="$1"
  local accept_header="${2:-}"
  local prefix="$3"

  local headers_file="${TMP_DIR}/${prefix}.headers"
  local body_file="${TMP_DIR}/${prefix}.body"

  if [ -n "$accept_header" ]; then
    curl -sS -D "$headers_file" -o "$body_file" -H "Accept: ${accept_header}" "$url"
  else
    curl -sS -D "$headers_file" -o "$body_file" "$url"
  fi
}

status_code() {
  local prefix="$1"
  awk 'toupper($1) ~ /^HTTP\// { code=$2 } END { print code }' "${TMP_DIR}/${prefix}.headers"
}

header_value() {
  local prefix="$1"
  local header_name="$2"

  awk -v header_name="$header_name" '
    BEGIN {
      wanted = tolower(header_name)
    }
    {
      line = $0
      sub(/\r$/, "", line)
      lower = tolower(line)
      if (index(lower, wanted ":") == 1) {
        value = substr(line, length(header_name) + 2)
      }
    }
    END {
      print value
    }
  ' "${TMP_DIR}/${prefix}.headers"
}

body_head() {
  local prefix="$1"
  head -c 200 "${TMP_DIR}/${prefix}.body"
}

check_markdown_response() {
  local prefix="$1"
  local label="$2"

  local status
  local content_type
  local vary
  local body_preview

  status="$(status_code "$prefix")"
  content_type="$(header_value "$prefix" "Content-Type")"
  vary="$(header_value "$prefix" "Vary")"
  body_preview="$(body_head "$prefix")"

  assert_equals "$status" "200" "$label status"
  assert_contains "$content_type" "text/markdown" "$label content-type"
  assert_contains "$vary" "Accept" "$label vary header"
  assert_contains "$body_preview" "#" "$label body looks like markdown"
}

check_html_response() {
  local prefix="$1"
  local label="$2"

  local status
  local content_type
  local body_preview
  local robots_tag

  status="$(status_code "$prefix")"
  content_type="$(header_value "$prefix" "Content-Type")"
  body_preview="$(body_head "$prefix")"
  robots_tag="$(header_value "$prefix" "X-Robots-Tag")"

  assert_equals "$status" "200" "$label status"
  assert_contains "$content_type" "text/html" "$label content-type"

  case "$body_preview" in
    *"<!DOCTYPE html>"*|*"<html"*)
      record_pass "$label body looks like html"
      ;;
    *)
      record_fail "$label body looks like html (expected HTML document, got '$body_preview')"
      ;;
  esac

  if [ -n "$robots_tag" ]; then
    record_fail "$label should not include markdown robots header (got '$robots_tag')"
  else
    record_pass "$label does not include markdown robots header"
  fi
}

check_rewrite_header() {
  local prefix="$1"
  local expected="$2"
  local label="$3"

  local rewrite_header
  rewrite_header="$(header_value "$prefix" "x-middleware-rewrite")"
  assert_contains "$rewrite_header" "$expected" "$label rewrite header"
}

section "Markdown route validation"
yellow "Base URL: ${BASE_URL}"
yellow "Blog slug: ${BLOG_SLUG}"

section "Direct .md routes"

run_curl "${BASE_URL}/en/index.md" "" "landing_md"
check_markdown_response "landing_md" "landing .md"

run_curl "${BASE_URL}/en/blog.md" "" "blog_index_md"
check_markdown_response "blog_index_md" "blog index .md"

run_curl "${BASE_URL}/en/blog/${BLOG_SLUG}.md" "" "blog_post_md"
check_markdown_response "blog_post_md" "blog post .md"
check_rewrite_header "blog_post_md" "/markdown-internal/blog/en/${BLOG_SLUG}" "blog post .md"

run_curl "${BASE_URL}/en/privacy-policy.md" "" "privacy_md"
check_markdown_response "privacy_md" "privacy policy .md"

run_curl "${BASE_URL}/en/terms.md" "" "terms_md"
check_markdown_response "terms_md" "terms .md"

section "Accept: text/markdown negotiation"

run_curl "${BASE_URL}/en" "text/markdown" "landing_accept"
check_markdown_response "landing_accept" "landing accept markdown"

run_curl "${BASE_URL}/en/blog" "text/markdown" "blog_index_accept"
check_markdown_response "blog_index_accept" "blog index accept markdown"

run_curl "${BASE_URL}/en/blog/${BLOG_SLUG}" "text/markdown" "blog_post_accept"
check_markdown_response "blog_post_accept" "blog post accept markdown"
check_rewrite_header "blog_post_accept" "/markdown-internal/blog/en/${BLOG_SLUG}" "blog post accept rewrite header"

run_curl "${BASE_URL}/en/privacy-policy" "text/markdown" "privacy_accept"
check_markdown_response "privacy_accept" "privacy policy accept markdown"

run_curl "${BASE_URL}/en/terms" "text/markdown" "terms_accept"
check_markdown_response "terms_accept" "terms accept markdown"

section "Routes without markdown Accept header stay HTML"

run_curl "${BASE_URL}/en" "" "landing_html"
check_html_response "landing_html" "landing html"

run_curl "${BASE_URL}/en/blog" "" "blog_index_html"
check_html_response "blog_index_html" "blog index html"

run_curl "${BASE_URL}/en/blog/${BLOG_SLUG}" "" "blog_post_html"
check_html_response "blog_post_html" "blog post html"

run_curl "${BASE_URL}/en/privacy-policy" "" "privacy_html"
check_html_response "privacy_html" "privacy policy html"

run_curl "${BASE_URL}/en/terms" "" "terms_html"
check_html_response "terms_html" "terms html"

section "Summary"
printf 'Passed: %s\n' "$PASS_COUNT"
printf 'Failed: %s\n' "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

green "All markdown route checks passed."
