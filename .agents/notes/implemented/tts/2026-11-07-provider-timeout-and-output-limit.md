# Grok headers timeout and Gemini output limit

- Dashboard generation and API v1 treat Grok's nested
  `UND_ERR_HEADERS_TIMEOUT` as provider unavailability. The existing 503 path
  refunds the reservation and leaves retry timing to the caller. See
  [DG](https://sexyvoiceai.sentry.io/issues/154972443/) and
  [DH](https://sexyvoiceai.sentry.io/issues/154972447/).
- Gemini's `MAX_TOKENS` finish reason means the generated audio may be
  incomplete, even if the response contains audio. The dashboard JSON route
  returns `GEMINI_OUTPUT_LIMIT` and API v1 returns
  `output_limit_exceeded`, both with HTTP 422. Both routes refund the
  reservation before returning. See
  [9Z](https://sexyvoiceai.sentry.io/issues/118854909/).
- Streaming checks the finish reason before sending the terminal chunk.
  The error event resets the player's buffer and follows the refund.
  Earlier chunks may have played before the finish reason arrived. The
  stream does not finalize or save an audio file in this case.

Route tests cover the observed Grok error shape and Gemini responses with
audio. Stream tests cover the output limit before and after audio starts.
The generator tests exercise localized errors with free and paid account
fixtures.
