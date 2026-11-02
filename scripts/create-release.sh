#!/usr/bin/env bash

set -euo pipefail

VERSION=2026.9.27
TAG=2026-09-27

test "$(node -p "require('./apps/web/package.json').version")" = "$VERSION"

release_header="## [$VERSION] - $TAG"

awk -v header="$release_header" '
BEGIN { flag = 0 }
$0 == header { flag = 1 }
/^## / && flag && $0 != header { exit }
flag { print }
' Changelog.md > "/tmp/release-notes-$TAG.md"

git tag -a "$TAG" -m "Release $VERSION"
git push origin "$TAG"

gh release create "$TAG" \
  --title "Release $VERSION" \
  --notes-file "/tmp/release-notes-$TAG.md"
