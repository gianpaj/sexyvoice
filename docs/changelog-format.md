# Changelog Format

Use [`Changelog.md`](../Changelog.md) as the release log for completed
releases only.

## Required format

- Keep releases in reverse chronological order.
- Do not add an `Unreleased` section.
- Use ISO 8601 dates: `YYYY-MM-DD`.
- Use this header format for each release:

```md
## [<package-version>] - <YYYY-MM-DD>
```

- The version in the release header must match `package.json`.
- Organize each release with these subsections, omitting empty ones:

```md
### Added
### Changed
### Fixed
```

## Writing rules

- Write entries from the user's perspective, not as copied git log lines.
- Keep bullets specific; avoid vague summaries like "bug fixes" or
  "performance improvements" without details.
- Only include items supported by repo history.
- Link PRs inline when available.
- If a change came from direct commits instead of a PR, describe the
  user-facing outcome without inventing extra scope.
- Do not add speculative items, placeholders, or future work.

## Release template

```md
# Changelog

## [2026.3.13] - 2026-03-13

### Added
- New release feature with a supporting PR link. [#123](https://github.com/gianpaj/sexyvoice/pull/123)

### Changed
- Updated an existing flow with clear user-facing wording.

### Fixed
- Corrected a shipped regression with specific impact.
```

## Checklist for future updates

- Confirm the release version in `package.json`.
- Confirm every item is supported by merged PRs or direct commits.
- Group items into `Added`, `Changed`, and `Fixed`.
- Keep the newest release at the top.
- Leave `Changelog.md` as the canonical file name unless the repo
  standardizes on a different one later.
