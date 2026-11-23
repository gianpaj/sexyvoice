import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { changelogReleases } from '@/data/changelog';

// `Changelog.md` lives at the repository root, two levels above `apps/web`.
const changelogMd = readFileSync(
  fileURLToPath(new URL('../../../Changelog.md', import.meta.url)),
  'utf8',
);

/** Parses `## [<version>] - <YYYY-MM-DD>` headers from `Changelog.md`. */
function documentedReleases() {
  const headers = [
    ...changelogMd.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm),
  ];
  return headers.map(([, version, date]) => ({ date, version }));
}

describe('changelog data', () => {
  const documented = documentedReleases();

  it('covers every release documented in Changelog.md', () => {
    expect(changelogReleases.map((release) => release.version)).toEqual(
      documented.map((release) => release.version),
    );
  });

  it('matches the documented release dates', () => {
    for (const release of changelogReleases) {
      const match = documented.find(
        (entry) => entry.version === release.version,
      );
      expect(
        match,
        `release ${release.version} missing from Changelog.md`,
      ).toBeDefined();
      expect(release.date).toBe(match?.date);
    }
  });

  it('lists the newest release first', () => {
    expect(changelogReleases[0]?.version).toBe(documented[0]?.version);
    expect(changelogReleases[0]?.date).toBe(documented[0]?.date);
  });

  it('only uses ISO dates and known change types', () => {
    for (const release of changelogReleases) {
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const entry of release.entries) {
        expect(['added', 'changed', 'fixed']).toContain(entry.type);
        expect(entry.text.length).toBeGreaterThan(0);
      }
    }
  });
});
