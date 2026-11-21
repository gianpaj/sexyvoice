import type { Breadcrumb, Event, EventHint, spanToJSON } from '@sentry/nextjs';

type SpanJSON = ReturnType<typeof spanToJSON>;
// @sentry/nextjs does not re-export the SDK's TransactionEvent type.
type TransactionEvent = Event & { type: 'transaction' };

const automaticMechanisms = new Set([
  'auto.db.supabase.postgres',
  'auto.db.supabase.auth',
]);
const operations = new Set(['select', 'insert', 'upsert', 'update', 'delete']);
const authCodes = new Set([
  'invalid_credentials',
  'email_not_confirmed',
  'user_not_found',
  'session_not_found',
  'refresh_token_not_found',
  'refresh_token_already_used',
  'otp_expired',
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'weak_password',
  'unexpected_failure',
]);
const urlKeys = ['url', 'http.url', 'url.full'] as const;

function supabaseUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '');
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(configured.protocol) ||
      url.origin !== configured.origin
    ) {
      return;
    }
    // Reconstructing also excludes credentials, query parameters and fragments.
    return `${url.origin}${url.pathname}`;
  } catch {
    // Missing configuration and malformed URLs are outside the matching scope.
  }
}

function httpData(data: Record<string, unknown> | undefined) {
  if (!(data && urlKeys.some((key) => supabaseUrl(data[key])))) return;
  const clean: Record<string, string | number> = {};
  for (const key of urlKeys) {
    const url = supabaseUrl(data[key]);
    if (url) clean[key] = url;
  }
  for (const key of ['method', 'http.method', 'http.request.method']) {
    const value = data[key];
    if (
      typeof value === 'string' &&
      /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(value)
    ) {
      clean[key] = value;
    }
  }
  for (const key of [
    'status_code',
    'http.status_code',
    'http.response.status_code',
  ]) {
    const value = data[key];
    if (typeof value === 'number' && value >= 100 && value <= 599) {
      clean[key] = value;
    }
  }
  return clean;
}

/** Use as beforeBreadcrumb; only Supabase integration and matching HTTP entries change. */
export function sanitizeSupabaseBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.type === 'supabase') {
    const operation = breadcrumb.category?.replace(/^db\./, '');
    return {
      category:
        operation && operations.has(operation) ? `db.${operation}` : 'db',
      level: breadcrumb.level,
      message: 'Supabase operation',
      timestamp: breadcrumb.timestamp,
      type: 'supabase',
    };
  }
  if (!['http', 'fetch', 'xhr'].includes(breadcrumb.category ?? '')) {
    return breadcrumb;
  }
  const data = httpData(breadcrumb.data);
  if (!data) return breadcrumb;
  return {
    category: breadcrumb.category,
    data,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    type: breadcrumb.type,
  };
}

function sanitizeSpan<
  T extends Pick<SpanJSON, 'data' | 'description' | 'op' | 'origin'>,
>(span: T): T {
  if (
    span.origin === 'auto.db.supabase' ||
    span.data['sentry.origin'] === 'auto.db.supabase'
  ) {
    const operation = span.data['db.operation'];
    const safeOperation =
      typeof operation === 'string' &&
      (operations.has(operation) ||
        /^auth\.(?:admin\.)?(?:reauthenticate|signInAnonymously|signInWithOAuth|signInWithIdToken|signInWithOtp|signInWithPassword|signInWithSSO|signOut|signUp|verifyOtp|createUser|deleteUser|listUsers|getUserById|updateUserById|inviteUserByEmail)$/.test(
          operation,
        ))
        ? operation
        : undefined;
    const metadata: SpanJSON['data'] = {};
    for (const key of ['db.table', 'db.schema']) {
      if (typeof span.data[key] === 'string') metadata[key] = span.data[key];
    }
    if (typeof span.data['db.url'] === 'string') {
      try {
        const url = new URL(span.data['db.url']);
        if (['http:', 'https:'].includes(url.protocol))
          metadata['db.url'] = url.origin;
      } catch {
        // Malformed database URLs carry no useful connection metadata.
      }
    }
    const table = metadata['db.table'];
    let description = `Supabase ${safeOperation ?? 'operation'}${table ? ` from(${table})` : ''}`;
    // Match the SDK's redacted grammar, not just absence of query/body attributes:
    // a description may still contain values after another hook removes attributes.
    if (table && safeOperation && operations.has(safeOperation)) {
      const suffix = `from(${table})`;
      const prefixes =
        safeOperation === 'select'
          ? ['']
          : [safeOperation, `${safeOperation}(...)`];
      const safeDescriptions = prefixes.flatMap((prefix) => [
        [prefix, suffix].filter(Boolean).join(' '),
        [prefix, '[redacted]', suffix].filter(Boolean).join(' '),
      ]);
      if (
        span.data['db.query'] === undefined &&
        span.data['db.body'] === undefined &&
        span.description &&
        safeDescriptions.includes(span.description)
      )
        description = span.description;
    }
    return {
      ...span,
      data: {
        ...metadata,
        'db.system': 'postgresql',
        'sentry.op': 'db',
        'sentry.origin': 'auto.db.supabase',
        ...(safeOperation ? { 'db.operation': safeOperation } : {}),
      },
      description,
    };
  }
  if (span.op !== 'http.client' && span.data['sentry.op'] !== 'http.client') {
    return span;
  }
  const data = httpData(span.data);
  if (!data) return span;
  return { ...span, data, description: 'Supabase HTTP request' };
}

