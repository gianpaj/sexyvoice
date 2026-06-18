type NoiseFilterSetter = (enabled: boolean) => Promise<void> | void;

type NoiseFilterResult = 'enabled' | 'failed' | 'ignored' | 'skipped';

function getMediaStreamReadyState(publication: unknown): string | null {
  if (!(publication && typeof publication === 'object')) {
    return null;
  }

  const track =
    'track' in publication ? (publication as { track?: unknown }).track : null;

  if (!(track && typeof track === 'object')) {
    return null;
  }

  const mediaStreamTrack =
    'mediaStreamTrack' in track
      ? (track as { mediaStreamTrack?: unknown }).mediaStreamTrack
      : null;

  if (!(mediaStreamTrack && typeof mediaStreamTrack === 'object')) {
    return null;
  }

  const readyState =
    'readyState' in mediaStreamTrack
      ? (mediaStreamTrack as { readyState?: unknown }).readyState
      : null;

  return typeof readyState === 'string' ? readyState : null;
}

export function shouldEnableKrispNoiseFilter(publication: unknown): boolean {
  return getMediaStreamReadyState(publication) === 'live';
}

function getStringProperty(value: object, property: string): string {
  if (!(property in value)) {
    return '';
  }

  const propertyValue = (value as Record<string, unknown>)[property];
  return typeof propertyValue === 'string' ? propertyValue : '';
}

export function isExpectedKrispNoiseFilterError(error: unknown): boolean {
  const name =
    error && typeof error === 'object' ? getStringProperty(error, 'name') : '';
  const message =
    error && typeof error === 'object'
      ? getStringProperty(error, 'message') || String(error)
      : String(error);
  const normalizedMessage = message.toLowerCase();

  return (
    name === 'InvalidAccessError' ||
    normalizedMessage.includes('track has ended') ||
    normalizedMessage.includes('wasm_or_worker_not_ready') ||
    normalizedMessage.includes('applyconstraints')
  );
}

export async function enableKrispNoiseFilterIfReady({
  microphonePublication,
  onUnexpectedError,
  setNoiseFilterEnabled,
}: {
  microphonePublication: unknown;
  onUnexpectedError?: (error: unknown) => void;
  setNoiseFilterEnabled: NoiseFilterSetter;
}): Promise<NoiseFilterResult> {
  if (!shouldEnableKrispNoiseFilter(microphonePublication)) {
    return 'skipped';
  }

  try {
    await setNoiseFilterEnabled(true);
    return 'enabled';
  } catch (error) {
    if (isExpectedKrispNoiseFilterError(error)) {
      return 'ignored';
    }

    onUnexpectedError?.(error);
    return 'failed';
  }
}
