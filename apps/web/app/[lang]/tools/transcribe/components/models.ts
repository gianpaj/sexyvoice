export const WHISPER_MODELS = [
  {
    id: 'onnx-community/whisper-tiny',
    label: 'Whisper Tiny (~40 MB)',
    multilingual: true,
    size: '~40 MB',
  },
  {
    id: 'onnx-community/whisper-base',
    label: 'Whisper Base (~75 MB)',
    multilingual: true,
    size: '~75 MB',
  },
  {
    id: 'onnx-community/whisper-small',
    label: 'Whisper Small (~250 MB)',
    multilingual: true,
    size: '~250 MB',
  },
  {
    id: 'onnx-community/whisper-tiny.en',
    label: 'Whisper Tiny (English only, ~40 MB)',
    multilingual: false,
    size: '~40 MB',
  },
  {
    id: 'onnx-community/whisper-base.en',
    label: 'Whisper Base (English only, ~75 MB)',
    multilingual: false,
    size: '~75 MB',
  },
] as const;
