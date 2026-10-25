import { createServer, type IncomingHttpHeaders } from 'node:http';
// biome-ignore lint/performance/noNamespaceImport: exercise the real Sentry SDK
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@supabase/supabase-js';
import { server as mockServer } from '@tests/setup';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  sanitizeSupabaseBreadcrumb,
  sanitizeSupabaseEvent,
  sanitizeSupabaseSpan,
  sanitizeSupabaseTransaction,
} from '@/lib/sentry/supabase-privacy';
import { instrumentSupabase } from '@/lib/supabase/tracing';

vi.unmock('@sentry/nextjs');

type Transport = ReturnType<
  NonNullable<Parameters<typeof Sentry.init>[0]['transport']>
>;
type Envelope = Parameters<Transport['send']>[0];
type SpanJSON = ReturnType<typeof Sentry.spanToJSON>;
const envelopes: Envelope[] = [];
const rawHttpSpans: SpanJSON[] = [];
const requests: {
  url: string;
  method: string;
  headers: IncomingHttpHeaders;
  body: string;
}[] = [];
const privateFilter = 'private-filter@example.invalid';
const privateBody = 'private-mutation-content';
const privateError = 'private-database-error-details';
let origin: string;
let responseStatus = 200;
let responseBody: unknown = [];

const responder = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  requests.push({
    body: Buffer.concat(chunks).toString(),
    headers: request.headers,
    method: request.method ?? '',
    url: request.url ?? '',
  });
  response.writeHead(responseStatus, {
    'content-range': '0-0/1',
    'content-type': 'application/json',
  });
  response.end(JSON.stringify(responseBody));
});

function client() {
  const raw = createClient(origin, 'sb_publishable_offline', {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  expect(instrumentSupabase(raw)).toBe(raw);
  return raw;
}

function events(type: 'event' | 'transaction'): Sentry.Event[] {
  return envelopes.flatMap(([, items]) =>
    items
      .filter(([header]) => header.type === type)
      .map(([, payload]) => payload as Sentry.Event),
  );
}

async function flush() {
  expect(await Sentry.flush(5000)).toBe(true);
}

function expectPrivateDataAbsent() {
  expect(envelopes.length).toBeGreaterThan(0);
  const serialized = JSON.stringify(envelopes);
  for (const value of [
    privateFilter,
    encodeURIComponent(privateFilter),
    privateBody,
    privateError,
  ]) {
    expect(serialized).not.toContain(value);
  }
  expect(serialized).not.toContain('"db.query"');
  expect(serialized).not.toContain('"db.body"');
}

function expectHeaders(traceId: string, sampled: boolean) {
  expect(requests).toHaveLength(1);
  const w3c = requests[0].headers.traceparent;
  const sentry = requests[0].headers['sentry-trace'];
  expect(w3c).toMatch(
    new RegExp(`^00-${traceId}-[a-f0-9]{16}-${sampled ? '01' : '00'}$`),
  );
  const parentId = String(w3c).split('-')[2];
  expect(sentry).toBe(`${traceId}-${parentId}-${sampled ? '1' : '0'}`);
  return parentId;
}

function expectHttpSpan(traceId: string) {
  const parentId = expectHeaders(traceId, true);
  const spans = events('transaction').flatMap((event) => event.spans ?? []);
  const http = spans.find((span) => span.span_id === parentId);
  expect(http).toMatchObject({
    description: 'Supabase HTTP request',
    op: 'http.client',
    trace_id: traceId,
  });
  expect(http?.data).toEqual(
    expect.objectContaining({
      'http.request.method': requests[0].method,
      'http.response.status_code': responseStatus,
      'url.full': `${origin}${requests[0].url.split('?')[0]}`,
    }),
  );
  expect(rawHttpSpans.length).toBeGreaterThan(0);
}

beforeAll(async () => {
  // MSW wraps global fetch. Remove it so Undici's real diagnostics pipeline runs.
  mockServer.close();
  await new Promise<void>((resolve, reject) => {
    responder.once('error', reject);
    responder.listen(0, '127.0.0.1', () => {
      responder.removeListener('error', reject);
      resolve();
    });
  });
  const address = responder.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing loopback server address');
  origin = `http://127.0.0.1:${address.port}`;

  Sentry.init({
    beforeBreadcrumb: sanitizeSupabaseBreadcrumb,
    beforeSend: sanitizeSupabaseEvent,
    beforeSendSpan: (span) => {
      if (span.op === 'http.client') rawHttpSpans.push(span);
      return sanitizeSupabaseSpan(span);
    },
    beforeSendTransaction: sanitizeSupabaseTransaction,
    dsn: 'https://public@sentry.invalid/1',
    environment: 'test',
    // Keep default outgoing fetch instrumentation; the responder is a fixture, not the app.
    integrations: [
      Sentry.httpIntegration({
        disableIncomingRequestSpans: true,
        trackIncomingRequestsAsSessions: false,
      }),
    ],
    propagateTraceparent: true,
    tracesSampleRate: 1,
    transport: () => ({
      flush: async () => true,
      send: async (envelope: Envelope) => {
        envelopes.push(envelope);
        return { statusCode: 200 };
      },
    }),
  });
  const nativeFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (url.origin !== origin)
        throw new Error(`External network request blocked: ${url.origin}`);
      return nativeFetch(input, init);
    },
  );
});

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
  envelopes.length = 0;
  rawHttpSpans.length = 0;
  requests.length = 0;
  responseStatus = 200;
  responseBody = [];
  Sentry.getCurrentScope().clear();
  Sentry.getIsolationScope().clear();
});

