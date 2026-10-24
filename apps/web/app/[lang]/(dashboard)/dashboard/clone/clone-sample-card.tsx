'use client';

import { useLocale, useMessages } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { DemoClonePlayer } from '@/components/demo-clone/demo-clone-player';
import {
  type CloneDemoTakeId,
  DEMO_LANGUAGE_CODES,
  type DemoLanguageCode,
  getDemoCloneSelection,
  resolveInitialDemoSpeakerId,
} from '@/data/demo-clone';
import { loadDemoCloneReference } from '@/lib/clone/demo-reference';
import { getTranslatedLanguages } from '@/lib/i18n/get-translated-languages';
import type { Locale } from '@/lib/i18n/i18n-config';
import type { Status } from './clone-state';

export interface SampleAudio {
  locale: string;
  prompt: string;
}

export default function CloneSampleCard({
  addFiles,
  onSelectSample,
  setErrorMessage,
  setStatus,
}: {
  addFiles: (files: File[]) => void;
  onSelectSample: (sample: SampleAudio) => void;
  setErrorMessage: (message: string) => void;
  setStatus: (status: Status) => void;
}) {
  const locale = useLocale() as Locale;
  const messages = useMessages() as IntlMessages;
  const labels = messages.landing.demoClone;
  const [applying, setApplying] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const languageLabels = Object.fromEntries(
    getTranslatedLanguages(locale, DEMO_LANGUAGE_CODES).map(
      ({ value, label }) => [value, label],
    ),
  ) as Record<DemoLanguageCode, string>;

  const apply = async (speakerId: string, takeId: CloneDemoTakeId) => {
    const selection = getDemoCloneSelection(speakerId, takeId);
    if (!selection || applying) return;
    const controller = new AbortController();
    pending.current = controller;
    setApplying(true);
    setErrorMessage('');
    try {
      const file = await loadDemoCloneReference(
        selection.speaker,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      onSelectSample({
        prompt: selection.take.prompt,
        locale: selection.speaker.languageCode,
      });
      addFiles([file]);
    } catch {
      if (controller.signal.aborted) return;
      setErrorMessage(labels.audioError);
      setStatus('error');
    } finally {
      setApplying(false);
    }
  };

  return (
    <DemoClonePlayer
      applying={applying}
      initialSpeakerId={resolveInitialDemoSpeakerId(locale)}
      key={locale}
      labels={labels}
      languageLabels={languageLabels}
      locale={locale}
      onTryVoice={apply}
    />
  );
}
