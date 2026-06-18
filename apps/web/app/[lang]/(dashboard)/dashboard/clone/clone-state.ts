import type messages from '@/messages/en.json';

export type CloneDict = (typeof messages)['clone'];

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
  activeTab: 'upload' | 'preview';
  convertingMicAudio: boolean;
  errorMessage: string;
  ffmpegError: string | null;
  generatedAudioUrl: string | null;
  legalConsentChecked: boolean;
  micBlob: Blob | null;
  micRecording: boolean;
  referenceAudioEnhancementEnabled: boolean;
  selectedLocale: {
    code: string;
    value: string;
  };
  status: Status;
  text: string;
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
  micBlob: null,
  micRecording: false,
  referenceAudioEnhancementEnabled: false,
  selectedLocale: {
    code: 'en',
    value: 'english',
  },
  status: 'idle',
  text: '',
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
