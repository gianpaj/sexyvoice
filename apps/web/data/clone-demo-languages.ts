export const CLONE_DEMO_LANGUAGES = [
  {
    languageCode: 'en',
    prompt:
      '[emotion=anxious] Hi… um, sorry to bother you. I just… I didn’t know who else to call. Are you… busy?',
  },
  {
    languageCode: 'de',
    prompt:
      '[emotion=anxious] Hi… ähm, tut mir leid, dass ich dich störe. Ich… ich wusste nicht, wen ich sonst anrufen sollte. Hast du… gerade zu tun?',
  },
  {
    languageCode: 'es',
    prompt:
      '[emotion=anxious] Hola… eh, perdona que te moleste. Es que… no sabía a quién más llamar. ¿Tienes… un momento?',
  },
  {
    languageCode: 'fr',
    prompt:
      '[emotion=anxious] Salut… euh, pardon de te déranger. C’est juste que… je ne savais pas qui d’autre appeler. Est-ce que… tu as un moment ?',
  },
  {
    languageCode: 'it',
    prompt:
      '[emotion=anxious] Ciao… ehm, scusa se ti disturbo. È solo che… non sapevo chi altro chiamare. Hai… un momento?',
  },
  {
    languageCode: 'nl',
    prompt:
      '[emotion=anxious] Hoi… eh, sorry dat ik je stoor. Ik… ik wist niet wie ik anders moest bellen. Ben je… druk?',
  },
  {
    languageCode: 'pt',
    prompt:
      '[emotion=anxious] Olá… hum, desculpa incomodar. É que… não sabia a quem mais ligar. Tens… um momento?',
  },
  {
    languageCode: 'ar',
    prompt:
      '[emotion=anxious] مرحبًا… أمم، آسف على الإزعاج. أنا فقط… لم أعرف بمن أتصل غيرك. هل أنت… مشغول؟',
  },
  {
    languageCode: 'hi',
    prompt:
      '[emotion=anxious] नमस्ते… उम्, परेशान करने के लिए माफ़ कीजिए। बस… समझ नहीं आया कि और किसे फ़ोन करूँ। क्या आप… व्यस्त हैं?',
  },
] as const;

export type DemoLanguageCode =
  (typeof CLONE_DEMO_LANGUAGES)[number]['languageCode'];
export const DEMO_LANGUAGE_CODES = CLONE_DEMO_LANGUAGES.map(
  ({ languageCode }) => languageCode,
);
export const DEMO_FALLBACK_LANGUAGE: DemoLanguageCode = 'en';

export function isDemoLanguageCode(code: string): code is DemoLanguageCode {
  return (DEMO_LANGUAGE_CODES as readonly string[]).includes(code);
}

export function resolveInitialDemoLanguageCode(
  locale: string,
): DemoLanguageCode {
  const baseLocale = locale.trim().toLowerCase().split(/[-_]/)[0];
  return isDemoLanguageCode(baseLocale) ? baseLocale : DEMO_FALLBACK_LANGUAGE;
}
