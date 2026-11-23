// Release metadata shown in the dashboard sidebar's changelog panel.
// Mirrors the release log in `Changelog.md` at the repository root:
// add an entry here (and keep reverse chronological order) whenever a new
// release section is added there, plus matching `area`/`text` copy in
// `sidebar.changelogReleases` inside `apps/web/messages/*.json`, aligned by
// index. `tests/changelog.test.ts` checks that everything stays in sync.

export type ChangelogChangeType = 'added' | 'changed' | 'fixed';

export interface ChangelogEntry {
  /** PR numbers that shipped the change, linked in the panel. */
  prs?: number[];
  type: ChangelogChangeType;
}

export interface ChangelogRelease {
  /** ISO 8601 release date, e.g. "2026-09-27". */
  date: string;
  /**
   * Entries in the order they appear under the release in `Changelog.md`.
   * Localized `area`/`text` copy lives at the same indexes in
   * `sidebar.changelogReleases` inside `apps/web/messages/*.json`.
   */
  entries: ChangelogEntry[];
  /** Release version matching `apps/web/package.json` at release time. */
  version: string;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a `YYYY-MM-DD` release date as a UTC calendar day, so formatting it
 * in UTC shows the same day in every time zone. Returns `null` when the value
 * is not a real calendar date (e.g. "2026-02-31").
 */
export function parseChangelogDate(date: string): Date | null {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
    ? parsed
    : null;
}

export const changelogReleases: ChangelogRelease[] = [
  {
    date: '2026-09-27',
    entries: [
      { prs: [590], type: 'added' },
      { prs: [590], type: 'added' },
      { prs: [590], type: 'added' },
      { prs: [590], type: 'added' },
      { prs: [590], type: 'added' },
      { prs: [590], type: 'changed' },
      { prs: [593], type: 'changed' },
      { prs: [589], type: 'fixed' },
    ],
    version: '2026.9.27',
  },
  {
    date: '2026-04-07',
    entries: [{ type: 'added' }, { type: 'fixed' }],
    version: '2026.4.7',
  },
  {
    date: '2026-04-03',
    entries: [
      { prs: [325], type: 'added' },
      { type: 'added' },
      { prs: [329], type: 'changed' },
      { prs: [327], type: 'changed' },
      { prs: [329], type: 'fixed' },
      { type: 'fixed' },
      { type: 'fixed' },
      { type: 'fixed' },
    ],
    version: '2026.4.3',
  },
  {
    date: '2026-03-13',
    entries: [
      { prs: [287, 289], type: 'changed' },
      { prs: [230], type: 'changed' },
      { prs: [290, 295], type: 'changed' },
      { prs: [294], type: 'changed' },
      { prs: [288], type: 'fixed' },
      { type: 'fixed' },
      { type: 'fixed' },
      { type: 'fixed' },
      { type: 'fixed' },
    ],
    version: '2026.3.13',
  },
];
