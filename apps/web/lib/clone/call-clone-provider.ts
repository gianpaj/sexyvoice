import type { CallCloneProvider } from './call-voice-config';

/** Server-only default for new saved call voices. Existing profiles keep theirs. */
export function getCallCloneProvider(): CallCloneProvider {
  const provider = process.env.CALL_CLONE_PROVIDER || 'inworld';
  if (provider !== 'inworld' && provider !== 'mistral') {
    throw new Error('CALL_CLONE_PROVIDER must be inworld or mistral');
  }
  return provider;
}
