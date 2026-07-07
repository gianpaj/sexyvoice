import type { CloneProvider } from '@/lib/clone/constants';
import type messages from '@/messages/en.json';

export type CloneDict = (typeof messages)['clone'];

// 'auto' lets the backend pick the provider by locale (current default behavior).
export type CloneProviderSelection = CloneProvider | 'auto';

// A previously-saved, reusable cloned voice (currently Inworld).
export interface AudioReference {
  createdAt: string | null;
  id: string;
  isPaid: boolean;
  name: string;
  provider: string;
  voiceId: string;
}

// 'new' = clone a fresh voice from uploaded audio; otherwise an audio_references row id.
export type AudioReferenceSelection = string | 'new';

export type Status = 'idle' | 'generating' | 'complete' | 'error';

export const formatCloneMessage = (
  message: string,
  values: Record<string, boolean | number | string | null | undefined>,
) =>
  Object.entries(values).reduce(
    (formatted, [key, value]) =>
      value === null || value === undefined
        ? formatted
        : formatted.replaceAll(`__${key}__`, String(value)),
    message,
  );

export interface CloneState {
  activeTab: 'generate' | 'preview' | 'upload';
  convertingMicAudio: boolean;
  errorMessage: string;
  ffmpegError: string | null;
  generatedAudioUrl: string | null;
  inworldVoices: AudioReference[];
  inworldVoicesLoading: boolean;
  legalConsentChecked: boolean;
  micBlob: Blob | null;
  micRecording: boolean;
  referenceAudioEnhancementEnabled: boolean;
  selectedAudioReferenceId: AudioReferenceSelection;
  selectedLocale: {
    code: string;
    value: string;
  };
  selectedProvider: CloneProviderSelection;
  status: Status;
  text: string;
  voiceName: string;
}

export interface CloneStateAction {
  patch: Partial<CloneState>;
  type: 'patch';
}

export const initialCloneState: CloneState = {
  activeTab: 'upload',
  convertingMicAudio: false,
  errorMessage: '',
  ffmpegError: null,
  generatedAudioUrl: null,
  legalConsentChecked: false,
  inworldVoices: [],
  inworldVoicesLoading: false,
  micBlob: null,
  micRecording: false,
  referenceAudioEnhancementEnabled: false,
  selectedAudioReferenceId: 'new',
  selectedLocale: {
    code: 'en',
    value: 'english',
  },
  selectedProvider: 'auto',
  status: 'idle',
  text: '',
  voiceName: '',
};

export function cloneStateReducer(
  state: CloneState,
  action: CloneStateAction,
): CloneState {
  switch (action.type) {
    case 'patch': {
      const hasChanges = Object.entries(action.patch).some(([key, value]) => {
        const stateKey = key as keyof CloneState;
        return !Object.is(state[stateKey], value);
      });

      if (!hasChanges) {
        return state;
      }

      return { ...state, ...action.patch };
    }
    default:
      return state;
  }
}
