import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { changelogReleases, parseChangelogDate } from '@/data/changelog';

// `Changelog.md` lives at the repository root, two levels above `apps/web`.
const changelogMd = readFileSync(
  fileURLToPath(new URL('../../../Changelog.md', import.meta.url)),
  'utf8',
);

interface DocumentedEntry {
  area: string;
  prs: number[];
  text: string;
  type: string;
}

interface DocumentedRelease {
  date: string;
  entries: DocumentedEntry[];
  version: string;
}

const CHANGE_TYPE_BY_HEADING: Record<string, string> = {
  Added: 'added',
  Changed: 'changed',
  Fixed: 'fixed',
};

const PR_LINK_PATTERN = /\s*\[#(\d+)\]\([^)]*\)/g;

/**
 * Parses `Changelog.md` into the shape the dashboard panel renders: one
 * release per `## [<version>] - <date>` header, one entry per `- ` bullet,
 * with `###` sections as change types, `####` subheadings as areas, and
 * `[#n](...)` links as PR numbers.
 */
function documentedReleases(): DocumentedRelease[] {
  const releases: DocumentedRelease[] = [];
  let release: DocumentedRelease | undefined;
  let area = '';
  let type = '';
  let pending: { area: string; markdown: string; type: string } | undefined;

  const flushPending = () => {
    if (!(release && pending)) {
      return;
    }
    release.entries.push({
      area: pending.area,
      prs: [...pending.markdown.matchAll(/\[#(\d+)\]\([^)]*\)/g)].map((match) =>
        Number(match[1]),
      ),
      text: pending.markdown
        .replace(PR_LINK_PATTERN, '')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
      type: pending.type,
    });
    pending = undefined;
  };

  for (const line of changelogMd.split('\n')) {
    const trimmed = line.trim();
    const header = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/.exec(
      trimmed,
    );
    if (header) {
      flushPending();
      release = { date: header[2], entries: [], version: header[1] };
      releases.push(release);
      continue;
    }
    const changeType = /^### (.+)$/.exec(trimmed);
    if (changeType) {
      flushPending();
      type =
        CHANGE_TYPE_BY_HEADING[changeType[1]] ?? changeType[1].toLowerCase();
      continue;
    }
    const subheading = /^#### (.+)$/.exec(trimmed);
    if (subheading) {
      flushPending();
      area = subheading[1].trim();
      continue;
    }
    if (trimmed.startsWith('- ')) {
      flushPending();
      pending = { area, markdown: trimmed.slice(2), type };
      continue;
    }
    if (trimmed.startsWith('#')) {
      flushPending();
      continue;
    }
    if (pending && trimmed) {
      pending.markdown += ` ${trimmed}`;
    }
  }
  flushPending();
  return releases;
}

interface LocalizedReleaseCopy {
  entries?: { area?: string; text?: string }[];
}

// `sidebar.changelogReleases` per locale file, e.g. { "en.json": [...] }.
const localizedReleases: Record<string, LocalizedReleaseCopy[] | undefined> =
  Object.fromEntries(
    readdirSync(fileURLToPath(new URL('../messages/', import.meta.url)))
      .filter((file) => file.endsWith('.json'))
      .map((file) => [
        file,
        (
          JSON.parse(
            readFileSync(
              join(
                fileURLToPath(new URL('../messages/', import.meta.url)),
                file,
              ),
              'utf8',
            ),
          ) as { sidebar?: { changelogReleases?: LocalizedReleaseCopy[] } }
        ).sidebar?.changelogReleases,
      ]),
  );

const enReleases = localizedReleases['en.json'];

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

  it('mirrors every documented entry in the English copy', () => {
    expect(enReleases).toHaveLength(changelogReleases.length);
    for (const release of changelogReleases) {
      const index = changelogReleases.indexOf(release);
      const match = documented.find(
        (entry) => entry.version === release.version,
      );
      const localizedEntries = enReleases?.[index]?.entries ?? [];
      expect(
        localizedEntries,
        `release ${release.version} entry count`,
      ).toHaveLength(release.entries.length);
      expect(
        release.entries.map((entry, entryIndex) => ({
          area: localizedEntries[entryIndex]?.area,
          prs: entry.prs ?? [],
          text: localizedEntries[entryIndex]?.text,
          type: entry.type,
        })),
        `release ${release.version} entries`,
      ).toEqual(match?.entries);
    }
  });

  it('provides an entry for every release in every locale', () => {
    for (const [file, releases] of Object.entries(localizedReleases)) {
      expect(releases, `${file} sidebar.changelogReleases`).toHaveLength(
        changelogReleases.length,
      );
      for (const [index, release] of (releases ?? []).entries()) {
        const entries = release.entries ?? [];
        expect(
          entries,
          `${file} release ${changelogReleases[index]?.version}`,
        ).toHaveLength(changelogReleases[index]?.entries.length ?? 0);
        for (const entry of entries) {
          expect(entry.area?.trim().length).toBeGreaterThan(0);
          expect(entry.text?.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('only uses valid calendar dates and known change types', () => {
    for (const release of changelogReleases) {
      expect(
        parseChangelogDate(release.date),
        `release ${release.version} date ${release.date}`,
      ).not.toBeNull();
      for (const entry of release.entries) {
        expect(['added', 'changed', 'fixed']).toContain(entry.type);
      }
    }
  });

  it('lists releases newest first', () => {
    const timestamps = (releases: { date: string }[]) =>
      releases.map((release) => parseChangelogDate(release.date)?.getTime());
    const descending = (dates: (number | undefined)[]) =>
      dates.every(
        (date, index) => index === 0 || (dates[index - 1] ?? 0) >= (date ?? 0),
      );

    expect(
      descending(timestamps(changelogReleases)),
      'changelogReleases order',
    ).toBe(true);
    expect(descending(timestamps(documented)), 'Changelog.md order').toBe(true);
    expect(changelogReleases[0]?.version).toBe(documented[0]?.version);
  });
});
