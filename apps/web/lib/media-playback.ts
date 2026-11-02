const EXPECTED_PLAYBACK_ERROR_NAMES = new Set([
  'AbortError',
  'NotAllowedError',
  'NotSupportedError',
]);

const EXPECTED_PLAYBACK_ERROR_PATTERNS = [
  /play\(\) can only be initiated by a user gesture/i,
  /interrupted by a call to pause/i,
  /the request is not allowed by the user agent/i,
  /failed to load because no supported source was found/i,
  /the operation is not supported/i,
];

function getErrorName(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error
    ? String(error.name)
    : '';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isExpectedPlaybackError(error: unknown) {
  const name = getErrorName(error);
  const message = getErrorMessage(error);

  return (
    EXPECTED_PLAYBACK_ERROR_NAMES.has(name) ||
    EXPECTED_PLAYBACK_ERROR_PATTERNS.some((pattern) => pattern.test(message))
  );
}

export async function attemptPlayback(
  playback: () => Promise<void> | void,
  onFailure?: () => void,
) {
  try {
    await playback();
    return true;
  } catch (error) {
    onFailure?.();

    if (!isExpectedPlaybackError(error)) {
      console.error('Audio playback failed:', error);
    }

    return false;
  }
}
