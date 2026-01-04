// biome-ignore lint/performance/noBarrelFile: intentional re-exports for backward compatibility
export { defaultSessionConfig, instructions } from './default-config';
export type { SessionConfig } from './session-config';

import { defaultSessionConfig, instructions } from './default-config';
import { defaultPresets, type Preset } from './presets';
import type { SessionConfig } from './session-config';

export type CallLanguage =
  | 'en'
  | 'es'
  | 'fr'
  | 'de'
  | 'it'
  | 'pt'
  | 'nl'
  | 'ru'
  | 'zh'
  | 'ja'
  | 'ko'
  | 'ar'
  | 'hi'
  | 'tr'
  | 'pl'
  | 'sv'
  | 'da'
  | 'no'
  | 'fi'
  | 'cs';

export const callLanguages: Array<{ value: CallLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'tr', label: 'Turkish' },
  { value: 'pl', label: 'Polish' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'cs', label: 'Czech' },
];

export const languageInitialInstructions: Record<CallLanguage, string> = {
  en: 'SYSTEM: Say hi to the user in a seductive and flirtatious manner',
  es: 'SYSTEM: Saluda al usuario de manera seductora y coqueta',
  fr: "SYSTEM: Salue l'utilisateur d'une manière séduisante et aguicheuse",
  de: 'SYSTEM: Begrüße den Nutzer auf verführerische und kokette Weise',
  it: "SYSTEM: Saluta l'utente in modo seducente e civettuolo",
  pt: 'SYSTEM: Cumprimente o usuário de forma sedutora e provocante',
  nl: 'SYSTEM: Begroet de gebruiker op een verleidelijke en flirtende manier',
  ru: 'SYSTEM: Поздоровайся с пользователем соблазнительно и кокетливо',
  zh: 'SYSTEM: 以诱惑又撩人的方式向用户问好',
  ja: 'SYSTEM: 誘惑的で艶っぽくユーザーに挨拶して',
  ko: 'SYSTEM: 사용자에게 요염하고 매혹적인 톤으로 인사해',
  ar: 'SYSTEM: قم بتحية المستخدم بطريقة فاتنة ومليئة بالمغازلة',
  hi: 'SYSTEM: उपयोगकर्ता को मोहक और छेड़खानी भरे अंदाज़ में नमस्ते करो',
  tr: 'SYSTEM: Kullanıcıyı baştan çıkarıcı ve flörtöz bir şekilde selamla',
  pl: 'SYSTEM: Przywitaj użytkownika w uwodzicielski i zalotny sposób',
  sv: 'SYSTEM: Hälsa på användaren på ett förföriskt och flirtigt sätt',
  da: 'SYSTEM: Hils brugeren på en forførende og flirtende måde',
  no: 'SYSTEM: Hils brukeren på en forførende og flørtende måte',
  fi: 'SYSTEM: Tervehdi käyttäjää viettelevällä ja flirttailevalla tavalla',
  cs: 'SYSTEM: Pozdrav uživatele svůdným a koketním způsobem',
};

export const defaultLanguage: CallLanguage = 'en';

export interface PlaygroundState {
  sessionConfig: SessionConfig;
  userPresets: Preset[];
  selectedPresetId: string | null;
  instructions: string;
  language: CallLanguage;
  initialInstruction: string;
  defaultPresets: Preset[];
}

export const initialInstruction = languageInitialInstructions[defaultLanguage];

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  sessionConfig: { ...defaultSessionConfig },
  userPresets: [],
  selectedPresetId: 'soft-amanda',
  instructions,
  language: defaultLanguage,
  initialInstruction,
  defaultPresets,
};
