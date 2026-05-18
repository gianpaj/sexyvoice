interface SentryStackFrame {
  filename?: string;
  function?: string;
  module?: string;
}

interface SentryException {
  stacktrace?: {
    frames?: SentryStackFrame[];
  };
  type?: string;
  value?: string;
}

interface SentryClientEvent {
  exception?: {
    values?: SentryException[];
  };
  message?: string;
}

const reactRemoveChildNotFoundPattern =
  /Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node/i;

const reactDomMutationNoisePatterns = [
  reactRemoveChildNotFoundPattern,
  /Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node/i,
  /Cannot read properties of null \(reading 'removeChild'\)/i,
  /NotFoundError: The object can not be found here/i,
];

const reactHydrationRecoverablePattern =
  /^(Hydration failed because the server rendered HTML didn't match the client|There was an error while hydrating|Text content does not match server-rendered HTML|Hydration Error)/i;

const rscConnectionClosedPattern = /^Connection closed\.$/i;

const reactCommitDeletionFramePattern =
  /commitDeletionEffectsOnFiber|commitMutationEffectsOnFiber|recursivelyTraverseMutationEffects|react-dom-client|react-server-dom/i;

function frameMatchesReactInternals(frame: SentryStackFrame): boolean {
  return reactCommitDeletionFramePattern.test(
    [frame.filename, frame.function, frame.module].filter(Boolean).join(' '),
  );
}

function isReactDomNoiseException(exception: SentryException): boolean {
  const exceptionText = [exception.type, exception.value]
    .filter(Boolean)
    .join(' ');

  if (
    !reactDomMutationNoisePatterns.some((pattern) =>
      pattern.test(exceptionText),
    )
  ) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];

  return frames.length === 0 || frames.some(frameMatchesReactInternals);
}

export function shouldDropClientSentryEvent(event: SentryClientEvent): boolean {
  const exceptions = event.exception?.values ?? [];

  if (exceptions.some(isReactDomNoiseException)) {
    return true;
  }

  const message = event.message ?? '';

  return (
    reactDomMutationNoisePatterns.some((pattern) => pattern.test(message)) ||
    reactHydrationRecoverablePattern.test(message) ||
    rscConnectionClosedPattern.test(message)
  );
}
