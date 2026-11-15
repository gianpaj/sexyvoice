import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const { getVoiceIdByName, getVoiceIdByNameAdmin } = await vi.importActual<
  typeof import('@/lib/supabase/queries')
>('@/lib/supabase/queries');

const { getVoiceById, getVoiceByIdAdmin } = await vi.importActual<
  typeof import('@/lib/supabase/queries')
>('@/lib/supabase/queries');

type VoiceRow = Pick<
  Tables<'voices'>,
  'id' | 'name' | 'model' | 'language' | 'created_at' | 'is_public' | 'feature'
>;

const original: VoiceRow = {
  feature: 'tts',
  created_at: '2026-09-23T00:00:00Z',
  id: '00000000-0000-4000-8000-000000000001',
  is_public: true,
  language: 'multiple',
  model: 'xai',
  name: 'kore',
};
const newer: VoiceRow = {
  ...original,
  id: '00000000-0000-4000-8000-000000000002',
  model: 'gpro38',
};

// Emulate filtering and ordered LIMIT over rows, including timestamp ties.
function database(rows: VoiceRow[]) {
  let matching = [...rows];
  const ordering: (keyof VoiceRow)[] = [];
  const query = {
    eq: (key: keyof VoiceRow, value: unknown) => {
      matching = matching.filter((row) => row[key] === value);
      return query;
    },
    in: (key: keyof VoiceRow, values: unknown[]) => {
      matching = matching.filter((row) => values.includes(row[key]));
      return query;
    },
    limit: () => query,
    order: (key: keyof VoiceRow) => {
      ordering.push(key);
      return query;
    },
    select: () => query,
    not: (key: keyof VoiceRow, _operator: string, values: string) => {
      matching = matching.filter(
        (row) => !values.slice(1, -1).split(',').includes(String(row[key])),
      );
      return query;
    },
    maybeSingle: () => {
      matching.sort((a, b) => {
        for (const key of ordering) {
          const comparison = String(a[key]).localeCompare(String(b[key]));
          if (comparison) return comparison;
        }
        return 0;
      });
      return Promise.resolve({ data: matching[0] ?? null, error: null });
    },
  };
  return { from: () => query };
}

function useRows(rows: VoiceRow[]) {
  vi.mocked(createClient).mockResolvedValue(
    database(rows) as unknown as Awaited<ReturnType<typeof createClient>>,
  );
  vi.mocked(createAdminClient).mockReturnValue(
    database(rows) as unknown as ReturnType<typeof createAdminClient>,
  );
}

beforeEach(() => vi.clearAllMocks());

for (const [label, lookup] of [
  ['session', getVoiceIdByName],
  ['admin', getVoiceIdByNameAdmin],
] as const) {
  describe(`${label} voice name lookup`, () => {
    it('resolves timestamp ties to the same ID regardless of row order', async () => {
      useRows([newer, original]);
      expect((await lookup('kore'))?.id).toBe(original.id);
      useRows([original, newer]);
      expect((await lookup('kore'))?.id).toBe(original.id);
    });

    it('keeps the oldest public row ahead of a lower ID', async () => {
      useRows([
        { ...original, created_at: '2026-09-24T00:00:00Z' },
        { ...newer, created_at: '2025-01-01T00:00:00Z', is_public: false },
        newer,
      ]);
      expect((await lookup('kore'))?.id).toBe(newer.id);
    });

    it('honors the requested model before choosing a row', async () => {
      useRows([original, newer]);
      expect((await lookup('kore', true, ['gpro38']))?.id).toBe(newer.id);
    });

    it.each(['gpro', 'gpro31'])(
      'excludes %s even when it is the oldest matching name',
      async (model) => {
        useRows([{ ...original, model }, newer]);
        expect((await lookup('kore'))?.id).toBe(newer.id);
        expect(await lookup('kore', true, [model])).toBeNull();
      },
    );
  });
}

for (const [label, lookup] of [
  ['session', getVoiceById],
  ['admin', getVoiceByIdAdmin],
] as const) {
  describe(`${label} voice UUID lookup`, () => {
    it.each(['gpro', 'gpro31'])(
      'rejects %s without selecting its 3.8 namesake',
      async (model) => {
        useRows([{ ...original, model }, newer]);
        expect(await lookup(original.id)).toBeNull();
        useRows([{ ...original, model }, newer]);
        expect((await lookup(newer.id))?.model).toBe('gpro38');
      },
    );
  });
}
