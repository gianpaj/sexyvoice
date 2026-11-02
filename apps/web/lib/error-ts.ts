import { NextResponse } from 'next/server';

/**
 * This error is thrown when there is an API error with a payload. The error
 * body includes the data that came in the payload plus status and a server
 * message. When it's a rate limit error in includes `retryAfter`
 */
export class APIError extends Error {
  status: number;
  serverMessage: string;
  link?: string;
  slug?: string;
  action?: string;
  retryAfter: number | null | 'never';
  // biome-ignore lint/suspicious/noExplicitAny: it's okay
  [key: string]: any;

  constructor(message: string, response: Response, body?: object) {
    super();
    // `error` mirrors `serverMessage` (the raw message without the status
    // suffix) so clients reading `data.error` keep working after routes
    // migrate from `NextResponse.json({ error }, ...)` to `APIErrorResponse`.
    this.error = message;
    this.message = `${message} (${response.status})`;
    this.status = response.status;
    this.serverMessage = message;
    this.retryAfter = null;

    if (body) {
      for (const field of Object.keys(body)) {
        if (field !== 'message') {
          // @ts-expect-error
          this[field] = body[field];
        }
      }
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        this.retryAfter = Number.parseInt(retryAfter, 10);
      }
    }
  }
}

/**
 * Standard helper for returning JSON error responses from API routes. Use this
 * instead of `NextResponse.json({ error }, { status })` so every route returns a
 * consistent error body: `{ error, message, status, serverMessage, retryAfter }`.
 *
 * Pass `extra` to include additional fields (e.g. `details`) in the body, and
 * `headers` to attach response headers (e.g. rate-limit headers).
 */
export const APIErrorResponse = (
  errorMsg: string,
  statusCode: number,
  extra?: Record<string, unknown>,
  headers?: HeadersInit,
) => {
  const response = NextResponse.json(
    new APIError(
      errorMsg,
      new Response(errorMsg, {
        status: statusCode,
      }),
      extra,
    ),
    { status: statusCode },
  );

  if (headers) {
    // Normalize so both `Headers` instances and plain objects are applied
    // reliably (passing a `Headers` instance via the init object does not
    // always merge).
    new Headers(headers).forEach((value, key) => {
      response.headers.set(key, value);
    });
  }

  return response;
};

// export function isAPIError(v: unknown): v is APIError {
//   return isError(v) && 'status' in v;
// }

/**
 * A type guard for `try...catch` errors.
 */
// export const isError = (error: unknown): error is Error => {
//   return require('node:util').types.isNativeError(error);
// };
