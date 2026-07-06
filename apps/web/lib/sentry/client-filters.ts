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
  /(?:NotFoundError[:\s]+)?The object can not be found here/i,
];

const reactHydrationRecoverablePattern =
  /^(Hydration failed because the server rendered HTML didn't match the client|There was an error while hydrating|Text content does not match server-rendered HTML|Hydration Error)/i;

const rscConnectionClosedPattern = /^Connection closed\.$/i;
const nextClientTransientPattern =
  /^(?:Error\s+)?(Connection closed\.|An unexpected response was received from the server\.)$/i;
const reactRenderLifecycleNoisePattern =
  /Maximum update depth exceeded|Rendered more hooks than during the previous render/i;

const reactCommitDeletionFramePattern =
  /commitDeletionEffectsOnFiber|commitMutationEffectsOnFiber|recursivelyTraverseMutationEffects|react-dom-client|react-server-dom/i;
const nextClientFrameworkFramePattern =
  /app-router|react-dom-client|react-server-dom|server-action-reducer|next\/src\/client|next\/dist\/compiled\/react/i;
const thirdPartyScriptFramePattern = /posthog-recorder\.js|addEL_hook/i;
const localAppFramePattern = /apps\/web|\/_next\/static\/chunks\/app\//i;
const browserMediaNoisePattern =
  /Track has ended|WASM_OR_WORKER_NOT_READY|Wasm SIMD unsupported|Lock was stolen by another request/i;
const opaqueBrowserEventRejectionPattern =
  /Event `Event` \(type=error\) captured as promise rejection/i;
const injectedBrowserGlobalPattern =
  /(?:Can't find variable: __firefox__|window\.__firefox__|window\.ethereum\.selectedAddress)/i;
const externalWorkerImportPattern =
  /Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https?:\/\/(?!([^/]+\.)?sexyvoice\.ai\/)[^']+' failed to load/i;
const staleNextWorkerImportPattern =
  /Failed to execute 'importScripts' on 'WorkerGlobalScope': The script at 'https?:\/\/(www\.)?sexyvoice\.ai\/_next\/static\/chunks\/[^']+' failed to load/i;
const webViewBridgeNoisePattern =
  /WKWebView API client did not respond to this postMessage/i;
const transientBrowserNetworkPattern =
  /(?:^|\s)(?:NetworkError:\s*)?Load failed$|(?:^|\s)network error$/i;
const browserSecurityNoisePattern =
  /Permission to call 'get parentNode' denied|The request was denied/i;
const nullTagNamePattern =
  /Cannot read properties of null \(reading 'tagName'\)/i;
const prosemirrorSelectionCollapsePattern =
  /Failed to execute 'collapse' on 'Selection': The offset \d+ is larger than the node's length \(\d+\)\./i;
const prosemirrorFramePattern = /prosemirror-view/i;

function getExceptionText(exception: SentryException): string {
  return [exception.type, exception.value].filter(Boolean).join(' ');
}

function getFrameText(frame: SentryStackFrame): string {
  return [frame.filename, frame.function, frame.module]
    .filter(Boolean)
    .join(' ');
}

function frameMatchesReactInternals(frame: SentryStackFrame): boolean {
  return reactCommitDeletionFramePattern.test(getFrameText(frame));
}

function frameMatchesNextClientFramework(frame: SentryStackFrame): boolean {
  return nextClientFrameworkFramePattern.test(getFrameText(frame));
}

function frameMatchesThirdPartyScript(frame: SentryStackFrame): boolean {
  return thirdPartyScriptFramePattern.test(getFrameText(frame));
}

function frameMatchesLocalApp(frame: SentryStackFrame): boolean {
  return localAppFramePattern.test(getFrameText(frame));
}

function frameMatchesProsemirror(frame: SentryStackFrame): boolean {
  return prosemirrorFramePattern.test(getFrameText(frame));
}

function framesHaveNoLocalAppFrame(frames: SentryStackFrame[]): boolean {
  return frames.length === 0 || !frames.some(frameMatchesLocalApp);
}

function isReactDomNoiseException(exception: SentryException): boolean {
  const exceptionText = getExceptionText(exception);

  if (
    !reactDomMutationNoisePatterns.some((pattern) =>
      pattern.test(exceptionText),
    )
  ) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];

  return (
    frames.length === 0 ||
    frames.some(frameMatchesReactInternals) ||
    !frames.some(frameMatchesLocalApp)
  );
}

function isReactRenderLifecycleNoiseException(
  exception: SentryException,
): boolean {
  const exceptionText = getExceptionText(exception);
  if (!reactRenderLifecycleNoisePattern.test(exceptionText)) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];
  return (
    framesHaveNoLocalAppFrame(frames) &&
    (frames.length === 0 || frames.some(frameMatchesReactInternals))
  );
}

