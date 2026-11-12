import { describe, expect, test } from 'vitest';

import {
  summarizeContribution,
  type UsageEvent,
} from '../app/api/daily-stats/contribution';
import { resolveUsageCost, type UsageEventCostInput } from '../lib/usage-costs';

function partialCall(strategy = 'inworld_pipeline_usage'): UsageEventCostInput {
  return {
    dollar_amount: null,
    duration_seconds: 19,
    input_chars: null,
    metadata: {
      provider_cost: {
        breakdown_usd: { llm: 0.001_518, stt: 0.000_839, tts: 0 },
        missing_usage: ['tts'],
        status: 'unpriced',
        strategy,
      },
    },
    model: 'inworld-tts',
    source_type: 'live_call',
  };
}

function summarizeCalls(overrides: Partial<UsageEvent>[]) {
  return summarizeContribution(
    {
      audioUsage: {},
      calls: [],
      events: overrides.map((value, index) => ({
        ...partialCall(),
        id: `event-${index}`,
        occurred_at: '2026-11-10T02:48:21Z',
        source_id: 'call-1',
        user_id: 'user-1',
        ...value,
      })),
      linkedCallIds: [],
    },
    [],
    new Date('2026-11-10T00:00:00Z'),
    new Date('2026-11-11T00:00:00Z'),
  );
}

describe('incomplete call costs', () => {
  test.each(['inworld_pipeline_usage', 'mistral_pipeline_usage'])(
    'includes known %s components without claiming a complete price',
    (strategy) => {
      expect(resolveUsageCost(partialCall(strategy))).toEqual({
        amount: 0.002_357,
        basis: 'unknown',
      });
    },
  );

  test('does not add a realtime subtotal to its components', () => {
    const call = partialCall();
    call.metadata = {
      provider_cost: {
        breakdown_usd: {
          llm_input: 0.1,
          llm_output: 0.2,
          subtotal: 99,
          tts: 0.3,
        },
        status: 'unpriced',
        strategy: 'inworld_realtime_usage',
      },
    };
    expect(resolveUsageCost(call).amount).toBeCloseTo(0.6);
    expect(resolveUsageCost(call).basis).toBe('unknown');
  });

  test('recorded total takes precedence over component estimates', () => {
    expect(resolveUsageCost({ ...partialCall(), dollar_amount: 0.02 })).toEqual(
      {
        amount: 0.02,
        basis: 'recorded',
      },
    );
  });

  test.each(['custom_strategy', 'constructor', '__proto__', undefined])(
    'does not price an unsupported strategy %s',
    (strategy) => {
      const call = partialCall();
      call.metadata = {
        provider_cost: {
          breakdown_usd: { llm: 99 },
          status: 'unpriced',
          strategy,
        },
      };
      expect(resolveUsageCost(call)).toEqual({ amount: 0, basis: 'unknown' });
    },
  );

  test('invalid component values cannot reduce or corrupt known spend', () => {
    const call = partialCall();
    call.metadata = {
      provider_cost: {
        breakdown_usd: { llm: 0.1, stt: -3, tts: 'invalid' },
        status: 'unpriced',
        strategy: 'inworld_pipeline_usage',
      },
    };
    expect(resolveUsageCost(call)).toEqual({ amount: 0.1, basis: 'unknown' });
  });

  test('contribution includes the known spend and keeps the coverage gap', () => {
    const summary = summarizeContribution(
      {
        audioUsage: {},
        calls: [],
        events: [
          {
            ...partialCall(),
            id: 'event-1',
            occurred_at: '2026-11-10T02:48:21Z',
            source_id: 'call-1',
            user_id: 'user-1',
          },
        ],
        linkedCallIds: [],
      },
      [],
      new Date('2026-11-10T00:00:00Z'),
      new Date('2026-11-11T00:00:00Z'),
    );
    expect(summary.totalCost).toBeCloseTo(0.002_357, 8);
    expect(summary.callCost).toBeCloseTo(0.002_357, 8);
    expect(summary.bases.unknown).toBe(1);
    expect(summary.bases.recorded).toBe(0);
    expect(summary.bases.estimated).toBe(0);
  });

  test('retry events do not duplicate a call cost or its coverage gap', () => {
    const summary = summarizeCalls([
      {},
      { occurred_at: '2026-11-10T02:48:22Z' },
    ]);
    expect(summary.totalCost).toBeCloseTo(0.002_357, 8);
    expect(summary.bases.unknown).toBe(1);
  });

  test.each([false, true])(
    'a complete recorded cost wins over a later incomplete retry, reversed=%s',
    (reversed) => {
      const events = [
        { dollar_amount: 0.02 },
        { occurred_at: '2026-11-10T02:48:22Z' },
      ];
      const summary = summarizeCalls(reversed ? events.reverse() : events);
      expect(summary.totalCost).toBeCloseTo(0.02, 8);
      expect(summary.bases.recorded).toBe(1);
      expect(summary.bases.unknown).toBe(0);
    },
  );

  test('the latest partial snapshot wins without adding the earlier snapshot', () => {
    const summary = summarizeCalls([
      {
        metadata: {
          provider_cost: {
            breakdown_usd: { llm: 0.01 },
            status: 'unpriced',
            strategy: 'inworld_pipeline_usage',
          },
        },
        occurred_at: '2026-11-10T02:48:22Z',
      },
      {},
    ]);
    expect(summary.totalCost).toBeCloseTo(0.01, 8);
    expect(summary.bases.unknown).toBe(1);
  });

  test('different calls and events without a call link remain separate', () => {
    const summary = summarizeCalls([
      {},
      { source_id: 'call-2' },
      { source_id: null },
      { source_id: null },
    ]);
    expect(summary.totalCost).toBeCloseTo(4 * 0.002_357, 8);
    expect(summary.bases.unknown).toBe(4);
  });
});
