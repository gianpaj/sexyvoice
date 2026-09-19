import { isFeaturedVoice } from '@/lib/voices';

export interface VoiceGroup {
  label: string;
  voices: Tables<'voices'>[];
}

interface VoiceGroupLabels {
  featuredGroupLabel: string;
  geminiGroupLabel: string;
}

const grokGroupLabel = 'Grok ✨';

function isMultilingualVoice(voice: Tables<'voices'>) {
  return voice.model === 'gpro' || voice.model === 'gpro31';
}

function isGrokVoice(voice: Tables<'voices'>) {
  return voice.model === 'xai';
}

function sortVoices(voices: Tables<'voices'>[]) {
  return [...voices].sort(
    (voiceA, voiceB) =>
      voiceA.sort_order - voiceB.sort_order ||
      voiceA.name.localeCompare(voiceB.name),
  );
}

function getGroupLabel(
  voice: Tables<'voices'>,
  geminiGroupLabel: string,
): string {
  if (isMultilingualVoice(voice)) return geminiGroupLabel;
  if (isGrokVoice(voice)) return grokGroupLabel;
  return voice.language;
}

export function getVoiceGroups(
  publicVoices: Tables<'voices'>[],
  { featuredGroupLabel, geminiGroupLabel }: VoiceGroupLabels,
): VoiceGroup[] {
  const featuredVoices = sortVoices(
    publicVoices.filter((voice) => isFeaturedVoice(voice)),
  );

  const nonFeaturedVoices = publicVoices.filter(
    (voice) => !isFeaturedVoice(voice),
  );

  const groupedVoices = Object.entries(
    nonFeaturedVoices.reduce(
      (acc, voice) => {
        const group = getGroupLabel(voice, geminiGroupLabel);

        if (!acc[group]) {
          acc[group] = [];
        }

        acc[group].push(voice);
        return acc;
      },
      {} as Record<string, Tables<'voices'>[]>,
    ),
  ).map(
    ([label, voices]) =>
      ({
        label,
        voices: sortVoices(voices),
      }) satisfies VoiceGroup,
  );

  const groups: VoiceGroup[] = [];

  if (featuredVoices.length > 0) {
    groups.push({
      label: featuredGroupLabel,
      voices: featuredVoices,
    });
  }

  return [...groups, ...groupedVoices];
}