/** Use as beforeSendSpan with the default, non-streaming SpanJSON pipeline. */
export function sanitizeSupabaseSpan(span: SpanJSON): SpanJSON {
  return sanitizeSpan(span);
}

// Sentry merges sanitized root attributes into the transaction; rebuild them
// here too so removed attributes cannot survive that merge.
export function sanitizeSupabaseTransaction(
  event: TransactionEvent,
): TransactionEvent {
  let result = sanitizeSupabaseEvent(event);
  const trace = event.contexts?.trace;
  if (trace) {
    const root = {
      data: trace.data ?? {},
      description: event.transaction,
      op: trace.op,
      origin: trace.origin,
    };
    const sanitized = sanitizeSpan(root);
    if (sanitized !== root) {
      result = {
        ...result,
        contexts: {
          ...result.contexts,
          trace: { ...trace, data: sanitized.data },
        },
        transaction: sanitized.description,
      };
    }
  }
  if (event.spans)
    result = { ...result, spans: event.spans.map(sanitizeSupabaseSpan) };
  return result;
}

function safeErrorCode(value: unknown, mechanism: string): string | undefined {
  if (typeof value !== 'string') return;
  if (mechanism === 'auto.db.supabase.postgres') {
    if (/^(?:[0-9A-Z]{5}|PGRST\d{3})$/.test(value)) return value;
  } else if (authCodes.has(value)) {
    return value;
  }
}

/** Generic return type preserves ErrorEvent compatibility in Sentry's beforeSend hook. */
export function sanitizeSupabaseEvent<T extends Event>(
  event: T,
  hint?: EventHint,
): T {
  const mechanism = event.exception?.values?.find((exception) =>
    automaticMechanisms.has(exception.mechanism?.type ?? ''),
  )?.mechanism;
  let result = event;
  if (mechanism) {
    const original = hint?.originalException;
    const code = safeErrorCode(
      original && typeof original === 'object' && 'code' in original
        ? original.code
        : event.contexts?.supabase?.code,
      mechanism.type,
    );
    // ErrorData, serialized exceptions and linked causes can duplicate messages
    // and raw stacks. Rebuild rather than chase every error property name.
    result = {
      ...event,
      contexts: {
        ...(event.contexts?.trace
          ? {
              trace: {
                parent_span_id: event.contexts.trace.parent_span_id,
                span_id: event.contexts.trace.span_id,
                trace_id: event.contexts.trace.trace_id,
              },
            }
          : {}),
        supabase: code ? { code } : {},
      },
      exception: {
        values: [
          {
            mechanism: { handled: mechanism.handled, type: mechanism.type },
            type:
              mechanism.type === 'auto.db.supabase.auth'
                ? 'SupabaseAuthError'
                : 'SupabasePostgresError',
            value: code
              ? `Supabase operation failed (${code})`
              : 'Supabase operation failed',
          },
        ],
      },
      message: 'Supabase operation failed',
    };
    result.extra = undefined;
    result.logentry = undefined;
  }
  if (event.breadcrumbs) {
    result = {
      ...result,
      breadcrumbs: event.breadcrumbs.map(sanitizeSupabaseBreadcrumb),
    };
  }
  const url = supabaseUrl(event.request?.url);
  if (url) {
    result = { ...result, request: { method: event.request?.method, url } };
  }
  return result;
}
