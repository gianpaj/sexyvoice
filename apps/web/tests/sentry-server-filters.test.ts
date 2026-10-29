import type { ErrorEvent } from '@sentry/nextjs';
import { describe, expect, it } from 'vitest';

import {
  CANCELLED_CHARGE_FLOW,
  ignoredServerSpans,
  sanitizeServerEvent,
} from '@/lib/sentry/server-filters';

describe('sanitizeServerEvent', () => {
  it('removes SDK-enriched content from retained-cancellation-charge events', () => {
    const event: ErrorEvent = {
      breadcrumbs: [{ message: 'Private transcript' }],
      contexts: { ai: { input: 'Private transcript' } },
      environment: 'production',
      extra: {
        creditsDebited: 25,
        model: 'test-model',
        text: 'Private transcript',
      },
      fingerprint: [CANCELLED_CHARGE_FLOW],
      level: 'warning',
      message: 'Voice generation charge retained after cancellation',
      request: {
        data: { styleVariant: 'Private style', text: 'Private transcript' },
        headers: { authorization: 'private-token' },
        url: 'https://sexyvoice.ai/api/generate-voice',
      },
      tags: {
        flow: CANCELLED_CHARGE_FLOW,
        text: 'Private transcript',
        transport: 'json',
      },
      type: undefined,
      user: {
        email: 'private@example.com',
        id: 'user-1',
        ip_address: '192.0.2.1',
      },
    };

    const result = sanitizeServerEvent(event);
    expect(result).toEqual({
      breadcrumbs: undefined,
      contexts: undefined,
      environment: 'production',
      extra: { creditsDebited: 25, model: 'test-model' },
      fingerprint: [CANCELLED_CHARGE_FLOW],
      level: 'warning',
      message: event.message,
      request: undefined,
      tags: { flow: CANCELLED_CHARGE_FLOW, transport: 'json' },
      user: { id: 'user-1' },
    });
    expect(JSON.stringify(result)).not.toContain('Private');
  });

  it('leaves unrelated events unchanged', () => {
    const event: ErrorEvent = {
      message: 'Other error',
      request: { data: { operation: 'test' } },
      type: undefined,
    };
    expect(sanitizeServerEvent(event)).toBe(event);
  });
});

describe('ignoredServerSpans', () => {
  const [{ name, op }] = ignoredServerSpans;

  it('matches the SDK upload to Sentry ingest', () => {
    expect(op).toBe('http.client');
    expect(
      name.test(
        'POST https://o4509116858695680.ingest.de.sentry.io/api/4509116876193872/envelope/',
      ),
    ).toBe(true);
  });

  it('keeps other outgoing requests and the browser tunnel', () => {
    expect(
      name.test('POST https://generativelanguage.googleapis.com/v1beta'),
    ).toBe(false);
    expect(name.test('POST /monitoring')).toBe(false);
  });
});
