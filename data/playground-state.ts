import { defaultSessionConfig, instructions } from './default-config';
import { defaultPresets, type Preset } from './presets';
import type { SessionConfig } from './session-config';

export type CallLanguage =
  | 'ar'
  | 'cs'
  | 'da'
  | 'de'
  | 'en'
  | 'es'
  | 'fi'
  | 'fr'
  | 'hi'
  | 'it'
  | 'ja'
  | 'ko'
  | 'nl'
  | 'no'
  | 'pl'
  | 'pt'
  | 'ru'
  | 'sv'
  | 'tr'
  | 'zh';

export const callLanguages: Array<{ value: CallLanguage; label: string }> = [
  { value: 'ar', label: 'Arabic' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'de', label: 'German' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'fr', label: 'French' },
  { value: 'hi', label: 'Hindi' },
  { value: 'it', label: 'Italian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'nl', label: 'Dutch' },
  { value: 'no', label: 'Norwegian' },
  { value: 'pl', label: 'Polish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ru', label: 'Russian' },
  { value: 'sv', label: 'Swedish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'zh', label: 'Chinese (Mandarin)' },
];

export const languageInitialInstructions: Record<CallLanguage, string> = {
  ar: 'SYSTEM: قم بتحية المستخدم بطريقة فاتنة ومليئة بالمغازلة. إذا لم يتحدث المستخدم كثيرًا، كن استباقيًا وحاول إشراكه.',
  cs: 'SYSTEM: Pozdrav uživatele svůdným a koketním způsobem. Pokud uživatel moc nemluví, buď proaktivní a pokus se ho zapojit.',
  da: 'SYSTEM: Hils brugeren på en forførende og flirtende måde. Hvis brugeren ikke taler meget, vær proaktiv og prøv at få dem til at engagere sig.',
  de: 'SYSTEM: Begrüße den Nutzer auf verführerische und kokette Weise. Wenn der Nutzer nicht viel spricht, sei proaktiv und versuche ihn zum Engagement zu bewegen.',
  en: 'SYSTEM: Say hi to the user in a seductive and flirtatious manner. If the user is not talking much, be proactive and get them to engage.',
  es: 'SYSTEM: Saluda al usuario de manera seductora y coqueta. Si el usuario no habla mucho, sé proactivo e intenta que se comprometa.',
  fi: 'SYSTEM: Tervehdi käyttäjää viettelevällä ja flirttailevalla tavalla. Jos käyttäjä ei puhu paljon, ole proaktiivinen ja yritä saada hänet osallistumaan.',
  fr: "SYSTEM: Salue l'utilisateur d'une manière séduisante et aguicheuse. Si l'utilisateur ne parle pas beaucoup, sois proactif et essaie de le faire engager.",
  hi: 'SYSTEM: उपयोगकर्ता को मोहक और छेड़खानी भरे अंदाज़ में नमस्ते करो। अगर उपयोगकर्ता ज्यादा बात नहीं कर रहा है, तो सक्रिय रहो और उन्हें शामिल होने के लिए प्रेरित करो।',
  it: "SYSTEM: Saluta l'utente in modo seducente e civettuolo. Se l'utente non parla molto, sii proattivo e cerca di fargli partecipare.",
  ja: 'SYSTEM: 誘惑的で艶っぽくユーザーに挨拶して。ユーザーがあまり話さない場合は、積極的に働きかけて関与させて。',
  ko: 'SYSTEM: 사용자에게 요염하고 매혹적인 톤으로 인사해. 사용자가 말을 많이 하지 않으면 적극적으로 행동하여 참여하도록 유도해.',
  nl: 'SYSTEM: Begroet de gebruiker op een verleidelijke en flirtende manier. Als de gebruiker niet veel praat, wees proactief en probeer hem/haar in te schakelen.',
  no: 'SYSTEM: Hils brukeren på en forførende og flørtende måte. Hvis brukeren ikke snakker mye, vær proaktiv og prøv å få dem til å engasjere seg.',
  pl: 'SYSTEM: Przywitaj użytkownika w uwodzicielski i zalotny sposób. Jeśli użytkownik nie mówi wiele, bądź proaktywny i spróbuj go zaangażować.',
  pt: 'SYSTEM: Cumprimente o usuário de forma sedutora e provocante. Se o usuário não está falando muito, seja proativo e tente envolvê-lo.',
  ru: 'SYSTEM: Поздоровайся с пользователем соблазнительно и кокетливо. Если пользователь мало говорит, будь инициативным и попробуй его вовлечь.',
  sv: 'SYSTEM: Hälsa på användaren på ett förföriskt och flirtigt sätt. Om användaren inte pratar mycket, var proaktiv och försök få dem att engagera sig.',
  tr: 'SYSTEM: Kullanıcıyı baştan çıkarıcı ve flörtöz bir şekilde selamla. Eğer kullanıcı fazla konuşmuyorsa, proaktif ol ve onu katılımı sağlamaya çalış.',
  zh: 'SYSTEM: 以诱惑又撩人的方式向用户问好。如果用户不太说话，要积极主动地让他们参与进来。',
};

export const defaultLanguage: CallLanguage = 'en';

export interface PlaygroundState {
  sessionConfig: SessionConfig;
  /** User-created custom characters */
  customCharacters: Preset[];
  selectedPresetId: string | null;
  instructions: string;
  /** Per-character instruction overrides keyed by character ID, then by language */
  characterOverrides: Record<string, Partial<Record<string, string>>>;
  language: CallLanguage;
  initialInstruction: string;
  defaultPresets: Preset[];
}

export const initialInstruction = languageInitialInstructions[defaultLanguage];

// Define the initial state
export const defaultPlaygroundState: PlaygroundState = {
  sessionConfig: { ...defaultSessionConfig },
  customCharacters: [],
  selectedPresetId: null,
  instructions,
  characterOverrides: {},
  language: defaultLanguage,
  initialInstruction,
  defaultPresets,
};
