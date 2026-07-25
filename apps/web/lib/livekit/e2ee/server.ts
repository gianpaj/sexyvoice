/**
 * Server-side resolution of the LiveKit end-to-end encryption passphrase.
 *
 * Calls use a single shared key with no rotation: every room is encrypted with
 * the same passphrase, which is also configured on the `sexycall` LiveKit agent
 * (separate repository). The passphrase is never bundled into the client — it is
 * handed out by `/api/call-token` once the caller passed every guard rail.
 *
 * When `LIVEKIT_E2EE_KEY` is unset, calls connect without media encryption. That
 * keeps the web app deployable before (or after) the agent is rolled out, since
 * a one-sided rollout would break audio in both directions.
 */

/**
 * Normalises a raw passphrase value. Surrounding whitespace is stripped because
 * secret managers routinely append a trailing newline, and an empty value is
 * treated as "encryption disabled".
 *
 * The agent must be configured with the same trimmed passphrase, so prefer a
 * passphrase without whitespace (for example a base64 or hex random string).
 */
export function normalizeCallE2eeKey(
  value: string | undefined | null,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns the shared call encryption passphrase, or `null` when end-to-end
 * encryption is disabled for this deployment.
 */
export function getCallE2eeKey(): string | null {
  return normalizeCallE2eeKey(process.env.LIVEKIT_E2EE_KEY);
}
