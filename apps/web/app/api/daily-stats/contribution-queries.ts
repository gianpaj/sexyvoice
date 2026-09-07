import type { SupabaseClient } from '@supabase/supabase-js';

import type { CallSession, ContributionData, UsageEvent } from './contribution';
import { fetchAllPages, PAGE_SIZE } from './utils';

const CALL_COLUMNS =
  'id, user_id, started_at, ended_at, duration_seconds, model, status';

// Keep UUID filters below URL-size limits and bound concurrent database reads.
async function fetchIdBatches<T>(
  ids: string[],
  fetchBatch: (batch: string[]) => Promise<T[]>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 400) {
    const batches: Promise<T[]>[] = [];
    for (let i = offset; i < Math.min(offset + 400, ids.length); i += 100) {
      batches.push(fetchBatch(ids.slice(i, i + 100)));
    }
    rows.push(...(await Promise.all(batches)).flat());
  }
  return rows;
}

export async function getContributionData(
  client: SupabaseClient,
  start: Date,
  end: Date,
  internalIds: string[],
): Promise<ContributionData> {
  const [events, windowCalls] = await Promise.all([
    fetchAllPages<UsageEvent>((offset) => {
      let query = client
        .from('usage_events')
        .select(
          'id, user_id, source_id, source_type, occurred_at, credits_used, dollar_amount, model, metadata, input_chars, duration_seconds',
        )
        .gte('occurred_at', start.toISOString())
        .lt('occurred_at', end.toISOString());
      if (internalIds.length) query = query.notIn('user_id', internalIds);
      return query
        .order('occurred_at')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
    }),
    fetchAllPages<CallSession>((offset) => {
      let query = client
        .from('call_sessions')
        .select(CALL_COLUMNS)
        .or(
          `and(ended_at.gte.${start.toISOString()},ended_at.lt.${end.toISOString()}),and(ended_at.is.null,started_at.gte.${start.toISOString()},started_at.lt.${end.toISOString()})`,
        );
      if (internalIds.length) query = query.notIn('user_id', internalIds);
      return query
        .order('started_at')
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
    }),
  ]);
  const calls = new Map(windowCalls.map((call) => [call.id, call]));
  const missingIds = [
    ...new Set(
      events
        .filter(
          (event) =>
            event.source_type === 'live_call' &&
            event.source_id &&
            !calls.has(event.source_id),
        )
        .map((event) => event.source_id as string),
    ),
  ];
  const missingCalls = await fetchIdBatches(missingIds, (ids) =>
    fetchAllPages<CallSession>((offset) =>
      client
        .from('call_sessions')
        .select(CALL_COLUMNS)
        .in('id', ids)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    ),
  );
  for (const row of missingCalls) {
    if (!internalIds.includes(row.user_id)) calls.set(row.id, row);
  }
  const eventCallIds = new Set(
    events
      .filter((event) => event.source_type === 'live_call')
      .map((event) => event.source_id),
  );
  const sessionIds = windowCalls
    .filter((call) => !eventCallIds.has(call.id))
    .map((call) => call.id);
  const links = await fetchIdBatches(sessionIds, (ids) =>
    fetchAllPages<Pick<Tables<'usage_events'>, 'source_id'>>((offset) =>
      client
        .from('usage_events')
        .select('source_id')
        .eq('source_type', 'live_call')
        .in('source_id', ids)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    ),
  );
  const linkedCallIds = links.flatMap((row) =>
    row.source_id ? [row.source_id] : [],
  );
  const audioIds = [
    ...new Set(
      events
        .filter(
          (event) =>
            ['tts', 'api_tts'].includes(event.source_type) &&
            !(event.dollar_amount !== null && event.dollar_amount > 0) &&
            event.source_id,
        )
        .map((event) => event.source_id as string),
    ),
  ];
  const audioUsage: Record<string, unknown> = {};
  const audioFiles = await fetchIdBatches(audioIds, (ids) =>
    fetchAllPages<Pick<Tables<'audio_files'>, 'id' | 'usage'>>((offset) =>
      client
        .from('audio_files')
        .select('id, usage')
        .in('id', ids)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    ),
  );
  for (const row of audioFiles) audioUsage[row.id] = row.usage;
  return { audioUsage, calls: [...calls.values()], events, linkedCallIds };
}
