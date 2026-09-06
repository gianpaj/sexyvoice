import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ContributionCall,
  ContributionData,
  ContributionEvent,
} from './contribution';
import { fetchAllPages, PAGE_SIZE } from './utils';

const CALL_COLUMNS =
  'id, user_id, started_at, ended_at, duration_seconds, model, status';

export async function getContributionData(
  client: SupabaseClient,
  start: Date,
  end: Date,
  internalIds: string[],
): Promise<ContributionData> {
  const [events, windowCalls] = await Promise.all([
    fetchAllPages<ContributionEvent>((offset) => {
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
    fetchAllPages<ContributionCall>((offset) => {
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
  for (let i = 0; i < missingIds.length; i += 100) {
    const rows = await fetchAllPages<ContributionCall>((offset) =>
      client
        .from('call_sessions')
        .select(CALL_COLUMNS)
        .in('id', missingIds.slice(i, i + 100))
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    );
    for (const row of rows)
      if (!(row.user_id && internalIds.includes(row.user_id)))
        calls.set(row.id, row);
  }
  const linkedCallIds: string[] = [];
  const sessionIds = [...calls.keys()];
  for (let i = 0; i < sessionIds.length; i += 100) {
    const rows = await fetchAllPages<{ source_id: string }>((offset) =>
      client
        .from('usage_events')
        .select('source_id')
        .eq('source_type', 'live_call')
        .in('source_id', sessionIds.slice(i, i + 100))
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    );
    linkedCallIds.push(...rows.map((row) => row.source_id));
  }
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
  for (let i = 0; i < audioIds.length; i += 100) {
    const rows = await fetchAllPages<{ id: string; usage: unknown }>((offset) =>
      client
        .from('audio_files')
        .select('id, usage')
        .in('id', audioIds.slice(i, i + 100))
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1),
    );
    for (const row of rows) audioUsage[row.id] = row.usage;
  }
  return { audioUsage, calls: [...calls.values()], events, linkedCallIds };
}
