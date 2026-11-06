'use client';

import { TTSEditor, type TTSEditorProps } from './tts-editor';

type GrokTTSEditorProps = Omit<
  Extract<TTSEditorProps, { provider: 'grok' }>,
  'provider'
>;

export function GrokTTSEditor(props: GrokTTSEditorProps) {
  return <TTSEditor {...props} provider="grok" />;
}
