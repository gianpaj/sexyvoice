/**
 * Why a call could not start or ended early, as the `call` message key the
 * browser shows. call-token responses carry these codes in `code`, and the
 * agent's `pg.error` RPC sends `active_call`, `insufficient_credits` and
 * `instructions_rejected` in `error`.
 */
const CALL_ERROR_MESSAGES = {
  active_call: 'activeCallError',
  agent_error: 'agentError',
  agent_unavailable: 'agentUnavailable',
  character_not_found: 'characterUnavailable',
  connection_failed: 'connectionFailed',
  free_call_limit: 'freeUserCallLimitExceeded',
  instructions_rejected: 'instructionsRejected',
  insufficient_credits: 'notEnoughCredits',
  microphone_denied: 'microphonePermissionDenied',
  microphone_unavailable: 'microphoneUnavailable',
  paid_character: 'upgradeRequired',
  paid_scene: 'upgradeRequired',
  voice_not_found: 'characterUnavailable',
} as const;

export type CallErrorCode = keyof typeof CALL_ERROR_MESSAGES;

type CallErrorMessage = (typeof CALL_ERROR_MESSAGES)[CallErrorCode];

/** The message for a code, or `fallback` for a code this app does not know. */
export function callErrorMessage(
  code: unknown,
  fallback: CallErrorCode,
): CallErrorMessage {
  return typeof code === 'string' && Object.hasOwn(CALL_ERROR_MESSAGES, code)
    ? CALL_ERROR_MESSAGES[code as CallErrorCode]
    : CALL_ERROR_MESSAGES[fallback];
}