function isThirdPartyScriptNoiseException(exception: SentryException): boolean {
  const exceptionText = getExceptionText(exception);
  const frames = exception.stacktrace?.frames ?? [];

  if (nullTagNamePattern.test(exceptionText)) {
    return frames.some(frameMatchesThirdPartyScript);
  }

  if (browserSecurityNoisePattern.test(exceptionText)) {
    return frames.length === 0 || frames.some(frameMatchesThirdPartyScript);
  }

  return false;
}

function isBrowserRuntimeNoiseException(exception: SentryException): boolean {
  const exceptionText = getExceptionText(exception);

  if (
    !(
      browserMediaNoisePattern.test(exceptionText) ||
      opaqueBrowserEventRejectionPattern.test(exceptionText) ||
      injectedBrowserGlobalPattern.test(exceptionText) ||
      externalWorkerImportPattern.test(exceptionText) ||
      staleNextWorkerImportPattern.test(exceptionText) ||
      webViewBridgeNoisePattern.test(exceptionText) ||
      transientBrowserNetworkPattern.test(exceptionText)
    )
  ) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];
  return framesHaveNoLocalAppFrame(frames);
}

function isNextClientTransientException(exception: SentryException): boolean {
  const exceptionText = getExceptionText(exception);
  if (!nextClientTransientPattern.test(exceptionText)) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];
  return (
    framesHaveNoLocalAppFrame(frames) &&
    (frames.length === 0 || frames.some(frameMatchesNextClientFramework))
  );
}

function isProsemirrorSelectionNoiseException(
  exception: SentryException,
): boolean {
  const exceptionText = getExceptionText(exception);
  if (!prosemirrorSelectionCollapsePattern.test(exceptionText)) {
    return false;
  }

  const frames = exception.stacktrace?.frames ?? [];
  return (
    framesHaveNoLocalAppFrame(frames) && frames.some(frameMatchesProsemirror)
  );
}

export function shouldDropClientSentryEvent(event: SentryClientEvent): boolean {
  const exceptions = event.exception?.values ?? [];

  if (exceptions.some(isReactDomNoiseException)) {
    return true;
  }

  if (exceptions.some(isReactRenderLifecycleNoiseException)) {
    return true;
  }

  if (exceptions.some(isNextClientTransientException)) {
    return true;
  }

  if (exceptions.some(isThirdPartyScriptNoiseException)) {
    return true;
  }

  if (exceptions.some(isBrowserRuntimeNoiseException)) {
    return true;
  }

  if (exceptions.some(isProsemirrorSelectionNoiseException)) {
    return true;
  }

  const message = event.message ?? '';
  const isMessageOnlyReactDomNoise =
    exceptions.length === 0 &&
    reactDomMutationNoisePatterns.some((pattern) => pattern.test(message));

  return (
    isMessageOnlyReactDomNoise ||
    reactHydrationRecoverablePattern.test(message) ||
    rscConnectionClosedPattern.test(message)
  );
}
