import type { Breadcrumb, ErrorEvent, Event, spanToJSON } from '@sentry/nextjs';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';

import {
  sanitizeSupabaseBreadcrumb,
  sanitizeSupabaseEvent,
  sanitizeSupabaseSpan,
  sanitizeSupabaseTransaction,
} from '@/lib/sentry/supabase-privacy';

type SpanJSON = ReturnType<typeof spanToJSON>;
type TransactionEvent = Event & { type: 'transaction' };

const origin = 'https://project.supabase.co';
const secret = 'private-person@example.com';
const privateUrl = `${origin}/rest/v1/profiles?email=eq.${secret}#private-token`;

function span(overrides: Partial<SpanJSON> = {}): SpanJSON {
  return {
    data: { url: privateUrl },
    description: `GET ${privateUrl}`,
    op: 'http.client',
    span_id: '1234567890abcdef',
    start_timestamp: 1,
    timestamp: 2,
    trace_id: '1234567890abcdef1234567890abcdef',
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', origin);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('sanitizeSupabaseEvent', () => {
  it.each(['postgres', 'auth'])(
    'rebuilds automatic %s exceptions and error contexts',
    (kind) => {
      // Mirrors the SDK mechanisms and ErrorData/serialized-error enrichment.
      const event: ErrorEvent = {
        contexts: {
          Error: {
            details: secret,
            message: secret,
            stack: `Error: ${secret}\n at caller`,
          },
          supabase: {
            body: { email: secret },
            details: secret,
            query: [secret],
          },
          trace: {
            data: { 'db.query': secret },
            span_id: 'span',
            trace_id: 'trace',
          },
        },
        exception: {
          values: [
            {
              mechanism: {
                data: { message: secret },
                handled: false,
                type: `auto.db.supabase.${kind}`,
              },
              stacktrace: {
                frames: [{ filename: secret, vars: { details: secret } }],
              },
              type: secret,
              value: secret,
            },
            {
              stacktrace: { frames: [{ filename: secret }] },
              type: 'Error',
              value: secret,
            },
          ],
        },
        extra: {
          __serialized__: { message: secret, stack: `Error: ${secret}` },
        },
        logentry: { message: secret },
        message: secret,
        type: undefined,
      };
      const code = kind === 'postgres' ? '23505' : 'invalid_credentials';
      const originalException = Object.assign(new Error(secret), {
        code,
        details: secret,
      });
      const result = sanitizeSupabaseEvent(event, { originalException });

      expect(JSON.stringify(result)).not.toContain(secret);
      expect(result.exception?.values).toEqual([
        {
          mechanism: { handled: false, type: `auto.db.supabase.${kind}` },
          type: kind === 'auth' ? 'SupabaseAuthError' : 'SupabasePostgresError',
          value: `Supabase operation failed (${code})`,
        },
      ]);
      expect(result.contexts?.supabase).toEqual({ code });
      expect(result.contexts?.trace?.trace_id).toBe('trace');
      expect(result.extra).toBeUndefined();
      expect(result.logentry).toBeUndefined();
      expect(event.message).toBe(secret);
      expect(originalException.message).toBe(secret);
      expectTypeOf(result).toEqualTypeOf<ErrorEvent>();
      expectTypeOf(sanitizeSupabaseEvent({} as Event)).toEqualTypeOf<Event>();
    },
  );

  it.each(['23505', '42P01', 'PGRST116'])(
    'retains structured postgres code %s',
    (code) => {
      const result = sanitizeSupabaseEvent({
        contexts: { supabase: { code, details: secret } },
        exception: {
          values: [{ mechanism: { type: 'auto.db.supabase.postgres' } }],
        },
      });
      expect(result.contexts?.supabase).toEqual({ code });
    },
  );

  it.each(['postgres', 'auth'])('does not trust free-form %s codes', (kind) => {
    const result = sanitizeSupabaseEvent({
      contexts: { supabase: { code: secret } },
      exception: {
        values: [
          { mechanism: { type: `auto.db.supabase.${kind}` }, value: secret },
        ],
      },
    });
    expect(result.contexts?.supabase).toEqual({});
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each(['generic', 'auto.db.supabase.postgres.lookalike', undefined])(
    'preserves unrelated errors with mechanism %s',
    (type) => {
      const event: Event = {
        contexts: { supabase: { details: secret } },
        exception: {
          values: [{ mechanism: type ? { type } : undefined, value: secret }],
        },
        extra: { details: secret },
        message: secret,
      };
      expect(sanitizeSupabaseEvent(event)).toBe(event);
    },
  );

  it('sanitizes matching HTTP breadcrumbs and request fields without rewriting a manual exception', () => {
    const event: Event = {
      breadcrumbs: [
        { category: 'fetch', data: { 'http.query': secret, url: privateUrl } },
      ],
      exception: { values: [{ value: secret }] },
      request: {
        data: secret,
        headers: { authorization: secret },
        query_string: secret,
        url: privateUrl,
      },
    };
    const result = sanitizeSupabaseEvent(event);
    expect(result.exception).toBe(event.exception);
    expect(result.request).toEqual({ url: `${origin}/rest/v1/profiles` });
    expect(JSON.stringify(result.breadcrumbs)).not.toContain(secret);
  });
});

describe('sanitizeSupabaseBreadcrumb', () => {
  it('rebuilds SDK type=supabase breadcrumbs, including their message', () => {
    const result = sanitizeSupabaseBreadcrumb({
      category: 'db.insert',
      data: { body: { email: secret }, query: [secret] },
      message: `insert ${secret} from(profiles)`,
      timestamp: 12,
      type: 'supabase',
    });
    expect(result).toEqual({
      category: 'db.insert',
      message: 'Supabase operation',
      timestamp: 12,
      type: 'supabase',
    });
    expect(
      sanitizeSupabaseBreadcrumb({ category: secret, type: 'supabase' })
        .category,
    ).toBe('db');
  });

  it.each(['http', 'fetch', 'xhr'])(
    'sanitizes %s URLs and discards duplicated query/body/header fields',
    (category) => {
      const breadcrumb: Breadcrumb = {
        category,
        data: {
          body: secret,
          headers: { authorization: secret },
          'http.fragment': secret,
          'http.query': secret,
          method: 'GET',
          request_body: secret,
          response: secret,
          status_code: 400,
          url: privateUrl,
        },
        message: privateUrl,
        type: 'http',
      };
      expect(sanitizeSupabaseBreadcrumb(breadcrumb)).toEqual({
        category,
        data: {
          method: 'GET',
          status_code: 400,
          url: `${origin}/rest/v1/profiles`,
        },
        type: 'http',
      });
      expect(breadcrumb.data?.url).toBe(privateUrl);
    },
  );

  it('leaves unrelated categories unchanged even if they mention Supabase', () => {
    const breadcrumb = {
      category: 'console',
      data: { url: privateUrl },
      message: privateUrl,
    };
    expect(sanitizeSupabaseBreadcrumb(breadcrumb)).toBe(breadcrumb);
  });
});

describe('sanitizeSupabaseSpan', () => {
  it.each(['url', 'http.url', 'url.full'])(
    'cleans HTTP %s and separate query/fragment fields',
    (key) => {
      const input = span({
        data: {
          [key]: privateUrl,
          'http.fragment': secret,
          'http.method': 'GET',
          'http.query': secret,
          'http.request.body': secret,
          'http.status_code': 400,
          'url.fragment': secret,
          'url.query': secret,
        },
      });
      const result = sanitizeSupabaseSpan(input);
      expect(result.data).toEqual({
        [key]: `${origin}/rest/v1/profiles`,
        'http.method': 'GET',
        'http.status_code': 400,
      });
      expect(result.description).toBe('Supabase HTTP request');
      expect(result.span_id).toBe(input.span_id);
      expect(JSON.stringify(result)).not.toContain(secret);
      expect(input.data[key]).toBe(privateUrl);
    },
  );

  it.each([
    'select',
    'insert',
    'auth.signInWithPassword',
    'auth.admin.createUser',
  ])('retains known SDK operation %s without operation data', (operation) => {
    const result = sanitizeSupabaseSpan(
      span({
        data: {
          'db.body': secret,
          'db.operation': operation,
          'db.query': [secret],
          'db.schema': 'public',
          'db.table': 'profiles',
          'db.unrecognized': secret,
          'db.url': `${origin}/rest/v1?private=${secret}#token`,
        },
        description: secret,
        op: 'db',
        origin: 'auto.db.supabase',
      }),
    );
    expect(result.data['db.operation']).toBe(operation);
    expect(result.description).toBe(`Supabase ${operation} from(profiles)`);
    expect(result.data['db.table']).toBe('profiles');
    expect(result.data['db.schema']).toBe('public');
    expect(result.data['db.url']).toBe(origin);
    expect(result.data['db.unrecognized']).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it.each([
    ['select', 'from(profiles)'],
    ['select', '[redacted] from(profiles)'],
    ['insert', 'insert(...) from(profiles)'],
    ['update', 'update(...) [redacted] from(profiles)'],
    ['delete', 'delete [redacted] from(profiles)'],
  ])('preserves the safe SDK %s description %s', (operation, description) => {
    const input = span({
      data: {
        'db.operation': operation,
        'db.schema': 'public',
        'db.table': 'profiles',
        'db.url': origin,
      },
      description,
      op: 'db',
      origin: 'auto.db.supabase',
    });
    const result = sanitizeSupabaseSpan(input);
    expect(result.description).toBe(description);
    expect(result.data).toMatchObject(input.data);
    expect(sanitizeSupabaseSpan(result)).toEqual(result);
  });

  it('rebuilds a query-bearing description even without query/body attributes', () => {
    const result = sanitizeSupabaseSpan(
      span({
        data: { 'db.operation': 'select', 'db.table': 'profiles' },
        description: `eq(email, ${secret}) from(profiles)`,
        op: 'db',
        origin: 'auto.db.supabase',
      }),
    );
    expect(result.description).toBe('Supabase select from(profiles)');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('recognizes attribute origin and rejects arbitrary operation names', () => {
    const result = sanitizeSupabaseSpan(
      span({
        data: { 'db.operation': secret, 'sentry.origin': 'auto.db.supabase' },
        op: 'db',
      }),
    );
    expect(result.description).toBe('Supabase operation');
    expect(result.data['db.operation']).toBeUndefined();
  });

  it('does not rewrite manual database spans', () => {
    const input = span({ op: 'db', origin: 'manual' });
    expect(sanitizeSupabaseSpan(input)).toBe(input);
  });
});

describe('sanitizeSupabaseTransaction', () => {
  it('sanitizes HTTP roots and children while preserving trace identity', () => {
    const event: TransactionEvent = {
      contexts: {
        app: { app_name: 'web' },
        trace: {
          data: {
            'http.fragment': secret,
            'http.query': secret,
            'http.url': privateUrl,
          },
          op: 'http.client',
          span_id: 'root',
          trace_id: 'trace',
        },
      },
      spans: [span()],
      transaction: `GET ${privateUrl}`,
      type: 'transaction',
    };
    const result = sanitizeSupabaseTransaction(event);
    expect(result.transaction).toBe('Supabase HTTP request');
    expect(result.contexts?.trace).toEqual({
      data: { 'http.url': `${origin}/rest/v1/profiles` },
      op: 'http.client',
      span_id: 'root',
      trace_id: 'trace',
    });
    expect(result.contexts?.app).toBe(event.contexts?.app);
    expect(result.spans?.[0].description).toBe('Supabase HTTP request');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(event.transaction).toContain(secret);
    expectTypeOf(result).toEqualTypeOf<TransactionEvent>();
    expect(sanitizeSupabaseTransaction(result)).toEqual(result);
  });

  it.each(['[redacted] from(profiles)', `eq(email, ${secret}) from(profiles)`])(
    'sanitizes automatic DB roots with description %s',
    (description) => {
      const result = sanitizeSupabaseTransaction({
        contexts: {
          trace: {
            data: {
              'db.operation': 'select',
              'db.schema': 'public',
              'db.table': 'profiles',
              'db.url': origin,
            },
            op: 'db',
            origin: 'auto.db.supabase',
            span_id: 'root',
            trace_id: 'trace',
          },
        },
        transaction: description,
        type: 'transaction',
      });
      expect(result.transaction).toBe(
        description.includes(secret)
          ? 'Supabase select from(profiles)'
          : description,
      );
      expect(result.contexts?.trace?.data).toMatchObject({
        'db.schema': 'public',
        'db.table': 'profiles',
        'db.url': origin,
      });
      expect(JSON.stringify(result)).not.toContain(secret);
    },
  );

  it('preserves unrelated roots and children while sanitizing matching children', () => {
    const other = span({
      data: { url: `https://project.supabase.co.evil.test/?email=${secret}` },
    });
    const event: TransactionEvent = {
      contexts: {
        trace: {
          data: { custom: 'keep' },
          op: 'http.server',
          span_id: 'root',
          trace_id: 'trace',
        },
      },
      spans: [
        other,
        span(),
        span({
          data: {
            'db.body': secret,
            'db.operation': 'insert',
            'db.table': 'profiles',
          },
          description: secret,
          op: 'db',
          origin: 'auto.db.supabase',
        }),
      ],
      transaction: 'GET /dashboard',
      type: 'transaction',
    };
    const result = sanitizeSupabaseTransaction(event);
    expect(result.transaction).toBe(event.transaction);
    expect(result.contexts).toBe(event.contexts);
    expect(result.spans?.[0]).toBe(other);
    expect(result.spans?.[1].data.url).toBe(`${origin}/rest/v1/profiles`);
    expect(result.spans?.[2].description).toBe(
      'Supabase insert from(profiles)',
    );
    expect(result.spans?.[2].data['db.body']).toBeUndefined();
  });

  it('accepts transactions without trace context or children', () => {
    const event: TransactionEvent = {
      transaction: 'task',
      type: 'transaction',
    };
    expect(sanitizeSupabaseTransaction(event)).toBe(event);
  });
});

describe('exact configured HTTP origin scope', () => {
  it.each([
    'https://project.supabase.co.evil.test/rest/v1/profiles',
    'https://project-supabase.co/rest/v1/profiles',
    'https://other.supabase.co/rest/v1/profiles',
    'https://project.supabase.co@evil.test/rest/v1/profiles',
    'https://project.supabase.co:444/rest/v1/profiles',
    'http://project.supabase.co/rest/v1/profiles',
    '/rest/v1/profiles',
    'not a URL',
  ])('leaves nonmatching URL %s untouched', (base) => {
    const url = `${base}?email=${secret}#token`;
    const input = span({ data: { url }, description: `GET ${url}` });
    const breadcrumb = { category: 'http', data: { url } };
    const event: Event = { request: { url } };
    expect(sanitizeSupabaseSpan(input)).toBe(input);
    expect(sanitizeSupabaseBreadcrumb(breadcrumb)).toBe(breadcrumb);
    expect(sanitizeSupabaseEvent(event)).toBe(event);
  });

  it.each(['', 'invalid', 'file:///local'])(
    'safely ignores invalid configuration %s',
    (configured) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configured);
      const input = span();
      expect(sanitizeSupabaseSpan(input)).toBe(input);
    },
  );

  it('matches normalized origins and strips URL credentials', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', `${origin}/`);
    const result = sanitizeSupabaseSpan(
      span({
        data: {
          url: `https://user:password@PROJECT.supabase.co:443/auth/v1/token?secret=${secret}#token`,
        },
      }),
    );
    expect(result.data.url).toBe(`${origin}/auth/v1/token`);
    expect(JSON.stringify(result)).not.toContain('password');
  });
});
