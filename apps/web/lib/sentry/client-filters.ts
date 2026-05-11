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

const reactCommitDeletionFramePattern =
  /commitDeletionEffectsOnFiber|commitMutationEffectsOnFiber|recursivelyTraverseMutationEffects|react-dom-client/i;

function frameMatchesReactCommitDeletion(frame: SentryStackFrame): boolean {
  return reactCommitDeletionFramePattern.test(
    [frame.filename, frame.function, frame.module].filter(Boolean).join(' '),
  );
}

function isReactRemoveChildNotFoundException(
  exception: SentryException,
): boolean {
  const exceptionText = [exception.type, exception.value]
    .filter(Boolean)
    .join(' ');

  if (!reactRemoveChildNotFoundPattern.test(exceptionText)) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];

  return frames.length === 0 || frames.some(frameMatchesReactCommitDeletion);
}

export function shouldDropClientSentryEvent(event: SentryClientEvent): boolean {
  const exceptions = event.exception?.values ?? [];

  if (exceptions.some(isReactRemoveChildNotFoundException)) {
    return true;
  }

  return reactRemoveChildNotFoundPattern.test(event.message ?? '');
}
