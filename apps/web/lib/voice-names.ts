const GEMINI_38_DISPLAY_NAMES: Record<string, string> = {
  'es-419-advisor-4': 'Mariana',
  'es-419-assistant-9': 'Diego',
  'es-419-commercial-1': 'Santiago',
  'es-419-concierge-5': 'Renata',
  'es-419-csagent-8': 'Alex',
  'es-419-podcaster-1': 'Emiliano',
  'es-419-training-8': 'Camila',
  'es-419-tutor-3': 'Ximena',
  'es-es-advisor-8': 'Clara',
  'es-es-assistant-3': 'Hugo',
  'es-es-commercial-7': 'Valeria',
  'es-es-concierge-3': 'Inés',
  'es-es-csagent-6': 'Elena',
  'es-es-podcaster-7': 'Mateo',
  'es-es-techagent-5': 'Lucía',
  'es-es-training-12': 'Alba',
  'es-es-tutor-12': 'Sofía',
};

/** Display labels only. Keep the stored name for provider requests and API identifiers. */
export function getVoiceDisplayName(voice: {
  model: string;
  name: string;
}): string {
  if (
    voice.model === 'gpro38' &&
    Object.hasOwn(GEMINI_38_DISPLAY_NAMES, voice.name)
  ) {
    return GEMINI_38_DISPLAY_NAMES[voice.name];
  }
  return voice.name.charAt(0).toUpperCase() + voice.name.slice(1);
}
