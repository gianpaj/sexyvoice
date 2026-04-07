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
- Organize each release by change type first, then by feature area.
- Omit empty change-type sections and empty feature groups.
- Use these change-type sections when they apply:

```md
### Added
### Changed
### Fixed
```

- Within each populated change-type section, group entries by feature
  area using these subheadings when they apply:

```md
#### External API
#### Voice generation
#### Cloning
#### Internal
```

## Writing rules

- Write entries from the user's perspective, not as copied git log lines.
- Keep bullets specific; avoid vague summaries like "bug fixes" or
  "performance improvements" without details.
- Only include items supported by repo history.
- Link PRs inline when available.
- Keep each bullet under the most relevant feature area within its
  `Added`/`Changed`/`Fixed` section.
- Use `External API` only for the public API under `app/api/v1/*`.
- Do not put internal app routes under `External API`; changes to
  non-`/api/v1/*` routes belong under the front-end feature they support
  or under `Internal` when they are cross-cutting.
- If a change came from direct commits instead of a PR, describe the
  user-facing outcome without inventing extra scope.
- Do not add speculative items, placeholders, or future work.

## Release template

```md
# Changelog

## [2026.3.13] - 2026-03-13

### Added

#### Cloning
- Added a cloning capability with a supporting PR link. [#123](https://github.com/gianpaj/sexyvoice/pull/123)

### Changed

#### External API
- Updated a public `/api/v1/*` capability with clear user-facing wording.

### Fixed

#### Internal
- Corrected a shipped internal regression with specific impact.
```

## Checklist for future updates

- Confirm the release version in `package.json`.
- If the public API changed, also update the API version in
  `lib/api/openapi.ts`.
- Confirm every item is supported by merged PRs or direct commits.
- Group items into `Added`, `Changed`, and `Fixed`, then by the
  relevant feature areas.
- Reserve `External API` for public `app/api/v1/*` changes only.
- Keep the newest release at the top.
- Leave `Changelog.md` as the canonical file name unless the repo
  standardizes on a different one later.
