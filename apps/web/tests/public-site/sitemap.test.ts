import { describe, expect, it, vi } from 'vitest';

import sitemap from '@/app/sitemap';

vi.mock('contentlayer/generated', () => import('./content-fixtures'));

describe('sitemap', () => {
  it('lists the public pages and posts of every locale', async () => {
    const entries = (await sitemap()).toSorted((a, b) =>
      a.url.localeCompare(b.url),
    );
    expect(
      entries.map((entry) => ({
        ...entry,
        // Page files report their checkout time, which differs per machine.
        lastModified: entry.url.includes('/blog/')
          ? entry.lastModified
          : '<page file mtime>',
      })),
    ).toMatchSnapshot();
  });
});
