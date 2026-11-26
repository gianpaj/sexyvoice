import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

import { EXTERNAL_API_ERROR_DEFINITIONS } from '@/lib/api/external-errors';

const page = '../../docs/content/docs/api-reference/error-codes.mdx';
const start = '{/* BEGIN GENERATED ERROR CODES */}';
const end = '{/* END GENERATED ERROR CODES */}';

it('documents the external API error definitions', async () => {
  const current = readFileSync(new URL(page, import.meta.url), 'utf8');
  const [before, section, ...extraStarts] = current.split(start);
  const [table, after, ...extraEnds] = section?.split(end) ?? [];
  if (
    before === undefined ||
    table === undefined ||
    after === undefined ||
    extraStarts.length ||
    extraEnds.length
  ) {
    throw new Error(
      'Expected one generated error-code section in the MDX page.',
    );
  }

  const rows = new Map<string, string>();
  for (const definition of Object.values(EXTERNAL_API_ERROR_DEFINITIONS)) {
    const { code, message, status, type } = definition;
    const identity = `${status}|${code}|${type}`;
    if ('meaning' in definition || !rows.has(identity)) {
      const meaning = 'meaning' in definition ? definition.meaning : message;
      rows.set(
        identity,
        `| ${status} | \`${code}\` | \`${type}\` | ${meaning.replaceAll('|', '\\|')} |`,
      );
    }
  }

  const generated = [
    '| HTTP | Code | Type | Meaning |',
    '| --- | --- | --- | --- |',
    ...[...rows].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row),
  ].join('\n');
  const expected = `${before}${start}\n\n${generated}\n\n${end}${after}`;

  await expect(
    expected,
    'Refresh the table with pnpm --filter @sexyvoice/web api-errors:docs',
  ).toMatchFileSnapshot(page);
});
