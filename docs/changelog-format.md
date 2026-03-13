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
- Organize each release by feature area, omitting empty sections.
- Prefer these subsections when they apply:

```md
### API
### Voice generation
### Cloning
### Internal
```

## Writing rules

- Write entries from the user's perspective, not as copied git log lines.
- Keep bullets specific; avoid vague summaries like "bug fixes" or
  "performance improvements" without details.
- Only include items supported by repo history.
- Link PRs inline when available.
- Put each bullet under the most relevant feature area instead of
  separating by `Added`/`Changed`/`Fixed`.
- If a change came from direct commits instead of a PR, describe the
  user-facing outcome without inventing extra scope.
- Do not add speculative items, placeholders, or future work.

## Release template

```md
# Changelog

## [2026.3.13] - 2026-03-13

### API
- Improved an API response with a supporting PR link. [#123](https://github.com/gianpaj/sexyvoice/pull/123)

### Voice generation
- Updated voice generation behavior with clear user-facing wording.

### Internal
- Corrected a shipped internal regression with specific impact.
```

## Checklist for future updates

- Confirm the release version in `package.json`.
- Confirm every item is supported by merged PRs or direct commits.
- Group items into the relevant feature areas.
- Keep the newest release at the top.
- Leave `Changelog.md` as the canonical file name unless the repo
  standardizes on a different one later.
