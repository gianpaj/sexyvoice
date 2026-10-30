import {
  CALL_CLONE_PROVIDERS,
  type CallCloneProvider,
  isCallCloneProvider,
} from './call-voice-config';

/** Server-only default for new saved call voices. Existing profiles keep theirs. */
export function getCallCloneProvider(): CallCloneProvider {
  const provider = process.env.CALL_CLONE_PROVIDER || 'inworld';
  if (!isCallCloneProvider(provider)) {
    throw new Error(
      `CALL_CLONE_PROVIDER must be ${CALL_CLONE_PROVIDERS.join(' or ')}`,
    );
  }
  return provider;
}