afterEach(async () => {
  try {
    await flush();
  } finally {
    vi.unstubAllEnvs();
  }
});

afterAll(async () => {
  try {
    await Sentry.close(5000);
  } finally {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve, reject) => {
      responder.close((error) => (error ? reject(error) : resolve()));
      responder.closeAllConnections();
    });
  }
});

describe('Sentry native HTTP propagation and Supabase privacy (loopback only)', () => {
  // Run before any table query can patch PostgREST builders.
  it.each(['rpc', 'head', 'auth', 'storage'] as const)(
    'traces a cold %s request through native fetch',
    async (kind) => {
      const supabase = client();
      let traceId = '';
      if (kind === 'auth')
        responseBody = { email: privateFilter, id: 'offline-user' };
      await Sentry.startSpan(
        { name: `offline cold ${kind}`, op: 'test' },
        async (root) => {
          traceId = root.spanContext().traceId;
          const operations = {
            auth: () => supabase.auth.getUser('offline-user-token'),
            head: () =>
              supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('email', privateFilter),
            rpc: () => supabase.rpc('lookup_profile', { search: privateBody }),
            storage: () =>
              supabase.storage
                .from('offline-bucket')
                .list('', { search: privateFilter }),
          };
          const result = await operations[kind]();
          expect(result.error).toBeNull();
          Sentry.captureMessage('offline cold request completed');
        },
      );
      await flush();
      expectHttpSpan(traceId);
      expect(requests[0].url).toContain(
        {
          auth: '/auth/v1/user',
          head: '/rest/v1/profiles',
          rpc: '/rest/v1/rpc/lookup_profile',
          storage: '/storage/v1/object/list/offline-bucket',
        }[kind],
      );
      expect(events('event')[0].breadcrumbs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              url: `${origin}${requests[0].url.split('?')[0]}`,
            }),
            type: 'http',
          }),
        ]),
      );
      expectPrivateDataAbsent();
    },
  );

  it.each(['select', 'insert', 'upsert', 'update', 'delete'] as const)(
    'keeps %s database and HTTP spans without private query or body values',
    async (operation) => {
      const table = client().from('profiles');
      let traceId = '';
      await Sentry.startSpan(
        { name: `offline ${operation}`, op: 'test' },
        async (root) => {
          traceId = root.spanContext().traceId;
          const body = { biography: privateBody, email: privateFilter };
          const queries = {
            delete: () => table.delete().select('id'),
            insert: () => table.insert([body]).select('id'),
            select: () => table.select('id'),
            update: () => table.update(body).select('id'),
            upsert: () =>
              table.upsert([body], { onConflict: 'email' }).select('id'),
          };
          const query = queries[operation]().eq('email', privateFilter);
          if (operation === 'upsert')
            expect(Reflect.get(query, 'headers')).toBeInstanceOf(Headers);
          expect((await query).error).toBeNull();
          Sentry.captureMessage('offline table request completed');
        },
      );
      await flush();
      expectHttpSpan(traceId);
      expect(requests[0].url).toContain(encodeURIComponent(privateFilter));
      expect(JSON.stringify(rawHttpSpans)).toContain(
        encodeURIComponent(privateFilter),
      );
      if (['insert', 'upsert', 'update'].includes(operation))
        expect(requests[0].body).toContain(privateBody);
      if (operation === 'upsert')
        expect(requests[0].headers.prefer).toContain(
          'resolution=merge-duplicates',
        );
      expect(events('transaction')).toHaveLength(1);
      expect(events('transaction')[0].spans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              'db.operation': operation,
              'db.table': 'profiles',
            }),
            description: expect.stringContaining('from(profiles)'),
            status: 'ok',
          }),
        ]),
      );
      expect(events('event')[0].breadcrumbs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            category: `db.${operation}`,
            message: 'Supabase operation',
            type: 'supabase',
          }),
        ]),
      );
      expectPrivateDataAbsent();
    },
  );

  it('propagates matching unsampled native headers without recording a transaction', async () => {
    const traceId = '1234567890abcdef1234567890abcdef';
    await Sentry.continueTrace(
      { baggage: undefined, sentryTrace: `${traceId}-1234567890abcdef-0` },
      () =>
        Sentry.startSpan(
          { name: 'offline unsampled', op: 'test' },
          async (span) => {
            expect(span.spanContext().traceFlags).toBe(0);
            expect(
              (
                await client()
                  .from('profiles')
                  .select('id')
                  .eq('email', privateFilter)
              ).error,
            ).toBeNull();
          },
        ),
    );
    expectHeaders(traceId, false);
    await flush();
    expect(events('transaction')).toHaveLength(0);
  });

  it('redacts native HTTP and database telemetry for a failed mutation', async () => {
    responseStatus = 400;
    responseBody = {
      code: '23505',
      details: privateFilter,
      hint: privateBody,
      message: privateError,
    };
    let traceId = '';
    await Sentry.startSpan(
      { name: 'offline failed mutation', op: 'test' },
      async (root) => {
        traceId = root.spanContext().traceId;
        const result = await client()
          .from('profiles')
          .insert({ biography: privateBody })
          .select('id')
          .eq('email', privateFilter);
        expect(result.error).toEqual(responseBody);
      },
    );
    await flush();
    expectHttpSpan(traceId);
    expect(requests[0].body).toContain(privateBody);
    const errors = events('event');
    expect(errors).toHaveLength(1);
    expect(errors[0].exception?.values).toEqual([
      expect.objectContaining({
        mechanism: expect.objectContaining({
          type: 'auto.db.supabase.postgres',
        }),
        type: 'SupabasePostgresError',
        value: 'Supabase operation failed (23505)',
      }),
    ]);
    expect(errors[0].contexts?.supabase).toEqual({ code: '23505' });
    expect(events('transaction')[0].spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            'db.operation': 'insert',
            'db.table': 'profiles',
          }),
          status: 'invalid_argument',
        }),
      ]),
    );
    expectPrivateDataAbsent();
  });
});
